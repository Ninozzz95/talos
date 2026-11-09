/*
 * C8 del contratto «la chat non aspetta mai il riassunto» (con la CLI, 27/10/2026 notte): un riassunto in sottofondo ancora in volo quando
 * la sessione si chiude si ANNULLA alla chiusura — nessuna richiesta dopo, nessun tempo appeso. La chiusura annullava già ogni lavoro non
 * concluso (F2 della CLI, 16/10), ma poi lo aspettava SENZA tetto: un esecutore che non si ferma subito (un fornitore appeso, la finta
 * della sonda della CLI che tiene il riassunto 20 s) teneva ferma la chiusura, e con lei il RunFinished di `talos -p` (misura della CLI
 * del 28/10: 20 s dopo l'ultima richiesta). Come la riparazione dell'archivio (`annullaLavoriVecchi`): si annulla, si aspetta al più
 * `ATTESA_ANNULLAMENTO_MS`, si va avanti.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'openrouter', model: 'test', windowTokens: 200_000, responseReserve: 2048 };
const ATTIVI = (jobs) => (jobs ?? []).filter((j) => !['committed', 'failed', 'cancelled', 'paused'].includes(j.state));

test('CHIUSURA-NON-ASPETTA-01 — a background summary whose executor does not stop does not hold the close: cancelled, and close returns within the bound', async (t) => {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  const appesi = [];
  /* un esecutore che NON ascolta il segnale: resta appeso finché la prova non lo libera, a fine prova */
  const summarize = () => new Promise((_, rifiuta) => { appesi.push(() => rifiuta(new Error('liberato a fine prova'))); });
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize }, tokenCounter: contatore, clock: () => '2026-10-28T08:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'openrouter:test', conclusa: false } : null), isSessionEnabled: (id) => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-28T08:00:00.000Z' });
  t.after(async () => { for (const libera of appesi) libera(); store.close(); });
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const lunga = (i) => ({ role: i % 2 ? 'assistant' : 'user', content: `messaggio ${i} `.repeat(400) });
  const STORIA = Array.from({ length: 12 }, (_, i) => lunga(i));
  await hooks.prepare({ messages: STORIA, originali: STORIA, tools: [] });
  const snap = await store.readContextSnapshot({ sessionId: 'chat' });
  void service.request({ sessionId: 'chat', method: 'POST', path: '/jobs', body: { kind: 'compact', expectedRevision: snap.revision, idempotencyKey: 'k-1' } }).catch(() => {});
  for (let i = 0; i < 50 && !ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length, 1, 'premise: a summary in flight');
  const inizio = Date.now();
  const chiusa = await Promise.race([service.close().then(() => 'chiusa'), new Promise((r) => { setTimeout(() => r('APPESA'), 8_000); })]);
  assert.equal(chiusa, 'chiusa', 'the close waited for the stuck summary');
  assert.ok(Date.now() - inizio < 5_000, `${Date.now() - inizio} ms`);
  assert.equal(ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length, 0, 'the summary is cancelled, not left running');
});

test('CHIUSURA-NON-ASPETTA-02 — the AUTOMATIC summary of a request (the engine answered «not ready») is cancelled at close within the bound too', async (t) => {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  const appesi = [];
  const summarize = () => new Promise((_, rifiuta) => { appesi.push(() => rifiuta(new Error('liberato a fine prova'))); });
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize }, tokenCounter: contatore, clock: () => '2026-10-28T08:00:00.000Z' });
  const PICCOLO = { ...MODELLO, windowTokens: 16_384 };
  const service = createDesktopContextService({ store, engine, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'openrouter:test', conclusa: false } : null), isSessionEnabled: (id) => id === 'chat', resolveSessionModel: async () => PICCOLO, clock: () => '2026-10-28T08:00:00.000Z' });
  t.after(async () => { for (const libera of appesi) libera(); store.close(); });
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const lunga = (i) => ({ role: i % 2 ? 'assistant' : 'user', content: `messaggio ${i} `.repeat(600) });
  const STORIA = Array.from({ length: 14 }, (_, i) => lunga(i));
  await assert.rejects(hooks.prepare({ messages: STORIA, originali: STORIA, tools: [], summaryCeilingMs: 0 }), { code: 'CTX_SUMMARY_NOT_READY' });
  assert.equal(ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length, 1, 'premise: the automatic summary is in flight');
  /* l'esecutore deve essere davvero dentro il riassunto (appeso), non ancora in coda: lì l'annullamento lo fermerebbe prima */
  for (let i = 0; i < 100 && appesi.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(appesi.length >= 1, 'premise: the executor is inside the summary call');
  const inizio = Date.now();
  const chiusa = await Promise.race([service.close().then(() => 'chiusa'), new Promise((r) => { setTimeout(() => r('APPESA'), 8_000); })]);
  assert.equal(chiusa, 'chiusa', 'the close waited for the stuck automatic summary');
  assert.ok(Date.now() - inizio < 5_000, `${Date.now() - inizio} ms`);
  assert.equal(ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length, 0, 'cancelled');
});
