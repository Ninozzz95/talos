/**
 * Read-only aggregate projection for the desktop sidebar.
 *
 * A connection always starts with an authoritative snapshot. Revisions are scoped
 * to one registry lifetime; reconnecting never replays transcripts or opens a
 * filesystem watcher. Events in one turn of the event loop are coalesced by id.
 */
import { randomUUID } from 'node:crypto';

export const SIDEBAR_SCHEMA = 'talos.sidebar.v1';
export const SIDEBAR_HEARTBEAT_MS = 15_000;
export const SIDEBAR_MAX_BUFFER = 1_048_576;

const PASSIVE = new Set(['TextMessageContent', 'ReasoningMessageContent', 'ToolCallArgs', 'ToolCallOutput', 'WorkspaceChanged']);
const IMPORTANT = new Set(['RunStarted', 'RunFinished', 'RunError', 'ReasoningMessageStart', 'ReasoningMessageEnd',
  'TextMessageStart', 'TextMessageEnd', 'ToolCallStart', 'ToolCallResult', 'ApprovalRequested', 'ApprovalResolved',
  'ComandoUtenteIniziato', 'ComandoUtenteFinito']);

/** Token/output chunks do not invalidate an entire session summary. */
export function interessaSidebar(event) {
  if (!event || PASSIVE.has(event.type)) return false;
  if (IMPORTANT.has(event.type)) return true;
  if (event.type === 'StateDelta') return Array.isArray(event.delta) && event.delta.some(d =>
    d?.path === '/usage' || (typeof d?.path === 'string' && d.path.startsWith('/file/')));
  // Context accounting and queue updates can change the existing cumulative usage/counters.
  return event.type === 'CUSTOM' && ['talos.coda', 'talos.context', 'consumo-fornitore'].includes(event.name);
}

/**
 * No timers while nobody is subscribed. The caller supplies the *existing*
 * session serializer, so transport does not grow a second source of truth.
 */
export function creaFlussoSidebar({ ids, leggi, epoca = randomUUID(), pianifica = queueMicrotask } = {}) {
  if (typeof ids !== 'function' || typeof leggi !== 'function') throw new TypeError('Sidebar readers are required');
  const listeners = new Set();
  const dirty = new Set();
  let revision = 0;
  let scheduled = false, resourcesDirty = false;
  const envelope = (kind, body = {}) => ({ schema: SIDEBAR_SCHEMA, epoch: epoca, revision, kind, ...body });
  const deliver = (listener, value) => {
    try { listener(value); } catch { listeners.delete(listener); }
  };
  function flush() {
    scheduled = false;
    if (!dirty.size && !resourcesDirty) return;
    const resources = resourcesDirty; resourcesDirty = false;
    const changed = [...dirty];
    dirty.clear();
    if (!listeners.size) return;
    const items = [], removed = [];
    for (const id of changed) {
      const item = leggi(id);
      if (item) items.push(item); else removed.push(id);
    }
    revision += 1;
    const message = envelope('delta', { items, removed, ...(resources ? { resources: true } : {}) });
    for (const listener of [...listeners]) deliver(listener, message);
  }
  return Object.freeze({
    changed(id) {
      if (!listeners.size || typeof id !== 'string' || !id) return;
      dirty.add(id);
      if (!scheduled) { scheduled = true; pianifica(flush); }
    },
    resourcesChanged() {
      if (!listeners.size) return;
      resourcesDirty = true;
      if (!scheduled) { scheduled = true; pianifica(flush); }
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Sidebar listener is required');
      // Drain older updates before enrolling this subscriber; its snapshot is never
      // followed by a queued delta describing a state older than the snapshot.
      flush();
      const items = [...ids()].map(id => leggi(id)).filter(Boolean);
      listeners.add(listener);
      deliver(listener, envelope('snapshot', { items }));
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        listeners.delete(listener);
        if (!listeners.size) { dirty.clear(); resourcesDirty = false; }
      };
    },
    heartbeat: () => envelope('heartbeat'),
    get subscribers() { return listeners.size; },
  });
}

/**
 * SSE adapter isolated from routing/security policy. The route supplies its
 * normal headers and timer functions. Slow clients are disconnected rather than
 * accumulating an unbounded queue; their next snapshot repairs the gap.
 */
export function collegaFlussoSidebar({ response, subscribe, heartbeat, headers = {},
  setIntervalFn = setInterval, clearIntervalFn = clearInterval, head = false } = {}) {
  let stopped = false, unsubscribe = null, timer = null;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    unsubscribe?.();
    if (timer !== null) clearIntervalFn(timer);
    response.removeListener?.('close', stop);
  };
  const send = (message) => {
    if (stopped || response.destroyed || response.writableEnded) { stop(); return; }
    if (response.writableLength > SIDEBAR_MAX_BUFFER) { stop(); response.destroy(); return; }
    try { response.write(`data: ${JSON.stringify(message)}\n\n`); }
    catch { stop(); response.destroy(); }
  };
  response.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  if (head) { response.end(); return stop; }
  response.socket?.setNoDelay?.(true);
  response.once?.('close', stop);
  response.write('retry: 2000\n\n');
  try {
    unsubscribe = subscribe(send);
    // subscribe delivers synchronously and may discover a closed connection.
    if (stopped) { unsubscribe?.(); return stop; }
    timer = setIntervalFn(() => send(heartbeat()), SIDEBAR_HEARTBEAT_MS);
    timer?.unref?.();
  } catch { stop(); response.destroy(); }
  return stop;
}
