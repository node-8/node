// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
if (!common.hasCrypto) common.skip('missing crypto');

const tmpdir = require('../common/tmpdir');
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const literal = 'É中😀';
const literalHex = 'c389e4b8adf09f9880';
tmpdir.refresh();
const file = path.join(tmpdir.path, 'source-byte-io.txt');

fs.writeFileSync(file, literal, 'utf8');
assert.strictEqual(fs.readFileSync(file).toString('hex'), literalHex);
assert.strictEqual(fs.readFileSync(file).toString('utf8'), literal);

const stringDigest = crypto.createHash('sha256').update(literal).digest('hex');
const bufferDigest = crypto.createHash('sha256')
  .update(Buffer.from(literal, 'utf8')).digest('hex');
assert.strictEqual(stringDigest, bufferDigest);

const server = http.createServer(common.mustCall((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', common.mustCall(() => {
    assert.strictEqual(Buffer.concat(chunks).toString('hex'), literalHex);
    response.end(literal);
  }));
}));

server.listen(0, common.mustCall(() => {
  const request = http.request({
    method: 'POST',
    port: server.address().port,
  }, common.mustCall((response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', common.mustCall(() => {
      assert.strictEqual(Buffer.concat(chunks).toString('hex'), literalHex);
      server.close();
    }));
  }));
  request.end(literal);
}));
