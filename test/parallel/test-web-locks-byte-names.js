// Flags: --expose-gc
'use strict';

const common = require('../common');
const assert = require('assert');
const { once } = require('events');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const node8 = process.execArgv.includes('--experimental-node-8-string-semantics');
const encoding = node8 ? 'utf8' : 'utf16le';
const locks = navigator.locks;
let checks = 0;

function check(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks++;
}

async function workerMain() {
  const name = Buffer.from(workerData, 'hex').toString(encoding);
  await locks.request(name, async (lock) => {
    const released = once(parentPort, 'message');
    parentPort.postMessage(Buffer.from(lock.name, encoding).toString('hex'));
    await released;
  });
  parentPort.close();
}

async function main() {
  const names = ['', 'ascii', '\u00e9', '\u4e2d', '\u{1f600}', 'e\u0301',
                 'a\0b', '\ud800', '\udc00', '\udc00\ud800', '\uffff',
                 '\u00e9'.repeat(2048)];
  for (let byte = 0; byte < 256; byte++) {
    names.push(`raw:${Buffer.from([byte]).toString()}`);
  }
  for (const hex of ['e282', 'e228a1', 'c0af', 'eda080', 'f4908080']) {
    names.push(`bytes:${Buffer.from(hex, 'hex').toString()}`);
  }
  for (const name of names) {
    let pending;
    await locks.request(name, async (lock) => {
      check(lock.name, name, 'callback name');
      const held = await locks.query();
      check(held.held.length, 1, 'held count');
      check(held.held[0].name, name, 'held name');
      pending = locks.request(name, (next) => check(next.name, name, 'pending callback'));
      const queued = await locks.query();
      check(queued.pending.length, 1, 'pending count');
      check(queued.pending[0].name, name, 'pending name');
      check(await locks.request(name, { ifAvailable: true }, (next) => next), null, 'exclusive miss');
    });
    await pending;
    check((await locks.query()).held.length, 0, 'released');
  }

  const raw = (hex) => Buffer.from(hex, 'hex').toString();
  for (const [first, second] of [
    [raw('80'), raw('81')], [raw('c0'), raw('c1')],
    ['\u00e9', 'e\u0301'], ['\ud800', '\ud801'], ['\ud800', '\ufffd'],
    ['a\0b', 'a\0c'], [String.fromCodePoint(0xd83d) + String.fromCodePoint(0xde00), '\u{1f600}'],
  ]) {
    await locks.request(first, async () => {
      const available = await locks.request(second, { ifAvailable: true }, (lock) => {
        if (lock !== null) check(lock.name, second, 'distinct callback');
        return lock !== null;
      });
      check(available, first !== second, 'resource identity');
    });
  }

  for (const name of ['worker:\u4e2d\u{1f600}', `worker:${raw('80')}`, 'worker:\ud800']) {
    const hex = Buffer.from(name, encoding).toString('hex');
    const worker = new Worker(__filename, { workerData: hex });
    const exited = once(worker, 'exit');
    try {
      const [returned] = await once(worker, 'message');
      check(returned, hex, 'worker callback bytes');
      check(await locks.request(name, { ifAvailable: true }, (lock) => lock), null, 'worker contention');
      worker.postMessage('release');
      check((await exited)[0], 0, 'worker exit');
      await locks.request(name, (lock) => check(lock.name, name, 'worker release'));
    } finally {
      await worker.terminate();
    }
  }

  // Keep names alive through GC while held, including sliced backing storage.
  const name = `prefix${'\u4e2d'.repeat(4096)}suffix`.slice(6, -6);
  await locks.request(name, async (lock) => {
    if (global.gc) global.gc();
    check(lock.name, name, 'GC callback');
    check((await locks.query()).held[0].name, name, 'GC query');
  });
  check((await locks.query()).pending.length, 0, 'no pending locks');
  console.log(`Web Locks byte names: ${checks} checks passed`);
}

(isMainThread ? main() : workerMain()).then(common.mustCall());
