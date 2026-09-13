const fault = (code, message) => Object.assign(new Error(message), { code });

/** Serializes inference, not process/tool execution. A lease lasts until the
 * operation settles, including complete stream consumption by its caller. */
export function createContextInferenceScheduler() {
  const resources = new Map();
  let closed = false, closing;
  function pump(resource, queue) {
    if (queue.active || closed) return;
    const index = queue.pending.findIndex(entry => entry.priority === 'chat');
    const entry = queue.pending.splice(index < 0 ? 0 : index, 1)[0];
    if (!entry) { resources.delete(resource); return; }
    queue.active = entry;
    entry.done = (async () => {
      try {
        entry.controller.signal.throwIfAborted();
        const result = await entry.operation(entry.controller.signal);
        if (entry.controller.signal.aborted) {
          const reason = entry.controller.signal.reason;
          if (reason && result?.usage !== undefined) reason.usage = result.usage;
          throw reason;
        }
        entry.resolve(result);
      } catch (error) {
        const reason = entry.controller.signal.aborted ? entry.controller.signal.reason : error;
        if (reason && error?.usage !== undefined) reason.usage = error.usage;
        entry.reject(reason);
      } finally {
        entry.signal?.removeEventListener('abort', entry.abort);
        queue.active = null;
        if (closed) resources.delete(resource);
        else pump(resource, queue);
      }
    })();
  }
  return Object.freeze({
    run({ resource, priority, signal } = {}, operation) {
      if (closed) return Promise.reject(fault('CTX_SCHEDULER_CLOSED', 'Il pianificatore delle inferenze è chiuso.'));
      if (typeof resource !== 'string' || !resource.trim() || !['chat', 'background'].includes(priority) || typeof operation !== 'function') return Promise.reject(fault('CTX_RESOURCE_INVALID', 'Risorsa o priorità di inferenza non valida.'));
      if (signal?.aborted) return Promise.reject(signal.reason);
      let queue = resources.get(resource);
      if (!queue) { queue = { active: null, pending: [] }; resources.set(resource, queue); }
      return new Promise((resolve, reject) => {
        const entry = { priority, operation, signal, resolve, reject, controller: new AbortController() };
        entry.abort = () => {
          entry.controller.abort(signal.reason);
          if (queue.active !== entry) {
            const index = queue.pending.indexOf(entry);
            if (index >= 0) queue.pending.splice(index, 1);
            signal.removeEventListener('abort', entry.abort);
            reject(signal.reason);
          }
        };
        signal?.addEventListener('abort', entry.abort, { once: true });
        queue.pending.push(entry);
        if (priority === 'chat' && queue.active?.priority === 'background') queue.active.controller.abort(fault('CTX_RESOURCE_BUSY', 'La sintesi lascia la risorsa alla chat. I segmenti già verificati restano salvati.'));
        pump(resource, queue);
      });
    },
    getState() {
      return [...resources].map(([resource, queue]) => ({ resource, active: queue.active?.priority ?? null, queuedChat: queue.pending.filter(e => e.priority === 'chat').length, queuedBackground: queue.pending.filter(e => e.priority === 'background').length }));
    },
    close() {
      if (closing) return closing;
      closed = true;
      const active = [];
      for (const [resource, queue] of resources) {
        for (const entry of queue.pending.splice(0)) {
          entry.signal?.removeEventListener('abort', entry.abort);
          entry.reject(fault('CTX_SCHEDULER_CLOSED', 'Il pianificatore delle inferenze è chiuso.'));
        }
        if (queue.active) {
          if (queue.active.priority === 'background') queue.active.controller.abort(fault('CTX_SCHEDULER_CLOSED', 'Sintesi fermata durante la chiusura.'));
          active.push(queue.active.done);
        } else resources.delete(resource);
      }
      closing = Promise.allSettled(active).then(() => undefined);
      return closing;
    },
  });
}
