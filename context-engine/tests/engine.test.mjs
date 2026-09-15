import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const modelProfile = { provider: 'local', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048, local: true };
const now = '2026-09-09T00:00:00.000Z';
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const summary = { schema: 'talos.context.summary.v1', text: 'Database SQLite, scelta confermata.', goal: 'Continuare il progetto', decisions: ['Database SQLite'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: 'u0', quote: 'Database SQLite' }] };
async function fixture(t, { summarize, settings, faultPoint, decorateStore } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-engine-'));
  const databasePath = join(directory, 'context.sqlite');
  const store = createSqliteContextStore({ databasePath, faultPoint });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings(settings ?? {}) });
  const calls = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    calls.push(request);
    if (summarize) return summarize(request);
    const sourceId = JSON.parse(request.messages.at(-1).content).sourceIds?.[0] ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : sourceId.startsWith('a') ? 'risposta' : `richiesta ${sourceId.slice(1)}`;
    return { text: JSON.stringify({ ...summary, sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: model.provider, model: model.model }; } };
  const engine = createContextEngine({ store: decorateStore ? decorateStore(store) : store, model, tokenCounter, clock: () => now });
  for (let i = 0; i < 5; i++) {
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `u${i}`, message: { role: 'user', content: i ? `richiesta ${i} ` + 'dati '.repeat(500) : 'Database SQLite ' + 'contesto '.repeat(500) }, createdAt: now } });
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `a${i}`, message: { role: 'assistant', content: 'risposta '.repeat(500) }, createdAt: now } });
  }
  return { store, engine, calls, databasePath, model, tokenCounter };
}
async function compact(engine, key = 'one') {
  const job = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: key, sessionModel: modelProfile });
  return engine.waitForCompaction({ sessionId: 'chat', jobId: job.id });
}

