import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextInferenceScheduler } from '../src/context-inference-scheduler.mjs';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('CTX-RESOURCE-EXCLUSIVE serializes a resource while allowing independent CPU work', async () => {
  const scheduler = createContextInferenceScheduler(); const gate = deferred(); let active = 0; let max = 0;
  const operation = async () => { active++; max = Math.max(max, active); await gate.promise; active--; };
  const a = scheduler.run({ resource: 'gpu', priority: 'chat' }, operation);
  const b = scheduler.run({ resource: 'gpu', priority: 'chat' }, operation);
  assert.equal(await scheduler.run({ resource: 'cpu', priority: 'background' }, async () => 'embedding'), 'embedding');
  gate.resolve(); await Promise.all([a, b]); assert.equal(max, 1); await scheduler.close();
});

test('CTX-RESOURCE-CHAT-PRIORITY pauses only synthesis and schedules chat before queued background work', async () => {
  const scheduler = createContextInferenceScheduler(); const started = deferred(); const order = [];
  const background = scheduler.run({ resource: 'gpu', priority: 'background' }, signal => new Promise((resolve, reject) => {
    started.resolve(); signal.addEventListener('abort', () => { order.push('summary-stopped'); reject(signal.reason); }, { once: true });
  }));
  const rejected = assert.rejects(background, { code: 'CTX_RESOURCE_BUSY' }); await started.promise;
  const waiting = scheduler.run({ resource: 'gpu', priority: 'background' }, async () => { order.push('waiting-summary'); });
  const chat = scheduler.run({ resource: 'gpu', priority: 'chat' }, async () => { order.push('chat'); });
  await Promise.all([rejected, waiting, chat]);
  assert.deepEqual(order, ['summary-stopped', 'chat', 'waiting-summary']); await scheduler.close();
});

test('CTX-RESOURCE-UNCOOPERATIVE does not release GPU merely because an abort was requested', async () => {
  const scheduler = createContextInferenceScheduler(); const started = deferred(); const gate = deferred(); let chatStarted = false;
  const background = scheduler.run({ resource: 'gpu', priority: 'background' }, async () => { started.resolve(); await gate.promise; return 'late'; });
  const rejected = assert.rejects(background, { code: 'CTX_RESOURCE_BUSY' }); await started.promise;
  const chat = scheduler.run({ resource: 'gpu', priority: 'chat' }, async () => { chatStarted = true });
  await tick(); assert.equal(chatStarted, false); gate.resolve(); await Promise.all([rejected, chat]); assert.equal(chatStarted, true); await scheduler.close();
});

test('CTX-RESOURCE-CANCEL removes queued work without stopping an already running chat', async () => {
  const scheduler = createContextInferenceScheduler(); const gate = deferred(); const controller = new AbortController(); let queuedRan = false;
  const active = scheduler.run({ resource: 'gpu', priority: 'chat' }, async signal => { await gate.promise; assert.equal(signal.aborted, false) });
  const queued = scheduler.run({ resource: 'gpu', priority: 'background', signal: controller.signal }, async () => { queuedRan = true });
  const rejected = assert.rejects(queued, { name: 'AbortError' }); controller.abort();
  await rejected; gate.resolve(); await active; assert.equal(queuedRan, false); await scheduler.close();
});

test('CTX-RESOURCE-CLOSE drains active chat, rejects queued work, refuses new requests', async () => {
  const scheduler = createContextInferenceScheduler(); const gate = deferred(); const started = deferred();
  const active = scheduler.run({ resource: 'gpu', priority: 'chat' }, async signal => { started.resolve(); await gate.promise; assert.equal(signal.aborted, false) });
  await started.promise;
  const queued = scheduler.run({ resource: 'gpu', priority: 'chat' }, async () => {});
  const rejected = assert.rejects(queued, { code: 'CTX_SCHEDULER_CLOSED' }); const close = scheduler.close();
  await rejected; await assert.rejects(scheduler.run({ resource: 'gpu', priority: 'chat' }, async () => {}), { code: 'CTX_SCHEDULER_CLOSED' });
  gate.resolve(); await Promise.all([active, close]); assert.deepEqual(scheduler.getState(), []);
});
