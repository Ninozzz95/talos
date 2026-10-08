import { createHash, randomUUID } from 'node:crypto';
import { parseContextSettings, ContextEngineError } from '../../context-engine/src/contracts.mjs';
import { importLegacySession } from '../../context-engine/src/node/legacy-import.mjs';

const fail = (code, message) => { throw new ContextEngineError(message, code); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal = new Set(['committed', 'failed', 'cancelled']);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !value.includes('\0');

/** Desktop ownership and transport adaptation; archive paths and model credentials
 * never originate in the HTTP request. Every durable mutation has a receipt. */
export function createDesktopContextService({ engine, store, loadLegacy, resolveSessionModel, isSessionEnabled, readSession, onEvent, runInference, registraAncora, clock = () => new Date().toISOString() }) {
  if (!engine || !store || typeof readSession !== 'function' || typeof resolveSessionModel !== 'function' || typeof isSessionEnabled !== 'function') fail('CTX_PORT_MISSING', 'Incomplete desktop context services.');
  const queues = new Map();
  const deliveries = new Map();
  const ownedJobs = new Map();
  /* 24/09 — F4: l'ultima proiezione preparata per sessione (ciò che è andato al modello) è la base
     dell'ancora del fornitore: `captureProviderResponse` la sposa con `usage.prompt_tokens`. */
  const ultimeProiezioni = new Map();
  /* 24/09 — F4: le sessioni per cui questo processo ha già cercato job orfani (basta una volta: in
     questo processo un job attivo è sempre nella mappa `running` del motore). */
  const recuperate = new Set();
  /* P18: per sessione, le impronte dei record gia' verificati e la revisione dell'archivio che le ha prodotte. */
  const impronteVerificate = new Map();
  let closed = false;
  function serial(sessionId, task) {
    const previous = queues.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    queues.set(sessionId, next);
    next.finally(() => { if (queues.get(sessionId) === next) queues.delete(sessionId); }).catch(() => {});
    return next;
  }
  async function ensure(sessionId) {
    if (closed) fail('CTX_SERVICE_CLOSED', 'The context service is closed.');
    if (!validId(sessionId) || !await readSession(sessionId)) fail('CTX_SESSION_NOT_FOUND', 'Conversation not found.');
    if (!await isSessionEnabled(sessionId)) fail('CTX_NOT_ENABLED', 'The context engine is not active for this trial conversation.');
    let snapshot = await store.readContextSnapshot({ sessionId });
    if (!snapshot) {
      const jsonl = await loadLegacy?.({ sessionId });
      snapshot = jsonl ? await importLegacySession({ sessionId, jsonl, settings: parseContextSettings({}), metadata: {} }, { store }) : await store.initSession({ sessionId, settings: parseContextSettings({}) });
    } else if (!recuperate.has(sessionId) && typeof engine.recoverInterruptedJobs === 'function') {
      /*
       * 24/09/2026 — F4, CTX-RESTART-ACTIVE-JOB-RECOVERY: al primo tocco della sessione in questo processo un job
       * lasciato «in corso» da un processo morto viene dichiarato interrotto (`paused` + `CTX_JOB_INTERRUPTED`,
       * vedi `engine.mjs::recoverInterrupted`), così il pannello non mostra un avanzamento che non avanza e la
       * sessione può compattare di nuovo. Prima di oggi `GET /` rileggeva la riga com'era, per sempre.
       */
      snapshot = await engine.recoverInterruptedJobs({ sessionId });
      recuperate.add(sessionId);
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
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['expectedRevision', 'idempotencyKey', ...fields].includes(k))) fail('CTX_INVALID_INPUT', 'Invalid context request.');
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || !validId(body.idempotencyKey)) fail('CTX_INVALID_INPUT', 'The revision and the identity of the request are required.');
  }
  async function mutation(sessionId, method, path, body, operation, args) {
    const requestFingerprint = digest({ method, path, body });
    return store[operation]({ ...args, sessionId, idempotencyKey: body.idempotencyKey, requestFingerprint });
  }
  const api = {
    async createKernelHooks({ sessionId, runId }) {
      if (!await isSessionEnabled(sessionId)) return undefined;
      if (!validId(runId)) fail('CTX_INVALID_INPUT', 'Invalid turn identity.');
      await serial(sessionId, () => ensure(sessionId));
      return Object.freeze({
        capture: ({ messages }) => api.syncOriginals({ sessionId, messages }),
        /* 24/09 — F4, contratto con l'adapter (F1): `messages` = proiezione corretta, `originali` = grezzo. */
        prepare: ({ messages, originali, tools, signal }) => api.prepare({ sessionId, messages, originali, tools, signal }),
        infer: ({ signal }, operation) => runInference ? runInference({ sessionId, priority: 'chat', signal }, operation) : operation(signal),
        captureProviderResponse: async ({ response, giro, usage }) => {
          if (!response || typeof response !== 'object' || !Number.isSafeInteger(giro) || giro < 0) fail('CTX_INVALID_INPUT', 'The model response cannot be archived.');
          const bytes = Buffer.from(JSON.stringify({ schema: 'talos.context.provider-response.v1', runId, giro, response }), 'utf8');
          return serial(sessionId, async () => {
            await ensure(sessionId);
            const receipt = await store.putBlob({ sessionId, id: `provider-response-${digest({ runId, giro })}`, bytes, mimeType: 'application/json' });
            /*
             * 24/09/2026 — F4, punto 5: il numero VERO del fornitore (`usage.prompt_tokens`) diventa l'ancora della
             * misura successiva, sposato alla proiezione appena inviata; il contatore separato (una chiamata in più,
             * e per OpenRouter una stima) si usa solo quando il prefisso non combacia. Come Hermes
             * `agent/usage_anchor.py:46-60`. ⛔ Il kernel oggi passa `{ response, giro }` senza `usage`
             * (`talosHarness.mjs:8281`): finché quella riga non porta `usage`, qui non arriva nulla e si conta come prima.
             */
            if (registraAncora && usage && typeof usage === 'object' && ultimeProiezioni.has(sessionId)) {
              const profile = await modelFor(sessionId);
              registraAncora({ provider: profile.provider, model: profile.model, messages: ultimeProiezioni.get(sessionId), usage });
            }
            return receipt;
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
          if (!job) fail('CTX_JOB_NOT_FOUND', 'Compaction not found.');
          await deliver(sessionId); return { job };
        }
        match = /^\/sources\/([^/]+)$/u.exec(path);
        if (match) return { source: await engine.readContextSource({ sessionId, sourceId: match[1] }) };
        fail('CTX_ROUTE_NOT_FOUND', 'Context operation not found.');
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
      if (snapshot.revision !== body.expectedRevision) fail('CTX_STALE_REVISION', 'The conversation has changed. Refresh the panel before changing the context.');
      signal?.throwIfAborted();
      if (method === 'PATCH' && path === '/settings') {
        const settings = parseContextSettings({ ...snapshot.settings, ...body.patch });
        return mutation(sessionId, method, path, body, 'updateSessionSettings', { settings, expectedRevision: body.expectedRevision });
      }
      if (method === 'POST' && path === '/jobs') {
        if (!['compact', 'regenerate'].includes(body.kind ?? 'compact')) fail('CTX_INVALID_INPUT', 'Invalid compaction type.');
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
          if (typeof body.accept !== 'boolean' || prior?.status !== 'conflict') fail('CTX_FACT_CONFLICT_NOT_FOUND', 'No conflict to resolve.');
          input = { id: factId, text: body.accept ? prior.conflict.proposedText : prior.text, sources: body.accept ? prior.conflict.sources : prior.sources };
        } else if (!(method === 'POST' && !factId || method === 'PATCH' && factId)) fail('CTX_ROUTE_NOT_FOUND', 'Context operation not found.');
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['id', 'text', 'sources'].includes(k)) || (factId && input.id && input.id !== factId)) fail('CTX_INVALID_INPUT', 'Invalid protected information.');
        const fact = { id: factId ?? input.id ?? randomUUID(), text: input.text, sources: input.sources ?? [], status: 'active', revision: (prior?.revision ?? 0) + 1 };
        return { fact: await mutation(sessionId, method, path, body, 'upsertProtectedFact', { fact, expectedRevision: body.expectedRevision }) };
      }
      fail('CTX_ROUTE_NOT_FOUND', 'Context operation not found.');
    },
    /*
     * P18 (26/09/2026, patch approvata dall'owner via la lane CLI): l'archivio non si RILEGGE a ogni capture. Le
     * impronte dei record gia' verificati restano in memoria, legate alla revisione dell'archivio che le ha prodotte;
     * se la revisione e' ancora quella (nessun altro ha scritto: una compattazione la cambia), si usano quelle invece
     * di `allRecords` (misurato: ~25 ms a capture a 1.351 messaggi, cresce con la storia). Il confronto con OGNI
     * messaggio resta: la divergenza si scopre come prima.
     */
    syncOriginals({ sessionId, messages }) {
      return serial(sessionId, async () => {
        const snapshot = await ensure(sessionId);
        if (!Array.isArray(messages)) fail('CTX_INVALID_INPUT', 'Invalid history.');
        const noto = impronteVerificate.get(sessionId);
        const salvate = noto && Number.isInteger(snapshot?.revision) && noto.revision === snapshot.revision ? noto.impronte : (await allRecords(sessionId)).map((record) => record.sha256);
        if (messages.length < salvate.length || salvate.some((impronta, index) => impronta !== digest(messages[index]))) {
          impronteVerificate.delete(sessionId);
          fail('CTX_HISTORY_DIVERGED', 'The active history differs from the archive. The originals are kept; the full version must be recovered.');
        }
        const records = messages.slice(salvate.length).map((message, offset) => ({ id: `message-${salvate.length + offset + 1}`, message, createdAt: clock(), origin: 'desktop-kernel' }));
        if (records.length) await store.appendOriginalBatch({ sessionId, records, expectedRevision: snapshot.revision });
        const dopo = await store.readContextSnapshot({ sessionId });
        impronteVerificate.set(sessionId, { revision: dopo?.revision, impronte: [...salvate, ...records.map((record) => digest(record.message))] });
        return dopo;
      });
    },
    /*
     * 24/09/2026 — F4: ARCHIVIO ≠ PROIEZIONE (T1/T2 della ricognizione). L'adapter desktop corregge gli esiti
     * degli attrezzi PRIMA della richiesta; archiviare quella proiezione faceva divergere l'archivio (grezzo, da
     * `capture`) alla richiesta dopo: `CTX_HISTORY_DIVERGED` alla seconda richiesta, riprodotto dalla sonda T2.
     * Ora: si ARCHIVIA da `originali` quando c'è (ripiego: `messages`, come prima per chi non lo passa), si
     * PROIETTA e si RIASSUME da `messages`. Una proiezione non allineata (lunghezza o ruoli diversi) si rifiuta
     * prima di toccare l'archivio. Come Hermes (`hermes_state_messages.py:735-741`, clone `65ad529`) e Claude
     * Code (issue #26125, 16/02/2026: «The full transcript is preserved in transcript.jsonl on disk» mentre al
     * modello arrivano i «compacted summaries»): la trascrizione grezza e il contesto inviato sono due cose.
     */
    async prepare({ sessionId, messages, originali, tools, signal }) {
      let projection;
      if (originali !== undefined) {
        if (!Array.isArray(originali) || !Array.isArray(messages) || messages.length !== originali.length || messages.some((message, index) => message?.role !== originali[index]?.role)) fail('CTX_INVALID_INPUT', 'The request projection is not aligned with the originals (different length or roles).');
        projection = messages;
      }
      await api.syncOriginals({ sessionId, messages: originali === undefined ? messages : originali });
      let result;
      try { result = await engine.prepareForRequest({ sessionId, projection, tools, sessionModel: await modelFor(sessionId), signal }); }
      catch (error) {
        /* 25/09 — l'avviso «compattazione automatica in pausa» nasce anche quando la richiesta MUORE (contesto che non entra,
           riassunto rifiutato mentre si aspettava): senza questa consegna restava nella coda fino alla richiesta dopo. Una
           consegna fallita non copre l'errore vero della richiesta. */
        await deliver(sessionId).catch(() => {});
        throw error;
      }
      if (Array.isArray(result?.messages)) ultimeProiezioni.set(sessionId, result.messages);
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
