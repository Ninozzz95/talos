import { createHash, randomUUID } from 'node:crypto';
import { parseContextSettings, ContextEngineError } from '../../context-engine/src/contracts.mjs';
import { importLegacySession } from '../../context-engine/src/node/legacy-import.mjs';

const fail = (code, message) => { throw new ContextEngineError(message, code); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal = new Set(['committed', 'failed', 'cancelled']);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !value.includes('\0');

/** Desktop ownership and transport adaptation; archive paths and model credentials
 * never originate in the HTTP request. Every durable mutation has a receipt. */
export function createDesktopContextService({ engine, store, loadLegacy, resolveSessionModel, isSessionEnabled, readSession, onEvent, runInference, clock = () => new Date().toISOString() }) {
  if (!engine || !store || typeof readSession !== 'function' || typeof resolveSessionModel !== 'function' || typeof isSessionEnabled !== 'function') fail('CTX_PORT_MISSING', 'Servizi desktop del contesto incompleti.');
  const queues = new Map();
  const deliveries = new Map();
  const ownedJobs = new Map();
  let closed = false;
  function serial(sessionId, task) {
    const previous = queues.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    queues.set(sessionId, next);
    next.finally(() => { if (queues.get(sessionId) === next) queues.delete(sessionId); }).catch(() => {});
    return next;
  }
  async function ensure(sessionId) {
    if (closed) fail('CTX_SERVICE_CLOSED', 'Il servizio del contesto è chiuso.');
    if (!validId(sessionId) || !await readSession(sessionId)) fail('CTX_SESSION_NOT_FOUND', 'Conversazione non trovata.');
    if (!await isSessionEnabled(sessionId)) fail('CTX_NOT_ENABLED', 'Il motore del contesto non è attivo per questa conversazione di prova.');
    let snapshot = await store.readContextSnapshot({ sessionId });
    if (!snapshot) {
      const jsonl = await loadLegacy?.({ sessionId });
      snapshot = jsonl ? await importLegacySession({ sessionId, jsonl, settings: parseContextSettings({}), metadata: {} }, { store }) : await store.initSession({ sessionId, settings: parseContextSettings({}) });
    }
    return snapshot;
  }
  async function allRecords(sessionId) {
    const records = []; let afterSequence = 0;
    for (;;) {
      const page = await store.readOriginals({ sessionId, afterSequence, limit: 1000 });
      records.push(...page);
      if (page.length < 1000) return records;
      afterSequence = page.at(-1).sequence;
    }
  }
  function deliver(sessionId) {
    if (!onEvent) return Promise.resolve();
    if (deliveries.has(sessionId)) return deliveries.get(sessionId);
    const pending = (async () => {
      for (;;) {
        const events = await store.readContextOutbox({ sessionId });
        if (!events.length) return;
        for (const event of events) {
          await onEvent({ sessionId, event });
          await store.ackContextEvent({ sessionId, eventId: event.id });
        }
      }
    })();
    deliveries.set(sessionId, pending);
    pending.finally(() => { if (deliveries.get(sessionId) === pending) deliveries.delete(sessionId); }).catch(() => {});
    return pending;
  }
  async function modelFor(sessionId) { return resolveSessionModel({ sessionId, session: await readSession(sessionId) }); }
  function common(body, fields = []) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['expectedRevision', 'idempotencyKey', ...fields].includes(k))) fail('CTX_INVALID_INPUT', 'Richiesta del contesto non valida.');
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || !validId(body.idempotencyKey)) fail('CTX_INVALID_INPUT', 'Revisione e identità della richiesta sono necessarie.');
  }
  async function mutation(sessionId, method, path, body, operation, args) {
    const requestFingerprint = digest({ method, path, body });
    return store[operation]({ ...args, sessionId, idempotencyKey: body.idempotencyKey, requestFingerprint });
  }
  const api = {
    async createKernelHooks({ sessionId, runId }) {
      if (!await isSessionEnabled(sessionId)) return undefined;
      if (!validId(runId)) fail('CTX_INVALID_INPUT', 'Identità del giro non valida.');
      await serial(sessionId, () => ensure(sessionId));
      return Object.freeze({
        capture: ({ messages }) => api.syncOriginals({ sessionId, messages }),
        prepare: ({ messages, tools, signal }) => api.prepare({ sessionId, messages, tools, signal }),
        infer: ({ signal }, operation) => runInference ? runInference({ sessionId, priority: 'chat', signal }, operation) : operation(signal),
        captureProviderResponse: async ({ response, giro }) => {
          if (!response || typeof response !== 'object' || !Number.isSafeInteger(giro) || giro < 0) fail('CTX_INVALID_INPUT', 'Risposta del modello non archiviabile.');
          const bytes = Buffer.from(JSON.stringify({ schema: 'talos.context.provider-response.v1', runId, giro, response }), 'utf8');
          return serial(sessionId, async () => {
            await ensure(sessionId);
            return store.putBlob({ sessionId, id: `provider-response-${digest({ runId, giro })}`, bytes, mimeType: 'application/json' });
          });
        },
      });
    },
    async compact({ sessionId, messages }) {
      if (!await isSessionEnabled(sessionId)) return undefined;
      const session = await readSession(sessionId);
      if (Array.isArray(messages) && session?.conclusa !== false) await api.syncOriginals({ sessionId, messages });
      const snapshot = await serial(sessionId, () => ensure(sessionId));
      const { job } = await api.request({ sessionId, method: 'POST', path: '/jobs', body: { kind: 'compact', expectedRevision: snapshot.revision, idempotencyKey: randomUUID() } });
      const finished = await engine.waitForCompaction({ sessionId, jobId: job.id });
      await deliver(sessionId);
      return { ok: true, compattato: finished.state === 'committed', jobId: job.id, ...(finished.error ? { error: finished.error } : {}) };
    },
    async request({ sessionId, method, path = '/', body, signal }) {
      signal?.throwIfAborted();
      let snapshot = await serial(sessionId, () => ensure(sessionId));
      path = path.replace(/\/$/u, '') || '/';
      if (method === 'GET') {
        if (path === '/') { await deliver(sessionId); return { ...snapshot, usage: await store.readUsage({ sessionId }), semanticStatus: 'not-qualified' }; }
        if (path === '/versions') return { versions: await engine.listContextVersions({ sessionId }) };
        if (path === '/facts') return { facts: snapshot.facts };
        if (path === '/export') return engine.exportContext({ sessionId });
        let match = /^\/jobs\/([^/]+)$/u.exec(path);
        if (match) {
          const job = await store.readContextJob({ sessionId, jobId: match[1] });
          if (!job) fail('CTX_JOB_NOT_FOUND', 'Compattazione non trovata.');
          await deliver(sessionId); return { job };
        }
        match = /^\/sources\/([^/]+)$/u.exec(path);
        if (match) return { source: await engine.readContextSource({ sessionId, sourceId: match[1] }) };
        fail('CTX_ROUTE_NOT_FOUND', 'Operazione del contesto non trovata.');
      }
      const fields = path === '/settings' ? ['patch'] : path === '/jobs' ? ['kind'] : path.endsWith('/resolve') ? ['accept'] : path.startsWith('/facts') ? ['fact'] : [];
      common(body, fields);
      const requestFingerprint = digest({ method, path, body });
      const receipt = await store.readContextMutation({ sessionId, idempotencyKey: body.idempotencyKey, requestFingerprint });
      const wrap = result => path.startsWith('/facts') ? { fact: result } : path.startsWith('/versions') ? { version: result } : path.startsWith('/jobs') ? { job: result } : result;
      if (receipt) return wrap(receipt.result);
      if (method === 'POST' && path === '/jobs') {
        const existing = snapshot.jobs.find(job => job.idempotencyKey === body.idempotencyKey);
        if (existing) return { job: await engine.startCompaction({ sessionId, idempotencyKey: body.idempotencyKey, kind: body.kind ?? 'compact', sessionModel: await modelFor(sessionId) }) };
      }
      if (snapshot.revision !== body.expectedRevision) fail('CTX_STALE_REVISION', 'La conversazione è cambiata. Aggiorna il pannello prima di modificare il contesto.');
      signal?.throwIfAborted();
      if (method === 'PATCH' && path === '/settings') {
        const settings = parseContextSettings({ ...snapshot.settings, ...body.patch });
        return mutation(sessionId, method, path, body, 'updateSessionSettings', { settings, expectedRevision: body.expectedRevision });
      }
      if (method === 'POST' && path === '/jobs') {
        if (!['compact', 'regenerate'].includes(body.kind ?? 'compact')) fail('CTX_INVALID_INPUT', 'Tipo di compattazione non valido.');
        const job = await engine.startCompaction({ sessionId, idempotencyKey: body.idempotencyKey, kind: body.kind ?? 'compact', sessionModel: await modelFor(sessionId) });
        ownedJobs.set(`${sessionId}:${job.id}`, { sessionId, jobId: job.id });
        return { job };
      }
      let match = /^\/jobs\/([^/]+)(\/resume)?$/u.exec(path);
      if (match && (method === 'DELETE' && !match[2] || method === 'POST' && match[2])) {
        const jobId = match[1];
        const job = method === 'DELETE' ? await engine.cancelCompaction({ sessionId, jobId }) : await engine.resumeCompaction({ sessionId, jobId, sessionModel: await modelFor(sessionId) });
        const result = await mutation(sessionId, method, path, body, 'saveJobProgress', { job });
        return { job: result };
      }
      match = /^\/versions\/([^/]+)\/restore$/u.exec(path);
      if (method === 'POST' && match) {
        const version = await mutation(sessionId, method, path, body, 'restoreContextVersion', { versionId: match[1], expectedRevision: body.expectedRevision, newVersionId: randomUUID(), createdAt: clock() });
        await deliver(sessionId); return { version };
      }
      match = /^\/facts(?:\/([^/]+))?(\/resolve)?$/u.exec(path);
      if (match) {
        const factId = match[1];
        if (method === 'DELETE' && factId && !match[2]) return { fact: await mutation(sessionId, method, path, body, 'removeProtectedFact', { factId, expectedRevision: body.expectedRevision }) };
        let input = body.fact;
        const prior = snapshot.facts.find(f => f.id === factId || f.id === input?.id);
        if (method === 'POST' && match[2]) {
          if (typeof body.accept !== 'boolean' || prior?.status !== 'conflict') fail('CTX_FACT_CONFLICT_NOT_FOUND', 'Nessun conflitto da risolvere.');
          input = { id: factId, text: body.accept ? prior.conflict.proposedText : prior.text, sources: body.accept ? prior.conflict.sources : prior.sources };
        } else if (!(method === 'POST' && !factId || method === 'PATCH' && factId)) fail('CTX_ROUTE_NOT_FOUND', 'Operazione del contesto non trovata.');
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['id', 'text', 'sources'].includes(k)) || (factId && input.id && input.id !== factId)) fail('CTX_INVALID_INPUT', 'Informazione protetta non valida.');
        const fact = { id: factId ?? input.id ?? randomUUID(), text: input.text, sources: input.sources ?? [], status: 'active', revision: (prior?.revision ?? 0) + 1 };
        return { fact: await mutation(sessionId, method, path, body, 'upsertProtectedFact', { fact, expectedRevision: body.expectedRevision }) };
      }
      fail('CTX_ROUTE_NOT_FOUND', 'Operazione del contesto non trovata.');
    },
    syncOriginals({ sessionId, messages }) {
      return serial(sessionId, async () => {
        const snapshot = await ensure(sessionId);
        if (!Array.isArray(messages)) fail('CTX_INVALID_INPUT', 'Cronologia non valida.');
        const saved = await allRecords(sessionId);
        if (messages.length < saved.length || saved.some((record, index) => record.sha256 !== digest(messages[index]))) fail('CTX_HISTORY_DIVERGED', 'La cronologia attiva differisce dall’archivio. Gli originali sono conservati; occorre recuperare la versione completa.');
        const records = messages.slice(saved.length).map((message, offset) => ({ id: `message-${saved.length + offset + 1}`, message, createdAt: clock(), origin: 'desktop-kernel' }));
        if (records.length) await store.appendOriginalBatch({ sessionId, records, expectedRevision: snapshot.revision });
        return store.readContextSnapshot({ sessionId });
      });
    },
    async prepare({ sessionId, messages, tools, signal }) {
      await api.syncOriginals({ sessionId, messages });
      const result = await engine.prepareForRequest({ sessionId, tools, sessionModel: await modelFor(sessionId), signal });
      await deliver(sessionId);
      return result;
    },
    async append({ sessionId, record }) { await serial(sessionId, () => ensure(sessionId)); return engine.appendOriginal({ sessionId, record }); },
    async close() {
      if (closed) return;
      closed = true;
      await Promise.allSettled([...queues.values()]);
      await Promise.allSettled([...deliveries.values()]);
      for (const options of ownedJobs.values()) {
        const job = await store.readContextJob(options);
        if (job && !terminal.has(job.state)) await engine.cancelCompaction(options);
        await engine.waitForCompaction(options);
      }
      ownedJobs.clear();
    },
  };
  return Object.freeze(api);
}
