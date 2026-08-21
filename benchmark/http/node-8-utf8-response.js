'use strict';

const common = require('../common.js');
const {
  CORPORA,
  createServer,
} = require('../fixtures/node-8-http-utf8.js');

const bench = common.createBenchmark(main, {
  scenario: ['h01-buffer', 'h02-cached-string'],
  corpus: CORPORA,
  size: [128, 1024, 16384, 262144],
  c: [1, 50],
  duration: 10,
});

function main({ scenario, corpus, size, c, duration }) {
  const server = createServer([{ corpus, size }]);
  server.listen(0, '127.0.0.1', () => {
    bench.http({
      path: `/${scenario}/${corpus}/${size}`,
      connections: c,
      duration,
      port: server.address().port,
    }, () => server.close());
  });
}
