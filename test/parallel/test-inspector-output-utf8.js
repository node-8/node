'use strict';
const common = require('../common');
common.skipIfInspectorDisabled();

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { Session } = require('node:inspector/promises');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const byteMode = '\u00e9'.length === 2;
let checks = 0;

function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}

async function checkOutput() {
  const session = new Session();
  if (isMainThread) session.connect();
  else session.connectToMainThread();
  async function evaluate(expression, options = {}) {
    const response = await session.post('Runtime.evaluate', { expression, ...options });
    equal(response.exceptionDetails, undefined, 'evaluate');
    return response.result;
  }
  try {
    await session.post('Runtime.enable');
    await session.post('Debugger.enable');
    for (const points of [[], [65, 90], [0xe9], [0x4e2d, 0x6587], [0x1f600],
                          [101, 0x301], [0xe9, 0x4e2d, 0x1f600], [65, 0, 90]]) {
      const expression = `String.fromCodePoint(${points.join(',')})`;
      const expected = String.fromCodePoint(...points);
      equal((await evaluate(expression)).value, expected, 'output value');
      equal((await evaluate(JSON.stringify(expected))).value, expected, 'input/output');
      const object = await evaluate(`({[${expression}]:${expression}})`, { generatePreview: true });
      equal(object.preview.properties[0].name, expected, 'preview name');
      equal(object.preview.properties[0].value, expected, 'preview value');
      const properties = await session.post('Runtime.getProperties', {
        objectId: object.objectId, ownProperties: true,
      });
      equal(properties.result[0].name, expected, 'property name');
      equal(properties.result[0].value.value, expected, 'property value');
      const called = await session.post('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: 'function() { return Object.keys(this)[0]; }',
      });
      equal(called.exceptionDetails, undefined, 'call');
      equal(called.result.value, expected, 'call result');
      await session.post('Runtime.releaseObject', { objectId: object.objectId });
    }

    const text = '\u00e9\u4e2d\u{1f600}';
    const consoleEvent = once(session, 'Runtime.consoleAPICalled');
    await evaluate(`console.log(${JSON.stringify(text)})`);
    equal((await consoleEvent)[0].params.args[0].value, text, 'console');
    const exception = await session.post('Runtime.evaluate', {
      expression: `throw new Error(${JSON.stringify(text)})`,
    });
    equal(exception.exceptionDetails.exception.description.includes(text), true, 'exception');

    const source = `globalThis.inspectorUnicode = ${JSON.stringify(text)};\n// ${text}`;
    const url = `test-${text}.js`;
    // Filter out unrelated scripts compiled by the running Node/worker harness.
    const parsed = new Promise((resolve) => {
      function onParsed(event) {
        if (event.params.url !== url) return;
        session.removeListener('Debugger.scriptParsed', onParsed);
        resolve(event.params);
      }
      session.on('Debugger.scriptParsed', onParsed);
    });
    const compiled = await session.post('Runtime.compileScript', {
      expression: source, sourceURL: url, persistScript: true,
    });
    equal(compiled.exceptionDetails, undefined, 'compile');
    equal((await parsed).scriptId, compiled.scriptId, 'script URL');
    const { scriptId } = compiled;
    equal((await session.post('Debugger.getScriptSource', { scriptId })).scriptSource,
          source, 'script source');
    const found = await session.post('Debugger.searchInContent', { scriptId, query: text });

    for (const unit of [0xd800, 0xdc00]) {
      equal((await evaluate(`String.fromCodePoint(${unit})`)).value,
            String.fromCodePoint(byteMode ? 0xfffd : unit), 'surrogate boundary');
    }
    if (byteMode) {
      for (const [expression, expected, raw] of [
        ["'\\xff'", '\ufffd', 'ff'],
        ["'\\xe2\\x82'", '\ufffd', 'e282'],
        ["'\\xe2\\x82x'", '\ufffdx', 'e28278'],
        ["'\\x80\\xbf'", '\ufffd\ufffd', '80bf'],
        ["'\\xed\\xa0\\x80'", '\ufffd', 'eda080'],
      ]) {
        equal((await evaluate(expression)).value, expected, 'malformed boundary');
        equal((await evaluate(`Buffer.from(${expression}).toString('hex')`)).value,
              raw, 'application bytes unchanged');
      }
    }
    const object = await evaluate(`({value:${JSON.stringify(text.repeat(60))}})`, {
      generatePreview: true,
    });
    const preview = object.preview.properties[0].value;
    equal(preview.includes('\ufffd'), false, 'preview sequence boundary');
    equal(preview.includes('\u2026'), true, 'preview ellipsis');
    session.disconnect();
    if (isMainThread) session.connect();
    else session.connectToMainThread();
    equal((await evaluate(JSON.stringify(text))).value, text, 'reconnect');
    equal(found.result.length, 2, 'source search count');
    equal(found.result[1].lineContent, `// ${text}`, 'source search text');
  } finally {
    session.disconnect();
  }
}

(async () => {
  if (!isMainThread) parentPort.on('message', () => {});
  try {
    await checkOutput();
    process.stdout.write(`${isMainThread ? 'local' : 'worker'}: ${checks} output checks passed\n`);
  } finally {
    if (!isMainThread) parentPort.close();
  }
  if (isMainThread) {
    const worker = new Worker(__filename);
    const [code] = await once(worker, 'exit');
    equal(code, 0, 'worker exit');
  }
})().then(common.mustCall());