test('CTX-SMALL-NO-INFERENCE: empty, instructions-only and one exchange do not load a model or publish', async t => {
  const { engine, store, model, calls } = await fixture(t);
  let resolves = 0;
  model.resolveModel = async () => { resolves++; throw new Error('Must not load the runtime for a structural no-op'); };
  for (const [sessionId, messages] of [
    ['empty', []], ['instructions', [{ role: 'system', content: 'Regole' }]],
    ['one', [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao!' }]],
    ['waiting', [{ role: 'user', content: 'ci sei?' }]],
  ]) {
    await store.initSession({ sessionId, settings: parseContextSettings({}) });
    for (const [i, message] of messages.entries()) await engine.appendOriginal({ sessionId, record: { id: `${sessionId}-${i}`, message, createdAt: now } });
    const before = await engine.getContextState({ sessionId });
    const original = await store.readOriginals({ sessionId });
    await assert.rejects(engine.startCompaction({ sessionId, idempotencyKey: 'manual', sessionModel: modelProfile }), { code: 'CTX_NOTHING_TO_COMPACT' });
    assert.deepEqual(await engine.getContextState({ sessionId }), before);
    assert.deepEqual(await store.readOriginals({ sessionId }), original);
  }
  assert.equal(resolves, 0); assert.equal(calls.length, 0);
});

test('CTX-MANUAL-BELOW-TRIGGER: manual compaction works below the automatic threshold with automation off', async t => {
  const { engine, calls } = await fixture(t, { settings: { auto: false } });
  const largeWindow = { ...modelProfile, windowTokens: 131072 };
  const prepared = await engine.prepareForRequest({ sessionId: 'chat', sessionModel: largeWindow });
  assert.ok(prepared.measurement.inputTokens < 131072 * 0.55);
  assert.equal(calls.length, 0);
  const started = await engine.startCompaction({ sessionId: 'chat', sessionModel: largeWindow, idempotencyKey: 'manual-below' });
  const job = await engine.waitForCompaction({ sessionId: 'chat', jobId: started.id });
  assert.equal(job.state, 'committed', JSON.stringify(job.error));
  assert.ok(calls.length > 0);
});

test('CTX-SMALL-AUTO-NOOP: a still-fitting request proceeds when only its instructions exceed the early trigger', async t => {
  const { engine, store, calls, model } = await fixture(t);
  const sessionId = 'instruction-heavy';
  await store.initSession({ sessionId, settings: parseContextSettings({}) });
  for (const [i, message] of [{ role: 'system', content: 'x'.repeat(42000) }, { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao!' }].entries()) await engine.appendOriginal({ sessionId, record: { id: `heavy-${i}`, message, createdAt: now } });
  let resolves = 0; model.resolveModel = async () => { resolves++; return modelProfile; };
  const prepared = await engine.prepareForRequest({ sessionId, sessionModel: modelProfile });
  assert.ok(prepared.measurement.inputTokens > 10000);
  assert.equal(prepared.messages.length, 3);
  assert.equal(calls.length, 0); assert.equal(resolves, 0);
  await assert.rejects(engine.prepareForRequest({ sessionId, sessionModel: { ...modelProfile, windowTokens: 8192 } }), { code: 'CTX_CONTEXT_OVERFLOW' });
  assert.equal(calls.length, 0);
});

test('CTX-SMALL-NO-REDUCTION: expanding a short exchange leaves originals intact without a retry loop', async t => {
  const { engine, store, calls } = await fixture(t);
  const sessionId = 'brief';
  await store.initSession({ sessionId, settings: parseContextSettings({}) });
  for (const [id, role, content] of [['u0', 'user', 'Database SQLite'], ['a0', 'assistant', 'va bene'], ['u1', 'user', 'confermi?'], ['a1', 'assistant', 'sì']]) await engine.appendOriginal({ sessionId, record: { id, message: { role, content }, createdAt: now } });
  const before = await store.readOriginals({ sessionId });
  const request = { sessionId, sessionModel: modelProfile, idempotencyKey: 'short' };
  const started = await engine.startCompaction(request);
  const job = await engine.waitForCompaction({ sessionId, jobId: started.id });
  assert.equal(job.state, 'failed'); assert.equal(job.error.code, 'CTX_NO_REDUCTION');
  await engine.startCompaction(request);
  assert.equal(calls.length, 1);
  assert.equal((await engine.getContextState({ sessionId })).activeVersion, null);
  assert.deepEqual(await store.readOriginals({ sessionId }), before);
});
test('CTX-ENGINE-PUBLISH archives originals and publishes only validated reduced context', async t => {
  const { engine, store, calls } = await fixture(t);
  const before = await store.readOriginals({ sessionId: 'chat' });
  const job = await compact(engine);
  assert.equal(job.state, 'committed', JSON.stringify(job.error));
  assert.deepEqual(await store.readOriginals({ sessionId: 'chat' }), before);
  const prepared = await engine.prepareForRequest({ sessionId: 'chat', sessionModel: modelProfile, tools: [] });
  assert.ok(prepared.versionId);
  assert.ok(prepared.messages.some(m => m.content?.includes('richiesta 4')));
  assert.ok(calls.every(c => !c.tools?.length));
  assert.equal((await store.readUsage({ sessionId: 'chat' })).length, calls.length);
});

test('CTX-AUTO-PAUSED-RESUME resumes the same paused job when inference needs space and clears its old error', async t => {
  const { engine, model } = await fixture(t);
  const normal = model.summarize; let busy = true;
  model.summarize = async request => {
    if (busy) { busy = false; throw Object.assign(new Error('Chat has priority'), { code: 'CTX_RESOURCE_BUSY' }); }
    return normal(request);
  };
  const profile = { ...modelProfile, windowTokens: 8192 };
  await assert.rejects(engine.prepareForRequest({ sessionId: 'chat', sessionModel: profile }), { code: 'CTX_RESOURCE_BUSY' });
  const paused = (await engine.getContextState({ sessionId: 'chat' })).jobs[0];
  assert.equal(paused.state, 'paused');
  const prepared = await engine.prepareForRequest({ sessionId: 'chat', sessionModel: profile });
  assert.ok(prepared.versionId);
  const final = await engine.getContextState({ sessionId: 'chat' });
  assert.equal(final.jobs.length, 1);
  assert.equal(final.jobs[0].id, paused.id);
  assert.equal(final.jobs[0].state, 'committed');
  assert.equal(final.jobs[0].error, undefined);
});
for (const [name, response, code] of [
  ['EMPTY', { text: '', finishReason: 'stop' }, 'CTX_EMPTY_SUMMARY'],
  ['TRUNCATED', { text: JSON.stringify(summary), finishReason: 'length' }, 'CTX_TRUNCATED_SUMMARY'],
  ['INVALID-SOURCE', { text: JSON.stringify({ ...summary, sources: [{ recordId: 'other-chat', quote: 'inventata' }] }), finishReason: 'stop' }, 'CTX_INVALID_SOURCE'],
]) test(`CTX-${name}-SUMMARY keeps valid checkpoint and never repeats same request`, async t => {
  const { engine, store, calls } = await fixture(t, { summarize: () => response });
  const job = await compact(engine);
  assert.equal(job.state, 'failed'); assert.equal(job.error.code, code);
  assert.equal((await engine.getContextState({ sessionId: 'chat' })).activeVersion, null);
  await compact(engine);
  // 09/09 — una sintesi TRONCATA si ritenta UNA volta con l'istruzione compatta (giro vero D1): due chiamate
  //   dentro lo STESSO tentativo, e una richiesta diversa — non la stessa ripetuta. Il secondo compact() non
  //   chiama più nessuno, come prima.
  assert.equal(calls.length, name === 'TRUNCATED' ? 2 : 1);
  assert.equal((await store.readOriginals({ sessionId: 'chat' })).length, 10);
});
test('CTX-CANCEL aborting synthesis preserves originals and blocks late completion', async t => {
  let entered; const started = new Promise(resolve => { entered = resolve; });
  const { engine, store } = await fixture(t, { summarize: ({ signal }) => new Promise((resolve, reject) => { entered(); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }) });
  const job = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'cancel', sessionModel: modelProfile });
  await started;
  await engine.cancelCompaction({ sessionId: 'chat', jobId: job.id });
  assert.equal((await engine.waitForCompaction({ sessionId: 'chat', jobId: job.id })).state, 'cancelled');
  assert.equal((await store.readContextSnapshot({ sessionId: 'chat' })).activeVersion, null);
});
test('CTX-STALE-JOB pin correction during synthesis rejects candidate', async t => {
  let entered, finish; const started = new Promise(resolve => { entered = resolve; });
  const { engine } = await fixture(t, { summarize: () => new Promise(resolve => { entered(); finish = () => resolve({ text: JSON.stringify(summary), finishReason: 'stop' }); }) });
  const job = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'stale', sessionModel: modelProfile });
  await started;
  const state = await engine.getContextState({ sessionId: 'chat' });
  await engine.upsertProtectedFact({ sessionId: 'chat', expectedRevision: state.revision, actor: 'owner', fact: { id: 'database', text: 'Database SQLite', sources: [] } });
  finish();
  const final = await engine.waitForCompaction({ sessionId: 'chat', jobId: job.id });
  assert.equal(final.state, 'failed'); assert.equal(final.error.code, 'CTX_STALE_REVISION');
});
test('CTX-PIN-CONFLICT model proposal cannot overwrite owner fact', async t => {
  const { engine } = await fixture(t);
  let state = await engine.getContextState({ sessionId: 'chat' });
  await engine.upsertProtectedFact({ sessionId: 'chat', expectedRevision: state.revision, actor: 'owner', fact: { id: 'database', text: 'SQLite', sources: [] } });
  state = await engine.getContextState({ sessionId: 'chat' });
  const fact = await engine.upsertProtectedFact({ sessionId: 'chat', expectedRevision: state.revision, actor: 'model', fact: { id: 'database', text: 'Postgres', sources: [] } });
  assert.equal(fact.text, 'SQLite'); assert.equal(fact.status, 'conflict');
});
test('CTX-PERSIST-FAILURE no candidate active after transactional failure', async t => {
  const { engine, store } = await fixture(t, { faultPoint: 'publish-after-version' });
  const job = await compact(engine);
  assert.equal(job.state, 'failed'); assert.equal(job.error.code, 'CTX_PERSISTENCE_FAILED');
  assert.equal((await store.readContextSnapshot({ sessionId: 'chat' })).activeVersion, null);
});

test('CTX-RESUME-TERMINAL-RACE resume during final generation returns its committed job', async t => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t);
  const normal = f.model.summarize;
  let first = true;
  f.model.summarize = async request => { if (first) { first = false; entered(); await gate; } return normal(request); };
  const job = await f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'resume-race', sessionModel: modelProfile });
  await started;
  const resumed = f.engine.resumeCompaction({ sessionId: 'chat', jobId: job.id, sessionModel: modelProfile });
  release();
  assert.equal((await resumed).state, 'committed');
});

