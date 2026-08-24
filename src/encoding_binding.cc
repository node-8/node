#include "encoding_binding.h"
#include "ada.h"
#include "env-inl.h"
#include "node_errors.h"
#include "node_external_reference.h"
#include "simdutf.h"
#include "string_bytes.h"
#include "util.h"
#include "v8.h"

#include <algorithm>
#include <cstdint>

namespace node {
namespace encoding_binding {

using v8::ArrayBuffer;
using v8::BackingStore;
using v8::BackingStoreInitializationMode;
using v8::BackingStoreOnFailureMode;
using v8::Context;
using v8::FunctionCallbackInfo;
using v8::HandleScope;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::ObjectTemplate;
using v8::SnapshotCreator;
using v8::String;
using v8::Uint8Array;
using v8::Value;

void BindingData::MemoryInfo(MemoryTracker* tracker) const {
  tracker->TrackField("encode_into_results_buffer",
                      encode_into_results_buffer_);
}

BindingData::BindingData(Realm* realm,
                         Local<Object> object,
                         InternalFieldInfo* info)
    : SnapshotableObject(realm, object, type_int),
      encode_into_results_buffer_(
          realm->isolate(),
          kEncodeIntoResultsLength,
          MAYBE_FIELD_PTR(info, encode_into_results_buffer)) {
  if (info == nullptr) {
    object
        ->Set(realm->context(),
              FIXED_ONE_BYTE_STRING(realm->isolate(), "encodeIntoResults"),
              encode_into_results_buffer_.GetJSArray())
        .Check();
  } else {
    encode_into_results_buffer_.Deserialize(realm->context());
  }
  encode_into_results_buffer_.MakeWeak();
}

bool BindingData::PrepareForSerialization(Local<Context> context,
                                          SnapshotCreator* creator) {
  DCHECK_NULL(internal_field_info_);
  internal_field_info_ = InternalFieldInfoBase::New<InternalFieldInfo>(type());
  internal_field_info_->encode_into_results_buffer =
      encode_into_results_buffer_.Serialize(context, creator);
  // Return true because we need to maintain the reference to the binding from
  // JS land.
  return true;
}

InternalFieldInfoBase* BindingData::Serialize(int index) {
  DCHECK_IS_SNAPSHOT_SLOT(index);
  InternalFieldInfo* info = internal_field_info_;
  internal_field_info_ = nullptr;
  return info;
}

// The following code is adapted from Cloudflare workers.
// Particularly from: https://github.com/cloudflare/workerd/pull/5448
//
// Copyright (c) 2017-2025 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
namespace {
constexpr int MAX_SIZE_FOR_STACK_ALLOC = 4096;
constexpr uint8_t kReplacementBytes[] = {0xEF, 0xBF, 0xBD};

bool UseNode8StringSemantics(Isolate* isolate) {
  Environment* env = Environment::GetCurrent(isolate);
  return env != nullptr && env->experimental_node_8_string_semantics();
}

bool NeedsReplacement(uint32_t value) {
  return value == 0xFFFD || (value >= 0xD800 && value <= 0xDFFF);
}

size_t WellFormedUtf8Length(const uint8_t* data,
                            size_t length,
                            bool allow_surrogates) {
  size_t output_length = 0;
  for (size_t offset = 0; offset < length;) {
    const DecodedUtf8CodePoint decoded =
        DecodeUtf8CodePoint(data + offset, length - offset, allow_surrogates);
    output_length += NeedsReplacement(decoded.value) ? sizeof(kReplacementBytes)
                                                     : decoded.byte_length;
    offset += decoded.byte_length;
  }
  return output_length;
}

size_t WriteWellFormedUtf8(const uint8_t* data,
                           size_t length,
                           char* output,
                           size_t capacity,
                           bool allow_surrogates,
                           size_t* input_read = nullptr) {
  size_t offset = 0;
  size_t written = 0;
  while (offset < length && written < capacity) {
    if (data[offset] <= 0x7F) {
      const simdutf::result ascii = simdutf::validate_ascii_with_errors(
          reinterpret_cast<const char*>(data + offset), length - offset);
      const size_t run_length =
          ascii.error == simdutf::SUCCESS ? length - offset : ascii.count;
      const size_t copied = std::min(run_length, capacity - written);
      memcpy(output + written, data + offset, copied);
      written += copied;
      offset += copied;
      if (copied != run_length) break;
      continue;
    }

    const DecodedUtf8CodePoint decoded =
        DecodeUtf8CodePoint(data + offset, length - offset, allow_surrogates);
    const bool replace = NeedsReplacement(decoded.value);
    const size_t output_size =
        replace ? sizeof(kReplacementBytes) : decoded.byte_length;
    if (output_size > capacity - written) break;

    if (replace) {
      memcpy(output + written, kReplacementBytes, output_size);
    } else {
      memcpy(output + written, data + offset, output_size);
    }
    offset += decoded.byte_length;
    written += output_size;
  }
  if (input_read != nullptr) *input_read = offset;
  return written;
}

constexpr bool isSurrogatePair(uint16_t lead, uint16_t trail) {
  return (lead & 0xfc00) == 0xd800 && (trail & 0xfc00) == 0xdc00;
}

constexpr size_t simpleUtfEncodingLength(uint16_t c) {
  if (c < 0x80) return 1;
  if (c < 0x400) return 2;
  return 3;
}

// Finds the maximum number of input characters (UTF-16 or Latin1) that can be
// encoded into a UTF-8 buffer of the given size.
//
// The challenge is that UTF-8 encoding expands characters by variable amounts:
// - ASCII (< 0x80): 1 byte
// - Code points < 0x800: 2 bytes
// - Other BMP characters: 3 bytes
// - Surrogate pairs (supplementary planes): 4 bytes total
//
// This function uses an adaptive chunking algorithm:
// 1. Process the input in chunks, estimating how many characters will fit
// 2. Calculate the actual UTF-8 length for each chunk using simdutf
// 3. Adjust the expansion factor based on observed encoding ratios
// 4. Fall back to character-by-character processing near the buffer boundary
// 5. Handle UTF-16 surrogate pairs to avoid splitting them across boundaries
//
// The algorithm starts with a conservative expansion estimate (1.15x) and
// dynamically adjusts based on actual character distribution, making it
// efficient for common ASCII-heavy text while remaining correct for
// multi-byte heavy content.
template <typename Char>
size_t findBestFit(const Char* data, size_t length, size_t bufferSize) {
  size_t pos = 0;
  size_t utf8Accumulated = 0;
  constexpr size_t CHUNK = 257;
  constexpr bool UTF16 = sizeof(Char) == 2;
  constexpr size_t MAX_FACTOR = UTF16 ? 3 : 2;

  double expansion = 1.15;

  while (pos < length && utf8Accumulated < bufferSize) {
    size_t remainingInput = length - pos;
    size_t spaceRemaining = bufferSize - utf8Accumulated;
    DCHECK_GE(expansion, 1.15);

    size_t guaranteedToFit = spaceRemaining / MAX_FACTOR;
    if (guaranteedToFit >= remainingInput) {
      return length;
    }
    size_t likelyToFit =
        std::min(static_cast<size_t>(spaceRemaining / expansion), CHUNK);
    size_t fitEstimate =
        std::max(size_t{1}, std::max(guaranteedToFit, likelyToFit));
    size_t chunkSize = std::min(remainingInput, fitEstimate);
    if (chunkSize == 1) break;
    CHECK_GT(chunkSize, 1);

    size_t chunkUtf8Len;
    if constexpr (UTF16) {
      // TODO(anonrig): Use utf8_length_from_utf16_with_replacement when
      // available For now, validate and use utf8_length_from_utf16
      size_t newPos = pos + chunkSize;
      if (newPos < length && isSurrogatePair(data[newPos - 1], data[newPos]))
        chunkSize--;
      chunkUtf8Len = simdutf::utf8_length_from_utf16(data + pos, chunkSize);
    } else {
      chunkUtf8Len = simdutf::utf8_length_from_latin1(data + pos, chunkSize);
    }

    if (utf8Accumulated + chunkUtf8Len > bufferSize) {
      DCHECK_GT(chunkSize, guaranteedToFit);
      expansion = std::max(expansion * 1.1, (chunkUtf8Len * 1.1) / chunkSize);
    } else {
      expansion = std::max(1.15, (chunkUtf8Len * 1.1) / chunkSize);
      pos += chunkSize;
      utf8Accumulated += chunkUtf8Len;
    }
  }

  while (pos < length && utf8Accumulated < bufferSize) {
    size_t extra = simpleUtfEncodingLength(data[pos]);
    if (utf8Accumulated + extra > bufferSize) break;
    pos++;
    utf8Accumulated += extra;
  }

  if (UTF16 && pos != 0 && pos != length &&
      isSurrogatePair(data[pos - 1], data[pos])) {
    if (utf8Accumulated < bufferSize) {
      pos++;
    } else {
      pos--;
    }
  }
  return pos;
}
}  // namespace

void BindingData::Deserialize(Local<Context> context,
                              Local<Object> holder,
                              int index,
                              InternalFieldInfoBase* info) {
  DCHECK_IS_SNAPSHOT_SLOT(index);
  HandleScope scope(Isolate::GetCurrent());
  Realm* realm = Realm::GetCurrent(context);
  // Recreate the buffer in the constructor.
  InternalFieldInfo* casted_info = static_cast<InternalFieldInfo*>(info);
  BindingData* binding =
      realm->AddBindingData<BindingData>(holder, casted_info);
  CHECK_NOT_NULL(binding);
}

void BindingData::EncodeInto(const FunctionCallbackInfo<Value>& args) {
  CHECK_GE(args.Length(), 2);
  CHECK(args[0]->IsString());
  CHECK(args[1]->IsUint8Array());

  Realm* realm = Realm::GetCurrent(args);
  Isolate* isolate = realm->isolate();
  BindingData* binding_data = realm->GetBindingData<BindingData>();

  Local<String> source = args[0].As<String>();

  Local<Uint8Array> dest = args[1].As<Uint8Array>();
  Local<ArrayBuffer> buf = dest->Buffer();

  // Handle detached buffers - return {read: 0, written: 0}
  if (buf->Data() == nullptr) {
    binding_data->encode_into_results_buffer_[0] = 0;
    binding_data->encode_into_results_buffer_[1] = 0;
    return;
  }

  char* write_result = static_cast<char*>(buf->Data()) + dest->ByteOffset();
  size_t dest_length = dest->ByteLength();
  size_t read = 0;
  size_t written = 0;

  if (UseNode8StringSemantics(isolate)) {
    v8::String::ValueView view(isolate, source);
    if (view.is_one_byte()) {
      written = WriteWellFormedUtf8(
          view.data8(), view.length(), write_result, dest_length, true, &read);
      binding_data->encode_into_results_buffer_[0] = static_cast<double>(read);
      binding_data->encode_into_results_buffer_[1] =
          static_cast<double>(written);
      return;
    }
  }

  // For small strings (length <= 32), use the old V8 path for better
  // performance
  static constexpr int kSmallStringThreshold = 32;
  if (source->Length() <= kSmallStringThreshold) {
    written = source->WriteUtf8V2(isolate,
                                  write_result,
                                  dest_length,
                                  String::WriteFlags::kReplaceInvalidUtf8,
                                  &read);
    binding_data->encode_into_results_buffer_[0] = static_cast<double>(read);
    binding_data->encode_into_results_buffer_[1] = static_cast<double>(written);
    return;
  }

  v8::String::ValueView view(isolate, source);
  size_t length_that_fits =
      std::min(static_cast<size_t>(view.length()), dest_length);

  if (view.is_one_byte()) {
    auto data = reinterpret_cast<const char*>(view.data8());
    simdutf::result result =
        simdutf::validate_ascii_with_errors(data, length_that_fits);
    written = read = result.count;
    memcpy(write_result, data, read);
    write_result += read;
    data += read;
    length_that_fits -= read;
    dest_length -= read;
    if (length_that_fits != 0 && dest_length != 0) {
      if (size_t rest = findBestFit(data, length_that_fits, dest_length)) {
        DCHECK_LE(simdutf::utf8_length_from_latin1(data, rest), dest_length);
        written += simdutf::convert_latin1_to_utf8(data, rest, write_result);
        read += rest;
      }
    }
  } else {
    auto data = reinterpret_cast<const char16_t*>(view.data16());

    // Limit conversion to what could fit in destination, avoiding splitting
    // a valid surrogate pair at the boundary, which could cause a spurious call
    // of simdutf::to_well_formed_utf16()
    if (length_that_fits > 0 && length_that_fits < view.length() &&
        isSurrogatePair(data[length_that_fits - 1], data[length_that_fits])) {
      length_that_fits--;
    }

    // Check if input has unpaired surrogates - if so, convert to well-formed
    // first
    simdutf::result validation_result =
        simdutf::validate_utf16_with_errors(data, length_that_fits);

    if (validation_result.error == simdutf::SUCCESS) {
      // Valid UTF-16 - use the fast path
      read = findBestFit(data, length_that_fits, dest_length);
      if (read != 0) {
        DCHECK_LE(simdutf::utf8_length_from_utf16(data, read), dest_length);
        written = simdutf::convert_utf16_to_utf8(data, read, write_result);
      }
    } else {
      // Invalid UTF-16 with unpaired surrogates - convert to well-formed first
      // TODO(anonrig): Use utf8_length_from_utf16_with_replacement when
      // available
      MaybeStackBuffer<char16_t, MAX_SIZE_FOR_STACK_ALLOC> conversion_buffer(
          length_that_fits);
      simdutf::to_well_formed_utf16(
          data, length_that_fits, conversion_buffer.out());

      // Now use findBestFit with the well-formed data
      read =
          findBestFit(conversion_buffer.out(), length_that_fits, dest_length);
      if (read != 0) {
        DCHECK_LE(
            simdutf::utf8_length_from_utf16(conversion_buffer.out(), read),
            dest_length);
        written = simdutf::convert_utf16_to_utf8(
            conversion_buffer.out(), read, write_result);
      }
    }
  }
  DCHECK_LE(written, dest->ByteLength());

  binding_data->encode_into_results_buffer_[0] = static_cast<double>(read);
  binding_data->encode_into_results_buffer_[1] = static_cast<double>(written);
}

// Encode a single string to a UTF-8 Uint8Array (not Buffer).
// Used in TextEncoder.prototype.encode.
void BindingData::EncodeUtf8String(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  CHECK_GE(args.Length(), 1);
  CHECK(args[0]->IsString());

  Local<String> source = args[0].As<String>();

  bool is_node_8_byte_string = false;
  bool is_valid_utf8 = false;
  size_t node_8_output_length = 0;
  if (UseNode8StringSemantics(isolate)) {
    v8::String::ValueView view(isolate, source);
    if (view.is_one_byte()) {
      is_node_8_byte_string = true;
      const auto* data = reinterpret_cast<const char*>(view.data8());
      is_valid_utf8 = simdutf::validate_utf8(data, view.length());
      node_8_output_length =
          is_valid_utf8
              ? view.length()
              : WellFormedUtf8Length(view.data8(), view.length(), true);
    }
  }

  if (is_node_8_byte_string) {
    std::unique_ptr<BackingStore> bs = ArrayBuffer::NewBackingStore(
        isolate,
        node_8_output_length,
        BackingStoreInitializationMode::kUninitialized,
        BackingStoreOnFailureMode::kReturnNull);
    if (!bs) [[unlikely]] {
      THROW_ERR_MEMORY_ALLOCATION_FAILED(isolate);
      return;
    }

    {
      v8::String::ValueView view(isolate, source);
      if (is_valid_utf8) {
        memcpy(bs->Data(), view.data8(), view.length());
      } else {
        [[maybe_unused]] const size_t written =
            WriteWellFormedUtf8(view.data8(),
                                view.length(),
                                static_cast<char*>(bs->Data()),
                                node_8_output_length,
                                true);
        DCHECK_EQ(written, node_8_output_length);
      }
    }
    Local<ArrayBuffer> ab = ArrayBuffer::New(isolate, std::move(bs));
    args.GetReturnValue().Set(Uint8Array::New(ab, 0, node_8_output_length));
    return;
  }

  // For small strings, use the V8 path
  static constexpr int kSmallStringThreshold = 32;
  if (source->Length() <= kSmallStringThreshold) {
    size_t length = source->Utf8LengthV2(isolate);
    std::unique_ptr<BackingStore> bs = ArrayBuffer::NewBackingStore(
        isolate,
        length,
        BackingStoreInitializationMode::kUninitialized,
        BackingStoreOnFailureMode::kReturnNull);

    if (!bs) [[unlikely]] {
      THROW_ERR_MEMORY_ALLOCATION_FAILED(isolate);
      return;
    }

    source->WriteUtf8V2(isolate,
                        static_cast<char*>(bs->Data()),
                        bs->MaxByteLength(),
                        String::WriteFlags::kReplaceInvalidUtf8);
    Local<ArrayBuffer> ab = ArrayBuffer::New(isolate, std::move(bs));
    args.GetReturnValue().Set(Uint8Array::New(ab, 0, length));
    return;
  }

  size_t length = source->Length();
  size_t utf8_length = 0;

  // Inspect the string's flat content directly to determine the encoding and
  // the exact UTF-8 output size, without copying it out of the V8 heap.
  //
  // v8::String::ValueView holds a DisallowGarbageCollection scope, so it must
  // be released before allocating the backing store below. Flattening is cached
  // on the string, so re-acquiring the view for the conversion pass is cheap.
  bool is_one_byte;
  bool is_ascii = false;
  bool is_well_formed = true;
  {
    v8::String::ValueView view(isolate, source);
    is_one_byte = view.is_one_byte();
    if (is_one_byte) {
      auto data = reinterpret_cast<const char*>(view.data8());
      is_ascii = simdutf::validate_ascii_with_errors(data, length).error ==
                 simdutf::SUCCESS;
      utf8_length =
          is_ascii ? length : simdutf::utf8_length_from_latin1(data, length);
    } else {
      auto data = reinterpret_cast<const char16_t*>(view.data16());
      is_well_formed =
          simdutf::validate_utf16_with_errors(data, length).error ==
          simdutf::SUCCESS;
      if (is_well_formed) {
        utf8_length = simdutf::utf8_length_from_utf16(data, length);
      }
    }
  }

  // Rare path: two-byte string with unpaired surrogates. Copy into a mutable
  // buffer, make it well-formed, then encode.
  if (!is_well_formed) {
    MaybeStackBuffer<uint16_t, MAX_SIZE_FOR_STACK_ALLOC> utf16_buffer(length);
    source->WriteV2(isolate, 0, length, utf16_buffer.out());
    auto data = reinterpret_cast<char16_t*>(utf16_buffer.out());
    simdutf::to_well_formed_utf16(data, length, data);

    utf8_length = simdutf::utf8_length_from_utf16(data, length);
    std::unique_ptr<BackingStore> bs = ArrayBuffer::NewBackingStore(
        isolate, utf8_length, BackingStoreInitializationMode::kUninitialized);
    CHECK(bs);
    [[maybe_unused]] size_t written = simdutf::convert_utf16_to_utf8(
        data, length, static_cast<char*>(bs->Data()));
    DCHECK_EQ(written, utf8_length);
    Local<ArrayBuffer> ab = ArrayBuffer::New(isolate, std::move(bs));
    args.GetReturnValue().Set(Uint8Array::New(ab, 0, utf8_length));
    return;
  }

  // Common path: allocate the exact-size output, then re-acquire the flat
  // content and encode directly into the backing store.
  std::unique_ptr<BackingStore> bs = ArrayBuffer::NewBackingStore(
      isolate, utf8_length, BackingStoreInitializationMode::kUninitialized);
  CHECK(bs);
  char* out = static_cast<char*>(bs->Data());
  {
    v8::String::ValueView view(isolate, source);
    if (is_one_byte) {
      auto data = reinterpret_cast<const char*>(view.data8());
      if (is_ascii) {
        memcpy(out, data, length);
      } else {
        [[maybe_unused]] size_t written =
            simdutf::convert_latin1_to_utf8(data, length, out);
        DCHECK_EQ(written, utf8_length);
      }
    } else {
      auto data = reinterpret_cast<const char16_t*>(view.data16());
      [[maybe_unused]] size_t written =
          simdutf::convert_utf16_to_utf8(data, length, out);
      DCHECK_EQ(written, utf8_length);
    }
  }
  Local<ArrayBuffer> ab = ArrayBuffer::New(isolate, std::move(bs));
  args.GetReturnValue().Set(Uint8Array::New(ab, 0, utf8_length));
}

// Convert the input into an encoded string
void BindingData::DecodeUTF8(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);  // list, flags

