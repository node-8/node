'use strict';

const common = require('../common');
common.skipIfSQLiteMissing();
const assert = require('node:assert');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const tmpdir = require('../common/tmpdir');

if (process.argv[2] === 'child') {
  process.once('message', common.mustCall(() => {
    try {
      localStorage.setItem(process.argv[3], '\u4e2d\u{1f600}');
      assert.strictEqual(localStorage.getItem(process.argv[3]), '\u4e2d\u{1f600}');
      console.log('stored');
    } catch (error) {
      console.log(JSON.stringify({ code: error.code, message: error.message }));
      process.exitCode = 3;
    }
    process.disconnect();
  }));
  process.send('ready');
} else {
  tmpdir.refresh();
  run().then(common.mustCall());
}

async function run() {
  let checks = 0;
  for (const pairing of [[false, false], [true, true], [false, true]]) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const path = join(tmpdir.path, `${pairing.join('-')}-${attempt}.db`);
      const children = pairing.map((byte, index) => {
        const child = fork(__filename, ['child', `${index}:\u00e9`], {
          execArgv: ['--v8-pool-size=2', `--localstorage-file=${path}`,
                     ...(byte ? ['--experimental-node-8-string-semantics'] : [])],
          silent: true,
          timeout: common.platformTimeout(10000),
        });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8').on('data', (data) => { stdout += data; });
        child.stderr.setEncoding('utf8').on('data', (data) => { stderr += data; });
        return {
          child,
          ready: once(child, 'message').then(([message]) => message),
          closed: once(child, 'close').then(([code, signal]) => ({ code, signal, stdout, stderr })),
        };
      });
      try {
        const readiness = Promise.all(children.map(({ ready }) => ready));
        // An early exit (including the child timeout) must not hang readiness.
        const earlyExit = Promise.race(children.map(({ closed }) => closed)).then((result) => {
          throw new Error(`Child exited before initialization: ${JSON.stringify(result)}`);
        });
        assert.deepStrictEqual(await Promise.race([readiness, earlyExit]), ['ready', 'ready']);
        for (const { child } of children) child.send('start');
        const results = await Promise.all(children.map(({ closed }) => closed));
        const expected = pairing[0] === pairing[1] ? [0, 0] : [0, 3];
        assert.deepStrictEqual(results.map(({ code }) => code).sort(), expected, JSON.stringify(results));
        for (const { code, signal, stdout, stderr } of results) {
          assert.strictEqual(signal, null, stderr);
          if (code === 0) {
            assert.strictEqual(stdout, 'stored\n');
          } else {
            const error = JSON.parse(stdout);
            assert.strictEqual(error.code, 'ERR_INVALID_STATE');
            assert.match(error.message, /incompatible string format|newer version of Node\.js/);
          }
        }
        const db = new DatabaseSync(path);
        try {
          const { schema_version: version, total_size: total } = db.prepare(
            'SELECT schema_version, total_size FROM nodejs_webstorage_state').get();
          const rows = db.prepare('SELECT key, value FROM nodejs_webstorage').all();
          assert.strictEqual(rows.length, expected.filter((code) => code === 0).length);
          assert.strictEqual(version, pairing[results.findIndex(({ code }) => code === 0)] ? 2 : 1);
          assert.strictEqual(total, rows.reduce((sum, { key, value }) => sum + key.length + value.length, 0));
          assert.strictEqual(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
        } finally {
          db.close();
        }
        checks++;
      } finally {
        for (const { child } of children) {
          if (child.exitCode === null && child.signalCode === null) child.kill();
        }
      }
    }
  }
  console.log(`WebStorage concurrent initialization: ${checks} checks passed`);
}
