/** Shared lifecycle primitives for HTTP requests, SSE streams and shutdown. */

export function createRequestLifecycle(req, res, { timeoutMs = 30_000, onAbort = () => {} } = {}) {
  const controller = new AbortController();
  let closed = false;
  const abort = (reason = 'client-closed') => {
    if (closed) return;
    closed = true;
    controller.abort(reason);
    try { onAbort(reason); } catch { /* callback osservatore non deve rompere il cleanup */ }
  };
  const onReqAborted = () => abort('request-aborted');
  const onResClose = () => abort('response-closed');
  req?.once?.('aborted', onReqAborted);
  res?.once?.('close', onResClose);
  const timer = Number.isInteger(timeoutMs) && timeoutMs > 0 ? setTimeout(() => abort('request-timeout'), timeoutMs) : null;
  timer?.unref?.();
  const close = () => {
    if (timer) clearTimeout(timer);
    req?.removeListener?.('aborted', onReqAborted);
    res?.removeListener?.('close', onResClose);
    abort('lifecycle-closed');
  };
  return Object.freeze({ signal: controller.signal, close, get aborted() { return controller.signal.aborted; } });
}

export function createSseSession({ response, heartbeatMs = 15_000, signal = null, lastEventId = 0, headers = {}, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  let closed = false;
  let heartbeat = null;
  let onResponseClose;
  let onAbort;
  const send = (event) => {
    if (closed || response?.writableEnded || response?.destroyed) return false;
    if (typeof event?._sequenza === 'number' && event._sequenza <= lastEventId) return false;
    if (typeof event?._sequenza === 'number') response.write(`id: ${event._sequenza}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
    return true;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    if (heartbeat !== null) clearIntervalFn(heartbeat);
    response?.removeListener?.('close', onResponseClose);
    signal?.removeEventListener?.('abort', onAbort);
  };
  const start = () => {
    if (closed) return;
    response.writeHead(200, {
      ...headers,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    response.socket?.setNoDelay?.(true);
    response.write(':ok\n\n');
    onResponseClose = close;
    response.once?.('close', onResponseClose);
    onAbort = close;
    signal?.addEventListener?.('abort', onAbort, { once: true });
    heartbeat = setIntervalFn(() => {
      if (closed || response.writableEnded || response.destroyed) { close(); return; }
      response.write(':battito\n\n');
    }, heartbeatMs);
    heartbeat?.unref?.();
  };
  return Object.freeze({ start, send, close, get closed() { return closed; } });
}

export async function closeRuntimeResources(reason, { resources = [], logger = null } = {}) {
  const pending = [];
  for (const resource of resources) {
    try {
      const result = typeof resource?.abort === 'function' ? resource.abort(reason)
        : typeof resource?.stop === 'function' ? resource.stop(reason)
          : typeof resource?.close === 'function' ? resource.close(reason)
            : typeof resource?.destroy === 'function' ? resource.destroy(reason) : undefined;
      if (result && typeof result.then === 'function') pending.push(Promise.resolve(result).catch((error) => {
        try { logger?.warn?.(`[runtime-close] ${error?.code || 'cleanup-failed'}`); } catch { /* cleanup best effort */ }
      }));
    } catch (error) {
      try { logger?.warn?.(`[runtime-close] ${error?.code || 'cleanup-failed'}`); } catch { /* cleanup best effort */ }
    }
  }
  await Promise.all(pending);
}
