// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => (value === undefined ? undefined :
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const subject = eAcute + cjk + '\n' + emoji;

const ordinary = Array.from(subject.matchAll(/([^\n])*/dgu));
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[0]),
  [[0, 5], [5, 5], [6, 10], [10, 10]]);
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[1]),
  [[2, 5], undefined, [6, 10], undefined]);
assert.deepStrictEqual(
  ordinary.map((match) => bytes(match[1])),
  [bytes(cjk), undefined, bytes(emoji), undefined]);

const named = Array.from(subject.matchAll(/(?<part>[^\n])*/dgu));
assert.deepStrictEqual(
  named.map((match) => match.indices.groups.part),
  [[2, 5], undefined, [6, 10], undefined]);
assert.deepStrictEqual(
  named.map((match) => bytes(match.groups.part)),
  [bytes(cjk), undefined, bytes(emoji), undefined]);

const nested = Array.from(subject.matchAll(/((([^\n])))*/dgu));
for (let capture = 1; capture <= 3; capture++) {
  assert.deepStrictEqual(
    nested.map((match) => match.indices[capture]),
    [[2, 5], undefined, [6, 10], undefined]);
}

const replacementCalls = [];
assert.strictEqual(subject.replace(
  /([^\n])*/gu,
  common.mustCall((match, capture, offset) => {
    replacementCalls.push([offset, bytes(match), bytes(capture)]);
    return 'X';
  }, 4)), 'XX\nXX');
assert.deepStrictEqual(replacementCalls, [
  [0, bytes(eAcute + cjk), bytes(cjk)],
  [5, [], undefined],
  [6, bytes(emoji), bytes(emoji)],
  [10, [], undefined],
]);

const sticky = /([^\n])*/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + '\n');
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(bytes(continuation[0]), [0xa9, 0xe4, 0xb8, 0xad]);
assert.strictEqual(continuation[1], cjk);
assert.deepStrictEqual(Array.from(continuation.indices), [[1, 5], [2, 5]]);
assert.strictEqual(sticky.lastIndex, 5);

sticky.lastIndex = 5;
const empty = sticky.exec(eAcute + cjk + '\n');
assert.notStrictEqual(empty, null);
assert.strictEqual(empty[0], '');
assert.strictEqual(empty[1], undefined);
assert.deepStrictEqual(Array.from(empty.indices), [[5, 5], undefined]);
assert.strictEqual(sticky.lastIndex, 5);

const malformed = /([^\n])*/du.exec(raw(0x61, 0xe2, 0x82, 0x0a));
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0x61, 0xe2, 0x82]);
assert.deepStrictEqual(bytes(malformed[1]), [0xe2, 0x82]);
assert.deepStrictEqual(Array.from(malformed.indices), [[0, 3], [1, 3]]);

const positive = /([é-ë])*/du.exec(eAcute + eCircumflex + 'x');
assert.notStrictEqual(positive, null);
assert.deepStrictEqual(Array.from(positive.indices), [[0, 4], [2, 4]]);

const replacementClass = /([\uFFFD])*/du.exec(raw(0x80, 0xff, 0x61));
assert.notStrictEqual(replacementClass, null);
assert.deepStrictEqual(bytes(replacementClass[0]), [0x80, 0xff]);
assert.deepStrictEqual(bytes(replacementClass[1]), [0xff]);
assert.deepStrictEqual(Array.from(replacementClass.indices), [[0, 2], [1, 2]]);
