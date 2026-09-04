import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialState } from '../../src/state/initial-state.js';
import {
  selectApprovalCount,
  selectConversation,
  selectDock,
  selectReviewSummary,
  selectRuntimePhase,
  selectSessionHeader,
  selectStatusBar,
  selectTerminalStatus,
} from '../../src/state/selectors.js';

test('PHASE2-STATE-INVARIANTS-01 selectors expose truthful cold values', () => {
  const state = createInitialState();
  assert.equal(selectRuntimePhase(state), 'booting');
  assert.deepEqual(selectSessionHeader(state), { id: null, title: null, status: 'idle' });
  assert.equal(selectConversation(state), state.conversation);
  assert.deepEqual(selectDock(state), { tab: 'preview', context: 'open', width: 380 });
  assert.equal(selectApprovalCount(state), 0);
  assert.deepEqual(selectReviewSummary(state), { changedFiles: 0, activePath: null, risks: 0 });
  assert.deepEqual(selectTerminalStatus(state), { status: 'disconnected', processCount: 0, activeId: null });
  // ⛔ `usage: null` e' il valore freddo ONESTO: a freddo non abbiamo misurato
  // niente, e «non misurato» non e' zero. Uno `0` qui sarebbe la barra che
  // dichiara un consumo che nessuno ha contato (difetto G30, al contrario).
  assert.deepEqual(selectStatusBar(state), { phase: 'booting', connection: 'connecting', execution: 'idle', usage: null, announcement: '' });
});

test('PHASE2-SELECTOR-STABILITY-12 object selectors preserve identity across unrelated state changes', () => {
  const state = createInitialState();
  const next = { ...state, notifications: { ...state.notifications, toast: { message: 'Salvato' } } };
  for (const selector of [selectSessionHeader, selectDock, selectReviewSummary, selectTerminalStatus]) {
    assert.equal(selector(next), selector(state));
  }
});
