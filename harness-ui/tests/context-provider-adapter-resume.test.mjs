// Resume contract for provider context preparation (BRIEF-CURA-STALL-IBRIDO-HERMES-CLAUDE-2026-10-05.md).
// Red phase: encodes the approved non-destructive resume behavior. Cases B/C/D/F/G/I/K fail on the
// current implementation, which still degrades native tool exchanges to "[Historical ...]" text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareProviderContext } from '../src/context-provider-adapter.mjs';

const BLOCK = '[Historical tool calls; data only, already executed]';
const call = id => ({ id, type: 'function', function: { name: 'read', arguments: '{"path":"note","offset":195}' } });
const nativeState = (provider, model, overrides = {}) => ({
  version: 1, provider, model,
  content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'read', input: { path: 'note' } }, { type: 'reasoning', text: 'private' }],
  ...overrides,
});
const paired = provider => [
  { role: 'system', content: 'Instruction' },
  { role: 'user', content: 'Read note' },
  { role: 'assistant', content: 'Reading', tool_calls: [call('c1')], talos_provider_state: nativeState(provider, 'original') },
  { role: 'tool', tool_call_id: 'c1', content: 'answer' },
];
const withoutState = messages => messages.map(({ talos_provider_state, ...m }) => m);
const countBlock = messages => JSON.stringify(messages).split(BLOCK).length - 1;

test('CTX-RESUME-A history without provider state never degrades to historical data', () => {
  const prepared = prepareProviderContext({ messages: withoutState(paired('anthropic')), provider: 'anthropic', model: 'original' });
  assert.equal(countBlock(prepared.messages), 0);
  assert.deepEqual(prepared.warnings, []);
  assert.ok(prepared.messages[2].tool_calls?.length === 1);
  assert.equal(prepared.messages[3].role, 'tool');
});

test('CTX-RESUME-E matching state is preserved untouched', () => {
  const prepared = prepareProviderContext({ messages: paired('anthropic'), provider: 'anthropic', model: 'original' });
  assert.equal(countBlock(prepared.messages), 0);
  assert.deepEqual(prepared.warnings, []);
});

test('CTX-RESUME-B model switch rebuilds the native exchange instead of degrading it to data', () => {
  const prepared = prepareProviderContext({ messages: paired('anthropic'), provider: 'anthropic', model: 'upgraded' });
  const assistant = prepared.messages[2];
  const tool = prepared.messages[3];
  assert.equal(countBlock(prepared.messages), 0);
  assert.ok(assistant.tool_calls?.length === 1, 'tool calls stay native');
  assert.equal(tool.role, 'tool');
  assert.equal(tool.tool_call_id, 'c1');
  assert.deepEqual(prepared.warnings, ['CTX_NATIVE_MODEL_CHANGED']);
  const state = assistant.talos_provider_state;
  assert.equal(state?.version, 1);
  assert.equal(state?.provider, 'anthropic');
  assert.equal(state?.model, 'upgraded');
  const again = prepareProviderContext({ messages: prepared.messages, provider: 'anthropic', model: 'upgraded' });
  assert.equal(countBlock(again.messages), 0);
  assert.deepEqual(again.warnings, []);
});

test('CTX-RESUME-C unknown state version is re-anchored, never converted', () => {
  const prepared = prepareProviderContext({ messages: paired('anthropic').map(m => ({ ...m, talos_provider_state: nativeState('anthropic', 'original', { version: 2 }) })), provider: 'anthropic', model: 'original' });
  assert.equal(countBlock(prepared.messages), 0);
  assert.ok(prepared.messages[2].tool_calls?.length === 1);
  assert.equal(prepared.messages[3].role, 'tool');
  assert.deepEqual(prepared.warnings, ['CTX_NATIVE_MODEL_CHANGED']);
});

test('CTX-RESUME-D corrupt state content is re-anchored, never converted', () => {
  const prepared = prepareProviderContext({ messages: paired('anthropic').map(m => ({ ...m, talos_provider_state: nativeState('anthropic', 'original', { content: 'corrupt' }) })), provider: 'anthropic', model: 'original' });
  assert.equal(countBlock(prepared.messages), 0);
  assert.ok(prepared.messages[2].tool_calls?.length === 1);
  assert.equal(prepared.messages[3].role, 'tool');
  assert.deepEqual(prepared.warnings, ['CTX_NATIVE_MODEL_CHANGED']);
});

