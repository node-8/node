// Flags: --experimental-node-8-string-semantics
'use strict';

const assert = require('node:assert/strict');

const whitespaceCodePoints = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  0xfeff,
];

const whitespace =
  whitespaceCodePoints.map((codePoint) => String.fromCodePoint(codePoint));
for (const space of whitespace) {
  assert.strictEqual(Number(`${space}42${space}`), 42);
  assert.strictEqual(Number(space), 0);
  assert.strictEqual(Number(`${space}.5${space}`), 0.5);
  assert.strictEqual(Number(`${space}1e2${space}`), 100);
  assert.strictEqual(Number(`${space}0b101${space}`), 5);
  assert.strictEqual(Number(`${space}0o10${space}`), 8);
  assert.strictEqual(Number(`${space}0x10${space}`), 16);
  assert.strictEqual(Number(`${space}+Infinity${space}`), Infinity);
  assert.strictEqual(Number(`${space}-Infinity${space}`), -Infinity);
  assert.strictEqual(parseInt(`${space}42`, 10), 42);
  assert.strictEqual(parseFloat(`${space}42.5junk`), 42.5);
  assert.strictEqual(BigInt(`${space}42${space}`), 42n);
  assert.strictEqual(BigInt(space), 0n);
}

const allWhitespace = whitespace.join('');
assert.strictEqual(Number(`${allWhitespace}42${allWhitespace}`), 42);
assert.strictEqual(parseInt(`${allWhitespace}42`, 10), 42);
assert.strictEqual(parseFloat(`${allWhitespace}42.5tail`), 42.5);
assert.strictEqual(BigInt(`${allWhitespace}42${allWhitespace}`), 42n);

for (const malformedBytes of [
  [0xa0],
  [0xc2],
  [0xc0, 0xa0],
  [0xe1, 0x9a],
  [0xe2, 0x80],
  [0xe2, 0x80, 0x8b],
  [0xed, 0xa0, 0x80],
  [0xef, 0xbb],
]) {
  const malformed = String.fromCharCode(...malformedBytes);
  assert(Number.isNaN(Number(`${malformed}42`)));
  assert(Number.isNaN(parseInt(`${malformed}42`, 10)));
  assert(Number.isNaN(parseFloat(`${malformed}42`)));
  assert.throws(() => BigInt(`${malformed}42`), SyntaxError);
}

const partialBeforeAsciiSpace = String.fromCharCode(0xc2, 0x20);
assert(Number.isNaN(Number(`${partialBeforeAsciiSpace}42`)));
