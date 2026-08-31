// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => Array.from(
  { length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);

const bodyOnly = /([A-C\u00e9-\u00eb])+xy/du.exec(
  eAcute + eCircumflex + 'xy');
assert.notStrictEqual(bodyOnly, null);
assert.deepStrictEqual(bytes(bodyOnly[1]), bytes(eCircumflex));
assert.deepStrictEqual(Array.from(bodyOnly.indices), [[0, 6], [2, 4]]);

const mixed = /id=(([A-C\u00e9-\u00eb])+)xy/du.exec(
  'id=A' + eAcute + eCircumflex + 'xy');
assert.notStrictEqual(mixed, null);
assert.deepStrictEqual(
  Array.from(mixed.indices), [[0, 10], [3, 8], [6, 8]]);

const lazy = /id=(([A-C\u00e9-\u00eb])+?)xy/du.exec(
  'id=' + eAcute + eCircumflex + 'xy');
assert.notStrictEqual(lazy, null);
assert.deepStrictEqual(
  Array.from(lazy.indices), [[0, 9], [3, 7], [5, 7]]);

const named = /p=((?<last>[A-C\u00e9-\u00eb])){2,}z/du.exec(
  'p=A' + eAcute + eCircumflex + 'z');
assert.notStrictEqual(named, null);
assert.deepStrictEqual(bytes(named.groups.last), bytes(eCircumflex));
assert.deepStrictEqual(
  Array.from(named.indices), [[0, 8], [5, 7], [5, 7]]);
assert.deepStrictEqual(named.indices.groups.last, [5, 7]);

const nested = /p=((([A-C\u00e9-\u00eb]))*)z/du.exec(
  'p=' + eAcute + eCircumflex + 'z');
assert.notStrictEqual(nested, null);
assert.deepStrictEqual(
  Array.from(nested.indices), [[0, 7], [2, 6], [4, 6], [4, 6]]);

const backtrack = /(([A-Cx\u00e9])+)xy/du.exec(eAcute + 'xy');
assert.notStrictEqual(backtrack, null);
assert.deepStrictEqual(
  Array.from(backtrack.indices), [[0, 4], [0, 2], [0, 2]]);

const lazyExpansion = /(([A-Cx\u00e9])+?)xy/du.exec(eAcute + 'xxy');
assert.notStrictEqual(lazyExpansion, null);
assert.deepStrictEqual(
  Array.from(lazyExpansion.indices), [[0, 5], [0, 3], [2, 3]]);

const zero = /(([A-C\u00e9-\u00eb])*)xy/du.exec('xy');
assert.notStrictEqual(zero, null);
assert.deepStrictEqual(
  Array.from(zero.indices), [[0, 2], [0, 0], undefined]);

const largeMinimum = /p=(([A-C\u00e9-\u00eb]){9,})z/du.exec(
  'p=A' + eAcute + 'BC' + eCircumflex + 'ABCAz');
assert.notStrictEqual(largeMinimum, null);
assert.deepStrictEqual(
  Array.from(largeMinimum.indices), [[0, 14], [2, 13], [12, 13]]);

const malformedSubject = raw(
  0x80, 0x6b, 0x3d, 0xc3, 0xa9, 0xc3, 0xaa, 0x78, 0x79);
const malformed = /k=(([A-C\u00e9-\u00eb])+?)xy/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assert.notStrictEqual(malformedMatch, null);
assert.deepStrictEqual(
  Array.from(malformedMatch.indices), [[1, 9], [3, 7], [5, 7]]);
assert.strictEqual(malformed.lastIndex, 9);

const all = Array.from(
  ('k=' + eAcute + eCircumflex + 'xyk=A' + eAcute + 'xy').matchAll(
    /k=(([A-C\u00e9-\u00eb])+)xy/dgu));
assert.deepStrictEqual(
  all.map((match) => match.indices[0]), [[0, 8], [8, 15]]);
assert.deepStrictEqual(
  all.map((match) => match.indices[2]), [[4, 6], [11, 13]]);

assert.strictEqual(('key=' + eAcute + eCircumflex + '\r\n').replace(
  /key=(([A-C\u00e9-\u00eb])+)\r\n/gu,
  common.mustCall((match, outer, inner) => {
    assert.deepStrictEqual(bytes(outer), bytes(eAcute + eCircumflex));
    assert.deepStrictEqual(bytes(inner), bytes(eCircumflex));
    return 'Y';
  })), 'Y');

// Finite and complete unbounded sibling paths remain unchanged.
assert.deepStrictEqual(
  Array.from(/(([A-C\u00e9-\u00eb]){1,3})xy/du.exec(
    eAcute + eCircumflex + 'xy').indices),
  [[0, 6], [0, 4], [2, 4]]);
assert.deepStrictEqual(
  Array.from(/(([A-C\u00e9-\u00eb])+)/du.exec(
    eAcute + eCircumflex).indices),
  [[0, 4], [0, 4], [2, 4]]);

// Pure-outer unbounded prefix-tail remains outside this selector.
assert.strictEqual(/(([A-C\u00e9-\u00eb]+))xy/du.exec(
  eAcute + eCircumflex + 'xy'), null);
