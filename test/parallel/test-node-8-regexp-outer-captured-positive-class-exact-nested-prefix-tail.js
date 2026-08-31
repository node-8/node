// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => Array.from(
  { length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);

const nested = /(([A-C\u00e9-\u00eb]{2}))xy/du.exec(
  eAcute + eCircumflex + 'xy');
assert.notStrictEqual(nested, null);
assert.deepStrictEqual(bytes(nested[1]), bytes(eAcute + eCircumflex));
assert.deepStrictEqual(bytes(nested[2]), bytes(nested[1]));
assert.deepStrictEqual(
  Array.from(nested.indices), [[0, 6], [0, 4], [0, 4]]);
assert.strictEqual(
  /(([A-C\u00e9-\u00eb]{2}))xy/du.exec(eAcute + 'xy'), null);

const triple = /x=((([A-C\u00e9-\u00eb]{2})))y/du.exec(
  'x=' + eAcute + eCircumflex + 'y');
assert.notStrictEqual(triple, null);
assert.deepStrictEqual(
  Array.from(triple.indices), [[0, 7], [2, 6], [2, 6], [2, 6]]);

const named = /id=((?<value>[A-C\u00e9-\u00eb]{3}))xy/du.exec(
  'id=A' + eAcute + eCircumflex + 'xy');
assert.notStrictEqual(named, null);
assert.deepStrictEqual(bytes(named[1]), bytes('A' + eAcute + eCircumflex));
assert.deepStrictEqual(bytes(named[2]), bytes(named[1]));
assert.deepStrictEqual(bytes(named.groups.value), bytes(named[2]));
assert.deepStrictEqual(
  Array.from(named.indices), [[0, 10], [3, 8], [3, 8]]);
assert.deepStrictEqual(named.indices.groups.value, [3, 8]);

const eightScalars = 'A' + eAcute + 'BC' + eCircumflex + 'ABC';
const upperBound = /p=(([A-C\u00e9-\u00eb]{8}))z/du.exec(
  'p=' + eightScalars + 'z');
assert.notStrictEqual(upperBound, null);
assert.deepStrictEqual(
  Array.from(upperBound.indices), [[0, 13], [2, 12], [2, 12]]);

const lazySpelling = /k=(([A-C\u00e9-\u00eb]{2}?))xy/du.exec(
  'k=' + eAcute + eCircumflex + 'xy');
assert.notStrictEqual(lazySpelling, null);
assert.deepStrictEqual(
  Array.from(lazySpelling.indices), [[0, 8], [2, 6], [2, 6]]);

const malformedSubject = raw(
  0x80, 0x6b, 0x3d, 0xc3, 0xa9, 0xc3, 0xaa, 0x78, 0x79);
const malformed = /k=(([A-C\u00e9-\u00eb]{2}))xy/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assert.notStrictEqual(malformedMatch, null);
assert.deepStrictEqual(
  Array.from(malformedMatch.indices), [[1, 9], [3, 7], [3, 7]]);
assert.strictEqual(malformed.lastIndex, 9);

const all = Array.from(
  ('k=' + eAcute + eCircumflex + 'xyk=A' + eAcute + 'xy').matchAll(
    /k=(([A-C\u00e9-\u00eb]{2}))xy/dgu));
assert.deepStrictEqual(
  all.map((match) => match.indices[0]), [[0, 8], [8, 15]]);
for (let capture = 1; capture <= 2; ++capture) {
  assert.deepStrictEqual(
    all.map((match) => match.indices[capture]), [[2, 6], [10, 13]]);
}

assert.strictEqual(('key=' + eAcute + eCircumflex + '\r\n').replace(
  /key=(([A-C\u00e9-\u00eb]{2}))\r\n/gu,
  common.mustCall((match, outer, inner) => {
    assert.deepStrictEqual(bytes(outer), bytes(eAcute + eCircumflex));
    assert.deepStrictEqual(bytes(inner), bytes(outer));
    return 'Y';
  })), 'Y');

// Complete nested exact patterns retain their existing executor.
const complete = /(([A-C\u00e9-\u00eb]{2}))/du.exec(
  eAcute + eCircumflex);
assert.deepStrictEqual(
  Array.from(complete.indices), [[0, 4], [0, 4], [0, 4]]);
