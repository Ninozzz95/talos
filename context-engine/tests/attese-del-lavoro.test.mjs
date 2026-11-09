/*
 * Spesa di servizio, parte 2 B (30/10/2026; regola della CLI, OK di Mobile e Performance): il motore dice a ogni chiamata del riassunto
 * chi ASPETTA il suo lavoro — attese in corso e attese totali (`attese()`), più il `jobId`. L'adattatore ne ricava `inPrimoPiano`.
 *   - nessuna attesa ⇒ i due numeri non si muovono;
 *   - un'attesa che comincia MENTRE la chiamata va (il lavoro era partito in sottofondo) ⇒ il totale cambia;
 *   - `waitForCompaction` senza `contaComeAttesa` (lo spegnimento del server desktop) ⇒ non conta.
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

const modelProfile = { provider: 'openrouter', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048 };
const now = '2026-10-30T00:00:00.000Z';
const readCall = k => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${k}.txt` }) } }] });
const readResult = k => ({ role: 'tool', tool_call_id: `c${k}`, content: [{ type: 'text', text: `file ${k}: ` + 'riga di contenuto '.repeat(400) }] });

/** Il riassunto: guarda le attese all'inizio, resta fermo finché il test lo lascia andare, le riguarda alla fine. */
function riassuntoCheGuarda() {
  let lascia; const via = new Promise(r => { lascia = r; });
  const viste = []; let partito; const inizio = new Promise(r => { partito = r; });
  const summarize = async (request) => {
    const prima = request.attese?.();
    partito();
    /* come un riassunto vero: lo Stop del lavoro lo ferma (senza, un lavoro annullato non si chiuderebbe mai e chi lo aspetta resterebbe appeso) */
    await new Promise((risolvi, rifiuta) => {
      via.then(risolvi);
      request.signal?.addEventListener?.('abort', () => rifiuta(request.signal.reason ?? new Error('aborted')), { once: true });
    });
    viste.push({ jobId: request.jobId, prima, dopo: request.attese?.() });
    const sourceIds = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
    const sourceId = sourceIds.find(id => id === 'u0' || id.startsWith('t')) ?? 'u0';
    const quote = sourceId === 'u0' ? 'Leggi' : `file ${sourceId.slice(1)}:`;
    return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Letti i file.', goal: 'Leggere i file', decisions: [], constraints: [], completed: ['letti'], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  };
  return { summarize, viste, partito: inizio, lascia: () => lascia() };
}

async function fixture(t, summarize) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-attese-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  await store.initSession({ sessionId: 's', settings: parseContextSettings({ auto: true, triggerRatio: 0.5, targetRatio: 0.49 }) });
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now });
  const append = (id, message) => engine.appendOriginal({ sessionId: 's', record: { id, message, createdAt: now } });
  await append('s0', { role: 'system', content: 'Sei un assistente.' });
  await append('u0', { role: 'user', content: 'Leggi i dieci file.' });
  for (let k = 1; k <= 10; k++) { await append(`a${k}`, readCall(k)); await append(`t${k}`, readResult(k)); }
  t.after(async () => {
    for (const job of (await engine.getContextState({ sessionId: 's' })).jobs) {
      try { await engine.cancelCompaction({ sessionId: 's', jobId: job.id }); } catch { /* già concluso */ }
    }
    await store.close(); await rm(directory, { recursive: true, force: true });
  });
  return engine;
}

/** Un lavoro partito in SOTTOFONDO (la richiesta non lo aspetta: `summaryCeilingMs: 0`), col suo id. */
async function lavoroInSottofondo(engine) {
  const errore = await engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 0 }).then(() => null, e => e);
  assert.equal(errore?.code, 'CTX_SUMMARY_NOT_READY', 'premessa: il lavoro è partito senza che la richiesta lo aspetti');
  return errore.details.jobId;
}

