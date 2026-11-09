/*
 * Chiusura della compattazione, prova dal vivo del 31/10/2026 (piano ChatGPT): il /compact a mano subito dopo un giro rispondeva 500 INTERNAL_ERROR in 6 corse su 6, e
 * minuti dopo funzionava. A fine giro parte il riassunto in sottofondo, e il worker rifiuta un lavoro nuovo con CTX_JOB_ACTIVE, che la rotta non conosce.
 * La persona ha chiesto un riassunto e uno è già al lavoro: il /compact aspetta quello, come `prepareForRequest` ritrova il suo.
 * 05/11/2026, voce B3 della cura per Luna 6 (forma `FORMA-CURA-COMPATTAZIONE-LUNA-2026-11-05.md` §3; OK di CLI, Performance e Mobile §8):
 * al banco del 04/11 il /compact si agganciava al lavoro automatico, quello falliva dopo 2 secondi e la persona leggeva «non riuscita»
 * senza che il SUO riassunto fosse mai partito. Ora, se il lavoro agganciato non finisce `committed`, il /compact fa partire subito il
 * suo, UNA volta, e risponde con l'esito di quello: la POST del telefono apre la riga viva prima e la chiude alla risposta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };
const ATTIVI = (jobs) => (jobs ?? []).filter((j) => !['committed', 'failed', 'cancelled', 'paused'].includes(j.state));

/* `riesce(n)`: la chiamata n-esima, quando la si libera, risponde con un riassunto valido (citazione presa dall'originale vero) */
async function scena(t, { riesce = () => false } = {}) {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  const liberi = [];
  let chiamate = 0;
  const valido = async (request) => {
    const dati = JSON.parse(request.messages.at(-1).content);
    let fonte; try { fonte = JSON.parse(dati.untrustedSource); } catch { fonte = null; }
    const originali = await store.readOriginals({ sessionId: 'chat' });
    const sources = fonte?.verifiedSegments ? [fonte.verifiedSegments[0].sources[0]].map(({ recordId, quote }) => ({ recordId, quote }))
      : [{ recordId: dati.sourceIds[0], quote: String(originali.find((r) => r.id === dati.sourceIds[0]).message.content).slice(0, 30) }];
    return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Riassunto breve.', goal: 'Continuare', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources }), finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 20 } };
  };
  // come una chiamata vera, si ferma quando il lavoro è annullato
  const summarize = (request) => { chiamate += 1; const n = chiamate; return new Promise((risolvi, rifiuta) => {
    request.signal?.addEventListener?.('abort', () => rifiuta(request.signal.reason ?? new Error('annullato')), { once: true });
    liberi.push(() => (riesce(n) ? valido(request).then(risolvi, rifiuta) : rifiuta(new Error('riassunto finito male'))));
  }); };
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize }, tokenCounter: contatore, clock: () => '2026-10-31T10:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test', conclusa: true } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-27T20:00:00.000Z' });
  t.after(async () => { for (const libera of liberi) libera(); await service.close(); store.close(); });
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const lunga = (i) => ({ role: i % 2 ? 'assistant' : 'user', content: `messaggio ${i} `.repeat(400) });
  const STORIA = Array.from({ length: 12 }, (_, i) => lunga(i));
  await hooks.prepare({ messages: STORIA, originali: STORIA, tools: [] });
  const snap = await store.readContextSnapshot({ sessionId: 'chat' });
  void service.request({ sessionId: 'chat', method: 'POST', path: '/jobs', body: { kind: 'compact', expectedRevision: snap.revision, idempotencyKey: 'fine-giro' } }).catch(() => {});
  for (let i = 0; i < 50 && !ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' }))?.jobs).length, 1, 'la scena ha davvero un lavoro attivo');
  return { store, service, STORIA, liberi, chiamate: () => chiamate };
}

const finché = async (condizione) => { for (let i = 0; i < 100 && !(await condizione()); i++) await new Promise((r) => setTimeout(r, 20)); };

test('COMPACT-ATTIVO-01 — col riassunto di fine giro ancora al lavoro il /compact lo aspetta (nessun secondo lavoro mentre quello lavora); se finisce male parte il suo (B3), UNA volta, e dice com\'è andato quello', async (t) => {
  const { store, service, STORIA, liberi, chiamate } = await scena(t);
  const lavori = [];
  const attese = service.compact({ sessionId: 'chat', messages: STORIA, attesaDellaPersona: true, onLavoro: (id) => lavori.push(id) });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(chiamate(), 1, 'nessun secondo riassunto mentre quello lavora');
  assert.equal((await store.readContextSnapshot({ sessionId: 'chat' })).jobs.length, 1, 'un lavoro solo mentre quello lavora');
  liberi.shift()();
  await finché(() => chiamate() === 2);
  assert.equal(chiamate(), 2, 'B3: il lavoro agganciato è finito male ⇒ il riassunto della persona parte subito');
  liberi.shift()();
  const esito = await attese;
  assert.equal(esito.ok, true);
  assert.equal(esito.compattato, false, 'anche il suo è finito male, e il /compact lo dice');
  const jobs = (await store.readContextSnapshot({ sessionId: 'chat' })).jobs;
  assert.equal(jobs.length, 2, 'mai un terzo lavoro: si riparte UNA volta');
  assert.equal(lavori.length, 2, 'onLavoro arriva due volte: la riga viva regge il secondo lavoro (condizione del Mobile)');
  assert.notEqual(lavori[0], lavori[1]);
  assert.equal(esito.jobId, lavori[1], 'l\'esito è quello del lavoro ripartito, non del primo');
  assert.equal(chiamate(), 2);
});

