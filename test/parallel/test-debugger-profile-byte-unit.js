'use strict';
const common = require('../common');
common.skipIfInspectorDisabled();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtures = require('../common/fixtures');
const startCLI = require('../common/debugger');

const byteMode = String.fromCodePoint(233).length === 2;
const flags = ['--v8-pool-size=2'];
if (byteMode) flags.push('--experimental-node-8-string-semantics');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'node8-profile-unit-'));
const cli = startCLI([fixtures.path('debugger/empty.js')], flags, { cwd: directory });

function checkUnit(label) {
  const output = cli.rawOutput;
  const start = output.indexOf('[Profile ');
  assert.notStrictEqual(start, -1);
  const end = output.indexOf(']', start);
  assert(end > start);
  const object = output.slice(start, end + 1);
  let unitStart = '[Profile '.length;
  while (object.charCodeAt(unitStart) >= 48 && object.charCodeAt(unitStart) <= 57) unitStart++;
  assert(unitStart > '[Profile '.length, 'numeric duration displayed');
  const unitHex = Buffer.from(object.slice(unitStart)).toString('hex');
  console.log(JSON.stringify({ label, byteMode, unitHex }));
  assert.strictEqual(unitHex, 'cebc735d', `${label}: profile unit must be UTF-8 mu+s`);
}

(async () => {
  try {
    await cli.waitForInitialBreak();
    await cli.waitForPrompt();
    await cli.command(`String.fromCodePoint(233).length === ${byteMode ? 2 : 1}`);
    assert.match(cli.output, /\btrue\b/, 'CLI runs the requested string profile');
    await cli.command('profile');
    await cli.command('profileEnd');
    checkUnit('profileEnd');
    await cli.command('profiles');
    checkUnit('profiles');
    const filename = path.join(directory, 'saved-profile.json');
    await cli.command(`profiles[0].save(${JSON.stringify(filename)})`);
    assert(cli.output.includes('Saved profile to ' + filename));
    const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert(Array.isArray(saved.nodes));
    assert.strictEqual(typeof saved.startTime, 'number');
    assert.strictEqual(typeof saved.endTime, 'number');
    console.log(JSON.stringify({ kind: 'debugger-profile-unit', byteMode, saved: true }));
  } finally {
    await cli.quit();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().then(common.mustCall());
