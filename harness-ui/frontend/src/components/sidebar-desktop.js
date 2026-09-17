/** Owns the single desktop SSE connection and the single sidebar clock. */
import { creaStatoSidebar, SIDEBAR_PREFS } from './sidebar-state.js';
import { creaVistaSidebar } from './sidebar-view.js';

export const SIDEBAR_STALE_MS = 45_000;
export const SIDEBAR_RETRY_MS = 2_000;
export const SIDEBAR_FALLBACK_MS = 15_000;

/** Network controller is injectable so reordering, stale fetches and cleanup are deterministic tests. */
export function creaControllerSidebar({ state, openStream, fetchList, onChange = () => {}, onFacts = () => {},
  now = () => performance.now(), wallNow = Date.now, onClock = () => {},
  setIntervalFn = setInterval, clearIntervalFn = clearInterval, fetchTimeoutMs = 10_000 } = {}) {
  let source = null, streamGeneration = 0, stopped = false, lastMessage = now(), nextConnect = 0;
  let lastFallback = -Infinity, pendingFetch = null, fetchStarted = 0, abort = null, requestGeneration = 0;
  let online = true;
  const status = next => {
    if (state.freshness === next) return;
    state.connection(next); onChange({ connection: true });
  };
  function disconnect() {
    streamGeneration++;
    if (source) { source.onopen = null; source.onmessage = null; source.onerror = null; source.close(); source = null; }
  }
  function deliver(result) {
    if (!result?.accepted || result.heartbeat) return;
    onFacts([...state.rows.values()], result);
    onChange(result.snapshot ? { ...result, connection: true } : result);
  }
  function connect() {
    if (stopped || !online) return;
    disconnect();
    status(state.loaded ? 'riconnessione' : 'connessione');
    const generation = streamGeneration;
    lastMessage = now(); nextConnect = 0;
    try { source = openStream(); }
    catch { source = null; status('stale'); nextConnect = now() + SIDEBAR_RETRY_MS; void refresh(); return; }
    if (!source) { status('stale'); nextConnect = now() + SIDEBAR_FALLBACK_MS; void refresh(); return; }
    source.onopen = () => {
      if (stopped || generation !== streamGeneration) return;
      // EventSource may reconnect automatically. An open socket alone is not a synchronized list.
      status(state.loaded ? 'riconnessione' : 'connessione'); lastMessage = now();
    };
    source.onmessage = message => {
      if (stopped || generation !== streamGeneration) return;
      let data;
      try { data = JSON.parse(message.data); } catch { invalid(); return; }
      const result = state.apply(data);
      if (result.invalid) { invalid(); return; }
      if (result.accepted) { lastMessage = now(); deliver(result); }
    };
    source.onerror = () => {
      if (stopped || generation !== streamGeneration) return;
      status(online ? 'riconnessione' : 'offline');
      if (source?.readyState === 2) { disconnect(); nextConnect = now() + SIDEBAR_RETRY_MS; }
      void refresh();
    };
  }
  function invalid() {
    status('stale'); disconnect(); nextConnect = now() + SIDEBAR_RETRY_MS; void refresh();
  }
  function refresh({ force = false } = {}) {
    if (stopped) return Promise.resolve();
    if (state.synced && !force) {
      // Selection/current-session changes do not require a second network request.
      onFacts([...state.rows.values()], { context: true }); onChange({ context: true });
      return Promise.resolve();
    }
    if (pendingFetch) return pendingFetch;
    const startedGeneration = state.generation, request = ++requestGeneration;
    abort = new AbortController(); fetchStarted = now(); lastFallback = now();
    const signal = abort.signal;
    pendingFetch = Promise.resolve().then(() => fetchList(signal)).then(items => {
      if (stopped || request !== requestGeneration || signal.aborted) return;
      const result = state.applyRest(items, startedGeneration);
      if (result.invalid) { status(state.loaded ? 'stale' : 'errore'); return; }
      deliver(result);
    }).catch(() => {
      if (!stopped && request === requestGeneration && !state.synced) status(online ? state.loaded ? 'stale' : 'errore' : 'offline');
    }).finally(() => { if (request === requestGeneration) { pendingFetch = null; abort = null; } });
    return pendingFetch;
  }
  const tick = () => {
    if (stopped) return;
    if (pendingFetch && now() - fetchStarted > fetchTimeoutMs) {
      abort?.abort(); requestGeneration++; pendingFetch = null; abort = null;
      if (!state.synced) status(online ? state.loaded ? 'stale' : 'errore' : 'offline');
    }
    if (online && source && now() - lastMessage > SIDEBAR_STALE_MS) invalid();
    if (online && !source && nextConnect && now() >= nextConnect) connect();
    if (online && !state.synced && now() - lastFallback >= SIDEBAR_FALLBACK_MS) void refresh();
    onClock(wallNow());
  };
  const timer = setIntervalFn(tick, 1000);
  connect(); void refresh();
  return {
    refresh,
    retry() { if (stopped) return; online = true; connect(); void refresh({ force: true }); },
    online(value) {
      online = Boolean(value);
      if (!online) { disconnect(); status('offline'); abort?.abort(); }
      else { connect(); void refresh(); }
    },
    destroy() {
      if (stopped) return; stopped = true; requestGeneration++;
      disconnect(); abort?.abort(); pendingFetch = null; clearIntervalFn(timer);
    },
  };
}

