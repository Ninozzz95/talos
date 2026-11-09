/*
 * FE-053 (forma del Mobile, 01/11/2026): chi ha scritto il riassunto quando non è lo scelto entra in `context.version.committed`, dentro il payload che c'è già.
 * Evento a sé scartato: partirebbe prima del salvataggio, e un lavoro scartato lascerebbe nel giornale una compattazione mai avvenuta. Nessuna colonna e nessuna
 * migrazione: gli archivi già sui dispositivi restano leggibili. Performance: solo quando scrive la riserva, così il giornale non cresce sui riassunti normali.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { ContextEventV1, parseContextSettings } from '../src/contracts.mjs';

const profilo = { provider: 'openrouter', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048 };
const ora = '2026-11-01T00:00:00.000Z';
const CONSEGNA = 'Database SQLite: leggi i dieci file e dimmi cosa contengono.';
const lettura = (k) => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${k}.txt` }) } }] });
const risultato = (k) => ({ role: 'tool', tool_call_id: `c${k}`, content: [{ type: 'text', text: `file ${k}: ${'riga di contenuto '.repeat(400)}` }] });

async function scena(t, { provenienza = null, rifiuta = false } = {}) {
  const cartella = await mkdtemp(join(tmpdir(), 'tcec-provenienza-'));
  const store = createSqliteContextStore({ databasePath: join(cartella, 'context.sqlite') });
  await store.initSession({ sessionId: 's', settings: parseContextSettings({ auto: true, triggerRatio: 0.5, targetRatio: 0.49 }) });
  const summarize = async (richiesta) => {
    if (rifiuta) throw Object.assign(new Error('rifiutato'), { code: 'CTX_INVALID_SUMMARY' });
    const sourceIds = JSON.parse(richiesta.messages.at(-1).content).sourceIds ?? [];
    const sourceId = sourceIds.find((id) => id === 'u0' || id.startsWith('t')) ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : `file ${sourceId.slice(1)}:`;
    return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Letti i file.', goal: 'Leggere i file', decisions: [], constraints: [], completed: ['letti'], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] }),
      finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 }, ...(provenienza ? { provenienza } : {}) };
  };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize }, tokenCounter, clock: () => ora });
  const aggiungi = (id, message) => engine.appendOriginal({ sessionId: 's', record: { id, message, createdAt: ora } });
  await aggiungi('s0', { role: 'system', content: 'Sei un assistente.' });
  await aggiungi('u0', { role: 'user', content: CONSEGNA });
  for (let k = 1; k <= 10; k += 1) { await aggiungi(`a${k}`, lettura(k)); await aggiungi(`t${k}`, risultato(k)); }
  await aggiungi('r0', { role: 'assistant', content: 'Letti tutti e dieci.' });
  await aggiungi('u1', { role: 'user', content: 'Grazie, e adesso?' }); // l'ultimo scambio resta intero: il riassunto lavora su quello prima
  await aggiungi('r1', { role: 'assistant', content: 'Niente altro.' });
  t.after(async () => { await store.close(); await rm(cartella, { recursive: true, force: true }); });
  return { engine, store };
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

const PROVENIENZA = { riassuntoDi: 'anthropic:riserva', dallaRiserva: true, nonDisponibile: { modello: 'openai:scelto', stato: 'bloccato', motivo: 'limite', finoAlle: 1_800_000_000_000, diAccount: true } };

test('PROVENIENZA-01 — scrive la riserva: il salvataggio lo pubblica nel payload, legato al lavoro, e l\'evento resta valido', async (t) => {
  const s = await scena(t, { provenienza: PROVENIENZA });
  const job = await compatta(s);
  assert.equal(job.state, 'committed', JSON.stringify(job));
  const [evento] = await versioni(s);
  assert.deepEqual(evento.payload.provenienza, PROVENIENZA);
  assert.equal(evento.jobId, job.id);
  assert.ok(Number.isSafeInteger(evento.payload.coveredThrough), 'il payload di prima resta');
  ContextEventV1.parse(evento);
});

test('PROVENIENZA-02 — al contrario: un riassunto normale non aggiunge niente al giornale', async (t) => {
  const s = await scena(t);
  await compatta(s);
  const [evento] = await versioni(s);
  assert.deepEqual(Object.keys(evento.payload), ['coveredThrough']);
});

test('PROVENIENZA-03 — un lavoro che non si salva non lascia niente: è il motivo per cui non è un evento a sé', async (t) => {
  const s = await scena(t, { provenienza: PROVENIENZA, rifiuta: true });
  const job = await compatta(s);
  assert.notEqual(job.state, 'committed');
  assert.deepEqual(await versioni(s), []);
});
