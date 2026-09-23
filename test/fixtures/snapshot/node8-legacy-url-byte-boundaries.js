'use strict';

const assert = require('node:assert/strict');
const { startupSnapshot } = require('node:v8');
const url = require('node:url');
const profile = process.env.NODE8_LEGACY_URL_PROFILE;
assert.ok(profile === 'stock' || profile === 'node8');
const savedWidth = 'é'.length;
assert.strictEqual(savedWidth, profile === 'node8' ? 2 : 1);
const savedParse = url.parse;
const savedFormat = url.format;
// Warm the option paths without relying on the not-yet-fixed old boundaries.
assert.strictEqual(savedParse('https://example.test/é').pathname, '/é');
assert.strictEqual(savedFormat({ protocol: 'https:', host: 'example.test', auth: 'u:p' }),
                   'https://u:p@example.test');
console.log(JSON.stringify({ kind: 'snapshot_build', profile, identity_verified: true }));
startupSnapshot.setDeserializeMainFunction(() => {
  const profile = process.argv.at(-1);
  assert.ok(profile === 'stock' || profile === 'node8');
  assert.strictEqual('é'.length, profile === 'node8' ? 2 : 1);
  assert.strictEqual('é'.charCodeAt(0), profile === 'node8' ? 0xC3 : 0xE9);
  assert.strictEqual(savedWidth, 'é'.length);
  assert.strictEqual(require('node:url').parse, savedParse);
  assert.strictEqual(require('node:url').format, savedFormat);
  console.log(JSON.stringify({ kind: 'snapshot_profile', profile, identity_verified: true }));
  assert.strictEqual(savedParse('\u00A0https://example.test/Ġ\uFEFF').href,
                     'https://example.test/Ġ', 'LEGACY_URL_SNAPSHOT_TRIM');
  assert.strictEqual(savedFormat({ protocol: 'https:', host: 'example.test', auth: 'é:中😀' }),
                     'https://%C3%A9:%E4%B8%AD%F0%9F%98%80@example.test',
                     'LEGACY_URL_SNAPSHOT_AUTH');
  if (profile === 'node8') {
    const value = String.fromCharCode(0xA0, 0xEF, 0xBB);
    assert.strictEqual(savedParse(`https://example.test/x${value}`).pathname, `/x${value}`);
  }
  console.log(JSON.stringify({ kind: 'snapshot_summary', profile, retained_functions: true }));
});
