'use strict';
const common = require('../common');
common.skipIfInspectorDisabled();

const assert = require('node:assert/strict');
const { Session } = require('node:inspector/promises');
const vm = require('node:vm');

(async () => {
  const session = new Session();
  session.connect();
  const parsed = new Map();
  session.on('Debugger.scriptParsed', ({ params }) => {
    parsed.set(params.scriptId, params);
  });
  const prepareStackTrace = Error.prepareStackTrace;
  let checks = 0;
  try {
    await session.post('Runtime.enable');
    await session.post('Debugger.enable');
    Error.prepareStackTrace = (error, frames) => frames[0].getScriptNameOrSourceURL();
    for (const text of ['ASCII', '\u00e9', '\u4e2d', '\u{1f600}']) {
      const url = `${text}.js`;
      const mapping = `${text}.map`;
      const directives = `//# sourceURL= \t${url} \t\n` +
        `//# sourceMappingURL= \t${mapping} \t\n`;
      const capture = '(function capture() { return new Error().stack; })';
      const value = vm.runInThisContext(`${capture}\n${directives}`)();
      assert.strictEqual(value, url);
      assert.strictEqual(Buffer.from(value).toString('hex'), Buffer.from(url).toString('hex'));
      assert.strictEqual(vm.runInThisContext(capture, { filename: url })(), url);
      checks += 3;
      for (const [comments, expectedURL, expectedMapping] of [
        [directives, url, mapping],
        [`//# sourceURL=ignored\n//# sourceMappingURL=ignored\n${directives}`, url, mapping],
        [`${directives}//# sourceURL=invalid suffix\n//# sourceMappingURL=invalid suffix\n`,
         'fallback.js', ''],
      ]) {
        const { scriptId, exceptionDetails } = await session.post('Runtime.compileScript', {
          expression: `42;\n${comments}`,
          sourceURL: 'fallback.js',
          persistScript: true,
        });
        assert.strictEqual(exceptionDetails, undefined);
        const info = parsed.get(scriptId);
        assert.ok(info);
        assert.strictEqual(info.url, expectedURL);
        assert.strictEqual(info.sourceMapURL, expectedMapping);
        checks += 4;
      }
    }
  } finally {
    Error.prepareStackTrace = prepareStackTrace;
    session.disconnect();
  }
  process.stdout.write(`magic URLs: ${checks} checks passed\n`);
})().then(common.mustCall());
