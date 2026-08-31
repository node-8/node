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
const tail9 = '123456789';
const tail16 = '1234567890abcdef';
const tail17 = '1234567890abcdefg';
const prefix9 = 'prefix-09';
const prefix16 = 'prefix-123456789';
const prefix17 = 'prefix-1234567890';

function assertMatchIndices(expected, regexp, subject) {
  const match = regexp.exec(subject);
  assert.notStrictEqual(match, null);
  assert.deepStrictEqual(Array.from(match.indices), expected);
  return match;
}

// Pure-outer medium atoms retain the old selector behavior.
assert.strictEqual(
  /(([A-C\u00e9-\u00eb]+))123456789/du.exec(
    eAcute + eCircumflex + tail9),
  null);
assert.strictEqual(
  /prefix-123456789(([A-C\u00e9-\u00eb]{1,3}?))1234567890abcdef/du
    .exec(prefix16 + eAcute + eCircumflex + tail16),
  null);

// Body-only captures keep the final scalar. Mixed captures also keep the
// complete field in the outer capture.
assertMatchIndices(
  [[0, 13], [2, 4]],
  /([A-C\u00e9-\u00eb])+123456789/du,
  eAcute + eCircumflex + tail9);
assertMatchIndices(
  [[0, 20], [0, 4], [2, 4]],
  /(([A-C\u00e9-\u00eb]){1,3})1234567890abcdef/du,
  eAcute + eCircumflex + tail16);
assertMatchIndices(
  [[0, 20], [0, 4], [2, 4]],
  /(([A-C\u00e9-\u00eb]){1,3}?)1234567890abcdef/du,
  eAcute + eCircumflex + tail16);
assertMatchIndices(
  [[0, 13], [2, 4]],
  /([A-C\u00e9-\u00eb]){2}123456789/du,
  eAcute + eCircumflex + tail9);
assertMatchIndices(
  [[0, 20], [0, 4], [2, 4]],
  /(([A-C\u00e9-\u00eb]){2})1234567890abcdef/du,
  eAcute + eCircumflex + tail16);
assertMatchIndices(
  [[0, 15], [9, 13], [11, 13]],
  /prefix-09(([A-C\u00e9-\u00eb])+)xy/du,
  prefix9 + eAcute + eCircumflex + 'xy');
assertMatchIndices(
  [[0, 36], [16, 20], [18, 20]],
  /prefix-123456789(([A-C\u00e9-\u00eb]){1,3}?)1234567890abcdef/du,
  prefix16 + eAcute + eCircumflex + tail16);

const named = assertMatchIndices(
  [[0, 22], [9, 13], [9, 13], [11, 13]],
  /prefix-09(?<field>((?<part>[A-C\u00e9-\u00eb]){1,3}))123456789/du,
  prefix9 + eAcute + eCircumflex + tail9);
assert.deepStrictEqual(bytes(named.groups.field), bytes(named[1]));
assert.deepStrictEqual(bytes(named.groups.part), bytes(named[3]));
assert.deepStrictEqual(named.indices.groups.field, named.indices[1]);
assert.deepStrictEqual(named.indices.groups.part, named.indices[3]);

// Greedy matching must leave an overlapping ASCII byte for the tail.
assertMatchIndices(
  [[0, 12], [0, 3], [2, 3]],
  /(([A-C1\u00e9]){1,3})123456789/du,
  eAcute + '1' + tail9);

const malformedSubject = raw(
  0x80, ...bytes(prefix9), 0xc3, 0xa9, ...bytes(tail9));
const malformed = /prefix-09([A-C\u00e9-\u00eb]){1,3}123456789/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assert.notStrictEqual(malformedMatch, null);
assert.deepStrictEqual(
  Array.from(malformedMatch.indices), [[1, 21], [10, 12]]);
assert.strictEqual(malformed.lastIndex, 21);

const chunk = prefix9 + 'A' + eAcute + 'B' + tail9;
const matches = Array.from(chunk.repeat(100).matchAll(
  /prefix-09(([A-C\u00e9-\u00eb]){1,3})123456789/dgu));
assert.strictEqual(matches.length, 100);
for (let index = 0; index < matches.length; ++index) {
  const start = index * chunk.length;
  assert.deepStrictEqual(Array.from(matches[index].indices), [
    [start, start + 22],
    [start + 9, start + 13],
    [start + 12, start + 13],
  ]);
}

assert.strictEqual(
  (prefix9 + eAcute + eCircumflex + tail9).replace(
    /prefix-09(([A-C\u00e9-\u00eb])+)123456789/gu,
    common.mustCall((match, field, part, offset) => {
      assert.strictEqual(offset, 0);
      assert.deepStrictEqual(bytes(field), bytes(eAcute + eCircumflex));
      assert.deepStrictEqual(bytes(part), bytes(eCircumflex));
      return 'Y';
    })),
  'Y');

// The old 8-byte boundary remains supported; the long-ASCII extension handles
// the former 17-byte controls.
assertMatchIndices(
  [[0, 12], [0, 4], [0, 4]],
  /(([A-C\u00e9-\u00eb]+))12345678/du,
  eAcute + eCircumflex + '12345678');
assertMatchIndices(
  [[0, 21], [0, 4], [2, 4]],
  /(([A-C\u00e9-\u00eb])+)1234567890abcdefg/du,
  eAcute + eCircumflex + tail17);
assertMatchIndices(
  [[0, 23], [17, 21], [19, 21]],
  /prefix-1234567890(([A-C\u00e9-\u00eb])+)xy/du,
  prefix17 + eAcute + eCircumflex + 'xy');
assertMatchIndices(
  [[0, 13], [0, 4], [2, 4]],
  /(([A-C\u00e9-\u00eb]){1,9})123456789/du,
  eAcute + eCircumflex + tail9);
assert.strictEqual(
  /(([A-C\u00e9-\u00eb])+)\u4e2d/du.exec(eAcute + eCircumflex + cjk),
  null);
assert.strictEqual(
  /(([A-C\u00e9-\u00eb])+)123456789/duy.exec(
    eAcute + eCircumflex + tail9),
  null);
assert.strictEqual(
  /(([a-c\u00e9-\u00eb])+)123456789/dui.exec(
    eAcute + eCircumflex + tail9),
  null);
