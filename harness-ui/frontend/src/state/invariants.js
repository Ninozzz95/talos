const REQUIRED_SLICES = Object.freeze([
  'runtime', 'layout', 'projects', 'sessions', 'conversation', 'execution',
  'approvals', 'review', 'files', 'terminal', 'browser', 'automations',
  'modelLab', 'settings', 'extensions', 'notifications',
]);

const RUNTIME_PHASES = new Set(['booting', 'ready-empty', 'ready-active', 'degraded', 'offline']);
const EXECUTION_STATES = new Set(['idle', 'running', 'stopping', 'failed', 'completed']);
function assertPlainState(value, path, seen) {
  if (value === null) return;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return;
  if (valueType === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`numero non finito vietato nello stato: ${path}`);
    return;
  }
  if (valueType !== 'object') throw new TypeError(`valore non serializzabile vietato nello stato: ${path}`);
  if (seen.has(value)) throw new TypeError(`ciclo vietato nello stato: ${path}`);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new TypeError(`oggetto non semplice vietato nello stato: ${path}`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key))) {
        throw new TypeError(`proprietà array non serializzabile vietata nello stato: ${path}`);
      }
    }
    value.forEach((item, index) => assertPlainState(item, `${path}[${index}]`, seen));
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') throw new TypeError(`proprietà simbolo vietata nello stato: ${path}`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`proprietà non semplice vietata nello stato: ${path}.${key}`);
      assertPlainState(descriptor.value, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

export function assertStateInvariants(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('stato applicativo non valido');
  for (const slice of REQUIRED_SLICES) {
    if (!Object.hasOwn(state, slice)) throw new TypeError(`slice mancante: ${slice}`);
  }
  if (!RUNTIME_PHASES.has(state.runtime.phase)) throw new TypeError(`fase runtime non valida: ${state.runtime.phase}`);
  if (!EXECUTION_STATES.has(state.execution.status)) throw new TypeError(`stato esecuzione non valido: ${state.execution.status}`);
  if (!Number.isSafeInteger(state.sessions.generation) || state.sessions.generation < 0) throw new TypeError('generazione sessione non valida');
  if (!Array.isArray(state.sessions.items)) throw new TypeError('elenco sessioni non valido');

  const activeId = state.sessions.activeId;
  if (activeId !== null && (typeof activeId !== 'string' || !state.sessions.items.some((session) => session?.id === activeId))) {
    throw new TypeError('la sessione attiva deve appartenere all’elenco sessioni');
  }
  if (state.runtime.phase === 'ready-active' && (typeof activeId !== 'string' || activeId.length === 0)) {
    throw new TypeError('ready-active richiede una sessione attiva');
  }
  if (state.runtime.phase === 'ready-empty') {
    if (activeId !== null) throw new TypeError('ready-empty vieta una sessione attiva');
    if (state.execution.status !== 'idle') throw new TypeError('ready-empty non può eseguire un run');
  }
  if (state.execution.status === 'running' && (typeof activeId !== 'string' || activeId.length === 0)) {
    throw new TypeError('un run richiede una sessione attiva');
  }
  if (state.review.activePath !== null && !state.review.order.includes(state.review.activePath)) {
    throw new TypeError('il file review attivo deve appartenere all’ordine review');
  }
  if (state.terminal.activeId !== null && !state.terminal.tabs.some((tab) => tab?.id === state.terminal.activeId)) {
    throw new TypeError('il terminale attivo deve appartenere alle tab');
  }
  for (const [id, approval] of Object.entries(state.approvals.pending)) {
    if (approval?.id !== id) throw new TypeError(`identità approvazione incoerente: ${id}`);
  }
  assertPlainState(state, 'state', new WeakSet());
  return state;
}