  CHECK_GE(args.Length(), 1);
  auto isShared = args[0]->IsSharedArrayBuffer();

  if (!(args[0]->IsArrayBuffer() || isShared || args[0]->IsArrayBufferView())) {
    return node::THROW_ERR_INVALID_ARG_TYPE(
        env->isolate(),
        "The \"list\" argument must be an instance of SharedArrayBuffer, "
        "ArrayBuffer or ArrayBufferView.");
  }

  if (args[0]->IsArrayBufferView()) {
    Local<v8::ArrayBufferView> view = args[0].As<v8::ArrayBufferView>();
    isShared = view->Buffer()->IsSharedArrayBuffer();
  }

  ArrayBufferViewContents<char> buffer(args[0]);

  bool ignore_bom = args[1]->IsTrue();
  bool has_fatal = args[2]->IsTrue();

  const char* data = buffer.data();
  size_t length = buffer.length();

  std::unique_ptr<char[]> data_copy;
  if (isShared && length != 0) {
    data_copy = std::make_unique_for_overwrite<char[]>(length);
    memcpy(data_copy.get(), data, length);
    data = data_copy.get();
  }

  if (!ignore_bom && length >= 3) {
    if (memcmp(data, "\xEF\xBB\xBF", 3) == 0) {
      data += 3;
      length -= 3;
    }
  }

