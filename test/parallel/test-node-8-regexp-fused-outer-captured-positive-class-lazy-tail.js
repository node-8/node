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
const emoji = String.fromCodePoint(0x1f600);

const minimum = /([A-C\u00e9-\u00eb]{1,3}?)x/du.exec(eAcute + 'x');
assert.notStrictEqual(minimum, null);
assert.deepStrictEqual(bytes(minimum[0]), bytes(eAcute + 'x'));
assert.deepStrictEqual(bytes(minimum[1]), bytes(eAcute));
assert.deepStrictEqual(Array.from(minimum.indices), [[0, 3], [0, 2]]);

assert.strictEqual(
  /([A-C\u00e9-\u00eb]{2,3}?)x/du.exec(eAcute + 'x'), null);

const expansion = /([A-C\u00e9-\u00eb]{1,3}?)x/du.exec(
  'A' + eAcute + 'x');
assert.notStrictEqual(expansion, null);
assert.deepStrictEqual(bytes(expansion[1]), bytes('A' + eAcute));
assert.deepStrictEqual(Array.from(expansion.indices), [[0, 4], [0, 3]]);

const nested = /((?<run>[A-C\u00e9-\u00eb]{1,3}?))x/du.exec(
  'A' + eAcute + 'x');
assert.notStrictEqual(nested, null);
for (let capture = 1; capture <= 2; capture++) {
  assert.deepStrictEqual(bytes(nested[capture]), bytes('A' + eAcute));
  assert.deepStrictEqual(nested.indices[capture], [0, 3]);
}
assert.deepStrictEqual(bytes(nested.groups.run), bytes(nested[2]));
assert.deepStrictEqual(nested.indices.groups.run, nested.indices[2]);

const nonAscii = /([\u4e2d\u{1f600}]{1,2}?)x/du.exec(cjk + emoji + 'x');
assert.notStrictEqual(nonAscii, null);
assert.deepStrictEqual(bytes(nonAscii[1]), bytes(cjk + emoji));
assert.deepStrictEqual(Array.from(nonAscii.indices), [[0, 8], [0, 7]]);

const empty = /([A-C\u00e9-\u00eb]{0,3}?)x/du.exec('x');
assert.notStrictEqual(empty, null);
assert.strictEqual(empty[1], '');
assert.deepStrictEqual(Array.from(empty.indices), [[0, 1], [0, 0]]);

const malformedSubject = raw(0x80, 0xc3, 0xa9, 0x78);
const malformed = /([A-C\u00e9-\u00eb]{1,3}?)x/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assert.notStrictEqual(malformedMatch, null);
assert.deepStrictEqual(
  Array.from(malformedMatch.indices), [[1, 4], [1, 3]]);
assert.strictEqual(malformed.lastIndex, 4);

const all = Array.from((eAcute + 'xA' + eCircumflex + 'x').matchAll(
  /([A-C\u00e9-\u00eb]{1,3}?)x/dgu));
assert.deepStrictEqual(
  all.map((match) => match.indices[0]), [[0, 3], [3, 7]]);
assert.deepStrictEqual(
  all.map((match) => match.indices[1]), [[0, 2], [3, 6]]);

const replacementCalls = [];
assert.strictEqual(('A' + eAcute + 'x').replace(
  /([A-C\u00e9-\u00eb]{1,3}?)x/gu,
  common.mustCall((match, run, offset) => {
    replacementCalls.push([offset, bytes(match), bytes(run)]);
    return 'Y';
  })), 'Y');
assert.deepStrictEqual(replacementCalls, [[
  0,
  bytes('A' + eAcute + 'x'),
  bytes('A' + eAcute),
]]);