export function montaSidebarDesktop({ root, section, search, apiUrl, apiGet, normalize, getContext,
  onFacts, onOpen, onMenu, onToggle, onPending } = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  let prefs = null;
  try { prefs = win.localStorage.getItem(SIDEBAR_PREFS); } catch { /* Storage denial must not block navigation. */ }
  const state = creaStatoSidebar({ preferences: prefs, normalize });
  let savedPreferences = prefs, savedGeneration = -1, savedFilter = null;
  const save = () => {
    if (savedGeneration === state.preferenceGeneration && savedFilter === state.local.filter) return;
    savedGeneration = state.preferenceGeneration; savedFilter = state.local.filter;
    const value = state.preferences();
    if (value === savedPreferences) return;
    try { win.localStorage.setItem(SIDEBAR_PREFS, value); savedPreferences = value; } catch { /* In-memory preferences still work. */ }
  };
  let view, controller;
  const context = () => {
    const current = getContext();
    if (current.current && state.markRead(current.current)) save();
    return current;
  };
  view = creaVistaSidebar({ root, section, search, state, getContext: context,
    onOpen: row => { state.markRead(row.sessionId); save(); onOpen(row); view.sync({ changed: new Set([row.sessionId]) }); },
    onMenu: (row, anchor, event, keyboard, onClose) => onMenu(row, {
      sidebar: true, anchor, event, keyboard, onClose,
      pin: { pinned: state.local.pinned.has(row.sessionId), toggle() { state.togglePin(row.sessionId); save(); view.sync({ structure: true, changed: new Set([row.sessionId]) }); } },
    }),
    onToggle: (id, checked) => { onToggle(id, checked); view.sync({ context: true }); },
    onPending, onRetry: () => controller?.retry(), onPreferences: save,
  });
  controller = creaControllerSidebar({ state,
    openStream: () => typeof win.EventSource === 'function' ? new win.EventSource(apiUrl('/api/v1/sidebar/events')) : null,
    fetchList: async signal => { const result = await apiGet('/api/v1/sessions', { signal }); return result?.items; },
    onFacts,
    onChange: result => { view.sync(result); if (state.synced) save(); }, onClock: () => view.tick(),
    now: () => win.performance.now(), wallNow: () => Date.now(),
    setIntervalFn: (fn, ms) => win.setInterval(fn, ms), clearIntervalFn: id => win.clearInterval(id),
  });
  const offline = () => controller.online(false), online = () => controller.online(true);
  const visibility = () => { if (doc.visibilityState !== 'hidden') { view.sync({ connection: true, filter: true }); view.tick(); } };
  win.addEventListener('offline', offline); win.addEventListener('online', online); doc.addEventListener('visibilitychange', visibility);
  if (win.navigator.onLine === false) offline();
  return {
    refresh: controller.refresh,
    sync() { view.sync({ context: true }); },
    destroy() { controller.destroy(); view.destroy(); win.removeEventListener('offline', offline); win.removeEventListener('online', online); doc.removeEventListener('visibilitychange', visibility); },
  };
}
