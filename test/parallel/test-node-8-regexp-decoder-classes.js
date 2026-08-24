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

const captured = /([^é])/u.exec(subject);
assert.strictEqual(captured.index, 2);
assert.strictEqual(captured[0], cjk);
assert.strictEqual(captured[1], cjk);

const named = /(?<value>[\uFFFD])/u.exec(malformed);
assert.strictEqual(named[0], malformed.slice(0, 1));
assert.strictEqual(named.groups.value, named[0]);
const unicodeNamed = /(?<名字>[^a])/u.exec(cjk);
assert.strictEqual(unicodeNamed.groups.名字, cjk);
assert.deepStrictEqual(Object.keys(unicodeNamed.groups), ['名字']);
const fallbackUnicodeNamed = /(?<名字>[a])b/u.exec('ab');
assert.strictEqual(fallbackUnicodeNamed.groups.名字, 'a');

const indexed = /(([^é]))/du.exec(subject);
assert.deepStrictEqual(
  Array.from(indexed.indices), [[2, 5], [2, 5], [2, 5]]);

const nestedGlobal = Array.from(subject.matchAll(/(([^\x00-\x7f]))/gu));
assert.deepStrictEqual(nestedGlobal.map((match) => match.index), [0, 2]);
assert.deepStrictEqual(nestedGlobal.map((match) => match[1]), [eAcute, cjk]);
assert.deepStrictEqual(nestedGlobal.map((match) => match[2]), [eAcute, cjk]);

const emoji = String.fromCodePoint(0x1f600);
const plusSubject = eAcute + cjk + cjk + 'a' + eAcute + emoji + emoji + 'b';
const plusMatches = Array.from(plusSubject.matchAll(/[^é]+/gu));
assert.deepStrictEqual(plusMatches.map((match) => match.index), [2, 11]);
assert.deepStrictEqual(
  plusMatches.map((match) => match[0]),
  [cjk + cjk + 'a', emoji + emoji + 'b']);

const positivePlus = /[é]+/u.exec(eAcute + eAcute + cjk);
assert.strictEqual(positivePlus.index, 0);
assert.strictEqual(positivePlus[0], eAcute + eAcute);
const malformedPlus = /[\uFFFD]+/u.exec(
  Buffer.from([0x80, 0x81, 0x61]).toString());
assert.strictEqual(malformedPlus.index, 0);
assert.strictEqual(malformedPlus[0].length, 2);

const stickyPlus = /[^é]+/uy;
stickyPlus.lastIndex = 2;
assert.strictEqual(stickyPlus.exec(eAcute + cjk + cjk)[0], cjk + cjk);
stickyPlus.lastIndex = 0;
assert.strictEqual(stickyPlus.exec(eAcute + cjk), null);

const negatedStar = /[^é]*/u.exec(cjk + cjk + eAcute);
assert.strictEqual(negatedStar.index, 0);
assert.strictEqual(negatedStar[0], cjk + cjk);
const positiveStar = /[é]*/u.exec(eAcute + eAcute + cjk);
assert.strictEqual(positiveStar.index, 0);
assert.strictEqual(positiveStar[0], eAcute + eAcute);
assert.strictEqual(/[é]*/u.exec(cjk)[0], '');

const malformedStarSubject = Buffer.from([0x80, 0x61, 0x81]).toString();
const malformedStarMatches = Array.from(
  malformedStarSubject.matchAll(/[\uFFFD]*/gu));
assert.deepStrictEqual(
  malformedStarMatches.map((match) => match.index), [0, 1, 2, 3]);
assert.deepStrictEqual(
  malformedStarMatches.map((match) => match[0].length), [1, 0, 1, 0]);
assert.strictEqual(
  malformedStarSubject.replace(/[\uFFFD]*/gu, 'X'), 'XXaXX');

const continuationStarMatches = Array.from(eAcute.matchAll(/[\uFFFD]*/gu));
assert.deepStrictEqual(
  continuationStarMatches.map((match) => match.index), [0, 1, 2]);
assert.deepStrictEqual(
  continuationStarMatches.map((match) => match[0].length), [0, 1, 0]);
assert.strictEqual(continuationStarMatches[1][0].charCodeAt(0), 0xa9);

