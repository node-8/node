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
const subject = eAcute + cjk + emoji + 'a' + eCircumflex;

const ordinary = /([^\n]){2,5}/du.exec(subject);
assert.notStrictEqual(ordinary, null);
assert.deepStrictEqual(bytes(ordinary[0]), bytes(subject));
assert.deepStrictEqual(bytes(ordinary[1]), bytes(eCircumflex));
assert.deepStrictEqual(
  Array.from(ordinary.indices), [[0, 12], [10, 12]]);

const named = Array.from(subject.matchAll(/(?<part>[^\n]){1,2}/dgu));
assert.deepStrictEqual(
  named.map((match) => match.indices[0]),
  [[0, 5], [5, 10], [10, 12]]);
assert.deepStrictEqual(
  named.map((match) => match.indices.groups.part),
  [[2, 5], [9, 10], [10, 12]]);
assert.deepStrictEqual(
  named.map((match) => bytes(match.groups.part)),
  [bytes(cjk), bytes('a'), bytes(eCircumflex)]);

const zeroSubject = eAcute + cjk + '\n' + emoji;
const nested = Array.from(zeroSubject.matchAll(/((([^\n]))){0,3}/dgu));
assert.deepStrictEqual(
  nested.map((match) => match.indices[0]),
  [[0, 5], [5, 5], [6, 10], [10, 10]]);
for (let capture = 1; capture <= 3; capture++) {
  assert.deepStrictEqual(
    nested.map((match) => match.indices[capture]),
    [[2, 5], undefined, [6, 10], undefined]);
}

const outer = /(?<run>[^\n]{2,5})/du.exec(subject);
assert.notStrictEqual(outer, null);
assert.deepStrictEqual(bytes(outer.groups.run), bytes(subject));
assert.deepStrictEqual(outer.indices.groups.run, [0, 12]);

const replacementCalls = [];
assert.strictEqual(subject.replace(
  /([^\n]){2,5}/gu,
  common.mustCall((match, capture, offset) => {
    replacementCalls.push([offset, bytes(match), bytes(capture)]);
    return 'X';
  })), 'X');
assert.deepStrictEqual(replacementCalls, [
  [0, bytes(subject), bytes(eCircumflex)],
]);

const sticky = /([^\n]){2,5}/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + 'a');
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(
  bytes(continuation[0]), [0xa9, 0xe4, 0xb8, 0xad, 0x61]);
assert.deepStrictEqual(bytes(continuation[1]), bytes('a'));
assert.deepStrictEqual(
  Array.from(continuation.indices), [[1, 6], [5, 6]]);
assert.strictEqual(sticky.lastIndex, 6);

sticky.lastIndex = 5;
assert.strictEqual(sticky.exec(eAcute + cjk + '\n'), null);
assert.strictEqual(sticky.lastIndex, 0);

const malformed = /([^\n]){2,3}/du.exec(raw(0x61, 0xe2, 0x82, 0x62));
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0x61, 0xe2, 0x82, 0x62]);
assert.deepStrictEqual(bytes(malformed[1]), [0x62]);
assert.deepStrictEqual(
  Array.from(malformed.indices), [[0, 4], [3, 4]]);
