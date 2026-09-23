'use strict';

require('../common');
const assert = require('assert');
const { EventEmitter } = require('events');
const readline = require('readline');
const { StringDecoder } = require('string_decoder');
const byteMode = String.fromCodePoint(233).length === 2;
let checks = 0;
function equal(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message);
  checks++;
}

function keys(chunks, end = false) {
  const stream = new EventEmitter();
  const output = [];
  readline.emitKeypressEvents(stream);
  stream.on('keypress', (text, key) => output.push([text, key.name, key.sequence]));
  for (const chunk of chunks) stream.emit('data', chunk);
  if (end) stream.emit('end');
  return output;
}

function byteChunks(text) {
  return [...Buffer.from(text)].map((byte) => Buffer.from([byte]));
}
for (const text of ['é', '中', '😀', 'Aé中😀Z', '\ufeffé', 'é\ufeff中']) {
  const expected = [...text].map((symbol) => [symbol, /^[a-z]$/i.test(symbol) ? symbol.toLowerCase() : undefined, symbol]);
  equal(keys(byteChunks(text)), expected, 'every-byte terminal input');
  const bytes = Buffer.from(text);
  for (let split = 1; split < bytes.length; split++) {
    equal(keys([bytes.subarray(0, split), bytes.subarray(split)]), expected, 'every split point');
  }
  equal(keys([text]), expected, 'direct string input');
}

// Every view must decode only its own byte window, not the backing buffer.
const viewText = 'é中XYZ';
const backing = new Uint8Array(24).fill(0xff);
backing.set(Buffer.from(viewText), 8);
for (const View of [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array,
                    Uint16Array, Int32Array, Uint32Array, Float32Array,
                    Float64Array, BigInt64Array, BigUint64Array]) {
  const view = new View(backing.buffer, 8, 8 / View.BYTES_PER_ELEMENT);
  equal(keys([view]), keys([viewText]), `offset ${View.name}`);
}
equal(keys([new DataView(backing.buffer, 10, 3)]), keys(['中']), 'offset DataView');
equal(keys([backing.subarray(8, 16)]), keys([viewText]), 'sliced Uint8Array');
equal(keys([
  new Uint8Array(backing.buffer, 8, 1),
  new DataView(backing.buffer, 9, 2),
  new Int8Array(backing.buffer, 11, 1),
  Buffer.from(backing.buffer, 12, 4),
]), keys([viewText]), 'mixed views split Unicode characters');
for (const invalid of [undefined, null, 7, false, {}, new ArrayBuffer(8),
                       new SharedArrayBuffer(8)]) {
  assert.throws(() => keys([invalid]), { code: 'ERR_INVALID_ARG_TYPE' });
  checks++;
}

equal(keys(byteChunks('é\x1b[D中\x1b[C😀')), [
  ['é', undefined, 'é'], [undefined, 'left', '\x1b[D'],
  ['中', undefined, '中'], [undefined, 'right', '\x1b[C'], ['😀', undefined, '😀'],
], 'mixed Unicode and escape sequences');
for (const [hex, expected] of [
  ['ff', '�'], ['e4b841', '�A'], ['eda080', '���'],
  ['f4908080', '����'], ['c080', '��'], ['c3a9ff', 'é�'],
]) {
  const bytes = Buffer.from(hex, 'hex');
  equal(keys([...bytes].map((byte) => Buffer.from([byte]))).map((entry) => entry[0]).join(''),
        expected, `malformed terminal bytes ${hex}`);
}
for (const hex of ['c3', 'e4b8', 'f09f98']) {
  equal(keys([Buffer.from(hex, 'hex')]), [], 'buffer incomplete input');
  equal(keys([Buffer.from(hex, 'hex')], true), [], 'preserve no flush at stream end');
}
equal(keys([Buffer.from([0xc3]), 'X', Buffer.from([0xa9])]), [
  ['X', 'x', 'X'], ['é', undefined, 'é'],
], 'direct strings do not consume pending Buffer bytes');

class Terminal extends EventEmitter {
  resume() {}
  pause() {}
  write() { return true; }
}
const terminal = new Terminal();
const rl = readline.createInterface({ input: terminal, output: terminal, terminal: true });
try {
  for (const chunk of byteChunks('Aé中😀\x1b[D\x7f')) terminal.emit('data', chunk);
  equal(rl.line, 'Aé😀', 'real terminal byte chunks and backspace');
  equal(rl.cursor, 'Aé'.length);
  for (const chunk of byteChunks('\x1b[3~')) terminal.emit('data', chunk);
  equal(rl.line, 'Aé', 'real terminal delete');
} finally {
  rl.close();
}
if (byteMode) {
  const decoder = new StringDecoder('utf8');
  equal(Buffer.from(decoder.write(Buffer.from([0xc3]))).toString('hex'), 'c3',
        'global StringDecoder stays raw');
}
console.log(JSON.stringify({ profile: byteMode ? 'node8' : 'stock', checks }));
