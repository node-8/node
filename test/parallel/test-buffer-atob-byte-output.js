'use strict';

require('../common');
const assert = require('node:assert/strict');
const { atob, btoa } = require('node:buffer');

const byteMode = process.execArgv.includes('--experimental-node-8-string-semantics');
assert.strictEqual(String.fromCodePoint(233).length, byteMode ? 2 : 1);
assert.strictEqual(globalThis.atob, atob);
assert.strictEqual(globalThis.btoa, btoa);

let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}

function checkBytes(bytes, label) {
  const expected = String.fromCharCode(...bytes);
  const encoded = Buffer.from(bytes).toString('base64');
  const result = atob(encoded);
  equal(result.length, bytes.length, `${label}: decoded byte length`);
  for (let i = 0; i < bytes.length; i++) {
    equal(result.charCodeAt(i), bytes[i], `${label}: byte ${i}`);
  }
  equal(result, expected, `${label}: binary String`);
  equal(btoa(result), encoded, `${label}: re-encode`);
  equal(atob(btoa(expected)), expected, `${label}: reverse round trip`);
  if (byteMode) {
    equal(Buffer.from(result, 'utf8').toString('hex'),
          Buffer.from(bytes).toString('hex'), `${label}: raw Buffer output`);
  }
}

checkBytes([], 'empty');
for (let i = 0; i < 256; i++) checkBytes([i], `single ${i}`);
checkBytes(Array.from({ length: 256 }, (_, i) => i), 'all bytes');
checkBytes([0, 255, 0, 128, 0], 'embedded NUL');
checkBytes([0xc0, 0xaf, 0xe4, 0xb8, 0xff], 'malformed UTF-8');
checkBytes([0xed, 0xa0, 0x80, 0xed, 0xb0, 0x80], 'WTF-8 surrogates');
checkBytes([0xc3, 0xa9, 0xe4, 0xb8, 0xad, 0xf0, 0x9f, 0x98, 0x80], 'UTF-8');
checkBytes(Array.from({ length: 4096 }, (_, i) => i & 255), 'heap buffer');

for (const [encoded, canonical, bytes] of [
  ['', '', []],
  [' \t\n\r\f', '', []],
  [' / w = = ', '/w==', [255]],
  ['/w', '/w==', [255]],
  ['AP8', 'AP8=', [0, 255]],
  [' A\fP\t8\n=\r ', 'AP8=', [0, 255]],
  ['AAAA', 'AAAA', [0, 0, 0]],
  ['w6k=', 'w6k=', [0xc3, 0xa9]],
]) {
  const decoded = atob(encoded);
  equal(decoded, String.fromCharCode(...bytes), 'whitespace and padding');
  equal(btoa(decoded), canonical, 'canonical Base64');
}

for (const invalid of [
  'a', 'a=', 'a==', 'a===', 'AA=', 'AA===', '=AAA', 'AA=A', 'AA==A',
  'AA-A', 'AA_A', '\0', '\v', '\u00a0', '\u00e9', '\u4e2d', '\ud800',
]) {
  assert.throws(() => atob(invalid), {
    constructor: DOMException,
    name: 'InvalidCharacterError',
    code: 5,
  });
  checks++;
}
assert.throws(() => atob(), { name: 'TypeError' });
assert.throws(() => btoa(), { name: 'TypeError' });
assert.throws(() => atob(Symbol('input')), { name: 'TypeError' });
assert.throws(() => btoa(Symbol('input')), { name: 'TypeError' });
checks += 4;

for (const input of [null, NaN, Infinity, true, 1234]) {
  const bytes = Buffer.from(String(input), 'base64');
  equal(atob(input), String.fromCharCode(...bytes), 'input coercion');
}
let coercions = 0;
equal(atob({ toString() { coercions++; return '/w=='; } }),
      String.fromCharCode(255), 'object coercion');
equal(coercions, 1, 'one coercion');
equal(atob({ [Symbol.toPrimitive]: () => '/w==' }),
      String.fromCharCode(255), 'primitive coercion');
const thrown = new Error('coercion failure');
assert.throws(() => atob({ toString() { throw thrown; } }), (e) => e === thrown);
checks++;

if (byteMode) {
  // The pair is binary: textual UTF-8 is just another byte sequence here.
  equal(atob(btoa('é中😀')), 'é中😀', 'Unicode stored-byte closure');
} else {
  assert.throws(() => btoa('中'), { name: 'InvalidCharacterError' });
  checks++;
}

console.log(JSON.stringify({ profile: byteMode ? 'node8' : 'stock',
                             identity_verified: true, checks }));
