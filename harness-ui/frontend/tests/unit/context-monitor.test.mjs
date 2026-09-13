import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextMonitor } from '../../src/services/context-monitor.js';

const snapshot = (sessionId, state) => ({ sessionId, revision: 1, jobs: state ? [{ id: 'job', state }] : [], settings: { auto: true } });
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(client) {
  const timers = new Map(), states = [], errors = [];
  const monitor = createContextMonitor({ client, onState: state => states.push(state), onError: error => errors.push(error), setTimeoutFn: fn => { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeoutFn: id => timers.delete(id) });
  return { monitor, timers, states, errors, async fire() { const [id, fn] = [...timers][0]; timers.delete(id); await fn(); } };
}
test('CTX-MONITOR-AUTO-RUN follows a running chat before an automatic job exists and stops after completion', async () => {
  let value = snapshot('a'); let reads = 0;
  const f = fixture({ getContextState: async () => { reads++; return value; } });
  await f.monitor.follow('a', { running: true });
  assert.equal(reads, 1); assert.equal(f.timers.size, 1);
  value = snapshot('a', 'summarizing'); await f.fire();
  f.monitor.setRunning(false);
  assert.equal(f.timers.size, 1, 'closing the chat turn must not hide a still-running job');
  value = snapshot('a', 'committed'); await f.fire();
  assert.equal(f.timers.size, 0); f.monitor.stop();
});
test('CTX-MONITOR-STALE old session replies and concurrent refresh cannot replace new state', async () => {
  const calls = [];
  const f = fixture({ getContextState: options => new Promise(resolve => calls.push({ options, resolve })) });
  const a = f.monitor.follow('a', { running: true }); await tick();
  void f.monitor.refresh(); assert.equal(calls.length, 1);
  const b = f.monitor.follow('b'); await tick();
  assert.equal(calls[0].options.signal.aborted, true);
  calls[1].resolve(snapshot('b')); await b;
  calls[0].resolve(snapshot('a')); await a;
  assert.deepEqual(f.states.map(s => s.sessionId), ['b']); f.monitor.stop();
});
test('CTX-MONITOR-DISABLED cannot loop on an unenabled session or invent an active job', async () => {
  const f = fixture({ getContextState: async () => { throw Object.assign(new Error('not enabled'), { code: 'CTX_NOT_ENABLED' }); } });
  await f.monitor.follow('a', { running: true });
  assert.equal(f.timers.size, 0); assert.equal(f.states.length, 0); assert.equal(f.errors[0].code, 'CTX_NOT_ENABLED');
  f.monitor.stop();
});

test('CTX-MONITOR-MANUAL-CLOSE a modal snapshot keeps observation alive after the dialog closes', async () => {
  const f = fixture({ getContextState: async () => snapshot('a') });
  await f.monitor.follow('a');
  f.monitor.update(snapshot('a', 'summarizing'));
  assert.equal(f.timers.size, 1);
  f.monitor.stop(); assert.equal(f.timers.size, 0);
});

test('CTX-MONITOR-SYNC-ERROR releases pending after a synchronous client error', async () => {
  let calls = 0;
  const f = fixture({ getContextState() { if (++calls === 1) throw new Error('offline'); return Promise.resolve(snapshot('a')); } });
  await f.monitor.follow('a');
  await f.monitor.refresh();
  assert.equal(calls, 2); assert.equal(f.states.length, 1); f.monitor.stop();
});

test('CTX-MONITOR-FINAL-READ checks state after a read that predates turn completion', async () => {
  const calls = [];
  const f = fixture({ getContextState: () => new Promise(resolve => calls.push(resolve)) });
  const first = f.monitor.follow('a', { running: true }); await tick();
  f.monitor.setRunning(false);
  const last = f.monitor.refresh({ afterPending: true });
  calls[0](snapshot('a')); await first; await tick();
  assert.equal(calls.length, 2);
  calls[1](snapshot('a', 'committed')); await last;
  assert.equal(f.states.at(-1).jobs[0].state, 'committed'); f.monitor.stop();
});
