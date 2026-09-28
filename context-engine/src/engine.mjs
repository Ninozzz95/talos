import { ContextEngineError, ContextEventV1, ContextJobV1, ContextVersionV1, TokenMeasurementV1, parseContextRecord, parseContextSettings } from './contracts.mjs';
import { computeContextBudget, planCompaction, selectClosedPrefix } from './compaction-planner.mjs';
import { buildSummaryRequest, validateSummary, composeActiveContext } from './summary.mjs';
import { chunkContextRecords, rankContextSources, selectContextEvidence } from './retrieval.mjs';

const terminal = new Set(['committed', 'cancelled', 'failed']);
const fail = (code, message) => { throw new ContextEngineError(message, code); };
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
const identity = profile => ({ provider: profile.provider, model: profile.model });
const sameModel = (a, b) => a?.provider === b?.provider && a?.model === b?.model;
const plainText = content => typeof content === 'string' ? content : Array.isArray(content) ? content.filter(p => ['text', 'input_text', 'output_text'].includes(p?.type) && typeof p.text === 'string').map(p => p.text).join('\n') : '';
const activeStates = new Set(['queued', 'preparing', 'summarizing', 'validating', 'ready']);

/*
 * 25/09/2026 — ticket della CLI «riassunto rifiutato richiesto a ogni passo»
 * (`docs/talos-cli/2026-09-25-ticket-desktop-ce-summary-retries.md`; la CLI l'ha riprodotto: 5 riassunti pagati in UN giro,
 * nessuno pubblicato, niente a schermo). Causa, in `prepareForRequest`: un lavoro fallito è terminale e la chiave
 * `auto-${revision}` cambia a ogni passo del giro ⇒ ogni richiesta ne apriva uno nuovo.
 * Decisione owner 25/09 «pausa che cresce + segnale»: dopo un fallimento la compattazione AUTOMATICA aspetta 60 s, poi
 * 300, poi 900 — la scala di Hermes (`agent/context_compressor.py:768-772`, clone `65ad529` del 23/09/2026: «Timeouts
 * escalate 60s -> 300s -> 900s … a flat 30s cooldown let every async-completion turn re-issue the same capped request»),
 * con un contatore PER CLASSE d'errore (:776-783) che solo un riassunto riuscito azzera (:2473-2480). La «Compatta» della
 * persona non aspetta (Hermes :2887, «Manual /compress passes force=True»). Lo stato si RICAVA dai lavori già su disco
 * (ultimo `committed` = nessuna pausa): sopravvive a un riavvio senza una riga nuova nello schema.
 */
