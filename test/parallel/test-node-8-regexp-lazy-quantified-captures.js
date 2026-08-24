// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) =>
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const subject = eAcute + cjk + emoji + 'a';

const ordinary = Array.from(subject.matchAll(/([^\n]){2}?/dgu));
assert.deepStrictEqual(ordinary.map((match) => match.index), [0, 5]);
assert.deepStrictEqual(
  ordinary.map((match) => bytes(match[0])),
  [bytes(eAcute + cjk), bytes(emoji + 'a')]);
assert.deepStrictEqual(
  ordinary.map((match) => bytes(match[1])),
  [bytes(cjk), bytes('a')]);
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[0]), [[0, 5], [5, 10]]);
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[1]), [[2, 5], [9, 10]]);

const named = /(?<part>[^\n]){2}?/du.exec(eAcute + cjk);
assert.notStrictEqual(named, null);
assert.strictEqual(named[0], eAcute + cjk);
assert.strictEqual(named.groups.part, cjk);
assert.deepStrictEqual(named.indices[0], [0, 5]);
assert.deepStrictEqual(named.indices.groups.part, [2, 5]);

const nested = Array.from(subject.matchAll(/((([^\n]))){2}?/dgu));
assert.deepStrictEqual(nested.map((match) => match.indices[0]),
                       [[0, 5], [5, 10]]);
for (const match of nested) {
  for (let capture = 1; capture <= 3; capture++) {
    assert.strictEqual(match[capture], match[3]);
    assert.deepStrictEqual(match.indices[capture], match.indices[3]);
  }
}

const replacementOffsets = [];
assert.strictEqual(subject.replace(
  /([^\n]){2}?/gu,
  common.mustCall((match, capture, offset) => {
    replacementOffsets.push([offset, bytes(match), bytes(capture)]);
    return 'X';
  }, 2)), 'XX');
assert.deepStrictEqual(replacementOffsets, [
  [0, bytes(eAcute + cjk), bytes(cjk)],
  [5, bytes(emoji + 'a'), bytes('a')],
]);

const sticky = /([^\n]){2}?/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + 'a');
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(bytes(continuation[0]), [0xa9, 0xe4, 0xb8, 0xad]);
assert.strictEqual(continuation[1], cjk);
assert.deepStrictEqual(Array.from(continuation.indices), [[1, 5], [2, 5]]);
assert.strictEqual(sticky.lastIndex, 5);

const malformed = /([^\n]){2}?/du.exec(raw(0x61, 0xe2, 0x82, 0x62));
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0x61, 0xe2, 0x82]);
assert.deepStrictEqual(bytes(malformed[1]), [0xe2, 0x82]);
assert.deepStrictEqual(Array.from(malformed.indices), [[0, 3], [1, 3]]);

const replacementClass = /([\uFFFD]){2}?/du.exec(raw(0x80, 0xff, 0x61));
assert.notStrictEqual(replacementClass, null);
assert.deepStrictEqual(bytes(replacementClass[0]), [0x80, 0xff]);
assert.deepStrictEqual(bytes(replacementClass[1]), [0xff]);
assert.deepStrictEqual(Array.from(replacementClass.indices),
                       [[0, 2], [1, 2]]);
