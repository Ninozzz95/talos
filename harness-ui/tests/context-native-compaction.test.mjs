import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeCompactionAdapter } from '../src/context-native-compaction.mjs';

const model = { provider: 'openai', model: 'gpt-5.4-mini', windowTokens: 16384, responseReserve: 2048 };
const messages = [{ role: 'user', content: 'Keep the decision green.' }];
const evidence = ({ model, protocolPin }) => ({ ...model, protocolPin, artifactHash: 'a'.repeat(64), transport: 'live', checks: { compaction: true, continuation: true, portableRecovery: true, cancellation: true } });

test('CTX-NATIVE-GATE boolean/client evidence never enables native compaction', async () => {
  for (const verifyEvidence of [undefined, async () => true, async args => ({ ...evidence(args), transport: 'mock' }), async args => ({ ...evidence(args), model: 'different' }), async args => ({ ...evidence(args), checks: { compaction: true } })]) {
    let calls = 0; const adapter = createNativeCompactionAdapter({ fetchFn: async () => { calls++; }, resolveProfile: async () => ({ apiKey: 'key' }), verifyEvidence });
    assert.equal((await adapter.qualifyNativeCompaction({ model, evidenceId: 'ev' })).qualified, false);
    await assert.rejects(adapter.compact({ messages, model, mode: 'qualified', evidenceId: 'ev' }), { code: 'CTX_NATIVE_UNQUALIFIED' });
    assert.equal(calls, 0);
  }
});

test('CTX-NATIVE-OPENAI documented HTTP endpoint preserves the complete opaque output', async () => {
  let wire; const output = [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Retained.' }] }, { type: 'compaction', id: 'cmp_1', encrypted_content: 'opaque' }];
  const adapter = createNativeCompactionAdapter({ resolveProfile: async () => ({ apiKey: 'key' }), verifyEvidence: async args => evidence(args), fetchFn: async (url, init) => { wire = { url: String(url), body: JSON.parse(init.body) }; return Response.json({ id: 'cmp', object: 'response.compaction', output, usage: { input_tokens: 32, output_tokens: 8 } }); } });
  const result = await adapter.compact({ messages, model, mode: 'qualified', evidenceId: 'ev' });
  assert.equal(wire.url, 'https://api.openai.com/v1/responses/compact'); assert.ok(Array.isArray(wire.body.input));
  assert.deepEqual(result.native.output, output); assert.equal(result.usage.inputTokens, 32); assert.equal(result.portability.portable, false); assert.equal(result.portability.requiresOriginals, true);
  assert.equal(messages[0].content, 'Keep the decision green.');
});

test('CTX-NATIVE-ANTHROPIC requires actual compaction stop and preserves charged usage on no trigger', async () => {
  const anthropic = { ...model, provider: 'anthropic', model: 'claude-sonnet-5', windowTokens: 200000 };
  let wire;
  const adapter = createNativeCompactionAdapter({ resolveProfile: async () => ({ apiKey: 'key' }), verifyEvidence: async args => evidence(args), fetchFn: async (url, init) => { wire = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) }; return Response.json({ type: 'message', content: [{ type: 'text', text: 'No compaction' }], stop_reason: 'end_turn', usage: { input_tokens: 32, output_tokens: 8 } }); } });
  await assert.rejects(adapter.compact({ messages, model: anthropic, mode: 'qualified', evidenceId: 'ev' }), e => e.code === 'CTX_NATIVE_NOT_TRIGGERED' && e.usage.inputTokens === 32);
  assert.match(wire.url, /\/messages$/); assert.match(wire.headers.get('anthropic-beta'), /compact-2026-01-12/);
  assert.equal(wire.body.context_management.edits[0].pause_after_compaction, true);
  assert.ok(wire.body.context_management.edits[0].trigger.value >= 50000);
});

test('CTX-NATIVE-OFF and unsupported provider make no request', async () => {
  let calls = 0; const adapter = createNativeCompactionAdapter({ resolveProfile: async () => { calls++; }, fetchFn: async () => { calls++; } });
  await assert.rejects(adapter.compact({ messages, model, mode: 'off' }), { code: 'CTX_NATIVE_DISABLED' });
  assert.equal((await adapter.qualifyNativeCompaction({ model: { ...model, provider: 'gemini' } })).qualified, false); assert.equal(calls, 0);
});

test('CTX-NATIVE-ANTHROPIC protocol compaction response keeps all original native blocks', async () => {
  const native = { type: 'message', id: 'm1', content: [{ type: 'compaction', content: 'Green decision.' }, { type: 'text', text: 'Retained' }], stop_reason: 'compaction', usage: { input_tokens: 50001, output_tokens: 20 } };
  const adapter = createNativeCompactionAdapter({ resolveProfile: async () => ({ apiKey: 'key' }), verifyEvidence: async args => evidence(args), fetchFn: async () => Response.json(native) });
  const result = await adapter.compact({ messages, model: { ...model, provider: 'anthropic', model: 'claude-sonnet-5' }, mode: 'qualified', evidenceId: 'ev' });
  assert.deepEqual(result.native, native); assert.equal(result.usage.outputTokens, 20);
});

test('CTX-NATIVE-INVALID rejects empty opaque output and retains usage', async () => {
  const adapter = createNativeCompactionAdapter({ resolveProfile: async () => ({ apiKey: 'key' }), verifyEvidence: async args => evidence(args), fetchFn: async () => Response.json({ object: 'response.compaction', output: [{ type: 'compaction', encrypted_content: '' }], usage: { input_tokens: 30 } }) });
  await assert.rejects(adapter.compact({ messages, model, mode: 'qualified', evidenceId: 'ev' }), error => error.code === 'CTX_NATIVE_RESPONSE_INVALID' && error.usage.inputTokens === 30);
});

test('CTX-NATIVE-CANCEL cancellation after paid response retains usage', async () => {
  const controller = new AbortController();
  const adapter = createNativeCompactionAdapter({ resolveProfile: async () => ({ apiKey: 'key' }), verifyEvidence: async args => evidence(args), fetchFn: async () => { controller.abort(); return Response.json({ object: 'response.compaction', output: [], usage: { input_tokens: 30 } }); } });
  await assert.rejects(adapter.compact({ messages, model, mode: 'qualified', evidenceId: 'ev', signal: controller.signal }), error => error.name === 'AbortError' && error.usage.inputTokens === 30);
});
