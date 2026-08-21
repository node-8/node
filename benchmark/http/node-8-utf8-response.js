'use strict';

const common = require('../common.js');
const path = require('path');
const {
  CORPORA,
  createPayload,
  createServer,
} = require('../fixtures/node-8-http-utf8.js');

const bench = common.createBenchmark(main, {
  scenario: ['h01-buffer', 'h02-cached-string', 'h05-string-echo'],
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
    if (scenario === 'h05-string-echo') {
      options.method = 'POST';
      options.body = createPayload(corpus, size);
      options.script = path.resolve(
        __dirname, '../fixtures/node-8-http-post.lua');
    }
    bench.http(options, () => server.close());
  });
}
