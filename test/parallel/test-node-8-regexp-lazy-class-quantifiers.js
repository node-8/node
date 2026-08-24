// Flags: --experimental-node-8-string-semantics
'use strict';

/* eslint-disable regexp/no-lazy-ends */

require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) =>
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));

function check(regexp, subject, expectedIndex, expected) {
  const match = regexp.exec(subject);
  assert.notStrictEqual(match, null);
  assert.strictEqual(match.index, expectedIndex);
  assert.deepStrictEqual(bytes(match[0]), bytes(expected));
  assert.deepStrictEqual(
    bytes(subject.slice(match.index, match.index + match[0].length)),
    bytes(expected));
}

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);

const matches = Array.from((eAcute + cjk + emoji).matchAll(/[^\n]+?/gu));
assert.deepStrictEqual(matches.map((match) => match.index), [0, 2, 5]);
assert.deepStrictEqual(
  matches.map((match) => bytes(match[0])),
  [bytes(eAcute), bytes(cjk), bytes(emoji)]);
for (const match of matches) {
  assert.deepStrictEqual(
    bytes((eAcute + cjk + emoji)
      .slice(match.index, match.index + match[0].length)),
    bytes(match[0]));
}

check(/[^\n]{2,5}?/u, cjk + emoji + 'b', 0, cjk + emoji);
check(/[^\n]{2}?/u, cjk + emoji + 'b', 0, cjk + emoji);
check(/[^\n]+?/u, raw(0xe2, 0x82, 0x62), 0, raw(0xe2, 0x82));
check(/[^\n]+?/u, raw(0x80, 0xff), 0, raw(0x80));

const sticky = /[^\n]+?/uy;
sticky.lastIndex = 1;
check(sticky, eAcute + 'a', 1, raw(0xa9));
assert.strictEqual(sticky.lastIndex, 2);

const emptyMatches = Array.from(cjk.matchAll(/[^\n]*?/gu));
assert.deepStrictEqual(emptyMatches.map((match) => match.index), [0, 1, 2, 3]);
assert.deepStrictEqual(emptyMatches.map((match) => bytes(match[0])),
                       [[], [], [], []]);
