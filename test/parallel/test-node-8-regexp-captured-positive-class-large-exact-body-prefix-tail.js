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
const classSource = '[A-C\\u00e9-\\u00eb]';
const tail9 = '123456789';
const tail16 = '1234567890abcdef';
const tail32 = '1234567890abcdefghijklmnopqrstuv';
const tail33 = '1234567890abcdefghijklmnopqrstuvw';
const prefix9 = 'prefix-09';
const prefix32 = 'prefix-1234567890123456789012345';

function regexp(prefix, body, tail, flags = 'du') {
  return new RegExp(prefix + body + tail, flags);
}

function assertMatchIndices(expected, expression, subject) {
  const match = expression.exec(subject);
  assert.notStrictEqual(match, null);
  assert.deepStrictEqual(Array.from(match.indices), expected);
  return match;
}

function exactBody(count) {
  return '(' + classSource + '){' + count + '}';
}

function exactMixed(count) {
  return '((' + classSource + '){' + count + '})';
}

for (const count of [8, 9, 20, 100]) {
  const field = eAcute.repeat(count);
  assertMatchIndices([
    [0, field.length + tail9.length],
    [field.length - eAcute.length, field.length],
  ], regexp('', exactBody(count), tail9), field + tail9);
}

const field20 = (eAcute + eCircumflex).repeat(10);
assertMatchIndices(
  [[0, 40 + tail16.length], [0, 40], [38, 40]],
  regexp('', exactMixed(20), tail16),
  field20 + tail16);
assertMatchIndices([
  [0, prefix32.length + 40 + tail32.length],
  [prefix32.length, prefix32.length + 40],
  [prefix32.length + 38, prefix32.length + 40],
], regexp(prefix32, exactMixed(20), tail32), prefix32 + field20 + tail32);

assert.strictEqual(
  regexp('p=', exactMixed(20), tail16)
    .exec('p=' + eAcute.repeat(19) + tail16),
  null);
assert.strictEqual(
  regexp('p=', exactMixed(20), tail16)
    .exec('p=' + eAcute.repeat(21) + tail16),
  null);

const searched = 'zz' + prefix9 + eAcute.repeat(9) + tail9;
assertMatchIndices([
  [2, searched.length],
  [2 + prefix9.length, 2 + prefix9.length + 18],
  [2 + prefix9.length + 16, 2 + prefix9.length + 18],
], regexp(prefix9, exactMixed(9), tail9), searched);

const chunk = prefix9 + eAcute.repeat(9) + tail9;
const matches = Array.from(
  chunk.repeat(30).matchAll(regexp(prefix9, exactMixed(9), tail9, 'dgu')));
assert.strictEqual(matches.length, 30);
for (let index = 0; index < matches.length; ++index) {
  const start = index * chunk.length;
  assert.deepStrictEqual(Array.from(matches[index].indices), [
    [start, start + chunk.length],
    [start + prefix9.length, start + prefix9.length + 18],
    [start + prefix9.length + 16, start + prefix9.length + 18],
  ]);
}

assert.strictEqual(
  chunk.replace(
    regexp(prefix9, exactMixed(9), tail9, 'gu'),
    common.mustCall((match, outer, part, offset) => {
      assert.strictEqual(offset, 0);
      assert.deepStrictEqual(bytes(match), bytes(chunk));
      assert.deepStrictEqual(bytes(outer), bytes(eAcute.repeat(9)));
      assert.deepStrictEqual(bytes(part), bytes(eAcute));
      return 'Y';
    })),
  'Y');

const malformedSubject = raw(
  0x80, ...bytes(prefix9), ...bytes(eAcute.repeat(9)), ...bytes(tail9));
const malformed = regexp(prefix9, exactMixed(9), tail9, 'dgu');
malformed.lastIndex = 1;
assertMatchIndices(
  [[1, 37], [10, 28], [26, 28]],
  malformed,
  malformedSubject);
assert.strictEqual(malformed.lastIndex, 37);

assert.strictEqual(
  regexp('', '((' + classSource + '{20}))', tail9).exec(field20 + tail9),
  null);
assert.strictEqual(
  regexp('', exactMixed(20), tail33).exec(field20 + tail33),
  null);
assert.strictEqual(
  regexp('', exactMixed(20), cjk).exec(field20 + cjk),
  null);
assert.strictEqual(
  regexp('', exactMixed(20), tail9, 'duy').exec(field20 + tail9),
  null);
assert.strictEqual(
  regexp('', exactMixed(20), tail9, 'dui').exec(field20 + tail9),
  null);
