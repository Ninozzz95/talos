import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createDesktopContextRuntime } from '../src/context-runtime.mjs';

const profile = { provider: 'local', model: 'fixture', windowTokens: 16384, responseReserve: 2048 };
async function fixture(t, extra = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-runtime-'));
  const options = { sessionDirectory: directory, enabledSessionIds: ['chat'], readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:fixture', conclusa: true } : null,
    resolveModelProfile: async () => profile,
    tokenCounter: { countPreparedContext: async ({ messages, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify(messages).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify(messages)).digest('hex'), provider: model.provider, model: model.model }) },
    callModel: async () => { throw new Error('Unexpected inference'); }, ...extra };
  const live = [];
  const open = async (overrides = {}) => { const runtime = await createDesktopContextRuntime({ ...options, ...overrides }); if (runtime) live.push(runtime); return runtime; };
  t.after(async () => { for (const runtime of live.reverse()) await runtime.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, options, open };
}
test('CTX-RUNTIME-DISABLED does not create a database or require provider credentials', async t => {
  const { directory } = await fixture(t);
  assert.equal(await createDesktopContextRuntime({ sessionDirectory: directory, enabledSessionIds: [] }), null);
  await assert.rejects(access(join(directory, 'context')));
});
test('CTX-RUNTIME-RAW-REOPEN conserves full tool results across a real worker restart', async t => {
  const { directory, open } = await fixture(t);
  const runtime = await open();
  const messages = [{ role: 'user', content: 'Leggi il file e controlla il valore in fondo' }, { role: 'assistant', tool_calls: [{ id: 'read', type: 'function', function: { name: 'read', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'read', content: 'x'.repeat(18000) + 'VALORE 473' }];
  await runtime.service.syncOriginals({ sessionId: 'chat', messages }); await runtime.close();
  await access(join(directory, 'context', 'context.sqlite'));
  const restarted = await open();
  assert.deepEqual((await restarted.store.readOriginals({ sessionId: 'chat' })).map(record => record.message), messages);
  const hooks = await restarted.service.createKernelHooks({ sessionId: 'chat', runId: 'new-run' });
  const prepared = await hooks.prepare({ messages, tools: [] });
  assert.equal(prepared.messages.at(-1).content, messages.at(-1).content);
});
test('CTX-RUNTIME-OWNERSHIP rejects path traversal and never enables unrelated sessions', async t => {
  const { options, open } = await fixture(t);
  await assert.rejects(createDesktopContextRuntime({ ...options, enabledSessionIds: ['../other'] }), { code: 'CTX_INVALID_INPUT' });
  const runtime = await open();
  assert.equal(await runtime.service.createKernelHooks({ sessionId: 'other', runId: 'test' }), undefined);
  assert.equal(await runtime.store.readContextSnapshot({ sessionId: 'other' }), null);
});
test('CTX-RUNTIME-PROFILE-SECRETS excludes credentials and rejects a changed model identity', async t => {
  const { open } = await fixture(t, { resolveModelProfile: async () => ({ ...profile, apiKey: 'must-not-persist', endpoint: 'https://private.example' }) });
  const runtime = await open();
  const messages = [{ role: 'user', content: 'Riprendiamo' }];
  const result = await runtime.service.prepare({ sessionId: 'chat', messages, tools: [] });
  assert.equal(result.measurement.provider, 'local');
  assert.equal(JSON.stringify(await runtime.engine.exportContext({ sessionId: 'chat' })).includes('must-not-persist'), false);
  const wrong = await open({ resolveModelProfile: async () => ({ ...profile, provider: 'openrouter' }) });
  await assert.rejects(wrong.service.prepare({ sessionId: 'chat', messages, tools: [] }), { code: 'CTX_MODEL_MISMATCH' });
});
test('CTX-RUNTIME-RESOURCE-PORT chat hook holds the shared local resource until response completes', async t => {
  const { open } = await fixture(t); const runtime = await open();
  const hooks = await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'run' });
  await hooks.infer({}, async () => { assert.equal(runtime.scheduler.getState()[0].active, 'chat'); });
  assert.deepEqual(runtime.scheduler.getState(), []);
});
