#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const matrixPath = path.join(
  __dirname,
  '../../test/fixtures/node-8/string-semantics-buffer-to-string.json');
const profile = process.argv[2] || 'stock';

if (profile !== 'stock' && profile !== 'node-8') {
  console.error('Usage: node tools/node-8/string-semantics.js [stock|node-8]');
  process.exitCode = 2;
} else {
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  assert.strictEqual(matrix.schemaVersion, 1);
  assert.strictEqual(matrix.specVersion, 'node-8-string-semantics-0');

  let failures = 0;
  for (const testCase of matrix.cases) {
    const input = Buffer.from(testCase.inputHex, 'hex');
    assert.strictEqual(input.length * 2, testCase.inputHex.length);

    const value = input.toString('utf8');
    const actual = {
      length: value.length,
      units: Array.from(
        { length: value.length }, (_, index) => value.charCodeAt(index)),
    };

    try {
      assert.deepStrictEqual(actual, testCase.expected[profile]);
      console.log(`PASS ${testCase.id}`);
    } catch {
      failures++;
      console.error(`FAIL ${testCase.id}`);
      console.error(`  expected: ${JSON.stringify(testCase.expected[profile])}`);
      console.error(`  actual:   ${JSON.stringify(actual)}`);
    }
  }

  if (failures === 0) {
    console.log(
      `${matrix.specVersion}: ${matrix.cases.length} ${profile} cases passed`);
  } else {
    console.error(
      `${matrix.specVersion}: ${failures}/${matrix.cases.length} ` +
      `${profile} cases failed`);
    process.exitCode = 1;
  }
}
