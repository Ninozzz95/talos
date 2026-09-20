import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { TEMPI_SERVER_HTTP, applicaTempiDelServer, closeRuntimeResources, createSseSession } from '../src/http-lifecycle.mjs';

/*
 * ⛔ P0 · punto 7 (16/09/2026): la prova di `createRequestLifecycle` è sparita insieme alla
 * funzione — era una deadline di 30 s su ogni richiesta, senza chiamanti, pronta a essere cablata
 * sulla rotta SSE. Il motivo per esteso sta in `src/http-lifecycle.mjs`; il cancello che impedisce
 * di rimetterla è `P0-D-13` in `tests/timeout-generazione-p0.test.mjs`. Al suo posto, la prova dei
 * tempi del server, che è la cosa che quel file doveva davvero dire.
 */
test('i tempi del server si applicano davvero, e headersTimeout resta sopra keepAliveTimeout', () => {
  const server = {};
  const letti = applicaTempiDelServer(server);
  assert.deepEqual(letti, { ...TEMPI_SERVER_HTTP });
  assert.equal(server.timeout, 0, 'nessun guardiano sul socket: una risposta SSE lunga deve poter vivere');
  assert.ok(
    TEMPI_SERVER_HTTP.headersTimeout > TEMPI_SERVER_HTTP.keepAliveTimeout,
    'headersTimeout sotto keepAliveTimeout fa chiudere i socket riusati senza colpevole',
  );
  /* AL CONTRARIO: un server che non accetta i valori non deve farci credere di averli imposti. */
  const testardo = { set timeout(_v) { /* ignora */ }, get timeout() { return 120_000; }, keepAliveTimeout: 0, headersTimeout: 0, requestTimeout: 0 };
  assert.equal(applicaTempiDelServer(testardo).timeout, 120_000);
  assert.equal(applicaTempiDelServer(null), null);
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
