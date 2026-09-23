// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const tmpdir = require('../common/tmpdir');
const { createMatcher } = require('internal/fs/glob');
const byteMode = String.fromCodePoint(233).length === 2;
const profile = byteMode ? 'node8' : 'stock';
let checks = 0;
let failed = 0;
const failures = [];
const filesystemResults = [];
function equal(actual, expected, label) {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failed++;
    if (failures.length < 24) failures.push({ label, actual, expected });
  }
}

// Counts are independent of length, iteration, RegExp and the width helper.
const prefixes = [
  ['A', 1, 1], ['AB', 2, 2], ['é', 1, 1], ['中', 1, 1], ['😀', 1, 2],
  ['é中', 2, 2], ['é中😀', 3, 4], ['e\u0301', 2, 2],
  [String.fromCodePoint(0xd800), 1, 1],
  [String.fromCodePoint(0xdc00), 1, 1],
  [String.fromCodePoint(0xd800) + String.fromCodePoint(0xdc00), 2, 2],
];
for (const [prefix, byteCount, stockCount] of prefixes) {
  const count = byteMode ? byteCount : stockCount;
  for (const suffix of ['', '.txt', '中', '😀']) {
    for (let n = 1; n <= 5; n++) {
      const pattern = '?'.repeat(n) + suffix;
      const file = prefix + suffix;
      const label = `${Buffer.from(prefix).toString('hex')}/${n}/${suffix}`;
      equal(path.posix.matchesGlob(file, pattern), n === count, `posix ${label}`);
      equal(path.win32.matchesGlob(file, pattern), n === count, `win32 ${label}`);
      equal(createMatcher(pattern).match(file), n === count, `internal ${label}`);
    }
  }
}

for (const dot of [false, true]) {
  for (const [file, pattern, expected] of [
    ['.é', '??', dot], ['.é.txt', '??.txt', dot],
    ['.', '?', false], ['..', '??', false],
    ['A.TXT', '?.txt', true], ['中.TXT', '?.txt', true],
    ['AK', '?k', true], ['Ak', '?K', true],
    ['Aẞ', '?ß', true], ['Aß', '?ẞ', true],
    ['AK', '?x', false], ['Aİ', '?İ', true],
    ['AΣ', '?Σ', false], ['AΣ', '?ς', true],
    ['ΑΣ', '?Σ', false], ['ΑΣ', '?ς', true],
    ['A\u0301Σ', '?\u0301Σ', false], ['İK', '?k', true],
  ]) {
    equal(createMatcher(pattern, { dot, nocase: true }).match(file), expected,
          `dot=${dot} nocase ${file}/${pattern}`);
  }
}

// No wildcard crosses '/', and a literal suffix may not overlap its prefix.
for (const [file, pattern, expected] of [
  ['', '?', false], ['A', '??', false], ['AB', '?', false],
  ['.A', '??', false], ['A/B', '???', false], ['A/B', '?/?', true],
  ['中.txt', '*.txt', true], ['é中.txt', '*.txt', true],
  ['A.txt', '?.csv', false], ['中.txt', '?.csv', false],
  ['中', '?中', false], ['中中', '?中', true],
]) {
  equal(path.posix.matchesGlob(file, pattern), expected, `control ${file}/${pattern}`);
}

if (byteMode) {
  const vectors = [
    ['80', 1], ['c0af', 2], ['e4b8', 1], ['f09f98', 1],
    ['e4b841', 2], ['e08080', 3], ['f4908080', 4], ['eda080', 1],
    ['edb080', 1], ['eda080edb080', 2], ['c28080', 2], ['80808080', 4],
  ];
  for (const [hex, count] of vectors) {
    const prefix = Buffer.from(hex, 'hex').toString();
    for (let n = 1; n <= 5; n++) {
      equal(path.posix.matchesGlob(prefix, '?'.repeat(n)), n === count, `raw ${hex}/${n}`);
      equal(path.posix.matchesGlob(`${prefix}.txt`, `${'?'.repeat(n)}.txt`), n === count,
            `raw suffix ${hex}/${n}`);
    }
  }
  // A continuation literal must not split the valid scalar consumed by '?'.
  const continuation = String.fromCharCode(0xa9);
  equal(path.posix.matchesGlob('é', `?${continuation}`), false, 'no suffix clipping');
  equal(path.posix.matchesGlob(`A${continuation}`, `?${continuation}`), true, 'raw suffix');
  const longSuffix = '.txt'.repeat(1024);
  const rope = '中' + longSuffix;
  equal(path.posix.matchesGlob(rope, '?' + longSuffix), true, 'rope prefix');
  equal(path.posix.matchesGlob(('AA' + rope + 'BB').slice(2, -2), '?' + longSuffix), true,
        'sliced prefix');

  // The new internal predicate uses captured primordials, not user overrides.
  const predicate = createMatcher('?.txt', { nocase: true }).set[0][0].test;
  const methods = ['charCodeAt', 'endsWith', 'slice', 'toLowerCase'];
  const saved = methods.map((name) => String.prototype[name]);
  let matched;
  try {
    for (const name of methods) {
      String.prototype[name] = () => { throw new Error('String prototype override used'); };
    }
    matched = predicate('中.TXT');
  } finally {
    methods.forEach((name, index) => { String.prototype[name] = saved[index]; });
  }
  equal(matched, true, 'primordial predicate');
}

async function filesystem() {
  tmpdir.refresh();
  const directory = fs.mkdtempSync(path.join(tmpdir.path, 'glob-byte-'));
  const names = ['A.txt', 'AB.txt', 'é.txt', '中.txt', '😀.txt', 'é中.txt', '.é.txt'];
  try {
    for (const name of names) fs.writeFileSync(path.join(directory, name), '');
    fs.mkdirSync(path.join(directory, '目录'));
    fs.writeFileSync(path.join(directory, '目录', '中.txt'), '');
    const vectors = [
      ['?.txt', byteMode ? ['A.txt', 'é.txt', '中.txt', '😀.txt'] : ['A.txt', 'é.txt', '中.txt']],
      ['??.txt', byteMode ? ['AB.txt', 'é中.txt'] : ['AB.txt', 'é中.txt', '😀.txt']],
      ['????.txt', []],
      ['*.txt', names.filter((name) => name !== '.é.txt')],
      ['目录/?.txt', [path.join('目录', '中.txt')]],
    ];
    for (const [pattern, expected] of vectors) {
      expected.sort();
      const sync = fs.globSync(pattern, { cwd: directory }).sort();
      equal(sync, expected, `sync ${pattern}`);
      const found = [];
      for await (const name of fs.promises.glob(pattern, { cwd: directory })) {
        assert.ok(found.length < 32, 'bounded fixture iteration');
        found.push(name);
      }
      equal(found.sort(), expected, `async ${pattern}`);
      filesystemResults.push({ pattern, expected, sync, async: found });
    }
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
}

filesystem().then(common.mustCall(() => {
  console.log(JSON.stringify({ kind: 'glob_byte_wildcards', profile, checks, failed,
                               failures, filesystemResults }));
  assert.strictEqual(failed, 0, `glob byte wildcard correctness (${profile})`);
}));
