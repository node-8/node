'use strict';

const assert = require('node:assert/strict');
const { startupSnapshot } = require('node:v8');
// --expose-internals makes this existing builtin accessible without loading an
// unsupported userland module through the snapshot builder's require wrapper.
const { stripBOM } = process.getBuiltinModule('internal/modules/helpers');
const savedWidth = String.fromCodePoint(233).length;
const profile = process.env.NODE8_JSON_BOM_PROFILE;
assert.ok(profile === 'stock' || profile === 'node8');
assert.strictEqual(savedWidth, profile === 'node8' ? 2 : 1);
assert.strictEqual(stripBOM('ASCII'), 'ASCII');
console.log(JSON.stringify({ kind: 'snapshot_build', profile, identity_verified: true }));

startupSnapshot.setDeserializeMainFunction(() => {
  const profile = process.argv.at(-1);
  assert.ok(profile === 'stock' || profile === 'node8');
  const width = profile === 'node8' ? 2 : 1;
  assert.strictEqual(String.fromCodePoint(233).length, width);
  assert.strictEqual(savedWidth, width);
  assert.strictEqual(process.getBuiltinModule('internal/modules/helpers').stripBOM, stripBOM);
  console.log(JSON.stringify({ kind: 'snapshot_profile', profile, identity_verified: true }));
  assert.strictEqual(stripBOM('\ufeffpayload'), 'payload', 'JSON_BOM_SNAPSHOT_PREFIX');
  assert.strictEqual(stripBOM('\ufeff\ufeffpayload'), '\ufeffpayload');
  assert.strictEqual(stripBOM('\u00ef\u00bb\u00bfpayload'), '\u00ef\u00bb\u00bfpayload');
  const suffix = String.fromCharCode(0xff, 0x80, 0x00);
  assert.strictEqual(stripBOM('\ufeff' + suffix), suffix);
  if (profile === 'node8') {
    assert.deepStrictEqual(Array.from(Buffer.from(stripBOM('\ufeff' + suffix))), [0xff, 0x80, 0x00]);
  }
  console.log(JSON.stringify({ kind: 'snapshot_summary', profile, retained_helper: true }));
});
