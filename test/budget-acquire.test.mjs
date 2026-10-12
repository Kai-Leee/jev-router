import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireTokenBudget} from '../src/benchmark/budget-acquire.mjs';
test('waits for local lock only, before invoking provider',async()=>{let n=0,waits=0;const lease={};assert.equal(await acquireTokenBudget({}, {open:()=>{if(!n++)throw Error('BUDGET_LOCKED');return lease;},wait:async()=>waits++}),lease);assert.equal(n,2);assert.equal(waits,1);});
test('never retries uncertainty or outstanding reservation',async()=>{for(const code of ['HTTP_ERROR','BUDGET_OUTSTANDING']){let n=0;await assert.rejects(()=>acquireTokenBudget({}, {open:()=>{n++;throw Error(code)},wait:async()=>{throw Error('must not wait')}}),new RegExp(code));assert.equal(n,1);}});
test('local lock wait is bounded',async()=>{let time=0;await assert.rejects(()=>acquireTokenBudget({}, {open:()=>{throw Error('BUDGET_LOCKED')},wait:async ms=>{time+=ms},now:()=>time,timeoutMs:250,intervalMs:100}),/BUDGET_LOCKED/);assert.equal(time,250);});

test('cancellation while waiting never opens another lease or retries provider work', async () => {
  const controller = new AbortController(); let opened = 0;
  await assert.rejects(() => acquireTokenBudget({}, {
    signal: controller.signal,
    open: () => { opened++; throw Object.assign(new Error('BUDGET_LOCKED'), { code: 'BUDGET_LOCKED' }); },
    wait: async () => controller.abort(),
  }), { name: 'AbortError' });
  assert.equal(opened, 1);
  await assert.rejects(() => acquireTokenBudget({}, {
    signal: controller.signal, open: () => { opened++; return {}; },
  }), { name: 'AbortError' });
  assert.equal(opened, 1);
});

test('failed acquisition telemetry or cancellation after opening releases the unused lease', async () => {
  let closed = 0;
  const lease = { close: () => closed++ };
  await assert.rejects(() => acquireTokenBudget({}, {
    open: () => lease, onAcquired: async () => { throw new Error('telemetry failed'); },
  }), /telemetry failed/);
  const controller = new AbortController();
  await assert.rejects(() => acquireTokenBudget({}, {
    open: () => { controller.abort(); return lease; }, signal: controller.signal,
  }), { name: 'AbortError' });
  assert.equal(closed, 2);
});

test('acquisition reports local contention separately from immediate access', async () => {
  let time = 10; let attempts = 0; const records = [];
  await acquireTokenBudget({}, {
    open: () => { if (attempts++ < 2) throw new Error('BUDGET_LOCKED'); return {}; },
    wait: async ms => { time += ms; }, now: () => time, intervalMs: 10,
    onAcquired: record => records.push(record),
  });
  await acquireTokenBudget({}, { open: () => ({}), onAcquired: record => records.push(record) });
  assert.deepEqual(records, [{ wait_ms: 20, lock_contentions: 2 }, { wait_ms: 0, lock_contentions: 0 }]);
});