test('COMPACT-ATTIVO-02 (B3, banco del 04/11: rossa prima della cura) — il lavoro agganciato fallisce, il suo riesce: la POST risponde compattato:true', async (t) => {
  const { store, service, STORIA, liberi, chiamate } = await scena(t, { riesce: (n) => n >= 2 });
  const attese = service.compact({ sessionId: 'chat', messages: STORIA, attesaDellaPersona: true });
  await new Promise((r) => setTimeout(r, 60));
  liberi.shift()();
  await finché(() => liberi.length >= 1 || chiamate() >= 2);
  while (liberi.length) liberi.shift()();
  const esito = await Promise.race([attese, new Promise((r) => setTimeout(() => r('appeso'), 5000))]);
  assert.notEqual(esito, 'appeso');
  assert.equal(esito.compattato, true, `l'esito è quello del lavoro della persona: ${JSON.stringify(esito)}`);
  assert.equal(esito.error, undefined, 'nessun errore ereditato dal lavoro agganciato');
  const jobs = (await store.readContextSnapshot({ sessionId: 'chat' })).jobs;
  assert.deepEqual(jobs.map((j) => j.state).sort(), ['committed', 'failed']);
  assert.equal(esito.jobId, jobs.find((j) => j.state === 'committed').id);
});

test('COMPACT-ATTIVO-03 (al contrario) — il lavoro agganciato riesce: niente riparte, un lavoro e una chiamata', async (t) => {
  const { store, service, STORIA, liberi, chiamate } = await scena(t, { riesce: () => true });
  const attese = service.compact({ sessionId: 'chat', messages: STORIA, attesaDellaPersona: true });
  await new Promise((r) => setTimeout(r, 60));
  liberi.shift()();
  const esito = await attese;
  assert.equal(esito.compattato, true);
  assert.equal(chiamate(), 1);
  assert.equal((await store.readContextSnapshot({ sessionId: 'chat' })).jobs.length, 1);
});

test('COMPACT-ATTIVO-04 (al contrario, B3) — nessun lavoro da agganciare e il suo finisce male: non riparte, un lavoro suo e il suo esito', async (t) => {
  const { store, service, STORIA, liberi, chiamate } = await scena(t);
  liberi.shift()();
  await finché(async () => !ATTIVI((await store.readContextSnapshot({ sessionId: 'chat' })).jobs).length);
  const lavori = [];
  const attese = service.compact({ sessionId: 'chat', messages: STORIA, attesaDellaPersona: true, onLavoro: (id) => lavori.push(id) });
  await finché(() => liberi.length >= 1);
  liberi.shift()();
  // una ripartenza chiederebbe un altro riassunto: lo si libera, così la prova non resta appesa
  await new Promise((r) => setTimeout(r, 200));
  while (liberi.length) liberi.shift()();
  const esito = await Promise.race([attese, new Promise((r) => setTimeout(() => r('appeso'), 5000))]);
  assert.notEqual(esito, 'appeso');
  assert.equal(esito.compattato, false, 'il suo è finito male, e il /compact lo dice');
  assert.equal(lavori.length, 1, 'un lavoro solo della persona: senza lavoro agganciato non si riparte');
  assert.equal((await store.readContextSnapshot({ sessionId: 'chat' })).jobs.length, 2, 'quello di fine giro e il suo, mai un terzo');
  assert.equal(chiamate(), 2);
  assert.equal(esito.jobId, lavori[0]);
});

test('COMPACT-ATTIVO-05 (B3-c, revisione del 05/11) — il lavoro agganciato viene annullato da fuori (DELETE /jobs/:id, non dal segnale del /compact): finisce `cancelled` e il /compact NON riparte', async (t) => {
  const { store, service, STORIA, liberi, chiamate } = await scena(t);
  const lavori = [];
  const attese = service.compact({ sessionId: 'chat', messages: STORIA, attesaDellaPersona: true, onLavoro: (id) => lavori.push(id) });
  await finché(() => lavori.length >= 1);
  assert.equal(lavori.length, 1, 'il /compact si è agganciato al lavoro di fine giro');
  const snap = await store.readContextSnapshot({ sessionId: 'chat' });
  await service.request({ sessionId: 'chat', method: 'DELETE', path: `/jobs/${lavori[0]}`, body: { expectedRevision: snap.revision, idempotencyKey: 'annulla-da-fuori' } }).catch(() => {});
  // una ripartenza chiederebbe un altro riassunto: lo si libera, così la prova non resta appesa
  await new Promise((r) => setTimeout(r, 200));
  while (liberi.length) liberi.shift()();
  const esito = await Promise.race([attese, new Promise((r) => setTimeout(() => r('appeso'), 5000))]);
  assert.notEqual(esito, 'appeso');
  assert.equal(esito.annullato, true, `il lavoro agganciato è finito annullato: ${JSON.stringify(esito)}`);
  assert.equal(esito.compattato, false);
  assert.equal(esito.jobId, lavori[0], 'l\'esito è quello del lavoro agganciato');
  assert.equal(lavori.length, 1, 'nessun lavoro ripartito dopo un annullamento');
  const jobs = (await store.readContextSnapshot({ sessionId: 'chat' })).jobs;
  assert.deepEqual(jobs.map((j) => j.state), ['cancelled'], 'un lavoro solo, annullato: mai un secondo');
  assert.equal(chiamate(), 1);
});