test('ATTESE-01 nessuno aspetta: la chiamata vede zero attese prima e dopo, e il jobId del suo lavoro', async t => {
  const r = riassuntoCheGuarda();
  const engine = await fixture(t, r.summarize);
  const jobId = await lavoroInSottofondo(engine);
  await r.partito; r.lascia();
  await engine.waitForCompaction({ sessionId: 's', jobId });
  assert.ok(r.viste.length >= 1);
  assert.equal(r.viste[0].jobId, jobId);
  assert.deepEqual(r.viste[0].prima, { inCorso: 0, totale: 0 });
  assert.deepEqual(r.viste[0].dopo, { inCorso: 0, totale: 0 });
});

test('ATTESE-02 (CLI) un\'attesa che comincia MENTRE la chiamata va: il totale cambia fra prima e dopo', async t => {
  const r = riassuntoCheGuarda();
  const engine = await fixture(t, r.summarize);
  const jobId = await lavoroInSottofondo(engine);
  await r.partito;
  const attesa = engine.waitForCompaction({ sessionId: 's', jobId, contaComeAttesa: true });
  r.lascia();
  await attesa;
  assert.deepEqual(r.viste[0].prima, { inCorso: 0, totale: 0 });
  assert.ok(r.viste[0].dopo.totale > r.viste[0].prima.totale || r.viste[0].dopo.inCorso > 0, JSON.stringify(r.viste[0]));
});

test('ATTESE-03 AL CONTRARIO: waitForCompaction SENZA contaComeAttesa (lo spegnimento del desktop) non conta come attesa', async t => {
  const r = riassuntoCheGuarda();
  const engine = await fixture(t, r.summarize);
  const jobId = await lavoroInSottofondo(engine);
  await r.partito;
  const attesa = engine.waitForCompaction({ sessionId: 's', jobId });
  r.lascia();
  await attesa;
  assert.deepEqual(r.viste[0].dopo, { inCorso: 0, totale: 0 });
});

/* Performance, revisione del pezzo B (Q1, 30/10): un lavoro nato in SOTTOFONDO da una richiesta di prima, aspettato da una richiesta dopo
   che poi viene fermata (Skip o Stop). Prima il motore continuava ad aspettare fino alla fine del lavoro: le chiamate dopo risultavano
   «in primo piano» con nessuno davanti, e la fine dell'attesa aveva l'ora del lavoro. Ora l'attesa si chiude SUBITO («abandoned»), il
   lavoro (che non è della richiesta) va avanti. */
test('ATTESE-04 (Performance) Skip su un lavoro nato in sottofondo: l\'attesa si chiude subito, «abandoned», il lavoro NON si annulla', async t => {
  const r = riassuntoCheGuarda();
  const engine = await fixture(t, r.summarize);
  t.after(() => r.lascia()); // anche se la prova cade, il lavoro finisce e la prova non resta appesa
  const jobId = await lavoroInSottofondo(engine);
  await r.partito;
  const controller = new AbortController();
  const segnali = [];
  const richiesta = engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, waitForInFlight: true, signal: controller.signal, onInTurnWait: e => segnali.push(e) });
  const fine = Date.now() + 5_000;
  while (!segnali.some(e => e.state === 'waiting') && Date.now() < fine) await new Promise(res => { setTimeout(res, 5); });
  assert.ok(segnali.some(e => e.state === 'waiting' && e.jobId === jobId), `premessa: la richiesta aspetta il lavoro di prima ${JSON.stringify(segnali)}`);
  controller.abort(new Error('Skip'));
  const inizio = Date.now();
  const scaduta = Symbol('scaduta');
  const esito = await Promise.race([richiesta.then(() => 'risolta', () => 'rifiutata'), new Promise(res => { setTimeout(() => res(scaduta), 2_000); })]);
  assert.notEqual(esito, scaduta, 'dopo lo Skip la richiesta è rimasta ad aspettare il lavoro di prima (il difetto di Q1)');
  assert.equal(esito, 'rifiutata');
  assert.ok(Date.now() - inizio < 1_000, 'l\'attesa si chiude subito, non alla fine del lavoro');
  assert.deepEqual(segnali.at(-1), { state: 'done', jobId, outcome: 'abandoned' });
  /* il lavoro va avanti, e la sua chiamata ora vede che nessuno aspetta più */
  const stato = (await engine.getContextState({ sessionId: 's' })).jobs.find(j => j.id === jobId);
  assert.notEqual(stato.state, 'cancelled', 'il lavoro di prima non è della richiesta: non si annulla');
  r.lascia();
  await engine.waitForCompaction({ sessionId: 's', jobId });
  assert.equal(r.viste[0].dopo.inCorso, 0, 'alla fine della chiamata nessuno aspetta più');
});

