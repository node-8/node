'use strict';
// Flags: --experimental-node-8-string-semantics --expose-gc

const common = require('../../common');
const assert = require('assert');
const { gcUntil } = require('../../common/gc');
const testString = require(`./build/${common.buildType}/test_string`);

const representableCases = [
  ['', 0],
  ['abc', 3],
  ['é', 1],
  ['ÿ', 1],
];

for (const [input, latin1Length] of representableCases) {
  assert.strictEqual(testString.TestLatin1(input), input);
  assert.strictEqual(testString.TestLatin1AutoLength(input), input);
  assert.strictEqual(testString.TestPropertyKeyLatin1(input), input);
  assert.strictEqual(testString.TestPropertyKeyLatin1AutoLength(input), input);
  assert.strictEqual(testString.Latin1Length(input), latin1Length);
}

assert.strictEqual(testString.TestLatin1('中'), '-');
assert.strictEqual(testString.TestLatin1('😀'), '=\0');
assert.strictEqual(testString.TestLatin1AutoLength('😀'), '=');
assert.strictEqual(
  testString.TestLatin1(String.fromCodePoint(0xD800)),
  '\0');
assert.strictEqual(
  testString.TestLatin1AutoLength(String.fromCodePoint(0xD800)),
  '');
assert.strictEqual(testString.TestLatin1('é'.substring(1)), 'ý');
assert.strictEqual(testString.TestLatin1Insufficient('é中😀'), 'é-=');

(async () => {
  let external = testString.TestLatin1External('éÿ');
  let externalAuto = testString.TestLatin1ExternalAutoLength('éÿ');
  assert.strictEqual(external, 'éÿ');
  assert.strictEqual(externalAuto, 'éÿ');
  assert.strictEqual(testString.GetExternalLatin1FinalizeCount(), 0);

  global.gc();
  assert.strictEqual(external, 'éÿ');
  assert.strictEqual(externalAuto, 'éÿ');
  assert.strictEqual(testString.GetExternalLatin1FinalizeCount(), 0);

  external = null;
  externalAuto = null;
  await gcUntil('external Latin-1 string finalizers',
                () => testString.GetExternalLatin1FinalizeCount() === 2);
})().then(common.mustCall());
