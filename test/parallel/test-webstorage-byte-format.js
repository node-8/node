'use strict';

const common = require('../common');
common.skipIfSQLiteMissing();
const assert = require('assert');
const node8 = process.execArgv.includes('--experimental-node-8-string-semantics');
const storage = process.argv.includes('--local') ? localStorage : sessionStorage;
const mode = process.argv.includes('--write') ? 'write' :
  process.argv.includes('--read') ? 'read' :
    process.argv.includes('--quota') ? 'quota' : 'roundtrip';
let checks = 0;
function check(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}
const values = ['', 'ascii', '\u00e9', '\u4e2d', '\u{1f600}', 'e\u0301',
                '\ud800', '\udc00', '\udc00\ud800', 'a\0b', '\uffff',
                '\u4e2d'.repeat(2048)];
for (let byte = 0; byte < 256; byte++) values.push(Buffer.from([byte]).toString());
for (const hex of ['e282', 'e228a1', 'c0af', 'eda080', 'f4908080']) {
  values.push(Buffer.from(hex, 'hex').toString());
}

if (mode === 'write' || mode === 'read') {
  if (mode === 'write') storage.clear();
  for (const [index, value] of values.entries()) {
    const key = `${index}:${value}`;
    if (mode === 'write') storage.setItem(key, value);
    check(storage.getItem(key), value, 'persisted value');
    check(Object.keys(storage).includes(key), true, 'persisted key');
  }
  check(storage.length, values.length, 'persisted length');
} else if (mode === 'quota') {
  storage.clear();
  const size = 10 * 1024 * 1024 / (node8 ? 1 : 2) - 1;
  storage.setItem('k', 'a'.repeat(size));
  assert.throws(() => storage.setItem('x', 'x'), { name: 'QuotaExceededError' });
  assert.throws(() => storage.setItem('k', 'b'.repeat(size + 1)), { name: 'QuotaExceededError' });
  check(storage.getItem('k').length, size, 'quota rollback length');
  check(storage.getItem('k')[0], 'a', 'quota rollback value');
  check(storage.length, 1, 'quota rollback count');
  storage.removeItem('k');
  storage.setItem('\u4e2d', '\u{1f600}');
  check(storage.getItem('\u4e2d'), '\u{1f600}', 'quota recovery');
  storage.clear();
} else {
  storage.clear();
  for (const value of values) {
    const key = `key:${value}`;
    storage.setItem(key, value);
    check(storage.getItem(key), value, 'getItem round trip');
    check(storage[key], value, 'property round trip');
    check(storage.key(0), key, 'key round trip');
    check(Object.keys(storage)[0], key, 'enumeration round trip');
    check(storage.length, 1, 'single entry');
    storage.setItem(key, `${value}\0\u4e2d`);
    check(storage.getItem(key), `${value}\0\u4e2d`, 'updated value');
    storage.removeItem(key);
    check(storage.getItem(key), null, 'removed');
    check(storage.length, 0, 'removed count');
  }
  const distinct = new Map();
  for (const value of values) {
    const key = `distinct:${value}`;
    distinct.set(key, value);
    storage.setItem(key, value);
  }
  check(storage.length, distinct.size, 'distinct keys');
  for (const [key, value] of distinct) check(storage.getItem(key), value, 'distinct value');
  const symbol = Symbol('local');
  storage[symbol] = 42;
  check(storage[symbol], 42, 'symbol unchanged');
  delete storage[symbol];
  storage.clear();
  check(storage.length, 0, 'cleared');
}
console.log(`WebStorage byte format: ${mode} ${checks} checks passed`);
