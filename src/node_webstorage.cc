#include "node_webstorage.h"
#include <string>
#include <unordered_map>
#include "base_object-inl.h"
#include "debug_utils-inl.h"
#include "env-inl.h"
#include "memory_tracker-inl.h"
#include "node.h"
#include "node_errors.h"
#include "node_mem-inl.h"
#include "path.h"
#include "simdutf.h"
#include "sqlite3.h"
#include "util-inl.h"

namespace node {
namespace webstorage {

using v8::Array;
using v8::Boolean;
using v8::Context;
using v8::DontDelete;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::IndexedPropertyHandlerConfiguration;
using v8::Integer;
using v8::Intercepted;
using v8::Isolate;
using v8::JustVoid;
using v8::Local;
using v8::LocalVector;
using v8::Map;
using v8::Maybe;
using v8::MaybeLocal;
using v8::Name;
using v8::NamedPropertyHandlerConfiguration;
using v8::NewStringType;
using v8::Nothing;
using v8::Null;
using v8::Object;
using v8::PropertyAttribute;
using v8::PropertyCallbackInfo;
using v8::PropertyDescriptor;
using v8::PropertyHandlerFlags;
using v8::Signature;
using v8::String;
using v8::Value;

#define THROW_SQLITE_ERROR(env, r)                                             \
  THROW_ERR_INVALID_STATE((env), sqlite3_errstr((r)))

#define CHECK_ERROR_OR_THROW(env, expr, expected, ret)                         \
  do {                                                                         \
    int r_ = (expr);                                                           \
    if (r_ != (expected)) {                                                    \
      THROW_SQLITE_ERROR((env), r_);                                           \
      return (ret);                                                            \
    }                                                                          \
  } while (0)

static void ThrowQuotaExceededException(Local<Context> context) {
  Isolate* isolate = Isolate::GetCurrent();
  auto quota_exceeded_str =
      FIXED_ONE_BYTE_STRING(isolate, "QuotaExceededError");
  auto err_message =
      FIXED_ONE_BYTE_STRING(isolate, "Setting the value exceeded the quota");
  Local<Object> per_context_bindings;
  Local<Value> quota_exceeded_ctor_val;
  if (!GetPerContextExports(context).ToLocal(&per_context_bindings) ||
      !per_context_bindings->Get(context, quota_exceeded_str)
           .ToLocal(&quota_exceeded_ctor_val)) {
    return;
  }
  CHECK(quota_exceeded_ctor_val->IsFunction());
  Local<Function> quota_exceeded_ctor = quota_exceeded_ctor_val.As<Function>();
  Local<Value> argv[] = {err_message};
  Local<Value> exception;

  if (!quota_exceeded_ctor->NewInstance(context, arraysize(argv), argv)
           .ToLocal(&exception)) {
    return;
  }

  isolate->ThrowException(exception);
}

// Own an aligned SQL binding buffer without interpreting node-8 bytes.
class StorageString : public MaybeStackBuffer<uint16_t> {
 public:
  StorageString(Environment* env, Local<String> value) {
    const size_t length = value->Length();
    if (env->experimental_node_8_string_semantics()) {
      byte_length_ = length;
      AllocateSufficientStorage((length + 1) / 2);
      value->WriteOneByteV2(
          env->isolate(), 0, length, reinterpret_cast<uint8_t*>(out()));
    } else {
      byte_length_ = length * sizeof(uint16_t);
      AllocateSufficientStorage(length);
      value->WriteV2(env->isolate(), 0, length, out());
    }
  }

  size_t byte_length() const { return byte_length_; }

