// Flags: --experimental-node-8-string-semantics
'use strict';

/* eslint-disable regexp/no-lazy-ends */

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => Array.from(
  { length: value.length }, (_, index) => value.charCodeAt(index));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const eDiaeresis = String.fromCodePoint(0xeb);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);

const greedy = /([A-C\u00e9-\u00eb]{1,3})/du.exec(
  eAcute + eCircumflex + 'x');
assert.notStrictEqual(greedy, null);
assert.deepStrictEqual(bytes(greedy[0]), bytes(eAcute + eCircumflex));
assert.deepStrictEqual(bytes(greedy[1]), bytes(greedy[0]));
assert.deepStrictEqual(Array.from(greedy.indices), [[0, 4], [0, 4]]);

const nested = /((?<run>[A-C\u00e9-\u00eb]{1,3}))/du.exec(
  eAcute + eCircumflex + eDiaeresis + 'x');
assert.notStrictEqual(nested, null);
for (let capture = 0; capture <= 2; capture++) {
  assert.deepStrictEqual(
    bytes(nested[capture]), bytes(eAcute + eCircumflex + eDiaeresis));
  assert.deepStrictEqual(nested.indices[capture], [0, 6]);
}
assert.deepStrictEqual(bytes(nested.groups.run), bytes(nested[2]));
assert.deepStrictEqual(nested.indices.groups.run, nested.indices[2]);

const lazy = /(?<run>[A-C\u00e9-\u00eb]{1,3}?)/du.exec(
  eAcute + eCircumflex);
assert.notStrictEqual(lazy, null);
assert.deepStrictEqual(bytes(lazy[0]), bytes(eAcute));
assert.deepStrictEqual(bytes(lazy.groups.run), bytes(lazy[0]));
assert.deepStrictEqual(lazy.indices[0], [0, 2]);
assert.deepStrictEqual(lazy.indices.groups.run, [0, 2]);

const unbounded = /([A-C\u00e9-\u00eb]{2,})/du.exec(
  eAcute + eCircumflex + eDiaeresis + 'x');
assert.notStrictEqual(unbounded, null);
assert.deepStrictEqual(
  bytes(unbounded[0]), bytes(eAcute + eCircumflex + eDiaeresis));
assert.deepStrictEqual(bytes(unbounded[1]), bytes(unbounded[0]));

const nonAsciiOnly = /([\u4e2d\u{1f600}]{1,2})/du.exec(cjk + emoji + 'x');
assert.notStrictEqual(nonAsciiOnly, null);
assert.deepStrictEqual(bytes(nonAsciiOnly[0]), bytes(cjk + emoji));
assert.deepStrictEqual(bytes(nonAsciiOnly[1]), bytes(nonAsciiOnly[0]));

const optional = /([A-C\u00e9-\u00eb]?)/du.exec(eAcute + 'x');
assert.notStrictEqual(optional, null);
assert.deepStrictEqual(bytes(optional[0]), bytes(eAcute));
assert.deepStrictEqual(bytes(optional[1]), bytes(optional[0]));

const star = /([A-C\u00e9-\u00eb]*)/du.exec(eAcute + eCircumflex + 'x');
assert.notStrictEqual(star, null);
assert.deepStrictEqual(bytes(star[0]), bytes(eAcute + eCircumflex));
assert.deepStrictEqual(bytes(star[1]), bytes(star[0]));

const empty = /((?<run>[A-C\u00e9-\u00eb]{0,2}?))/du.exec('x');
assert.notStrictEqual(empty, null);
for (let capture = 0; capture <= 2; capture++) {
  assert.strictEqual(empty[capture], '');
  assert.deepStrictEqual(empty.indices[capture], [0, 0]);
}
assert.strictEqual(empty.groups.run, '');
assert.deepStrictEqual(empty.indices.groups.run, [0, 0]);

const edgeSubject = `AD${eAcute}${eDiaeresis}${cjk}${emoji}x`;
const edgeMatches = Array.from(edgeSubject.matchAll(
  /([A-C\u00e9-\u00eb\u4e2d\u{1f600}]{1,2})/dgu));
assert.deepStrictEqual(
  edgeMatches.map((match) => match.indices[0]),
  [[0, 1], [2, 6], [6, 13]]);
assert.deepStrictEqual(
  edgeMatches.map((match) => match.indices[1]),
  edgeMatches.map((match) => match.indices[0]));

const malformedValue = raw(0x80, 0xc3, 0xa9, 0xc3, 0xaa, 0x78);
const malformed = /([A-C\u00e9-\u00eb]{1,2})/du.exec(malformedValue);
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0xc3, 0xa9, 0xc3, 0xaa]);
assert.deepStrictEqual(bytes(malformed[1]), bytes(malformed[0]));
assert.deepStrictEqual(Array.from(malformed.indices), [[1, 5], [1, 5]]);

const continuation = /([A-C\u00e9-\u00eb]{1,2})/dgu;
continuation.lastIndex = 1;
const continuationMatch = continuation.exec(eAcute + eCircumflex + 'x');
assert.notStrictEqual(continuationMatch, null);
assert.deepStrictEqual(bytes(continuationMatch[0]), bytes(eCircumflex));
assert.deepStrictEqual(
  Array.from(continuationMatch.indices), [[2, 4], [2, 4]]);
assert.strictEqual(continuation.lastIndex, 4);

const replacementCalls = [];
assert.strictEqual((eAcute + eCircumflex + 'x').replace(
  /([A-C\u00e9-\u00eb]{1,2})/gu,
  common.mustCall((match, run, offset) => {
    replacementCalls.push([offset, bytes(match), bytes(run)]);
    return 'X';
  })), 'Xx');
assert.deepStrictEqual(replacementCalls, [[
  0,
  bytes(eAcute + eCircumflex),
  bytes(eAcute + eCircumflex),
]]);
