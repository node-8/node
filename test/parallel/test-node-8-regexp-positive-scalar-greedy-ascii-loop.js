// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => Array.from(
  { length: value.length }, (_, index) => value.charCodeAt(index));
const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);

function assertMatchIndices(expected, regexp, subject) {
  const match = regexp.exec(subject);
  assert.notStrictEqual(match, null);
  assert.deepStrictEqual(Array.from(match.indices), expected);
  return match;
}

const greedy = assertMatchIndices(
  [[0, 6], [0, 4]],
  /([A-C\u00e9-\u00eb]+)xy/du,
  eAcute + eCircumflex + 'xy');
assert.deepStrictEqual(bytes(greedy[1]), bytes(eAcute + eCircumflex));

assertMatchIndices(
  [[0, 6], [0, 4], [0, 4]],
  /(([A-C\u00e9-\u00eb]+))xy/du,
  eAcute + eCircumflex + 'xy');
assertMatchIndices(
  [[0, 9], [3, 7], [3, 7]],
  /id=(([A-C\u00e9-\u00eb]+?))xy/du,
  'id=' + eAcute + eCircumflex + 'xy');

const named = assertMatchIndices(
  [[0, 7], [2, 6], [2, 6], [2, 6]],
  /p=(?<field>(([A-C\u00e9-\u00eb]+?)))z/du,
  'p=' + eAcute + eCircumflex + 'z');
assert.deepStrictEqual(bytes(named.groups.field), bytes(named[1]));
assert.deepStrictEqual(named.indices.groups.field, named.indices[1]);

assertMatchIndices(
  [[0, 2], [0, 0], [0, 0]],
  /(([A-C\u00e9-\u00eb]*))xy/du,
  'xy');
assertMatchIndices(
  [[0, 7], [0, 5], [0, 5]],
  /(([A-C\u00e9-\u00eb]{2,}))xy/du,
  'A' + eAcute + eCircumflex + 'xy');

const transitions = [
  ['ABCxy', [[0, 5], [0, 3], [0, 3]]],
  [eAcute + 'ABxy', [[0, 6], [0, 4], [0, 4]]],
  ['A' + eAcute + 'Bxy', [[0, 6], [0, 4], [0, 4]]],
  ['AB' + eAcute + 'xy', [[0, 6], [0, 4], [0, 4]]],
  [
    'A' + eAcute + 'B' + eCircumflex + 'Cxy',
    [[0, 9], [0, 7], [0, 7]],
  ],
];
for (const [subject, expected] of transitions) {
  assertMatchIndices(
    expected,
    /(([A-C\u00e9-\u00eb]+))xy/du,
    subject);
}
assertMatchIndices(
  [[0, 8], [0, 6], [0, 6]],
  /(([A-Cx\u00e9]+))xy/du,
  'AB' + eAcute + 'xxxy');

const malformedSubject = raw(
  0x80, 0x6b, 0x3d, 0xc3, 0xa9, 0xc3, 0xaa, 0x78, 0x79);
const malformed = /k=([A-C\u00e9-\u00eb]+)xy/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assert.notStrictEqual(malformedMatch, null);
assert.deepStrictEqual(
  Array.from(malformedMatch.indices), [[1, 9], [3, 7]]);
assert.strictEqual(malformed.lastIndex, 9);

const chunk = 'k=A' + eAcute + 'Bxy';
const matches = Array.from(chunk.repeat(200).matchAll(
  /k=(([A-C\u00e9-\u00eb]+))xy/dgu));
assert.strictEqual(matches.length, 200);
for (let index = 0; index < matches.length; ++index) {
  const start = index * chunk.length;
  assert.deepStrictEqual(Array.from(matches[index].indices), [
    [start, start + 8],
    [start + 2, start + 6],
    [start + 2, start + 6],
  ]);
}

assert.strictEqual(
  ('key=' + eAcute + eCircumflex + '\r\n').replace(
    /key=([A-C\u00e9-\u00eb]+)\r\n/gu,
    common.mustCall((match, field, offset) => {
      assert.strictEqual(offset, 0);
      assert.deepStrictEqual(bytes(field), bytes(eAcute + eCircumflex));
      return 'Y';
    })),
  'Y');

// The compiler optimization also applies to a complete pure-outer loop.
assertMatchIndices(
  [[0, 5], [0, 5], [0, 5]],
  /(([A-C\u00e9-\u00eb]+))/du,
  'A' + eAcute + eCircumflex);

// These selectors remain outside the node-8 rewrite.
assert.strictEqual(
  /([A-C\u00e9-\u00eb]+)123456789/du.exec(
    eAcute + eCircumflex + '123456789'),
  null);
assert.strictEqual(
  /([A-C\u00e9-\u00eb]+)xy/duy.exec(eAcute + eCircumflex + 'xy'),
  null);
assert.strictEqual(
  /([a-c\u00e9-\u00eb]+)xy/dui.exec(eAcute + eCircumflex + 'xy'),
  null);