 private:
  size_t byte_length_;
};

static MaybeLocal<String> ReadStorageColumn(Environment* env,
                                             sqlite3_stmt* stmt,
                                             int column) {
  const auto* data = sqlite3_column_blob(stmt, column);
  const size_t length = sqlite3_column_bytes(stmt, column);
  if (env->experimental_node_8_string_semantics()) {
    return String::NewFromBytes(env->isolate(),
                                static_cast<const uint8_t*>(data),
                                NewStringType::kNormal,
                                length);
  }
  return String::NewFromTwoByte(env->isolate(),
                                static_cast<const uint16_t*>(data),
                                NewStringType::kNormal,
                                length / sizeof(uint16_t));
}

static std::u16string ReadInspectorColumn(Environment* env,
                                          sqlite3_stmt* stmt,
                                          int column) {
  const size_t length = sqlite3_column_bytes(stmt, column);
  if (length == 0) return {};
  const auto* data = sqlite3_column_blob(stmt, column);
  if (env->experimental_node_8_string_semantics()) {
    const auto* bytes = static_cast<const uint8_t*>(data);
    return {bytes, bytes + length};
  }
  return {static_cast<const char16_t*>(data), length / sizeof(uint16_t)};
}

Storage::Storage(Environment* env,
                 Local<Object> object,
                 std::string_view location)
    : BaseObject(env, object) {
  MakeWeak();
  symbols_.Reset(env->isolate(), Map::New(env->isolate()));
  db_ = nullptr;
  location_ = std::string(location);
}

Storage::~Storage() {
  db_ = nullptr;
}

void Storage::MemoryInfo(MemoryTracker* tracker) const {
  tracker->TrackField("symbols", symbols_);
  tracker->TrackField("location", location_);
}

Maybe<void> Storage::Open() {
  static constexpr std::string_view get_schema_version_sql =
      "SELECT schema_version FROM nodejs_webstorage_state";
  static constexpr std::string_view init_sql_v0 =
      "PRAGMA encoding = 'UTF-16le';"
      ""
      "CREATE TABLE IF NOT EXISTS nodejs_webstorage("
      "  key BLOB NOT NULL,"
      "  value BLOB NOT NULL,"
      "  PRIMARY KEY(key)"
      ") STRICT;"
      ""
      "CREATE TABLE IF NOT EXISTS nodejs_webstorage_state("
      // max_size is 10MB. This can be made configurable in the future.
      "  max_size INTEGER NOT NULL DEFAULT 10485760,"
      "  total_size INTEGER NOT NULL,"
      "  schema_version INTEGER NOT NULL DEFAULT 0,"
      "  single_row_ INTEGER NOT NULL DEFAULT 1 CHECK(single_row_ = 1),"
      "  PRIMARY KEY(single_row_)"
      ") STRICT;"
      ""
      "CREATE TRIGGER IF NOT EXISTS nodejs_quota_insert "
      "AFTER INSERT ON nodejs_webstorage "
      "FOR EACH ROW "
      "BEGIN "
      "  UPDATE nodejs_webstorage_state"
      "    SET total_size = total_size + OCTET_LENGTH(NEW.key) +"
      "      OCTET_LENGTH(NEW.value);"
      "  SELECT RAISE(ABORT, 'QuotaExceeded') WHERE EXISTS ("
      "    SELECT 1 FROM nodejs_webstorage_state WHERE total_size > max_size"
      "  );"
      "END;"
      ""
      "CREATE TRIGGER IF NOT EXISTS nodejs_quota_update "
      "AFTER UPDATE ON nodejs_webstorage "
      "FOR EACH ROW "
      "BEGIN "
      "  UPDATE nodejs_webstorage_state"
      "    SET total_size = total_size + "
      "      ((OCTET_LENGTH(NEW.key) + OCTET_LENGTH(NEW.value)) -"
      "      (OCTET_LENGTH(OLD.key) + OCTET_LENGTH(OLD.value)));"
      "  SELECT RAISE(ABORT, 'QuotaExceeded') WHERE EXISTS ("
      "    SELECT 1 FROM nodejs_webstorage_state WHERE total_size > max_size"
      "  );"
      "END;"
      ""
      "CREATE TRIGGER IF NOT EXISTS nodejs_quota_delete "
      "AFTER DELETE ON nodejs_webstorage "
      "FOR EACH ROW "
      "BEGIN "
      "  UPDATE nodejs_webstorage_state"
      "    SET total_size = total_size - (OCTET_LENGTH(OLD.key) +"
      "      OCTET_LENGTH(OLD.value));"
      "END;"
      ""
      "INSERT OR IGNORE INTO nodejs_webstorage_state (total_size) VALUES (0);";

  sqlite3* db = db_.get();
  if (db != nullptr) {
    return JustVoid();
  }

  const bool byte_format = env()->experimental_node_8_string_semantics();
  const int current_schema_version = byte_format ? 2 : 1;
  int r = sqlite3_open(location_.c_str(), &db);
  conn_unique_ptr connection(db);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());
  r = sqlite3_exec(db,
                    "PRAGMA busy_timeout = 3000;"
                    "PRAGMA synchronous = NORMAL;"
                    "PRAGMA temp_store = memory;"
                    "BEGIN IMMEDIATE;",
                    nullptr, nullptr, nullptr);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());

