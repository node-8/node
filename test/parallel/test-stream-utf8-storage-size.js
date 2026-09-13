'use strict';

const common = require('../common');
const assert = require('assert');
const net = require('net');

// Run in stock and node-8 profiles. Buffer encoding defines each profile's
// wire contract, including lone surrogates and raw bytes.
const payloads = [
  ['a'.repeat(65535), 'utf8'],
  ['a'.repeat(65536), 'utf8'],
  ['Aé中😀'.repeat(32768), 'utf8'],
  ['a\ud800b\udc00'.repeat(32768), 'utf8'],
  [String.fromCharCode(0x80, 0xff).repeat(65536), 'utf8'],
  ['é'.repeat(65536), 'latin1'],
  ['aé'.repeat(65536), 'utf16le'],
  ['616263'.repeat(16384), 'hex'],
];

async function main() {
  const server = net.createServer();
  server.on('error', common.mustNotCall());
  await new Promise((resolve) => server.listen(0, common.localhostIPv4, resolve));

  for (const [payload, encoding] of payloads) {
    for (const mode of ['single', 'strings', 'mixed']) {
      const chunks = [[payload, encoding]];
      if (mode !== 'single') chunks.push(['tail-é', 'utf8']);
      if (mode === 'mixed') chunks.splice(1, 0, [Buffer.from([0, 255, 13, 10])]);
      const expected = Buffer.concat(chunks.map(([chunk, enc]) =>
        (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc))));

      await new Promise((resolve, reject) => {
        server.once('connection', common.mustCall((socket) => {
          socket.on('error', reject);
          if (mode === 'single') {
            socket._write = common.mustCall(socket._write);
            socket._writev = common.mustNotCall();
            socket.end(payload, encoding, common.mustSucceed());
          } else {
            socket._writev = common.mustCall(socket._writev);
            socket.cork();
            for (const [chunk, enc] of chunks) {
              socket.write(chunk, enc, common.mustSucceed());
            }
            socket.end(common.mustSucceed());
          }
        }));
        const received = [];
        const client = net.connect(server.address().port, common.localhostIPv4);
        client.on('error', reject);
        client.on('data', (chunk) => received.push(chunk));
        client.on('end', common.mustCall(() => {
          const actual = Buffer.concat(received);
          const label = `${mode}/${encoding}/${payload.length}`;
          assert.strictEqual(actual.length, expected.length, label);
          assert.strictEqual(actual.equals(expected), true, label);
          resolve();
        }));
      });
    }
  }
  await new Promise((resolve) => server.close(resolve));
}

main().then(common.mustCall());
