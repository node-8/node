'use strict';

const assert = require('assert');
const common = require('../common.js');
const { StringDecoder } = require('string_decoder');
const {
  CORPORA,
  createPayload,
} = require('../fixtures/node-8-http-utf8.js');

const bench = common.createBenchmark(main, {
  corpus: CORPORA,
  size: [128, 1024, 16384],
  chunkSize: [1, 2, 3, 4, 16, 1024],
  bytes: [64 * 1024 * 1024],
});

function main({ corpus, size, chunkSize, bytes }) {
  const payload = createPayload(corpus, size);
  const chunks = [];
  for (let offset = 0; offset < payload.length; offset += chunkSize) {
    chunks.push(payload.subarray(offset, offset + chunkSize));
  }

  const decoder = new StringDecoder('utf8');
  const iterations = Math.max(1, Math.ceil(bytes / size));
  let observedLength = 0;

  bench.start();
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (const chunk of chunks) {
      observedLength += decoder.write(chunk).length;
    }
  }
  bench.end(iterations * size);

  assert.ok(observedLength > 0);
  assert.strictEqual(decoder.lastNeed, 0);
  assert.strictEqual(decoder.lastTotal, 0);
}
