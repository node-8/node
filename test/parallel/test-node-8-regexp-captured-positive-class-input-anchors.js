// Flags: --experimental-node-8-string-semantics
'use strict';

require('../common');
const assert = require('node:assert/strict');

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const field = eAcute + cjk;
const classSource = '[A-C\u00e9-\u00eb\u4e2d]';
const prefix = 'key=';
const tail = '!';

function regexp(start, body, end, flags = 'du') {
  return new RegExp(start + prefix + body + tail + end, flags);
}

function assertMatchIndices(expected, expression, subject) {
  const match = expression.exec(subject);
  assert.notStrictEqual(match, null);
  assert.deepStrictEqual(Array.from(match.indices), expected);
  return match;
}

const mixedExact = '((' + classSource + '){2})';
const bodyFinite = '(' + classSource + '){1,3}';

assertMatchIndices(
  [[0, 10], [4, 9], [6, 9]],
  regexp('^', mixedExact, '$'),
  prefix + field + tail);
assertMatchIndices(
  [[0, 10], [4, 9], [6, 9]],
  regexp('^', mixedExact, ''),
  prefix + field + tail + 'after');

assertMatchIndices(
  [[0, 10], [6, 9]],
  regexp('^', bodyFinite, '$'),
  prefix + field + tail);
assertMatchIndices(
  [[0, 10], [6, 9]],
  regexp('^', '(' + classSource + ')+', '$'),
  prefix + field + tail);
assertMatchIndices(
  [[0, 10], [4, 9], [6, 9]],
  regexp('^', '((' + classSource + '){1,3}?)', '$'),
  prefix + field + tail);

assert.strictEqual(
  regexp('^', mixedExact, '$').exec('x' + prefix + field + tail),
  null);
assert.strictEqual(
  regexp('^', mixedExact, '$').exec(prefix + field + tail + 'x'),
  null);
assert.strictEqual(
  regexp('^', mixedExact, '$').exec(prefix + eAcute + tail),
  null);
assert.strictEqual(
  regexp('^', mixedExact, '$').exec(prefix + field + 'x'),
  null);

const matches = Array.from(
  (prefix + field + tail).matchAll(regexp('^', mixedExact, '$', 'dgu')));
assert.strictEqual(matches.length, 1);
assert.strictEqual(
  (prefix + field + tail).replace(regexp('^', mixedExact, '$', 'gu'), 'Y'),
  'Y');

assertMatchIndices(
  [[2, 12], [6, 11], [8, 11]],
  regexp('', mixedExact, ''),
  'zz' + prefix + field + tail);

assert.strictEqual(
  regexp('', mixedExact, '$').exec('zz' + prefix + field + tail),
  null);
assert.strictEqual(
  regexp('^', '((' + classSource + '+))', '$').exec(prefix + field + tail),
  null);
assert.strictEqual(
  regexp('^', '((' + classSource + ')+)', '$').exec(prefix + field + tail),
  null);
assert.strictEqual(
  regexp('^', mixedExact, '$', 'dmu').exec(prefix + field + tail),
  null);
assert.strictEqual(
  new RegExp('^\\b' + prefix + mixedExact + tail + '$', 'du')
    .exec(prefix + field + tail),
  null);
assert.strictEqual(
  new RegExp('^(?=' + prefix + ')' + prefix + mixedExact + tail + '$', 'du')
    .exec(prefix + field + tail),
  null);
assert.strictEqual(
  regexp('^', '((' + classSource + '){1})', '$').exec(prefix + eAcute + tail),
  null);
assert.strictEqual(
  regexp('^', mixedExact, '$', 'duy').exec(prefix + field + tail),
  null);
assert.strictEqual(
  regexp('^', mixedExact, '$', 'dui').exec(prefix + field + tail),
  null);
