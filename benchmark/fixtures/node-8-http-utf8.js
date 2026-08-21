'use strict';

const http = require('http');
const { StringDecoder } = require('string_decoder');

const CORPORA = Object.freeze(['ascii', 'cjk', 'emoji', 'mixed']);
const MAX_PAYLOAD_SIZE = 1024 * 1024;
const STREAM_DECODE_CHUNK_SIZE = 3;
const jsonPrefix = Buffer.from('7b226d657373616765223a22', 'hex');
const jsonSuffix = Buffer.from('227d', 'hex');
const jsonResponseSuffix = Buffer.from('2c22636f756e74223a317d', 'hex');
const streamPrefix = Buffer.from('discard|', 'ascii');
const streamSuffix = Buffer.from('|discard', 'ascii');
const templatePrefix = Buffer.from('<p>', 'ascii');
const templateSuffix = Buffer.from('</p>', 'ascii');
const patterns = new Map([
  ['ascii', Buffer.from('7b226d657373616765223a2268656c6c6f227d0a', 'hex')],
  ['cjk', Buffer.from('e4b8ade69687', 'hex')],
  ['emoji', Buffer.from('f09f9880f09f9a80', 'hex')],
  [
    'mixed',
    Buffer.from('7b226d223a22e4b8ade69687c3a9f09f9880227d0a', 'hex'),
  ],
]);
const jsonValuePatterns = new Map([
  ['ascii', Buffer.from('abcdef', 'ascii')],
  ['cjk', Buffer.from('e4b8ade69687', 'hex')],
  ['emoji', Buffer.from('f09f9880f09f9a80', 'hex')],
  ['mixed', Buffer.from('61e4b8ade69687c3a9f09f9880', 'hex')],
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

function createJsonPayload(corpus, size) {
  const pattern = jsonValuePatterns.get(corpus);
  if (pattern === undefined) {
    throw new TypeError(`Unsupported UTF-8 corpus: ${corpus}`);
  }
  const minimumSize = jsonPrefix.length + pattern.length + jsonSuffix.length;
  if (!Number.isSafeInteger(size) ||
      size < minimumSize ||
      size > MAX_PAYLOAD_SIZE) {
    throw new RangeError(`Invalid UTF-8 JSON payload size: ${size}`);
  }

  const payload = Buffer.allocUnsafe(size);
  jsonPrefix.copy(payload, 0);
  const valueEnd = size - jsonSuffix.length;
  let offset = jsonPrefix.length;
  while (offset + pattern.length <= valueEnd) {
    pattern.copy(payload, offset);
    offset += pattern.length;
  }
  payload.fill(0x61, offset, valueEnd);
  jsonSuffix.copy(payload, valueEnd);
  return payload;
}

function createJsonResponse(corpus, size) {
  const request = createJsonPayload(corpus, size);
  return Buffer.concat([
    request.subarray(0, request.length - 1),
    jsonResponseSuffix,
  ]);
}

function createStreamPayload(corpus, size) {
  const pattern = jsonValuePatterns.get(corpus);
  if (pattern === undefined) {
    throw new TypeError(`Unsupported UTF-8 corpus: ${corpus}`);
  }
  const minimumSize =
    streamPrefix.length + pattern.length + streamSuffix.length;
  if (!Number.isSafeInteger(size) ||
      size < minimumSize ||
      size > MAX_PAYLOAD_SIZE) {
    throw new RangeError(`Invalid UTF-8 stream payload size: ${size}`);
  }

  const payload = Buffer.allocUnsafe(size);
  streamPrefix.copy(payload, 0);
  const valueEnd = size - streamSuffix.length;
  let offset = streamPrefix.length;
  while (offset + pattern.length <= valueEnd) {
    pattern.copy(payload, offset);
    offset += pattern.length;
  }
  payload.fill(0x61, offset, valueEnd);
  streamSuffix.copy(payload, valueEnd);
  return payload;
}

function createStreamResponse(corpus, size) {
  const request = createStreamPayload(corpus, size);
  return request.subarray(streamPrefix.length, size - streamSuffix.length);
}

function createTemplatePayload(corpus, size) {
  const pattern = jsonValuePatterns.get(corpus);
  if (pattern === undefined) {
    throw new TypeError(`Unsupported UTF-8 corpus: ${corpus}`);
  }
  const minimumSize =
    templatePrefix.length + pattern.length + templateSuffix.length;
  if (!Number.isSafeInteger(size) ||
      size < minimumSize ||
      size > MAX_PAYLOAD_SIZE) {
    throw new RangeError(`Invalid UTF-8 template payload size: ${size}`);
  }

  const payload = Buffer.allocUnsafe(size);
  templatePrefix.copy(payload, 0);
  const valueEnd = size - templateSuffix.length;
  let offset = templatePrefix.length;
  while (offset + pattern.length <= valueEnd) {
    pattern.copy(payload, offset);
    offset += pattern.length;
  }
  payload.fill(0x61, offset, valueEnd);
  templateSuffix.copy(payload, valueEnd);
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
    const template = createTemplatePayload(corpus, size);
    cache.set(`h03:${corpus}:${size}`, {
      body: template.subarray(
        templatePrefix.length, size - templateSuffix.length).toString('utf8'),
      prefix: '<p>',
      suffix: '</p>',
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
         scenario !== 'h03-template-string' &&
         scenario !== 'h04-buffer-echo' &&
         scenario !== 'h05-string-echo' &&
         scenario !== 'h06-stream-transform' &&
         scenario !== 'h07-json-api') ||
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

    if (scenario === 'h04-buffer-echo' ||
        scenario === 'h05-string-echo' ||
        scenario === 'h06-stream-transform' ||
        scenario === 'h07-json-api') {
      if (req.method !== 'POST') {
        sendError(res, 405, 'method not allowed\n');
        return;
      }
      if (req.headers['content-length'] !== String(size)) {
        sendError(res, 400, 'invalid content length\n');
        return;
      }
    }

    if (scenario === 'h04-buffer-echo') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': size,
      });
      req.pipe(res);
      return;
    }

    if (scenario === 'h05-string-echo') {
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

    if (scenario === 'h06-stream-transform') {
      const decoder = new StringDecoder('utf8');
      let bytesUntilBoundary = STREAM_DECODE_CHUNK_SIZE;
      let body = '';
      req.on('data', (chunk) => {
        let offset = 0;
        while (offset < chunk.length) {
          const length = Math.min(bytesUntilBoundary, chunk.length - offset);
          body += decoder.write(chunk.subarray(offset, offset + length));
          offset += length;
          bytesUntilBoundary -= length;
          if (bytesUntilBoundary === 0) {
            bytesUntilBoundary = STREAM_DECODE_CHUNK_SIZE;
          }
        }
      });
      req.on('end', () => {
        body += decoder.end();
        const start = body.indexOf('|');
        const end = body.lastIndexOf('|');
        const result = body.slice(start + 1, end);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': Buffer.byteLength(result, 'utf8'),
        });
        res.end(result);
      });
      return;
    }

    if (scenario === 'h07-json-api') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => body += chunk);
      req.on('end', () => {
        const value = JSON.parse(body);
        value.count = 1;
        const result = JSON.stringify(value);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(result, 'utf8'),
        });
        res.end(result);
      });
      return;
    }

    if (scenario === 'h03-template-string') {
      const key = `h03:${corpus}:${size}`;
      let pieces = cache.get(key);
      if (pieces === undefined) {
        const template = createTemplatePayload(corpus, size);
        pieces = {
          body: template.subarray(
            templatePrefix.length,
            size - templateSuffix.length).toString('utf8'),
          prefix: '<p>',
          suffix: '</p>',
        };
        cache.set(key, pieces);
      }
      const result = pieces.prefix + pieces.body + pieces.suffix;
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Length': size,
      });
      res.end(result);
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
  STREAM_DECODE_CHUNK_SIZE,
  createJsonPayload,
  createJsonResponse,
  createPayload,
  createServer,
  createStreamPayload,
  createStreamResponse,
  createTemplatePayload,
};
