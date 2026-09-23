'use strict';

require('../common');
const assert = require('assert');

const fixtures = [];
for (let byte = 0; byte < 256; byte++) {
  fixtures.push([`raw-${byte}`, Buffer.from([byte]).toString(),
                 byte < 128 ? Buffer.from([byte]) : Buffer.from([0xfd])]);
}
for (const [point, hex] of [[0x80, '80'], [0xe9, 'e9'], [0xff, 'ff'],
                            [0x100, '00'], [0x20ac, 'ac'], [0xd800, '00'],
                            [0xdc00, '00'], [0x1f600, '3d00']]) {
  fixtures.push([`point-${point}`, String.fromCodePoint(point), Buffer.from(hex, 'hex')]);
}

let checks = 0;
function check(actual, expected, label) {
  assert.ok(actual.equals(expected), label);
  checks++;
}

function repeated(pattern, length, start = 0, suffix = 0) {
  const expected = Buffer.alloc(start + length + suffix, 0xa5);
  for (let i = 0; i < length; i++) expected[start + i] = pattern[i % pattern.length];
  return expected;
}

for (const [id, value, pattern] of fixtures) {
  for (const encoding of ['latin1', 'binary', 'LATIN1', 'BINARY']) {
    for (const length of [0, 1, 7, 1025]) {
      const label = `${id}/${encoding}/${length}`;
      check(Buffer.alloc(length, value, encoding), repeated(pattern, length),
            `alloc ${label}`);
      for (const offset of [0, 1, 3]) {
        const backing = Buffer.alloc(length + offset + 4, 0xa5);
        const view = backing.subarray(1, backing.length - 1);
        assert.strictEqual(view.fill(value, offset, offset + length, encoding), view);
        check(backing, repeated(pattern, length, offset + 1, 3), `view ${label}/${offset}`);
      }
    }
    check(Buffer.alloc(7).fill(value, encoding), repeated(pattern, 7), `overload ${id}/${encoding}`);
    check(Buffer.alloc(8, 0xa5).fill(value, 1, encoding), repeated(pattern, 7, 1),
          `offset overload ${id}/${encoding}`);
  }
  // This longer input bypasses the shortcut and uses the native writer.
  check(Buffer.alloc(9, value + value, 'latin1'), repeated(pattern, 9), `native ${id}`);
  const utf8 = Buffer.from(value);
  check(Buffer.alloc(9, value), repeated(utf8, 9), `default utf8 ${id}`);
  check(Buffer.alloc(9, value, 'utf8'), repeated(utf8, 9), `explicit utf8 ${id}`);
}

check(Buffer.alloc(7, '', 'latin1'), Buffer.alloc(7), 'empty string');
check(Buffer.alloc(7, 0x180), Buffer.alloc(7, 0x80), 'numeric');
check(Buffer.alloc(7, Buffer.from([0x80])), Buffer.alloc(7, 0x80), 'buffer');
assert.throws(() => Buffer.alloc(3).fill('a', -1, 2, 'latin1'), { code: 'ERR_OUT_OF_RANGE' });
console.log(`buffer fill Latin-1 shortcut: ${checks} checks passed`);
