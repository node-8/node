// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';
(() => {
  const byte = 'é'.length === 2;
  const units = s => s === undefined ? null :
      Array.from({length: s.length}, (_, i) => s.charCodeAt(i));
  const raw = bytes => String.fromCharCode(...bytes);
  let cases = 0, checks = 0;
  const failures = [];
  const eq = (id, actual, expected) => {
    ++checks;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      if (failures.length < 30) failures.push({id, actual, expected});
    }
  };
  function run(id, source, flags, subject, captures, bounds, start = 0) {
    const re = new RegExp(source, 'd' + flags);
    for (let repeat = 0; repeat < 2; ++repeat) {
      ++cases;
      re.lastIndex = start;
      const match = re.exec(subject);
      eq(id + '/captures', match && Array.from(match, units),
         captures && captures.map(units));
      eq(id + '/bounds', match && match.indices, bounds);
      eq(id + '/index', match && match.index, bounds && bounds[0][0]);
      eq(id + '/flags', re.flags, Array.from('d' + flags).sort().join(''));
      eq(id + '/lastIndex', re.lastIndex, /[gy]/.test(flags) ?
         (bounds ? bounds[0][1] : 0) : start);
      if (match && match.groups) {
        eq(id + '/name', units(match.groups.n), units(captures[1]));
        eq(id + '/name-bound', match.indices.groups.n, bounds[1]);
      }
    }
  }
  for (const unicode of ['', 'u', 'v']) {
    for (const ignore of ['', 'i']) {
      const flags = unicode + ignore;
      for (const ch of ['a', 'é', '中', '😀', '\ud800', '\ufffd']) {
        // Legacy stock dot consumes one UTF-16 unit; exercise its rejection.
        const astralLegacy = !byte && !unicode && ch === '😀';
        const n = ch.length;
        run('pair/' + flags + '/' + ch, '^(.)\\1$', flags, ch + ch,
            astralLegacy ? null : [ch + ch, ch],
            astralLegacy ? null : [[0, 2*n], [0, n]]);
        if (astralLegacy) continue;
        for (const source of ['^([^!])#\\1$', '^(?<n>.)#\\k<n>$',
                              '^(?=(.))\\1#\\1$', '^(.+?)#\\1$',
                              '^(.{1,2})#\\1$', '^(?:none|(.))#\\1$']) {
          run(source + flags, source, flags, ch + '#' + ch,
              [ch + '#' + ch, ch], [[0, 2*n+1], [0, n]]);
        }
        run('repeat/' + flags, '^(.)\\1{2}$', flags, ch.repeat(3),
            [ch.repeat(3), ch], [[0, 3*n], [0, n]]);
        run('backtrack/' + flags, '^(.+)\\1$', flags, ch.repeat(4),
            [ch.repeat(4), ch.repeat(2)], [[0, 4*n], [0, 2*n]]);
        run('reject/' + flags, '^(.)\\1$', flags, ch + '!', null, null);
        run('forward/' + flags, '^\\1(.)$', flags, ch,
            [ch, ch], [[0, n], [0, n]]);
        run('self/' + flags, '^(.\\1)$', flags, ch,
            [ch, ch], [[0, n], [0, n]]);
        run('cleared/' + flags, '^(?:(.)|!)!\\1$', flags, '!!',
            ['!!', undefined], [[0, 2], undefined]);
        run('unmatched/' + flags, '^(.)?\\1$', flags, '',
            ['', undefined], [[0, 0], undefined]);
        run('empty/' + flags, '^()\\1*$', flags, '',
            ['', ''], [[0, 0], [0, 0]]);
        run('search/' + flags, '(.)#\\1', flags + 'g', '!' + ch + '#' + ch,
            [ch + '#' + ch, ch], [[1, 2*n+2], [1, n+1]]);
        run('sticky/' + flags, '(.)#\\1', flags + 'y', '!' + ch + '#' + ch,
            [ch + '#' + ch, ch], [[1, 2*n+2], [1, n+1]], 1);
      }
      const n = 'é'.length;
      run('case/' + flags, '^(.)#\\1$', flags, 'é#É',
          ignore ? ['é#É', 'é'] : null,
          ignore ? [[0, 2*n+1], [0, n]] : null);
      run('local-fold/' + flags, '^(.)#(?i:\\1)$', flags, 'é#É',
          ['é#É', 'é'], [[0, 2*n+1], [0, n]]);
      run('local-sensitive/' + flags, '^(.)#(?-i:\\1)$', flags, 'é#É', null, null);
    }
  }

  if (byte) {
    // Each fixture is exactly one internal-WTF8 U+FFFD maximal subpart.
    // The separator prevents adjacent fixtures from joining into a valid scalar.
    const replacements = [[0xff], [0xfe], [0x80], [0xc0], [0xc3], [0xe2],
                          [0xe2, 0x82], [0xf0], [0xf0, 0x9f],
                          [0xf0, 0x9f, 0x98], [0xef, 0xbf, 0xbd]];
    for (const flags of ['', 'u', 'v', 'i', 'ui', 'vi']) {
      for (const left of replacements) for (const right of replacements) {
        const a = raw(left), b = raw(right), subject = a + '#' + b;
        run('malformed/' + flags + '/' + left + '/' + right,
            '^(.)#\\1$', flags, subject, [subject, a],
            [[0, left.length + right.length + 1], [0, left.length]]);
      }
      for (const [subject, source] of [
        [[0xc3, 0x58, 0xc3, 0xa9], '^(.)X\\1.$'],
        [[0xe2, 0x82, 0x58, 0xe2, 0x82, 0xac], '^(.)X\\1.$'],
        [[0xf0, 0x9f, 0x98, 0x58, 0xf0, 0x9f, 0x98, 0x80], '^(.)X\\1.$'],
        [[0xff, 0x23, 0xed, 0xa0, 0x80], '^(.)#\\1$'],
        [[0xed, 0xa0, 0x80, 0x23, 0xff], '^(.)#\\1$'],
      ]) run('boundary/' + flags + '/' + subject, source, flags, raw(subject), null, null);
      const subject = raw([0xff, 0x23, 0xe2, 0x82]);
      for (const source of ['^(\ufffd)#\\1$', '^(?<n>.)#\\k<n>$',
                            '^(?=(.))\\1#\\1$', '^(.)#(?-i:\\1)$']) {
        run('malformed-scope/' + flags + source, source, flags, subject,
            [subject, raw([0xff])], [[0, 4], [0, 1]]);
      }
      // Known replacement is not an ASCII/unique-encoding capture.
      run('canonical-to-raw/' + flags, '^(\ufffd)\\1$', flags,
          '\ufffd' + raw([0xff]), ['\ufffd' + raw([0xff]), '\ufffd'], [[0,4],[0,3]]);
      run('multi-subpart/' + flags, '^(.+)#\\1$', flags,
          raw([0xc0,0x80,0x23,0xff,0xfe]),
          [raw([0xc0,0x80,0x23,0xff,0xfe]), raw([0xc0,0x80])], [[0,5],[0,2]]);
      run('multi-short/' + flags, '^(.+)#\\1$', flags,
          raw([0xc0,0x80,0x23,0xff]), null, null);
    }
    const subject = raw([0xff,0x23,0xe2,0x82]);
    eq('replace-raw', units(subject.replace(/(.)#\1/u, '[$1]')), [91,255,93]);
    let callback;
    subject.replace(/(.)#\1/u, (match, capture, offset) => {
      callback = [units(match), units(capture), offset]; return '';
    });
    eq('callback', callback, [[255,35,226,130],[255],0]);
    eq('matchAll', Array.from((subject+'!'+subject).matchAll(/(.)#\1/dgu),
       match => match.indices), [[[0,4],[0,1]],[[5,9],[5,6]]]);
    eq('split', subject.split(/(.)#\1/u).map(units), [[],[255],[]]);
    eq('raw-equality', raw([0xff]) === raw([0xfe]), false);
    const n = '😀'.length;
    run('inside-sticky', '(.)#\\1', 'uy', '😀#😀', null, null, 1);
    run('scalar-search', '(.)#\\1', 'ug', '😀#😀!a#a',
        ['a#a', 'a'], [[2*n+2,2*n+5],[2*n+2,2*n+3]], 1);
  }
  const report = {kind:'forward-decoder-backreferences', profile:byte?'node8':'stock',
                  cases, checks, passed:failures.length === 0, failures,
                  performanceTested:false};
  (typeof print === 'function' ? print : console.log)(JSON.stringify(report));
  if (!report.passed) throw Error('FORWARD_DECODER_BACKREFERENCES_ORACLE');
})();
