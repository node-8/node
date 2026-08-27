// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => (value === undefined ? undefined :
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)));

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const subject = eAcute + cjk + '^' + emoji + 'a';

const ordinary = Array.from(subject.matchAll(/(([^^])+)/dgu));
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[0]), [[0, 5], [6, 11]]);
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[1]),
  ordinary.map((match) => match.indices[0]));
assert.deepStrictEqual(
  ordinary.map((match) => match.indices[2]), [[2, 5], [10, 11]]);
assert.deepStrictEqual(
  ordinary.map((match) => bytes(match[2])), [bytes(cjk), bytes('a')]);

const named = /(?<run>(?<part>[^^])*)/du.exec(eAcute + cjk + '^');
assert.notStrictEqual(named, null);
assert.deepStrictEqual(bytes(named[0]), bytes(eAcute + cjk));
assert.deepStrictEqual(bytes(named.groups.run), bytes(named[0]));
assert.deepStrictEqual(bytes(named.groups.part), bytes(cjk));
assert.deepStrictEqual(named.indices[0], [0, 5]);
assert.deepStrictEqual(named.indices.groups.run, [0, 5]);
assert.deepStrictEqual(named.indices.groups.part, [2, 5]);

const empty = /(?<run>(?<part>[^^])*)/duy;
empty.lastIndex = 5;
const emptyMatch = empty.exec(eAcute + cjk + '^');
assert.notStrictEqual(emptyMatch, null);
assert.strictEqual(emptyMatch[0], '');
assert.strictEqual(emptyMatch.groups.run, '');
assert.strictEqual(emptyMatch.groups.part, undefined);
assert.deepStrictEqual(emptyMatch.indices[0], [5, 5]);
assert.deepStrictEqual(emptyMatch.indices.groups.run, [5, 5]);
assert.strictEqual(emptyMatch.indices.groups.part, undefined);
assert.strictEqual(empty.lastIndex, 5);

const nested = /(((?<part>[^^])+))/du.exec(eAcute + cjk);
assert.notStrictEqual(nested, null);
for (let capture = 0; capture <= 2; capture++) {
  assert.deepStrictEqual(bytes(nested[capture]), bytes(eAcute + cjk));
  assert.deepStrictEqual(nested.indices[capture], [0, 5]);
}
assert.deepStrictEqual(bytes(nested[3]), bytes(cjk));
assert.deepStrictEqual(nested.indices[3], [2, 5]);
assert.deepStrictEqual(nested.indices.groups.part, [2, 5]);

const replacementCalls = [];
assert.strictEqual(subject.replace(
  /(([^^])+)/gu,
  common.mustCall((match, outer, inner, offset) => {
    replacementCalls.push(
      [offset, bytes(match), bytes(outer), bytes(inner)]);
    return 'X';
  }, 2)), 'X^X');
assert.deepStrictEqual(replacementCalls, [
  [0, bytes(eAcute + cjk), bytes(eAcute + cjk), bytes(cjk)],
  [6, bytes(emoji + 'a'), bytes(emoji + 'a'), bytes('a')],
]);

const sticky = /(([^^])+)/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + '^');
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

const malformed = /((([^^])+))/du.exec(
  raw(0x61, 0xe2, 0x82, 0x62, 0x5e));
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0x61, 0xe2, 0x82, 0x62]);
assert.deepStrictEqual(bytes(malformed[1]), bytes(malformed[0]));
assert.deepStrictEqual(bytes(malformed[2]), bytes(malformed[0]));
assert.deepStrictEqual(bytes(malformed[3]), [0x62]);
assert.deepStrictEqual(
  Array.from(malformed.indices),
  [[0, 4], [0, 4], [0, 4], [3, 4]]);