  // Check before any schema writes, and serialize competing initializers.
  sqlite3_stmt* s = nullptr;
  static constexpr std::string_view tables_sql =
      "SELECT count(*), "
      "sum(name = 'nodejs_webstorage_state'), "
      "sum(name = 'nodejs_webstorage') "
      "FROM sqlite_schema WHERE type = 'table'";
  r = sqlite3_prepare_v2(
      db, tables_sql.data(), tables_sql.size(), &s, nullptr);
  auto stmt = stmt_unique_ptr(s);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());
  CHECK_ERROR_OR_THROW(
      env(), sqlite3_step(stmt.get()), SQLITE_ROW, Nothing<void>());
  const bool has_tables = sqlite3_column_int(stmt.get(), 0) != 0;
  const bool has_state = sqlite3_column_int(stmt.get(), 1) != 0;
  const bool has_storage = sqlite3_column_int(stmt.get(), 2) != 0;
  stmt.reset();
  int64_t schema_version = 0;
  if (has_state) {
    r = sqlite3_prepare_v2(db,
                           get_schema_version_sql.data(),
                           get_schema_version_sql.size(),
                           &s,
                           nullptr);
    stmt.reset(s);
    CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());
    CHECK_ERROR_OR_THROW(
        env(), sqlite3_step(stmt.get()), SQLITE_ROW, Nothing<void>());
    if (sqlite3_column_type(stmt.get(), 0) != SQLITE_INTEGER) {
      THROW_ERR_INVALID_STATE(env(), "localStorage has an invalid schema version");
      return Nothing<void>();
    }
    schema_version = sqlite3_column_int64(stmt.get(), 0);
    CHECK_ERROR_OR_THROW(
        env(), sqlite3_step(stmt.get()), SQLITE_DONE, Nothing<void>());
    stmt.reset();
  }

  if (byte_format && has_tables &&
      (!has_state || !has_storage ||
       schema_version != current_schema_version)) {
    THROW_ERR_INVALID_STATE(
        env(), "localStorage has an incompatible string format; "
               "use a separate file for node-8 (no automatic migration)");
    return Nothing<void>();
  }
  if (schema_version > current_schema_version) {
    THROW_ERR_INVALID_STATE(
        env(), "localStorage was created with a newer version of Node.js");
    return Nothing<void>();
  }

  r = sqlite3_exec(db, init_sql_v0.data(), nullptr, nullptr, nullptr);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());
  if (schema_version < current_schema_version) {
    // Run any migrations and update the schema version.
    std::string set_user_version_sql =
        "UPDATE nodejs_webstorage_state SET schema_version = " +
        std::to_string(current_schema_version) + ";";
    r = sqlite3_exec(
        db, set_user_version_sql.c_str(), nullptr, nullptr, nullptr);
    CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());
  }

  r = sqlite3_exec(db,
                    "COMMIT; PRAGMA journal_mode = WAL; PRAGMA optimize;",
                    nullptr, nullptr, nullptr);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());
  db_ = std::move(connection);
  return JustVoid();
}

void Storage::New(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Realm* realm = Realm::GetCurrent(args);

  if (!args[0]->StrictEquals(realm->isolate_data()->constructor_key_symbol())) {
    THROW_ERR_ILLEGAL_CONSTRUCTOR(env);
    return;
  }

  CHECK(args.IsConstructCall());
  CHECK(args[1]->IsString());

  BufferValue location(env->isolate(), args[1]);
  CHECK_NOT_NULL(*location);
  // Only call namespaced path if the location is not "in memory".
  if (location.ToStringView() != kInMemoryPath) {
    ToNamespacedPath(env, &location);
  }

  new Storage(env, args.This(), location.ToStringView());
}

Maybe<void> Storage::Clear() {
  if (!Open().IsJust()) {
    return Nothing<void>();
  }

  static constexpr std::string_view sql = "DELETE FROM nodejs_webstorage";
  sqlite3_stmt* s = nullptr;
  CHECK_ERROR_OR_THROW(
      env(),
      sqlite3_prepare_v2(db_.get(), sql.data(), sql.size(), &s, nullptr),
      SQLITE_OK,
      Nothing<void>());
  auto stmt = stmt_unique_ptr(s);
  CHECK_ERROR_OR_THROW(
      env(), sqlite3_step(stmt.get()), SQLITE_DONE, Nothing<void>());
  return JustVoid();
}