test('CTX-CANCEL-PROGRESS-RACE cancellation still succeeds when progress advances after read', async t => {
  let advance = false, entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { decorateStore: store => ({ ...store, async readContextJob(args) {
    const job = await store.readContextJob(args);
    if (advance && job && !['cancelled', 'committed', 'failed'].includes(job.state)) {
      advance = false;
      await store.saveJobProgress({ sessionId: args.sessionId, job: { ...job, progress: { ...job.progress, completed: job.progress.completed + 1, total: job.progress.total + 1 } } });
    }
    return job;
  } }) });
  const normal = f.model.summarize;
  f.model.summarize = async request => { entered(); await gate; request.signal.throwIfAborted(); return normal(request); };
  const job = await f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'cancel-race', sessionModel: modelProfile });
  await started;
  advance = true;
  try { assert.equal((await f.engine.cancelCompaction({ sessionId: 'chat', jobId: job.id })).state, 'cancelled'); }
  finally { release(); await f.engine.waitForCompaction({ sessionId: 'chat', jobId: job.id }); }
  assert.equal((await f.store.readContextSnapshot({ sessionId: 'chat' })).activeVersion, null);
});

test('CTX-RESUME-USAGE-IDENTITY paid paused attempt and resumed attempt retain distinct consumption', async t => {
  const f = await fixture(t);
  const normal = f.model.summarize;
  let first = true;
  f.model.summarize = async request => {
    if (first) { first = false; throw Object.assign(new Error('Pause after paid request'), { code: 'CTX_RESOURCE_BUSY', usage: { inputTokens: 123, outputTokens: 1 } }); }
    return normal(request);
  };
  const job = await compact(f.engine, 'usage-resume');
  assert.equal(job.state, 'paused');
  await f.engine.resumeCompaction({ sessionId: 'chat', jobId: job.id, sessionModel: modelProfile });
  const finished = await f.engine.waitForCompaction({ sessionId: 'chat', jobId: job.id });
  assert.equal(finished.state, 'committed', JSON.stringify(finished.error));
  const usage = await f.store.readUsage({ sessionId: 'chat' });
  assert.equal(usage.length, f.calls.length + 1);
  assert.equal(new Set(usage.map(record => record.operationId)).size, usage.length);
});

