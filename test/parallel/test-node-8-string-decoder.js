// Flags: --experimental-node-8-string-semantics
'use strict';

require('../common');
const assert = require('assert');
const { StringDecoder } = require('string_decoder');

function units(value) {
  return Array.from(
    { length: value.length }, (_, index) => value.charCodeAt(index));
}

function decodeHex(decoder, hex) {
  return decoder.write(Buffer.from(hex, 'hex'));
}

let decoder = new StringDecoder('utf8');
assert.deepStrictEqual(units(decodeHex(decoder, 'f09f9880')),
                       [0xf0, 0x9f, 0x98, 0x80]);
assert.strictEqual(decoder.lastNeed, 0);
assert.strictEqual(decoder.lastTotal, 0);
assert.strictEqual(decoder.end(), '');

decoder = new StringDecoder('utf8');
const split = [
  decodeHex(decoder, 'e4'),
  decodeHex(decoder, 'b8'),
  decodeHex(decoder, 'ad'),
];
assert.deepStrictEqual(split.map(units), [[0xe4], [0xb8], [0xad]]);
assert.strictEqual(decoder.lastNeed, 0);
assert.strictEqual(decoder.lastTotal, 0);
assert.deepStrictEqual(decoder.lastChar, Buffer.alloc(4));
assert.strictEqual(decoder.end(), '');
assert.strictEqual(Buffer.from(split.join(''), 'utf8').toString('hex'),
                   'e4b8ad');

decoder = new StringDecoder('utf8');
const malformed = decodeHex(decoder, '00e228a1ff');
assert.deepStrictEqual(units(malformed), [0x00, 0xe2, 0x28, 0xa1, 0xff]);
assert.strictEqual(Buffer.from(malformed, 'utf8').toString('hex'),
                   '00e228a1ff');

decoder = new StringDecoder('utf8');
assert.strictEqual(decoder.write(Buffer.alloc(0)), '');
assert.strictEqual(decoder.end(), '');

const backing = Uint8Array.from([0x00, 0xe4, 0xb8, 0xad, 0xff, 0x00]);
const view = new DataView(backing.buffer, 1, 4);
decoder = new StringDecoder('utf8');
const viewed = decoder.write(view);
assert.deepStrictEqual(units(viewed), [0xe4, 0xb8, 0xad, 0xff]);
assert.strictEqual(Buffer.from(viewed, 'utf8').toString('hex'), 'e4b8adff');

decoder = new StringDecoder('latin1');
const latin1 = decodeHex(decoder, 'ff');
assert.strictEqual(latin1, 'ÿ');
assert.deepStrictEqual(units(latin1), [0xc3, 0xbf]);

decoder = new StringDecoder('utf16le');
assert.strictEqual(decodeHex(decoder, '3dd84ddc'), '\ud83d\udc4d');

const utf16Pair = Buffer.from('3dd84ddc', 'hex');
for (const splitAt of [1, 2, 3]) {
  decoder = new StringDecoder('utf16le');
  assert.strictEqual(decoder.write(utf16Pair.subarray(0, splitAt)), '');
  assert.deepStrictEqual(
    units(decoder.end(utf16Pair.subarray(splitAt))),
    [0xf0, 0x9f, 0x91, 0x8d]);
}

decoder = new StringDecoder('utf16le');
assert.strictEqual(decodeHex(decoder, '00d8'), '');
assert.deepStrictEqual(units(decoder.end()), [0xed, 0xa0, 0x80]);

decoder = new StringDecoder('utf16le');
assert.deepStrictEqual(units(decodeHex(decoder, '00dc')),
                       [0xed, 0xb0, 0x80]);
