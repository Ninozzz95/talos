/** Fetch is the transport; the session-scoped TCEC v1 JSON contract stays intact.
 * W3C Fetch / MDN Using Fetch, verified 2026-09-09. No implicit write retries.
 */
function fault(code, message, status) { return Object.assign(new Error(message), { code, status }); }
function segment(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || value === '.' || value === '..') throw fault('CTX_INVALID_ARGUMENT', 'Identificatore del contesto non valido.');
  return encodeURIComponent(value);
}

export function createContextClient({ fetchFn = globalThis.fetch, baseURL = '/api/v1', headers = {}, signal: defaultSignal } = {}) {
  async function request(options, suffix = '', method = 'GET', payload) {
    const url = `${baseURL.replace(/\/$/, '')}/sessions/${segment(options.sessionId)}/context${suffix}`;
    let response;
    try {
      response = await fetchFn(url, { method, credentials: 'same-origin', signal: options.signal ?? defaultSignal,
        headers: { ...headers, Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {}) });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw fault('CTX_NETWORK_ERROR', 'Connessione al contesto interrotta. Riprova con Aggiorna.');
    }
    let data;
    try { data = await response.json(); } catch { throw fault('CTX_INVALID_RESPONSE', 'Il server non ha restituito un contesto leggibile.', response.status); }
    if (!response.ok || data?.error) throw fault(data?.error?.code || 'CTX_HTTP_ERROR', data?.error?.message || 'Operazione sul contesto non riuscita.', response.status);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw fault('CTX_INVALID_RESPONSE', 'Risposta del contesto non valida.', response.status);
    return data;
  }
  const mutation = (o, body = {}) => ({ ...body, expectedRevision: o.expectedRevision, idempotencyKey: o.idempotencyKey ?? globalThis.crypto.randomUUID() });
  return Object.freeze({
    getContextState: o => request(o),
    updateContextSettings: o => request(o, '/settings', 'PATCH', mutation(o, { patch: o.patch })),
    startCompaction: o => request(o, '/jobs', 'POST', mutation(o, { kind: o.kind ?? 'compact' })),
    getContextJob: o => request(o, `/jobs/${segment(o.jobId)}`),
    cancelCompaction: o => request(o, `/jobs/${segment(o.jobId)}`, 'DELETE', mutation(o)),
    resumeCompaction: o => request(o, `/jobs/${segment(o.jobId)}/resume`, 'POST', mutation(o)),
    listContextVersions: o => request(o, '/versions'),
    restoreContextVersion: o => request(o, `/versions/${segment(o.versionId)}/restore`, 'POST', mutation(o)),
    listProtectedFacts: o => request(o, '/facts'),
    upsertProtectedFact: o => request(o, o.fact?.id ? `/facts/${segment(o.fact.id)}` : '/facts', o.fact?.id ? 'PATCH' : 'POST', mutation(o, { fact: o.fact })),
    removeProtectedFact: o => request(o, `/facts/${segment(o.factId)}`, 'DELETE', mutation(o)),
    resolveFactConflict: o => request(o, `/facts/${segment(o.factId)}/resolve`, 'POST', mutation(o, { accept: o.accept })),
    readContextSource: o => request(o, `/sources/${segment(o.sourceId)}`),
  });
}
