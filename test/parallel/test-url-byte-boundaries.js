'use strict';

require('../common');
const assert = require('node:assert/strict');
const url = require('node:url');

const profile = process.env.NODE8_LEGACY_URL_PROFILE;
assert.ok(profile === 'stock' || profile === 'node8');
const byteMode = profile === 'node8';
assert.strictEqual('é'.length, byteMode ? 2 : 1);
assert.strictEqual('é'.charCodeAt(0), byteMode ? 0xC3 : 0xE9);
assert.strictEqual('😀'.length, byteMode ? 4 : 2);
console.log(JSON.stringify({ kind: 'profile', profile, identity_verified: true }));
const phase = process.env.NODE8_LEGACY_URL_PHASE || 'all';
assert.ok(['all', 'auth', 'trim'].includes(phase));
let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}

const host = 'https://example.test';
function formatAuth(auth) {
  return url.format({ protocol: 'https:', hostname: 'example.test', auth, pathname: '/p' });
}
// Independent table: legacy auth leaves ASCII ':' unescaped, but not '@' or '/'.
const safe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'():";
function encodeAuth(bytes) {
  let result = '';
  for (const byte of bytes) {
    const unit = String.fromCharCode(byte);
    result += byte < 0x80 && safe.includes(unit) ? unit :
      `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return result;
}

if (phase !== 'trim') {
  for (const auth of ['é:中😀', 'ASCII:password', 'u:p@ss', 'u:/?#[]%',
                      'é', '中', '😀', 'a\0b:\t\r\n', 'u: \u00A0\uFEFF',
                      'u:\u007f\u0080\u07ff\u0800\ud7ff\ue000\uffff',
                      `u:${String.fromCodePoint(0x10000, 0x10FFFF)}`]) {
    const expected = `https://${encodeAuth(Buffer.from(auth))}@example.test/p`;
    equal(formatAuth(auth), expected, 'LEGACY_URL_AUTH_ENCODING');
    const parsed = url.parse(expected);
    equal(parsed.auth, auth, 'auth decoding');
    equal(parsed.href, expected, 'parsed auth href');
    equal(parsed.format(), expected, 'Url instance formatting');
    equal(url.format(parsed), expected, 'format parsed auth');
    equal(url.parse(url.format(parsed)).auth, auth, 'auth round trip');
    equal(url.resolve(expected, '/next'),
          `https://${encodeAuth(Buffer.from(auth))}@example.test/next`, 'auth resolve');
    equal(new url.URL(expected).href, expected, 'WHATWG control');
  }
  equal(formatAuth(''), `${host}/p`, 'empty auth');
  equal(url.format({ protocol: 'https:', hostname: 'example.test', pathname: '/p' }),
        `${host}/p`, 'absent auth');
  if (byteMode) {
    const sequences = [
      [0xC0, 0xAF], [0xE4, 0xB8], [0xF0, 0x9F, 0x98],
      [0xED, 0xA0, 0x80], [0xED, 0xB0, 0x80],
      [0xED, 0xA0, 0x80, 0xED, 0xB0, 0x80],
      Array.from({ length: 256 }, (_, i) => i),
    ];
    for (let byte = 0; byte < 256; byte++) sequences.push([byte]);
    for (const bytes of sequences) {
      const auth = `u:${String.fromCharCode(...bytes)}`;
      equal(formatAuth(auth), `https://u:${encodeAuth(bytes)}@example.test/p`, 'raw auth bytes');
    }
    equal(formatAuth(`u:${String.fromCodePoint(0xD800)}`),
          'https://u:%ED%A0%80@example.test/p', 'WTF-8 auth');
  } else {
    for (const codePoint of [0xD800, 0xDC00]) {
      assert.throws(() => formatAuth(`u:${String.fromCodePoint(codePoint)}`),
                    { code: 'ERR_INVALID_URI' });
      checks++;
    }
  }
}

if (phase !== 'auth') {
  const boundaries = ['', ' ', '\0\t\r\n', '\u00A0', '\uFEFF',
                      ' \u00A0\t\uFEFF\r\n'];
  const paths = [
    [`${host}/Ġ`, `${host}/Ġ`],
    [`${host}/Ϡ`, `${host}/Ϡ`],
    [`${host}/ഠ`, `${host}/ഠ`],
    [`${host}/😀`, `${host}/😀`],
    ['https:\\\\example.test\\Ġ', `${host}/Ġ`],
    ['/Ġ', '/Ġ'],
    ['/p?x=Ġ#ഠ', '/p?x=Ġ#ഠ'],
    [`${host}/a\u00A0b\uFEFFc`, `${host}/a\u00A0b\uFEFFc`],
    [`${host}/p?\u00A0x=\uFEFFy#Ϡ`, `${host}/p?\u00A0x=\uFEFFy#Ϡ`],
    ['https:\\\\example.test\\a\uFEFF\\Ġ?x=\\#y=\\',
     `${host}/a\uFEFF/Ġ?x=%5C#y=%5C`],
  ];
  for (const [input, expected] of paths) {
    for (const prefix of boundaries) {
      for (const suffix of boundaries) {
        for (const parseQuery of [false, true]) {
          for (const slashes of [false, true]) {
            const parsed = url.parse(prefix + input + suffix, parseQuery, slashes);
            equal(parsed.href, expected, 'LEGACY_URL_TRIM_BOUNDARY');
            equal(url.format(parsed), expected, 'trim format closure');
          }
        }
      }
    }
  }
  for (const left of boundaries) {
    for (const right of boundaries) {
      equal(url.parse(left + right).href, '', 'all whitespace');
    }
  }
  // Stock legacy trimming intentionally excludes other ECMAScript whitespace.
  for (const value of ['\u1680', '\u2000', '\u2028', '\u202F', '\u3000']) {
    equal(url.parse(`${host}/x${value}`).pathname, `/x${value}`, 'other whitespace preserved');
  }
  if (byteMode) {
    function tail(bytes, trimmed) {
      const value = String.fromCharCode(...bytes);
      const expected = trimmed ? '/x' : `/x${value}`;
      for (const suffix of ['', ' \t']) {
        const actual = url.parse(`${host}/x${value}${suffix}`).pathname;
        equal(Buffer.from(actual).toString('hex'), Buffer.from(expected).toString('hex'),
              'raw tail bytes');
      }
    }
    for (let byte = 0x80; byte < 256; byte++) {
      tail([byte, 0xA0], byte === 0xC2);
      tail([0xEF, byte, 0xBF], byte === 0xBB);
      tail([0xEF, 0xBB, byte], byte === 0xBF);
    }
    for (const bytes of [[0xA0], [0xC2], [0xEF], [0xEF, 0xBB], [0xC2, 0x80],
                         [0xE4, 0xB8], [0xED, 0xA0, 0x80], [0xF0, 0x9F, 0x98]]) {
      tail(bytes, false);
    }
  }
}

console.log(JSON.stringify({ kind: 'summary', profile, phase, checks,
                             source_only: process.env.NODE8_LEGACY_URL_SOURCE_ONLY === '1' }));
