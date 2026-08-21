'use strict';

const common = require('../common.js');
const path = require('path');
const {
  CORPORA,
  createJsonPayload,
  createPayload,
  createServer,
} = require('../fixtures/node-8-http-utf8.js');

const bench = common.createBenchmark(main, {
  scenario: [
    'h01-buffer',
    'h02-cached-string',
    'h04-buffer-echo',
    'h05-string-echo',
    'h07-json-api',
  ],
  corpus: CORPORA,
  size: [128, 1024, 16384, 262144],
  c: [1, 50],
  duration: 10,
});

function main({ scenario, corpus, size, c, duration }) {
  const server = createServer([{ corpus, size }]);
  server.listen(0, '127.0.0.1', () => {
    const options = {
      path: `/${scenario}/${corpus}/${size}`,
      connections: c,
      duration,
      port: server.address().port,
    };
    if (scenario === 'h04-buffer-echo' ||
        scenario === 'h05-string-echo' ||
        scenario === 'h07-json-api') {
      options.method = 'POST';
      options.body = scenario === 'h07-json-api' ?
        createJsonPayload(corpus, size) : createPayload(corpus, size);
      options.env = {
        NODE_HTTP_BENCHMARK_CONTENT_TYPE: scenario === 'h07-json-api' ?
          'application/json' : 'application/octet-stream',
      };
      options.script = path.resolve(
        __dirname, '../fixtures/node-8-http-post.lua');
    }
    bench.http(options, () => server.close());
  });
}
