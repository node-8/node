'use strict';

require('../common');
const assert = require('node:assert/strict');

const byteMode = process.execArgv.includes('--experimental-node-8-string-semantics');
assert.strictEqual(String.fromCodePoint(233).length, byteMode ? 2 : 1);

function checkFetchByteString(api = { Headers, Request, Response }) {
  let checks = 0;
  function equal(actual, expected, label) {
    assert.strictEqual(actual, expected, label);
    checks++;
  }

  function throwsTypeError(action, label) {
    assert.throws(action, { name: 'TypeError' }, label);
    checks++;
  }
  const headerInputs = [
    (value) => new api.Headers([['x-test', value]]),
    (value) => new api.Headers({ 'x-test': value }),
    (value) => {
      const headers = new api.Headers();
      headers.append('x-test', value);
      return headers;
    },
    (value) => {
      const headers = new api.Headers();
      headers.set('x-test', value);
      return headers;
    },
  ];

  // Independent Unicode scalars, not raw fromCharCode bytes. Fetch permits
  // more controls than native HTTP, but neither permits embedded NUL/CR/LF.
  for (let cp = 0; cp <= 255; cp++) {
    const value = `L${String.fromCodePoint(cp)}R`;
    for (const makeHeaders of headerInputs) {
      if (cp === 0 || cp === 10 || cp === 13) {
        throwsTypeError(() => makeHeaders(value), `header control ${cp}`);
      } else {
        const result = makeHeaders(value).get('x-test');
        equal(result, value, `Latin-1 header ${cp}`);
        assert.deepStrictEqual(Array.from(Buffer.from(result, 'latin1')), [76, cp, 82]);
        checks++;
      }
    }
    if (cp === 9 || (cp >= 32 && cp !== 127)) {
      equal(new api.Response(null, { statusText: value }).statusText,
            value, `Latin-1 reason phrase ${cp}`);
    } else {
      throwsTypeError(() => new api.Response(null, { statusText: value }),
                      `reason phrase control ${cp}`);
    }
  }

  for (const [label, value] of [
    ['U0100', String.fromCodePoint(0x100)],
    ['U010A', String.fromCodePoint(0x10a)],
    ['U010D', String.fromCodePoint(0x10d)],
    ['CJK', String.fromCodePoint(0x4e2d)],
    ['emoji', String.fromCodePoint(0x1f600)],
    ['lead surrogate', String.fromCodePoint(0xd800)],
    ['trail surrogate', String.fromCodePoint(0xdfff)],
  ]) {
    for (const makeHeaders of headerInputs) {
      throwsTypeError(() => makeHeaders(value), `FETCH_BYTESTRING_REJECT_${label}`);
      throwsTypeError(() => makeHeaders(`prefix${value}suffix`), label);
      throwsTypeError(() => makeHeaders('a'.repeat(512) + value), label);
    }
    throwsTypeError(() => new api.Response(null, { statusText: value }), label);
  }

  if (byteMode) {
    for (const input of [
      [0xff], [0x80], [0xbf], [0xc2], [0xc3], [0xc2, 0x7f], [0xc3, 0xc0],
      [0xc0, 0x80], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80],
      [0xf0, 0x9f, 0x98], [0xf4, 0x90, 0x80, 0x80],
    ]) {
      const value = String.fromCharCode(...input);
      for (const makeHeaders of headerInputs) {
        throwsTypeError(() => makeHeaders(value), 'malformed ByteString');
      }
      throwsTypeError(() => new api.Response(null, { statusText: value }), 'malformed reason');
    }
    equal(String.fromCharCode(255).length, 1, 'raw FF remains a byte');
    equal(String.fromCodePoint(255).length, 2, 'Unicode FF remains UTF-8');
  }

  const latin1 = Buffer.from([233, 255]).toString('latin1');
  equal(new api.Headers([['x-test', latin1]]).get('x-test'), latin1, 'decoded Latin-1');
  for (const makeHeaders of headerInputs) {
    equal(makeHeaders(' \tvalue\r\n').get('x-test'), 'value', 'HTTP whitespace trim');
    for (const primitive of [null, undefined, false, 123]) {
      equal(makeHeaders(primitive).get('x-test'), String(primitive), 'primitive coercion');
    }
    let coercions = 0;
    const object = { toString() { coercions++; return latin1; } };
    equal(makeHeaders(object).get('x-test'), latin1, 'object coercion');
    equal(coercions, 1, 'one String coercion');
    throwsTypeError(() => makeHeaders(Symbol('value')), 'symbol input');
    const thrown = new Error('coercion failure');
    assert.throws(() => makeHeaders({ toString() { throw thrown; } }), (e) => e === thrown);
    checks++;
  }
  for (const value of ['', 'space name', 'x\nname', String.fromCodePoint(233),
                       String.fromCodePoint(0x100)]) {
    throwsTypeError(() => new api.Headers([[value, 'ok']]), 'invalid name');
    throwsTypeError(() => new api.Request('http://example.invalid/', { method: value }),
                    'invalid method');
  }
  const original = new api.Headers([['x-test', latin1]]);
  equal(new api.Headers(original).get('x-test'), latin1, 'Headers copy');
  equal(new api.Request('http://example.invalid/', { headers: original }).headers.get('x-test'),
        latin1, 'Request headers copy');
  equal(new api.Response(null, { headers: original }).headers.get('x-test'),
        latin1, 'Response headers copy');
  if (!byteMode) {
    assert.throws(() => new api.Headers([['x-test', `A${String.fromCodePoint(0x100)}`]]), {
      name: 'TypeError',
      message: 'Cannot convert argument to a ByteString because the character at ' +
               'index 1 has a value of 256 which is greater than 255.',
    });
    checks++;
  }
  return checks;
}

if (require.main === module) {
  const profile = byteMode ? 'node8' : 'stock';
  console.log(JSON.stringify({ kind: 'profile', profile, identity_verified: true }));
  console.log(JSON.stringify({ kind: 'summary', profile, checks: checkFetchByteString() }));
} else {
  module.exports = checkFetchByteString;
}
