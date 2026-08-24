// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) =>
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const subject = eAcute + cjk + emoji + 'a' + eCircumflex + 'b';

const ordinary = Array.from(subject.matchAll(/([^\n]){2}/dgu));
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[0]),
  [[0, 5], [5, 10], [10, 13]]);
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[1]),
  [[2, 5], [9, 10], [12, 13]]);

const named = /(?<part>[^\n]){3}?/du.exec(subject);
assert.notStrictEqual(named, null);
assert.strictEqual(named[0], eAcute + cjk + emoji);
assert.strictEqual(named.groups.part, emoji);
assert.deepStrictEqual(named.indices[0], [0, 9]);
assert.deepStrictEqual(named.indices.groups.part, [5, 9]);

const nested = /((([^\n]))){5}/du.exec(subject);
assert.notStrictEqual(nested, null);
assert.strictEqual(nested[0], eAcute + cjk + emoji + 'a' + eCircumflex);
for (let capture = 1; capture <= 3; capture++) {
  assert.strictEqual(nested[capture], eCircumflex);
  assert.deepStrictEqual(nested.indices[capture], [10, 12]);
}

const replacementOffsets = [];
assert.strictEqual(subject.replace(
  /([^\n]){2}/gu,
  common.mustCall((match, capture, offset) => {
    replacementOffsets.push([offset, bytes(match), bytes(capture)]);
    return 'X';
  }, 3)), 'XXX');
assert.deepStrictEqual(replacementOffsets, [
  [0, bytes(eAcute + cjk), bytes(cjk)],
  [5, bytes(emoji + 'a'), bytes('a')],
  [10, bytes(eCircumflex + 'b'), bytes('b')],
]);

const sticky = /([^\n]){3}/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + 'a');
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(bytes(continuation[0]),
                       [0xa9, 0xe4, 0xb8, 0xad, 0x61]);
assert.strictEqual(continuation[1], 'a');
assert.deepStrictEqual(Array.from(continuation.indices), [[1, 6], [5, 6]]);
assert.strictEqual(sticky.lastIndex, 6);

const malformed = /([^\n]){3}?/du.exec(raw(0x61, 0xe2, 0x82, 0x62));
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0x61, 0xe2, 0x82, 0x62]);
assert.deepStrictEqual(bytes(malformed[1]), [0x62]);
assert.deepStrictEqual(Array.from(malformed.indices), [[0, 4], [3, 4]]);

const positive = /([é-ë]){3}?/du.exec(
  cjk + eAcute + eCircumflex + String.fromCodePoint(0xeb));
assert.notStrictEqual(positive, null);
assert.deepStrictEqual(Array.from(positive.indices), [[3, 9], [7, 9]]);

const replacementClass = /([\uFFFD]){3}/du.exec(
  raw(0x80, 0xff, 0xc0, 0x61));
assert.notStrictEqual(replacementClass, null);
assert.deepStrictEqual(bytes(replacementClass[0]), [0x80, 0xff, 0xc0]);
assert.deepStrictEqual(bytes(replacementClass[1]), [0xc0]);
assert.deepStrictEqual(Array.from(replacementClass.indices), [[0, 3], [2, 3]]);
