'use strict';

require('../common');
const assert = require('assert');

// Run in stock and node-8 profiles. Named encodings keep their Unicode meaning.
const node8 = process.execArgv.includes('--experimental-node-8-string-semantics');
const fixtures = [
  ['ascii', 'a', '6100'],
  ['latin', '\u00e9', 'e900'],
  ['cjk', '\u4e2d', '2d4e'],
  ['emoji', '\u{1f600}', '3dd800de'],
  ['high-surrogate', String.fromCodePoint(0xd800), '00d8'],
  ['low-surrogate', String.fromCodePoint(0xdc00), '00dc'],
  ['separate-surrogates',
   String.fromCodePoint(0xd83d) + String.fromCodePoint(0xde00), '3dd800de'],
  ['nul-mixed', 'a\0\u00e9', '61000000e900'],
];
for (const [hex, expected] of [
  ['e228a1', 'fdff2800fdff'],
  ['e282', 'fdff'],
  ['80ff', 'fdfffdff'],
  ['c0af', 'fdfffdff'],
  ['f4908080', 'fdfffdfffdfffdff'],
  ['eda080', node8 ? '00d8' : 'fdfffdfffdff'],
]) {
  fixtures.push([hex, Buffer.from(hex, 'hex').toString(), expected]);
}

function expectedFill(pattern, length, offset = 0, suffix = 0) {
  const expected = Buffer.alloc(offset + length + suffix, 0xa5);
  for (let i = 0; i < length; i++) {
    expected[offset + i] = pattern[i % pattern.length];
  }
  return expected;
}

let checks = 0;
function check(actual, expected, label) {
  // Keep assertion failures small even for the heap-backed conversion cases.
  assert.ok(actual.equals(expected), label);
  checks++;
}

const encodings = ['utf16le', 'utf-16le', 'ucs2', 'ucs-2', 'UTF16LE', 'UCS-2'];
for (const [id, source, hex] of fixtures) {
  for (const repetitions of [1, 1025]) {
    const value = source.repeat(repetitions);
    const pattern = Buffer.from(hex.repeat(repetitions), 'hex');
    for (const encoding of encodings) {
      for (const length of [0, 1, 2, 3, pattern.length - 1,
                            pattern.length, pattern.length + 1,
                            pattern.length * 2 + 3]) {
        const label = `${id}/${repetitions}/${encoding}/${length}`;
        check(Buffer.alloc(length, value, encoding),
              expectedFill(pattern, length), `alloc ${label}`);

        for (const offset of [0, 1, 3]) {
          const backing = Buffer.alloc(offset + length + 5, 0xa5);
          const view = backing.subarray(1, backing.length - 1);
          assert.strictEqual(view.fill(value, offset, offset + length, encoding),
                             view);
          check(backing, expectedFill(pattern, length, offset + 1, 4),
                `view ${offset} ${label}`);
        }
      }
    }
  }

  const pattern = Buffer.from(hex, 'hex');
  check(Buffer.alloc(7).fill(source, 'ucs2'), expectedFill(pattern, 7),
        `encoding overload ${id}`);
  check(Buffer.alloc(8, 0xa5).fill(source, 1, 'ucs2'),
        expectedFill(pattern, 7, 1), `offset overload ${id}`);

  // UTF-8 output remains byte-preserving in node-8 and replacement-based in stock.
  const utf8 = Buffer.from(source);
  for (const encoding of ['utf8', 'utf-8']) {
    check(Buffer.alloc(17, source, encoding), expectedFill(utf8, 17),
          `utf8 control ${id}/${encoding}`);
  }
}

for (const [value, encoding, hex] of [
  ['ab', 'ascii', '6162'],
  ['\u00e9x', 'latin1', 'e978'],
  ['\u00e9x', 'binary', 'e978'],
  ['deadbeef', 'hex', 'deadbeef'],
  ['YWJj', 'base64', '616263'],
  ['YWJj', 'base64url', '616263'],
  [Buffer.from([0x80, 0xff]), undefined, '80ff'],
  [257, undefined, '01'],
  ['', 'ucs2', '00'],
]) {
  check(Buffer.alloc(11, value, encoding),
        expectedFill(Buffer.from(hex, 'hex'), 11), `control ${encoding}`);
}

assert.throws(() => Buffer.alloc(3).fill('a', -1, 2, 'ucs2'),
              { code: 'ERR_OUT_OF_RANGE' });
assert.throws(() => Buffer.alloc(3).fill('a', 0, 4, 'ucs2'),
              { code: 'ERR_OUT_OF_RANGE' });
assert.throws(() => Buffer.alloc(3).fill('a', 'unknown'),
              { code: 'ERR_UNKNOWN_ENCODING' });
console.log(`buffer fill encoded lengths: ${checks} checks passed`);
