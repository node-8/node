'use strict';

const common = require('../common');
const assert = require('node:assert/strict');
const http = require('node:http');
const qs = require('node:querystring');
const { StringDecoder } = require('node:string_decoder');
const { setImmediate: tick } = require('node:timers/promises');

const byteMode = process.execArgv.includes('--experimental-node-8-string-semantics');
assert.strictEqual(String.fromCodePoint(233).length, byteMode ? 2 : 1);
const text = 'é中😀';
const textBytes = Buffer.from('c3a9e4b8adf09f9880', 'hex');
assert.deepStrictEqual(Buffer.from(text, 'utf8'), textBytes);
const payload = { text, n: 7 };
const jsonBytes = Buffer.concat([
  Buffer.from('{"text":"'), textBytes, Buffer.from('","n":7}'),
]);
assert.deepStrictEqual(Buffer.from(JSON.stringify(payload)), jsonBytes);
const form = { ['键']: text, tags: ['é', '😀'], space: 'a b+&=%' };
const formWire = '%E9%94%AE=%C3%A9%E4%B8%AD%F0%9F%98%80&' +
                 'tags=%C3%A9&tags=%F0%9F%98%80&space=a%20b%2B%26%3D%25';
const formEncodingError = 'HTTP_FORM_QUERYSTRING_ENCODING';
const pathname = '/闭包/😀';
const wirePath = '/%E9%97%AD%E5%8C%85/%F0%9F%98%80';
const query = '?label=%C3%A9%E4%B8%AD%F0%9F%98%80';
const cases = ['json-fixed', 'json-chunked', 'form-fixed', 'form-chunked'];
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
let serverSocket;
let completed = 0;

// Logical writes deliberately split UTF-8 sequences. TCP may coalesce them;
// no assertion relies on operating-system packet or data-event boundaries.
async function writeSplit(stream, bytes) {
  for (let offset = 0; offset < bytes.length; offset++) {
    stream.write(bytes.subarray(offset, offset + 1));
    await tick();
  }
  stream.end();
}

const server = http.createServer(common.mustCall((req, res) => {
  req.on('error', common.mustNotCall());
  res.on('error', common.mustNotCall());
  if (serverSocket === undefined) serverSocket = req.socket;
  assert.strictEqual(req.socket, serverSocket);
  assert.strictEqual(req.method, 'POST');
  assert.strictEqual(req.url, wirePath + query);
  const url = new URL(req.url, 'http://localhost');
  assert.strictEqual(decodeURIComponent(url.pathname), pathname);
  assert.strictEqual(url.searchParams.get('label'), text);
  const name = req.headers['x-test-case'];
  assert.strictEqual(name, cases[completed]);
  const chunked = name.endsWith('-chunked');
  const isForm = name.startsWith('form-');
  const expectedBytes = isForm ? Buffer.from(formWire) : jsonBytes;
  assert.strictEqual(req.headers['content-type'], isForm ?
    'application/x-www-form-urlencoded' : 'application/json');
  if (chunked) {
    assert.strictEqual(req.headers['transfer-encoding'], 'chunked');
    assert.strictEqual(req.headers['content-length'], undefined);
  } else {
    assert.strictEqual(req.headers['content-length'], String(expectedBytes.length));
    assert.strictEqual(req.headers['transfer-encoding'], undefined);
  }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (part) => { body += part; });
  req.on('end', common.mustCall(() => {
    assert.deepStrictEqual(Buffer.from(body), expectedBytes);
    const parsed = isForm ? { ...qs.parse(body) } : JSON.parse(body);
    assert.deepStrictEqual(parsed, isForm ? form : payload);
    const response = JSON.stringify({ path: pathname, label: text, payload: parsed });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (chunked) {
      res.flushHeaders();
      writeSplit(res, Buffer.from(response)).then(common.mustCall());
    } else {
      res.setHeader('Content-Length', Buffer.byteLength(response));
      res.end(response, 'utf8');
    }
  }));
}, cases.length));
server.on('connection', common.mustCall());
server.on('error', common.mustNotCall());

function request(port, name) {
  const chunked = name.endsWith('-chunked');
  const isForm = name.startsWith('form-');
  // The independent ASCII expectation exposes double-encoding rather than
  // allowing matching encoder/decoder mistakes to cancel each other out.
  const requestText = isForm ? qs.stringify(form) : JSON.stringify(payload);
  if (isForm) {
    assert.strictEqual(requestText, formWire, formEncodingError);
  }
  const bytes = Buffer.from(requestText);
  const url = new URL(`http://${common.localhostIPv4}:${port}${pathname}${query}`);
  assert.strictEqual(url.pathname, wirePath);
  const headers = {
    'Content-Type': isForm ? 'application/x-www-form-urlencoded' : 'application/json',
    'X-Test-Case': name,
  };
  if (!chunked) headers['Content-Length'] = bytes.length;
  return new Promise((resolve, reject) => {
    const req = http.request(url, { agent, method: 'POST', headers }, common.mustCall((res) => {
      assert.strictEqual(req.reusedSocket, completed !== 0);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8');
      const expected = { path: pathname, label: text, payload: isForm ? form : payload };
      const expectedText = JSON.stringify(expected);
      const expectedBytes = Buffer.from(expectedText);
      if (chunked) {
        assert.strictEqual(res.headers['transfer-encoding'], 'chunked');
        assert.strictEqual(res.headers['content-length'], undefined);
        res.setEncoding('utf8');
      } else {
        assert.strictEqual(res.headers['content-length'], String(expectedBytes.length));
        assert.strictEqual(res.headers['transfer-encoding'], undefined);
      }
      const parts = [];
      res.on('error', reject);
      res.on('data', (part) => parts.push(part));
      res.on('end', common.mustCall(() => {
        const body = chunked ? parts.join('') : Buffer.concat(parts).toString('utf8');
        assert.strictEqual(body, expectedText);
        assert.deepStrictEqual(JSON.parse(body), expected);
        if (!chunked) {
          const raw = Buffer.concat(parts);
          assert.strictEqual(raw.length, Number(res.headers['content-length']));
          assert.deepStrictEqual(raw, expectedBytes);
          // Force decoder boundaries independently of TCP coalescing.
          const decoder = new StringDecoder('utf8');
          let decoded = '';
          for (let i = 0; i < raw.length; i++) decoded += decoder.write(raw.subarray(i, i + 1));
          decoded += decoder.end();
          assert.strictEqual(decoded, expectedText);
        }
        resolve();
      }));
    }));
    req.on('error', reject);
    if (chunked) {
      req.flushHeaders();
      writeSplit(req, bytes).catch(reject);
    } else {
      req.end(requestText, 'utf8');
    }
  });
}

async function main() {
  await new Promise((resolve) => server.listen(0, common.localhostIPv4, resolve));
  try {
    for (const name of cases) {
      await request(server.address().port, name);
      completed++;
      // Let the agent return the socket to its free pool before reuse.
      await tick();
    }
  } finally {
    agent.destroy();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  assert.strictEqual(completed, cases.length);
  console.log(JSON.stringify({ profile: byteMode ? 'node8' : 'stock',
                               identity_verified: true, requests: completed,
                               connections: 1 }));
}
main().then(common.mustCall());
