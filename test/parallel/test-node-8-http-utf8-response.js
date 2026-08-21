// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('assert');
const http = require('http');
const { isUtf8 } = require('buffer');
const {
  CORPORA,
  createPayload,
  createServer,
} = require('../../benchmark/fixtures/node-8-http-utf8.js');

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: common.localhostIPv4, port, path }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        body: Buffer.concat(chunks),
        headers: res.headers,
        statusCode: res.statusCode,
      }));
    });
    req.on('error', reject);
  });
}

const sizes = [1, 2, 3, 4, 7, 128, 1024];
for (const corpus of CORPORA) {
  for (const size of sizes) {
    const payload = createPayload(corpus, size);
    assert.strictEqual(payload.length, size);
    assert.strictEqual(isUtf8(payload), true);
  }
}

const server = createServer();
server.listen(0, common.localhostIPv4, common.mustCall(async () => {
  const port = server.address().port;

  for (const scenario of ['h01-buffer', 'h02-cached-string']) {
    for (const corpus of CORPORA) {
      for (const size of sizes) {
        const expected = createPayload(corpus, size);
        const response = await request(
          port, `/${scenario}/${corpus}/${size}`);
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.headers['content-length'], String(size));
        assert.deepStrictEqual(response.body, expected);
      }
    }
  }

  for (const path of [
    '/unknown/ascii/128',
    '/h01-buffer/unknown/128',
    '/h01-buffer/ascii/128/extra',
  ]) {
    const response = await request(port, path);
    assert.strictEqual(response.statusCode, 404);
  }

  for (const path of [
    '/h01-buffer/ascii/0',
    '/h02-cached-string/cjk/not-a-size',
    '/h02-cached-string/emoji/1048577',
  ]) {
    const response = await request(port, path);
    assert.strictEqual(response.statusCode, 400);
  }

  server.close(common.mustCall());
}));
