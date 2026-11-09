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
import { ContextEventV1 } from '../../context-engine/src/contracts.mjs';
import { etichettaSeparatoreContesto } from '../frontend/src/components/context-separator.js';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };

async function scena(t, { conOperazione = true, onEvent = undefined, avvolgiStore = (s) => s, modello = () => MODELLO } = {}) {
  const vero = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => vero.close());
  /* «al contrario»: un archivio che non sa mettere da parte (un altro prodotto, una versione vecchia) */
  const store = avvolgiStore(conOperazione ? vero : Object.fromEntries(Object.entries(vero).filter(([nome]) => nome !== 'setAsideSession')));
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-10-12T20:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => modello(), onEvent, clock: () => '2026-10-12T20:00:00.000Z' });
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

/*
 * R2 (revisione del Blocco 21, 01/11/2026): `setAsideSession` porta via lavori e versioni, e l'elenco delle sessioni conta dal giornale. Il
 * servizio lo scrive sul giornale DENTRO il ramo della riparazione: la riga `archivio-riallineato` del guscio esce solo se `prepare` riesce.
 */
const MESSO_DA_PARTE = 'context.archive.set-aside';
const daParte = (eventi) => eventi.filter(({ event }) => event.kind === MESSO_DA_PARTE);

test('ARCHIVIO-SI-RIPARA-05 — la riparazione scrive UN evento del servizio, col contratto degli eventi del motore; una richiesta sana nessuno', async (t) => {
  const eventi = [];
  const { hooks } = await scena(t, { onEvent: async (x) => { eventi.push(x); } });
  await hooks.prepare({ messages: PRIMA, originali: PRIMA, tools: [] });
  assert.equal(daParte(eventi).length, 0, 'il controllo: senza divergenza niente');
  const esito = await hooks.prepare({ messages: DOPO, originali: DOPO, tools: [] });
  assert.equal(daParte(eventi).length, 1);
  const { sessionId, event } = daParte(eventi)[0];
  assert.equal(sessionId, 'chat');
  assert.deepEqual(ContextEventV1.parse(event), event, 'lo schema che `pubblicaEventoContesto` valida');
  assert.deepEqual({ sessionId: event.sessionId, payload: event.payload, createdAt: event.createdAt }, { sessionId: 'chat', payload: { asideId: esito.riallineato.asideId }, createdAt: '2026-10-12T20:00:00.000Z' });
  assert.equal(etichettaSeparatoreContesto(event), null, 'la chat non ci disegna un separatore «compattato»');
  assert.equal(etichettaSeparatoreContesto({ ...event, versionId: 'v1' }) === null, false, 'il controllo: con una versione lo disegnerebbe');
  await hooks.prepare({ messages: [...DOPO, { role: 'assistant', content: 'ok' }], originali: [...DOPO, { role: 'assistant', content: 'ok' }], tools: [] });
  assert.equal(daParte(eventi).length, 1, 'il giro dopo non ha niente da dire');
});

