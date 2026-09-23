'use strict';
const common = require('../common');
common.skipIfInspectorDisabled();

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { Session } = require('node:inspector/promises');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const node8 = '\u00e9'.length === 2;
const hex = (value) => Buffer.from(value, 'utf8').toString('hex');
let checks = 0;

async function checkRequests(mainThread) {
  const session = new Session();
  if (mainThread) session.connectToMainThread();
  else session.connect();
  try {
    const fixtures = ['', 'ASCII', '\u00e9', '\u4e2d', '\u{1f600}',
                      '\u00e9\u4e2d\u{1f600}', 'e\u0301', 'a\u0000"\\z',
                      '\u00e9\u4e2d\u{1f600}'.repeat(1024)];
    const pairs = fixtures.map((value) => [value, value]);
    for (const [input, expected] of [
      ['80', 'efbfbd'], ['e228a1', 'efbfbd28efbfbd'],
      ['e282', 'efbfbd'], ['c0af', 'efbfbdefbfbd'],
      ['f4908080', 'efbfbdefbfbdefbfbdefbfbd'],
    ]) {
      pairs.push([Buffer.from(input, 'hex').toString(),
                  Buffer.from(expected, 'hex').toString()]);
    }
    for (const [value, expected] of pairs) {
      const original = hex(value);
      const literal = JSON.stringify(value);
      for (const [label, expression, result] of [
        ['length', `(${literal}).length`, expected.length],
        ['bytes', `Buffer.from(${literal}, 'utf8').toString('hex')`, hex(expected)],
      ]) {
        const response = await session.post('Runtime.evaluate', { expression, returnByValue: true });
        assert.strictEqual(response.exceptionDetails, undefined, label);
        assert.strictEqual(response.result.value, result, `request ${label}/${original.slice(0, 40)}`);
        assert.strictEqual(hex(value), original);
        checks += 3;
      }
    }
    // ASCII JSON/source escapes remain syntax; lone surrogates are not raw
    // malformed protocol bytes and retain the dialect's WTF-8 construction.
    for (const [expression, expected] of [
      ['"\\u00e9".length', node8 ? 2 : 1],
      ['"\\uD800".length', node8 ? 3 : 1],
      ['"\\uD83D\\uDE00".length', node8 ? 4 : 2],
      ['(() => { const \u4e2d = 42; return \u4e2d; })()', 42],
    ]) {
      const response = await session.post('Runtime.evaluate', { expression, returnByValue: true });
      assert.strictEqual(response.exceptionDetails, undefined);
      assert.strictEqual(response.result.value, expected);
      checks += 2;
    }
    session.disconnect();
    await assert.rejects(session.post('Runtime.evaluate', { expression: '42' }), {
      code: 'ERR_INSPECTOR_NOT_CONNECTED',
    });
    checks++;
  } finally {
    session.disconnect();
  }
}

(async () => {
  if (!isMainThread && workerData === 'inspector-request-utf8') {
    // An inspector request alone does not keep the worker's event loop alive.
    parentPort.on('message', () => {});
    try {
      await checkRequests(true);
      process.stdout.write(`worker: ${checks} checks passed\n`);
    } finally {
      parentPort.close();
    }
    return;
  }
  await checkRequests(false);
  const worker = new Worker(__filename, { workerData: 'inspector-request-utf8' });
  const [code] = await once(worker, 'exit');
  assert.strictEqual(code, 0);
  process.stdout.write(`local: ${checks} checks passed\n`);
})().then(common.mustCall());
