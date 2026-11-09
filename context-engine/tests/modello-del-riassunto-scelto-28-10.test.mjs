/*
 * C6 (contratto «mai aspettare», 27/10; forma concordata con la CLI il 28/10): la persona sceglie nelle Impostazioni il modello che scrive i
 * riassunti. Due trappole del motore, trovate dalla CLI leggendo il codice:
 *   1. `execute()` rileggeva il modello del riassunto e, se nel frattempo la persona l'aveva cambiato, falliva «Il modello di sintesi è
 *      cambiato»: un lavoro di sottofondo finiva «fallito» per un cambio VOLUTO. Ora un lavoro finisce col modello con cui è partito
 *      (`pinned: job.model` a chi risolve); la scelta nuova vale dal lavoro dopo.
 *   2. la chiave dei lavori automatici (`auto-…`) dipendeva solo dal modello della conversazione: dopo un riassunto fallito con A, la
 *      persona sceglie B per quello, e la stessa versione della storia ritrovava il lavoro di A ⇒ CTX_IDEMPOTENCY_CONFLICT. Ora una
 *      chiave automatica porta anche il modello del riassunto. Una chiave scelta da chi chiama (/compact) resta severa come prima.
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

const conversazione = { provider: 'openrouter', model: 'z-ai/glm-5.3-flash', windowTokens: 16384, responseReserve: 2048 };
const modelloA = { provider: 'openrouter', model: 'modello-a', windowTokens: 16384, responseReserve: 2048 };
const modelloB = { provider: 'openrouter', model: 'modello-b', windowTokens: 16384, responseReserve: 2048 };
const now = '2026-10-28T09:00:00.000Z';
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const summary = { schema: 'talos.context.summary.v1', text: 'Database SQLite, scelta confermata.', goal: 'Continuare il progetto', decisions: ['Database SQLite'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: 'u0', quote: 'Database SQLite' }] };

/** Chi risolve il modello del riassunto: come l'adattatore vero, un lavoro avviato porta il SUO modello (`pinned`); altrimenti la scelta di adesso. */
async function scena(t, { fallisceCon = null } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-modello-scelto-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  const stato = { scelta: modelloA, risoluzioni: [], cancello: null };
  const chiamate = [];
  const model = {
    resolveModel: async ({ sessionModel, pinned }) => {
      stato.risoluzioni.push(pinned ?? null);
      if (stato.cancello && stato.risoluzioni.length === stato.cancello.alla) await stato.cancello.promessa;
      return pinned ? [modelloA, modelloB, sessionModel].find((m) => m.model === pinned.model) ?? pinned : (stato.scelta ?? sessionModel);
    },
    summarize: async (request) => {
      chiamate.push(request.model.model);
      if (fallisceCon && request.model.model === fallisceCon) throw Object.assign(new Error('blocked'), { code: 'CTX_SUMMARY_FAILED' });
      const sourceId = JSON.parse(request.messages.at(-1).content).sourceIds?.[0] ?? 'u0';
      const quote = sourceId === 'u0' ? 'Database SQLite' : sourceId.startsWith('a') ? 'risposta' : `richiesta ${sourceId.slice(1)}`;
      return { text: JSON.stringify({ ...summary, sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
    },
  };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now });
  for (let i = 0; i < 5; i++) {
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `u${i}`, message: { role: 'user', content: i ? `richiesta ${i} ` + 'dati '.repeat(500) : 'Database SQLite ' + 'contesto '.repeat(500) }, createdAt: now } });
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `a${i}`, message: { role: 'assistant', content: 'risposta '.repeat(500) }, createdAt: now } });
  }
  return { engine, stato, chiamate };
}

test('MODELLO-SCELTO-01 — la persona cambia il modello del riassunto mentre un lavoro è in volo: il lavoro finisce col modello con cui è partito, niente «fallito»', async (t) => {
  const { engine, stato, chiamate } = await scena(t);
  let apri; stato.cancello = { alla: 2, promessa: new Promise((r) => { apri = r; }) }; // la seconda risoluzione è quella del lavoro in esecuzione
  const lavoro = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'manuale-1', sessionModel: conversazione });
  assert.equal(lavoro.model.model, 'modello-a', 'il lavoro nasce col modello scelto adesso');
  for (let i = 0; i < 200 && stato.risoluzioni.length < 2; i += 1) await new Promise((r) => setTimeout(r, 5));
  stato.scelta = modelloB; // la persona cambia idea dalle Impostazioni
  apri();
  const finito = await engine.waitForCompaction({ sessionId: 'chat', jobId: lavoro.id });
  assert.equal(finito.state, 'committed', JSON.stringify(finito.error ?? null));
  assert.ok(chiamate.length >= 1 && chiamate.every((m) => m === 'modello-a'), `riassunto scritto col modello di partenza: ${JSON.stringify(chiamate)}`);
  assert.equal(stato.risoluzioni[1]?.model, 'modello-a', 'chi risolve riceve il modello del lavoro (`pinned`), non la scelta di adesso');
});

test('MODELLO-SCELTO-02 — dopo un riassunto automatico fallito col modello A, la persona sceglie B: la stessa versione della storia parte con B, niente conflitto di chiave', async (t) => {
  const { engine, stato } = await scena(t, { fallisceCon: 'modello-a' });
  const primo = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'auto-7-abc', sessionModel: conversazione });
  assert.equal((await engine.waitForCompaction({ sessionId: 'chat', jobId: primo.id })).state, 'failed', 'premessa: il riassunto con A è fallito');
  stato.scelta = modelloB;
  const secondo = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'auto-7-abc', sessionModel: conversazione });
  assert.notEqual(secondo.id, primo.id, 'un lavoro nuovo');
  assert.equal(secondo.model.model, 'modello-b');
  assert.equal((await engine.waitForCompaction({ sessionId: 'chat', jobId: secondo.id })).state, 'committed');
  // al contrario: con lo STESSO modello la stessa chiave ritrova lo stesso lavoro (idempotenza intatta)
  const ancora = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'auto-7-abc', sessionModel: conversazione });
  assert.equal(ancora.id, secondo.id);
});

test('MODELLO-SCELTO-03 — al contrario: una chiave scelta da chi chiama resta severa — stesso nome, modello diverso ⇒ conflitto, come prima', async (t) => {
  const { engine, stato } = await scena(t, { fallisceCon: 'modello-a' });
  const primo = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'manuale-x', sessionModel: conversazione });
  await engine.waitForCompaction({ sessionId: 'chat', jobId: primo.id });
  stato.scelta = modelloB;
  await assert.rejects(engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'manuale-x', sessionModel: conversazione }), { code: 'CTX_IDEMPOTENCY_CONFLICT' });
});
