// Flags: --expose-internals
'use strict';

const common = require('../common');
if (!common.hasIntl) common.skip('missing Intl');
const assert = require('assert');
const { internalBinding } = require('internal/test/binding');
const nativeWidth = internalBinding('icu').getStringWidth;
const { getStringWidth } = require('internal/util/inspect');
const node8 = process.execArgv.includes('--experimental-node-8-string-semantics');

const fixtures = [
  ['ascii', 'a', 1], ['latin', '\u00e9', 1], ['cjk', '\u4e2d', 2],
  ['emoji', '\u{1f600}', 2], ['combining', 'e\u0301', 1],
  ['mark', '\u0301', 0], ['soft-hyphen', '\u00ad', 1],
  ['bidi', '\u200ef\u200f', 1], ['nul', '\0', 0], ['bell', '\x07', 0],
  ['high-surrogate', String.fromCodePoint(0xd800), 1],
  ['low-surrogate', String.fromCodePoint(0xdc00), 1],
  ['separate-pair', String.fromCodePoint(0xd83d) + String.fromCodePoint(0xde00), 2],
  ['family', '\u{1f469}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f467}', 8],
  ['heart', '\u2764\ufe0f', 1],
];
for (const [hex, width] of [['80', 1], ['e282', 1], ['e228a1', 3],
                            ['c0af', 2], ['eda080', node8 ? 1 : 3]]) {
  fixtures.push([hex, Buffer.from(hex, 'hex').toString(), width]);
}

let checks = 0;
function check(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}

for (const [id, source, width] of fixtures) {
  for (const count of [0, 1, 17, 2048]) {
    const value = source.repeat(count);
    check(nativeWidth(value), width * count, `native ${id}/${count}`);
    check(getStringWidth(value), width * count, `wrapper ${id}/${count}`);
    check(getStringWidth(`ab${value}`), 2 + width * count, `prefix ${id}/${count}`);
  }
}

for (let point = 0; point < 256; point++) {
  const value = String.fromCodePoint(point);
  const width = point < 32 || (point >= 127 && point < 160) ? 0 : 1;
  check(nativeWidth(value), width, `native point ${point}`);
  check(getStringWidth(value), width, `wrapper point ${point}`);
  check(getStringWidth(`${value}\u{1f389}`), width + 2, `suffix point ${point}`);
}

check(nativeWidth('\u00e9', true), 2, 'ambiguous full width');
check(nativeWidth('\u00e9', false), 1, 'ambiguous half width');
const family = '\u{1f469}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f467}';
check(nativeWidth(family, false, true), 8, 'expanded emoji');
check(nativeWidth(family, false, false), 2, 'joined emoji');
check(getStringWidth('\x1b[31m\u00e9\x1b[0m'), 1, 'ANSI control stripping');
check(getStringWidth('\ud55c\uae00'.normalize('NFD')), 4, 'Hangul normalization');
console.log(`ICU Unicode width boundary: ${checks} checks passed`);
