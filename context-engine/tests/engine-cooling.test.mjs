/*
 * 25/09/2026 — ticket della CLI «riassunto rifiutato richiesto a ogni passo»
 * (`docs/talos-cli/2026-09-25-ticket-desktop-ce-summary-retries.md`): la CLI ha contato 5 riassunti pagati in UN giro,
 * nessuno pubblicato, niente a schermo. Decisione owner 25/09 «pausa che cresce + segnale»: 60 s → 300 s → 900 s dopo un
 * fallimento (la scala di Hermes, `agent/context_compressor.py:768-783`, clone `65ad529`), un contatore per classe d'errore
 * che solo un riassunto riuscito azzera, e un avviso per lavoro fallito. La «Compatta» della persona non aspetta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine, raffreddamentoCompattazione, RAFFREDDAMENTO_DOPO_RIFIUTO_MS } from '../src/engine.mjs';
import { computeContextBudget } from '../src/compaction-planner.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const base = { provider: 'local', model: 'controlled-fixture', windowTokens: 131072, responseReserve: 2048, local: true };
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const summary = { schema: 'talos.context.summary.v1', text: 'Database SQLite, scelta confermata.', goal: 'Continuare il progetto', decisions: ['Database SQLite'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: 'u0', quote: 'Database SQLite' }] };
const T0 = Date.parse('2026-09-25T10:00:00.000Z');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-cooling-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  const clock = { now: T0 };
  const calls = [];
  // il riassuntore «rifiuta»: risponde in prosa, come il finto della CLI (s22, file COMPACTME)
  let rifiuta = true;
  // `aggancio`: qualcosa che succede DURANTE il prossimo riassunto (una volta sola) — per le corse del motore
  let aggancio = null;
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    calls.push(request);
    if (aggancio) { const fai = aggancio; aggancio = null; await fai(); }
    if (rifiuta) return { text: 'Non posso riassumere questa conversazione.', finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 8 } };
    const sourceId = JSON.parse(request.messages.at(-1).content).sourceIds?.[0] ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : sourceId.startsWith('a') ? 'risposta' : `richiesta ${sourceId.slice(1)}`;
    return { text: JSON.stringify({ ...summary, sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: model.provider, model: model.model }; } };
  // `muto`: un archivio che non scrive gli avvisi, per simulare un lavoro fallito PRIMA di questa versione
  const avvisiMuti = { muto: false };
  const porta = { ...store, recordContextNotice: args => avvisiMuti.muto ? Promise.resolve() : store.recordContextNotice(args) };
  const engine = createContextEngine({ store: porta, model, tokenCounter, clock: () => new Date(clock.now).toISOString() });
  const at = new Date(T0).toISOString();
  for (let i = 0; i < 5; i++) {
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `u${i}`, message: { role: 'user', content: i ? `richiesta ${i} ` + 'dati '.repeat(500) : 'Database SQLite ' + 'contesto '.repeat(500) }, createdAt: at } });
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `a${i}`, message: { role: 'assistant', content: 'risposta '.repeat(500) }, createdAt: at } });
  }
  let passo = 0;
  // un PASSO del giro: un messaggio in più nell'archivio ⇒ una revisione nuova (è ciò che cambiava la chiave `auto-…`)
  const passoDelGiro = () => engine.appendOriginal({ sessionId: 'chat', record: { id: `s${++passo}`, message: { role: passo % 2 ? 'user' : 'assistant', content: `passo ${passo}` }, createdAt: at } });
  const avvisi = async () => (await store.readContextOutbox({ sessionId: 'chat' })).filter(event => event.kind === 'context.compaction.cooling');
  const jobs = async () => (await engine.getContextState({ sessionId: 'chat' })).jobs;
  // una finestra in cui il contesto ENTRA ma ha passato la soglia d'avvio (compattazione in background), o NON entra
  const tokens = (await engine.prepareForRequest({ sessionId: 'chat', sessionModel: base })).measurement.inputTokens;
  const finestra = rapporto => {
    for (let windowTokens = 4096; windowTokens < 131072; windowTokens += 64) {
      const budget = computeContextBudget({ ...base, windowTokens, method: 'heuristic', inputTokens: tokens, settings: {} });
      if (tokens / budget.inputLimit <= rapporto) return { ...base, windowTokens };
    }
    throw new Error('nessuna finestra');
  };
  return { store, engine, calls, clock, passoDelGiro, avvisi, jobs, finestra, avvisiMuti, rifiuta: value => { rifiuta = value; },
    aggancia: fai => { aggancio = fai; } };
}

async function passoCompleto(engine, profile) {
  const prepared = await engine.prepareForRequest({ sessionId: 'chat', sessionModel: profile });
  if (prepared.job) await engine.waitForCompaction({ sessionId: 'chat', jobId: prepared.job.id });
  return prepared;
}

test('CTX-AUTO-COOLING-CAP: a refused summary is not requested again at every step of the turn, and the pause is said once', async t => {
  const f = await fixture(t);
  const profile = f.finestra(0.8);
  const K = 6;
  const risposte = [];
  for (let i = 0; i < K; i++) { await f.passoDelGiro(); risposte.push(await passoCompleto(f.engine, profile)); }
  const falliti = (await f.jobs()).filter(job => job.state === 'failed');
  assert.equal(falliti.length, 1, `one compaction per turn, not one per step (${falliti.length} failed jobs)`);
  const perLavoro = f.calls.length;
  assert.ok(perLavoro >= 1 && perLavoro <= 2, `summary requests ${perLavoro}`);
  assert.equal(falliti[0].error.code, 'CTX_INVALID_SUMMARY');
  // il giro prosegue col contesto intero finché entra, e ogni passo dopo il rifiuto DICE la pausa
  for (const risposta of risposte.slice(1)) {
    assert.equal(risposta.compactionCooling?.jobId, falliti[0].id);
    assert.equal(risposta.compactionCooling.waitSeconds, 60);
  }
  const avvisi = await f.avvisi();
  assert.equal(avvisi.length, 1, 'the pause notice must appear once, not once per step');
  assert.deepEqual({ id: avvisi[0].id, jobId: avvisi[0].jobId, payload: avvisi[0].payload }, {
    id: `cooling-${falliti[0].id}`, jobId: falliti[0].id,
    payload: { code: 'CTX_INVALID_SUMMARY', attempts: 1, waitSeconds: 60, retryAfter: new Date(Date.parse(falliti[0].updatedAt) + 60_000).toISOString() },
  });
});

test('CTX-AUTO-COOLING-LADDER: the wait grows 60 → 300 → 900 s, stays at 900, and a committed summary clears it', async t => {
  const f = await fixture(t);
  const profile = f.finestra(0.8);
  const fallitiOra = async () => (await f.jobs()).filter(job => job.state === 'failed').length;
  await f.passoDelGiro(); await passoCompleto(f.engine, profile);
  assert.equal(await fallitiOra(), 1);
  const attese = [];
  for (const [avanti, atteso] of [[59_000, 1], [2_000, 2], [299_000, 2], [2_000, 3], [899_000, 3], [2_000, 4]]) {
    f.clock.now += avanti;
    await f.passoDelGiro();
    const risposta = await passoCompleto(f.engine, profile);
    assert.equal(await fallitiOra(), atteso, `after +${avanti} ms`);
    if (risposta.compactionCooling) attese.push(risposta.compactionCooling.waitSeconds);
  }
  // la pausa letta a ogni passo: 60 (prima dello scadere), poi 300 dopo il secondo, 900 dopo il terzo, 900 dopo il quarto
  assert.deepEqual(attese, [60, 300, 900]);
  const ultimo = raffreddamentoCompattazione(await f.jobs(), new Date(f.clock.now).toISOString());
  assert.deepEqual([ultimo.attempts, ultimo.waitSeconds], [4, 900], 'the ladder stops at its last rung');
  assert.deepEqual((await f.avvisi()).map(event => event.payload.waitSeconds), [60, 300, 900, 900], 'one notice per failed job');
  // un riassunto riuscito azzera: dopo, un nuovo rifiuto riparte da 60 s
  f.rifiuta(false);
  f.clock.now += 901_000;
  await f.passoDelGiro(); await passoCompleto(f.engine, profile);
  assert.ok((await f.jobs()).some(job => job.state === 'committed'), 'the summary committed');
  assert.equal(raffreddamentoCompattazione(await f.jobs(), new Date(f.clock.now).toISOString()), null);
});

test('CTX-AUTO-COOLING-OVERFLOW: when the context no longer fits during the pause the refusal names it, and «Compatta» does not wait', async t => {
  const f = await fixture(t);
  const profile = f.finestra(1.2);
  await f.passoDelGiro();
  // la prima richiesta ASPETTA la compattazione (non entra): il rifiuto è quello del riassunto, e la pausa si annota lo stesso
  await assert.rejects(f.engine.prepareForRequest({ sessionId: 'chat', sessionModel: profile }), { code: 'CTX_INVALID_SUMMARY' });
  assert.equal((await f.avvisi()).length, 1, 'the pause notice is recorded even when the request dies');
  let richieste = f.calls.length;
  await f.passoDelGiro();
  await assert.rejects(f.engine.prepareForRequest({ sessionId: 'chat', sessionModel: profile }), error => {
    assert.equal(error.code, 'CTX_CONTEXT_OVERFLOW');
    assert.match(error.message, /in pausa ancora per circa 1 min/u);
    assert.match(error.message, /«Compatta»/u);
    return true;
  });
  assert.equal(f.calls.length, richieste, 'no new summary during the pause');
  assert.equal((await f.avvisi()).length, 1);
  // scaduto il primo gradino, un secondo rifiuto porta a 300 s: a 60 s dalla fine l'errore dice il tempo che RESTA
  f.clock.now += 61_000;
  await assert.rejects(f.engine.prepareForRequest({ sessionId: 'chat', sessionModel: profile }), { code: 'CTX_INVALID_SUMMARY' });
  richieste = f.calls.length;
  f.clock.now += 240_000;
  await assert.rejects(f.engine.prepareForRequest({ sessionId: 'chat', sessionModel: profile }), error => {
    assert.match(error.message, /in pausa ancora per circa 1 min/u, 'the step length (5 min) is not the time left');
    return true;
  });
  assert.equal(f.calls.length, richieste);
  // la persona chiede «Compatta»: parte subito
  f.rifiuta(false);
  const manuale = await f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'compatta-ora', sessionModel: profile });
  const finito = await f.engine.waitForCompaction({ sessionId: 'chat', jobId: manuale.id });
  assert.equal(finito.state, 'committed', JSON.stringify(finito.error));
  assert.ok(f.calls.length > richieste);
});

test('CTX-AUTO-COOLING-OLD-FAILURE: a request that finds the pause writes the notice a job failed without', async t => {
  const f = await fixture(t);
  const profile = f.finestra(0.8);
  f.avvisiMuti.muto = true; // il lavoro fallisce come prima di questa versione: nessun avviso
  await f.passoDelGiro(); await passoCompleto(f.engine, profile);
  const [fallito] = (await f.jobs()).filter(job => job.state === 'failed');
  assert.ok(fallito);
  assert.equal((await f.avvisi()).length, 0);
  f.avvisiMuti.muto = false;
  await f.passoDelGiro();
  const risposta = await passoCompleto(f.engine, profile);
  assert.equal(risposta.compactionCooling?.jobId, fallito.id);
  assert.deepEqual((await f.avvisi()).map(event => event.id), [`cooling-${fallito.id}`]);
});

test('CTX-COOLING-CLASSES: one counter per error class, cancelled jobs ignored, the latest success clears everything', () => {
  const job = (id, state, revision, code, updatedAt = '2026-09-25T10:00:00.000Z', createdAt = '2026-09-25T10:00:00.000Z') => ({ id, state, baseRevision: revision, createdAt, updatedAt, ...(code ? { error: { code, message: '' } } : {}) });
  // l'ultimo ESITO conta, non l'ultima creazione: un lavoro in pausa ripreso e fallito DOPO una «Compatta» riuscita creata più tardi
  const ripreso = job('p', 'failed', 1, 'CTX_INVALID_SUMMARY', '2026-09-25T10:00:20.000Z', '2026-09-25T09:00:00.000Z');
  const manuale = job('m', 'committed', 2, undefined, '2026-09-25T10:00:10.000Z', '2026-09-25T09:30:00.000Z');
  assert.equal(raffreddamentoCompattazione([ripreso, manuale], '2026-09-25T10:00:30.000Z')?.jobId, 'p', 'the latest outcome is a refusal');
  const adesso = '2026-09-25T10:00:30.000Z';
  assert.equal(raffreddamentoCompattazione([], adesso), null);
  // stesso istante di creazione: l'ordine lo dà la revisione di partenza
  const storia = [job('a', 'failed', 1, 'CTX_INVALID_SUMMARY'), job('b', 'failed', 2, 'CTX_TRUNCATED_SUMMARY'), job('c', 'cancelled', 3, 'CTX_JOB_CANCELLED'), job('d', 'failed', 4, 'CTX_INVALID_SUMMARY')];
  assert.deepEqual(raffreddamentoCompattazione(storia, adesso), { jobId: 'd', code: 'CTX_INVALID_SUMMARY', attempts: 2, waitSeconds: 300, failedAt: '2026-09-25T10:00:00.000Z', retryAfter: '2026-09-25T10:05:00.000Z' });
  assert.equal(raffreddamentoCompattazione([job('a', 'failed', 1, 'CTX_INVALID_SUMMARY'), job('x', 'cancelled', 2, 'CTX_JOB_CANCELLED')], adesso).jobId, 'a', 'a cancel after a refusal neither starts nor ends the pause');
  assert.equal(raffreddamentoCompattazione([...storia, job('e', 'committed', 5)], adesso), null, 'a committed summary clears the pause');
  assert.equal(raffreddamentoCompattazione([job('e', 'committed', 5), job('f', 'failed', 6, 'CTX_NO_REDUCTION')], adesso).attempts, 1, 'failures before the success do not count');
  assert.equal(raffreddamentoCompattazione([job('a', 'failed', 1, 'CTX_INVALID_SUMMARY')], '2026-09-25T10:01:00.000Z'), null, 'the pause ends exactly at its deadline');
  assert.deepEqual(RAFFREDDAMENTO_DOPO_RIFIUTO_MS, [60_000, 300_000, 900_000]);
});

/*
 * 25/09/2026 — la regressione misurata dalla CLI (`r5a-coord-ce-compaction`, 2-4 volte su 6): un riassunto VALIDO perso per
 * `CTX_STALE_REVISION` (lo stato è cambiato mentre si scriveva) faceva partire la pausa, e il giro moriva per contesto pieno.
 * Una corsa del motore non è un rifiuto: il passo dopo deve ripartire e pubblicare, nello stesso giro.
 */
