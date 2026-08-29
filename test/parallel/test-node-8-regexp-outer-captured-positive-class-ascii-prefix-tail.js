// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => Array.from(
  { length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);

const greedy = /key=([A-C\u00e9-\u00eb]{1,3})\r\n/du.exec(
  'key=' + eAcute + '\r\n');
assert.notStrictEqual(greedy, null);
assert.deepStrictEqual(bytes(greedy[0]), bytes('key=' + eAcute + '\r\n'));
assert.deepStrictEqual(bytes(greedy[1]), bytes(eAcute));
assert.deepStrictEqual(Array.from(greedy.indices), [[0, 8], [4, 6]]);

assert.strictEqual(/key=([A-C\u00e9-\u00eb]{2,3})\r\n/du.exec(
  'key=' + eAcute + '\r\n'), null);

const overlap = /k=([x\u00e9-\u00eb]{1,3})xy/du.exec(
  'k=' + eAcute + 'xxy');
assert.notStrictEqual(overlap, null);
assert.deepStrictEqual(bytes(overlap[1]), bytes(eAcute + 'x'));
assert.deepStrictEqual(Array.from(overlap.indices), [[0, 7], [2, 5]]);

const lazy = /k=([A-C\u00e9-\u00eb]{1,3}?)xy/du.exec(
  'k=A' + eAcute + 'xy');
assert.notStrictEqual(lazy, null);
assert.deepStrictEqual(bytes(lazy[1]), bytes('A' + eAcute));
assert.deepStrictEqual(Array.from(lazy.indices), [[0, 7], [2, 5]]);

const nested = /id=((?<value>[A-C\u00e9-\u00eb]{1,3}?))\r\n/du.exec(
  'id=' + eAcute + '\r\n');
assert.notStrictEqual(nested, null);
for (let capture = 1; capture <= 2; capture++) {
  assert.deepStrictEqual(bytes(nested[capture]), bytes(eAcute));
  assert.deepStrictEqual(nested.indices[capture], [3, 5]);
}
assert.deepStrictEqual(bytes(nested.groups.value), bytes(nested[2]));
assert.deepStrictEqual(nested.indices.groups.value, nested.indices[2]);

const maximumAtoms = /12345678([A-C\u00e9-\u00eb]{1,3})abcdefgh/du.exec(
  '12345678' + eAcute + 'abcdefgh');
assert.notStrictEqual(maximumAtoms, null);
assert.deepStrictEqual(Array.from(maximumAtoms.indices), [[0, 18], [8, 10]]);

const malformedSubject = raw(0x80, 0x6b, 0x3d, 0xc3, 0xa9, 0x78, 0x79);
const malformed = /k=([A-C\u00e9-\u00eb]{1,3})xy/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assert.notStrictEqual(malformedMatch, null);
assert.deepStrictEqual(
  Array.from(malformedMatch.indices), [[1, 7], [3, 5]]);
assert.strictEqual(malformed.lastIndex, 7);

const all = Array.from(
  ('k=' + eAcute + 'xyk=A' + eCircumflex + 'xy').matchAll(
    /k=([A-C\u00e9-\u00eb]{1,3}?)xy/dgu));
assert.deepStrictEqual(
  all.map((match) => match.indices[0]), [[0, 6], [6, 13]]);
assert.deepStrictEqual(
  all.map((match) => match.indices[1]), [[2, 4], [8, 11]]);

const replacementCalls = [];
assert.strictEqual(('k=A' + eAcute + 'xy').replace(
  /k=([A-C\u00e9-\u00eb]{1,3}?)xy/gu,
  common.mustCall((match, run, offset) => {
    replacementCalls.push([offset, bytes(match), bytes(run)]);
    return 'Y';
  })), 'Y');
assert.deepStrictEqual(replacementCalls, [[
  0,
  bytes('k=A' + eAcute + 'xy'),
  bytes('A' + eAcute),
]]);
