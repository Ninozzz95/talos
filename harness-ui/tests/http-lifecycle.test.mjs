import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { closeRuntimeResources, createRequestLifecycle, createSseSession } from '../src/http-lifecycle.mjs';

test('request lifecycle aborts exactly once on client disconnect and timeout is cleaned', async () => {
  const req = new EventEmitter(); const res = new EventEmitter(); res.destroyed = false; res.writableEnded = false;
  const lifecycle = createRequestLifecycle(req, res, { timeoutMs: 50 });
  assert.equal(lifecycle.signal.aborted, false);
  req.emit('aborted'); req.emit('aborted'); res.emit('close');
  assert.equal(lifecycle.signal.aborted, true);
  lifecycle.close();
});

test('SSE session sends id before data, heartbeats, and removes listeners/timer on close', () => {
  const response = new EventEmitter();
  response.writableEnded = false; response.destroyed = false; response.socket = { setNoDelay: (value) => { response.noDelay = value; } };
  response.writeHead = (...args) => { response.headers = args; };
  response.write = (value) => { response.frames.push(value); }; response.end = () => { response.writableEnded = true; };
  response.frames = [];
  const timer = { fn: null, id: 'timer-1', cleared: false };
  const sse = createSseSession({ response, heartbeatMs: 1000, setIntervalFn: (fn) => { timer.fn = fn; return timer.id; }, clearIntervalFn: (id) => { assert.equal(id, timer.id); timer.cleared = true; } });
  sse.start();
  sse.send({ _sequenza: 4, type: 'TextMessageContent', delta: 'ciao' });
  timer.fn();
  assert.equal(response.noDelay, true);
  assert.equal(response.frames[1], 'id: 4\n');
  assert.match(response.frames[2], /^data: \{"_sequenza":4/);
  assert.equal(response.frames.at(-1), ':battito\n\n');
  response.emit('close');
  assert.equal(timer.cleared, true);
  assert.equal(sse.closed, true);
});

test('closeRuntimeResources closes/aborts every owned resource without throwing', async () => {
  const calls = [];
  await closeRuntimeResources('shutdown', { resources: [{ abort: () => calls.push('abort') }, { stop: () => calls.push('stop') }, { close: () => calls.push('close') }, { destroy: () => calls.push('destroy') }] });
  assert.deepEqual(calls, ['abort', 'stop', 'close', 'destroy']);
});
