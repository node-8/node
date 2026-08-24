// Flags: --experimental-node-8-string-semantics
'use strict';

/* eslint-disable regexp/no-lazy-ends */

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) =>
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const subject = eAcute + cjk + emoji;

const ordinary = Array.from(subject.matchAll(/([^\n]+?)/gu));
assert.deepStrictEqual(ordinary.map((match) => match.index), [0, 2, 5]);
assert.deepStrictEqual(
  ordinary.map((match) => bytes(match[0])),
  [bytes(eAcute), bytes(cjk), bytes(emoji)]);
assert.deepStrictEqual(
  ordinary.map((match) => bytes(match[1])),
  ordinary.map((match) => bytes(match[0])));

const named = Array.from(subject.matchAll(/(?<part>[^\n]+?)/dgu));
for (const match of named) {
  assert.strictEqual(match.groups.part, match[0]);
  assert.deepStrictEqual(match.indices[1], match.indices[0]);
  assert.deepStrictEqual(match.indices.groups.part, match.indices[0]);
  assert.strictEqual(subject.slice(...match.indices[0]), match[0]);
}

const nested = /(([^\n]{2,5}?))/du.exec(cjk + emoji + 'a');
assert.notStrictEqual(nested, null);
assert.strictEqual(nested[0], cjk + emoji);
assert.strictEqual(nested[1], nested[0]);
assert.strictEqual(nested[2], nested[0]);
assert.deepStrictEqual(Array.from(nested.indices),
                       [[0, 7], [0, 7], [0, 7]]);

const replacementOffsets = [];
assert.strictEqual(subject.replace(
  /(?<part>[^\n]+?)/gu,
  common.mustCall((match, capture, offset, input, groups) => {
    assert.strictEqual(capture, match);
    assert.strictEqual(groups.part, match);
    assert.strictEqual(input, subject);
    replacementOffsets.push(offset);
    return 'X';
  }, 3)), 'XXX');
assert.deepStrictEqual(replacementOffsets, [0, 2, 5]);

const sticky = /([^\n]+?)/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + 'a');
assert.notStrictEqual(continuation, null);
assert.deepStrictEqual(bytes(continuation[0]), [0xa9]);
assert.deepStrictEqual(bytes(continuation[1]), [0xa9]);
assert.deepStrictEqual(Array.from(continuation.indices), [[1, 2], [1, 2]]);
assert.strictEqual(sticky.lastIndex, 2);

const malformedSubject = raw(0xe2, 0x82, 0x62);
const malformed = /(?<part>[^\n]+?)/du.exec(malformedSubject);
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0xe2, 0x82]);
assert.strictEqual(malformed.groups.part, malformed[0]);
assert.deepStrictEqual(malformed.indices[0], [0, 2]);
assert.deepStrictEqual(malformed.indices.groups.part, [0, 2]);

const empty = Array.from(cjk.matchAll(/([^\n]*?)/gu));
assert.deepStrictEqual(empty.map((match) => match.index), [0, 1, 2, 3]);
assert.deepStrictEqual(empty.map((match) => match[1]), ['', '', '', '']);
