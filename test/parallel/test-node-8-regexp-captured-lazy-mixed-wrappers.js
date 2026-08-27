// Flags: --experimental-node-8-string-semantics
'use strict';

/* eslint-disable regexp/no-lazy-ends */

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => (value === undefined ? undefined :
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const subject = eAcute + cjk + emoji + 'a' + eCircumflex;

const ordinary = Array.from(subject.matchAll(/(([^^]){1,2}?)/dgu));
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[0]),
  [[0, 2], [2, 5], [5, 9], [9, 10], [10, 12]]);
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[1]),
  ordinary.map((match) => match.indices[0]));
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[2]),
  ordinary.map((match) => match.indices[0]));

const named = /(?<run>(?<part>[^^]){2,3}?)/du.exec(subject);
assert.notStrictEqual(named, null);
assert.deepStrictEqual(bytes(named[0]), bytes(eAcute + cjk));
assert.deepStrictEqual(bytes(named.groups.run), bytes(named[0]));
assert.deepStrictEqual(bytes(named.groups.part), bytes(cjk));
assert.deepStrictEqual(named.indices[0], [0, 5]);
assert.deepStrictEqual(named.indices.groups.run, [0, 5]);
assert.deepStrictEqual(named.indices.groups.part, [2, 5]);

const nestedOpen = /(((?<part>[^^])){2,}?)/du.exec(subject);
assert.notStrictEqual(nestedOpen, null);
assert.deepStrictEqual(bytes(nestedOpen[0]), bytes(eAcute + cjk));
assert.deepStrictEqual(bytes(nestedOpen[1]), bytes(nestedOpen[0]));
for (let capture = 2; capture <= 3; capture++) {
  assert.deepStrictEqual(bytes(nestedOpen[capture]), bytes(cjk));
  assert.deepStrictEqual(nestedOpen.indices[capture], [2, 5]);
}
assert.deepStrictEqual(nestedOpen.indices[1], [0, 5]);

const empty = Array.from(
  (eAcute + cjk).matchAll(/(([^^]){0,3}?)/dgu));
assert.deepStrictEqual(
  empty.map((match) => match.indices[0]),
  [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
assert.deepStrictEqual(
  empty.map((match) => match.indices[1]),
  empty.map((match) => match.indices[0]));
assert.deepStrictEqual(
  empty.map((match) => match.indices[2]),
  [undefined, undefined, undefined, undefined, undefined, undefined]);

const replacementCalls = [];
assert.strictEqual(subject.replace(
  /(([^^]){1,2}?)/gu,
  common.mustCall((match, outer, inner, offset) => {
    replacementCalls.push(
      [offset, bytes(match), bytes(outer), bytes(inner)]);
    return 'X';
  }, 5)), 'XXXXX');
assert.deepStrictEqual(replacementCalls, [
  [0, bytes(eAcute), bytes(eAcute), bytes(eAcute)],
  [2, bytes(cjk), bytes(cjk), bytes(cjk)],
  [5, bytes(emoji), bytes(emoji), bytes(emoji)],
  [9, bytes('a'), bytes('a'), bytes('a')],
  [10, bytes(eCircumflex), bytes(eCircumflex), bytes(eCircumflex)],
]);

const sticky = /(([^^]){2,3}?)/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + 'a');
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(
  bytes(continuation[0]), [0xa9, 0xe4, 0xb8, 0xad]);
assert.deepStrictEqual(bytes(continuation[1]), bytes(continuation[0]));
assert.deepStrictEqual(bytes(continuation[2]), bytes(cjk));
assert.deepStrictEqual(
  Array.from(continuation.indices), [[1, 5], [1, 5], [2, 5]]);
assert.strictEqual(sticky.lastIndex, 5);

sticky.lastIndex = 2;
assert.strictEqual(sticky.exec(eAcute + '^'), null);
assert.strictEqual(sticky.lastIndex, 0);

const malformed = /((([^^]){2,3}?))/du.exec(
  raw(0x61, 0xe2, 0x82, 0x62));
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0x61, 0xe2, 0x82]);
assert.deepStrictEqual(bytes(malformed[1]), bytes(malformed[0]));
assert.deepStrictEqual(bytes(malformed[2]), bytes(malformed[0]));
assert.deepStrictEqual(bytes(malformed[3]), [0xe2, 0x82]);
assert.deepStrictEqual(
  Array.from(malformed.indices),
  [[0, 3], [0, 3], [0, 3], [1, 3]]);
