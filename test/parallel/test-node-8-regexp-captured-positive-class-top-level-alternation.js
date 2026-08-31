// Flags: --experimental-node-8-string-semantics
'use strict';

require('../common');
const assert = require('node:assert/strict');

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const field = eAcute + cjk;
const subject = 'key=' + field + '!';
const classSource = '[A-C\u00e9-\u00eb\u4e2d]';
const mixedExact = '((' + classSource + '){2})';

function expression(first, body, flags = 'du') {
  const fieldBranch = 'key=' + body + '!';
  return new RegExp(
    '(?:' + (first ? fieldBranch + '|none' : 'none|' + fieldBranch) + ')',
    flags);
}

function assertMatchIndices(expected, regexp, value) {
  const match = regexp.exec(value);
  assert.notStrictEqual(match, null);
  assert.deepStrictEqual(Array.from(match.indices), expected);
  return match;
}

assertMatchIndices(
  [[0, 10], [4, 9], [6, 9]],
  expression(true, mixedExact),
  subject);
assert.strictEqual(expression(false, mixedExact).exec(subject), null);
assertMatchIndices(
  [[0, 10], [4, 9], [6, 9]],
  expression(true, '((' + classSource + '){1,3})'),
  subject);
assertMatchIndices(
  [[0, 10], [6, 9]],
  expression(true, '(' + classSource + ')+'),
  subject);
assertMatchIndices(
  [[0, 10], [4, 9]],
  expression(true, '(' + classSource + '{2})'),
  subject);

assertMatchIndices(
  [[0, 10], [4, 9], [6, 9]],
  new RegExp('^(?:key=' + mixedExact + '!|none)$', 'du'),
  subject);
assertMatchIndices(
  [[0, 10], [4, 9], [6, 9]],
  new RegExp('^(?:key=' + mixedExact + '!|none)', 'du'),
  subject + 'after');

const other = expression(true, mixedExact).exec('none');
assert.notStrictEqual(other, null);
assert.strictEqual(other[0], 'none');
assert.strictEqual(other[1], undefined);
assert.strictEqual(other[2], undefined);
assert.deepStrictEqual(Array.from(other.indices), [[0, 4], undefined, undefined]);

assert.strictEqual(expression(true, mixedExact).exec('key=' + eAcute + '!'), null);
assert.deepStrictEqual(
  Array.from(expression(true, mixedExact).exec('zz' + subject).indices),
  [[2, 12], [6, 11], [8, 11]]);
assert.strictEqual(
  Array.from(('none ' + subject)
    .matchAll(expression(true, mixedExact, 'dgu'))).length,
  2);
assert.strictEqual(
  subject.replace(expression(true, mixedExact, 'gu'), 'X'),
  'X');

const malformedPrefix = String.fromCharCode(0x80) + subject;
const afterMalformed = expression(true, mixedExact, 'dgu');
afterMalformed.lastIndex = 1;
assertMatchIndices(
  [[1, 11], [5, 10], [7, 10]], afterMalformed, malformedPrefix);
assert.strictEqual(afterMalformed.lastIndex, 11);

assert.strictEqual(
  new RegExp(
    '(?:key=(' + classSource + '{2})!|other=(' + classSource + '{2})!)',
    'du').exec(subject),
  null);
assert.strictEqual(
  new RegExp('(?:zero|key=' + mixedExact + '!|none)', 'du').exec(subject),
  null);
assert.strictEqual(
  new RegExp('((?:key=' + mixedExact + '!|none))', 'du').exec(subject),
  null);
assert.strictEqual(
  new RegExp('(?:^key=' + mixedExact + '!|none)', 'du').exec(subject),
  null);
assert.strictEqual(
  new RegExp('^(?:key=((' + classSource + '+))!|none)$', 'du').exec(subject),
  null);
assert.strictEqual(
  expression(true, '((' + classSource + '){1})').exec('key=' + eAcute + '!'),
  null);
assert.strictEqual(expression(true, mixedExact, 'duy').exec(subject), null);
assert.strictEqual(expression(true, mixedExact, 'dui').exec(subject), null);
assert.strictEqual(
  new RegExp('(?i:key=' + mixedExact + '!|none)', 'du').exec(subject),
  null);