MaybeLocal<Array> Storage::Enumerate() {
  if (!Open().IsJust()) {
    return Local<Array>();
  }

  static constexpr std::string_view sql = "SELECT key FROM nodejs_webstorage";
  sqlite3_stmt* s = nullptr;
  int r = sqlite3_prepare_v2(db_.get(), sql.data(), sql.size(), &s, nullptr);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Local<Array>());
  auto stmt = stmt_unique_ptr(s);
  LocalVector<Value> values(env()->isolate());
  Local<Value> value;
  while ((r = sqlite3_step(stmt.get())) == SQLITE_ROW) {
    CHECK(sqlite3_column_type(stmt.get(), 0) == SQLITE_BLOB);
    if (!ReadStorageColumn(env(), stmt.get(), 0).ToLocal(&value)) {
      return Local<Array>();
    }
    values.emplace_back(value);
  }
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_DONE, Local<Array>());
  return Array::New(env()->isolate(), values.data(), values.size());
}

std::unordered_map<std::u16string, std::u16string> Storage::GetAll() {
  if (!Open().IsJust()) {
    return {};
  }

  static constexpr std::string_view sql =
      "SELECT key, value FROM nodejs_webstorage";
  sqlite3_stmt* s = nullptr;
  int r = sqlite3_prepare_v2(db_.get(), sql.data(), sql.size(), &s, nullptr);
  auto stmt = stmt_unique_ptr(s);
  std::unordered_map<std::u16string, std::u16string> result;
  while ((r = sqlite3_step(stmt.get())) == SQLITE_ROW) {
    CHECK(sqlite3_column_type(stmt.get(), 0) == SQLITE_BLOB);
    CHECK(sqlite3_column_type(stmt.get(), 1) == SQLITE_BLOB);
    result.emplace(ReadInspectorColumn(env(), stmt.get(), 0),
                   ReadInspectorColumn(env(), stmt.get(), 1));
  }
  return result;
}

MaybeLocal<Value> Storage::Length() {
  if (!Open().IsJust()) {
    return {};
  }

  static constexpr std::string_view sql =
      "SELECT count(*) FROM nodejs_webstorage";
  sqlite3_stmt* s = nullptr;
  int r = sqlite3_prepare_v2(db_.get(), sql.data(), sql.size(), &s, nullptr);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Local<Value>());
  auto stmt = stmt_unique_ptr(s);
  CHECK_ERROR_OR_THROW(
      env(), sqlite3_step(stmt.get()), SQLITE_ROW, Local<Value>());
  CHECK(sqlite3_column_type(stmt.get(), 0) == SQLITE_INTEGER);
  int result = sqlite3_column_int(stmt.get(), 0);
  return Integer::New(env()->isolate(), result);
}

MaybeLocal<Value> Storage::Load(Local<Name> key) {
  if (key->IsSymbol()) {
    auto symbol_map = symbols_.Get(env()->isolate());
    return symbol_map->Get(env()->context(), key);
  }

  if (!Open().IsJust()) {
    return {};
  }

  static constexpr std::string_view sql =
      "SELECT value FROM nodejs_webstorage WHERE key = ? LIMIT 1";
  StorageString stored_key(env(), key.As<String>());
  sqlite3_stmt* s = nullptr;
  int r = sqlite3_prepare_v2(db_.get(), sql.data(), sql.size(), &s, nullptr);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Local<Value>());
  auto stmt = stmt_unique_ptr(s);
  r = sqlite3_bind_blob(stmt.get(), 1, stored_key.out(),
                         stored_key.byte_length(), SQLITE_STATIC);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Local<Value>());
  r = sqlite3_step(stmt.get());
  if (r == SQLITE_ROW) {
    CHECK(sqlite3_column_type(stmt.get(), 0) == SQLITE_BLOB);
    return ReadStorageColumn(env(), stmt.get(), 0).As<Value>();
  } else if (r != SQLITE_DONE) {
    THROW_SQLITE_ERROR(env(), r);
    return {};
  } else {
    return Null(env()->isolate());
  }
}

