'use strict';

require('../common');
const assert = require('node:assert/strict');
const qs = require('node:querystring');
const { format } = require('node:url');

const byteMode = process.execArgv.includes('--experimental-node-8-string-semantics');
assert.strictEqual(String.fromCodePoint(233).length, byteMode ? 2 : 1);
let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}
const safe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()";
function encodeBytes(bytes) {
  let result = '';
  for (const byte of bytes) {
    const unit = String.fromCharCode(byte);
    result += safe.includes(unit) ? unit : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return result;
}

for (const value of ['', 'ASCII', 'é', '中文', '😀', 'é中😀', '\0&=+?# %',
                     '\u007f\u0080\u07ff\u0800\ud7ff\ue000\uffff',
                     String.fromCodePoint(0x10000, 0x10ffff)]) {
  const expected = encodeBytes(Buffer.from(value, 'utf8'));
  equal(qs.escape(value), expected, 'Unicode encoding');
  equal(qs.unescape(qs.escape(value)), value, 'Unicode unescape closure');
  equal(qs.parse(qs.stringify({ key: value })).key, value, 'Unicode parse closure');
  equal(qs.parse(qs.stringify({ [value]: 'value' }))[value], 'value', 'Unicode key closure');
  equal(format({ pathname: '/', query: { key: value } }),
        `/?key=${expected}`, 'legacy URL format');
}

for (const [sep, eq] of [['&', '='], ['&&', '=='], [';', ':']]) {
  const input = { ['键😀']: ['é', '中文', '', '&=+'], empty: '', number: 42,
                  bool: false, nil: null };
  const parsed = qs.parse(qs.stringify(input, sep, eq), sep, eq);
  assert.deepStrictEqual(parsed['键😀'], input['键😀']);
  checks++;
  equal(parsed.empty, '', 'empty value');
  equal(parsed.number, '42', 'numeric value');
  equal(parsed.bool, 'false', 'boolean value');
  equal(parsed.nil, '', 'null value');
}

let calls = 0;
equal(qs.escape({ toString() { calls++; return 'é'; } }), '%C3%A9', 'object coercion');
equal(calls, 1, 'single coercion');
equal(qs.escape({ toString: 0, valueOf: () => '中' }), '%E4%B8%AD', 'valueOf');
assert.throws(() => qs.escape(Symbol('input')), TypeError);
checks++;
const sentinel = new Error('coercion failure');
assert.throws(() => qs.escape({ toString() { throw sentinel; } }), (e) => e === sentinel);
checks++;

const received = [];
const custom = (value) => { received.push(value); return `[${value}]`; };
equal(qs.stringify({ key: ['é', '中'] }, '&', '=', { encodeURIComponent: custom }),
      '[key]=[é]&[key]=[中]', 'custom encoder');
assert.deepStrictEqual(received, ['key', 'é', '中']);
checks++;
const oldEscape = qs.escape;
try {
  qs.escape = (value) => `(${value})`;
  equal(qs.stringify({ key: 'é' }), '(key)=(é)', 'public encoder override');
} finally {
  qs.escape = oldEscape;
}

if (byteMode) {
  const inputs = [
    [0, 0xff, 0], [0xc0, 0xaf], [0xe4, 0xb8], [0xf0, 0x9f, 0x98],
    [0xed, 0xa0, 0x80], [0xed, 0xb0, 0x80],
    [0xed, 0xa0, 0x80, 0xed, 0xb0, 0x80],
    Array.from({ length: 256 }, (_, i) => i),
  ];
  for (let i = 0; i < 256; i++) inputs.push([i]);
  for (const bytes of inputs) {
    const value = String.fromCharCode(...bytes);
    const encoded = qs.escape(value);
    equal(encoded, encodeBytes(bytes), 'raw byte encoding');
    equal(qs.unescape(encoded), value, 'raw unescape closure');
    equal(qs.parse(qs.stringify({ value })).value, value, 'raw parse closure');
    equal(qs.parse(qs.stringify({ [value]: value }))[value], value, 'raw key closure');
  }
  const high = String.fromCodePoint(0xd800);
  equal(qs.escape(high), '%ED%A0%80', 'WTF-8 constructor');
  equal(qs.unescape(qs.escape(high)), high, 'WTF-8 closure');
} else {
  assert.throws(() => qs.escape(String.fromCodePoint(0xd800)), { code: 'ERR_INVALID_URI' });
  checks++;
}

console.log(JSON.stringify({ profile: byteMode ? 'node8' : 'stock',
                             identity_verified: true, checks }));
