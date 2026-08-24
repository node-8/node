// Flags: --experimental-node-8-string-semantics
'use strict';

const assert = require('node:assert/strict');
const {
  domainToASCII,
  domainToUnicode,
  fileURLToPath,
  parse,
  pathToFileURL,
  urlToHttpOptions,
} = require('node:url');

const eAcute = String.fromCodePoint(0xE9);
const cjk = String.fromCodePoint(0x4E2D);
const chinese = cjk + String.fromCodePoint(0x6587);
const domain = String.fromCodePoint(0x4F8B) + '.com';
const emoji = String.fromCodePoint(0x1F600);

const url = new URL(
  `https://${domain}/${eAcute}${cjk}?q=${emoji}#${eAcute}`,
);
assert.strictEqual(
  url.href,
  'https://xn--fsq.com/%C3%A9%E4%B8%AD?q=%F0%9F%98%80#%C3%A9',
);
assert.strictEqual(url.hostname, 'xn--fsq.com');
assert.strictEqual(url.pathname, '/%C3%A9%E4%B8%AD');
assert.strictEqual(url.search, '?q=%F0%9F%98%80');
assert.strictEqual(url.hash, '#%C3%A9');
assert.deepStrictEqual({ ...urlToHttpOptions(url) }, {
  protocol: 'https:',
  hostname: 'xn--fsq.com',
  hash: '#%C3%A9',
  search: '?q=%F0%9F%98%80',
  pathname: '/%C3%A9%E4%B8%AD',
  path: '/%C3%A9%E4%B8%AD?q=%F0%9F%98%80',
  href: 'https://xn--fsq.com/%C3%A9%E4%B8%AD?q=%F0%9F%98%80#%C3%A9',
});

assert.strictEqual(
  new URL(`${eAcute}${cjk}`, `https://${domain}/base/`).href,
  'https://xn--fsq.com/base/%C3%A9%E4%B8%AD',
);
assert.strictEqual(URL.canParse(`https://${domain}/${eAcute}`), true);
assert.strictEqual(URL.parse(`https://${domain}/${eAcute}`).href,
                   'https://xn--fsq.com/%C3%A9');

{
  const value = new URL('https://example.com/');
  value.pathname = `/${eAcute}${cjk}`;
  value.search = `?q=${emoji}`;
  value.hash = `#${eAcute}`;
  assert.strictEqual(
    value.href,
    'https://example.com/%C3%A9%E4%B8%AD?q=%F0%9F%98%80#%C3%A9',
  );
}

assert.strictEqual(domainToASCII(domain), 'xn--fsq.com');
assert.strictEqual(Buffer.from(domainToUnicode('xn--fsq.com')).toString('hex'),
                   'e4be8b2e636f6d');

const fileURL = pathToFileURL(`/tmp/${eAcute}${cjk}`);
assert.strictEqual(fileURL.href, 'file:///tmp/%C3%A9%E4%B8%AD');
assert.strictEqual(Buffer.from(fileURLToPath(fileURL)).toString('hex'),
                   '2f746d702fc3a9e4b8ad');

assert.strictEqual(
  parse(`https://${domain}/${eAcute}${cjk}`).href,
  `https://xn--fsq.com/${eAcute}${cjk}`,
);

{
  const params = new URLSearchParams([[chinese, eAcute + emoji]]);
  assert.strictEqual(
    params.toString(),
    '%E4%B8%AD%E6%96%87=%C3%A9%F0%9F%98%80',
  );
  assert.strictEqual(params.get(chinese), eAcute + emoji);
  params.append('space', 'a b');
  params.set(eAcute, cjk);
  assert.strictEqual(
    params.toString(),
    '%E4%B8%AD%E6%96%87=%C3%A9%F0%9F%98%80&space=a+b&%C3%A9=%E4%B8%AD',
  );
}

{
  const value = new URL('https://example.com/');
  value.searchParams.set(chinese, eAcute + emoji);
  assert.strictEqual(
    value.href,
    'https://example.com/?%E4%B8%AD%E6%96%87=%C3%A9%F0%9F%98%80',
  );
}

const replacement = '%EF%BF%BD';
const malformed = Buffer.from('e228a1', 'hex').toString();
const surrogate = String.fromCodePoint(0xD800);
assert.strictEqual(
  new URL(`https://example.com/${malformed}`).href,
  `https://example.com/${replacement}(${replacement}`,
);
assert.strictEqual(
  new URL(`https://example.com/${surrogate}`).href,
  `https://example.com/${replacement}`,
);
assert.strictEqual(new URLSearchParams([['x', malformed]]).toString(),
                   `x=${replacement}%28${replacement}`);
assert.strictEqual(new URLSearchParams([['x', surrogate]]).toString(),
                   `x=${replacement}`);