export const RAFFREDDAMENTO_DOPO_RIFIUTO_MS = Object.freeze([60_000, 300_000, 900_000]);
// Conta l'ultimo ESITO, non l'ultima creazione: un lavoro in pausa (`paused` non blocca un lavoro nuovo) può fallire DOPO
// una «Compatta» riuscita creata più tardi. `updatedAt` di un lavoro terminale è l'istante dell'esito (per `committed`
// è `version.createdAt`, `sqlite-worker.mjs::commitContextVersion`).
const piuRecente = (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.baseRevision - a.baseRevision || Date.parse(b.createdAt) - Date.parse(a.createdAt);
/*
 * Contano per la pausa SOLO i fallimenti del RIASSUNTO (e del fornitore che lo scrive) — la decisione owner era «pausa dopo un
 * riassunto rifiutato», e Hermes raffredda sui fallimenti del riassunto: vuoto, troncato, sovraccarico, tempo scaduto
 * (`agent/context_compressor.py:740-783`). ⛔ Il 25/09 contavano TUTTI i lavori falliti: la CLI ha misurato un riassunto VALIDO
 * perso per `CTX_STALE_REVISION` (lo stato è cambiato durante la compattazione), poi 60 s di pausa e il giro morto per contesto
 * pieno — 2-4 volte su 6 (`r5a-coord-ce-compaction`). Una corsa interna del motore (revisione o modello cambiati a metà, un
 * annullamento, niente da compattare) non costa un riassunto sbagliato, e ritentare subito è ciò che deve succedere.
 * `CTX_COMPACTION_FAILED` è l'errore NON del motore (rete, 5xx, tempo scaduto del fornitore): conta, come in Hermes.
 */
const FALLIMENTI_DEL_RIASSUNTO = new Set(['CTX_INVALID_SUMMARY', 'CTX_EMPTY_SUMMARY', 'CTX_TRUNCATED_SUMMARY', 'CTX_INVALID_SOURCE',
  'CTX_NO_REDUCTION', 'CTX_SEGMENT_TOO_LARGE', 'CTX_CONTEXT_TOO_SMALL', 'CTX_COMPACTION_FAILED']);
export function raffreddamentoCompattazione(jobs, adesso) {
  let ultimo = null; let tentativi = 0;
  for (const job of [...jobs].sort(piuRecente)) {
    if (job.state === 'committed') break;
    // annullati, in pausa e le corse interne del motore non pagano un rifiuto: non aprono e non chiudono la pausa
    if (job.state !== 'failed' || !FALLIMENTI_DEL_RIASSUNTO.has(job.error?.code)) continue;
    ultimo ??= job;
    if (job.error?.code === ultimo.error?.code) tentativi++;
  }
  if (!ultimo) return null;
  const attesaMs = RAFFREDDAMENTO_DOPO_RIFIUTO_MS[Math.min(tentativi, RAFFREDDAMENTO_DOPO_RIFIUTO_MS.length) - 1];
  const fino = Date.parse(ultimo.updatedAt) + attesaMs;
  if (!(Date.parse(adesso) < fino)) return null;
  return { jobId: ultimo.id, code: ultimo.error?.code ?? 'CTX_COMPACTION_FAILED', attempts: tentativi, waitSeconds: attesaMs / 1000, failedAt: ultimo.updatedAt, retryAfter: new Date(fino).toISOString() };
}

/*
 * 24/09/2026 — F4: ARCHIVIO ≠ PROIEZIONE. La proiezione è la storia che l'adapter desktop ha CORRETTO (esiti
 * degli attrezzi riscritti prima della richiesta, `talosHarness.desktop-hotfix.mjs::correggiMessaggiDesktop`):
 * il modello e il riassuntore vedono QUELLA; l'archivio, `sourceHash` e le citazioni della versione restano
 * sugli originali grezzi. Prima di oggi il motore compilava solo dai record (`prepareForRequest`), e il
 * servizio desktop, per far vedere il testo corretto, archiviava la proiezione: alla richiesta dopo l'archivio
 * non combaciava più (`CTX_HISTORY_DIVERGED`, T1/T2 della ricognizione del 24/09). Allineamento 1:1 per
 * sequenza — stessa lunghezza, stessi ruoli — altrimenti si RIFIUTA, non si indovina. È la forma di Hermes:
 * le righe originali restano in tabella e ciò che va al modello è un insieme distinto
 * (`hermes_state_messages.py:735-741`, clone `65ad529` del 23/09/2026: «soft-archive the active rows
 * (active=0, compacted=1: summarized away, still searchable) and insert compacted_messages as fresh active rows»).
 */
function checkProjection(records, projection) {
  if (projection === undefined) return;
  if (!Array.isArray(projection) || projection.length !== records.length || projection.some((message, index) => !message || typeof message !== 'object' || message.role !== records[index].message.role)) fail('CTX_PROJECTION_MISALIGNED', 'La proiezione della richiesta non è allineata all’archivio (lunghezza o ruoli diversi).');
}
const overlay = (records, projection) => projection === undefined ? records : records.map(record => {
  const message = projection[record.sequence - 1];
  if (message === undefined) return record; // record arrivato dopo la richiesta che ha aperto il job: resta grezzo
  if (message?.role !== record.message.role) fail('CTX_PROJECTION_MISALIGNED', 'La proiezione della richiesta non è allineata all’archivio (lunghezza o ruoli diversi).');
  return { ...record, message };
});
/*
 * Le citazioni della sintesi sono state verificate sulla proiezione (è il testo che il riassuntore ha letto);
 * la versione però vive nell'archivio e il verificatore del commit (`node/context-export.mjs:44-62`) le
 * pretende ALLA LETTERA negli originali grezzi. Quelle che stanno solo nel testo corretto passano in
 * `unverifiedSources` (mai spacciate per verificate); se non ne resta nessuna, la versione NON si pubblica.
 */
function ricitaSugliOriginali(summary, records) {
  const byId = new Map(records.map(record => [record.id, record]));
  const verified = []; const dropped = [...(summary.unverifiedSources ?? [])];
  for (const source of summary.sources) {
    const record = byId.get(source.recordId);
    const text = record ? plainText(record.message.content) : '';
    const start = record ? text.indexOf(source.quote) : -1;
    if (start < 0) { dropped.push({ recordId: source.recordId, quote: source.quote, reason: record ? 'not-found' : 'unknown-record' }); continue; }
    verified.push({ recordId: source.recordId, quote: source.quote, start, end: start + source.quote.length });
  }
  if (records.length && !verified.length) fail('CTX_INVALID_SOURCE', 'Le citazioni della sintesi stanno solo nel testo corretto della richiesta, non negli originali archiviati. La versione precedente rimane valida.');
  return { ...summary, sources: verified, ...(dropped.length ? { unverifiedSources: dropped } : {}) };
}

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
  /* 25/09 — l'AVVISO della pausa dopo un rifiuto: uno per lavoro fallito (id deterministico, lo store ignora il doppione),
     così un giro di K passi lo mostra una volta sola. Contenuto fisso per lavoro: la consegna al desktop rifiuta un id già
     visto con un contenuto diverso (`session-registry.mjs::pubblicaEventoContesto`). */
  async function avvisaPausa(sessionId, jobs) {
    const pausa = raffreddamentoCompattazione(jobs ?? (await state(sessionId)).jobs, clock());
    if (!pausa) return null;
    const { jobId, code, attempts, waitSeconds, failedAt, retryAfter } = pausa;
    await store.recordContextNotice({ sessionId, event: ContextEventV1.parse({ schema: 'talos.context.event.v1', id: `cooling-${jobId}`, sessionId, jobId, kind: 'context.compaction.cooling', state: 'failed', createdAt: failedAt, payload: { code, attempts, waitSeconds, retryAfter } }) });
    return pausa;
  }
  async function execute(initial, { sessionModel, tools = [], signal, projection }) {
    let job = initial;
    try {
      const snapshot = await assertCurrent(job, signal);
      const profile = await model.resolveModel({ sessionModel, settings: snapshot.settings });
      if (!sameModel(profile, job.model)) fail('CTX_MODEL_MISMATCH', 'Il modello di sintesi è cambiato.');
      // 24/09 — il riassuntore legge la proiezione (testo corretto), quando la richiesta ne ha portata una.
      const records = overlay(await originals(job.sessionId, job.coveredThrough), projection);
      job = await save(job, { state: 'preparing' });
      // Plan only the immutable covered prefix; the final request reattaches the latest suffix.
      const planning = planCompaction(records, { ...profile, settings: snapshot.settings, retainRecentTurns: 0 });
      const segments = planning.segments;
      if (!segments.length) fail('CTX_NOTHING_TO_COMPACT', 'Non ci sono scambi completi da compattare.');
      job = await save(job, { state: 'summarizing', progress: { completed: job.completedSegments.length, total: Math.max(segments.length, job.completedSegments.length), phase: 'summarizing' } });
      /*
       * 09/09 — `build(compact)` al posto della richiesta già costruita: una sintesi TRONCATA (`length`) si
       * ritenta UNA volta con l'istruzione compatta, mai di più. Trovato dal giro vero: senza limite
       * dichiarato il modello scriveva 2.048 token e la compattazione — e il giro — morivano lì.
       */
      const invoke = async (build, sourceRecords, label) => {
        const once = async (compact) => {
          const request = build(compact);
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
        try { return await once(false); }
        catch (error) {
          if (error?.code !== 'CTX_TRUNCATED_SUMMARY') throw error;
          return once(true);
        }
      };
      const summaries = [];
      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];
        const fingerprint = await hash({ segment, profile, focus: snapshot.settings.focus });
        const prior = job.completedSegments.find(entry => entry.fingerprint === fingerprint);
        if (prior) { summaries.push(validateSummary({ text: JSON.stringify(prior.summary), finishReason: 'stop' }, { records })); continue; }
        const build = compact => buildSummaryRequest({ segment, focus: snapshot.settings.focus, maxOutputTokens: profile.responseReserve, compact });
        const request = build(false);
        const measured = await measure(request.messages, [], profile, signal);
        if (!budgetFor(measured, snapshot.settings).fits) {
          if (segment.text.length < 512) fail('CTX_CONTEXT_TOO_SMALL', 'Istruzioni e segmento minimo non entrano nella finestra.');
          let midpoint = Math.floor(segment.text.length / 2);
          if (/[\uD800-\uDBFF]/u.test(segment.text[midpoint - 1])) midpoint--;
          segments.splice(index, 1, { ...segment, id: `${segment.id}.a`, text: segment.text.slice(0, midpoint) }, { ...segment, id: `${segment.id}.b`, text: segment.text.slice(midpoint) });
          index--; continue;
        }
        const summary = await invoke(build, records.filter(record => segment.sourceIds.includes(record.id)), segment.id);
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
          const merged = await invoke(compact => buildSummaryRequest({ summaries: pair, focus: snapshot.settings.focus, maxOutputTokens: profile.responseReserve, compact }), records, `merge-${depth}-${index}`);
          if (JSON.stringify(merged).length >= JSON.stringify(pair).length) fail('CTX_NO_REDUCTION', 'La fusione non libera spazio.');
          next.push(merged);
        }
        level = next;
      }
      job = await save(job, { state: 'validating', progress: { ...job.progress, phase: 'validating' } });
      const latest = await assertCurrent(job, signal);
      const grezzi = await originals(job.sessionId);
      const all = overlay(grezzi, projection);
      if (selectClosedPrefix(all, { retainRecentTurns: 0 }).pendingCalls.length) fail('CTX_PENDING_TOOLS', 'Attendere i risultati degli strumenti prima della pubblicazione.');
      // 24/09 — la versione è un fatto d'ARCHIVIO: prefisso, `sourceHash` e citazioni sugli originali grezzi.
      const prefix = grezzi.filter(record => record.sequence <= job.coveredThrough);
      const summary = projection === undefined ? level[0] : ricitaSugliOriginali(level[0], prefix);
      const active = compiled(latest, all, { summary, coveredThrough: job.coveredThrough, targetModel: sessionModel });
      const before = await measure(compiled(latest, all, { targetModel: sessionModel }), tools, sessionModel, signal);
      const measurement = await measure(active, tools, sessionModel, signal);
      const budget = budgetFor(measurement, latest.settings);
      if (!budget.fits || measurement.inputTokens >= before.inputTokens) fail('CTX_NO_REDUCTION', 'La sintesi non libera spazio sufficiente. La versione precedente rimane valida.');
      job = await save(job, { state: 'ready', progress: { ...job.progress, phase: 'ready' } });
      await assertCurrent(job, signal);
      const version = ContextVersionV1.parse({ schema: 'talos.context.version.v1', id: idFactory(), sessionId: job.sessionId, coveredThrough: job.coveredThrough, sourceIds: prefix.map(r => r.id), sourceHash: await hash(prefix.map(({ id, sha256 }) => ({ id, sha256 }))), summary, activeMessages: compiled(latest, prefix, { summary, coveredThrough: job.coveredThrough, targetModel: sessionModel }), model: job.model, measurement, createdAt: clock() });
      signal?.throwIfAborted();
      await store.commitContextVersion({ sessionId: job.sessionId, expectedRevision: latest.revision, expectedStateRevision: latest.stateRevision, jobId: job.id, version });
      return store.readContextJob({ sessionId: job.sessionId, jobId: job.id });
    } catch (error) {
      const current = await store.readContextJob({ sessionId: job.sessionId, jobId: job.id });
      if (current && terminal.has(current.state)) return current;
      const cancelled = signal?.aborted || error.code === 'CTX_JOB_CANCELLED';
      const paused = ['CTX_PENDING_TOOLS', 'CTX_USAGE_DENIED', 'CTX_RESOURCE_BUSY'].includes(error.code);
      const finale = await save(current ?? job, { state: cancelled ? 'cancelled' : paused ? 'paused' : 'failed', error: { code: cancelled ? 'CTX_JOB_CANCELLED' : error.code?.startsWith('CTX_') ? error.code : 'CTX_COMPACTION_FAILED', message: cancelled ? 'Compattazione annullata.' : error.code?.startsWith('CTX_') ? error.message : 'Preparazione del contesto non riuscita.' } });
      // 25/09 — l'avviso della pausa nasce QUI, quando il lavoro fallisce: anche l'ultimo passo di un giro lo lascia, e
      // una richiesta che arriva a pausa già scaduta non lo perde. Nessun catch: un archivio che non scrive è un guasto vero.
      if (finale.state === 'failed') await avvisaPausa(job.sessionId);
      return finale;
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
  /*
   * 24/09/2026 — F4, CTX-RESTART-ACTIVE-JOB-RECOVERY (nominato nel dossier Codex del 23/09, mai esistito).
   * Un job `queued/preparing/summarizing/validating/ready` che NON sta in `running` non ha un processo dietro:
   * la mappa `running` muore col processo, la riga SQLite no. Prima di oggi restava «in corso» per sempre —
   * `waitForCompaction` lo ritornava com'era, `prepareForRequest` moriva `CTX_COMPACTION_REQUIRED` a ogni
   * richiesta e il worker rifiutava ogni job nuovo (`sqlite-worker.mjs:146`, `CTX_JOB_ACTIVE`). Qui diventa
   * `paused` con motivo `CTX_JOB_INTERRUPTED`: la stessa semantica della pausa già esistente (si riprende in
   * automatico con i segmenti già pagati, e un job nuovo può partire). Nessuna versione è mai stata scritta
   * da un job non `committed` (`commitContextVersion` è una transazione sola). Come Hermes, che recupera la
   * lease di un pid morto (`hermes_state_compression.py:455-472`, «Reclaimed stale compression lock») e
   * BullMQ («stalled jobs»): un job senza processo si dichiara, non si aspetta.
   * ⛔ In questo processo un job attivo è SEMPRE in `running`: `startCompaction` e `resumeCompaction` lanciano
   * nella stessa continuazione della `claimContextJob`, senza un `await` in mezzo.
   */
  async function recoverInterrupted(sessionId, snapshot) {
    const orfani = snapshot.jobs.filter(job => activeStates.has(job.state) && !running.has(key(sessionId, job.id)));
    if (!orfani.length) return snapshot;
    for (const job of orfani) {
      await store.saveJobProgress({ sessionId, job: ContextJobV1.parse({ ...job, state: 'paused', updatedAt: clock(), error: { code: 'CTX_JOB_INTERRUPTED', message: 'Compattazione interrotta: il processo che la eseguiva non c’è più (riavvio del server). Nessuna versione è stata pubblicata; la compattazione può ripartire.' } }) });
    }
    return state(sessionId);
  }
  const api = {
    async recoverInterruptedJobs({ sessionId }) { return recoverInterrupted(sessionId, await state(sessionId)); },
    async appendOriginal({ sessionId, record }) {
      const parsed = parseContextRecord(record);
      await store.initSession({ sessionId, settings: parseContextSettings({}) });
      for (const id of parsed.assetRefs) if (!await store.readBlob({ sessionId, id })) fail('CTX_ASSET_MISSING', 'Conservare l’allegato prima di archiviare il messaggio.');
      return store.appendOriginalBatch({ sessionId, records: [parsed] });
    },
    async startCompaction({ sessionId, idempotencyKey, sessionModel, kind = 'compact', tools = [], signal, projection }) {
      signal?.throwIfAborted();
      const snapshot = await recoverInterrupted(sessionId, await state(sessionId));
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
      launch(claimed, { sessionModel, tools, signal, projection });
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
    async resumeCompaction({ sessionId, jobId, sessionModel, tools = [], signal, projection }) {
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
      launch(job, { sessionModel, tools, signal, projection });
      return job;
    },
    /** `projection`: la storia corretta, allineata 1:1 ai record (vedi `checkProjection`); `messages` resta il controllo d'archivio di prima. */
    async prepareForRequest({ sessionId, messages, projection, tools = [], sessionModel, signal }) {
      let snapshot = await recoverInterrupted(sessionId, await state(sessionId));
      const records = await originals(sessionId);
      if (messages && JSON.stringify(messages) !== JSON.stringify(records.map(r => r.message))) fail('CTX_UNARCHIVED_CONTEXT', 'Archiviare i nuovi messaggi prima di preparare la richiesta.');
      checkProjection(records, projection);
      let prepared = compiled(snapshot, overlay(records, projection), { targetModel: sessionModel });
      let measurement = await measure(prepared, tools, sessionModel, signal);
      /* 09/09 — si salva SUBITO, prima di qualunque automazione: se la compattazione automatica fallisce
         (CTX_NO_REDUCTION su un solo messaggio enorme, per esempio) la misura che ha fatto scattare tutto
         è comunque un fatto vero, ed è quello che la modale deve poter mostrare. */
      const record = m => store.recordMeasurement({ sessionId, revision: snapshot.revision, measuredAt: clock(), measurement: m });
      await record(measurement);
      const budget = budgetFor(measurement, snapshot.settings);
      let job; let compactionCooling = null;
      if (snapshot.settings.auto && budget.shouldPrepare) {
        job = snapshot.jobs.find(entry => !terminal.has(entry.state));
        // 25/09 — in pausa dopo un rifiuto: niente lavoro nuovo (l'avviso si riscrive con lo stesso id: copre i lavori
        // falliti prima di questa versione)
        if (!job) compactionCooling = await avvisaPausa(sessionId, snapshot.jobs);
        if (!job && !compactionCooling) {
          try { job = await api.startCompaction({ sessionId, idempotencyKey: `auto-${snapshot.revision}-${await hash(identity(sessionModel))}`, sessionModel, tools, signal, projection }); }
          catch (error) { if (error.code !== 'CTX_NOTHING_TO_COMPACT') throw error; }
        }
        if (!budget.fits && job) {
          if (job.state === 'paused') job = await api.resumeCompaction({ sessionId, jobId: job.id, sessionModel, tools, signal, projection });
          const result = await api.waitForCompaction({ sessionId, jobId: job.id });
          if (result.state !== 'committed') fail(result.error?.code ?? 'CTX_COMPACTION_REQUIRED', result.error?.message ?? 'Il contesto richiede una compattazione completata.');
          snapshot = await state(sessionId);
          prepared = compiled(snapshot, overlay(await originals(sessionId), projection), { targetModel: sessionModel });
          measurement = await measure(prepared, tools, sessionModel, signal);
          await record(measurement); // dopo una compattazione riuscita la misura nuova sostituisce quella vecchia
        }
      }
      if (!budgetFor(measurement, snapshot.settings).fits) {
        // il tempo che RESTA, non la durata del gradino: a pausa quasi scaduta «per 15 min» mentirebbe
        if (compactionCooling) fail('CTX_CONTEXT_OVERFLOW', `Il contesto supera la finestra e la compattazione automatica è in pausa ancora per circa ${Math.max(1, Math.ceil((Date.parse(compactionCooling.retryAfter) - Date.parse(clock())) / 60_000))} min dopo un riassunto non riuscito (${compactionCooling.code}). Usa «Compatta» per riprovare subito, o modifica le informazioni protette.`);
        fail('CTX_CONTEXT_OVERFLOW', 'Il contesto supera la finestra. Compattare o modificare le informazioni protette.');
      }
      return { messages: prepared, measurement, versionId: snapshot.activeVersion?.id ?? null, ...(job ? { job } : {}), ...(compactionCooling ? { compactionCooling } : {}), waiting: false };
    },
    getContextState: async ({ sessionId }) => recoverInterrupted(sessionId, await state(sessionId)),
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
