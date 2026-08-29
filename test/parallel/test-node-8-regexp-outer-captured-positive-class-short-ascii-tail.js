// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => Array.from(
  { length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);

const greedy = /([A-C\u00e9-\u00eb]{1,3})xy/du.exec(eAcute + 'xy');
assert.notStrictEqual(greedy, null);
assert.deepStrictEqual(bytes(greedy[0]), bytes(eAcute + 'xy'));
assert.deepStrictEqual(bytes(greedy[1]), bytes(eAcute));
assert.deepStrictEqual(Array.from(greedy.indices), [[0, 4], [0, 2]]);

assert.strictEqual(
  /([A-C\u00e9-\u00eb]{2,3})xy/du.exec(eAcute + 'xy'), null);

const overlap = /([x\u00e9-\u00eb]{1,3})xy/du.exec(eAcute + 'xxy');
assert.notStrictEqual(overlap, null);
assert.deepStrictEqual(bytes(overlap[1]), bytes(eAcute + 'x'));
assert.deepStrictEqual(Array.from(overlap.indices), [[0, 5], [0, 3]]);

const lazy = /([A-C\u00e9-\u00eb]{1,3}?)xy/du.exec(
  'A' + eAcute + 'xy');
assert.notStrictEqual(lazy, null);
assert.deepStrictEqual(bytes(lazy[1]), bytes('A' + eAcute));
assert.deepStrictEqual(Array.from(lazy.indices), [[0, 5], [0, 3]]);

const nested = /((?<line>[A-C\u00e9-\u00eb]{1,3}?))\r\n/du.exec(
  eAcute + '\r\n');
assert.notStrictEqual(nested, null);
for (let capture = 1; capture <= 2; capture++) {
  assert.deepStrictEqual(bytes(nested[capture]), bytes(eAcute));
  assert.deepStrictEqual(nested.indices[capture], [0, 2]);
}
assert.deepStrictEqual(bytes(nested.groups.line), bytes(nested[2]));
assert.deepStrictEqual(nested.indices.groups.line, nested.indices[2]);

const eightByteTail = /([A-C\u00e9-\u00eb]{1,3})abcdefgh/du.exec(
  eAcute + 'abcdefgh');
assert.notStrictEqual(eightByteTail, null);
assert.deepStrictEqual(
  Array.from(eightByteTail.indices), [[0, 10], [0, 2]]);

const malformedSubject = raw(0x80, 0xc3, 0xa9, 0x78, 0x79);
const malformed = /([A-C\u00e9-\u00eb]{1,3})xy/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assert.notStrictEqual(malformedMatch, null);
assert.deepStrictEqual(
  Array.from(malformedMatch.indices), [[1, 5], [1, 3]]);
assert.strictEqual(malformed.lastIndex, 5);

const all = Array.from((eAcute + 'xyA' + eCircumflex + 'xy').matchAll(
  /([A-C\u00e9-\u00eb]{1,3}?)xy/dgu));
assert.deepStrictEqual(
  all.map((match) => match.indices[0]), [[0, 4], [4, 9]]);
assert.deepStrictEqual(
  all.map((match) => match.indices[1]), [[0, 2], [4, 7]]);

const replacementCalls = [];
assert.strictEqual(('A' + eAcute + 'xy').replace(
  /([A-C\u00e9-\u00eb]{1,3}?)xy/gu,
  common.mustCall((match, run, offset) => {
    replacementCalls.push([offset, bytes(match), bytes(run)]);
    return 'Y';
  })), 'Y');
assert.deepStrictEqual(replacementCalls, [[
  0,
  bytes('A' + eAcute + 'xy'),
  bytes('A' + eAcute),
]]);