/* Mobile (30/10, delta 1): un segnale GIÀ fermato quando il giro comincia ad aspettare — anche lì «abandoned», mai un errore senza esito */
test('ATTESE-05 (Mobile) segnale già fermato quando l\'attesa comincia: «abandoned», attesa chiusa, lavoro non annullato', async t => {
  const r = riassuntoCheGuarda();
  const engine = await fixture(t, r.summarize);
  t.after(() => r.lascia());
  const jobId = await lavoroInSottofondo(engine);
  await r.partito;
  const segnali = [];
  /* il segnale si ferma proprio quando il giro annuncia l'attesa: il controllo all'ingresso di waitForCompaction lo trova già fermato */
  const controller = new AbortController();
  const richiesta = engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, waitForInFlight: true, signal: controller.signal,
    onInTurnWait: e => { segnali.push(e); if (e.state === 'waiting') controller.abort(new Error('Stop')); } });
  const scaduta = Symbol('scaduta');
  const esito = await Promise.race([richiesta.then(() => 'risolta', () => 'rifiutata'), new Promise(res => { setTimeout(() => res(scaduta), 2_000); })]);
  assert.equal(esito, 'rifiutata');
  assert.deepEqual(segnali.map(e => e.state), ['waiting', 'done']);
  assert.deepEqual(segnali.at(-1), { state: 'done', jobId, outcome: 'abandoned' });
  assert.notEqual((await engine.getContextState({ sessionId: 's' })).jobs.find(j => j.id === jobId).state, 'cancelled');
});

/* Performance, revisione del delta 1 (30/10, misurato): Skip su un lavoro nato nella STESSA richiesta (avviato col suo segnale). Il
   lavoro si annulla davvero ⇒ l'esito resta «cancelled» e la richiesta va per la strada di prima (il lavoro non pubblicato ⇒ fail CTX_…),
   mai «abandoned» («il lavoro è andato avanti da solo», falso) né il rifiuto col motivo del segnale. */
test('ATTESE-06 (Performance) Skip su un lavoro della STESSA richiesta: «cancelled» e la strada di prima, non «abandoned»', async t => {
  const r = riassuntoCheGuarda();
  const engine = await fixture(t, r.summarize);
  t.after(() => r.lascia());
  const controller = new AbortController();
  const segnali = [];
  const richiesta = engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, signal: controller.signal, onInTurnWait: e => segnali.push(e) });
  await r.partito;
  const fine = Date.now() + 5_000;
  while (!segnali.some(e => e.state === 'waiting') && Date.now() < fine) await new Promise(res => { setTimeout(res, 5); });
  assert.ok(segnali.some(e => e.state === 'waiting'), `premessa: la richiesta aspetta il SUO lavoro ${JSON.stringify(segnali)}`);
  const motivo = new Error('Skip della persona');
  controller.abort(motivo);
  const errore = await richiesta.then(() => null, e => e);
  assert.ok(errore, 'la richiesta non può riuscire senza il suo riassunto');
  assert.notEqual(errore, motivo, 'la strada di prima (fail CTX_…), non il motivo del segnale');
  assert.match(String(errore.code ?? ''), /^CTX_/u);
  assert.equal(segnali.at(-1).outcome, 'cancelled');
  const lavoro = (await engine.getContextState({ sessionId: 's' })).jobs.find(j => j.id === segnali.at(-1).jobId);
  assert.equal(lavoro.state, 'cancelled', 'premessa: il lavoro della richiesta è stato annullato davvero');
});
