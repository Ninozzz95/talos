import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialState } from '../../src/state/initial-state.js';
import { assertStateInvariants } from '../../src/state/invariants.js';

test('PHASE2-STATE-INVARIANTS-01 cold state is truthful and valid', () => {
  const state = createInitialState();
  assert.equal(state.runtime.phase, 'booting');
  assert.equal(state.sessions.activeId, null);
  assert.equal(state.execution.status, 'idle');
  assert.deepEqual(state.runtime.capabilities, {});
  assert.doesNotThrow(() => assertStateInvariants(state));
});

test('PHASE2-STATE-INVARIANTS-01 ready-active requires a real active session', () => {
  const state = createInitialState();
  state.runtime.phase = 'ready-active';
  assert.throws(() => assertStateInvariants(state), /ready-active richiede una sessione attiva/);
});

test('PHASE2-STATE-INVARIANTS-01 ready-empty cannot run an execution', () => {
  const state = createInitialState();
  state.runtime.phase = 'ready-empty';
  state.execution.status = 'running';
  assert.throws(() => assertStateInvariants(state), /ready-empty non può eseguire un run/);
});

test('PHASE2-STATE-INVARIANTS-01 browser resources never enter application state', () => {
  const state = createInitialState();
  state.files.preview = new AbortController();
  assert.throws(() => assertStateInvariants(state), /vietato nello stato/);
});

test('PHASE2-STATE-PLAIN-17 non-plain browser resources and containers fail closed', () => {
  const channel = new MessageChannel();
  try {
    for (const resource of [new EventTarget(), channel.port1, new Map([['controller', new AbortController()]])]) {
      const state = createInitialState();
      state.files.preview = resource;
      assert.throws(() => assertStateInvariants(state), /stato|risorsa browser vietata/);
    }
  } finally {
    channel.port1.close();
    channel.port2.close();
  }
});

test('PHASE2-SESSION-MEMBERSHIP-18 ready-active requires membership in the observed sessions', () => {
  const state = createInitialState();
  state.runtime.phase = 'ready-active';
  state.sessions.activeId = 'missing-session';
  assert.throws(() => assertStateInvariants(state), /elenco sessioni/);
});
