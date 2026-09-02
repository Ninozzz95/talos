function freezeState(value, seen = new WeakSet()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
  if (typeof value === 'function') throw new TypeError('state values must use plain objects, arrays, and data properties');
  if (seen.has(value)) return value;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('state values must use plain objects or arrays');
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('state values must use data properties');
    }
    freezeState(descriptor.value, seen);
  }
  return Object.freeze(value);
}

export function createStore({ initialState, reducer, validate = () => {} }) {
  if (typeof reducer !== 'function') throw new TypeError('reducer obbligatorio');
  if (typeof validate !== 'function') throw new TypeError('validate deve essere una funzione');
  let state = initialState;
  const subscriptions = new Set();
  validate(state);
  state = freezeState(state);

  return Object.freeze({
    getState: () => state,
    dispatch(action) {
      if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new TypeError('azione non valida');
      const next = reducer(state, action);
      if (next === state) return action;
      validate(next);
      state = freezeState(next);
      for (const record of [...subscriptions]) {
        const selected = record.selector(state);
        if (!record.equal(selected, record.value)) {
          const previous = record.value;
          record.value = selected;
          record.listener(selected, previous, action);
        }
      }
      return action;
    },
    subscribe(selector, listener, { equal = Object.is, fireImmediately = true } = {}) {
      if (typeof selector !== 'function') throw new TypeError('selector deve essere una funzione');
      if (typeof listener !== 'function') throw new TypeError('listener deve essere una funzione');
      if (typeof equal !== 'function') throw new TypeError('equal deve essere una funzione');
      const record = { selector, listener, equal, value: selector(state) };
      subscriptions.add(record);
      if (fireImmediately) listener(record.value, undefined, { type: '@@store/subscribe' });
      let subscribed = true;
      return () => {
        if (!subscribed) return false;
        subscribed = false;
        return subscriptions.delete(record);
      };
    },
  });
}
