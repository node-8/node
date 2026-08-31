// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => Array.from(
  { length: value.length }, (_, index) => value.charCodeAt(index));
const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const cjk = String.fromCodePoint(0x4e2d);

function assertMatchIndices(expected, regexp, subject) {
  const match = regexp.exec(subject);
  assert.notStrictEqual(match, null);
  assert.deepStrictEqual(Array.from(match.indices), expected);
  return match;
}

assertMatchIndices(
  [[0, 6], [2, 4]],
  /([A-C\u00e9-\u00eb]){1,20}xy/du,
  eAcute + eCircumflex + 'xy');
assertMatchIndices(
  [[0, 6], [0, 4], [2, 4]],
  /(([A-C\u00e9-\u00eb]){1,20})xy/du,
  eAcute + eCircumflex + 'xy');
assertMatchIndices(
  [[0, 6], [0, 4], [2, 4]],
  /(([A-C\u00e9-\u00eb]){1,20}?)xy/du,
  eAcute + eCircumflex + 'xy');

const nineScalars = 'A' + eAcute + 'BC' + eCircumflex + 'ABCA';
assertMatchIndices(
  [[0, 14], [2, 13], [12, 13]],
  /p=(([A-C\u00e9-\u00eb]){9,20})z/du,
  'p=' + nineScalars + 'z');
assertMatchIndices(
  [[0, 26], [0, 24], [22, 24]],
  /(([A-C\u00e9-\u00eb]){1,100})xy/du,
  (eAcute + eCircumflex).repeat(6) + 'xy');

const prefix = 'prefix-123456789';
const tail = '1234567890abcdef';
assertMatchIndices(
  [[0, 36], [16, 20], [18, 20]],
  /prefix-123456789(([A-C\u00e9-\u00eb]){1,20})1234567890abcdef/du,
  prefix + eAcute + eCircumflex + tail);

const named = assertMatchIndices(
  [[0, 11], [4, 8], [4, 8], [6, 8]],
  /key=(?<field>((?<part>[A-C\u00e9-\u00eb]){1,20}))END/du,
  'key=' + eAcute + eCircumflex + 'END');
assert.deepStrictEqual(bytes(named.groups.field), bytes(named[1]));
assert.deepStrictEqual(bytes(named.groups.part), bytes(named[3]));
assert.deepStrictEqual(named.indices.groups.field, named.indices[1]);
assert.deepStrictEqual(named.indices.groups.part, named.indices[3]);

assertMatchIndices(
  [[0, 12], [0, 3], [2, 3]],
  /(([A-C1\u00e9]){1,20})123456789/du,
  eAcute + '1123456789');
assert.strictEqual(
  /(([A-C\u00e9-\u00eb]){9,20})xy/du.exec(
    eAcute + eCircumflex + 'xy'),
  null);

const malformedSubject = raw(
  0x80, 0x6b, 0x65, 0x79, 0x3d, 0xc3, 0xa9, 0x45, 0x4e, 0x44);
const malformed = /key=([A-C\u00e9-\u00eb]){1,20}END/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assert.notStrictEqual(malformedMatch, null);
assert.deepStrictEqual(
  Array.from(malformedMatch.indices), [[1, 10], [5, 7]]);
assert.strictEqual(malformed.lastIndex, 10);

const chunk = 'key=A' + eAcute + 'BEND';
const matches = Array.from(chunk.repeat(100).matchAll(
  /key=(([A-C\u00e9-\u00eb]){1,20})END/dgu));
assert.strictEqual(matches.length, 100);
for (let index = 0; index < matches.length; ++index) {
  const start = index * chunk.length;
  assert.deepStrictEqual(Array.from(matches[index].indices), [
    [start, start + 11],
    [start + 4, start + 8],
    [start + 7, start + 8],
  ]);
}

assert.strictEqual(
  ('key=' + eAcute + eCircumflex + 'END').replace(
    /key=(([A-C\u00e9-\u00eb]){1,20})END/gu,
    common.mustCall((match, field, part, offset) => {
      assert.strictEqual(offset, 0);
      assert.deepStrictEqual(bytes(field), bytes(eAcute + eCircumflex));
      assert.deepStrictEqual(bytes(part), bytes(eCircumflex));
      return 'Y';
    })),
  'Y');

// Existing and adjacent excluded selectors remain unchanged.
assertMatchIndices(
  [[0, 6], [0, 4], [2, 4]],
  /(([A-C\u00e9-\u00eb]){1,8})xy/du,
  eAcute + eCircumflex + 'xy');
assert.strictEqual(
  /(([A-C\u00e9-\u00eb]{1,20}))xy/du.exec(
    eAcute + eCircumflex + 'xy'),
  null);
assert.strictEqual(
  /(([A-C\u00e9-\u00eb]){20})xy/du.exec(
    (eAcute + eCircumflex).repeat(10) + 'xy'),
  null);
assert.strictEqual(
  /(([A-C\u00e9-\u00eb]){1,20})1234567890abcdefg/du.exec(
    eAcute + eCircumflex + '1234567890abcdefg'),
  null);
assert.strictEqual(
  /(([A-C\u00e9-\u00eb]){1,20})\u4e2d/du.exec(
    eAcute + eCircumflex + cjk),
  null);
assert.strictEqual(
  /(([A-C\u00e9-\u00eb]){1,20})xy/duy.exec(
    eAcute + eCircumflex + 'xy'),
  null);
assert.strictEqual(
  /(([a-c\u00e9-\u00eb]){1,20})xy/dui.exec(
    eAcute + eCircumflex + 'xy'),
  null);
