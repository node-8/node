// Flags: --experimental-node-8-string-semantics
'use strict';

require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const field = eAcute + cjk;
const subject = 'key=' + field + '!';
const classSource = '[A-C\u00e9-\u00eb\u4e2d]';

function expression(body, end = '', flags = 'du') {
  return new RegExp('(?:^key=' + body + '!' + end + '|none)', flags);
}

function assertMatchIndices(expected, regexp, value) {
  const match = regexp.exec(value);
  assert.notStrictEqual(match, null);
  assert.deepStrictEqual(Array.from(match.indices), expected);
  return match;
}

const mixedExact = '((' + classSource + '){2})';

assertMatchIndices(
  [[0, 10], [4, 9], [6, 9]], expression(mixedExact), subject + 'after');
assertMatchIndices(
  [[0, 10], [4, 9], [6, 9]], expression(mixedExact, '$'), subject);
assertMatchIndices(
  [[0, 10], [4, 9], [6, 9]],
  expression('((' + classSource + '){1,3})'), subject);
assertMatchIndices(
  [[0, 10], [6, 9]], expression('(' + classSource + ')+'), subject);
assertMatchIndices(
  [[0, 10], [4, 9]], expression('(' + classSource + '{2})'), subject);

const other = assertMatchIndices(
  [[2, 6], undefined, undefined], expression(mixedExact), 'zznone');
assert.strictEqual(other[0], 'none');
assert.strictEqual(other[1], undefined);
assert.strictEqual(other[2], undefined);

assert.strictEqual(expression(mixedExact, '$').exec(subject + 'x'), null);
assert.strictEqual(expression(mixedExact).exec('x' + subject), null);
assert.strictEqual(
  expression(mixedExact).exec('key=' + eAcute + '!'),
  null);
assert.strictEqual(
  subject.replace(expression(mixedExact, '', 'gu'), 'X'),
  'X');

const global = expression(mixedExact, '', 'dgu');
global.lastIndex = 1;
assertMatchIndices(
  [[1, 5], undefined, undefined], global, 'xnone none');
assert.strictEqual(global.lastIndex, 5);
assertMatchIndices(
  [[6, 10], undefined, undefined], global, 'xnone none');
assert.strictEqual(global.lastIndex, 10);
assert.strictEqual(global.exec('xnone none'), null);
assert.strictEqual(global.lastIndex, 0);

const anchoredAfterZero = expression(mixedExact, '', 'dgu');
anchoredAfterZero.lastIndex = 1;
assert.strictEqual(anchoredAfterZero.exec(subject), null);
assert.strictEqual(anchoredAfterZero.lastIndex, 0);

assertMatchIndices(
  [[1, 5], undefined, undefined],
  expression(mixedExact),
  raw(0x80) + 'none');
const malformedClass = '[\ufffd\u00e9]';
assert.strictEqual(
  expression('((' + malformedClass + '){2})')
    .exec('key=' + raw(0x80) + eAcute + '!'),
  null);

assert.strictEqual(
  new RegExp('(?:key=' + mixedExact + '!$|none)', 'du').exec(subject),
  null);
assert.strictEqual(expression(mixedExact, '', 'dmu').exec(subject), null);
assert.strictEqual(
  new RegExp('(?:^\\bkey=' + mixedExact + '!|none)', 'du').exec(subject),
  null);
assert.strictEqual(
  new RegExp('(?:^(?=key=)key=' + mixedExact + '!|none)', 'du').exec(subject),
  null);
assert.strictEqual(
  expression('((' + classSource + '+))', '$').exec(subject),
  null);
assert.strictEqual(
  expression('((' + classSource + ')+)', '$').exec(subject),
  null);
assert.strictEqual(
  expression('((' + classSource + '){1})').exec('key=' + eAcute + '!'),
  null);
assert.strictEqual(
  new RegExp('(?:none|^key=' + mixedExact + '!)', 'du').exec(subject),
  null);
assert.strictEqual(
  new RegExp(
    '(?:^key=(' + classSource + '{2})!|other=(' +
      classSource + '{2})!)',
    'du').exec(subject),
  null);
assert.strictEqual(
  new RegExp('((?:^key=' + mixedExact + '!|none))', 'du').exec(subject),
  null);
assert.strictEqual(expression(mixedExact, '', 'duy').exec(subject), null);
assert.strictEqual(expression(mixedExact, '', 'dui').exec(subject), null);
assert.strictEqual(
  new RegExp('(?i:^key=' + mixedExact + '!|none)', 'du').exec(subject),
  null);