MaybeLocal<Value> Storage::LoadKey(const int index) {
  if (!Open().IsJust()) {
    return {};
  }

  static constexpr std::string_view sql =
      "SELECT key FROM nodejs_webstorage LIMIT 1 OFFSET ?";
  sqlite3_stmt* s = nullptr;
  int r = sqlite3_prepare_v2(db_.get(), sql.data(), sql.size(), &s, nullptr);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Local<Value>());
  auto stmt = stmt_unique_ptr(s);
  r = sqlite3_bind_int(stmt.get(), 1, index);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Local<Value>());

  r = sqlite3_step(stmt.get());
  if (r == SQLITE_ROW) {
    CHECK(sqlite3_column_type(stmt.get(), 0) == SQLITE_BLOB);
    return ReadStorageColumn(env(), stmt.get(), 0).As<Value>();
  } else if (r != SQLITE_DONE) {
    THROW_SQLITE_ERROR(env(), r);
    return {};
  } else {
    return Null(env()->isolate());
  }
}

Maybe<void> Storage::Remove(Local<Name> key) {
  if (key->IsSymbol()) {
    auto symbol_map = symbols_.Get(env()->isolate());
    Maybe<bool> result = symbol_map->Delete(env()->context(), key);
    return result.IsNothing() ? Nothing<void>() : JustVoid();
  }

  if (!Open().IsJust()) {
    return Nothing<void>();
  }

  static constexpr std::string_view sql =
      "DELETE FROM nodejs_webstorage WHERE key = ?";
  StorageString stored_key(env(), key.As<String>());
  sqlite3_stmt* s = nullptr;
  int r = sqlite3_prepare_v2(db_.get(), sql.data(), sql.size(), &s, nullptr);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());
  auto stmt = stmt_unique_ptr(s);
  r = sqlite3_bind_blob(stmt.get(), 1, stored_key.out(),
                         stored_key.byte_length(), SQLITE_STATIC);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());
  CHECK_ERROR_OR_THROW(
      env(), sqlite3_step(stmt.get()), SQLITE_DONE, Nothing<void>());
  return JustVoid();
}

Maybe<void> Storage::Store(Local<Name> key, Local<Value> value) {
  if (key->IsSymbol()) {
    auto symbol_map = symbols_.Get(env()->isolate());
    MaybeLocal<Map> result = symbol_map->Set(env()->context(), key, value);
    return result.IsEmpty() ? Nothing<void>() : JustVoid();
  }

  Local<String> val;
  if (!value->ToString(env()->context()).ToLocal(&val)) {
    return Nothing<void>();
  }

  if (!Open().IsJust()) {
    return Nothing<void>();
  }

  static constexpr std::string_view sql =
      "INSERT INTO nodejs_webstorage (key, value) VALUES (?, ?)"
      "  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
      "  WHERE EXCLUDED.key = key";
  sqlite3_stmt* s = nullptr;
  StorageString stored_key(env(), key.As<String>());
  StorageString stored_value(env(), val);
  int r = sqlite3_prepare_v2(db_.get(), sql.data(), sql.size(), &s, nullptr);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());
  auto stmt = stmt_unique_ptr(s);
  r = sqlite3_bind_blob(stmt.get(), 1, stored_key.out(),
                         stored_key.byte_length(), SQLITE_STATIC);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());
  r = sqlite3_bind_blob(stmt.get(), 2, stored_value.out(),
                         stored_value.byte_length(), SQLITE_STATIC);
  CHECK_ERROR_OR_THROW(env(), r, SQLITE_OK, Nothing<void>());

  r = sqlite3_step(stmt.get());
  if (r == SQLITE_CONSTRAINT) {
    ThrowQuotaExceededException(env()->context());
    return Nothing<void>();
  }

  CHECK_ERROR_OR_THROW(env(), r, SQLITE_DONE, Nothing<void>());
  return JustVoid();
}

static void Clear(const FunctionCallbackInfo<Value>& info) {
  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.This());
  storage->Clear();
}

static void GetItem(const FunctionCallbackInfo<Value>& info) {
  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.This());
  Environment* env = Environment::GetCurrent(info);

  if (info.Length() < 1) {
    return THROW_ERR_MISSING_ARGS(
        env, "Failed to execute 'getItem' on 'Storage': 1 argument required");
  }

  Local<String> prop;
  if (!info[0]->ToString(env->context()).ToLocal(&prop)) {
    return;
  }

  Local<Value> result;
  if (!storage->Load(prop).ToLocal(&result)) {
    return;
  }
  info.GetReturnValue().Set(result);
}

