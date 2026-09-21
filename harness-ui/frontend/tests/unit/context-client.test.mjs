import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextClient } from '../../src/services/context-client.js';

test('CTX-UI-CLIENT: session scope, revision and idempotency survive the HTTP boundary', async () => {
  const calls = [];
  const client = createContextClient({ fetchFn: async (url, options) => { calls.push({ url, ...options }); return Response.json({ job: { id: 'j' } }); } });
  await client.startCompaction({ sessionId: 'chat/a', idempotencyKey: 'once', kind: 'compact', expectedRevision: 8 });
  await client.updateContextSettings({ sessionId: 'chat/a', patch: { auto: false }, expectedRevision: 9, idempotencyKey: 'settings-once' });
  await client.upsertProtectedFact({ sessionId: 'chat/a', fact: { id: 'f/a', text: 'Preserva', sources: [] }, expectedRevision: 10 });
  assert.equal(calls[0].url, '/api/v1/sessions/chat%2Fa/context/jobs');
  assert.equal(calls[0].credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[0].body), { idempotencyKey: 'once', kind: 'compact', expectedRevision: 8 });
  assert.deepEqual(JSON.parse(calls[1].body), { patch: { auto: false }, expectedRevision: 9, idempotencyKey: 'settings-once' });
  assert.equal(calls[2].method, 'PATCH');
  assert.equal(calls[2].url, '/api/v1/sessions/chat%2Fa/context/facts/f%2Fa');
});

test('CTX-UI-HTTP-FAILURE: structured conflicts are actionable and never retried', async () => {
  let calls = 0;
  const client = createContextClient({ fetchFn: async () => { calls++; return Response.json({ error: { code: 'CTX_STALE_REVISION', message: 'Changed' } }, { status: 409 }); } });
  await assert.rejects(client.getContextState({ sessionId: 's' }), { code: 'CTX_STALE_REVISION', status: 409 });
  assert.equal(calls, 1);
});

test('CTX-UI-HTTP-JSON: malformed JSON and network failure have stable error codes', async () => {
  const malformed = createContextClient({ fetchFn: async () => new Response('<html>bad</html>') });
  await assert.rejects(malformed.getContextState({ sessionId: 's' }), { code: 'CTX_INVALID_RESPONSE' });
  const offline = createContextClient({ fetchFn: async () => { throw new TypeError('offline'); } });
  await assert.rejects(offline.getContextState({ sessionId: 's' }), { code: 'CTX_NETWORK_ERROR' });
});

test('CTX-UI-CLIENT-ABORT: caller cancellation remains cancellation', async () => {
  const controller = new AbortController(); controller.abort();
  const client = createContextClient({ fetchFn: async (_url, { signal }) => { signal.throwIfAborted(); } });
  await assert.rejects(client.getContextState({ sessionId: 's', signal: controller.signal }), { name: 'AbortError' });
});

test('CTX-UI-CLIENT-IDENTIFIERS: missing scope and path traversal fail before fetch', async () => {
  let calls = 0;
  const client = createContextClient({ fetchFn: async () => { calls++; return Response.json({}); } });
  for (const sessionId of ['', '..', '.', null]) await assert.rejects(client.getContextState({ sessionId }), { code: 'CTX_INVALID_ARGUMENT' });
  assert.equal(calls, 0);
});

test('CTX-UI-CLIENT-ROUTES: frozen mutation envelopes and source IDs remain intact', async () => {
  const calls = [];
  const client = createContextClient({ fetchFn: async (url, options) => { calls.push({ url, ...options }); return Response.json({}); } });
  await client.upsertProtectedFact({ sessionId: 's', fact: { text: 'Nuovo', sources: [] }, expectedRevision: 0 });
  await client.resolveFactConflict({ sessionId: 's', factId: 'f', accept: false, expectedRevision: 1 });
  await client.removeProtectedFact({ sessionId: 's', factId: 'f', expectedRevision: 2 });
  await client.restoreContextVersion({ sessionId: 's', versionId: 'v', expectedRevision: 3 });
  await client.cancelCompaction({ sessionId: 's', jobId: 'j' });
  await client.readContextSource({ sessionId: 's', sourceId: 'record/?' });
  assert.deepEqual(calls.map(x => x.method), ['POST', 'POST', 'DELETE', 'POST', 'DELETE', 'GET']);
  assert.deepEqual(JSON.parse(calls[1].body), { accept: false, expectedRevision: 1, idempotencyKey: JSON.parse(calls[1].body).idempotencyKey });
  assert.equal(JSON.parse(calls[3].body).expectedRevision, 3);
  assert.ok(calls.slice(0, 5).every(x => typeof JSON.parse(x.body).idempotencyKey === 'string'));
  assert.match(calls.at(-1).url, /sources\/record%2F%3F$/);
});
