'use strict';

const http = require('http');

const CORPORA = Object.freeze(['ascii', 'cjk', 'emoji', 'mixed']);
const MAX_PAYLOAD_SIZE = 1024 * 1024;
const patterns = new Map([
  ['ascii', Buffer.from('7b226d657373616765223a2268656c6c6f227d0a', 'hex')],
  ['cjk', Buffer.from('e4b8ade69687', 'hex')],
  ['emoji', Buffer.from('f09f9880f09f9a80', 'hex')],
  [
    'mixed',
    Buffer.from('7b226d223a22e4b8ade69687c3a9f09f9880227d0a', 'hex'),
  ],
]);

function createPayload(corpus, size) {
  const pattern = patterns.get(corpus);
  if (pattern === undefined) {
    throw new TypeError(`Unsupported UTF-8 corpus: ${corpus}`);
  }
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PAYLOAD_SIZE) {
    throw new RangeError(`Invalid UTF-8 payload size: ${size}`);
  }

  const payload = Buffer.allocUnsafe(size);
  let offset = 0;
  while (offset + pattern.length <= size) {
    pattern.copy(payload, offset);
    offset += pattern.length;
  }
  payload.fill(0x61, offset);
  return payload;
}

function sendError(res, statusCode, message) {
  const body = Buffer.from(message);
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain',
    'Content-Length': body.length,
  });
  res.end(body);
}

function createServer(preload = []) {
  const cache = new Map();

  for (const { corpus, size } of preload) {
    const buffer = createPayload(corpus, size);
    cache.set(`${corpus}:${size}`, {
      buffer,
      string: buffer.toString('utf8'),
    });
  }

  return http.createServer((req, res) => {
    const parts = req.url.split('/');
    const scenario = parts[1];
    const corpus = parts[2];
    const sizeText = parts[3];

    if (parts.length !== 4 ||
        (scenario !== 'h01-buffer' &&
         scenario !== 'h02-cached-string' &&
         scenario !== 'h05-string-echo') ||
        !patterns.has(corpus)) {
      sendError(res, 404, 'not found\n');
      return;
    }

    if (!/^\d+$/.test(sizeText)) {
      sendError(res, 400, 'invalid size\n');
      return;
    }

    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PAYLOAD_SIZE) {
      sendError(res, 400, 'invalid size\n');
      return;
    }

    if (scenario === 'h05-string-echo') {
      if (req.method !== 'POST') {
        sendError(res, 405, 'method not allowed\n');
        return;
      }
      if (req.headers['content-length'] !== String(size)) {
        sendError(res, 400, 'invalid content length\n');
        return;
      }

      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => body += chunk);
      req.on('end', () => {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': size,
        });
        res.end(body);
      });
      return;
    }

    const key = `${corpus}:${size}`;
    let payload = cache.get(key);
    if (payload === undefined) {
      const buffer = createPayload(corpus, size);
      payload = { buffer, string: buffer.toString('utf8') };
      cache.set(key, payload);
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': payload.buffer.length,
    });
    res.end(scenario === 'h01-buffer' ? payload.buffer : payload.string);
  });
}

module.exports = {
  CORPORA,
  MAX_PAYLOAD_SIZE,
  createPayload,
  createServer,
};
