import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIONS } from '../../src/state/actions.js';
import { createStore } from '../../src/state/create-store.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { reducer } from '../../src/state/reducer.js';
import { selectSessionHeader } from '../../src/state/selectors.js';

test('PHASE2-STORE-SELECTOR-03 subscription fires only when selected state changes', () => {
  const store = createStore({
    initialState: { a: 0, b: 0 },
    reducer: (state, action) => action.type === 'a' ? { ...state, a: state.a + 1 } : { ...state, b: state.b + 1 },
    validate: () => {},
  });
  const seen = [];
  const unsubscribe = store.subscribe((state) => state.a, (next, previous, action) => seen.push([next, previous, action.type]), { fireImmediately: false });
  store.dispatch({ type: 'b' });
  store.dispatch({ type: 'a' });
  unsubscribe();
  store.dispatch({ type: 'a' });
  assert.deepEqual(seen, [[1, 0, 'a']]);
});

test('PHASE2-STORE-SELECTOR-03 invalid state is rejected before publication', () => {
  const seen = [];
  const store = createStore({
    initialState: 0,
    reducer: () => -1,
    validate: (state) => { if (state < 0) throw new Error('negative'); },
  });
  store.subscribe((state) => state, (value) => seen.push(value), { fireImmediately: false });
  assert.throws(() => store.dispatch({ type: 'break' }), /negative/);
  assert.equal(store.getState(), 0);
  assert.deepEqual(seen, []);
});

test('PHASE2-STORE-SELECTOR-03 subscribe and dispatch reject malformed callers', () => {
  const store = createStore({ initialState: {}, reducer: (state) => state });
  assert.throws(() => store.subscribe(null, () => {}), /selector/);
  assert.throws(() => store.subscribe(() => null, null), /listener/);
  assert.throws(() => store.dispatch(null), /azione/);
});

test('PHASE2-SELECTOR-STABILITY-12 unrelated notifications do not publish a session header change', () => {
  const store = createStore({ initialState: createInitialState(), reducer });
  const seen = [];
  store.subscribe(selectSessionHeader, (value) => seen.push(value), { fireImmediately: false });
  store.dispatch({ type: ACTIONS.NOTIFICATION_ANNOUNCED, payload: { message: 'Salvato' } });
  assert.deepEqual(seen, []);
});

test('PHASE2-SELECTOR-STABILITY-12 concurrent stores cannot evict each other selector identity', () => {
  const storeA = createStore({ initialState: createInitialState(), reducer });
  const stateB = createInitialState();
  stateB.sessions.status = 'ready';
  stateB.sessions.items = [{ id: 'session-b', title: 'Store B', status: 'running' }];
  stateB.sessions.activeId = 'session-b';
  const storeB = createStore({ initialState: stateB, reducer });
  const seen = [];
  storeA.subscribe(selectSessionHeader, (value) => seen.push(value), { fireImmediately: false });
  selectSessionHeader(storeB.getState());
  storeA.dispatch({ type: ACTIONS.NOTIFICATION_ANNOUNCED, payload: { message: 'Store A' } });
  assert.deepEqual(seen, []);
});

test('PHASE2-STATE-IMMUTABLE-22 published state cannot be mutated outside dispatch', () => {
  const store = createStore({ initialState: createInitialState(), reducer });
  assert.throws(() => { store.getState().runtime.phase = 'ready-active'; }, TypeError);
  assert.throws(() => { store.getState().sessions.items.push({ id: 'forged' }); }, TypeError);
  assert.equal(store.getState().runtime.phase, 'booting');
  assert.deepEqual(store.getState().sessions.items, []);
});

test('PHASE2-STATE-IMMUTABLE-22 symbol and non-enumerable children are frozen too', () => {
  const symbol = Symbol('hidden-state');
  const initialState = { visible: {}, [symbol]: { count: 1 } };
  Object.defineProperty(initialState, 'nonEnumerable', { enumerable: false, value: { count: 1 } });
  const store = createStore({ initialState, reducer: (state) => state });
  assert.equal(Object.isFrozen(store.getState()[symbol]), true);
  assert.equal(Object.isFrozen(store.getState().nonEnumerable), true);
  assert.throws(() => { store.getState()[symbol].count = 2; }, TypeError);
  assert.throws(() => { store.getState().nonEnumerable.count = 2; }, TypeError);
});

test('PHASE2-STATE-IMMUTABLE-22 accessors and exotic mutable objects fail closed', () => {
  const accessorState = {};
  Object.defineProperty(accessorState, 'derived', { enumerable: true, get: () => ({ mutable: true }) });
  assert.throws(
    () => createStore({ initialState: accessorState, reducer: (state) => state }),
    /data properties/,
  );
  assert.throws(
    () => createStore({ initialState: { mutable: new Map([['key', 'value']]) }, reducer: (state) => state }),
    /plain objects/,
  );
});
