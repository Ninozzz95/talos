/*
 * Revisione del Blocco 21: prove del revisore, non parte del prodotto.
 * R-A: la provenienza si fissa PRIMA di `validateSummary`. Un tentativo della riserva scartato perché il formato è sbagliato lascia la firma
 *      anche se il riassunto salvato è scritto dal modello scelto al tentativo dopo.
 * R-B: la riparazione dell'archivio sposta lavori e versioni nella copia da parte: la scheda Contesto riparte da zero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const profilo = { provider: 'openrouter', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048 };
const ora = '2026-11-01T00:00:00.000Z';
const CONSEGNA = 'Database SQLite: leggi i dieci file e dimmi cosa contengono.';
const lettura = (k) => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${k}.txt` }) } }] });
const risultato = (k) => ({ role: 'tool', tool_call_id: `c${k}`, content: [{ type: 'text', text: `file ${k}: ${'riga di contenuto '.repeat(400)}` }] });
const PROVENIENZA = { riassuntoDi: 'anthropic:riserva', dallaRiserva: true, nonDisponibile: { modello: 'openai:scelto', stato: 'bloccato', motivo: 'limite' } };

async function scena(t, risposta, { faultPoint } = {}) {
  const cartella = await mkdtemp(join(tmpdir(), 'tcec-rev21-'));
  const store = createSqliteContextStore({ databasePath: join(cartella, 'context.sqlite'), ...(faultPoint ? { faultPoint } : {}) });
  await store.initSession({ sessionId: 's', settings: parseContextSettings({ auto: true, triggerRatio: 0.5, targetRatio: 0.49 }) });
  const chiamate = [];
  const summarize = async (richiesta) => {
    const sourceIds = JSON.parse(richiesta.messages.at(-1).content).sourceIds ?? [];
    const sourceId = sourceIds.find((id) => id === 'u0' || id.startsWith('t')) ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : `file ${sourceId.slice(1)}:`;
    const valido = JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Letti i file.', goal: 'Leggere i file', decisions: [], constraints: [], completed: ['letti'], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] });
    chiamate.push(1);
    return risposta({ valido, numero: chiamate.length });
  };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize }, tokenCounter, clock: () => ora });
  const aggiungi = (id, message) => engine.appendOriginal({ sessionId: 's', record: { id, message, createdAt: ora } });
  await aggiungi('s0', { role: 'system', content: 'Sei un assistente.' });
  await aggiungi('u0', { role: 'user', content: CONSEGNA });
  for (let k = 1; k <= 10; k += 1) { await aggiungi(`a${k}`, lettura(k)); await aggiungi(`t${k}`, risultato(k)); }
  await aggiungi('r0', { role: 'assistant', content: 'Letti tutti e dieci.' });
  await aggiungi('u1', { role: 'user', content: 'Grazie, e adesso?' });
  await aggiungi('r1', { role: 'assistant', content: 'Niente altro.' });
  t.after(async () => { await store.close(); await rm(cartella, { recursive: true, force: true }); });
  return { engine, store, chiamate };
}
const compatta = async ({ engine }) => {
  const job = await engine.startCompaction({ sessionId: 's', idempotencyKey: 'k1', kind: 'compact', sessionModel: profilo });
  for (let i = 0; i < 400; i += 1) {
    const stato = (await engine.getContextState({ sessionId: 's' })).jobs.find((j) => j.id === job.id);
    if (['committed', 'failed', 'cancelled', 'paused'].includes(stato?.state)) return stato;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('il lavoro non finisce');
};
const versioni = async ({ store }) => (await store.readContextOutbox({ sessionId: 's', limit: 50 })).filter((e) => e.kind === 'context.version.committed');

test('REV21-A — la riserva scrive un formato sbagliato, il modello scelto scrive quello buono: chi ha scritto NON è la riserva', async (t) => {
  const s = await scena(t, ({ valido, numero }) => (numero === 1
    ? { text: 'non è JSON', finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 }, provenienza: PROVENIENZA }
    : { text: valido, finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } }));
  const job = await compatta(s);
  assert.equal(job.state, 'committed', JSON.stringify(job));
  const pezzi = s.chiamate.length - 1; // il primo tentativo del primo pezzo è scartato e rifatto; tutti gli altri sono validi e senza riserva
  assert.ok(pezzi >= 1, `premessa: almeno un pezzo rifatto dopo lo scarto (${s.chiamate.length} chiamate)`);
  const [evento] = await versioni(s);
  assert.equal(evento.payload.provenienza, undefined, `il riassunto salvato è del secondo tentativo, senza riserva: ${JSON.stringify(evento.payload.provenienza)}`);
});

test('REV21-A-contrario — se è la riserva a scrivere il riassunto salvato la firma resta', async (t) => {
  const s = await scena(t, ({ valido }) => ({ text: valido, finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 }, provenienza: PROVENIENZA }));
  await compatta(s);
  const [evento] = await versioni(s);
  assert.deepEqual(evento.payload.provenienza, PROVENIENZA);
});

test('REV21-L — «La conversazione resta intera» con CTX_PERSISTENCE_FAILED: il salvataggio cade a metà transazione e originali e versione restano com\'erano', async (t) => {
  const s = await scena(t, ({ valido }) => ({ text: valido, finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 }, provenienza: PROVENIENZA }), { faultPoint: 'publish-after-outbox' });
  const prima = (await s.store.readOriginals({ sessionId: 's' })).length;
  const job = await compatta(s);
  assert.equal(job.state, 'failed', JSON.stringify(job));
  assert.equal(job.error.code, 'CTX_PERSISTENCE_FAILED');
  const stato = await s.engine.getContextState({ sessionId: 's' });
  assert.equal((await s.store.readOriginals({ sessionId: 's' })).length, prima, 'originali intatti');
  assert.equal(stato.activeVersion ?? null, null, 'nessuna versione a metà');
  assert.deepEqual(await versioni(s), [], 'nessuna riga falsa nel giornale');
});

test('REV21-B — dopo la riparazione dell\'archivio i lavori e la versione attiva non sono più nella conversazione', async (t) => {
  const s = await scena(t, ({ valido }) => ({ text: valido, finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } }));
  await compatta(s);
  const prima = await s.engine.getContextState({ sessionId: 's' });
  assert.equal(prima.jobs.filter((j) => j.state === 'committed').length, 1, 'premessa: una compattazione in vigore');
  await s.store.setAsideSession({ sessionId: 's', asideId: 's.aside-1000-abcdef01' });
  const dopo = await s.engine.getContextState({ sessionId: 's' });
  assert.equal(dopo.jobs.filter((j) => j.state === 'committed').length, 0, 'la scheda Contesto conta questi lavori');
  assert.equal(dopo.activeVersion ?? null, null, 'nessuna versione in vigore');
});
