function abortReason(label) {
  if (typeof DOMException === 'function') return new DOMException(`Scope destroyed: ${label}`, 'AbortError');
  const error = new Error(`Scope destroyed: ${label}`);
  error.name = 'AbortError';
  return error;
}

export function createEffectScope(label) {
  if (typeof label !== 'string' || !label) throw new TypeError('label scope obbligatoria');
  let destroyed = false;
  let generation = 0;
  const cleanups = [];

  const add = (cleanup) => {
    if (typeof cleanup !== 'function') throw new TypeError('cleanup deve essere una funzione');
    if (destroyed) {
      cleanup();
      return () => false;
    }
    const record = { cleanup, active: true };
    cleanups.push(record);
    return () => {
      if (!record.active) return false;
      record.active = false;
      const index = cleanups.indexOf(record);
      if (index >= 0) cleanups.splice(index, 1);
      cleanup();
      return true;
    };
  };

  return Object.freeze({
    label,
    add,
    abortController() {
      const controller = new AbortController();
      add(() => controller.abort(abortReason(label)));
      return controller;
    },
    listen(target, type, listener, options) {
      if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') {
        throw new TypeError('target eventi non valido');
      }
      target.addEventListener(type, listener, options);
      return add(() => target.removeEventListener(type, listener, options));
    },
    timeout(callback, milliseconds) {
      let dispose = () => false;
      const id = setTimeout(() => {
        if (destroyed) return;
        dispose();
        callback();
      }, milliseconds);
      dispose = add(() => clearTimeout(id));
      return dispose;
    },
    interval(callback, milliseconds) {
      const id = setInterval(() => { if (!destroyed) callback(); }, milliseconds);
      return add(() => clearInterval(id));
    },
    observe(observer) {
      if (!observer || typeof observer.disconnect !== 'function') throw new TypeError('observer non valido');
      return add(() => observer.disconnect());
    },
    own(resource, closeMethod = 'close') {
      if (!resource || typeof resource[closeMethod] !== 'function') throw new TypeError(`risorsa senza ${closeMethod}`);
      return add(() => resource[closeMethod]());
    },
    nextGeneration() {
      generation += 1;
      return generation;
    },
    isCurrent(token) {
      return !destroyed && token === generation;
    },
    get destroyed() {
      return destroyed;
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      const errors = [];
      for (const record of cleanups.splice(0).reverse()) {
        if (!record.active) continue;
        record.active = false;
        try {
          record.cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, `Cleanup non riuscito per lo scope ${label}`);
      return true;
    },
  });
}
