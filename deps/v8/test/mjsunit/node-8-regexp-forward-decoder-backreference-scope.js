// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';
// Independent capture-proof and already-supported reverse-reference controls.
const byte = 'é'.length === 2;
const n = byte ? 2 : 1;
let cases = 0, checks = 0;
function equal(actual, expected) {
  ++checks;
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Error(JSON.stringify({actual,expected}));
}
const rows = [
  ['(?<=\\1((é)\\2))Z', 'ééZ', ['Z','é','é'], [[2*n,2*n+1],[n,2*n],[n,2*n]]],
  ['^((é)\\2)\\1$', 'éééé', ['éééé','éé','é'], [[0,4*n],[0,2*n],[0,n]]],
  ['^(?:(?<n>é)|(?<n>中))\\k<n>$', 'éé', ['éé','é',undefined], [[0,2*n],[0,n],undefined]],
  ['^(?<n>(?<m>.)\\k<m>)#\\k<n>$', 'éé#éé', ['éé#éé','éé','é'], [[0,4*n+1],[0,2*n],[0,n]]],
  ['^(?=(.))(?-i:\\1)#(?i:\\1)$', 'é#É', ['é#É','é'], [[0,2*n+1],[0,n]]],
  ['^((.)\\2|!)#\\1$', '!#!', ['!#!','!',undefined], [[0,3],[0,1],undefined]],
  ['^('+'a'.repeat(110)+')#\\1$', 'a'.repeat(110)+'#'+'a'.repeat(110),
   ['a'.repeat(110)+'#'+'a'.repeat(110),'a'.repeat(110)], [[0,221],[0,110]]],
];
const lineWidth = byte ? 3 : 1;
rows.push(
  ['^(?s:(.))\\1$', '\n\n', ['\n\n','\n'], [[0,2],[0,1]]],
  ['^(?s:(.))\\1$', '\u2028\u2028', ['\u2028\u2028','\u2028'],
   [[0,2*lineWidth],[0,lineWidth]]],
  ['^(?s:(.))(?-s:\\1)$', '\n\n', ['\n\n','\n'], [[0,2],[0,1]]],
);
if (byte) {
  const raw = bytes => String.fromCharCode(...bytes);
  for (const [bytes, end] of [[[255,254],1], [[255,226,130],1], [[226,130,255],2]]) {
    const subject = raw(bytes);
    rows.push(['^(.)\\1$', subject, [subject,raw(bytes.slice(0,end))],
               [[0,bytes.length],[0,end]]]);
  }
}
for (const grammar of ['', 'u', 'v']) for (const [source,input,values,bounds] of rows) {
  const re = new RegExp(source,'d'+grammar);
  for (let i=0;i<2;++i) {
    ++cases;
    const m=re.exec(input);
    equal(m && Array.from(m),values);
    equal(m && m.indices,bounds);
    equal(m && m.index,bounds[0][0]);
  }
}
console.log(JSON.stringify({kind:'decoder-reference-scope',
  profile:byte?'node8':'stock',cases,checks,passed:true}));
