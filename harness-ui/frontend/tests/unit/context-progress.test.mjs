import test from 'node:test';
import assert from 'node:assert/strict';
import { descriviAvanzamentoContesto } from '../../src/components/context-progress.js';
const state = (status, progress) => ({ sessionId: 'a', jobs: [{ id: 'one', state: status, progress }] });
test('CTX-PROGRESS-INDETERMINATE never invents a percentage for a generation without segment counts', () => {
  assert.equal(descriviAvanzamentoContesto(state('summarizing')).determinate, false);
  assert.equal(descriviAvanzamentoContesto(state('validating', { completed: 2, total: 2 })).determinate, false);
  assert.equal(descriviAvanzamentoContesto(state('summarizing', { completed: 1, total: 3 })).value, 1);
  assert.equal(descriviAvanzamentoContesto(state('summarizing', { completed: 4, total: 3 })).determinate, false);
  assert.equal(descriviAvanzamentoContesto(state('committed')).visible, false);
  assert.equal(descriviAvanzamentoContesto(state('failed')).active, false);
  assert.equal(descriviAvanzamentoContesto(state('paused')).visible, true);
});
