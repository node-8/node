'use strict';

const assert = require('assert');
const common = require('../common.js');
const {
  CORPORA,
  createJsonPayload,
  createJsonResponse,
} = require('../fixtures/node-8-http-utf8.js');

const bench = common.createBenchmark(main, {
  op: ['parse', 'stringify', 'roundtrip'],
  corpus: CORPORA,
  size: [128, 1024, 16384],
  n: [1e4],
}, {
  test: { size: 128 },
});

function main({ op, corpus, size, n }) {
  const request = createJsonPayload(corpus, size);
  const expected = createJsonResponse(corpus, size);
  const source = request.toString('utf8');

  const preflight = JSON.parse(source);
  preflight.count = 1;
  assert.deepStrictEqual(
    Buffer.from(JSON.stringify(preflight), 'utf8'), expected);

  let result;
  switch (op) {
    case 'parse':
      bench.start();
      for (let i = 0; i < n; i++) {
        result = JSON.parse(source);
      }
      bench.end(n);
      break;
    case 'stringify': {
      const value = JSON.parse(source);
      bench.start();
      for (let i = 0; i < n; i++) {
        result = JSON.stringify(value);
      }
      bench.end(n);
      break;
    }
    case 'roundtrip':
      bench.start();
      for (let i = 0; i < n; i++) {
        const value = JSON.parse(source);
        value.count = 1;
        result = JSON.stringify(value);
      }
      bench.end(n);
      break;
    default:
      throw new Error(`Unsupported JSON operation: ${op}`);
  }

  assert.notStrictEqual(result, undefined);
}
