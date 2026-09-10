import assert from 'node:assert/strict';
import test from 'node:test';

import { SESSION_EVENT_TYPES, normalizeSessionEvent } from '../../src/contracts/session-events.js';

test('PHASE2-EVENT-CONTRACT-DRIFT-19 conserva i 24 eventi correnti e normalizza la sequenza', () => {
  assert.equal(SESSION_EVENT_TYPES.size, 24);
  /* ⛔ D-10B: il 24° e' `ToolCallOutput`. Senza dichiararlo qui il giro MORIVA — `normalizeSessionEvent`
     lancia sui tipi che non conosce, e il primo pezzo di output di un comando faceva comparire in chat
     «Il giro si e' interrotto per un errore». Misurato dal vivo sul 4174 il 10/09. */
  assert.equal(SESSION_EVENT_TYPES.has('ToolCallOutput'), true);
  for (const type of ['RunRedirectApplied', 'RunRedirectCancelled', 'RunRedirectFailed', 'RunRedirectRequested']) {
    assert.equal(SESSION_EVENT_TYPES.has(type), true);
  }
  assert.deepEqual(normalizeSessionEvent({ type: 'TextMessageContent', messageId: 'm-1', delta: 'ciao', _sequenza: 12 }), {
    type: 'TextMessageContent', messageId: 'm-1', delta: 'ciao', sequence: 12,
  });
  assert.throws(() => normalizeSessionEvent({ type: 'InventedEvent' }), /non supportato/u);
});
