'use strict';
const common = require('../common');
common.skipIfInspectorDisabled();

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { Session } = require('node:inspector/promises');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');

(async () => {
  if (!isMainThread) parentPort.on('message', () => {});
  const session = new Session();
  try {
    for (let i = 0; i < 8; i++) {
      if (isMainThread) session.connect();
      else session.connectToMainThread();
      try {
        const value = '\u00e9\u4e2d\u{1f600}';
        const { result, exceptionDetails } = await session.post('Runtime.evaluate', {
          expression: `(${JSON.stringify(value)}).length`,
          returnByValue: true,
        });
        assert.strictEqual(exceptionDetails, undefined);
        assert.strictEqual(result.value, value.length);
      } finally {
        session.disconnect();
      }
    }
  } finally {
    if (!isMainThread) parentPort.close();
  }
  if (isMainThread) {
    const worker = new Worker(__filename);
    const [code] = await once(worker, 'exit');
    assert.strictEqual(code, 0);
  }
})().then(common.mustCall());
