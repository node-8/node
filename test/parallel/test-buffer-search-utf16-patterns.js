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

let checks = 0;
function check(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}

const methods = ['indexOf', 'lastIndexOf', 'includes'];
const encodings = ['utf16le', 'utf-16le', 'ucs2', 'ucs-2', 'UTF16LE', 'UCS-2'];
// Isolate the encoding bug in the pre-fix binary, whose odd-address search hangs.
const viewOffsets = process.argv.includes('--aligned-only') ? [2] : [1, 2];
for (const [id, source, hex] of fixtures) {
  for (const repetitions of [1, 1025]) {
    const value = source.repeat(repetitions);
    const pattern = Buffer.from(hex.repeat(repetitions), 'hex');
    const bytes = Buffer.concat([Buffer.from([0xff, 0xff]), pattern,
                                 Buffer.from([0xff, 0xff]), pattern]);
    for (const encoding of encodings) {
      const label = `${id}/${repetitions}/${encoding}`;
      check(bytes.indexOf(value, encoding), 2, `first ${label}`);
      check(bytes.lastIndexOf(value, encoding), pattern.length + 4,
            `last ${label}`);
      check(bytes.includes(value, encoding), true, `includes ${label}`);
      check(bytes.subarray(2, pattern.length + 1).indexOf(value, encoding), -1,
            `truncated ${label}`);

      for (const shape of viewOffsets.flatMap((start) => [[start, 0], [start, 1]])) {
        const [start, odd] = shape;
        // Include an unaligned subview and an optional trailing half code unit.
        const backing = Buffer.alloc(bytes.length + odd + start + 1, 0xa5);
        bytes.copy(backing, start);
        const input = backing.subarray(start, backing.length - 1);
        // String/UCS2 already rounds the haystack length down before offsets.
        const even = input.subarray(0, input.length & ~1);
        for (const offset of [undefined, -input.length - 1, -1, 0, 1, 2,
                              input.length]) {
          for (const end of [undefined, 0, 3, pattern.length + 2,
                             input.length - 1, input.length + 1]) {
            for (const method of methods) {
              check(input[method](value, offset, end, encoding),
                    even[method](pattern, offset, end, encoding),
                    `${method}/${start}/${odd}/${offset}/${end}/${label}`);
            }
          }
        }
      }
    }
  }

  // The UTF-8 path keeps raw bytes in node-8 and replacement output in stock.
  const utf8 = Buffer.from(source);
  const input = Buffer.concat([Buffer.from([0]), utf8, Buffer.from([0]), utf8]);
  for (const method of methods) {
    check(input[method](source, 1, input.length, 'utf8'),
          input[method](utf8, 1, input.length), `utf8 ${method}/${id}`);
  }
}

for (const input of [Buffer.alloc(0), Buffer.from([1]), Buffer.from([1, 2, 3])]) {
  const even = input.subarray(0, input.length & ~1);
  for (const offset of [-10, 0, 1, 10]) {
    for (const end of [0, 1, input.length]) {
      for (const method of methods) {
        check(input[method]('', offset, end, 'ucs2'),
              even[method](Buffer.alloc(0), offset, end, 'ucs2'),
              `empty ${method}/${input.length}/${offset}/${end}`);
      }
    }
  }
}

for (const [source, encoding, hex] of [
  ['ab', 'ascii', '6162'],
  ['\u00e9x', 'latin1', 'e978'],
  ['\u00e9x', 'binary', 'e978'],
]) {
  const pattern = Buffer.from(hex, 'hex');
  const input = Buffer.concat([Buffer.from([0]), pattern, pattern]);
  for (const method of methods) {
    check(input[method](source, encoding), input[method](pattern),
          `control ${method}/${encoding}`);
    check(input[method](pattern[0]), input[method](pattern.subarray(0, 1)),
          `numeric ${method}/${encoding}`);
  }
}

assert.throws(() => Buffer.from('abc').indexOf('a', 'unknown'),
              { code: 'ERR_UNKNOWN_ENCODING' });
console.log(`buffer search UTF-16 patterns: ${checks} checks passed`);
