/*
 * L3-3 (owner 13/10/2026, D1 + D2: «solo l'ULTIMA per conversazione, ed esportabile») — dalla strada del giro.
 * Le prove dell'archivio (elenco, export, pulizia atomica, «non si rilegge ⇒ non si cancella») stanno in
 * `context-engine/tests/aside-copies.test.mjs`. Qui: il servizio desktop, cioè ciò che succede quando una conversazione diverge
 * più volte, e che una pulizia non riuscita non ferma mai la richiesta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { verifyContextArchive } from '../../context-engine/src/node/context-export.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };

async function scena(t, avvolgi = (store) => store) {
  const vero = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => vero.close());
  const store = avvolgi(vero);
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-10-13T20:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-13T20:00:00.000Z' });
  t.after(() => service.close());
  return { store: vero, service, hooks: await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' }) };
}
/** Tre storie che divergono l'una dall'altra al secondo messaggio. */
const storia = (n) => [{ role: 'user', content: 'Leggi il progetto' }, { role: 'assistant', content: `Risposta numero ${n}` }, { role: 'user', content: 'Continua' }];
const contenuti = async (store, sessionId) => (await store.readOriginals({ sessionId })).map((r) => r.message);

test('COPIE-DA-PARTE-01 — tre divergenze di fila: resta UNA copia da parte (l’ultima), la viva e quella sono intatte, e si esporta', async (t) => {
  const { store, service, hooks } = await scena(t);
  await hooks.prepare({ messages: storia(1), originali: storia(1), tools: [] });
  const primo = await hooks.prepare({ messages: storia(2), originali: storia(2), tools: [] });
  assert.deepEqual((await store.listAsideSessions({ sessionId: 'chat' })).map((c) => c.asideId), [primo.riallineato.asideId], 'il controllo positivo: dopo la prima riparazione ce n’è una');
  const secondo = await hooks.prepare({ messages: storia(3), originali: storia(3), tools: [] });
  const terzo = await hooks.prepare({ messages: storia(4), originali: storia(4), tools: [] });
  assert.equal(new Set([primo, secondo, terzo].map((e) => e.riallineato.asideId)).size, 3, 'tre riparazioni vere');

  assert.deepEqual((await store.listAsideSessions({ sessionId: 'chat' })).map((c) => c.asideId), [terzo.riallineato.asideId], 'solo l’ultima');
  assert.equal(await store.readContextSnapshot({ sessionId: primo.riallineato.asideId }), null);
  assert.equal(await store.readContextSnapshot({ sessionId: secondo.riallineato.asideId }), null);
  assert.deepEqual(await contenuti(store, 'chat'), storia(4), 'la conversazione viva è la storia attiva');
  assert.deepEqual(await contenuti(store, terzo.riallineato.asideId), storia(3), 'l’ultima copia da parte è la storia di prima, intatta');

  /* esportabile: dall'elenco della conversazione, mai da un id dato da fuori */
  const elenco = await service.request({ sessionId: 'chat', method: 'GET', path: '/aside' });
  assert.deepEqual(elenco.copies.map((c) => [c.asideId, c.records]), [[terzo.riallineato.asideId, 3]]);
  const archivio = await service.request({ sessionId: 'chat', method: 'GET', path: '/aside/export' });
  verifyContextArchive(archivio);
  assert.deepEqual(archivio.records.map((r) => r.message), storia(3));
  assert.deepEqual({ of: archivio.session.metadata.aside.of, id: archivio.session.metadata.aside.id }, { of: 'chat', id: terzo.riallineato.asideId });
  /* e l'export di sempre resta quello della viva */
  assert.deepEqual((await service.request({ sessionId: 'chat', method: 'GET', path: '/export' })).records.map((r) => r.message), storia(4));
});

test('COPIE-DA-PARTE-02, al contrario — una conversazione mai riparata non ha copie; una pulizia che fallisce non ferma il giro e non toglie niente', async (t) => {
  const senza = await scena(t);
  await senza.hooks.prepare({ messages: storia(1), originali: storia(1), tools: [] });
  assert.deepEqual((await senza.service.request({ sessionId: 'chat', method: 'GET', path: '/aside' })).copies, []);
  await assert.rejects(senza.service.request({ sessionId: 'chat', method: 'GET', path: '/aside/export' }), { code: 'CTX_SESSION_NOT_FOUND' });

  let tentativi = 0;
  const rotta = await scena(t, (store) => ({ ...store, pruneAsideSessions: async () => { tentativi += 1; throw Object.assign(new Error('giù'), { code: 'CTX_PERSISTENCE_FAILED' }); } }));
  await rotta.hooks.prepare({ messages: storia(1), originali: storia(1), tools: [] });
  await rotta.hooks.prepare({ messages: storia(2), originali: storia(2), tools: [] });
  const esito = await rotta.hooks.prepare({ messages: storia(3), originali: storia(3), tools: [] });
  assert.ok(Array.isArray(esito.messages) && esito.messages.length > 0, 'il giro prosegue');
  assert.equal(tentativi, 2, 'la pulizia è stata tentata a ogni riparazione');
  assert.equal((await rotta.store.listAsideSessions({ sessionId: 'chat' })).length, 2, 'e, fallita, non ha tolto niente');
  assert.deepEqual(await contenuti(rotta.store, 'chat'), storia(3));

  /* un archivio che non sa pulire (versione vecchia, altro prodotto): si comporta come prima */
  const vecchio = await scena(t, (store) => Object.fromEntries(Object.entries(store).filter(([nome]) => nome !== 'pruneAsideSessions')));
  await vecchio.hooks.prepare({ messages: storia(1), originali: storia(1), tools: [] });
  await vecchio.hooks.prepare({ messages: storia(2), originali: storia(2), tools: [] });
  await vecchio.hooks.prepare({ messages: storia(3), originali: storia(3), tools: [] });
  assert.equal((await vecchio.store.listAsideSessions({ sessionId: 'chat' })).length, 2);
});
