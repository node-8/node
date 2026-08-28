// Flags: --experimental-node-8-string-semantics
'use strict';

/* eslint-disable regexp/no-lazy-ends */

const common = require('../common');
const assert = require('node:assert/strict');

const raw = (...input) => String.fromCharCode(...input);
const bytes = (value) => (value === undefined ? undefined :
  Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const eDiaeresis = String.fromCodePoint(0xeb);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);

const body = /([\u00e9-\u00eb]){1,3}/du.exec(
  eAcute + eCircumflex + 'x');
assert.notStrictEqual(body, null);
assert.deepStrictEqual(bytes(body[0]), bytes(eAcute + eCircumflex));
assert.deepStrictEqual(bytes(body[1]), bytes(eCircumflex));
assert.deepStrictEqual(Array.from(body.indices), [[0, 4], [2, 4]]);

const mixed = /((?<run>(?<part>[\u00e9-\u00eb]){1,3}))/du.exec(
  eAcute + eCircumflex + eDiaeresis + 'x');
assert.notStrictEqual(mixed, null);
for (let capture = 0; capture <= 2; capture++) {
  assert.deepStrictEqual(
    bytes(mixed[capture]), bytes(eAcute + eCircumflex + eDiaeresis));
  assert.deepStrictEqual(mixed.indices[capture], [0, 6]);
}
assert.deepStrictEqual(bytes(mixed[3]), bytes(eDiaeresis));
assert.deepStrictEqual(mixed.indices[3], [4, 6]);
assert.deepStrictEqual(bytes(mixed.groups.run), bytes(mixed[2]));
assert.deepStrictEqual(bytes(mixed.groups.part), bytes(mixed[3]));
assert.deepStrictEqual(mixed.indices.groups.run, mixed.indices[2]);
assert.deepStrictEqual(mixed.indices.groups.part, mixed.indices[3]);

const lazy = /(([\u00e9-\u00eb]){1,3}?)/du.exec(
  eAcute + eCircumflex);
assert.notStrictEqual(lazy, null);
assert.deepStrictEqual(bytes(lazy[0]), bytes(eAcute));
assert.deepStrictEqual(bytes(lazy[1]), bytes(eAcute));
assert.deepStrictEqual(bytes(lazy[2]), bytes(eAcute));
assert.deepStrictEqual(Array.from(lazy.indices),
                       [[0, 2], [0, 2], [0, 2]]);

const empty = /((?<part>[\u00e9-\u00eb]){0,2}?)/du.exec('x');
assert.notStrictEqual(empty, null);
assert.strictEqual(empty[0], '');
assert.strictEqual(empty[1], '');
assert.strictEqual(empty.groups.part, undefined);
assert.deepStrictEqual(empty.indices[0], [0, 0]);
assert.deepStrictEqual(empty.indices[1], [0, 0]);
assert.strictEqual(empty.indices.groups.part, undefined);

const edgeSubject = `AD${eAcute}${eDiaeresis}${cjk}${emoji}x`;
const edgeMatches = Array.from(edgeSubject.matchAll(
  /(([A-C\u00e9-\u00eb\u4e2d\u{1f600}]){1,2})/dgu));
assert.deepStrictEqual(
  edgeMatches.map((match) => match.indices[0]),
  [[0, 1], [2, 6], [6, 13]]);
assert.deepStrictEqual(
  edgeMatches.map((match) => match.indices[1]),
  edgeMatches.map((match) => match.indices[0]));
assert.deepStrictEqual(
  edgeMatches.map((match) => match.indices[2]),
  [[0, 1], [4, 6], [9, 13]]);

const malformedValue = raw(0x80, 0xc3, 0xa9, 0xc3, 0xaa, 0x78);
const malformed = /(([\u00e9-\u00eb]){1,2})/du.exec(malformedValue);
assert.notStrictEqual(malformed, null);
assert.deepStrictEqual(bytes(malformed[0]), [0xc3, 0xa9, 0xc3, 0xaa]);
assert.deepStrictEqual(bytes(malformed[1]), bytes(malformed[0]));
assert.deepStrictEqual(bytes(malformed[2]), [0xc3, 0xaa]);
assert.deepStrictEqual(
  Array.from(malformed.indices), [[1, 5], [1, 5], [3, 5]]);

const continuation = /(([\u00e9-\u00eb]){1,2})/dgu;
continuation.lastIndex = 1;
const continuationMatch = continuation.exec(eAcute + eCircumflex + 'x');
assert.notStrictEqual(continuationMatch, null);
assert.deepStrictEqual(bytes(continuationMatch[0]), bytes(eCircumflex));
assert.deepStrictEqual(
  Array.from(continuationMatch.indices), [[2, 4], [2, 4], [2, 4]]);
assert.strictEqual(continuation.lastIndex, 4);

const replacementCalls = [];
assert.strictEqual((eAcute + eCircumflex + 'x').replace(
  /(([\u00e9-\u00eb]){1,2})/gu,
  common.mustCall((match, full, part, offset) => {
    replacementCalls.push(
      [offset, bytes(match), bytes(full), bytes(part)]);
    return 'X';
  })), 'Xx');
assert.deepStrictEqual(replacementCalls, [[
  0,
  bytes(eAcute + eCircumflex),
  bytes(eAcute + eCircumflex),
  bytes(eCircumflex),
]]);