  if (has_fatal) {
    // Are we perhaps ASCII? Then we won't have to check for UTF-8
    if (!simdutf::validate_ascii_with_errors(data, length).error) {
      Local<Value> ret;
      if (StringBytes::Encode(env->isolate(), data, length, LATIN1)
              .ToLocal(&ret)) {
        args.GetReturnValue().Set(ret);
      }
      return;
    }

    auto result = simdutf::validate_utf8_with_errors(data, length);

    if (result.error) {
      return node::THROW_ERR_ENCODING_INVALID_ENCODED_DATA(
          env->isolate(), "The encoded data was not valid for encoding utf-8");
    }
  }

  if (length == 0) return args.GetReturnValue().SetEmptyString();

  Local<Value> ret;
  if (!has_fatal && UseNode8StringSemantics(env->isolate()) &&
      !simdutf::validate_utf8(data, length)) {
    const auto* bytes = reinterpret_cast<const uint8_t*>(data);
    const size_t output_length = WellFormedUtf8Length(bytes, length, false);
    MaybeStackBuffer<char, 512> output(output_length);
    [[maybe_unused]] const size_t written =
        WriteWellFormedUtf8(bytes, length, output.out(), output_length, false);
    DCHECK_EQ(written, output_length);
    if (StringBytes::EncodeValidUtf8(
            env->isolate(), output.out(), output_length)
            .ToLocal(&ret)) {
      args.GetReturnValue().Set(ret);
    }
    return;
  }
  v8::MaybeLocal<Value> encoded =
      has_fatal ? StringBytes::EncodeValidUtf8(env->isolate(), data, length)
                : StringBytes::Encode(env->isolate(), data, length, UTF8);
  if (encoded.ToLocal(&ret)) {
    args.GetReturnValue().Set(ret);
  }
}

void BindingData::ToASCII(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  CHECK_GE(args.Length(), 1);
  CHECK(args[0]->IsString());

  Utf8Value input(env->isolate(), args[0]);
  auto out = ada::idna::to_ascii(input.ToStringView());
  Local<Value> ret;
  if (ToV8Value(env->context(), out, env->isolate()).ToLocal(&ret)) {
    args.GetReturnValue().Set(ret);
  }
}

void BindingData::ToUnicode(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  CHECK_GE(args.Length(), 1);
  CHECK(args[0]->IsString());

  Utf8Value input(env->isolate(), args[0]);
  auto out = ada::idna::to_unicode(input.ToStringView());
  Local<Value> ret;
  if (ToV8Value(env->context(), out, env->isolate()).ToLocal(&ret)) {
    args.GetReturnValue().Set(ret);
  }
}

void BindingData::CreatePerIsolateProperties(IsolateData* isolate_data,
                                             Local<ObjectTemplate> target) {
  Isolate* isolate = isolate_data->isolate();
  SetMethod(isolate, target, "encodeInto", EncodeInto);
  SetMethodNoSideEffect(isolate, target, "encodeUtf8String", EncodeUtf8String);
  SetMethodNoSideEffect(isolate, target, "decodeUTF8", DecodeUTF8);
  SetMethodNoSideEffect(isolate, target, "toASCII", ToASCII);
  SetMethodNoSideEffect(isolate, target, "toUnicode", ToUnicode);
}

void BindingData::CreatePerContextProperties(Local<Object> target,
                                             Local<Value> unused,
                                             Local<Context> context,
                                             void* priv) {
  Realm* realm = Realm::GetCurrent(context);
  realm->AddBindingData<BindingData>(target);
}

void BindingData::RegisterTimerExternalReferences(
    ExternalReferenceRegistry* registry) {
  registry->Register(EncodeInto);
  registry->Register(EncodeUtf8String);
  registry->Register(DecodeUTF8);
  registry->Register(ToASCII);
  registry->Register(ToUnicode);
}

}  // namespace encoding_binding
}  // namespace node

NODE_BINDING_CONTEXT_AWARE_INTERNAL(
    encoding_binding,
    node::encoding_binding::BindingData::CreatePerContextProperties)
NODE_BINDING_PER_ISOLATE_INIT(
    encoding_binding,
    node::encoding_binding::BindingData::CreatePerIsolateProperties)
NODE_BINDING_EXTERNAL_REFERENCE(
    encoding_binding,
    node::encoding_binding::BindingData::RegisterTimerExternalReferences)
