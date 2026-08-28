// Flags: --experimental-node-8-string-semantics
'use strict';

/* eslint-disable regexp/no-lazy-ends */

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) =>
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const eDiaeresis = String.fromCodePoint(0xeb);
const iGrave = String.fromCodePoint(0xec);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const emojiOne = String.fromCodePoint(0x1f601);

const greedy = /[\u00e9-\u00eb]{1,3}/du.exec(
  eAcute + eCircumflex + 'x');
assert.notStrictEqual(greedy, null);
assert.deepStrictEqual(bytes(greedy[0]), bytes(eAcute + eCircumflex));
assert.deepStrictEqual(greedy.indices[0], [0, 4]);
assert.strictEqual(
  /[\u00e9-\u00eb]{3,5}/du.exec(eAcute + eCircumflex), null);

const lazyPlus = /[\u00e9-\u00eb]+?/du.exec(eAcute + eCircumflex);
assert.notStrictEqual(lazyPlus, null);
assert.deepStrictEqual(bytes(lazyPlus[0]), bytes(eAcute));
assert.deepStrictEqual(lazyPlus.indices[0], [0, 2]);

const lazyBounded = /[\u00e9-\u00eb]{1,2}?/du.exec(
  eAcute + eCircumflex);
assert.notStrictEqual(lazyBounded, null);
assert.deepStrictEqual(bytes(lazyBounded[0]), bytes(eAcute));
assert.deepStrictEqual(lazyBounded.indices[0], [0, 2]);

const lazyMinimum = /[\u00e9-\u00eb]{2,}?/du.exec(
  eAcute + eCircumflex + eDiaeresis);
assert.notStrictEqual(lazyMinimum, null);
assert.deepStrictEqual(bytes(lazyMinimum[0]),
                       bytes(eAcute + eCircumflex));
assert.deepStrictEqual(lazyMinimum.indices[0], [0, 4]);

const edgeSubject =
  `AD${eAcute}${eDiaeresis}${iGrave}${cjk}${emoji}${emojiOne}x`;
const edgeMatches = Array.from(edgeSubject.matchAll(
  /[A-C\u00e9-\u00eb\u4e2d\u{1f600}-\u{1f601}]{1,2}/dgu));
assert.deepStrictEqual(
  edgeMatches.map((match) => match.indices[0]),
  [[0, 1], [2, 6], [8, 15], [15, 19]]);
assert.deepStrictEqual(edgeMatches.map((match) => bytes(match[0])), [
  bytes('A'),
  bytes(eAcute + eDiaeresis),
  bytes(cjk + emoji),
  bytes(emojiOne),
]);

const replacementCalls = [];
assert.strictEqual(edgeSubject.replace(
  /[A-C\u00e9-\u00eb\u4e2d\u{1f600}-\u{1f601}]{1,2}/gu,
  common.mustCall((match, offset) => {
    replacementCalls.push([offset, bytes(match)]);
    return 'X';
  }, 4)), `XDX${iGrave}XXx`);
assert.deepStrictEqual(replacementCalls, [
  [0, bytes('A')],
  [2, bytes(eAcute + eDiaeresis)],
  [8, bytes(cjk + emoji)],
  [15, bytes(emojiOne)],
]);

const surrogate = String.fromCodePoint(0xd800);
const surrogateMatch = /[\ud800]{1,2}?/du.exec(surrogate + surrogate);
assert.notStrictEqual(surrogateMatch, null);
assert.deepStrictEqual(bytes(surrogateMatch[0]), bytes(surrogate));
assert.deepStrictEqual(surrogateMatch.indices[0], [0, 3]);

const malformedValue = raw(0x80, 0xe2, 0x82, 0x61, 0xc3, 0xa9);
const malformed = /[A-C\u00e9-\u00eb]{1,2}/du.exec(malformedValue);
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0xc3, 0xa9]);
assert.deepStrictEqual(malformed.indices[0], [4, 6]);

const continuation = /[\u00e9-\u00eb]{1,2}/dgu;
continuation.lastIndex = 1;
const continuationMatch = continuation.exec(eAcute + eCircumflex);
assert.notStrictEqual(continuationMatch, null);
assert.deepStrictEqual(bytes(continuationMatch[0]), bytes(eCircumflex));
assert.deepStrictEqual(continuationMatch.indices[0], [2, 4]);
assert.strictEqual(continuation.lastIndex, 4);

const empty = Array.from(
  (eAcute + 'x').matchAll(/[\u00e9-\u00eb]{0,2}?/dgu));
assert.deepStrictEqual(
  empty.map((match) => match.indices[0]),
  [[0, 0], [1, 1], [2, 2], [3, 3]]);
