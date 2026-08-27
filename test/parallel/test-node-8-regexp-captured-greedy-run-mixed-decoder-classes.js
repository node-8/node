// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => (value === undefined ? undefined :
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const eDiaeresis = String.fromCodePoint(0xeb);
const iGrave = String.fromCodePoint(0xec);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const emojiOne = String.fromCodePoint(0x1f601);

const ordinary = /(([\u00e9-\u00eb])+)/du.exec(
  eAcute + eCircumflex + 'x');
assert.notStrictEqual(ordinary, null);
assert.deepStrictEqual(bytes(ordinary[0]), bytes(eAcute + eCircumflex));
assert.deepStrictEqual(bytes(ordinary[1]), bytes(ordinary[0]));
assert.deepStrictEqual(bytes(ordinary[2]), bytes(eCircumflex));
assert.deepStrictEqual(
  Array.from(ordinary.indices), [[0, 4], [0, 4], [2, 4]]);

const edgeSubject =
  `AD${eAcute}${eDiaeresis}${iGrave}${cjk}${emoji}${emojiOne}x`;
const edgeMatches = Array.from(edgeSubject.matchAll(
  /(([A-C\u00e9-\u00eb\u4e2d\u{1f600}-\u{1f601}])+)/dgu));
assert.deepStrictEqual(
  edgeMatches.map((match) => match.indices[0]), [[0, 1], [2, 6], [8, 19]]);
assert.deepStrictEqual(
  edgeMatches.map((match) => match.indices[1]),
  edgeMatches.map((match) => match.indices[0]));
assert.deepStrictEqual(
  edgeMatches.map((match) => match.indices[2]), [[0, 1], [4, 6], [15, 19]]);

const named = /(?<run>(?<part>[A-C\u00e9\u{1f600}])*)/du.exec(
  `B${eAcute}${emoji}x`);
assert.notStrictEqual(named, null);
assert.deepStrictEqual(bytes(named[0]), bytes(`B${eAcute}${emoji}`));
assert.deepStrictEqual(bytes(named.groups.run), bytes(named[0]));
assert.deepStrictEqual(bytes(named.groups.part), bytes(emoji));
assert.deepStrictEqual(named.indices[0], [0, 7]);
assert.deepStrictEqual(named.indices.groups.run, [0, 7]);
assert.deepStrictEqual(named.indices.groups.part, [3, 7]);

const empty = /(?<run>(?<part>[A-C\u00e9\u{1f600}])*)/duy;
empty.lastIndex = 7;
const emptyMatch = empty.exec(`B${eAcute}${emoji}x`);
assert.notStrictEqual(emptyMatch, null);
assert.strictEqual(emptyMatch[0], '');
assert.strictEqual(emptyMatch.groups.run, '');
assert.strictEqual(emptyMatch.groups.part, undefined);
assert.deepStrictEqual(emptyMatch.indices[0], [7, 7]);
assert.deepStrictEqual(emptyMatch.indices.groups.run, [7, 7]);
assert.strictEqual(emptyMatch.indices.groups.part, undefined);

const broaderNegated = /(((?<part>[^\u0080-\u009f])+))/du.exec(
  eAcute + eCircumflex + String.fromCodePoint(0x80));
assert.notStrictEqual(broaderNegated, null);
assert.deepStrictEqual(bytes(broaderNegated[0]),
                       bytes(eAcute + eCircumflex));
for (let capture = 1; capture <= 2; capture++) {
  assert.deepStrictEqual(bytes(broaderNegated[capture]),
                         bytes(broaderNegated[0]));
  assert.deepStrictEqual(broaderNegated.indices[capture], [0, 4]);
}
assert.deepStrictEqual(bytes(broaderNegated[3]), bytes(eCircumflex));
assert.deepStrictEqual(broaderNegated.indices[3], [2, 4]);

const malformedValue = raw(0x80, 0xff, 0x61, 0xe2, 0x82, 0x62);
const malformed = Array.from(malformedValue.matchAll(/(([\uFFFD])+)/dgu));
assert.deepStrictEqual(
  malformed.map((match) => match.indices[0]), [[0, 2], [3, 5]]);
assert.deepStrictEqual(
  malformed.map((match) => match.indices[1]),
  malformed.map((match) => match.indices[0]));
assert.deepStrictEqual(
  malformed.map((match) => match.indices[2]), [[1, 2], [3, 5]]);
assert.deepStrictEqual(
  malformed.map((match) => bytes(match[0])),
  [[0x80, 0xff], [0xe2, 0x82]]);

const literalReplacement = /(([\uFFFD])+)/du.exec(
  String.fromCodePoint(0xfffd));
assert.notStrictEqual(literalReplacement, null);
for (let capture = 0; capture <= 2; capture++) {
  assert.deepStrictEqual(bytes(literalReplacement[capture]),
                         [0xef, 0xbf, 0xbd]);
  assert.deepStrictEqual(literalReplacement.indices[capture], [0, 3]);
}

const replacementCalls = [];
assert.strictEqual(edgeSubject.replace(
  /(([A-C\u00e9-\u00eb\u4e2d\u{1f600}-\u{1f601}])+)/gu,
  common.mustCall((match, outer, inner, offset) => {
    replacementCalls.push([offset, bytes(match), bytes(outer), bytes(inner)]);
    return 'X';
  }, 3)), `XDX${iGrave}Xx`);
assert.deepStrictEqual(replacementCalls, [
  [0, bytes('A'), bytes('A'), bytes('A')],
  [2, bytes(eAcute + eDiaeresis), bytes(eAcute + eDiaeresis),
   bytes(eDiaeresis)],
  [8, bytes(cjk + emoji + emojiOne), bytes(cjk + emoji + emojiOne),
   bytes(emojiOne)],
]);

const stickyReplacement = /(([\uFFFD])+)/duy;
stickyReplacement.lastIndex = 1;
const continuation = stickyReplacement.exec(eAcute);
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(bytes(continuation[0]), [0xa9]);
assert.deepStrictEqual(
  Array.from(continuation.indices), [[1, 2], [1, 2], [1, 2]]);
assert.strictEqual(stickyReplacement.lastIndex, 2);
