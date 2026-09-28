import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAgentAnswer, validateAgentQuestion } from '../src/agent-dialogue-contract.mjs';

test('AGENT-DIALOGUE-TEXT-BOUNDS: question and answer are bounded, nonempty text', () => {
  assert.equal(validateAgentQuestion('  Dove trovo il contratto?  '), 'Dove trovo il contratto?');
  assert.equal(validateAgentAnswer('  Usa il documento verificato.  '), 'Usa il documento verificato.');
  for (const value of [null, '', ' ', 7, {}, 'x'.repeat(2_001)]) {
    assert.throws(() => validateAgentQuestion(value), { code: 'AGENT_DIALOGUE_INVALID' });
  }
  assert.throws(() => validateAgentAnswer('x'.repeat(8_001)), { code: 'AGENT_DIALOGUE_INVALID' });
});
