'use strict';
// Flags: --experimental-node-8-string-semantics --expose-gc

const common = require('../../common');
const assert = require('assert');
const { gcUntil } = require('../../common/gc');
const testString = require(`./build/${common.buildType}/test_string`);

const cases = [
  ['', 0],
  ['abc', 3],
  ['é', 1],
  ['中', 1],
  ['😀', 2],
  [String.fromCodePoint(0xD800), 1],
];

for (const [input, utf16Length] of cases) {
  assert.strictEqual(testString.TestUtf16(input), input);
  assert.strictEqual(testString.TestUtf16AutoLength(input), input);
  assert.strictEqual(testString.Utf16Length(input), utf16Length);
  assert.strictEqual(Buffer.from(input, 'utf16le').length, utf16Length * 2);
}

assert.strictEqual(Buffer.from('é', 'utf16le').toString('hex'), 'e900');
assert.strictEqual(Buffer.from('中', 'utf16le').toString('hex'), '2d4e');
assert.strictEqual(Buffer.from('😀', 'utf16le').toString('hex'), '3dd800de');
assert.strictEqual(
  Buffer.from(String.fromCodePoint(0xD800), 'utf16le').toString('hex'),
  '00d8');
assert.strictEqual(
  Buffer.from(testString.TestUtf16Insufficient('é中😀')).toString('hex'),
  'c3a9e4b8adeda0bd');

// Malformed byte slices use the same maximal-subpart replacement as V8.
assert.strictEqual(Buffer.from('é'.substring(1), 'utf16le').toString('hex'),
                   'fdff');
assert.strictEqual(
  Buffer.from([0xE2, 0x82]).toString('utf8').length,
  2);
assert.strictEqual(
  Buffer.from(Buffer.from([0xE2, 0x82]).toString('utf8'), 'utf16le')
    .toString('hex'),
  'fdff');

(async () => {
  let external = testString.TestUtf16External('中😀');
  assert.strictEqual(external, '中😀');
  assert.strictEqual(testString.GetExternalUtf16FinalizeCount(), 0);

  global.gc();
  assert.strictEqual(external, '中😀');
  assert.strictEqual(testString.GetExternalUtf16FinalizeCount(), 0);

  external = null;
  await gcUntil('external UTF-16 string finalizer',
                () => testString.GetExternalUtf16FinalizeCount() === 1);
})().then(common.mustCall());
