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

(async () => {
  assert.deepStrictEqual(
    await encode([String.fromCodePoint(0xDC00)]),
    Buffer.from([0xEF, 0xBF, 0xBD]),
  );
  assert.deepStrictEqual(
    await encode([
      String.fromCodePoint(0xD83D),
      String.fromCodePoint(0xDE00),
    ]),
    Buffer.from([0xF0, 0x9F, 0x98, 0x80]),
  );
  assert.deepStrictEqual(
    await encode([Buffer.from([0xE2, 0x28, 0xA1]).toString()]),
    Buffer.from([0xEF, 0xBF, 0xBD, 0x28, 0xEF, 0xBF, 0xBD]),
  );
})().then(common.mustCall());
