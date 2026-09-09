import { ContextEngineError, ContextJobV1, ContextVersionV1, TokenMeasurementV1, parseContextRecord, parseContextSettings } from './contracts.mjs';
import { computeContextBudget, planCompaction, selectClosedPrefix } from './compaction-planner.mjs';
import { buildSummaryRequest, validateSummary, composeActiveContext } from './summary.mjs';
import { chunkContextRecords, rankContextSources, selectContextEvidence } from './retrieval.mjs';

const terminal = new Set(['committed', 'cancelled', 'failed']);
const fail = (code, message) => { throw new ContextEngineError(message, code); };
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
const identity = profile => ({ provider: profile.provider, model: profile.model });
const sameModel = (a, b) => a?.provider === b?.provider && a?.model === b?.model;
const plainText = content => typeof content === 'string' ? content : Array.isArray(content) ? content.filter(p => ['text', 'input_text', 'output_text'].includes(p?.type) && typeof p.text === 'string').map(p => p.text).join('\n') : '';

/** The injected store owns durability; this controller owns candidate validity.
 * Inference never receives a context which failed its final measurement. */
export function createContextEngine({ store, model, tokenCounter, retrieval, embedding, toolCatalog, assets, usagePolicy, clock = () => new Date().toISOString(), idFactory = () => crypto.randomUUID() }) {
  if (!store || !model?.resolveModel || !model?.summarize || !tokenCounter?.countPreparedContext) fail('CTX_PORT_MISSING', 'Archivio, modello e contatore sono necessari.');
  const running = new Map();
  const key = (sessionId, jobId) => JSON.stringify([sessionId, jobId]);
  const state = async sessionId => {
    const snapshot = await store.readContextSnapshot({ sessionId });
    if (!snapshot) fail('CTX_SESSION_NOT_FOUND', 'Conversazione non presente nell’archivio del contesto.');
    return snapshot;
  };
  const originals = async (sessionId, throughSequence) => {
    const result = []; let afterSequence = 0;
    for (;;) {
      const page = await store.readOriginals({ sessionId, afterSequence, throughSequence, limit: 1000 });
      result.push(...page);
      if (page.length < 1000) return result;
      afterSequence = page.at(-1).sequence;
    }
  };
  const measure = async (messages, tools, profile, signal) => {
    signal?.throwIfAborted();
    const measurement = TokenMeasurementV1.parse(await tokenCounter.countPreparedContext({ messages, tools, model: profile, signal }));
    signal?.throwIfAborted();
    if (!sameModel(measurement, profile) || measurement.windowTokens !== profile.windowTokens || measurement.responseReserve !== profile.responseReserve) fail('CTX_MEASUREMENT_MISMATCH', 'Il conteggio non corrisponde al modello e alla riserva della richiesta.');
    return measurement;
  };
  const budgetFor = (measurement, settings) => computeContextBudget({ ...measurement, settings });
  function compiled(snapshot, records, { summary = snapshot.activeVersion?.summary, coveredThrough = snapshot.activeVersion?.coveredThrough ?? 0, evidence = [], targetModel } = {}) {
    const systemMessages = records.filter(r => ['system', 'developer'].includes(r.message.role)).map(r => r.message);
    const tailMessages = records.filter(r => r.sequence > coveredThrough && !['system', 'developer'].includes(r.message.role)).map(r => r.message);
    const messages = !summary && !snapshot.facts.some(f => f.status !== 'removed') && !evidence.length
      ? structuredClone([...systemMessages, ...tailMessages])
      : composeActiveContext({ systemMessages, summary: summary ?? null, facts: snapshot.facts, tailMessages, evidence });
    if (!model.prepareContext || !targetModel) return messages;
    const prepared = model.prepareContext({ messages, model: targetModel, reset: Boolean(summary) });
    if (!Array.isArray(prepared?.messages)) fail('CTX_PROVIDER_CONTEXT_INVALID', 'Il modello non ha preparato un contesto valido.');
    return prepared.messages;
  }
  async function save(job, patch) {
    const next = ContextJobV1.parse({ ...job, ...patch, updatedAt: clock() });
    return store.saveJobProgress({ sessionId: job.sessionId, job: next });
  }
  async function assertCurrent(job, signal) {
    signal?.throwIfAborted();
    const snapshot = await state(job.sessionId);
    if (snapshot.stateRevision !== job.baseStateRevision) fail('CTX_STALE_REVISION', 'Il contesto è cambiato durante la preparazione.');
    const current = await store.readContextJob({ sessionId: job.sessionId, jobId: job.id });
    if (current?.state === 'cancelled') fail('CTX_JOB_CANCELLED', 'Compattazione annullata.');
    return snapshot;
  }
  async function account(job, operationId, usage) {
    if (usage === undefined) return;
    await store.recordUsage({ sessionId: job.sessionId, jobId: job.id, operationId, usage });
    // The common session service deduplicates this same operation identity.
    await usagePolicy?.record?.({ sessionId: job.sessionId, jobId: job.id, operationId, usage });
  }
  async function execute(initial, { sessionModel, tools = [], signal }) {
    let job = initial;
    try {
      const snapshot = await assertCurrent(job, signal);
      const profile = await model.resolveModel({ sessionModel, settings: snapshot.settings });
      if (!sameModel(profile, job.model)) fail('CTX_MODEL_MISMATCH', 'Il modello di sintesi è cambiato.');
      const records = await originals(job.sessionId, job.coveredThrough);
      job = await save(job, { state: 'preparing' });
      // Plan only the immutable covered prefix; the final request reattaches the latest suffix.
      const planning = planCompaction(records, { ...profile, settings: snapshot.settings, retainRecentTurns: 0 });
      const segments = planning.segments;
      if (!segments.length) fail('CTX_NOTHING_TO_COMPACT', 'Non ci sono scambi completi da compattare.');
      job = await save(job, { state: 'summarizing', progress: { completed: job.completedSegments.length, total: Math.max(segments.length, job.completedSegments.length), phase: 'summarizing' } });
      const invoke = async (request, sourceRecords, label) => {
        await assertCurrent(job, signal);
        const measured = await measure(request.messages, [], profile, signal);
        if (!budgetFor(measured, snapshot.settings).fits) fail('CTX_SEGMENT_TOO_LARGE', 'Il segmento supera lo spazio del modello di sintesi.');
        const operationId = `${job.id}:${idFactory()}`;
        if (usagePolicy?.authorize && await usagePolicy.authorize({ sessionId: job.sessionId, model: profile, operationId, maxOutputTokens: profile.responseReserve, signal }) !== true) fail('CTX_USAGE_DENIED', 'Il servizio della sessione non autorizza questa sintesi.');
        let response;
        try { response = await model.summarize({ model: profile, messages: request.messages, maxOutputTokens: profile.responseReserve, signal, operationId }); }
        catch (error) { await account(job, operationId, error.usage); throw error; }
        await account(job, operationId, response.usage);
        signal?.throwIfAborted();
        return validateSummary(response, { records: sourceRecords });
      };
      const summaries = [];
      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];
        const fingerprint = await hash({ segment, profile, focus: snapshot.settings.focus });
        const prior = job.completedSegments.find(entry => entry.fingerprint === fingerprint);
        if (prior) { summaries.push(validateSummary({ text: JSON.stringify(prior.summary), finishReason: 'stop' }, { records })); continue; }
        const request = buildSummaryRequest({ segment, focus: snapshot.settings.focus });
        const measured = await measure(request.messages, [], profile, signal);
        if (!budgetFor(measured, snapshot.settings).fits) {
          if (segment.text.length < 512) fail('CTX_CONTEXT_TOO_SMALL', 'Istruzioni e segmento minimo non entrano nella finestra.');
          let midpoint = Math.floor(segment.text.length / 2);
          if (/[\uD800-\uDBFF]/u.test(segment.text[midpoint - 1])) midpoint--;
          segments.splice(index, 1, { ...segment, id: `${segment.id}.a`, text: segment.text.slice(0, midpoint) }, { ...segment, id: `${segment.id}.b`, text: segment.text.slice(midpoint) });
          index--; continue;
        }
        const summary = await invoke(request, records.filter(record => segment.sourceIds.includes(record.id)), segment.id);
        summaries.push(summary);
        job = await save(job, { completedSegments: [...job.completedSegments, { fingerprint, segmentId: segment.id, summary }], progress: { completed: job.completedSegments.length + 1, total: Math.max(segments.length, job.completedSegments.length + 1), phase: 'summarizing' } });
      }
      // Hierarchical reduction is measured at every level; no oversized merge is sent.
      let level = summaries;
      for (let depth = 0; level.length > 1; depth++) {
        if (depth >= 12) fail('CTX_NO_REDUCTION', 'La sintesi non riduce il contesto dopo i passaggi consentiti.');
        const next = [];
        for (let index = 0; index < level.length; index += 2) {
          if (index + 1 === level.length) { next.push(level[index]); continue; }
          const pair = level.slice(index, index + 2);
          const merged = await invoke(buildSummaryRequest({ summaries: pair, focus: snapshot.settings.focus }), records, `merge-${depth}-${index}`);
          if (JSON.stringify(merged).length >= JSON.stringify(pair).length) fail('CTX_NO_REDUCTION', 'La fusione non libera spazio.');
          next.push(merged);
        }
        level = next;
      }
      job = await save(job, { state: 'validating', progress: { ...job.progress, phase: 'validating' } });
      const latest = await assertCurrent(job, signal);
      const all = await originals(job.sessionId);
      if (selectClosedPrefix(all, { retainRecentTurns: 0 }).pendingCalls.length) fail('CTX_PENDING_TOOLS', 'Attendere i risultati degli strumenti prima della pubblicazione.');
      const summary = level[0];
      const active = compiled(latest, all, { summary, coveredThrough: job.coveredThrough, targetModel: sessionModel });
      const before = await measure(compiled(latest, all, { targetModel: sessionModel }), tools, sessionModel, signal);
      const measurement = await measure(active, tools, sessionModel, signal);
      const budget = budgetFor(measurement, latest.settings);
      if (!budget.fits || measurement.inputTokens >= before.inputTokens) fail('CTX_NO_REDUCTION', 'La sintesi non libera spazio sufficiente. La versione precedente rimane valida.');
      job = await save(job, { state: 'ready', progress: { ...job.progress, phase: 'ready' } });
      await assertCurrent(job, signal);
      const prefix = all.filter(record => record.sequence <= job.coveredThrough);
      const version = ContextVersionV1.parse({ schema: 'talos.context.version.v1', id: idFactory(), sessionId: job.sessionId, coveredThrough: job.coveredThrough, sourceIds: prefix.map(r => r.id), sourceHash: await hash(prefix.map(({ id, sha256 }) => ({ id, sha256 }))), summary, activeMessages: compiled(latest, prefix, { summary, coveredThrough: job.coveredThrough, targetModel: sessionModel }), model: job.model, measurement, createdAt: clock() });
      signal?.throwIfAborted();
      await store.commitContextVersion({ sessionId: job.sessionId, expectedRevision: latest.revision, expectedStateRevision: latest.stateRevision, jobId: job.id, version });
      return store.readContextJob({ sessionId: job.sessionId, jobId: job.id });
    } catch (error) {
      const current = await store.readContextJob({ sessionId: job.sessionId, jobId: job.id });
      if (current && terminal.has(current.state)) return current;
      const cancelled = signal?.aborted || error.code === 'CTX_JOB_CANCELLED';
      const paused = ['CTX_PENDING_TOOLS', 'CTX_USAGE_DENIED', 'CTX_RESOURCE_BUSY'].includes(error.code);
      return save(current ?? job, { state: cancelled ? 'cancelled' : paused ? 'paused' : 'failed', error: { code: cancelled ? 'CTX_JOB_CANCELLED' : error.code?.startsWith('CTX_') ? error.code : 'CTX_COMPACTION_FAILED', message: cancelled ? 'Compattazione annullata.' : error.code?.startsWith('CTX_') ? error.message : 'Preparazione del contesto non riuscita.' } });
    }
  }
  function launch(job, options) {
    const jobKey = key(job.sessionId, job.id);
    if (running.has(jobKey) || terminal.has(job.state)) return;
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const entry = { controller, promise: null, error: null };
    // Keep a handled result even when the persistence worker dies during failure reporting.
    entry.promise = Promise.resolve().then(() => execute(job, { ...options, signal: controller.signal })).catch(error => { entry.error = error; return null; }).finally(() => options.signal?.removeEventListener('abort', abort));
    running.set(jobKey, entry);
  }
  const api = {
    async appendOriginal({ sessionId, record }) {
      const parsed = parseContextRecord(record);
      await store.initSession({ sessionId, settings: parseContextSettings({}) });
      for (const id of parsed.assetRefs) if (!await store.readBlob({ sessionId, id })) fail('CTX_ASSET_MISSING', 'Conservare l’allegato prima di archiviare il messaggio.');
      return store.appendOriginalBatch({ sessionId, records: [parsed] });
    },
    async startCompaction({ sessionId, idempotencyKey, sessionModel, kind = 'compact', tools = [], signal }) {
      signal?.throwIfAborted();
      const snapshot = await state(sessionId);
      const existing = snapshot.jobs.find(job => job.idempotencyKey === idempotencyKey);
      if (existing) {
        const profile = await model.resolveModel({ sessionModel, settings: snapshot.settings });
        if (!sameModel(existing.model, profile) || existing.kind !== kind) fail('CTX_IDEMPOTENCY_CONFLICT', 'Questa chiave identifica una richiesta diversa.');
        return existing;
      }
      const records = await originals(sessionId);
      const selection = selectClosedPrefix(records, { retainRecentTurns: snapshot.settings.retainRecentTurns, force: true });
      if (selection.pendingCalls.length) fail('CTX_PENDING_TOOLS', 'Attendere i risultati degli strumenti.');
      if (!selection.prefix.length) fail('CTX_NOTHING_TO_COMPACT', 'Non ci sono scambi precedenti da compattare mantenendo intero l’ultimo scambio. Nessun messaggio è stato modificato.');
      const profile = await model.resolveModel({ sessionModel, settings: snapshot.settings });
      const fingerprint = await hash({ sessionId, revision: snapshot.revision, settings: snapshot.settings, profile, kind, tools });
      const job = ContextJobV1.parse({ schema: 'talos.context.job.v1', id: idFactory(), sessionId, idempotencyKey, requestFingerprint: fingerprint, kind, state: 'queued', baseRevision: snapshot.revision, baseStateRevision: snapshot.stateRevision, coveredThrough: selection.coveredThrough, model: identity(profile), createdAt: clock(), updatedAt: clock(), completedSegments: [], progress: { completed: 0, total: 0, phase: 'queued' } });
      const claimed = await store.claimContextJob({ sessionId, job });
      launch(claimed, { sessionModel, tools, signal });
      return claimed;
    },
    async waitForCompaction({ sessionId, jobId }) {
      const entry = running.get(key(sessionId, jobId));
      if (entry) { await entry.promise; if (entry.error) throw entry.error; }
      const job = await store.readContextJob({ sessionId, jobId });
      if (!job) fail('CTX_JOB_NOT_FOUND', 'Compattazione non trovata.');
      return job;
    },
    async cancelCompaction({ sessionId, jobId }) {
      const job = await store.readContextJob({ sessionId, jobId });
      if (!job) fail('CTX_JOB_NOT_FOUND', 'Compattazione non trovata.');
      if (terminal.has(job.state)) return job;
      try { return await save(job, { state: 'cancelled' }); }
      finally { running.get(key(sessionId, jobId))?.controller.abort(new ContextEngineError('Compattazione annullata.', 'CTX_JOB_CANCELLED')); }
    },
    async resumeCompaction({ sessionId, jobId, sessionModel, tools = [], signal }) {
      let job = await store.readContextJob({ sessionId, jobId });
      if (!job) fail('CTX_JOB_NOT_FOUND', 'Compattazione non trovata.');
      if (terminal.has(job.state)) return job;
      const entry = running.get(key(sessionId, jobId));
      if (entry) { await entry.promise; running.delete(key(sessionId, jobId)); }
      job = await store.readContextJob({ sessionId, jobId });
      if (terminal.has(job.state)) return job;
      await assertCurrent(job, signal);
      if (job.state !== 'paused') job = await save(job, { state: 'paused' });
      const { error: previousError, ...resumable } = job;
      job = await store.claimContextJob({ sessionId, job: { ...resumable, state: 'queued', updatedAt: clock() } });
      launch(job, { sessionModel, tools, signal });
      return job;
    },
    async prepareForRequest({ sessionId, messages, tools = [], sessionModel, signal }) {
      let snapshot = await state(sessionId);
      const records = await originals(sessionId);
      if (messages && JSON.stringify(messages) !== JSON.stringify(records.map(r => r.message))) fail('CTX_UNARCHIVED_CONTEXT', 'Archiviare i nuovi messaggi prima di preparare la richiesta.');
      let prepared = compiled(snapshot, records, { targetModel: sessionModel });
      let measurement = await measure(prepared, tools, sessionModel, signal);
      /* 09/09 — si salva SUBITO, prima di qualunque automazione: se la compattazione automatica fallisce
         (CTX_NO_REDUCTION su un solo messaggio enorme, per esempio) la misura che ha fatto scattare tutto
         è comunque un fatto vero, ed è quello che la modale deve poter mostrare. */
      const record = m => store.recordMeasurement({ sessionId, revision: snapshot.revision, measuredAt: clock(), measurement: m });
      await record(measurement);
      const budget = budgetFor(measurement, snapshot.settings);
      let job;
      if (snapshot.settings.auto && budget.shouldPrepare) {
        job = snapshot.jobs.find(entry => !terminal.has(entry.state));
        if (!job) {
          try { job = await api.startCompaction({ sessionId, idempotencyKey: `auto-${snapshot.revision}-${await hash(identity(sessionModel))}`, sessionModel, tools, signal }); }
          catch (error) { if (error.code !== 'CTX_NOTHING_TO_COMPACT') throw error; }
        }
        if (!budget.fits && job) {
          if (job.state === 'paused') job = await api.resumeCompaction({ sessionId, jobId: job.id, sessionModel, tools, signal });
          const result = await api.waitForCompaction({ sessionId, jobId: job.id });
          if (result.state !== 'committed') fail(result.error?.code ?? 'CTX_COMPACTION_REQUIRED', result.error?.message ?? 'Il contesto richiede una compattazione completata.');
          snapshot = await state(sessionId);
          prepared = compiled(snapshot, await originals(sessionId), { targetModel: sessionModel });
          measurement = await measure(prepared, tools, sessionModel, signal);
          await record(measurement); // dopo una compattazione riuscita la misura nuova sostituisce quella vecchia
        }
      }
      if (!budgetFor(measurement, snapshot.settings).fits) fail('CTX_CONTEXT_OVERFLOW', 'Il contesto supera la finestra. Compattare o modificare le informazioni protette.');
      return { messages: prepared, measurement, versionId: snapshot.activeVersion?.id ?? null, ...(job ? { job } : {}), waiting: false };
    },
    getContextState: ({ sessionId }) => state(sessionId),
    async updateContextSettings({ sessionId, patch, expectedRevision }) {
      const snapshot = await state(sessionId);
      const settings = parseContextSettings({ ...snapshot.settings, ...patch });
      return store.updateSessionSettings({ sessionId, settings, expectedRevision });
    },
    listContextVersions: options => store.listContextVersions(options),
    restoreContextVersion: options => store.restoreContextVersion({ ...options, newVersionId: idFactory(), createdAt: clock() }),
    async upsertProtectedFact({ sessionId, fact, expectedRevision, actor }) {
      if (!['owner', 'model'].includes(actor)) fail('CTX_FACT_ACTOR_INVALID', 'Indicare l’origine della modifica.');
      const snapshot = await state(sessionId);
      const prior = snapshot.facts.find(entry => entry.id === fact.id);
      const updated = actor === 'model' && prior && prior.status !== 'removed' && prior.text !== fact.text
        ? { ...prior, revision: prior.revision + 1, status: 'conflict', conflict: { proposedText: fact.text, sources: fact.sources ?? [] } }
        : { id: fact.id, text: fact.text, sources: fact.sources ?? [], status: 'active', revision: (prior?.revision ?? 0) + 1 };
      return store.upsertProtectedFact({ sessionId, fact: updated, expectedRevision });
    },
    removeProtectedFact: options => store.removeProtectedFact(options),
    async resolveFactConflict({ sessionId, factId, accept, expectedRevision }) {
      if (typeof accept !== 'boolean') fail('CTX_INVALID_INPUT', 'Confermare o rifiutare la proposta.');
      const prior = (await state(sessionId)).facts.find(f => f.id === factId);
      if (!prior || prior.status !== 'conflict') fail('CTX_FACT_CONFLICT_NOT_FOUND', 'Nessun conflitto aperto.');
      return api.upsertProtectedFact({ sessionId, expectedRevision, actor: 'owner', fact: { id: factId, text: accept ? prior.conflict.proposedText : prior.text, sources: accept ? prior.conflict.sources : prior.sources } });
    },
    async searchContext({ sessionId, query }) {
      await state(sessionId);
      if (retrieval?.searchContext) return retrieval.searchContext({ sessionId, query });
      const records = await originals(sessionId);
      await store.replaceSearchChunks({ sessionId, chunks: chunkContextRecords(records) });
      const lexical = await store.searchLexical({ sessionId, query });
      return selectContextEvidence(rankContextSources({ lexical }));
    },
    async readContextSource({ sessionId, sourceId }) {
      const [record] = await store.readOriginals({ sessionId, ids: [sourceId], limit: 1 });
      if (!record) fail('CTX_SOURCE_NOT_FOUND', 'Fonte non presente in questa conversazione.');
      return record;
    },
    exportContext: options => store.exportSession(options),
    importContext: options => store.importSession(options),
  };
  return Object.freeze(api);
}