/*
 * 09/09 — punto 2 della consegna v004: la modale diceva «Non disponibile» tre volte perché la misura
 * vera (calcolata a ogni giro da prepareForRequest, con gli strumenti e la riserva) non veniva mai
 * salvata: restava nel valore di ritorno e moriva lì. Qui si prova che l'ultima misura preparata
 * finisce nello stato, con la revisione a cui si riferisce e l'ora: mai un ricalcolo a strumenti
 * vuoti, mai un dato storico spacciato per attuale.
 */
test('CTX-MEASURE-PERSISTED: the last prepared measurement is stored with its revision and exposed in state', async t => {
  const { engine } = await fixture(t);
  await engine.appendOriginal({ sessionId: 'chat', record: { id: 'm0', message: { role: 'user', content: 'ciao' }, createdAt: now } });
  assert.equal((await engine.getContextState({ sessionId: 'chat' })).measurement ?? null, null, 'prima di una richiesta non esiste nessuna misura: non si inventa');
  const prepared = await engine.prepareForRequest({ sessionId: 'chat', sessionModel: modelProfile, tools: [{ name: 'shell' }] });
  const state = await engine.getContextState({ sessionId: 'chat' });
  assert.deepEqual(state.measurement.tokens, prepared.measurement, 'la misura nello stato è ESATTAMENTE quella della richiesta preparata, strumenti compresi');
  assert.equal(state.measurement.revision, state.revision);
  assert.equal(state.measurement.measuredAt, now);
  await engine.appendOriginal({ sessionId: 'chat', record: { id: 'm1', message: { role: 'assistant', content: 'ciao!' }, createdAt: now } });
  const later = await engine.getContextState({ sessionId: 'chat' });
  assert.ok(later.measurement.revision < later.revision, 'una misura vecchia resta leggibile ma dichiara la revisione a cui apparteneva');
});

test('CTX-MEASURE-OVERFLOW: a measurement that does not fit is still recorded — on both refusal paths', async t => {
  const small = { ...modelProfile, windowTokens: 4096, responseReserve: 512 };
  const big = { id: 'big', message: { role: 'user', content: 'x'.repeat(60000) }, createdAt: now };
  // automazione spenta: il rifiuto è l'overflow, e la misura è lì
  const manual = await fixture(t, { settings: { auto: false } });
  await manual.engine.appendOriginal({ sessionId: 'chat', record: big });
  await assert.rejects(manual.engine.prepareForRequest({ sessionId: 'chat', sessionModel: small }), { code: 'CTX_CONTEXT_OVERFLOW' });
  const manualState = await manual.engine.getContextState({ sessionId: 'chat' });
  assert.ok(manualState.measurement && manualState.measurement.tokens.inputTokens > 4096, 'la misura che ha causato il rifiuto è quella che l’utente deve vedere');
  // automazione accesa: la compattazione tentata NON riduce un solo messaggio enorme, il rifiuto è
  // CTX_NO_REDUCTION — e la misura che l'ha fatta scattare deve restare comunque
  const auto = await fixture(t);
  await auto.engine.appendOriginal({ sessionId: 'chat', record: big });
  await assert.rejects(auto.engine.prepareForRequest({ sessionId: 'chat', sessionModel: small }), { code: 'CTX_NO_REDUCTION' });
  const autoState = await auto.engine.getContextState({ sessionId: 'chat' });
  assert.ok(autoState.measurement && autoState.measurement.tokens.inputTokens > 4096, 'anche quando l’automazione fallisce, la prima misura è un fatto e resta');
});