test('CTX-AUTO-COOLING-STALE-RACE: a valid summary lost to a stale revision starts no pause, and the next step commits', async t => {
  const f = await fixture(t);
  f.rifiuta(false);
  const profile = f.finestra(0.8);
  // durante il riassunto cambia un'informazione protetta: lo stato del contesto si muove, il lavoro perde la corsa
  f.aggancia(async () => {
    const stato = await f.engine.getContextState({ sessionId: 'chat' });
    await f.engine.upsertProtectedFact({ sessionId: 'chat', fact: { id: 'db', text: 'Si usa SQLite.' }, expectedRevision: stato.revision, actor: 'owner' });
  });
  await f.passoDelGiro();
  await passoCompleto(f.engine, profile);
  const [perso] = (await f.jobs()).filter(job => job.state === 'failed');
  assert.equal(perso?.error?.code, 'CTX_STALE_REVISION', 'the race is reproduced');
  assert.equal((await f.avvisi()).length, 0, 'a race is not a refused summary: no pause notice');
  await f.passoDelGiro();
  const dopo = await passoCompleto(f.engine, profile);
  assert.equal(dopo.compactionCooling, undefined, 'no pause after a race');
  assert.ok((await f.jobs()).some(job => job.state === 'committed'), 'the next step of the same turn commits');
});

