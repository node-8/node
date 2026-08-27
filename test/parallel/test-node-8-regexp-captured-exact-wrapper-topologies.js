// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => (value === undefined ? undefined :
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const subject = eAcute + cjk + emoji + 'a' + eCircumflex + 'b';

const outerPairs = Array.from(subject.matchAll(/([^^]{2})/dgu));
assert.deepStrictEqual(
  outerPairs.map((match) => match.indices[0]),
  [[0, 5], [5, 10], [10, 13]]);
assert.deepStrictEqual(
  outerPairs.map((match) => match.indices[1]),
  outerPairs.map((match) => match.indices[0]));

const named = /(?<run>(?<part>[^^]){3}?)/du.exec(subject);
assert.notStrictEqual(named, null);
assert.deepStrictEqual(bytes(named[0]), bytes(eAcute + cjk + emoji));
assert.deepStrictEqual(bytes(named.groups.run), bytes(named[0]));
assert.deepStrictEqual(bytes(named.groups.part), bytes(emoji));
assert.deepStrictEqual(named.indices[0], [0, 9]);
assert.deepStrictEqual(named.indices.groups.run, [0, 9]);
assert.deepStrictEqual(named.indices.groups.part, [5, 9]);

const nested = /(((?<part>[^^])){5})/du.exec(subject);
assert.notStrictEqual(nested, null);
assert.deepStrictEqual(
  bytes(nested[0]), bytes(eAcute + cjk + emoji + 'a' + eCircumflex));
assert.deepStrictEqual(bytes(nested[1]), bytes(nested[0]));
for (let capture = 2; capture <= 3; capture++) {
  assert.deepStrictEqual(bytes(nested[capture]), bytes(eCircumflex));
  assert.deepStrictEqual(nested.indices[capture], [10, 12]);
}
assert.deepStrictEqual(nested.indices[1], [0, 12]);
assert.deepStrictEqual(nested.indices.groups.part, [10, 12]);

const positive = /([é-ë]{2})/du.exec(cjk + eAcute + eCircumflex);
assert.notStrictEqual(positive, null);
assert.deepStrictEqual(bytes(positive[0]), bytes(eAcute + eCircumflex));
assert.deepStrictEqual(bytes(positive[1]), bytes(positive[0]));
assert.deepStrictEqual(Array.from(positive.indices), [[3, 7], [3, 7]]);

const replacementCalls = [];
assert.strictEqual(subject.replace(
  /(([^^]){2})/gu,
  common.mustCall((match, outer, inner, offset) => {
    replacementCalls.push(
      [offset, bytes(match), bytes(outer), bytes(inner)]);
    return 'X';
  }, 3)), 'XXX');
assert.deepStrictEqual(replacementCalls, [
  [0, bytes(eAcute + cjk), bytes(eAcute + cjk), bytes(cjk)],
  [5, bytes(emoji + 'a'), bytes(emoji + 'a'), bytes('a')],
  [10, bytes(eCircumflex + 'b'),
   bytes(eCircumflex + 'b'), bytes('b')],
]);

const sticky = /(([^^]){3})/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + 'a');
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(
  bytes(continuation[0]), [0xa9, 0xe4, 0xb8, 0xad, 0x61]);
assert.deepStrictEqual(bytes(continuation[1]), bytes(continuation[0]));
assert.deepStrictEqual(bytes(continuation[2]), bytes('a'));
assert.deepStrictEqual(
  Array.from(continuation.indices), [[1, 6], [1, 6], [5, 6]]);
assert.strictEqual(sticky.lastIndex, 6);

sticky.lastIndex = 2;
assert.strictEqual(sticky.exec(eAcute + '^'), null);
assert.strictEqual(sticky.lastIndex, 0);

const malformed = /((([^^]){3}))/du.exec(
  raw(0x61, 0xe2, 0x82, 0x62));
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0x61, 0xe2, 0x82, 0x62]);
assert.deepStrictEqual(bytes(malformed[1]), bytes(malformed[0]));
assert.deepStrictEqual(bytes(malformed[2]), bytes(malformed[0]));
assert.deepStrictEqual(bytes(malformed[3]), [0x62]);
assert.deepStrictEqual(
  Array.from(malformed.indices),
  [[0, 4], [0, 4], [0, 4], [3, 4]]);
