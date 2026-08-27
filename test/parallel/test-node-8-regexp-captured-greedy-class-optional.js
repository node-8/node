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
const subject = eAcute + '\n' + cjk;

const ordinary = Array.from(subject.matchAll(/([^\n])?/dgu));
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[0]),
  [[0, 2], [2, 2], [3, 6], [6, 6]]);
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[1]),
  [[0, 2], undefined, [3, 6], undefined]);
assert.deepStrictEqual(
  ordinary.map((match) => bytes(match[1])),
  [bytes(eAcute), undefined, bytes(cjk), undefined]);

const named = Array.from(subject.matchAll(/(?<part>[^\n]){0,1}/dgu));
assert.deepStrictEqual(
  named.map((match) => match.indices.groups.part),
  [[0, 2], undefined, [3, 6], undefined]);
assert.deepStrictEqual(
  named.map((match) => bytes(match.groups.part)),
  [bytes(eAcute), undefined, bytes(cjk), undefined]);

const nested = Array.from(subject.matchAll(/((([^\n])))?/dgu));
for (let capture = 1; capture <= 3; capture++) {
  assert.deepStrictEqual(
    nested.map((match) => match.indices[capture]),
    [[0, 2], undefined, [3, 6], undefined]);
}

const replacementCalls = [];
assert.strictEqual(subject.replace(
  /([^\n])?/gu,
  common.mustCall((match, capture, offset) => {
    replacementCalls.push([offset, bytes(match), bytes(capture)]);
    return 'X';
  }, 4)), 'XX\nXX');
assert.deepStrictEqual(replacementCalls, [
  [0, bytes(eAcute), bytes(eAcute)],
  [2, [], undefined],
  [3, bytes(cjk), bytes(cjk)],
  [6, [], undefined],
]);

const sticky = /([^\n])?/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + '\n');
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(bytes(continuation[0]), [0xa9]);
assert.deepStrictEqual(bytes(continuation[1]), [0xa9]);
assert.deepStrictEqual(Array.from(continuation.indices), [[1, 2], [1, 2]]);
assert.strictEqual(sticky.lastIndex, 2);

sticky.lastIndex = 2;
const empty = sticky.exec(eAcute + '\n');
assert.notStrictEqual(empty, null);
assert.strictEqual(empty[0], '');
assert.strictEqual(empty[1], undefined);
assert.deepStrictEqual(Array.from(empty.indices), [[2, 2], undefined]);
assert.strictEqual(sticky.lastIndex, 2);

const malformedPattern = /([^\n])?/duy;
malformedPattern.lastIndex = 1;
const malformed = malformedPattern.exec(raw(0x61, 0xe2, 0x82, 0x0a));
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0xe2, 0x82]);
assert.deepStrictEqual(bytes(malformed[1]), [0xe2, 0x82]);
assert.deepStrictEqual(Array.from(malformed.indices), [[1, 3], [1, 3]]);

const positive = /([é-ë])?/du.exec(eAcute + eCircumflex);
assert.notStrictEqual(positive, null);
assert.deepStrictEqual(bytes(positive[0]), bytes(eAcute));
assert.deepStrictEqual(Array.from(positive.indices), [[0, 2], [0, 2]]);

const replacementClass = /([\uFFFD])?/du.exec(raw(0x80, 0xff, 0x61));
assert.notStrictEqual(replacementClass, null);
assert.deepStrictEqual(bytes(replacementClass[0]), [0x80]);
assert.deepStrictEqual(bytes(replacementClass[1]), [0x80]);
assert.deepStrictEqual(
  Array.from(replacementClass.indices), [[0, 1], [0, 1]]);
