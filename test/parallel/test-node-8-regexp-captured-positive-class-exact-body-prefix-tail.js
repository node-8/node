// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => Array.from(
  { length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);

const bodyOnly = /([A-C\u00e9-\u00eb]){2}xy/du.exec(
  eAcute + eCircumflex + 'xy');
assert.notStrictEqual(bodyOnly, null);
assert.deepStrictEqual(bytes(bodyOnly[1]), bytes(eCircumflex));
assert.deepStrictEqual(Array.from(bodyOnly.indices), [[0, 6], [2, 4]]);
assert.strictEqual(
  /([A-C\u00e9-\u00eb]){2}xy/du.exec(eAcute + 'xy'), null);

const mixed = /(([A-C\u00e9-\u00eb]){2})xy/du.exec(
  eAcute + eCircumflex + 'xy');
assert.notStrictEqual(mixed, null);
assert.deepStrictEqual(bytes(mixed[1]), bytes(eAcute + eCircumflex));
assert.deepStrictEqual(bytes(mixed[2]), bytes(eCircumflex));
assert.deepStrictEqual(
  Array.from(mixed.indices), [[0, 6], [0, 4], [2, 4]]);

const namedBody = /id=((?<last>[A-C\u00e9-\u00eb])){3}xy/du.exec(
  'id=A' + eAcute + eCircumflex + 'xy');
assert.notStrictEqual(namedBody, null);
assert.deepStrictEqual(bytes(namedBody[1]), bytes(eCircumflex));
assert.deepStrictEqual(bytes(namedBody.groups.last), bytes(namedBody[1]));
assert.deepStrictEqual(
  Array.from(namedBody.indices), [[0, 10], [6, 8], [6, 8]]);
assert.deepStrictEqual(namedBody.indices.groups.last, [6, 8]);

const nestedMixed = /p=((([A-C\u00e9-\u00eb])){2})z/du.exec(
  'p=' + eAcute + eCircumflex + 'z');
assert.notStrictEqual(nestedMixed, null);
assert.deepStrictEqual(
  Array.from(nestedMixed.indices),
  [[0, 7], [2, 6], [4, 6], [4, 6]]);

const eightScalars = 'A' + eAcute + 'BC' + eCircumflex + 'ABC';
const upperBound = /p=(([A-C\u00e9-\u00eb]){8})z/du.exec(
  'p=' + eightScalars + 'z');
assert.notStrictEqual(upperBound, null);
assert.deepStrictEqual(
  Array.from(upperBound.indices), [[0, 13], [2, 12], [11, 12]]);

const lazySpelling = /k=(([A-C\u00e9-\u00eb]){2}?)xy/du.exec(
  'k=' + eAcute + eCircumflex + 'xy');
assert.notStrictEqual(lazySpelling, null);
assert.deepStrictEqual(
  Array.from(lazySpelling.indices), [[0, 8], [2, 6], [4, 6]]);

const malformedSubject = raw(
  0x80, 0x6b, 0x3d, 0xc3, 0xa9, 0xc3, 0xaa, 0x78, 0x79);
const malformed = /k=(([A-C\u00e9-\u00eb]){2})xy/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assert.notStrictEqual(malformedMatch, null);
assert.deepStrictEqual(
  Array.from(malformedMatch.indices), [[1, 9], [3, 7], [5, 7]]);
assert.strictEqual(malformed.lastIndex, 9);

const all = Array.from(
  ('k=' + eAcute + eCircumflex + 'xyk=A' + eAcute + 'xy').matchAll(
    /k=(([A-C\u00e9-\u00eb]){2})xy/dgu));
assert.deepStrictEqual(
  all.map((match) => match.indices[0]), [[0, 8], [8, 15]]);
assert.deepStrictEqual(
  all.map((match) => match.indices[1]), [[2, 6], [10, 13]]);
assert.deepStrictEqual(
  all.map((match) => match.indices[2]), [[4, 6], [11, 13]]);

assert.strictEqual(('key=' + eAcute + eCircumflex + '\r\n').replace(
  /key=(([A-C\u00e9-\u00eb]){2})\r\n/gu,
  common.mustCall((match, outer, inner) => {
    assert.deepStrictEqual(bytes(outer), bytes(eAcute + eCircumflex));
    assert.deepStrictEqual(bytes(inner), bytes(eCircumflex));
    return 'Y';
  })), 'Y');

// Complete mixed exact patterns retain their existing executor.
const complete = /(([A-C\u00e9-\u00eb]){2})/du.exec(
  eAcute + eCircumflex);
assert.deepStrictEqual(
  Array.from(complete.indices), [[0, 4], [0, 4], [2, 4]]);

// Pure outer exact prefix-tail patterns retain the preceding generated tree.
const pureOuter = /(([A-C\u00e9-\u00eb]{2}))xy/du.exec(
  eAcute + eCircumflex + 'xy');
assert.deepStrictEqual(
  Array.from(pureOuter.indices), [[0, 6], [0, 4], [0, 4]]);
