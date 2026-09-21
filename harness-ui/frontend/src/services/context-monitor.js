const ACTIVE = new Set(['queued', 'preparing', 'summarizing', 'validating', 'ready']);

/** Read-only observer of the selected chat. It never starts an inference. */
export function createContextMonitor({ client, onState, onError, intervalMs = 1200, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
  let sessionId = null, running = false, snapshot = null, epoch = 0, sequence = 0, pending = null, timer, controller, failures = 0, unavailable = false;
  const active = () => snapshot?.jobs?.some(job => ACTIVE.has(job.state));
  function schedule() {
    clearTimeoutFn(timer);
    if (sessionId && !unavailable && (running || active())) timer = setTimeoutFn(() => api.refresh(), Math.min(15000, intervalMs * 2 ** Math.min(failures, 4)));
  }
  const api = {
    follow(next, options = {}) {
      if (next !== sessionId) { api.stop(); sessionId = next; }
      running = options.running === true;
      return api.refresh();
    },
    setRunning(value) { running = value === true; schedule(); },
    update(next) {
      if (!sessionId || next?.sessionId !== sessionId || (snapshot && next.revision < snapshot.revision)) return;
      ++sequence; controller?.abort(); pending = null;
      snapshot = structuredClone(next); failures = 0; unavailable = false;
      onState?.(structuredClone(snapshot)); schedule();
    },
    refresh({ afterPending = false } = {}) {
      if (!sessionId || unavailable) return Promise.resolve(null);
      if (pending) {
        const current = epoch;
        return afterPending ? pending.then(() => current === epoch ? api.refresh() : null) : pending;
      }
      clearTimeoutFn(timer);
      const current = epoch, ticket = ++sequence, selected = sessionId;
      controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
      const request = (async () => {
        // Assign pending before a client can throw synchronously.
        await Promise.resolve();
        try {
          const next = await client.getContextState({ sessionId: selected, signal });
          if (current !== epoch || ticket !== sequence) return null;
          if (next?.sessionId !== selected || !Array.isArray(next.jobs)) throw new Error('CTX_INVALID_RESPONSE');
          snapshot = structuredClone(next); failures = 0; onState?.(structuredClone(snapshot)); return snapshot;
        } catch (error) {
          if (current !== epoch || ticket !== sequence) return null;
          failures++; unavailable = error.code === 'CTX_NOT_ENABLED' || error.code === 'CTX_SESSION_NOT_FOUND';
          onError?.(error, { sessionId: selected }); return null;
        } finally {
          if (current === epoch && ticket === sequence) { pending = null; schedule(); }
        }
      })();
      pending = request; return request;
    },
    stop() {
      ++epoch; ++sequence; clearTimeoutFn(timer); controller?.abort(); pending = null;
      sessionId = null; running = false; snapshot = null; failures = 0; unavailable = false;
    },
  };
  return Object.freeze(api);
}
