// Flags: --experimental-node-8-string-semantics
'use strict';

const common = require('../common');
const assert = require('assert');
const http = require('http');
const { isUtf8 } = require('buffer');
const {
  CORPORA,
  createJsonPayload,
  createJsonResponse,
  createPayload,
  createServer,
} = require('../../benchmark/fixtures/node-8-http-utf8.js');

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body;
    const headers = body === undefined ? undefined : {
      'Content-Length': body.length,
      'Content-Type': options.contentType || 'application/octet-stream',
    };
    const req = http.request({
      host: common.localhostIPv4,
      port,
      path,
      method: options.method || 'GET',
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        body: Buffer.concat(chunks),
        headers: res.headers,
        statusCode: res.statusCode,
      }));
    });
    req.on('error', reject);
    if (body !== undefined) {
      const chunkSize = options.chunkSize || body.length;
      for (let offset = 0; offset < body.length; offset += chunkSize) {
        req.write(body.subarray(offset, offset + chunkSize));
      }
    }
    req.end();
  });
}

const sizes = [1, 2, 3, 4, 7, 128, 1024];
const jsonSizes = [128, 1024, 16384];
for (const corpus of CORPORA) {
  for (const size of sizes) {
    const payload = createPayload(corpus, size);
    assert.strictEqual(payload.length, size);
    assert.strictEqual(isUtf8(payload), true);
  }
  for (const size of jsonSizes) {
    const payload = createJsonPayload(corpus, size);
    assert.strictEqual(payload.length, size);
    assert.strictEqual(isUtf8(payload), true);
    assert.strictEqual(JSON.parse(payload.toString()).message.length > 0, true);
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

  for (const corpus of CORPORA) {
    for (const size of jsonSizes) {
      const body = createJsonPayload(corpus, size);
      const expected = createJsonResponse(corpus, size);
      const response = await request(
        port,
        `/h07-json-api/${corpus}/${size}`,
        {
          body,
          chunkSize: 3,
          contentType: 'application/json',
          method: 'POST',
        });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(
        response.headers['content-length'], String(expected.length));
      assert.strictEqual(response.headers['content-type'], 'application/json');
      assert.deepStrictEqual(response.body, expected);
    }
  }

  for (const scenario of ['h04-buffer-echo', 'h05-string-echo']) {
    for (const corpus of CORPORA) {
      for (const size of sizes) {
        const expected = createPayload(corpus, size);
        const response = await request(
          port,
          `/${scenario}/${corpus}/${size}`,
          { body: expected, chunkSize: 3, method: 'POST' });
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.headers['content-length'], String(size));
        assert.deepStrictEqual(response.body, expected);
      }
    }
  }

  for (const scenario of [
    'h04-buffer-echo',
    'h05-string-echo',
    'h07-json-api',
  ]) {
    const wrongMethod = await request(port, `/${scenario}/mixed/128`);
    assert.strictEqual(wrongMethod.statusCode, 405);
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
