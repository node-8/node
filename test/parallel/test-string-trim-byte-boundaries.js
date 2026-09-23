// Flags: --expose-internals
'use strict';
const common = require('../common');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { Worker, isMainThread } = require('node:worker_threads');
const { primordials } = require('internal/test/binding');
const { validatePort } = require('internal/validators');

const byteMode = process.execArgv.includes('--experimental-node-8-string-semantics');
assert.strictEqual('\u00e9'.length, byteMode ? 2 : 1);
const spaces = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f,
  0x205f, 0x3000, 0xfeff,
].map((cp) => String.fromCodePoint(cp));
const payload = 'A\u00e9\u4e2d\u{1f600}\u0120';
const raw = (...bytes) => String.fromCharCode(...bytes);
let checks = 0;
function equal(actual, expected) {
  assert.strictEqual(actual, expected);
  checks++;
}

function check(left, body, right) {
  const text = left + body + right;
  equal(text.trim(), body);
  equal(text.trimStart(), body + right);
  equal(text.trimEnd(), left + body);
  equal(text.trimLeft(), body + right);
  equal(text.trimRight(), left + body);
}
check('', payload, '');
for (const space of spaces) {
  check(space, payload, space);
  for (const other of spaces) check(space + other, payload, other + space);
  equal((space + space).trim(), '');
}
const mixed = spaces.join('');
check(mixed, payload, mixed);
for (const value of ['', mixed, ' \t\r\n']) {
  equal(value.trim(), '');
  equal(value.trimStart(), '');
  equal(value.trimEnd(), '');
}

// An independent exact-substring oracle, with no RegExp or Unicode decoder.
function oracle(text, fromStart, fromEnd) {
  let start = 0;
  let end = text.length;
  if (fromStart) {
    for (;;) {
      const space = spaces.find((s) => start + s.length <= end &&
        text.slice(start, start + s.length) === s);
      if (space === undefined) break;
      start += space.length;
    }
  }
  if (fromEnd) {
    for (;;) {
      const space = spaces.find((s) => end - s.length >= start &&
        text.slice(end - s.length, end) === s);
      if (space === undefined) break;
      end -= space.length;
    }
  }
  return text.slice(start, end);
}

function checkOracle(text) {
  equal(text.trim(), oracle(text, true, true));
  equal(text.trimStart(), oracle(text, true, false));
  equal(text.trimEnd(), oracle(text, false, true));
}
for (let a = 0; a < 256; a++) {
  for (let b = 0; b < 256; b++) checkOracle(raw(a, b));
}
if (byteMode) {
  for (const bytes of [[0xa0], [0xc2], [0xe2, 0x80], [0xc0, 0xa0],
                       [0xed, 0xa0, 0x80], [0xff], [0, 0xa0]]) {
    const value = raw(...bytes);
    equal(value.length, bytes.length);
    check(mixed, value, mixed);
    check('', value, '');
  }
  for (const space of spaces) {
    if (space.length === 1) continue;
    for (let i = 0; i < space.length; i++) {
      for (let byte = 0; byte < 256; byte++) {
        const value = space.slice(0, i) + raw(byte) + space.slice(i + 1);
        checkOracle(value);
        checkOracle(' ' + value + '\t');
      }
    }
  }
  check(raw(0xe2) + raw(0x80, 0x80), payload, raw(0xc2) + raw(0xa0));
}
check(mixed, '\ud800\udc00\ud800', mixed);
equal(('p'.repeat(64) + mixed + payload + mixed + 'q'.repeat(64)).slice(64, -64).trim(), payload);
equal(String.prototype.trimStart, String.prototype.trimLeft);
equal(String.prototype.trimEnd, String.prototype.trimRight);
for (const method of ['trim', 'trimStart', 'trimEnd']) {
  const fn = String.prototype[method];
  equal(fn.name, method);
  equal(fn.length, 0);
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, method);
  equal(descriptor.enumerable, false);
  equal(descriptor.configurable, true);
  equal(descriptor.writable, true);
  for (const receiver of [null, undefined, Symbol()]) {
    assert.throws(() => fn.call(receiver), TypeError);
  }
  equal(fn.call(42), '42');
}
let coercions = 0;
equal(String.prototype.trim.call({ toString() {
  coercions++;
  return mixed + payload + mixed;
} }), payload);
equal(coercions, 1);
equal(vm.runInNewContext('"\u3000x\u00a0".trim()'), 'x');
equal(vm.runInNewContext('String.prototype.trimStart === String.prototype.trimLeft'), true);
equal(vm.runInNewContext('String.prototype.trimEnd === String.prototype.trimRight'), true);
// Node's startup snapshot captures these functions before restoring byte mode.
equal(primordials.StringPrototypeTrim(mixed + payload + mixed), payload);
equal(primordials.StringPrototypeTrimStart(mixed + payload + mixed), payload + mixed);
equal(primordials.StringPrototypeTrimEnd(mixed + payload + mixed), mixed + payload);
for (const space of spaces) {
  assert.throws(() => validatePort(space), { code: 'ERR_SOCKET_BAD_PORT' });
}
if (isMainThread) {
  const worker = new Worker(__filename);
  worker.on('exit', common.mustCall((code) => equal(code, 0)));
}
process.stdout.write(`trim ${byteMode ? 'node8' : 'stock'} ${isMainThread ? 'main' : 'worker'}: ${checks} checks passed\n`);
