// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { registerHooks } = require('node:module');
const { isMainThread } = require('node:worker_threads');
const { stripBOM } = require('internal/modules/helpers');
const tmpdir = require('../common/tmpdir');

assert.strictEqual(isMainThread, true);
const byteMode = process.execArgv.includes('--experimental-node-8-string-semantics');
const profile = byteMode ? 'node8' : 'stock';
assert.strictEqual(String.fromCodePoint(233).length, byteMode ? 2 : 1);
console.log(JSON.stringify({ kind: 'profile', profile, identity_verified: true }));

let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}

function sameBytes(actual, expected) {
  assert.deepStrictEqual(Array.from(Buffer.from(actual)), expected);
  checks++;
}

const sync = common.mustCall(() => {
  equal(stripBOM('\ufefftext'), 'text', 'JSON_BOM_PREFIX');
  for (const value of ['', 'ASCII', 'é中😀', 'x\ufefftext', '\u00ef\u00bb\u00bftext',
                       '\ud800', '\udfff', '\ufffe', '\uffff']) {
    equal(stripBOM(value), value, 'non-BOM input');
  }
  equal(stripBOM('\ufeff'), '', 'BOM only');
  equal(stripBOM('\ufeff\ufefftext'), '\ufefftext', 'one BOM only');

  // Independent exact-byte oracle: mutate each BOM position over all 256 bytes.
  // In stock these are Latin-1 characters, never U+FEFF. In node-8 only the
  // unchanged EF BB BF triple is a complete BOM.
  for (let position = 0; position < 3; position++) {
    for (let value = 0; value < 256; value++) {
      const prefix = [0xef, 0xbb, 0xbf];
      prefix[position] = value;
      const input = String.fromCharCode(...prefix) + 'tail';
      const isBOM = byteMode && prefix[0] === 0xef && prefix[1] === 0xbb && prefix[2] === 0xbf;
      equal(stripBOM(input), isBOM ? 'tail' : input, 'mutated prefix');
      if (byteMode) sameBytes(stripBOM(input), isBOM ? [116, 97, 105, 108] : [...prefix, 116, 97, 105, 108]);
    }
  }

  for (let value = 0; value < 256; value++) {
    const suffix = String.fromCharCode(value) + 'Z';
    equal(stripBOM('\ufeff' + suffix), suffix, 'suffix unit is untouched');
    if (byteMode) sameBytes(stripBOM('\ufeff' + suffix), [value, 90]);
  }
  if (byteMode) {
    for (const bytes of [[0xef], [0xef, 0xbb], [0xef, 0xbb, 0x80], [0xef, 0xbf, 0xbf],
                         [0x80], [0xff], [0xed, 0xa0, 0x80], [0xf0, 0x9f, 0x98]]) {
      const raw = String.fromCharCode(...bytes);
      equal(stripBOM(raw), raw, 'raw prefix is unchanged');
      sameBytes(stripBOM('\ufeff' + raw), bytes);
    }
  }

  // Call the retained helper while public methods are replaced, then restore
  // before assertions and logging so the test does not affect its own harness.
  const savedCharCodeAt = String.prototype.charCodeAt;
  const savedCodePointAt = String.prototype.codePointAt;
  const savedSlice = String.prototype.slice;
  const unexpected = common.mustNotCall('stripBOM must use captured primordials');
  let stripped;
  let unchanged;
  try {
    String.prototype.charCodeAt = unexpected;
    String.prototype.codePointAt = unexpected;
    String.prototype.slice = unexpected;
    stripped = stripBOM('\ufeffpayload');
    unchanged = stripBOM('\u00ef\u00bb\u00bfpayload');
  } finally {
    String.prototype.charCodeAt = savedCharCodeAt;
    String.prototype.codePointAt = savedCodePointAt;
    String.prototype.slice = savedSlice;
  }
  equal(stripped, 'payload', 'primordial BOM handling');
  equal(unchanged, '\u00ef\u00bb\u00bfpayload', 'primordial non-BOM handling');
});
sync();

tmpdir.refresh();
const payload = { value: 'é中😀', ok: true };
const json = JSON.stringify(payload);
for (const name of ['cjs', 'esm', 'string-hook']) {
  fs.writeFileSync(tmpdir.resolve(`${name}.json`), '\ufeff' + json);
}
fs.writeFileSync(tmpdir.resolve('double.json'), '\ufeff\ufeff' + json);
fs.writeFileSync(tmpdir.resolve('plain.json'), json);
fs.mkdirSync(tmpdir.resolve('package'));
fs.writeFileSync(tmpdir.resolve('package/package.json'), '\ufeff{"main":"index.cjs"}');
fs.writeFileSync(tmpdir.resolve('package/index.cjs'), `module.exports = ${json};`);

const cjs = require(tmpdir.resolve('cjs.json'));
assert.deepStrictEqual(cjs, payload);
assert.strictEqual(require(tmpdir.resolve('cjs.json')), cjs);
assert.deepStrictEqual(require(tmpdir.resolve('plain.json')), payload);
assert.deepStrictEqual(require(tmpdir.resolve('package')), payload);
assert.deepStrictEqual(require(tmpdir.resolve('package/package.json')), { main: 'index.cjs' });
assert.throws(() => require(tmpdir.resolve('double.json')), { name: 'SyntaxError' });

(async () => {
  const importedCJS = await import(tmpdir.fileURL('cjs.json'), { with: { type: 'json' } });
  assert.strictEqual(importedCJS.default, cjs);
  const esmURL = tmpdir.fileURL('esm.json');
  const esm = await import(esmURL, { with: { type: 'json' } });
  assert.deepStrictEqual(esm.default, payload);
  assert.strictEqual(require(tmpdir.resolve('esm.json')), esm.default);

  const hookURL = tmpdir.fileURL('string-hook.json');
  const doubleURL = new URL(hookURL);
  doubleURL.search = '?double';
  const hook = registerHooks({
    load: common.mustCall((url, context, nextLoad) => {
      if (url !== hookURL.href && url !== doubleURL.href) return nextLoad(url, context);
      return { format: 'json', source: (url === doubleURL.href ? '\ufeff\ufeff' : '\ufeff') + json,
               shortCircuit: true };
    }, 2),
  });
  try {
    const fromString = await import(hookURL, { with: { type: 'json' } });
    assert.deepStrictEqual(fromString.default, payload);
    assert.strictEqual(require(tmpdir.resolve('string-hook.json')), fromString.default);
    await assert.rejects(import(doubleURL, { with: { type: 'json' } }), { name: 'SyntaxError' });
  } finally {
    hook.deregister();
  }
})().then(common.mustCall(() => {
  console.log(JSON.stringify({ kind: 'summary', profile, helper_checks: checks,
                               public_modules: true, primordial_calls: true }));
}));