test('CTX-COOLING-ONLY-SUMMARY-FAILURES: engine races neither open nor close a pause; a refusal keeps its pause across them', () => {
  const job = (id, state, revision, code) => ({ id, state, baseRevision: revision, createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:00:00.000Z', ...(code ? { error: { code, message: '' } } : {}) });
  const adesso = '2026-09-25T10:00:30.000Z';
  for (const code of ['CTX_STALE_REVISION', 'CTX_MODEL_MISMATCH', 'CTX_NOTHING_TO_COMPACT', 'CTX_PROJECTION_MISALIGNED', 'CTX_MEASUREMENT_MISMATCH']) {
    assert.equal(raffreddamentoCompattazione([job('r', 'failed', 1, code)], adesso), null, code);
  }
  const rifiuto = job('a', 'failed', 1, 'CTX_INVALID_SUMMARY');
  assert.equal(raffreddamentoCompattazione([rifiuto, job('s', 'failed', 2, 'CTX_STALE_REVISION')], adesso)?.jobId, 'a', 'the refusal still pauses');
  // il fornitore che fallisce (rete, 5xx, tempo scaduto) conta, come in Hermes
  assert.equal(raffreddamentoCompattazione([job('p', 'failed', 1, 'CTX_COMPACTION_FAILED')], adesso)?.code, 'CTX_COMPACTION_FAILED');
});