static void Key(const FunctionCallbackInfo<Value>& info) {
  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.This());
  Environment* env = Environment::GetCurrent(info);
  int index;

  if (info.Length() < 1) {
    return THROW_ERR_MISSING_ARGS(
        env, "Failed to execute 'key' on 'Storage': 1 argument required");
  }

  if (!info[0]->Int32Value(env->context()).To(&index)) {
    return;
  }

  if (index < 0) {
    info.GetReturnValue().SetNull();
    return;
  }

  Local<Value> result;
  if (storage->LoadKey(index).ToLocal(&result)) {
    info.GetReturnValue().Set(result);
  }
}

static void RemoveItem(const FunctionCallbackInfo<Value>& info) {
  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.This());
  Environment* env = Environment::GetCurrent(info);
  Local<String> prop;

  if (info.Length() < 1) {
    return THROW_ERR_MISSING_ARGS(
        env,
        "Failed to execute 'removeItem' on 'Storage': 1 argument required");
  }

  if (!info[0]->ToString(env->context()).ToLocal(&prop)) {
    return;
  }

  storage->Remove(prop);
}

static void SetItem(const FunctionCallbackInfo<Value>& info) {
  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.This());
  Environment* env = Environment::GetCurrent(info);

  if (info.Length() < 2) {
    return THROW_ERR_MISSING_ARGS(
        env, "Failed to execute 'setItem' on 'Storage': 2 arguments required");
  }

  Local<String> prop;
  if (!info[0]->ToString(env->context()).ToLocal(&prop)) {
    return;
  }

  storage->Store(prop, info[1]);
}

template <typename T>
static bool ShouldIntercept(Local<Name> property,
                            const PropertyCallbackInfo<T>& info) {
  Environment* env = Environment::GetCurrent(info);
  Local<Value> proto = info.HolderV2()->GetPrototypeV2();

  if (proto->IsObject()) {
    bool has_prop;

    if (!proto.As<Object>()->Has(env->context(), property).To(&has_prop)) {
      return false;
    }

    if (has_prop) {
      return false;
    }
  }

  return true;
}

static Intercepted StorageGetter(Local<Name> property,
                                 const PropertyCallbackInfo<Value>& info) {
  if (!ShouldIntercept(property, info)) {
    return Intercepted::kNo;
  }

  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.HolderV2(), Intercepted::kNo);
  Local<Value> result;

  if (storage->Load(property).ToLocal(&result) && !result->IsNull()) {
    info.GetReturnValue().Set(result);
  }

  return Intercepted::kYes;
}

static Intercepted StorageSetter(Local<Name> property,
                                 Local<Value> value,
                                 const PropertyCallbackInfo<void>& info) {
  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.HolderV2(), Intercepted::kNo);

  if (storage->Store(property, value).IsNothing()) {
    info.GetReturnValue().SetFalse();
  }

  return Intercepted::kYes;
}

static Intercepted StorageQuery(Local<Name> property,
                                const PropertyCallbackInfo<Integer>& info) {
  if (!ShouldIntercept(property, info)) {
    return Intercepted::kNo;
  }

  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.HolderV2(), Intercepted::kNo);
  Local<Value> result;
  if (!storage->Load(property).ToLocal(&result) || result->IsNull()) {
    return Intercepted::kNo;
  }

  info.GetReturnValue().Set(0);
  return Intercepted::kYes;
}

static Intercepted StorageDeleter(Local<Name> property,
                                  const PropertyCallbackInfo<Boolean>& info) {
  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.HolderV2(), Intercepted::kNo);

  info.GetReturnValue().Set(storage->Remove(property).IsJust());

  return Intercepted::kYes;
}

static void StorageEnumerator(const PropertyCallbackInfo<Array>& info) {
  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.HolderV2());
  Local<Array> result;
  if (!storage->Enumerate().ToLocal(&result)) {
    return;
  }
  info.GetReturnValue().Set(result);
}

static Intercepted StorageDefiner(Local<Name> property,
                                  const PropertyDescriptor& desc,
                                  const PropertyCallbackInfo<void>& info) {
  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.HolderV2(), Intercepted::kNo);

  if (desc.has_value()) {
    return StorageSetter(property, desc.value(), info);
  }

  return Intercepted::kYes;
}

