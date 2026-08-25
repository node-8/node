// Flags: --experimental-node-8-string-semantics
/* eslint-disable regexp/no-lazy-ends */
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
const subject = eAcute + cjk + emoji + 'a' + eCircumflex;

const ordinary = Array.from(subject.matchAll(/([^\n])+?/dgu));
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[0]),
  [[0, 2], [2, 5], [5, 9], [9, 10], [10, 12]]);
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[1]),
  ordinary.map((match) => match.indices[0]));

const named = /(?<part>[^\n]){2,}?/du.exec(subject);
assert.notStrictEqual(named, null);
assert.strictEqual(named[0], eAcute + cjk);
assert.strictEqual(named.groups.part, cjk);
assert.deepStrictEqual(named.indices[0], [0, 5]);
assert.deepStrictEqual(named.indices.groups.part, [2, 5]);

const nested = /((([^\n]))){3,5}?/du.exec(subject);
assert.notStrictEqual(nested, null);
assert.strictEqual(nested[0], eAcute + cjk + emoji);
for (let capture = 1; capture <= 3; capture++) {
  assert.strictEqual(nested[capture], emoji);
  assert.deepStrictEqual(nested.indices[capture], [5, 9]);
}

const replacementCalls = [];
assert.strictEqual(subject.replace(
  /([^\n])+?/gu,
  common.mustCall((match, capture, offset) => {
    replacementCalls.push([offset, bytes(match), bytes(capture)]);
    return 'X';
  }, 5)), 'XXXXX');
assert.deepStrictEqual(replacementCalls, [
  [0, bytes(eAcute), bytes(eAcute)],
  [2, bytes(cjk), bytes(cjk)],
  [5, bytes(emoji), bytes(emoji)],
  [9, bytes('a'), bytes('a')],
  [10, bytes(eCircumflex), bytes(eCircumflex)],
]);

const sticky = /([^\n]){2,5}?/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + 'a');
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(bytes(continuation[0]), [0xa9, 0xe4, 0xb8, 0xad]);
assert.strictEqual(continuation[1], cjk);
assert.deepStrictEqual(Array.from(continuation.indices), [[1, 5], [2, 5]]);
assert.strictEqual(sticky.lastIndex, 5);

const malformed = /([^\n]){2,}?/du.exec(raw(0x61, 0xe2, 0x82, 0x62));
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0x61, 0xe2, 0x82]);
assert.deepStrictEqual(bytes(malformed[1]), [0xe2, 0x82]);
assert.deepStrictEqual(Array.from(malformed.indices), [[0, 3], [1, 3]]);

const positive = /([é-ë]){2,5}?/du.exec(
  cjk + eAcute + eCircumflex + eDiaeresis);
assert.notStrictEqual(positive, null);
assert.deepStrictEqual(Array.from(positive.indices), [[3, 7], [5, 7]]);

const replacementClass = /([\uFFFD]){2,}?/du.exec(raw(0x80, 0xff, 0x61));
assert.notStrictEqual(replacementClass, null);
assert.deepStrictEqual(bytes(replacementClass[0]), [0x80, 0xff]);
assert.deepStrictEqual(bytes(replacementClass[1]), [0xff]);
assert.deepStrictEqual(Array.from(replacementClass.indices), [[0, 2], [1, 2]]);
