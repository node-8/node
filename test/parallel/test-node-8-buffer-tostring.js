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

for (const inputHex of [
  '',
  '616263',
  'e4b8ad',
  'f09f9880',
  '610062',
  'e228a1',
  'ff',
  '00e4b8ade228a1ff',
]) {
  const value = Buffer.from(inputHex, 'hex').toString('utf8');
  const expectedLength = inputHex.length / 2;

  assert.strictEqual(Buffer.byteLength(value, 'utf8'), expectedLength,
                     inputHex);
  assert.strictEqual(Buffer.from(value, 'utf8').toString('hex'), inputHex);

  const output = Buffer.alloc(expectedLength);
  assert.strictEqual(output.write(value, 0, output.length, 'utf8'),
                     expectedLength, inputHex);
  assert.strictEqual(output.toString('hex'), inputHex);
}

const sliced = Buffer.from('00e4b8adff', 'hex').toString('utf8', 1, 4);
assert.strictEqual(Buffer.from(sliced, 'utf8').toString('hex'), 'e4b8ad');

assert.deepStrictEqual(
  observe(Buffer.from('3dd84ddc', 'hex').toString('utf16le')),
  { length: 4, units: [0xf0, 0x9f, 0x91, 0x8d] });
assert.deepStrictEqual(
  observe(Buffer.from('00d8', 'hex').toString('utf16le')),
  { length: 3, units: [0xed, 0xa0, 0x80] });
assert.deepStrictEqual(
  observe(Buffer.from('00dc', 'hex').toString('utf16le')),
  { length: 3, units: [0xed, 0xb0, 0x80] });
