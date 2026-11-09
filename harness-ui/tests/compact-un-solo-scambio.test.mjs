/*
 * Chiusura della compattazione, banco dal vivo del 31/10/2026 sera (piano ChatGPT): il /compact a mano dopo un solo giro, anche enorme, rispondeva 500 INTERNAL_ERROR in 3 corse
 * su 3. Il motore dice CTX_NOTHING_TO_COMPACT (tiene intero l'ultimo scambio, e non ce n'è un altro), e la rotta non conosce quel codice. Chi preme «Compatta» su un solo giro lungo
 * vuole lo spazio: si compatta dentro il giro, come fa il motore da solo quando il contesto non basta. Se non c'è davvero niente, lo si dice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'h'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };

async function scena(t, { rifiutaCon = null } = {}) {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  let chiamate = 0;
  const summarize = async () => { chiamate += 1; throw new Error('riassunto finito male'); };
  const vero = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize }, tokenCounter: contatore, clock: () => '2026-10-31T10:00:00.000Z' });
  /* un lavoro che il motore rifiuta col codice dato: la strada vera, fino al rifiuto */
  const engine = rifiutaCon === null ? vero : { ...vero, startCompaction: async () => { throw Object.assign(new Error('rifiutato'), { code: rifiutaCon }); } };
  const service = createDesktopContextService({ store, engine, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:test', conclusa: true } : null), isSessionEnabled: (id) => id === 'chat', resolveSessionModel: async () => MODELLO });
  t.after(async () => { await service.close(); store.close(); });
  return { service, chiamate: () => chiamate };
}
const lettura = (i) => [
  { role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
  { role: 'tool', tool_call_id: `c${i}`, content: `riga ${i} `.repeat(800) },
];

test('COMPACT-UN-GIRO-01 un solo giro lungo si compatta dentro il giro: nessun errore, e il riassunto parte', async (t) => {
  const { service, chiamate } = await scena(t);
  const messages = [{ role: 'user', content: 'Leggi tutto' }];
  for (let i = 0; i < 6; i++) messages.push(...lettura(i));
  messages.push({ role: 'assistant', content: 'Fatto' });
  const esito = await service.compact({ sessionId: 'chat', messages, attesaDellaPersona: true });
  assert.equal(esito.ok, true);
  assert.ok(esito.jobId, 'un lavoro è partito');
  assert.ok(chiamate() >= 1, 'il riassunto è stato chiesto');
});

test('COMPACT-UN-GIRO-03 anche la finestra, che passa da /jobs, compatta dentro il giro; «Rigenera» no (D-43)', async (t) => {
  const { service, chiamate } = await scena(t);
  const messages = [{ role: 'user', content: 'Leggi tutto' }];
  for (let i = 0; i < 6; i++) messages.push(...lettura(i));
  messages.push({ role: 'assistant', content: 'Fatto' });
  await service.compact({ sessionId: 'chat', messages, attesaDellaPersona: true });
  const prima = chiamate();
  const stato = await service.request({ sessionId: 'chat', method: 'GET', path: '/' }).catch(() => null);
  const revisione = stato?.snapshot?.revision ?? stato?.revision;
  const { job } = await service.request({ sessionId: 'chat', method: 'POST', path: '/jobs', body: { kind: 'compact', expectedRevision: revisione, idempotencyKey: 'dalla-finestra' } });
  assert.ok(job?.id, 'la finestra ha un lavoro, non «niente da compattare»');
  assert.ok(prima >= 1);
});

test('COMPACT-UN-GIRO-02 se non c è davvero niente lo dice, senza errore e senza spendere', async (t) => {
  const { service, chiamate } = await scena(t);
  const esito = await service.compact({ sessionId: 'chat', messages: [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao' }], attesaDellaPersona: true });
  assert.equal(esito.ok, true);
  assert.equal(esito.compattato, false);
  assert.equal(esito.motivo, 'niente-da-compattare');
  assert.equal(chiamate(), 0);
});

test('COMPACT-UN-GIRO-03 mutante C4: un rifiuto diverso da «niente da compattare» resta un errore, e il secondo tentativo non parte', async (t) => {
  for (const code of ['CTX_STALE_REVISION', 'CTX_JOB_ACTIVE']) {
    const { service } = await scena(t, { rifiutaCon: code });
    await assert.rejects(service.compact({ sessionId: 'chat', messages: [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao' }], attesaDellaPersona: true }), { code }, code);
  }
});
