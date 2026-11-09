/*
 * 31/10/2026 — contratto «niente da compattare» (OK di Performance, Mobile e CLI;
 * `handoff-talos-2026-09-27/in-corso/PROPOSTA-COMPATTA-NIENTE-DA-RIDURRE-2026-10-31.md`).
 * Reperto dal vivo sulla 4177: un /compact su una conversazione di ~16,6k token ha pagato un riassunto (11.514 + 1.167 token, 23 s),
 * è finito CTX_NO_REDUCTION e ha aperto la pausa con «Nuovo tentativo automatico». Due cure:
 * (1) prima di pagare un riassunto CHIESTO, la richiesta si misura con un riassunto vuoto: sotto il 30% di guadagno ⇒
 *     CTX_NOTHING_TO_COMPACT, senza chiamare il modello né il contatore (regola owner 02/10 della Chat del telefono);
 * (2) un CTX_NO_REDUCTION di un lavoro chiesto non apre la pausa; quello automatico sì, come prima.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine, raffreddamentoCompattazione } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const base = { provider: 'local', model: 'controlled-fixture', windowTokens: 131072, responseReserve: 2048, local: true };
const riassunto = { schema: 'talos.context.summary.v1', text: 'Database SQLite, scelta confermata.', goal: 'Continuare il progetto', decisions: ['Database SQLite'], constraints: [], completed: [], pending: [], resources: [], sources: [] };

async function fixture(t, { scambi, parole, coda = 0, guadagnoMinimoChiesto }) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-niente-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  const riassunti = [];
  const conteggi = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    riassunti.push(request);
    const sourceId = JSON.parse(request.messages.at(-1).content).sourceIds?.[0] ?? 'u0';
    return { text: JSON.stringify({ ...riassunto, sources: [{ recordId: sourceId, quote: sourceId.startsWith('a') ? 'risposta' : 'Database SQLite' }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model }) {
    conteggi.push(1);
    return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: model.provider, model: model.model };
  } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => '2026-10-31T00:00:00.000Z', ...(guadagnoMinimoChiesto === undefined ? {} : { guadagnoMinimoChiesto }) });
  const at = '2026-10-31T00:00:00.000Z';
  for (let i = 0; i < scambi; i++) {
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `u${i}`, message: { role: 'user', content: `Database SQLite richiesta ${i} ` + 'dati '.repeat(parole) }, createdAt: at } });
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `a${i}`, message: { role: 'assistant', content: 'risposta '.repeat(parole) }, createdAt: at } });
  }
  // `coda`: due scambi grandi in fondo, quelli che restano interi — la parte da compattare pesa poco sul totale
  for (let i = 0; i < (coda ? 2 : 0); i++) {
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `cu${i}`, message: { role: 'user', content: `coda ${i} ` + 'testo '.repeat(coda) }, createdAt: at } });
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `ca${i}`, message: { role: 'assistant', content: 'risposta '.repeat(coda) }, createdAt: at } });
  }
  return { engine, riassunti, conteggi };
}

test('NIENTE-DA-COMPATTARE-01: a requested compaction of a short conversation answers «nothing to compact» without calling the model or the counter', async t => {
  const f = await fixture(t, { scambi: 3, parole: 3 });
  await assert.rejects(
    f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'manuale-1', sessionModel: base }),
    error => error.code === 'CTX_NOTHING_TO_COMPACT',
  );
  assert.equal(f.riassunti.length, 0, 'no summary is paid for');
  assert.equal(f.conteggi.length, 0, 'the check is local: no counter request before the answer (Performance, 31/10)');
});

test('NIENTE-DA-COMPATTARE-02 (the other way): a requested compaction of a long conversation still starts and pays the summary', async t => {
  const f = await fixture(t, { scambi: 5, parole: 500 });
  const job = await f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'manuale-2', sessionModel: base });
  const fine = await f.engine.waitForCompaction({ sessionId: 'chat', jobId: job.id });
  assert.ok(f.riassunti.length >= 1, `the summary was asked for (${fine.state} ${fine.error?.code ?? ''} ${fine.error?.message ?? ''})`);
  assert.equal(fine.state, 'committed');
});

test('NIENTE-DA-COMPATTARE-03: a requested job that did not reduce opens no pause; an automatic one still does', () => {
  const job = (id, idempotencyKey) => ({ id, state: 'failed', baseRevision: 1, createdAt: '2026-10-31T00:00:00.000Z', updatedAt: '2026-10-31T00:00:00.000Z', idempotencyKey, error: { code: 'CTX_NO_REDUCTION', message: '' } });
  const adesso = '2026-10-31T00:00:30.000Z';
  assert.equal(raffreddamentoCompattazione([job('m', 'manuale-1')], adesso), null, 'asked by the person: no pause, no retry');
  assert.equal(raffreddamentoCompattazione([job('a', 'auto-mabcdef0123456789-1-x')], adesso)?.jobId, 'a', 'automatic: the pause stays as before');
  assert.equal(raffreddamentoCompattazione([job('s', undefined)], adesso)?.jobId, 's', 'a job without a key keeps the old rule');
});

test('NIENTE-DA-COMPATTARE-04: the threshold is 30% — a conversation that would free about a tenth answers «nothing», the same one with a 5% threshold starts', async t => {
  const forma = { scambi: 3, parole: 120, coda: 1200 };
  const vera = await fixture(t, forma);
  await assert.rejects(vera.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'manuale-4', sessionModel: base }), { code: 'CTX_NOTHING_TO_COMPACT' });
  assert.equal(vera.riassunti.length, 0);
  // il controllo: la stessa conversazione sta DAVVERO fra 5% e 30% (altrimenti la prova non distinguerebbe la soglia)
  const bassa = await fixture(t, { ...forma, guadagnoMinimoChiesto: 0.05 });
  const job = await bassa.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'manuale-4', sessionModel: base });
  assert.ok(job.id, 'with a 5% threshold the same conversation starts a compaction');
});

/* Mobile, revisione del diff (31/10): «Rigenera» riscrive una conversazione GIÀ compattata, che non guadagna il 30% per definizione. Il
   controllo vale solo per «Compatta»: Rigenera parte e chiama il modello. */
