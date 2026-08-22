#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const matrixPath = path.join(
  __dirname,
  '../../test/fixtures/node-8/string-semantics-core.json');
const profile = process.argv[2] || 'stock';

function observeString(value) {
  return {
    length: value.length,
    units: Array.from(
      { length: value.length }, (_, index) => value.charCodeAt(index)),
    utf8Hex: Buffer.from(value, 'utf8').toString('hex'),
  };
}

const operations = {
  'source-literal-e-acute': () => observeString('é'),
  'byte-escape-e9': () => observeString('\xE9'),
  'unicode-escape-e-acute': () => observeString('\u00E9'),
  'from-char-code-byte': () => observeString(String.fromCharCode(0xE9)),
  'from-char-code-truncates': () =>
    observeString(String.fromCharCode(0x4E2D)),
  'from-code-point-e-acute': () =>
    observeString(String.fromCodePoint(0xE9)),
  'byte-coordinate-closure': () => {
    const subject = 'é中文Z';
    const needle = '中文';
    const index = subject.indexOf(needle);
    const slice = subject.slice(index, index + needle.length);
    return {
      index,
      needleLength: needle.length,
      sliceLength: slice.length,
      sliceUnits: Array.from(
        { length: slice.length }, (_, offset) => slice.charCodeAt(offset)),
      sliceEqualsNeedle: slice === needle,
    };
  },
  'code-point-at-continuation': () => {
    const value = 'é';
    return {
      atStart: value.codePointAt(0) ?? null,
      atContinuation: value.codePointAt(1) ?? null,
    };
  },
  'buffer-invalid-round-trip': () => {
    const value = Buffer.from('e228a1', 'hex').toString('utf8');
    return {
      ...observeString(value),
      byteLength: Buffer.byteLength(value, 'utf8'),
    };
  },
  'raw-default-comparison': () => {
    const supplementary = String.fromCodePoint(0x10000);
    const bmp = String.fromCodePoint(0xE000);
    return {
      supplementaryBeforeBmp: supplementary < bmp,
      bmpBeforeSupplementary: bmp < supplementary,
    };
  },
  'regexp-dot-emoji': () => {
    // The unescaped dot is the behavior this contract case exercises.
    // eslint-disable-next-line node-core/no-unescaped-regexp-dot
    const dot = /./g;
    return Array.from('😀'.matchAll(dot), ({ 0: match, index }) => ({
      index,
      length: match.length,
      units: Array.from(
        { length: match.length }, (_, offset) => match.charCodeAt(offset)),
    }));
  },
  'regexp-byte-offset-closure': () => {
    const subject = 'é中';
    const match = /中/.exec(subject);
    assert(match !== null);
    return {
      index: match.index,
      matchLength: match[0].length,
      sliceEqualsMatch:
        subject.slice(match.index, match.index + match[0].length) === match[0],
    };
  },
  'surrogate-concatenation-preserves-bytes': () =>
    observeString(
      String.fromCodePoint(0xD83D) + String.fromCodePoint(0xDE00)),
};

if (profile !== 'stock' && profile !== 'node-8') {
  console.error(
    'Usage: node tools/node-8/string-semantics-core.js [stock|node-8]');
  process.exitCode = 2;
} else {
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  assert.strictEqual(matrix.schemaVersion, 1);
  assert.strictEqual(matrix.specVersion, 'node-8-string-semantics-0');

  let failures = 0;
  for (const testCase of matrix.cases) {
    const operation = operations[testCase.operation];
    assert.strictEqual(
      typeof operation, 'function', `unknown operation: ${testCase.operation}`);

    let actual;
    try {
      actual = operation();
      assert.deepStrictEqual(actual, testCase.expected[profile]);
      console.log(`PASS ${testCase.id}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${testCase.id}`);
      console.error(
        `  expected: ${JSON.stringify(testCase.expected[profile])}`);
      if (actual === undefined) {
        console.error(`  threw:    ${error.name}: ${error.message}`);
      } else {
        console.error(`  actual:   ${JSON.stringify(actual)}`);
      }
    }
  }

  if (failures === 0) {
    console.log(
      `${matrix.specVersion}: ${matrix.cases.length} ${profile} core cases ` +
      'passed');
  } else {
    console.error(
      `${matrix.specVersion}: ${failures}/${matrix.cases.length} ${profile} ` +
      'core cases failed');
    process.exitCode = 1;
  }
}
