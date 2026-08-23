// Flags: --experimental-node-8-string-semantics

'use strict';

require('../common');
const assert = require('assert');
const os = require('os');
const v8 = require('v8');

const values = [
  'ascii',
  String.fromCodePoint(0xE9),
  String.fromCodePoint(0x1F600),
  String.fromCodePoint(0xD800),
  String.fromCharCode(0x80, 0xFF),
];

for (const value of values) {
  const serialized = v8.serialize(value);
  assert.strictEqual(serialized[2], 0x53);
  assert.strictEqual(v8.deserialize(serialized), value);
}

const eAcute = String.fromCodePoint(0xE9);
const emoji = String.fromCodePoint(0x1F600);
const object = { [eAcute]: { value: emoji } };
const clonedObject = v8.deserialize(v8.serialize(object));
assert.deepStrictEqual(Object.keys(clonedObject), [eAcute]);
assert.strictEqual(clonedObject[eAcute].value, emoji);

const regexp = new RegExp(`Qu${eAcute}bec`, 'i');
const clonedRegExp = v8.deserialize(v8.serialize(regexp));
assert.strictEqual(clonedRegExp.source, regexp.source);
assert.strictEqual(clonedRegExp.flags, regexp.flags);

assert.strictEqual(
  v8.deserialize(Buffer.from('ff0f2201e9', 'hex')),
  eAcute,
);

const stockEmoji = os.endianness() === 'LE' ?
  'ff0f63043dd800de' : 'ff0f6304d83dde00';
assert.strictEqual(
  v8.deserialize(Buffer.from(stockEmoji, 'hex')),
  emoji,
);
