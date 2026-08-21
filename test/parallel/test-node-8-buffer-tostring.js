// Flags: --experimental-node-8-string-semantics
'use strict';

require('../common');
const assert = require('assert');
const fixtures = require('../common/fixtures');

const matrix = JSON.parse(fixtures.readSync([
  'node-8',
  'string-semantics-buffer-to-string.json',
], 'utf8'));

assert.strictEqual(matrix.schemaVersion, 1);
assert.strictEqual(matrix.specVersion, 'node-8-string-semantics-0');

function observe(value) {
  return {
    length: value.length,
    units: Array.from(
      { length: value.length }, (_, index) => value.charCodeAt(index)),
  };
}

for (const testCase of matrix.cases) {
  const value = Buffer.from(testCase.inputHex, 'hex').toString('utf8');
  assert.deepStrictEqual(
    observe(value), testCase.expected['node-8'], testCase.id);
}

assert.deepStrictEqual(
  observe(Buffer.from('00e4b8adff', 'hex').toString('utf8', 1, 4)),
  { length: 3, units: [0xe4, 0xb8, 0xad] });

const shared = new SharedArrayBuffer(3);
new Uint8Array(shared).set([0xe4, 0xb8, 0xad]);
assert.deepStrictEqual(
  observe(Buffer.from(shared).toString('utf8')),
  { length: 3, units: [0xe4, 0xb8, 0xad] });