/*
 * 09/09 — quarto difetto del GIRO VERO (D1): sintesi troncata (`length`) ⇒ compattazione fallita ⇒ giro
 * morto. Una risposta troppo lunga non è un guasto del modello: è un budget non dichiarato. Il motore
 * ritenta UNA volta con l'istruzione compatta (limite dimezzato); se anche quella è troncata, l'errore
 * resta CTX_TRUNCATED_SUMMARY — mai un ciclo.
 */
test('CTX-SUMMARY-RETRY-COMPACT: a truncated summary is retried once with the compact instruction, then committed', async t => {
  const richieste = [];
  const { engine, store, calls } = await fixture(t, { summarize: request => {
    richieste.push(request.messages[0].content);
    if (richieste.length === 1) return { text: '{"schema":"talos.context.summary.v1","text":"troppo lun', finishReason: 'length', usage: { inputTokens: 50, outputTokens: 2048 } };
    const sourceId = JSON.parse(request.messages.at(-1).content).sourceIds?.[0] ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : sourceId.startsWith('a') ? 'risposta' : `richiesta ${sourceId.slice(1)}`;
    return { text: JSON.stringify({ ...summary, sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 300 } };
  } });
  const largeWindow = { ...modelProfile, windowTokens: 131072 };
  const sessionId = 'retry-compact';
  await store.initSession({ sessionId, settings: parseContextSettings({}) });
  // originali abbastanza lunghi perché la sintesi RIDUCA davvero (altrimenti CTX_NO_REDUCTION, giustamente)
  const lungo = ' ' + 'dettaglio '.repeat(400);
  for (const [i, message] of [{ role: 'user', content: 'Database SQLite' + lungo }, { role: 'assistant', content: 'risposta' + lungo }, { role: 'user', content: 'richiesta 2' + lungo }, { role: 'assistant', content: 'risposta' + lungo }].entries()) await engine.appendOriginal({ sessionId, record: { id: `${i % 2 ? 'a' : 'u'}${i}`, message, createdAt: now } });
  const started = await engine.startCompaction({ sessionId, sessionModel: largeWindow, idempotencyKey: 'retry-compact' });
  const job = await engine.waitForCompaction({ sessionId, jobId: started.id });
  assert.equal(job.state, 'committed', JSON.stringify(job.error));
  assert.ok(calls.length >= 2, 'la seconda chiamata è il ritentativo');
  assert.match(richieste[1], /precedente era troppo lunga/i, 'il ritentativo porta l’istruzione compatta');
});

test('CTX-SUMMARY-RETRY-ONCE: two truncations in a row fail with CTX_TRUNCATED_SUMMARY, no loop', async t => {
  let n = 0;
  const { engine, store } = await fixture(t, { summarize: () => { n++; return { text: '{"schema":"talos.context.summary.v1","text":"tronc', finishReason: 'length', usage: { inputTokens: 50, outputTokens: 2048 } }; } });
  const sessionId = 'retry-once';
  await store.initSession({ sessionId, settings: parseContextSettings({}) });
  for (const [i, message] of [{ role: 'user', content: 'Database SQLite' }, { role: 'assistant', content: 'risposta' }, { role: 'user', content: 'richiesta 2' }, { role: 'assistant', content: 'risposta' }].entries()) await engine.appendOriginal({ sessionId, record: { id: `${i % 2 ? 'a' : 'u'}${i}`, message, createdAt: now } });
  const started = await engine.startCompaction({ sessionId, sessionModel: { ...modelProfile, windowTokens: 131072 }, idempotencyKey: 'retry-once' });
  const job = await engine.waitForCompaction({ sessionId, jobId: started.id });
  assert.equal(job.state, 'failed'); assert.equal(job.error?.code, 'CTX_TRUNCATED_SUMMARY');
  assert.equal(n, 2, 'esattamente un ritentativo, poi basta');
});
