// Flags: --experimental-node-8-string-semantics
'use strict';

require('../common');
const tmpdir = require('../common/tmpdir');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const unicode = 'é中😀';
const unicodeHex = 'c3a9e4b8adf09f9880';

function bufferPath(name) {
  return Buffer.concat([
    Buffer.from(tmpdir.path),
    Buffer.from(path.sep),
    name,
  ]);
}

tmpdir.refresh();

const stringFilename = `${unicode}.txt`;
fs.writeFileSync(path.join(tmpdir.path, stringFilename), 'string path');
const rawEntries = fs.readdirSync(tmpdir.path, { encoding: 'buffer' });
assert(rawEntries.some((entry) =>
  entry.equals(Buffer.from(`${unicodeHex}2e747874`, 'hex'))));

const moduleFilename = Buffer.from(`${unicodeHex}2e636a73`, 'hex');
fs.writeFileSync(bufferPath(moduleFilename), 'module.exports = "loaded";');
assert.strictEqual(
  require(path.join(tmpdir.path, `${unicode}.cjs`)),
  'loaded',
);

const malformedFilename = Buffer.from('ff2e747874', 'hex');
fs.writeFileSync(bufferPath(malformedFilename), 'raw path');
const malformedString = malformedFilename.toString('utf8');
assert.strictEqual(
  fs.readFileSync(path.join(tmpdir.path, malformedString), 'utf8'),
  'raw path',
);

const childSource = [
  "process.stdout.write(Buffer.from(process.argv[1]).toString('hex'))",
  "process.stdout.write('\\n')",
  "process.stdout.write(Buffer.from(process.env.NODE8_VALUE).toString('hex'))",
].join(';');
const child = childProcess.spawnSync(
  process.execPath,
  ['--experimental-node-8-string-semantics', '-e', childSource, unicode],
  {
    encoding: 'utf8',
    env: { ...process.env, NODE8_VALUE: unicode },
  },
);
assert.ifError(child.error);
assert.strictEqual(child.status, 0, child.stderr);
assert.deepStrictEqual(child.stdout.split('\n'), [unicodeHex, unicodeHex]);

const pattern = new URLPattern({ pathname: `/${unicode}` });
assert.strictEqual(pattern.pathname, '/%C3%A9%E4%B8%AD%F0%9F%98%80');
assert(pattern.test({ pathname: `/${unicode}` }));

const malformed = Buffer.from([0xff]).toString('utf8');
const malformedPattern = new URLPattern({ pathname: `/${malformed}` });
assert.strictEqual(malformedPattern.pathname, '/%EF%BF%BD');

const surrogate = String.fromCodePoint(0xd800);
const surrogatePattern = new URLPattern({ pathname: `/${surrogate}` });
assert.strictEqual(surrogatePattern.pathname, '/%EF%BF%BD');

assert.strictEqual(
  Buffer.alloc(18).fill(unicode).toString('hex'),
  unicodeHex.repeat(2),
);
assert.strictEqual(Buffer.from(`x${unicode}y`).indexOf(unicode), 1);
assert.strictEqual(
  zlib.gunzipSync(zlib.gzipSync(unicode)).toString('hex'),
  unicodeHex,
);
