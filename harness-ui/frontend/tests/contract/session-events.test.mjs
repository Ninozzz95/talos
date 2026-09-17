import assert from 'node:assert/strict';
import test from 'node:test';
import { SESSION_EVENT_NAMES, decodeSessionEvent } from '../../src/domain/session-events.ts';

test('K05: the 26 existing tags plus the real CUSTOM replay channel are retained', () => {
  const types = new Set(SESSION_EVENT_NAMES);
  assert.equal(types.size, 27);
  for (const type of ['ToolCallOutput', 'ComandoUtenteIniziato', 'ComandoUtenteFinito',
    'RunRedirectApplied', 'RunRedirectCancelled', 'RunRedirectFailed', 'RunRedirectRequested']) assert.ok(types.has(type));
  const original = { type: 'TextMessageContent', messageId: 'm-1', delta: 'ciao', _sequenza: 12 };
  const decoded = decodeSessionEvent(original);
  assert.equal(decoded.kind, 'known');
  assert.deepEqual(decoded.event, { ...original, sequence: 12 });
  assert.equal(original.sequence, undefined, 'decoding must not mutate the received event');
  assert.equal(decodeSessionEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata' }).kind, 'known');
  assert.equal(decodeSessionEvent({ type: 'InventedEvent' }).kind, 'unsupported');
});
