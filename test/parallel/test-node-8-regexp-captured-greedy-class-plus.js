// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) =>
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const eDiaeresis = String.fromCodePoint(0xeb);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const subject = eAcute + cjk + emoji + '\na' + eCircumflex;

const ordinary = Array.from(subject.matchAll(/([^\n])+/dgu));
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[0]), [[0, 9], [10, 13]]);
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[1]), [[5, 9], [11, 13]]);
assert.deepStrictEqual(
  ordinary.map((match) => bytes(match[1])),
  [bytes(emoji), bytes(eCircumflex)]);

const named = /(?<part>[^\n])+/du.exec(subject);
assert.notStrictEqual(named, null);
assert.strictEqual(named[0], eAcute + cjk + emoji);
assert.strictEqual(named.groups.part, emoji);
assert.deepStrictEqual(named.indices[0], [0, 9]);
assert.deepStrictEqual(named.indices.groups.part, [5, 9]);

const nested = /((([^\n])))+/du.exec(subject);
assert.notStrictEqual(nested, null);
for (let capture = 1; capture <= 3; capture++) {
  assert.strictEqual(nested[capture], emoji);
  assert.deepStrictEqual(nested.indices[capture], [5, 9]);
}

const replacementOffsets = [];
assert.strictEqual(subject.replace(
  /([^\n])+/gu,
  common.mustCall((match, capture, offset) => {
    replacementOffsets.push([offset, bytes(match), bytes(capture)]);
    return 'X';
  }, 2)), 'X\nX');
assert.deepStrictEqual(replacementOffsets, [
  [0, bytes(eAcute + cjk + emoji), bytes(emoji)],
  [10, bytes('a' + eCircumflex), bytes(eCircumflex)],
]);

const sticky = /([^\n])+/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + '\n');
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(bytes(continuation[0]), [0xa9, 0xe4, 0xb8, 0xad]);
assert.strictEqual(continuation[1], cjk);
assert.deepStrictEqual(Array.from(continuation.indices), [[1, 5], [2, 5]]);
assert.strictEqual(sticky.lastIndex, 5);

const malformed = /([^\n])+/du.exec(raw(0x61, 0xe2, 0x82, 0x0a));
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0x61, 0xe2, 0x82]);
assert.deepStrictEqual(bytes(malformed[1]), [0xe2, 0x82]);
assert.deepStrictEqual(Array.from(malformed.indices), [[0, 3], [1, 3]]);

const positive = /([é-ë])+/du.exec(
  cjk + eAcute + eCircumflex + eDiaeresis + 'x');
assert.notStrictEqual(positive, null);
assert.deepStrictEqual(Array.from(positive.indices), [[3, 9], [7, 9]]);

const replacementClass = /([\uFFFD])+/du.exec(
  raw(0x80, 0xff, 0xc0, 0x61));
assert.notStrictEqual(replacementClass, null);
assert.deepStrictEqual(bytes(replacementClass[0]), [0x80, 0xff, 0xc0]);
assert.deepStrictEqual(bytes(replacementClass[1]), [0xc0]);
assert.deepStrictEqual(Array.from(replacementClass.indices), [[0, 3], [2, 3]]);