test('NIENTE-DA-COMPATTARE-05: «Regenerate» on a conversation already compacted still starts and calls the model', async t => {
  const f = await fixture(t, { scambi: 5, parole: 500 });
  const prima = await f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'manuale-5', sessionModel: base });
  assert.equal((await f.engine.waitForCompaction({ sessionId: 'chat', jobId: prima.id })).state, 'committed');
  await assert.rejects(f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'manuale-5b', sessionModel: base }), { code: 'CTX_NOTHING_TO_COMPACT' }, 'compacted, a second «Compact» has nothing to gain');
  const chiamatePrima = f.riassunti.length;
  const rigenera = await f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'rigenera-5', sessionModel: base, kind: 'regenerate' });
  await f.engine.waitForCompaction({ sessionId: 'chat', jobId: rigenera.id });
  assert.ok(f.riassunti.length > chiamatePrima, '«Regenerate» asked the model again');
});

/* Performance, revisione del diff (31/10): il controllo sta nel percorso di un clic e deve restare istantaneo. Su una conversazione grande
   (~1 MB di testo) la risposta arriva in meno di 200 ms (soglia larga: due JSON e due codifiche a byte). */
test('NIENTE-DA-COMPATTARE-06: on a large conversation the check answers within 200 ms', async t => {
  const f = await fixture(t, { scambi: 2, parole: 50, coda: 60_000 });
  const t0 = performance.now();
  await assert.rejects(f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'manuale-6', sessionModel: { ...base, windowTokens: 1_048_576 } }), { code: 'CTX_NOTHING_TO_COMPACT' });
  const ms = performance.now() - t0;
  assert.ok(ms < 200, `the check took ${ms.toFixed(1)} ms`);
});