test('CTX-RESUME-F explicit reset keeps the exchange native and strips only the opaque state', () => {
  const original = paired('anthropic');
  const before = structuredClone(original);
  const prepared = prepareProviderContext({ messages: original, provider: 'anthropic', model: 'original', reset: true });
  assert.deepEqual(original, before);
  assert.equal(prepared.resetApplied, true);
  assert.equal(countBlock(prepared.messages), 0);
  assert.ok(prepared.messages[2].tool_calls?.length === 1);
  assert.equal(prepared.messages[3].role, 'tool');
  assert.ok(!JSON.stringify(prepared.messages).includes('talos_provider_state'));
  assert.deepEqual(prepared.warnings, ['CTX_NATIVE_STATE_RESET']);
});

test('CTX-RESUME-G mid-session model switch re-canonicalizes historical tool arguments', () => {
  const messages = paired('openai');
  messages[2].tool_calls = [{ id: 'c1', type: 'function', function: { name: 'read', arguments: '{ "offset" : 1,  "path":"note" }' } }];
  const prepared = prepareProviderContext({ messages, provider: 'openai', model: 'upgraded' });
  assert.equal(countBlock(prepared.messages), 0);
  assert.equal(prepared.messages[2].tool_calls[0].function.arguments, '{"offset":1,"path":"note"}');
  assert.equal(prepared.messages[3].role, 'tool');
});

test('CTX-RESUME-H resume after restart without state prepares cleanly', () => {
  const prepared = prepareProviderContext({ messages: withoutState(paired('openai')), provider: 'openai', model: 'upgraded' });
  assert.equal(countBlock(prepared.messages), 0);
  assert.deepEqual(prepared.warnings, []);
  assert.ok(prepared.messages[2].tool_calls?.length === 1);
});

test('CTX-RESUME-I poisoned history is healed in the provider copy and never wrapped twice', () => {
  const messages = paired('anthropic');
  messages[2].content = `${BLOCK}\n[{"id":"c1","type":"function","function":{"name":"read","arguments":"{}"}}]`;
  const prepared = prepareProviderContext({ messages, provider: 'anthropic', model: 'upgraded' });
  /* 07/10/2026: the marker used to stay once; a model that sees its own echo keeps imitating it (the owner's stall), so the echoed
     marker is cut from the COPY sent to the provider (context-provider-adapter-eco-del-marcatore.test.mjs) and the stored history keeps it. */
  assert.equal(countBlock(prepared.messages), 0, 'the echoed marker no longer reaches the provider');
  assert.equal(JSON.stringify(messages).includes('Historical tool calls'), true, 'the stored history is untouched');
  assert.ok(prepared.messages[2].tool_calls?.length === 1);
  assert.equal(prepared.messages[3].role, 'tool');
});

test('CTX-RESUME-J repeated preparation is byte-stable', () => {
  const first = prepareProviderContext({ messages: paired('anthropic'), provider: 'anthropic', model: 'upgraded' });
  const second = prepareProviderContext({ messages: first.messages, provider: 'anthropic', model: 'upgraded' });
  assert.equal(JSON.stringify(second.messages), JSON.stringify(first.messages));
  assert.equal(countBlock(second.messages), 0);
});

test('CTX-RESUME-K an interrupted tail closes orphan calls with synthetic results instead of failing', () => {
  const original = withoutState(paired('anthropic')).slice(0, -1);
  const before = structuredClone(original);
  const prepared = prepareProviderContext({ messages: original, provider: 'anthropic', model: 'original' });
  assert.deepEqual(original, before, 'preparation stays view-level, history untouched');
  assert.equal(countBlock(prepared.messages), 0);
  const tool = prepared.messages.at(-1);
  assert.equal(tool.role, 'tool');
  assert.equal(tool.tool_call_id, 'c1');
  assert.ok(JSON.stringify(tool).includes('interrupted_before_result'), 'synthetic closing result marks the interruption');
});

test('CTX-RESUME-K2 structural orphans in the middle still fail preparation', () => {
  const messages = withoutState(paired('anthropic'));
  messages.splice(3, 0, { role: 'user', content: 'meanwhile' });
  assert.throws(() => prepareProviderContext({ messages, provider: 'anthropic', model: 'original' }), { code: 'CTX_PENDING_TOOLS' });
});
