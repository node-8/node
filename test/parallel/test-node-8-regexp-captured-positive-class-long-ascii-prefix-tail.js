// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => Array.from(
  { length: value.length }, (_, index) => value.charCodeAt(index));
const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const field = eAcute + eCircumflex;
const tail16 = 'tail-12345678901';
const tail17 = 'tail-123456789012';
const tail24 = 'tail-1234567890123456789';
const tail32 = 'tail-123456789012345678901234567';
const tail33 = 'tail-1234567890123456789012345678';
const prefix17 = 'prefix-1234567890';
const prefix32 = 'prefix-1234567890123456789012345';
const prefix33 = 'prefix-12345678901234567890123456';
const classSource = '[A-C\\u00e9-\\u00eb]';
const mixedSource = '((' + classSource + '){1,20})';

function regexp(prefix, body, tail, flags = 'du') {
  return new RegExp(prefix + body + tail, flags);
}

function assertMatchIndices(expected, expression, subject) {
  const match = expression.exec(subject);
  assert.notStrictEqual(match, null);
  assert.deepStrictEqual(Array.from(match.indices), expected);
  return match;
}

assert.deepStrictEqual(
  [tail16, tail17, tail24, tail32, tail33].map((value) => value.length),
  [16, 17, 24, 32, 33]);
assert.deepStrictEqual(
  [prefix17, prefix32, prefix33].map((value) => value.length),
  [17, 32, 33]);

for (const tail of [tail16, tail17, tail24, tail32]) {
  assertMatchIndices(
    [[0, 4 + tail.length], [0, 4], [2, 4]],
    regexp('', mixedSource, tail),
    field + tail);
}

for (const prefix of [prefix17, prefix32]) {
  const end = prefix.length + 4 + tail24.length;
  assertMatchIndices(
    [
      [0, end],
      [prefix.length, prefix.length + 4],
      [prefix.length + 2, prefix.length + 4],
    ],
    regexp(prefix, mixedSource, tail24),
    prefix + field + tail24);
}

// Exact, large finite, unbounded, and lazy forms keep their existing trees.
assertMatchIndices(
  [[0, 4 + tail17.length], [2, 4]],
  regexp('', '(' + classSource + '){2}', tail17),
  field + tail17);
assertMatchIndices(
  [[0, 4 + tail24.length], [2, 4]],
  regexp('', '(' + classSource + '){1,100}', tail24),
  field + tail24);
assertMatchIndices(
  [[0, 4 + tail32.length], [2, 4]],
  regexp('', '(' + classSource + ')+', tail32),
  field + tail32);
assertMatchIndices(
  [
    [0, prefix17.length + 4 + tail32.length],
    [prefix17.length, prefix17.length + 4],
    [prefix17.length + 2, prefix17.length + 4],
  ],
  regexp(prefix17, '((' + classSource + '){1,20}?)', tail32),
  prefix17 + field + tail32);

const searched = 'xx' + prefix17 + field + tail17;
assertMatchIndices(
  [
    [2, searched.length],
    [2 + prefix17.length, 6 + prefix17.length],
    [4 + prefix17.length, 6 + prefix17.length],
  ],
  regexp(prefix17, mixedSource, tail17),
  searched);

const chunk = prefix17 + field + tail17;
const matches = Array.from(
  chunk.repeat(50).matchAll(regexp(prefix17, mixedSource, tail17, 'dgu')));
assert.strictEqual(matches.length, 50);
for (let index = 0; index < matches.length; ++index) {
  const start = index * chunk.length;
  assert.deepStrictEqual(Array.from(matches[index].indices), [
    [start, start + chunk.length],
    [start + prefix17.length, start + prefix17.length + 4],
    [start + prefix17.length + 2, start + prefix17.length + 4],
  ]);
}

assert.strictEqual(
  chunk.replace(
    regexp(prefix17, mixedSource, tail17, 'gu'),
    common.mustCall((match, outer, part, offset) => {
      assert.strictEqual(offset, 0);
      assert.deepStrictEqual(bytes(match), bytes(chunk));
      assert.deepStrictEqual(bytes(outer), bytes(field));
      assert.deepStrictEqual(bytes(part), bytes(eCircumflex));
      return 'Y';
    })),
  'Y');

const malformedSubject = raw(
  0x80, ...bytes(prefix17), 0xc3, 0xa9, ...bytes(tail17));
const malformed = regexp(prefix17, mixedSource, tail17, 'dgu');
malformed.lastIndex = 1;
assertMatchIndices(
  [[1, 37], [18, 20], [18, 20]],
  malformed,
  malformedSubject);
assert.strictEqual(malformed.lastIndex, 37);

// Adjacent selectors remain unchanged.
assert.strictEqual(regexp('', mixedSource, tail33).exec(field + tail33), null);
assert.strictEqual(
  regexp(prefix33, mixedSource, tail17).exec(prefix33 + field + tail17),
  null);
assert.strictEqual(
  regexp('', '((' + classSource + '+))', tail17).exec(field + tail17),
  null);
assert.strictEqual(
  regexp('', mixedSource, tail17, 'duy').exec(field + tail17),
  null);
assert.strictEqual(
  regexp('', mixedSource, tail17, 'dui').exec(field + tail17),
  null);
