import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIONS } from '../../src/state/actions.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { reducer } from '../../src/state/reducer.js';

test('PHASE2-REDUCER-GENERATION-02 bootstrap without sessions becomes ready-empty', () => {
  const state = createInitialState();
  const next = reducer(state, {
    type: ACTIONS.BOOTSTRAP_SUCCEEDED,
    payload: { projects: [], sessions: [], capabilities: { doctor: { state: 'available' } }, observedAt: 12 },
  });
  assert.equal(next.runtime.phase, 'ready-empty');
  assert.equal(next.sessions.activeId, null);
  assert.equal(next.runtime.observedAt, 12);
  assert.equal(next.conversation, state.conversation);
});

test('PHASE2-REDUCER-GENERATION-02 stale session events cannot mutate the active session', () => {
  const state = createInitialState();
  state.sessions.activeId = 's-current';
  state.sessions.generation = 4;
  const next = reducer(state, {
    type: ACTIONS.SESSION_EVENT_RECEIVED,
    payload: { sessionId: 's-old', generation: 3, event: { type: 'TextMessageContent', messageId: 'm', delta: 'stale' } },
  });
  assert.equal(next, state);
});

test('PHASE2-REDUCER-GENERATION-02 current text delta updates only the conversation slice', () => {
  const state = createInitialState();
  state.sessions.activeId = 's-current';
  state.sessions.generation = 2;
  const next = reducer(state, {
    type: ACTIONS.SESSION_EVENT_RECEIVED,
    payload: { sessionId: 's-current', generation: 2, event: { type: 'TextMessageContent', messageId: 'm-1', delta: 'ciao' } },
  });
  assert.notEqual(next, state);
  assert.notEqual(next.conversation, state.conversation);
  assert.equal(next.sessions, state.sessions);
  assert.deepEqual(next.conversation.messages, [{ id: 'm-1', role: 'assistant', content: 'ciao', state: 'streaming' }]);
});

test('PHASE2-SESSION-MEMBERSHIP-18 selection rejects unknown ids and accepts an observed session', () => {
  const state = createInitialState();
  assert.equal(reducer(state, { type: ACTIONS.SESSION_SELECTED, payload: { id: 'missing' } }), state);
  const observed = { ...state, sessions: { ...state.sessions, items: [{ id: 's-1', title: 'Sessione reale' }] } };
  const next = reducer(observed, { type: ACTIONS.SESSION_SELECTED, payload: { id: 's-1' } });
  assert.equal(next.sessions.activeId, 's-1');
  assert.equal(next.runtime.phase, 'ready-active');
});
