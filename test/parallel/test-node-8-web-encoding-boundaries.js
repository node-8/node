// Flags: --experimental-node-8-string-semantics --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');

const { createSinglebyteDecoder } =
  require('internal/encoding/single-byte');

assert.throws(() => createSinglebyteDecoder('iso-8859-6', true)(
  Buffer.from([0xA1]),
), {
  code: 'ERR_ENCODING_INVALID_ENCODED_DATA',
  name: 'TypeError',
});

async function encode(chunks) {
  const stream = new TextEncoderStream();
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const reads = [];
  const readAll = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      reads.push(value);
    }
  })();

  for (const chunk of chunks) await writer.write(chunk);
  await writer.close();
  await readAll;

  return Buffer.concat(reads.map((value) => Buffer.from(value)));
}

async function decode(chunks) {
  const stream = new TextDecoderStream();
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const reads = [];
  const readAll = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      reads.push(value);
    }
  })();

  for (const chunk of chunks) await writer.write(chunk);
  await writer.close();
  await readAll;

  return reads.join('');
}

const replacement = Buffer.from([0xEF, 0xBF, 0xBD]);
const malformedBytes = Buffer.from([0xE2, 0x28, 0xA1]);
const malformedString = malformedBytes.toString();
const surrogateString = String.fromCodePoint(0xD800);
const longValidString = String.fromCodePoint(0xE9).repeat(20);
const longValidBytes = Buffer.from(longValidString);

const encoder = new TextEncoder();
assert.deepStrictEqual(Buffer.from(encoder.encode(longValidString)),
                       longValidBytes);
assert.deepStrictEqual(Buffer.from(encoder.encode(malformedString)),
                       Buffer.concat([replacement, Buffer.from('('),
                                      replacement]));
assert.deepStrictEqual(Buffer.from(encoder.encode(surrogateString)),
                       replacement);

{
  const destination = new Uint8Array(longValidBytes.length);
  assert.deepStrictEqual(encoder.encodeInto(longValidString, destination), {
    read: longValidString.length,
    written: longValidBytes.length,
  });
  assert.deepStrictEqual(Buffer.from(destination), longValidBytes);
}

{
  const value = `${String.fromCodePoint(0xE9)}a`;
  const destination = new Uint8Array(2);
  assert.deepStrictEqual(encoder.encodeInto(value, destination), {
    read: 2,
    written: 2,
  });
  assert.deepStrictEqual(Buffer.from(destination), Buffer.from([0xC3, 0xA9]));
  assert.strictEqual(value.slice(2), 'a');
}

{
  const destination = new Uint8Array(1);
  assert.deepStrictEqual(
    encoder.encodeInto(String.fromCodePoint(0xE9), destination),
    { read: 0, written: 0 });
}

{
  const destination = new Uint8Array(3);
  assert.deepStrictEqual(encoder.encodeInto(surrogateString, destination), {
    read: surrogateString.length,
    written: replacement.length,
  });
  assert.deepStrictEqual(Buffer.from(destination), replacement);
}

for (const [input, expected] of [
  ['e228a1', 'efbfbd28efbfbd'],
  ['eda080', 'efbfbdefbfbdefbfbd'],
  ['e282', 'efbfbd'],
  ['c0af', 'efbfbdefbfbd'],
  ['f4908080', 'efbfbdefbfbdefbfbdefbfbd'],
]) {
  const bytes = Buffer.from(input, 'hex');
  assert.strictEqual(
    Buffer.from(new TextDecoder().decode(bytes)).toString('hex'), expected);
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes), {
    code: 'ERR_ENCODING_INVALID_ENCODED_DATA',
    name: 'TypeError',
  });
}

(async () => {
  assert.deepStrictEqual(await encode([longValidString]), longValidBytes);
  assert.deepStrictEqual(
    await encode([String.fromCodePoint(0xDC00)]),
    replacement,
  );
  assert.deepStrictEqual(
    await encode([
      String.fromCodePoint(0xD83D),
      String.fromCodePoint(0xDE00),
    ]),
    Buffer.from([0xF0, 0x9F, 0x98, 0x80]),
  );
  assert.deepStrictEqual(
    await encode([malformedString]),
    Buffer.from([0xEF, 0xBF, 0xBD, 0x28, 0xEF, 0xBF, 0xBD]),
  );
  assert.strictEqual(
    Buffer.from(await decode([
      Buffer.from([0xE2]),
      Buffer.from([0x82]),
      Buffer.from([0xAC]),
    ])).toString('hex'),
    'e282ac');
  assert.strictEqual(
    Buffer.from(await decode([
      Buffer.from([0xE2]),
      Buffer.from([0x28, 0xA1]),
    ])).toString('hex'),
    'efbfbd28efbfbd');
  assert.strictEqual(
    Buffer.from(await new Blob([malformedBytes]).text()).toString('hex'),
    'efbfbd28efbfbd');
  assert.strictEqual(
    Buffer.from(await new Response(malformedBytes).text()).toString('hex'),
    'efbfbd28efbfbd');
})().then(common.mustCall());
