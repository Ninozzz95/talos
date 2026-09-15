import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextModelAdapter, prepareProviderContext, buildPreparedProviderRequest } from '../src/context-provider-adapter.mjs';

const local = { provider: 'local', model: 'qwen', windowTokens: 16384, responseReserve: 2048, local: true, capabilities: {} };
const call = { id: 'c1', type: 'function', function: { name: 'read', arguments: '{"path":"note"}' } };
const history = provider => [
  { role: 'system', content: 'Instruction' }, { role: 'user', content: 'Read note' },
  { role: 'assistant', content: 'Reading', tool_calls: [call], talos_provider_state: { version: 1, provider, model: 'original', content: [{ type: 'reasoning', text: 'private', providerOptions: { anthropic: { signature: 'real-signature' } } }, { type: 'tool-call', toolCallId: 'c1', toolName: 'read', input: { path: 'note' }, providerOptions: { google: { thoughtSignature: 'real-signature' } } }] } },
  { role: 'tool', tool_call_id: 'c1', content: 'answer' },
];

test('CTX-NO-IMPLICIT-CLOUD resolves only the selected session or explicit model', async () => {
  const model = createContextModelAdapter({ resolveModel: async ({ settings, sessionModel }) => settings.model.mode === 'explicit' ? { ...local, ...settings.model } : sessionModel, callModel: async () => ({}) });
  assert.deepEqual(await model.resolveModel({ sessionModel: local, settings: { model: { mode: 'follow-session' } } }), local);
  assert.equal((await model.resolveModel({ sessionModel: local, settings: { model: { mode: 'explicit', provider: 'local', model: 'gemma' } } })).model, 'gemma');
  const wrong = createContextModelAdapter({ resolveModel: async () => ({ ...local, provider: 'openai' }), callModel: async () => ({}) });
  await assert.rejects(wrong.resolveModel({ sessionModel: local, settings: { model: { mode: 'follow-session' } } }), { code: 'CTX_MODEL_MISMATCH' });
});

test('CTX-MODEL-SUMMARY calls one injected model without tools or retries and preserves usage', async () => {
  let request;
  const model = createContextModelAdapter({ resolveModel: async () => local, callModel: async args => { request = args; args.messages[0].content = 'mutated'; return { text: 'summary', finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 4 } }; } });
  const messages = [{ role: 'user', content: 'summarize' }];
  const result = await model.summarize({ model: local, messages, maxOutputTokens: 500, operationId: 'op' });
  assert.equal(result.text, 'summary'); assert.equal(result.usage.inputTokens, 10);
  assert.deepEqual(request.tools, []); assert.equal(request.maxRetries, 0); assert.equal(request.model, 'qwen');
  assert.equal(messages[0].content, 'summarize');
});

test('CTX-MODEL-SUMMARY rejects absent finish reason and keeps billed usage on failure', async () => {
  const model = createContextModelAdapter({ resolveModel: async () => local, callModel: async () => ({ text: 'partial', usage: { inputTokens: 12 } }) });
  await assert.rejects(model.summarize({ model: local, messages: [], maxOutputTokens: 20 }), e => e.code === 'CTX_SUMMARY_RESPONSE_INVALID' && e.usage.inputTokens === 12);
});

test('CTX-NATIVE-PREFIX reset removes stale opaque state on a copy and represents closed tools as historical data', () => {
  const original = history('anthropic'); const before = structuredClone(original);
  const prepared = prepareProviderContext({ messages: original, provider: 'anthropic', model: 'original', reset: true });
  assert.equal(prepared.resetApplied, true); assert.deepEqual(original, before);
  assert.ok(prepared.messages.every(m => !m.talos_provider_state && !m.tool_calls && m.role !== 'tool'));
  assert.ok(JSON.stringify(prepared.messages).includes('answer'));
  assert.ok(!JSON.stringify(prepared.messages).includes('real-signature'));
});

test('CTX-NATIVE-PREFIX unchanged native state is preserved byte-for-byte through JSON', () => {
  const original = history('anthropic');
  assert.deepEqual(prepareProviderContext({ messages: original, provider: 'anthropic', model: 'original' }).messages, original);
});

test('CTX-MODEL-SWITCH Gemini never fabricates signatures for replayed tools', async () => {
  const prepared = prepareProviderContext({ messages: history('anthropic'), provider: 'gemini', model: 'gemini-3.8-flash' });
  const { body } = await buildPreparedProviderRequest({ messages: prepared.messages, model: { provider: 'gemini', model: 'gemini-3.8-flash' } });
  assert.ok(!JSON.stringify(body).includes('thoughtSignature')); assert.ok(!JSON.stringify(body).includes('functionCall'));
});

test('CTX-TOOL-PAIRING reset refuses pending and orphan tools', () => {
  for (const messages of [history('gemini').slice(0, -1), [{ role: 'tool', tool_call_id: 'missing', content: 'bad' }]]) {
    assert.throws(() => prepareProviderContext({ messages, provider: 'local', model: 'qwen', reset: true }), { code: 'CTX_PENDING_TOOLS' });
  }
});

test('CTX-CANCEL summary and local SDK compilation honor already aborted signal', async () => {
  const signal = AbortSignal.abort(); let calls = 0;
  const model = createContextModelAdapter({ resolveModel: async () => local, callModel: async () => { calls++; } });
  await assert.rejects(model.summarize({ model: local, messages: [], maxOutputTokens: 30, signal }), { name: 'AbortError' });
  await assert.rejects(buildPreparedProviderRequest({ messages: [], model: { provider: 'openai', model: 'gpt-5.4-mini' }, signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('CTX-NATIVE-SIGNATURE-ORDER a later signature cannot authorize an unsigned first Gemini call', async () => {
  const original = history('gemini');
  original[2].talos_provider_state.model = 'gemini-3.8-flash';
  const signed = original[2].talos_provider_state.content.at(-1);
  original[2].talos_provider_state.content = [{ ...signed, toolCallId: 'unsigned', providerOptions: {} }, signed];
  original[2].tool_calls.unshift({ ...call, id: 'unsigned' });
  original.splice(3, 0, { role: 'tool', tool_call_id: 'unsigned', content: 'first result' });
  const prepared = prepareProviderContext({ messages: original, provider: 'gemini', model: 'gemini-3.8-flash' });
  const { body } = await buildPreparedProviderRequest({ messages: prepared.messages, model: { provider: 'gemini', model: 'gemini-3.8-flash' } });
  assert.ok(!JSON.stringify(body).includes('skip_thought_signature_validator'));
  assert.ok(!JSON.stringify(body).includes('functionCall'));
});
