// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');
const { EventEmitter } = require('events');
const readline = require('readline');
const { charLengthAt, charLengthLeft } = require('internal/readline/utils');
const byteMode = String.fromCodePoint(233).length === 2;
let checks = 0;
function equal(actual, expected, message) {
  assert.strictEqual(actual, expected, message);
  checks++;
}
class Terminal extends EventEmitter {
  resume() {}
  pause() {}
  write() { return true; }
}
function withTerminal(fn) {
  const terminal = new Terminal();
  const rl = readline.createInterface({ input: terminal, output: terminal, terminal: true });
  try { fn(rl, terminal); } finally { rl.close(); }
}

for (const cp of [0, 65, 0x7f, 0x80, 0xe9, 0x7ff, 0x800, 0x4e2d,
                  0xd7ff, 0xd800, 0xdc00, 0xe000, 0xffff, 0x10000, 0x1f600, 0x10ffff]) {
  const text = String.fromCodePoint(cp);
  equal(charLengthAt(text, 0), text.length, 'complete character right span');
  equal(charLengthLeft(text, text.length), text.length, 'complete character left span');
  equal(charLengthAt(`A${text}B`, 1), text.length);
  equal(charLengthLeft(`A${text}B`, 1 + text.length), text.length);
}
equal(charLengthAt('', 0), 1, 'autocomplete moves past end');
equal(charLengthLeft('', 0), 0);

for (const text of ['x', 'é', '中', '😀']) {
  withTerminal((rl, terminal) => {
    terminal.emit('data', Buffer.from(text));
    equal(rl.line, text, 'whole Buffer Unicode terminal input');
    equal(rl.cursor, text.length);
    rl.write(null, { name: 'left' });
    equal(rl.cursor, 0, 'left Unicode boundary');
    rl.write(null, { name: 'right' });
    equal(rl.cursor, text.length, 'right Unicode boundary');
    rl.write(null, { name: 'backspace' });
    equal(rl.line, '', 'backspace complete character');
    equal(rl.cursor, 0);
    rl.write(text);
    rl.write(null, { name: 'home' });
    rl.write(null, { name: 'delete' });
    equal(rl.line, '', 'delete complete character');
    equal(rl.cursor, 0);
  });
}
withTerminal((rl) => {
  rl.write('Aé中😀Z');
  for (const suffix of ['Z', '😀', '中', 'é', 'A']) {
    const end = rl.cursor;
    rl.write(null, { name: 'left' });
    equal(rl.cursor, end - suffix.length);
  }
  for (const prefix of ['A', 'é', '中', '😀', 'Z']) {
    const start = rl.cursor;
    rl.write(null, { name: 'right' });
    equal(rl.cursor, start + prefix.length);
  }
});

if (byteMode) {
  common.expectWarning('internal/test/binding',
                       'These APIs are for internal testing only. Do not use them.');
  const { internalBinding } = require('internal/test/binding');
  const { getUtf8CharacterLength } = internalBinding('encoding_binding');
  for (const offset of [-1, 0.5, NaN, Infinity, 0x100000000, '0']) {
    equal(getUtf8CharacterLength('é', offset, 4), 0, 'invalid native offset');
    equal(charLengthAt('é', offset), 1, 'invalid right offset');
    equal(charLengthLeft('é', offset), 0, 'invalid left offset');
  }
  equal(getUtf8CharacterLength(null, 0, 4), 0);
  equal(getUtf8CharacterLength('', 0, 4), 0);
  equal(getUtf8CharacterLength('é', 2, 4), 0);
  for (const limit of [-1, 0, 0.5, NaN, Infinity, '4']) {
    equal(getUtf8CharacterLength('é', 0, limit), 0);
  }
  equal(getUtf8CharacterLength('😀', 0, 0xffffffff), 4);
  equal(getUtf8CharacterLength('😀', 0, 2), 2, 'local prefix only');
  equal(charLengthLeft('é', 3), 0);
  for (let value = 0; value < 256; value++) {
    const text = String.fromCharCode(value);
    equal(charLengthAt(text, 0), 1, 'one byte always makes progress');
    equal(charLengthLeft(text, 1), 1);
  }
  const vectors = [
    ['c3a9', [2]], ['e4b8ad', [3]], ['f09f9880', [4]], ['eda080', [3]],
    ['edb080', [3]], ['e4b8', [2]], ['f09f98', [3]], ['c080', [1, 1]],
    ['e08080', [1, 1, 1]], ['f4908080', [1, 1, 1, 1]],
    ['c28080', [2, 1]], ['e4b841', [2, 1]], ['80808080', [1, 1, 1, 1]],
    ['41eda08042f09f98', [1, 3, 1, 3]],
  ];
  for (const [hex, spans] of vectors) {
    const text = Buffer.from(hex, 'hex').toString();
    let offset = 0;
    for (const span of spans) {
      equal(charLengthAt(text, offset), span, `${hex} right ${offset}`);
      offset += span;
    }
    equal(offset, text.length);
    for (const span of spans.slice().reverse()) {
      equal(charLengthLeft(text, offset), span, `${hex} left ${offset}`);
      offset -= span;
    }
    equal(offset, 0);
  }
  for (let offset = 1; offset < 4; offset++) {
    equal(charLengthLeft('😀', offset), offset, 'cursor inside truncated prefix');
    equal(charLengthAt('😀', offset), 1, 'continuation at cursor is one malformed byte');
  }
  const left = 'a'.repeat(8192);
  const rope = left + '😀' + 'b'.repeat(8192);
  equal(charLengthAt(rope, left.length), 4, 'rope local span');
  equal(charLengthLeft(rope, left.length + 4), 4);
  equal(charLengthAt(rope.slice(8000, 9000), 192), 4, 'sliced local span');
}
console.log(JSON.stringify({ profile: byteMode ? 'node8' : 'stock', checks }));
