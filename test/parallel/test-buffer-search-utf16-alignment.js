'use strict';

require('../common');
const assert = require('assert');

let checks = 0;
function check(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}

// Explicit byte patterns isolate alignment from String transcoding.
for (const hex of ['6100', '0061', '6161', '0000', '00d8', '3dd800de']) {
  for (const count of [1, 8, 251]) {
    const pattern = Buffer.from(hex.repeat(count), 'hex');
    const bytes = Buffer.concat([Buffer.from([0xff, 0xff]), pattern,
                                 Buffer.from([0xff, 0xff]), pattern]);
    const last = pattern.length + 4;
    for (const hOffset of [0, 1]) {
      for (const nOffset of [0, 1]) {
        const hBacking = Buffer.alloc(bytes.length + hOffset);
        const nBacking = Buffer.alloc(pattern.length + nOffset);
        bytes.copy(hBacking, hOffset);
        pattern.copy(nBacking, nOffset);
        const input = hBacking.subarray(hOffset);
        const needle = nBacking.subarray(nOffset);
        const label = `${hex}/${count}/${hOffset}/${nOffset}`;
        check(input.indexOf(needle, 'ucs2'), 2, `first ${label}`);
        check(input.lastIndexOf(needle, 'ucs2'), last, `last ${label}`);
        check(input.includes(needle, 'ucs2'), true, `includes ${label}`);
        check(input.indexOf(needle, last, 'ucs2'), last, `offset ${label}`);
        check(input.lastIndexOf(needle, 2, 'ucs2'), 2, `reverse offset ${label}`);
        check(input.indexOf(needle, 0, 2, 'ucs2'), -1, `bounded ${label}`);
        check(input.lastIndexOf(needle, undefined, last, 'ucs2'), 2,
              `reverse bounded ${label}`);
        check(input.subarray(0, pattern.length + 1).includes(needle, 'ucs2'), false,
              `short ${label}`);
        if (hex === '6100') {
          const value = 'a'.repeat(count);
          check(input.indexOf(value, 'ucs2'), 2, `string first ${label}`);
          check(input.lastIndexOf(value, 'ucs2'), last, `string last ${label}`);
          check(input.includes(value, 'ucs2'), true, `string includes ${label}`);
        }
      }
    }
  }
}
console.log(`buffer search UTF-16 alignment: ${checks} checks passed`);