const asciiStarSubject = cjk + '\n' + cjk;
const asciiStarMatches = Array.from(asciiStarSubject.matchAll(/[^\n]*/gu));
assert.deepStrictEqual(
  asciiStarMatches.map((match) => match.index), [0, 3, 4, 7]);
assert.deepStrictEqual(
  asciiStarMatches.map((match) => match[0]), [cjk, '', cjk, '']);

const stickyStar = /[^é]*/uy;
stickyStar.lastIndex = 2;
assert.strictEqual(stickyStar.exec(eAcute + cjk + cjk)[0], cjk + cjk);
stickyStar.lastIndex = 0;
assert.strictEqual(stickyStar.exec(eAcute + cjk)[0], '');

const indexedStar = /[^é]*/du.exec(cjk + eAcute);
assert.deepStrictEqual(indexedStar.indices[0], [0, 3]);

const negatedOptional = /[^é]?/u.exec(cjk + eAcute);
assert.strictEqual(negatedOptional.index, 0);
assert.strictEqual(negatedOptional[0], cjk);
const positiveOptional = /[é]?/u.exec(eAcute + cjk);
assert.strictEqual(positiveOptional.index, 0);
assert.strictEqual(positiveOptional[0], eAcute);
assert.strictEqual(/[é]?/u.exec(cjk)[0], '');

const optionalSubject = Buffer.from([0x80, 0x81, 0x61]).toString();
const optionalMatches = Array.from(optionalSubject.matchAll(/[\uFFFD]?/gu));
assert.deepStrictEqual(
  optionalMatches.map((match) => match.index), [0, 1, 2, 3]);
assert.deepStrictEqual(
  optionalMatches.map((match) => match[0].length), [1, 1, 0, 0]);

const negatedAsciiOptionalMatches = Array.from(
  (cjk + 'a').matchAll(/[^a]?/gu));
assert.deepStrictEqual(
  negatedAsciiOptionalMatches.map((match) => match.index), [0, 3, 4]);
assert.deepStrictEqual(
  negatedAsciiOptionalMatches.map((match) => match[0]), [cjk, '', '']);

const positiveAsciiOptionalMatches = Array.from(
  (cjk + 'a').matchAll(/[a-z]?/gu));
assert.deepStrictEqual(
  positiveAsciiOptionalMatches.map((match) => match.index), [0, 1, 2, 3, 4]);
assert.deepStrictEqual(
  positiveAsciiOptionalMatches.map((match) => match[0]), ['', '', '', 'a', '']);

const stickyOptional = /[^é]?/uy;
stickyOptional.lastIndex = 2;
assert.strictEqual(stickyOptional.exec(eAcute + cjk)[0], cjk);
stickyOptional.lastIndex = 0;
assert.strictEqual(stickyOptional.exec(eAcute + cjk)[0], '');

const indexedOptional = /[^é]?/du.exec(cjk + eAcute);
assert.deepStrictEqual(indexedOptional.indices[0], [0, 3]);

const eCircumflex = String.fromCodePoint(0xea);
const positiveExact = /[é-ë]{2}/u.exec(cjk + eAcute + eCircumflex);
assert.strictEqual(positiveExact.index, 3);
assert.strictEqual(positiveExact[0], eAcute + eCircumflex);
const negatedExact = /[^a]{2}/u.exec('a' + cjk + emoji + 'a');
assert.strictEqual(negatedExact.index, 1);
assert.strictEqual(negatedExact[0], cjk + emoji);

const exactGlobalMatches = Array.from(
  eAcute.repeat(5).matchAll(/[é]{2}/gu));
assert.deepStrictEqual(
  exactGlobalMatches.map((match) => match.index), [0, 4]);
assert.deepStrictEqual(
  exactGlobalMatches.map((match) => match[0]),
  [eAcute.repeat(2), eAcute.repeat(2)]);

const stickyExact = /[^a]{2}/uy;
stickyExact.lastIndex = 1;
const continuationExact = stickyExact.exec(eAcute + 'b');
assert.strictEqual(continuationExact.index, 1);
assert.deepStrictEqual(
  Array.from({ length: continuationExact[0].length },
             (_, index) => continuationExact[0].charCodeAt(index)),
  [0xa9, 0x62]);
