// Flags: --experimental-node-8-string-semantics
'use strict';

require('../common');
const assert = require('assert');
const childProcess = require('child_process');
const fixtures = require('../common/fixtures');

function byteValues(value) {
  return Array.from(
    { length: value.length }, (_, index) => value.charCodeAt(index));
}

const literal = 'É中😀';
const literalHex = 'c389e4b8adf09f9880';
assert.strictEqual(literal.length, 9);
assert.deepStrictEqual(
  byteValues(literal),
  [0xc3, 0x89, 0xe4, 0xb8, 0xad, 0xf0, 0x9f, 0x98, 0x80]);
assert.strictEqual(Buffer.from(literal, 'utf8').toString('hex'), literalHex);
assert.strictEqual(
  Buffer.from(literalHex, 'hex').toString('utf8'), literal);

assert.deepStrictEqual(byteValues('\xE9'), [0xe9]);
assert.deepStrictEqual(byteValues('\u00E9'), [0xc3, 0xa9]);
assert.strictEqual(Buffer.from('\xE9', 'utf8').toString('hex'), 'e9');
assert.strictEqual(Buffer.from('\u00E9', 'utf8').toString('hex'), 'c3a9');

const child = childProcess.spawnSync(
  process.execPath,
  [
    '--experimental-node-8-string-semantics',
    fixtures.path('node-8', 'source-literal-stderr.js'),
  ]);
assert.ifError(child.error);
assert.strictEqual(child.status, 0, child.stderr.toString('hex'));
assert.strictEqual(
  child.stderr.toString('hex'),
  'c3897461742c20e4b8ade6968720f09f98800a');

const assertion = childProcess.spawnSync(
  process.execPath,
  [
    '--experimental-node-8-string-semantics',
    fixtures.path('node-8', 'source-literal-assertion.js'),
  ],
  { encoding: 'utf8' });
assert.ifError(assertion.error);
assert.strictEqual(assertion.status, 1);
assert.match(assertion.stderr, /AssertionError/);
assert.doesNotMatch(assertion.stderr, /Invalid regular expression/);

// Byte-oriented failures can contain non-UTF-8 output. The Python test runner
// must still collect the result instead of losing its worker thread.
process.stdout.write(Buffer.from([0xff]));
