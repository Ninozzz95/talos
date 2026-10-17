/*
 * 12/10/2026, decisione dell'owner («Si ripara da solo») — dal trascritto 36289618: dopo un cambio di modello la storia attiva
 * non combaciava più con l'archivio del motore del contesto e OGNI giro ricadeva sulla compattazione semplice, per sempre
 * (`CTX_HISTORY_DIVERGED` a ogni `prepare`). Ora, sulla strada del giro: gli originali vecchi vanno da parte sotto un altro id
 * (niente si perde), l'archivio riparte dalla storia attiva, e la richiesta prosegue col motore.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };

async function scena(t, { conOperazione = true } = {}) {
  const vero = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => vero.close());
  /* «al contrario»: un archivio che non sa mettere da parte (un altro prodotto, una versione vecchia) */
  const store = conOperazione ? vero : Object.fromEntries(Object.entries(vero).filter(([nome]) => nome !== 'setAsideSession'));
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-10-12T20:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-12T20:00:00.000Z' });
  t.after(() => service.close());
  return { store: vero, service, hooks: await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' }) };
}

const PRIMA = [
  { role: 'user', content: 'Leggi il progetto' },
  { role: 'assistant', content: 'Fatto: è un servizio web.' },
  { role: 'user', content: 'Ora cambia modello' },
];
/* la stessa conversazione come la porta il modello nuovo: il secondo messaggio è stato riscritto */
const DOPO = [PRIMA[0], { role: 'assistant', content: 'Fatto: è un servizio web (riscritto).' }, PRIMA[2], { role: 'assistant', content: 'Eccomi.' }, { role: 'user', content: 'Continua' }];

test('ARCHIVIO-SI-RIPARA-01 — alla divergenza la richiesta prosegue: originali vecchi da parte, archivio riallineato, e lo dice', async (t) => {
  const { store, service, hooks } = await scena(t);
  await hooks.prepare({ messages: PRIMA, originali: PRIMA, tools: [] });
  const fatto = await service.request({ sessionId: 'chat', method: 'POST', path: '/facts', body: { fact: { text: 'Il progetto usa Node 24', sources: [] }, expectedRevision: (await service.request({ sessionId: 'chat', method: 'GET', path: '/' })).revision, idempotencyKey: 'fatto-1' } });
  assert.ok(fatto.fact);
  const prima = await store.readContextSnapshot({ sessionId: 'chat' });

  const esito = await hooks.prepare({ messages: DOPO, originali: DOPO, tools: [] });
  assert.ok(Array.isArray(esito.messages) && esito.messages.length > 0, 'la richiesta ha la sua proiezione: il motore ha lavorato');
  assert.equal(esito.riallineato.forma, 'riscritta');
  assert.equal(esito.riallineato.primoDiverso, 1);
  assert.equal(esito.riallineato.archiviati, 3);
  assert.equal(esito.riallineato.attivi, 5);
  assert.match(esito.riallineato.asideId, /^chat\.aside-/u);

  /* l'archivio vivo È la storia attiva */
  assert.deepEqual((await store.readOriginals({ sessionId: 'chat' })).map(r => r.message), DOPO);
  /* niente si è perso: i vecchi originali sono da parte, intatti */
  assert.deepEqual((await store.readOriginals({ sessionId: esito.riallineato.asideId })).map(r => r.message), PRIMA);
  /* ciò che è della persona resta alla conversazione */
  const dopo = await store.readContextSnapshot({ sessionId: 'chat' });
  assert.deepEqual(dopo.facts.map(f => f.text), ['Il progetto usa Node 24']);
  assert.ok(dopo.revision > prima.revision, 'la revisione avanza: chi aveva quella vecchia lo scopre');

  /* e dal giro dopo non c'è più niente da riparare */
  const poi = await hooks.prepare({ messages: [...DOPO, { role: 'assistant', content: 'ok' }], originali: [...DOPO, { role: 'assistant', content: 'ok' }], tools: [] });
  assert.equal('riallineato' in poi, false);
});

test('ARCHIVIO-SI-RIPARA-02, al contrario — un archivio che non sa mettere da parte: l’errore resta quello di prima', async (t) => {
  const { store, hooks } = await scena(t, { conOperazione: false });
  await hooks.prepare({ messages: PRIMA, originali: PRIMA, tools: [] });
  await assert.rejects(hooks.prepare({ messages: DOPO, originali: DOPO, tools: [] }), { code: 'CTX_HISTORY_DIVERGED' });
  assert.deepEqual((await store.readOriginals({ sessionId: 'chat' })).map(r => r.message), PRIMA, 'niente toccato');
});

test('ARCHIVIO-SI-RIPARA-03 — chi confronta da solo (syncOriginals) vuole sapere, non riparare', async (t) => {
  const { store, service } = await scena(t);
  await service.syncOriginals({ sessionId: 'chat', messages: PRIMA });
  await assert.rejects(service.syncOriginals({ sessionId: 'chat', messages: DOPO }), { code: 'CTX_HISTORY_DIVERGED' });
  assert.deepEqual((await store.readOriginals({ sessionId: 'chat' })).map(r => r.message), PRIMA);
});

test('ARCHIVIO-SI-RIPARA-04 — l’archivio rifiuta di mettere da parte sopra un id già usato o uguale alla sessione', async (t) => {
  const { store, service } = await scena(t);
  await service.syncOriginals({ sessionId: 'chat', messages: PRIMA });
  await assert.rejects(store.setAsideSession({ sessionId: 'chat', asideId: 'chat' }), { code: 'CTX_INVALID_INPUT' });
  await store.setAsideSession({ sessionId: 'chat', asideId: 'chat.aside-1' });
  await assert.rejects(store.setAsideSession({ sessionId: 'chat', asideId: 'chat.aside-1' }), { code: 'CTX_ASIDE_CONFLICT' });
});