static Intercepted IndexedGetter(uint32_t index,
                                 const PropertyCallbackInfo<Value>& info) {
  Environment* env = Environment::GetCurrent(info);
  Local<Name> name = Uint32ToString(env->context(), index);
  return StorageGetter(name, info);
}

static Intercepted IndexedSetter(uint32_t index,
                                 Local<Value> value,
                                 const PropertyCallbackInfo<void>& info) {
  Environment* env = Environment::GetCurrent(info);
  Local<Name> name = Uint32ToString(env->context(), index);
  return StorageSetter(name, value, info);
}

static Intercepted IndexedQuery(uint32_t index,
                                const PropertyCallbackInfo<Integer>& info) {
  Environment* env = Environment::GetCurrent(info);
  Local<Name> name = Uint32ToString(env->context(), index);
  return StorageQuery(name, info);
}

static Intercepted IndexedDeleter(uint32_t index,
                                  const PropertyCallbackInfo<Boolean>& info) {
  Environment* env = Environment::GetCurrent(info);
  Local<Name> name = Uint32ToString(env->context(), index);
  return StorageDeleter(name, info);
}

static Intercepted IndexedDefiner(uint32_t index,
                                  const PropertyDescriptor& desc,
                                  const PropertyCallbackInfo<void>& info) {
  Environment* env = Environment::GetCurrent(info);
  Local<Name> name = Uint32ToString(env->context(), index);
  return StorageDefiner(name, desc, info);
}

static void StorageLengthGetter(const FunctionCallbackInfo<Value>& info) {
  Storage* storage;
  ASSIGN_OR_RETURN_UNWRAP(&storage, info.This());
  Local<Value> result;
  if (!storage->Length().ToLocal(&result)) {
    return;
  }
  info.GetReturnValue().Set(result);
}

static void Initialize(Local<Object> target,
                       Local<Value> unused,
                       Local<Context> context,
                       void* priv) {
  Environment* env = Environment::GetCurrent(context);
  Isolate* isolate = env->isolate();
  auto ctor_tmpl = NewFunctionTemplate(isolate, Storage::New);
  auto inst_tmpl = ctor_tmpl->InstanceTemplate();

  inst_tmpl->SetInternalFieldCount(Storage::kInternalFieldCount);
  inst_tmpl->SetHandler(NamedPropertyHandlerConfiguration(
      StorageGetter,
      StorageSetter,
      StorageQuery,
      StorageDeleter,
      StorageEnumerator,
      StorageDefiner,
      nullptr,
      Local<Value>(),
      PropertyHandlerFlags::kHasNoSideEffect));
  inst_tmpl->SetHandler(IndexedPropertyHandlerConfiguration(
      IndexedGetter,
      IndexedSetter,
      IndexedQuery,
      IndexedDeleter,
      nullptr,
      IndexedDefiner,
      nullptr,
      Local<Value>(),
      PropertyHandlerFlags::kHasNoSideEffect));

  Local<Signature> length_signature = Signature::New(isolate, ctor_tmpl);
  Local<FunctionTemplate> length_getter = FunctionTemplate::New(
      isolate, StorageLengthGetter, Local<Value>(), length_signature);
  ctor_tmpl->PrototypeTemplate()->SetAccessorProperty(env->length_string(),
                                                      length_getter,
                                                      Local<FunctionTemplate>(),
                                                      DontDelete);

  SetProtoMethod(isolate, ctor_tmpl, "clear", Clear);
  SetProtoMethodNoSideEffect(isolate, ctor_tmpl, "getItem", GetItem);
  SetProtoMethodNoSideEffect(isolate, ctor_tmpl, "key", Key);
  SetProtoMethod(isolate, ctor_tmpl, "removeItem", RemoveItem);
  SetProtoMethod(isolate, ctor_tmpl, "setItem", SetItem);
  SetConstructorFunction(context, target, "Storage", ctor_tmpl);

  auto symbol = env->isolate_data()->constructor_key_symbol();
  target
      ->DefineOwnProperty(context,
                          FIXED_ONE_BYTE_STRING(isolate, "kConstructorKey"),
                          symbol,
                          PropertyAttribute::ReadOnly)
      .Check();
}

}  // namespace webstorage
}  // namespace node

NODE_BINDING_CONTEXT_AWARE_INTERNAL(webstorage, node::webstorage::Initialize)
