'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { startupSnapshot } = require('node:v8');

// Populate the public cache before serialization, including the tested pattern.
assert.equal(path.matchesGlob('A.txt', '?.txt'), true);
assert.equal(path.matchesGlob('AB.txt', '??.txt'), true);
startupSnapshot.setDeserializeMainFunction(() => {
  const profile = process.argv.at(-1);
  const byteMode = profile === 'node8';
  assert.equal(String.fromCodePoint(233).length, byteMode ? 2 : 1);
  assert.equal(path.matchesGlob('é.txt', '?.txt'), true);
  assert.equal(path.matchesGlob('中.txt', '?.txt'), true);
  assert.equal(path.matchesGlob('😀.txt', '?.txt'), byteMode);
  assert.equal(path.matchesGlob('😀.txt', '??.txt'), !byteMode);
  console.log(JSON.stringify({ kind: 'glob_snapshot', profile, passed: true }));
});
