// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';
(() => {
  const byte = 'é'.length === 2;
  const raw = a => String.fromCharCode(...a);
  const units = s => s === undefined ? null :
      Array.from({length:s.length}, (_,i) => s.charCodeAt(i));
  let cases=0, checks=0, mismatches=0;
  const failures=[];
  function eq(id, actual, expected) {
    ++checks;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      ++mismatches;
      if (failures.length < 40) failures.push({id,actual,expected});
    }
  }
  function run(id, source, flags, input, captures, bounds, start=0) {
    const re=new RegExp(source,'d'+flags);
    for (let repeat=0; repeat<2; ++repeat) {
      ++cases;
      re.lastIndex=start;
      const m=re.exec(input);
      eq(id+'/captures',m && Array.from(m,units),captures && captures.map(units));
      eq(id+'/bounds',m && m.indices,bounds);
      eq(id+'/index',m && m.index,bounds && bounds[0][0]);
      eq(id+'/flags',re.flags,Array.from('d'+flags).sort().join(''));
      eq(id+'/lastIndex',re.lastIndex,/[gy]/.test(flags) ? (bounds ? bounds[0][1] : 0) : start);
      if (source.includes('?<n>')) {
        eq(id+'/name',m && units(m.groups.n),captures && units(captures[1]));
        eq(id+'/name-bounds',m && m.indices.groups.n,bounds && bounds[1]);
      }
    }
  }
  for (const unicode of ['', 'u', 'v']) for (const fold of ['', 'i']) {
    const flags=unicode+fold;
    for (const ch of ['a','é','中','😀','\ud800','\udc00','\ufffd']) {
      const n=ch.length, legacyAstral=!byte && !unicode && ch==='😀';
      for (const source of ['(?<=\\1(.))X','(?<=\\k<n>(?<n>.))X',
                            '(?<=\\1([^X]))X','(?<=\\1(.{1}))X',
                            '(?<=\\1((?:.|!)))X','(?<=(?-i:\\1)(.))X']) {
        run('pair/'+flags+ch+source,source,flags,ch+ch+'X',
            legacyAstral ? null : ['X',ch],
            legacyAstral ? null : [[2*n,2*n+1],[n,2*n]]);
      }
      run('reject/'+flags+ch,'(?<=^\\1(.))X$',flags,'!'+ch+'X',null,null);
      if (legacyAstral) continue;
      for (const source of ['(?<=^\\1(.+))X$','(?<=^\\1(.+?))X$']) {
        run('backtrack/'+flags+ch+source,source,flags,ch.repeat(4)+'X',
            ['X',ch+ch],[[4*n,4*n+1],[2*n,4*n]]);
      }
      run('lazy/'+flags+ch,'(?<=\\1(.+?))X$',flags,ch.repeat(4)+'X',
          ['X',ch],[[4*n,4*n+1],[3*n,4*n]]);
      run('repeated/'+flags+ch,'(?<=^\\1{2}(.))X$',flags,ch.repeat(3)+'X',
          ['X',ch],[[3*n,3*n+1],[2*n,3*n]]);
      run('unset-before-capture/'+flags+ch,'(?<=^(.)\\1)X$',flags,ch+'X',
          ['X',ch],[[n,n+1],[0,n]]);
      run('self/'+flags+ch,'(?<=^(\\1.))X$',flags,ch+'X',
          ['X',ch],[[n,n+1],[0,n]]);
      run('nested-forward/'+flags+ch,'(?<=^\\1(.)(?=X))X$',flags,ch+ch+'X',
          ['X',ch],[[2*n,2*n+1],[n,2*n]]);
      run('external-capture/'+flags+ch,'^(.)(?<=\\1)X$',flags,ch+'X',
          [ch+'X',ch],[[0,n+1],[0,n]]);
      run('forward-reference/'+flags+ch,'(?<=(.))\\1',flags,ch+ch,
          [ch,ch],[[n,2*n],[0,n]]);
      run('negative-clearing/'+flags+ch,'(?<!^\\1(.)Y)X$',flags,ch+ch+'X',
          ['X',undefined],[[2*n,2*n+1],undefined]);
      run('negative-match/'+flags+ch,'(?<!^\\1(.))X$',flags,ch+ch+'X',null,null);
      run('search/'+flags+ch,'(?<=\\1(.))X',flags+'g','!'+ch+ch+'X',
          ['X',ch],[[2*n+1,2*n+2],[n+1,2*n+1]],1);
      run('sticky/'+flags+ch,'(?<=\\1(.))X',flags+'y',ch+ch+'X',
          ['X',ch],[[2*n,2*n+1],[n,2*n]],2*n);
    }
    run('empty/'+flags,'(?<=^\\1())X$',flags,'X',['X',''],[[0,1],[0,0]]);
    run('optional/'+flags,'(?<=^\\1(.)?)X$',flags,'X',['X',undefined],[[0,1],undefined]);
    run('cleared/'+flags,'(?<=^(?:\\1(.)|!))X$',flags,'!X',
        ['X',undefined],[[1,2],undefined]);
    run('empty-repeat/'+flags,'(?<=^\\1*())X$',flags,'X',['X',''],[[0,1],[0,0]]);
    for (const [target,capture,legacyFold] of [
      ['É','é',true],['K','k',false],['k','K',false],['ſ','S',false],
      ['S','ſ',false],['ς','Σ',true],['𐐀','𐐨',false],['ẞ','ß',false]
    ]) {
      const matched=!!fold && (byte || !!unicode || legacyFold);
      const t=target.length,c=capture.length;
      run('fold/'+flags+target+capture,'(?<=^\\1('+capture+'))X$',flags,
          target+capture+'X',matched ? ['X',capture] : null,
          matched ? [[t+c,t+c+1],[t,t+c]] : null);
    }
    const eCapture=fold ? 'É' : 'é', en=eCapture.length, cn='中'.length;
    run('historical-unset/'+flags,'(?<=(é)\\1)(中)',flags,eCapture.repeat(2)+'中',
        ['中',eCapture,'中'],[[2*en,2*en+cn],[en,2*en],[2*en,2*en+cn]]);
    run('not-full-fold/'+flags,'(?<=^\\1(ß))X$',flags,'ssßX',null,null);
    const e='é'.length;
    run('local-fold/'+flags,'(?<=^(?i:\\1)(é))X$',flags,'ÉéX',
        ['X','é'],[[2*e,2*e+1],[e,2*e]]);
    run('local-sensitive/'+flags,'(?<=^(?-i:\\1)(é))X$',flags,'ÉéX',null,null);
  }
  if (byte) {
    const parts=[[0xff],[0xfe],[0x80],[0xc0],[0xc3],[0xe2],[0xe2,0x82],
                 [0xed,0xa0],[0xf0],[0xf0,0x9f],[0xf0,0x9f,0x98],[0xef,0xbf,0xbd]];
    for (const flags of ['', 'u', 'v', 'i', 'ui', 'vi']) {
      for (const left of parts) for (const right of parts) {
        // '#' separates incomplete prefixes so adjacency cannot change either partition.
        const input=raw([...left,35,...right,88]),a=left.length,b=right.length;
        run('malformed/'+flags+left+'/'+right,'(?<=^\\1#(.))X$',flags,input,
            ['X',raw(right)],[[a+b+1,a+b+2],[a+1,a+b+1]]);
      }
      run('multi/'+flags,'(?<=^\\1#(.+))X$',flags,raw([0xc0,0x80,35,0xff,0xfe,88]),
          ['X',raw([0xff,0xfe])],[[5,6],[3,5]]);
      run('multi-short/'+flags,'(?<=^\\1#(.+))X$',flags,raw([0xff,35,0xc0,0x80,88]),null,null);
      for (const valid of [[0xc3,0xa9],[0xe2,0x82,0xac],[0xf0,0x9f,0x98,0x80],[0xed,0xa0,0x80]]) {
        run('valid-nonmember/'+flags+valid,'(?<=^\\1#(.))X$',flags,
            raw([...valid,35,0xff,88]),null,null);
        for (let position=1;position<valid.length;++position) {
          run('interior-end/'+flags+valid+'/'+position,'(?=(.))(?<=\\1)',flags+'y',
              raw(valid),null,null,position);
        }
      }
      const n='é'.length;
      run('search-origin/'+flags,'(?<=\\1(.))X',flags+'g','ééX',
          ['X','é'],[[2*n,2*n+1],[n,2*n]],1);
      run('replacement-literal/'+flags,'(?<=^\\1#(\ufffd))X$',flags,
          raw([0xff,35,0xe2,0x82,88]),['X',raw([0xe2,0x82])],[[4,5],[2,4]]);
    }
    const input=raw([0xff,35,0xe2,0x82,88]);
    eq('replace-raw',units(input.replace(/(?<=\1#(.))X/u,'[$1]')),
        [255,35,226,130,91,226,130,93]);
    let callback;
    input.replace(/(?<=\1#(.))X/u,(whole,capture,index)=>{
      callback=[units(whole),units(capture),index];return '';
    });
    eq('callback',callback,[[88],[226,130],4]);
    eq('matchAll',Array.from((input+input).matchAll(/(?<=\1#(.))X/dgu),m=>m.indices),
        [[[4,5],[2,4]],[[9,10],[7,9]]]);
    eq('split',input.split(/(?<=\1#(.))X/u).map(units),[[255,35,226,130],[226,130],[]]);
  }
  const report={kind:'reverse-decoded-backreferences',profile:byte?'node8':'stock',
                cases,checks,mismatches,passed:mismatches===0,failures,performanceTested:false};
  (typeof print==='function'?print:console.log)(JSON.stringify(report));
  if(!report.passed && globalThis.reverseReferenceObserve!==true)
    throw Error('REVERSE_DECODED_BACKREFERENCES_ORACLE');
})();
