/*
 * Owner 27/10/2026 notte, «Si annulla, come Codex» — dal file dell'owner (sessione 9eea8edf, richieste 12 e 13): dopo uno Stop la storia non
 * combaciava con l'archivio, e la riparazione automatica (owner 12/10) era VIETATA perché un riassunto in sottofondo era fermo da 30
 * minuti sul limite del piano: l'archivio non mette da parte con un lavoro attivo (CTX_JOB_ACTIVE). Ora il riassunto vecchio si annulla
 * e la richiesta prosegue (Codex `core/src/session/async_compaction.rs:2`, `:24-30`, `:134`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };
const ATTIVI = (jobs) => (jobs ?? []).filter((j) => !['committed', 'failed', 'cancelled', 'paused'].includes(j.state));

/* `obbediente`: il riassuntore si ferma al segnale (il fornitore vero: fetch annullata); altrimenti resta appeso anche dopo l'annullamento */
async function scena(t, { obbediente }) {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  const appesi = []; // i riassunti che non obbediscono: si liberano solo a fine prova, o la chiusura del servizio li aspetterebbe per sempre
  const summarize = ({ signal }) => new Promise((_, rifiuta) => {
    if (obbediente) signal?.addEventListener('abort', () => rifiuta(signal.reason ?? new Error('aborted')), { once: true });
    else appesi.push(() => rifiuta(new Error('liberato a fine prova')));
  });
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize }, tokenCounter: contatore, clock: () => '2026-10-27T20:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test', conclusa: true } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-27T20:00:00.000Z' });
  t.after(async () => { for (const libera of appesi) libera(); await service.close(); store.close(); }); // prima il servizio, poi l'archivio
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const lunga = (i) => ({ role: i % 2 ? 'assistant' : 'user', content: `messaggio ${i} `.repeat(400) });
  const PRIMA = Array.from({ length: 12 }, (_, i) => lunga(i));
  await hooks.prepare({ messages: PRIMA, originali: PRIMA, tools: [] });
  const snap = await store.readContextSnapshot({ sessionId: 'chat' });
  // il riassunto in sottofondo, avviato e mai finito (non si aspetta)
  void service.request({ sessionId: 'chat', method: 'POST', path: '/jobs', body: { kind: 'compact', expectedRevision: snap.revision, idempotencyKey: 'k-1' } }).catch(() => {});
  for (let i = 0; i < 50 && !ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length, 1, 'la scena ha davvero un lavoro attivo');
  // lo Stop: la storia attiva perde la coda dell'ultimo scambio
  const DOPO = [...PRIMA.slice(0, 10), { role: 'user', content: 'D\'ora in poi farai tutto inline' }];
  return { store, hooks, PRIMA, DOPO };
}

test('ARCHIVIO-LAVORO-ATTIVO-01 — un riassunto in sottofondo su una storia vecchia si annulla, l\'archivio si ripara e la richiesta prosegue', async (t) => {
  const { store, hooks, PRIMA, DOPO } = await scena(t, { obbediente: true });
  const esito = await hooks.prepare({ messages: DOPO, originali: DOPO, tools: [] });
  assert.ok(Array.isArray(esito.messages) && esito.messages.length > 0, 'la richiesta ha la sua proiezione');
  assert.ok(esito.riallineato?.asideId, 'e dice che l\'archivio è stato riallineato');
  assert.deepEqual((await store.readOriginals({ sessionId: 'chat' })).map((r) => r.message), DOPO, 'l\'archivio vivo è la storia attiva');
  assert.deepEqual((await store.readOriginals({ sessionId: esito.riallineato.asideId })).map((r) => r.message), PRIMA, 'niente si è perso');
  assert.equal(ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length, 0, 'nessun lavoro attivo resta sulla conversazione viva');
  const daParte = await store.readContextSnapshot({ sessionId: esito.riallineato.asideId });
  assert.deepEqual((daParte?.jobs ?? []).map((j) => j.state), ['cancelled'], 'il riassunto vecchio è annullato, e sta con la copia messa da parte');
});

test('ARCHIVIO-LAVORO-ATTIVO-02 — anche un esecutore che NON si ferma (il fornitore appeso) non blocca: il lavoro è segnato annullato e la riparazione arriva entro il tetto', async (t) => {
  const { store, hooks, DOPO } = await scena(t, { obbediente: false });
  const inizio = Date.now();
  const esito = await hooks.prepare({ messages: DOPO, originali: DOPO, tools: [] });
  const durata = Date.now() - inizio;
  assert.ok(durata < 5_000, `la richiesta non aspetta il riassunto appeso: ${durata} ms`);
  assert.ok(esito.riallineato?.asideId);
  assert.deepEqual((await store.readOriginals({ sessionId: 'chat' })).map((r) => r.message), DOPO);
  assert.equal(ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length, 0);
});
