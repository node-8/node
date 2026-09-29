// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';
(() => {
  const byte = 'é'.length === 2;
  const raw = values => String.fromCharCode(...values);
  const units = value => value === undefined ? null :
      Array.from({length:value.length}, (_, i) => value.charCodeAt(i));
  let cases = 0, checks = 0, mismatches = 0;
  const failures = [];
  function eq(id, actual, expected) {
    ++checks;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      ++mismatches;
      if (failures.length < 40) failures.push({id, actual, expected});
    }
  }
  function run(id, source, flags, subject, captures, bounds, start = 0) {
    const re = new RegExp(source, 'd' + flags);
    for (let repeat = 0; repeat < 2; ++repeat) {
      ++cases;
      re.lastIndex = start;
      const m = re.exec(subject);
      eq(id+'/captures', m && Array.from(m, units), captures && captures.map(units));
      eq(id+'/bounds', m && m.indices, bounds);
      eq(id+'/index', m && m.index, bounds && bounds[0][0]);
      eq(id+'/flags', re.flags, Array.from('d'+flags).sort().join(''));
      eq(id+'/lastIndex', re.lastIndex, /[gy]/.test(flags) ?
          (bounds ? bounds[0][1] : 0) : start);
      if (m && m.groups) {
        eq(id+'/name', units(m.groups.n), units(captures[1]));
        eq(id+'/name-bounds', m.indices.groups.n, bounds[1]);
      }
    }
  }
  for (const unicode of ['', 'u', 'v']) for (const fold of ['', 'i']) {
    const flags = unicode + fold;
    for (const ch of ['a', 'é', '中', '😀', '\ud800', '\udc00', '\ufffd']) {
      const n = ch.length;
      const captured = !byte && !unicode && ch === '😀' ? '\ude00' : ch;
      const k = captured.length;
      for (const source of ['(?<=(.))X', '(?<=([^X]))X',
                            '(?<=(?<n>[^!]))X', '(?<=([\\s\\S]))X',
                            '(?=(?<=(.))X)X', '(?<=(.)(?=X))X',
                            '(?<=(.)(?!Y))X', '(?<=(.))[^Y]']) {
        // Legacy stock searches UTF-16 units: this broad consuming class first
        // matches the low surrogate, with the high surrogate in lookbehind.
        const interior = !byte && !unicode && ch === '😀' && source.endsWith('[^Y]');
        run(source+flags+ch, source, flags, ch+'X',
            interior ? ['\ude00','\ud83d'] : ['X',captured],
            interior ? [[1,2],[0,1]] : [[n,n+1],[n-k,n]]);
      }
      run('negative/'+flags+ch, '(?<!.)X', flags, ch+'X', null, null);
      run('negative-empty/'+flags+ch, '(?<!.)X', flags, 'X', ['X'], [[0,1]]);
      run('nullable/'+flags+ch, '(?<=(.))$', flags, ch,
          ['',captured], [[n,n],[n-k,n]]);
      run('search/'+flags+ch, '(?<=(.))X', flags+'g', '!'+ch+'X',
          ['X',captured], [[n+1,n+2],[n+1-k,n+1]], 1);
      run('sticky/'+flags+ch, '(?<=(.))X', flags+'y', ch+'X',
          ['X',captured], [[n,n+1],[n-k,n]], n);
      run('sticky-reject/'+flags+ch, '(?<=(.))X', flags+'y', ch+'X', null, null);
      if (!byte && !unicode && ch === '😀') continue;
      for (const source of ['(?<=^(.+))X$', '(?<=(.{1,3}))X$',
                            '(?<=^([\\s\\S]*))X$', '(?<=^((?:.?)*))X$']) {
        run('greedy/'+flags+ch+source, source, flags, ch.repeat(3)+'X',
            ['X',ch.repeat(3)], [[3*n,3*n+1],[0,3*n]]);
      }
      run('lazy/'+flags+ch, '(?<=(.{1,3}?))X$', flags, ch.repeat(3)+'X',
          ['X',ch], [[3*n,3*n+1],[2*n,3*n]]);
      run('pairs/'+flags+ch, '(?<=^(.)(.))X$', flags, ch+ch+'X',
          ['X',ch,ch], [[2*n,2*n+1],[0,n],[n,2*n]]);
      run('backtrack/'+flags+ch, '(?<=^(.+)(.))X$', flags, ch.repeat(3)+'X',
          ['X',ch+ch,ch], [[3*n,3*n+1],[0,2*n],[2*n,3*n]]);
      run('cleared/'+flags+ch, '(?:(?<=(.))Y|(?<=([^!]))X)', flags, ch+'X',
          ['X',undefined,ch], [[n,n+1],undefined,[0,n]]);
      run('negative-cleared/'+flags+ch, '(?<!((.)Y))X', flags, ch+'X',
          ['X',undefined,undefined], [[n,n+1],undefined,undefined]);
    }
    run('local-fold/'+flags, '(?<=(?i:[^é]))X', flags, 'ÉX', null, null);
    run('local-sensitive/'+flags, '(?<=(?-i:[^é]))X', flags, 'ÉX',
        ['X'], [['É'.length,'É'.length+1]]);
    run('dot-line/'+flags, '(?<=.)X', flags, '\nX', null, null);
    run('dot-all/'+flags, '(?<=(?s:.))X', flags, '\nX', ['X'], [[1,2]]);
    run('dot-all-off/'+flags, '(?<=(?-s:.))X', flags+'s', '\nX', null, null);
    run('nested-reverse/'+flags, '(?<=(?<=.)(.))X', flags, 'é中X',
        ['X','中'], [['é中'.length,'é中X'.length],['é'.length,'é中'.length]]);
    run('nested-forward/'+flags, '(?<=(?=.(X)).)X', flags, 'éX',
        ['X','X'], [['é'.length,'éX'.length],['é'.length,'éX'.length]]);
  }

  if (byte) {
    // Explicit partitions, independent of the implementation and JS decoding.
    // The last boolean says whether the last subpart decodes to U+FFFD.
    const fixtures = [
      [[[0xff]],true], [[[0x80]],true], [[[0xc0],[0x80]],true],
      [[[0xc3]],true], [[[0xe2,0x82]],true], [[[0xf0,0x9f,0x98]],true],
      [[[0xed,0xa0]],true], [[[0xed,0xa0,0x80]],false],
      [[[0xe0],[0x80],[0x80]],true], [[[0xf4],[0x90],[0x80],[0x80]],true],
      [[[0xc3,0xa9]],false], [[[0xe2,0x82,0xac]],false],
      [[[0xf0,0x9f,0x98,0x80]],false], [[[0xef,0xbf,0xbd]],true],
      [[[0xc3,0xa9],[0x80]],true], [[[0xe2,0x82,0xac],[0x80]],true],
      [[[0xe2,0x82],[0xe2,0x82]],true], [[[0xc3,0xa9],[0xc3]],true],
      [[[0x41],[0xf0,0x9f]],true], [[[0xf4,0x8f,0xbf,0xbf]],false],
      [[[0xc2],[0x41]],false], [[[0xf0,0x9f],[0x41],[0x80]],true]
    ];
    for (const flags of ['', 'u', 'v', 'i', 'ui', 'vi']) {
      for (const [parts,replaced] of fixtures) {
        const s = raw(parts.flat()), n = s.length;
        const last = raw(parts[parts.length-1]), begin = n-last.length;
        const id = flags+'/'+parts.flat();
        for (const source of ['(?<=(.))X', '(?<=(?<n>[^X]))X',
                              '(?<=(.)(?=X))X', '(?=(?<=(.))X)X']) {
          run(id+source, source, flags, s+'X', ['X',last], [[n,n+1],[begin,n]]);
        }
        run(id+'/EOF', '(?<=(.))$', flags, s, ['',last], [[n,n],[begin,n]]);
        run(id+'/count', '(?<=^(.{'+parts.length+'}))X$', flags, s+'X',
            ['X',s], [[n,n+1],[0,n]]);
        run(id+'/wrong-count', '(?<=^(.{'+(parts.length-1)+'}))X$', flags,
            s+'X', null, null);
        run(id+'/greedy', '(?<=^(.+))X$', flags, s+'X', ['X',s], [[n,n+1],[0,n]]);
        run(id+'/replacement', '(?<=(\ufffd))X', flags, s+'X',
            replaced ? ['X',last] : null, replaced ? [[n,n+1],[begin,n]] : null);
        run(id+'/nonreplacement', '(?<=([^\ufffd]))X', flags, s+'X',
            replaced ? null : ['X',last], replaced ? null : [[n,n+1],[begin,n]]);
        run(id+'/negative', '(?<!\ufffd)X', flags, s+'X',
            replaced ? null : ['X'], replaced ? null : [[n,n+1]]);
        if (parts.length > 1) {
          const prefix = raw(parts.slice(0,-1).flat());
          run(id+'/pair', '(?<=^(.+?)(.))X$', flags, s+'X', ['X',prefix,last],
              [[n,n+1],[0,begin],[begin,n]]);
        }
        let offset = 0;
        for (const part of parts) {
          for (let inner = 1; inner < part.length; ++inner) {
            run(id+'/inside/'+(offset+inner), '(?<=(.))', flags+'y', s,
                null, null, offset+inner);
          }
          offset += part.length;
        }
      }
      const subject = '😀X';
      run('global-interior/'+flags, '(?<=(.))X', flags+'g', subject,
          ['X','😀'], [[4,5],[0,4]], 1);
      run('long-origin/'+flags, '(?<=(.))X$', flags+'g', 'a'.repeat(64)+subject,
          ['X','😀'], [[68,69],[64,68]], 65);
    }
    const s = raw([0xe2,0x82,0x58]);
    eq('replace-raw', units(s.replace(/(?<=(.))X/u, '[$1]')), [226,130,91,226,130,93]);
    let callback;
    s.replace(/(?<=(.))X/u, (match, capture, index) => {
      callback = [units(match),units(capture),index]; return '';
    });
    eq('callback', callback, [[88],[226,130],2]);
    eq('matchAll', Array.from((s+s).matchAll(/(?<=(.))X/dgu), m => m.indices),
        [[[2,3],[0,2]],[[5,6],[3,5]]]);
    eq('split', s.split(/(?<=(.))X/u).map(units), [[226,130],[226,130],[]]);
  }
  const report = {kind:'reverse-decoder-classes',profile:byte?'node8':'stock',
                  cases,checks,mismatches,passed:mismatches===0,failures,
                  performanceTested:false};
  (typeof print === 'function' ? print : console.log)(JSON.stringify(report));
  if (!report.passed && globalThis.reverseDecoderObserve !== true)
    throw Error('REVERSE_DECODER_CLASSES_ORACLE');
})();