test('ARCHIVIO-SI-RIPARA-06 — archivio messo da parte e richiesta caduta dopo: l\'evento c\'è lo stesso (la riga del guscio no)', async (t) => {
  const eventi = [];
  const stato = { rotto: false };
  const { store, hooks } = await scena(t, { onEvent: async (x) => { eventi.push(x); }, modello: () => { if (stato.rotto) throw Object.assign(new Error('The model is not ready.'), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' }); return MODELLO; } });
  await hooks.prepare({ messages: PRIMA, originali: PRIMA, tools: [] });
  stato.rotto = true;
  await assert.rejects(hooks.prepare({ messages: DOPO, originali: DOPO, tools: [] }), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' });
  assert.deepEqual((await store.readOriginals({ sessionId: 'chat' })).map(r => r.message), DOPO, 'premessa: l\'archivio è stato riparato');
  assert.equal(daParte(eventi).length, 1);
});

test('ARCHIVIO-SI-RIPARA-07 — un evento che non si consegna non ferma la richiesta, e resta in coda: tornato il giornale arriva, una volta sola (RIP-3)', async (t) => {
  let tentativi = 0;
  let giornaleGiu = true;
  const arrivati = [];
  const { hooks } = await scena(t, { onEvent: async ({ event }) => {
    if (event.kind !== MESSO_DA_PARTE) return;
    if (giornaleGiu) { tentativi += 1; throw new Error('giornale non scrivibile'); }
    arrivati.push(event.payload.asideId);
  } });
  await hooks.prepare({ messages: PRIMA, originali: PRIMA, tools: [] });
  const esito = await hooks.prepare({ messages: DOPO, originali: DOPO, tools: [] });
  assert.ok(tentativi >= 1, 'il controllo: la consegna è stata tentata');
  assert.ok(esito.riallineato?.asideId, 'la richiesta prosegue e il guasto del conto non diventa un guasto del giro');
  assert.deepEqual(arrivati, []);
  giornaleGiu = false;
  const seguito = [...DOPO, { role: 'assistant', content: 'ok' }];
  const dopo = await hooks.prepare({ messages: seguito, originali: seguito, tools: [] });
  assert.equal(dopo.riallineato, undefined, 'premessa: nessuna riparazione nuova');
  assert.deepEqual(arrivati, [esito.riallineato.asideId]);
  await hooks.prepare({ messages: seguito, originali: seguito, tools: [] });
  assert.equal(arrivati.length, 1);
});

test('ARCHIVIO-SI-RIPARA-09 — l\'annuncio parte subito dopo lo spostamento, non a fine richiesta: se il passo dopo cade (o il riassunto fa aspettare minuti) l\'elenco è già giusto', async (t) => {
  const eventi = [];
  const stato = { spostato: false };
  const guasto = Object.assign(new Error('The archive does not write.'), { code: 'CTX_PERSISTENCE_FAILED' });
  const avvolgiStore = (s) => ({ ...s,
    setAsideSession: async (a) => { const r = await s.setAsideSession(a); stato.spostato = true; return r; },
    appendOriginalBatch: async (a) => { if (stato.spostato) throw guasto; return s.appendOriginalBatch(a); } });
  const { hooks } = await scena(t, { onEvent: async (x) => { eventi.push(x); }, avvolgiStore });
  await hooks.prepare({ messages: PRIMA, originali: PRIMA, tools: [] });
  await assert.rejects(hooks.prepare({ messages: DOPO, originali: DOPO, tools: [] }), { code: 'CTX_PERSISTENCE_FAILED' });
  assert.equal(stato.spostato, true, 'premessa: il passo caduto è quello dopo lo spostamento');
  assert.equal(daParte(eventi).length, 1);
});

test('ARCHIVIO-SI-RIPARA-08 — ciò che aspettava nella coda degli eventi parte PRIMA: una versione consegnata dopo tornerebbe a contare', async (t) => {
  const eventi = [];
  const coda = [];
  const versione = { schema: 'talos.context.event.v1', id: 'versione-in-coda', sessionId: 'chat', versionId: 'v1', jobId: 'j1', kind: 'context.version.committed', createdAt: '2026-10-12T20:00:00.000Z', payload: { coveredThrough: 1 } };
  const avvolgiStore = (s) => ({ ...s,
    readContextOutbox: async (a) => [...coda, ...(await s.readContextOutbox(a))],
    ackContextEvent: async (a) => { if (a.eventId === versione.id) coda.length = 0; else await s.ackContextEvent(a); } });
  const { hooks } = await scena(t, { onEvent: async ({ event }) => { eventi.push(event.kind); }, avvolgiStore });
  await hooks.prepare({ messages: PRIMA, originali: PRIMA, tools: [] });
  eventi.length = 0;
  coda.push(versione);
  await hooks.prepare({ messages: DOPO, originali: DOPO, tools: [] });
  assert.deepEqual(eventi.filter((k) => k === versione.kind || k === MESSO_DA_PARTE), [versione.kind, MESSO_DA_PARTE]);
});
