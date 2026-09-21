import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

async function fixture(t) {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('Not used'); } }, tokenCounter: { countPreparedContext: async () => { throw new Error('Not used'); } } });
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => ({ provider: 'local', model: 'test', windowTokens: 16384, responseReserve: 2048 }), clock: () => '2026-09-09T00:00:00.000Z' });
  t.after(() => service.close());
  return { store, engine, service };
}
const request = (service, method, path, body) => service.request({ sessionId: 'chat', method, path, body });

test('CTX-OUTBOX-SINGLE-FLIGHT drains all pages once and acknowledges only successful delivery', { timeout: 2000 }, async () => {
  const pending = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  const delivered = []; const releases = []; let failOnce = true;
  const store = { readContextSnapshot: async () => ({ sessionId: 'chat' }), readUsage: async () => [],
    readContextOutbox: async () => pending.slice(0, 1), ackContextEvent: async ({ eventId }) => { assert.equal(pending[0].id, eventId); pending.shift(); } };
  const service = createDesktopContextService({ store, engine: {}, readSession: () => ({}), isSessionEnabled: () => true, resolveSessionModel: () => ({}), onEvent: async ({ event }) => {
    delivered.push(event.id);
    if (failOnce) { await new Promise(resolve => { releases.push(resolve); }); throw new Error('not persisted'); }
  } });
  const first = request(service, 'GET', '/');
  const second = request(service, 'GET', '/');
  const rejected = Promise.all([assert.rejects(first, /not persisted/), assert.rejects(second, /not persisted/)]);
  await new Promise(resolve => setImmediate(resolve));
  const during = [...delivered]; const waiting = pending.length;
  failOnce = false; for (const release of releases) release(); await rejected;
  assert.deepEqual(during, ['one']); assert.equal(waiting, 3);
  await request(service, 'GET', '/');
  assert.deepEqual(delivered, ['one', 'one', 'two', 'three']);
  assert.deepEqual(pending, []);
  await service.close();
});
test('CTX-DESKTOP-ISOLATION unknown session cannot initialize archive or access originals', async t => {
  const { service, store } = await fixture(t);
  await assert.rejects(service.request({ sessionId: 'unknown', method: 'GET', path: '/' }), { code: 'CTX_SESSION_NOT_FOUND' });
  assert.equal(await store.readContextSnapshot({ sessionId: 'unknown' }), null);
});
test('CTX-DESKTOP-SETTINGS persistent idempotence and expected revision control updates', async t => {
  const { service } = await fixture(t);
  const initial = await request(service, 'GET', '/');
  const body = { patch: { auto: false }, expectedRevision: initial.revision, idempotencyKey: 'one' };
  const first = await request(service, 'PATCH', '/settings', body);
  assert.equal(first.settings.auto, false);
  assert.deepEqual(await request(service, 'PATCH', '/settings', body), first);
  await assert.rejects(request(service, 'PATCH', '/settings', { ...body, patch: { auto: true } }), { code: 'CTX_IDEMPOTENCY_CONFLICT' });
  await assert.rejects(request(service, 'PATCH', '/settings', { ...body, idempotencyKey: 'two' }), { code: 'CTX_STALE_REVISION' });
});
test('CTX-DESKTOP-RAW retains full tool output with deterministic append identity', async t => {
  const { service, store } = await fixture(t);
  const messages = [{ role: 'user', content: 'leggi il file' }, { role: 'assistant', tool_calls: [{ id: 'call', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'call', content: 'x'.repeat(18000) + 'VALORE FINALE' }];
  await service.syncOriginals({ sessionId: 'chat', messages });
  await service.syncOriginals({ sessionId: 'chat', messages });
  const records = await store.readOriginals({ sessionId: 'chat' });
  assert.equal(records.length, 3);
  assert.equal(records.at(-1).message.content, messages.at(-1).content);
  await assert.rejects(service.syncOriginals({ sessionId: 'chat', messages: [{ role: 'user', content: 'sostituito' }] }), { code: 'CTX_HISTORY_DIVERGED' });
});
test('CTX-DESKTOP-FACTS owner changes and deletion expose real persisted state', async t => {
  const { service } = await fixture(t);
  const state = await request(service, 'GET', '/');
  const result = await request(service, 'POST', '/facts', { fact: { id: 'db', text: 'SQLite', sources: [] }, expectedRevision: state.revision, idempotencyKey: 'fact' });
  assert.equal(result.fact.text, 'SQLite');
  const next = await request(service, 'GET', '/');
  await request(service, 'DELETE', '/facts/db', { expectedRevision: next.revision, idempotencyKey: 'remove' });
  assert.deepEqual((await request(service, 'GET', '/facts')).facts.filter(f => f.status !== 'removed'), []);
});

test('CTX-DESKTOP-PROVIDER-RAW archives the untouched provider response before normalization', async t => {
  const { service, store } = await fixture(t);
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'run-one' });
  const response = { role: 'assistant', tool_calls: [{ id: 'call', type: 'function', function: { name: 'read', arguments: '{' } }] };
  await hooks.captureProviderResponse({ response, giro: 0 });
  response.tool_calls[0].function.arguments = '{}';
  const exported = await store.exportSession({ sessionId: 'chat' });
  const raw = exported.blobs.find(blob => blob.id.startsWith('provider-response-'));
  assert.ok(raw);
  assert.equal(JSON.parse(Buffer.from(raw.base64, 'base64').toString('utf8')).response.tool_calls[0].function.arguments, '{');
  assert.equal((await store.readOriginals({ sessionId: 'chat' })).length, 0, 'raw transport evidence must not create a second assistant message');
  await hooks.capture({ messages: [{ role: 'user', content: 'Leggi il file' }, response], reason: 'response' });
  assert.equal((await store.readOriginals({ sessionId: 'chat' })).length, 2);
});

test('CTX-DESKTOP-HOOK-NOT-ENABLED leaves unrelated sessions on the legacy path', async t => {
  const { store, engine } = await fixture(t);
  const service = createDesktopContextService({ store, engine, readSession: () => ({ sessionId: 'other' }), isSessionEnabled: () => false, resolveSessionModel: () => { throw new Error('Not called'); } });
  t.after(() => service.close());
  assert.equal(await service.createKernelHooks({ sessionId: 'other', runId: 'other-run' }), undefined);
  assert.equal(await service.compact({ sessionId: 'other', messages: [] }), undefined);
  assert.equal(await store.readContextSnapshot({ sessionId: 'other' }), null);
});
