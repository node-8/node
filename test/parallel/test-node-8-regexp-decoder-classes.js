// Flags: --experimental-node-8-string-semantics
'use strict';

const assert = require('assert');

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const subject = eAcute + cjk;

const negated = /[^é]/u.exec(subject);
assert.strictEqual(negated.index, 2);
assert.strictEqual(negated[0], cjk);
assert.strictEqual(negated[0], subject.slice(
  negated.index, negated.index + negated[0].length));

const globalMatches = Array.from(subject.matchAll(/[^\x00-\x7f]/gu));
assert.deepStrictEqual(globalMatches.map((match) => match.index), [0, 2]);
assert.deepStrictEqual(globalMatches.map((match) => match[0]), [eAcute, cjk]);

const malformed = Buffer.from([0xe2, 0x28, 0xa1]).toString();
const replacementMatches = Array.from(malformed.matchAll(/[\uFFFD]/gu));
assert.deepStrictEqual(replacementMatches.map((match) => match.index), [0, 2]);
assert.strictEqual(replacementMatches[0][0], malformed.slice(0, 1));
assert.strictEqual(replacementMatches[1][0], malformed.slice(2, 3));

assert.strictEqual(subject.replace(/[^\x00-\x7f]/gu, 'X'), 'XX');
assert.strictEqual(subject.search(/[^é]/u), 2);
assert.deepStrictEqual(
  ('a' + eAcute + 'b').split(/[^\x00-\x7f]/u), ['a', 'b']);

const replaceIndices = [];
assert.strictEqual(malformed.replace(/[\uFFFD]/gu, (match, index) => {
  replaceIndices.push(index);
  return 'X';
}), 'X(X');
assert.deepStrictEqual(replaceIndices, [0, 2]);
