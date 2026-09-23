'use strict';

const common = require('../common');
common.expectWarning('DeprecationWarning',
                     'The `punycode` module is deprecated. Please use a userland alternative instead.',
                     'DEP0040');
const assert = require('node:assert/strict');
const p = require('node:punycode');
const byteMode = process.execArgv.includes('--experimental-node-8-string-semantics');
assert.strictEqual(String.fromCodePoint(233).length, byteMode ? 2 : 1);
let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}

function points(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, label);
  checks++;
}

for (const [value, encoded, decodedPoints] of [
  ['', '', []], ['ASCII', 'ASCII-', [65, 83, 67, 73, 73]],
  ['mañana', 'maana-pta', [109, 97, 241, 97, 110, 97]],
  ['ü', 'tda', [252]], ['Bücher', 'Bcher-kva', [66, 252, 99, 104, 101, 114]],
  ['日本語', 'wgv71a119e', [26085, 26412, 35486]],
  ['中文', 'fiq228c', [20013, 25991]], ['😀', 'e28h', [128512]],
]) {
  points(p.ucs2.decode(value), decodedPoints, 'Unicode code points');
  equal(p.encode(value), encoded, 'known Punycode vector');
  equal(p.decode(encoded), value, 'known vector decoding');
  equal(p.decode(p.encode(value)), value, 'Punycode closure');
  equal(p.ucs2.encode(p.ucs2.decode(value)), value, 'code-point closure');
}

for (const cp of [0, 1, 32, 127, 128, 233, 0x7ff, 0x800, 0xd7ff, 0xd800,
                  0xdbff, 0xdc00, 0xdfff, 0xe000, 0xfffd, 0xffff, 0x10000, 0x10ffff]) {
  for (const prefix of ['', 'a', 'ascii-prefix-'.repeat(16)]) {
    const value = prefix + String.fromCodePoint(cp) + 'tail';
    const expected = [...prefix].map((c) => c.codePointAt(0)).concat(cp, 116, 97, 105, 108);
    points(p.ucs2.decode(value), expected, 'Unicode boundary');
    equal(p.decode(p.encode(value)), value, 'boundary closure');
  }
}

for (const separator of ['.', '\u3002', '\uff0e', '\uff61']) {
  equal(p.toASCII(`mañana${separator}中文`), 'xn--maana-pta.xn--fiq228c', 'domain labels');
  equal(p.toUnicode('xn--maana-pta.xn--fiq228c'), 'mañana.中文', 'domain inverse');
}
equal(p.toASCII('名字@mañana.com'), '名字@xn--maana-pta.com', 'email local part');
equal(p.toUnicode('名字@xn--maana-pta.com'), '名字@mañana.com', 'email inverse');
equal(p.toASCII('EXAMPLE.com'), 'EXAMPLE.com', 'ASCII case unchanged');
assert.throws(() => p.decode(' '), RangeError);
assert.throws(() => p.decode('α-'), RangeError);
checks += 2;

if (byteMode) {
  for (const [bytes, expected] of [
    [[0x80], [0xfffd]], [[0xff], [0xfffd]],
    [[0xc0, 0xaf], [0xfffd, 0xfffd]], [[0xe4, 0xb8], [0xfffd]],
    [[0xf0, 0x9f, 0x98], [0xfffd]],
    [[0xe0, 0x80, 0x80], [0xfffd, 0xfffd, 0xfffd]],
    [[0xf4, 0x90, 0x80, 0x80], [0xfffd, 0xfffd, 0xfffd, 0xfffd]],
    [[0xed, 0xa0, 0x80], [0xd800]],
    [[0xed, 0xa0, 0x80, 0xed, 0xb0, 0x80], [0xd800, 0xdc00]],
    [[0xe4, 0xb8, 0xad, 0xff, 0x61], [0x4e2d, 0xfffd, 97]],
  ]) {
    for (const prefix of ['', 'ASCII']) {
      const value = prefix + String.fromCharCode(...bytes);
      const values = [...prefix].map((c) => c.codePointAt(0)).concat(expected);
      points(p.ucs2.decode(value), values, 'malformed/WTF-8 decoder policy');
      equal(p.decode(p.encode(value)), String.fromCodePoint(...values), 'replacement closure');
    }
  }

  const iterator = String.prototype[Symbol.iterator];
  try {
    String.prototype[Symbol.iterator] = () => { throw new Error('ASCII must not iterate'); };
    points(p.ucs2.decode('ASCII\0'), [65, 83, 67, 73, 73, 0], 'ASCII avoids iterator');
  } finally {
    String.prototype[Symbol.iterator] = iterator;
  }
}

console.log(JSON.stringify({ profile: byteMode ? 'node8' : 'stock',
                             identity_verified: true, checks }));
