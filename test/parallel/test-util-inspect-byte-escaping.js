'use strict';

require('../common');
const assert = require('node:assert/strict');
const { Console } = require('node:console');
const { Writable } = require('node:stream');

function checkInspect(api = require('node:util'), checkConsole = true) {
  const byteMode = process.execArgv.includes('--experimental-node-8-string-semantics');
  assert.strictEqual(String.fromCodePoint(233).length, byteMode ? 2 : 1);
  const options = { maxStringLength: null, breakLength: Infinity, compact: true };
  const inspect = (value) => api.inspect(value, options);
  let checks = 0;
  const failureLabel = 'INSPECT_BYTE_ESCAPING';
  function equal(actual, expected) {
    assert.strictEqual(actual, expected, failureLabel);
    checks++;
  }
  const samples = [
    ['ASCII', "'ASCII'"],
    ['é中😀', "'é中😀'"],
    ['😀\n', "'😀\\n'"],
    ['😀\\', "'😀\\\\'"],
    ["😀'", '"😀\'"'],
    ['😀\'"', '`😀\'"`'],
    ['😀\'"`', "'😀\\'\"`'"],
    // eslint-disable-next-line no-template-curly-in-string
    ['😀\'"${x}', "'😀\\'\"${x}'"],
    ['\0\t\r\n\x7f', "'\\x00\\t\\r\\n\\x7F'"],
    ['\u0080\u009f', byteMode ? "'\\u0080\\u009F'" : "'\\x80\\x9F'"],
    ['\u00a0\u0120\u2028\u2029', "'\u00a0\u0120\u2028\u2029'"],
    ['\ud800', "'\\ud800'"],
    ['\udfff', "'\\udfff'"],
    ['\ud800\udc00😀', "'\ud800\udc00😀'"],
    ['\ud800😀\udfff\n', "'\\ud800😀\\udfff\\n'"],
  ];
  for (const padding of [0, 90, 96, 99, 100, 101, 4995, 5000]) {
    const prefix = 'a'.repeat(padding);
    for (const [input, expected] of samples) {
      equal(inspect(prefix + input), expected[0] + prefix + expected.slice(1));
    }
  }
  for (let cp = 0x80; cp <= 0x9f; cp++) {
    const value = String.fromCodePoint(cp);
    const hex = cp.toString(16).toUpperCase();
    const escaped = byteMode ? `\\u00${hex}` : `\\x${hex}`;
    equal(inspect(value), `'${escaped}'`);
    equal(inspect(`${value}😀\n`), `'${escaped}😀\\n'`);
  }
  equal(inspect({ ['😀']: 'é中😀' }), "{ '😀': 'é中😀' }");
  equal(inspect({ [Symbol('😀\n')]: 1 }), '{ Symbol(😀\\n): 1 }');
  equal(inspect({ [Symbol('\u0080')]: 1 }), byteMode ?
    '{ Symbol(\\u0080): 1 }' : '{ Symbol(\\x80): 1 }');
  equal(api.format('%o', { ['😀']: 'é中😀' }), "{ '😀': 'é中😀' }");
  equal(api.format('%s', 'é中😀'), 'é中😀');
  equal(api.formatWithOptions(options, '%O', { ['😀']: 'é中😀' }), "{ '😀': 'é中😀' }");

  if (byteMode) {
    // Non-target malformed bytes remain raw. This does not promise that the
    // resulting display String is safe or valid UTF-8 for a terminal.
    for (const bytes of [[0x80], [0x9f], [0xc2], [0xe2, 0x80], [0xf0, 0x9f, 0x98],
                         [0xc0, 0x80], [0xed, 0xa0], [0xed, 0x9f, 0xff], [0xff]]) {
      const raw = String.fromCharCode(...bytes);
      for (const padding of [0, 101, 5001]) {
        const value = 'a'.repeat(padding) + raw;
        equal(inspect(value), `'${value}'`);
        equal(inspect(value + '\n'), `'${value}\\n'`);
      }
    }
    equal(inspect(String.fromCharCode(0xc2, 0x80)), "'\\u0080'");
    equal(inspect(String.fromCharCode(0xed, 0xa0, 0x80)), "'\\ud800'");
    equal(inspect(String.fromCharCode(0xed, 0xa0, 0x80, 0xed, 0xb0, 0x80)), "'\\ud800\\udc00'");
  }
  if (checkConsole) {
    let output = '';
    const stream = new Writable({
      write(chunk, encoding, callback) {
        output += chunk.toString('utf8');
        callback();
      },
    });
    const logger = new Console({ stdout: stream, stderr: stream, colorMode: false });
    logger.log({ ['😀']: 'é中😀' });
    logger.log('%o', { ['😀']: 'é中😀' });
    equal(output, "{ '😀': 'é中😀' }\n{ '😀': 'é中😀' }\n");
    stream.end();
  }
  return { profile: byteMode ? 'node8' : 'stock', identity_verified: true,
           checks, console_verified: checkConsole };
}

if (require.main === module) console.log(JSON.stringify(checkInspect()));
module.exports = checkInspect;
