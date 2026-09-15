import test from 'node:test';
import assert from 'node:assert/strict';
import { contextUsageFromEvents } from '../src/usage.mjs';

const event = (usage, operationId = 'one', sessionId = 'chat') => ({ type: 'CUSTOM', name: 'talos.context', value: {
  schema: 'talos.context.event.v1', id: `usage-${sessionId}-${operationId}`, sessionId,
  kind: 'context.usage.recorded', payload: { operationId, usage },
} });

test('CTX-USAGE-REPLAY distinct operations, repeated delivery and session ownership', () => {
  const first = event({ prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 40 } });
  assert.deepEqual(contextUsageFromEvents([first, structuredClone(first), event({ inputTokens: 80, outputTokens: 20 }, 'two'), event({ inputTokens: 999 }, 'other', 'private')], { sessionId: 'chat' }), {
    prompt_tokens: 200, completion_tokens: 50, cached_tokens: 40, operazioni: 2,
    prompt_tokens_con_cache: 120, operazioniConCache: 1,
  });
});

test('CTX-USAGE-UNKNOWN missing, null, invalid and preflight fields never invent billed tokens', () => {
  for (const usage of [{}, { inputTokens: null }, { prompt_tokens: '9' }, { inputTokens: -1 }, { inputTokens: .5 }, { inputTokens: Infinity }, { estimatedTokens: 999 }]) {
    assert.deepEqual(contextUsageFromEvents([event(usage)]), { prompt_tokens: null, completion_tokens: null, cached_tokens: null, operazioni: 1, prompt_tokens_con_cache: null, operazioniConCache: 0 });
  }
  assert.equal(contextUsageFromEvents([]), null);
  assert.equal(contextUsageFromEvents(null), null);
  assert.equal(contextUsageFromEvents(undefined), null);
  assert.equal(contextUsageFromEvents([{ ...event({ inputTokens: 1 }), name: 'other' }]), null);
  assert.equal(contextUsageFromEvents([event({ inputTokens: 1 })], { sessionId: 'other' }), null);
  assert.equal(contextUsageFromEvents([event({ inputTokens: 0 })]).prompt_tokens, 0);
});
