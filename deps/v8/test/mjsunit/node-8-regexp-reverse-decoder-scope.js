// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';
(() => {
  const byte = 'é'.length === 2;
  const units = s => s === undefined ? null :
      Array.from({length:s.length}, (_, i) => s.charCodeAt(i));
  const raw = a => String.fromCharCode(...a);
  let cases = 0, checks = 0, mismatches = 0;
  const failures = [];
  function eq(id, actual, expected) {
    ++checks;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      ++mismatches;
      if (failures.length < 40) failures.push({id,actual,expected});
    }
  }
  function run(id, source, flags, input, capture, bounds) {
    const re = new RegExp(source, 'd'+flags);
    for (let repeat=0; repeat<2; ++repeat) {
      ++cases;
      const m = re.exec(input);
      eq(id+'/capture', m && Array.from(m,units), capture && capture.map(units));
      eq(id+'/bounds', m && m.indices, bounds);
      eq(id+'/index', m && m.index, bounds && bounds[0][0]);
      eq(id+'/flags', re.flags, Array.from('d'+flags).sort().join(''));
    }
  }
  for (const unicode of ['', 'u', 'v']) {
    const bad = byte ? raw([0xff]) : '\ufffd';
    const e = 'é'.length, c = '中'.length;
    // All fourteen historical stock-only rows, with desired byte spans retained.
    const common = [
      ['inside','(?<=.)(中)',bad+'中',1],
      ['outside','(?<=é)([^a])','é中',e],
      ['dispatch-inside','(?<=[^a\ufffd])(中)','é中',e],
      ['dispatch-outside','(?<=é)([^a\ufffd])','é中',e],
      ['local-s','(?s:(?<=.)(中))','é中',e]
    ];
    for (const [id,source,input,start] of common) {
      run('sensitive/'+id+unicode, '(?-i:'+source+')', unicode+'i', input,
          ['中','中'], [[start,start+c],[start,start+c]]);
      const foldedInput = id === 'outside' || id === 'dispatch-outside' || id === 'local-s' ?
          'É中' : input;
      run('folded/'+id+unicode, source, unicode+'i', foldedInput,
          ['中','中'], [[start,start+c],[start,start+c]]);
    }
    for (const [source,fold] of [
      ['(?-i:(?<=é))([^a])','i'],
      ['(?-i:(?<=é))([^a\ufffd])','i'],
      ['(?i:(?-i:(?<=é)))([^a])',''],
      ['(?i:(?-i:(?<=é)))([^a\ufffd])','']
    ]) run('outer/'+source+unicode,source,unicode+fold,'é中',
           ['中','中'],[[e,e+c],[e,e+c]]);

    // Forward exact references remain decoded even if their capture was made
    // in lookbehind; reverse references remain outside this batch's contract.
    for (const source of ['(?<=(.))#\\1', '(?-i:(?<=(.))#\\1)',
                          '(?=(?<=(.))#\\1)#\\1']) {
      run('forward/'+source+unicode,source,unicode,'é#é',
          ['#é','é'],[[e,2*e+1],[0,e]]);
      if (byte) {
        run('forward-malformed/'+source+unicode,source,unicode,
            raw([0xff,35,0xe2,0x82]),[raw([35,0xe2,0x82]),raw([0xff])],
            [[1,4],[0,1]]);
      }
    }
  }
  const report = {kind:'reverse-decoder-scope',profile:byte?'node8':'stock',
                  cases,checks,mismatches,passed:mismatches===0,failures,
                  performanceTested:false};
  (typeof print === 'function' ? print : console.log)(JSON.stringify(report));
  if (!report.passed && globalThis.reverseDecoderObserve !== true)
    throw Error('REVERSE_DECODER_SCOPE_ORACLE');
})();
