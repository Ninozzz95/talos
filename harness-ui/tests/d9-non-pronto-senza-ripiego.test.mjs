/*
 * D9 del Tester (blocco 25, 02/11/2026): «Conversation not compacted» su una chat di 3 messaggi. Col modello locale ancora in apertura il
 * profilo del motore del contesto fallisce (CTX_RUNTIME_PROFILE_MISMATCH con `details.nonPronto`, `context-runtime.mjs`) e il `prepare`
 * dell'adattatore diceva «ripiego» come per un guasto. Forma del 04/11 (OK del Desktop per l'adattatore, di Performance con una
 * condizione): la prima richiesta «non pronta» si salta in silenzio, come lo «skipped» di Hermes (`agent/compaction_events.py:67`);
 * se il motore resta non pronto alla richiesta dopo, o oltre 60 secondi, la riga torna (un'apertura incastrata non diventa muta).
 * Guscio vero + servizio vero + archivio vero + motore vero, fornitore finto. Nessuna rete.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { resolveDesktopDefaultProfile } from '../src/context-runtime.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const nonPronto = () => Object.assign(new Error('The local model is not ready with this model and a known window.'), { code: 'CTX_RUNTIME_PROFILE_MISMATCH', details: { nonPronto: true } });
const incastrato = async () => new Response(JSON.stringify({ error: { code: 503, message: 'Loading model', type: 'unavailable_error' } }), { status: 503, headers: { 'content-type': 'application/json', 'retry-after-ms': '60000' } });
/* il tetto dell'ospite all'attesa chiesta (G02-10): il giro si ferma al primo 503 invece di ritentare con le attese vere */
const SENZA_ATTESA = { attesaRitentaMassimaMs: 0 };
/* il giro col motore incastrato finisce con l'errore del fornitore: è atteso, conta solo la riga del contesto */
const soloIl503 = (e) => { if (!/HTTP 503/u.test(String(e?.message))) throw e; return null; };
const modelloDiverso = () => Object.assign(new Error('The local model is not ready with this model and a known window.'), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' });

function scena(t, profilo, sessioni = ['chat']) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-d9-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-11-04T08:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: (id) => (sessioni.includes(id) ? { sessionId: id, modello: 'local:test' } : null), isSessionEnabled: (id) => sessioni.includes(id), resolveSessionModel: profilo, clock: () => '2026-11-04T08:00:00.000Z' });
  t.after(() => service.close());
  return { cartella, service };
}

/* `richieste` risposte: le prime chiedono un attrezzo, l'ultima chiude */
async function giro(t, profilo, { richieste = 1, primaDellaSeconda } = {}) {
  const s = scena(t, profilo);
  const eventi = [];
  let n = 0;
  const fetchDiRete = async (_url, init) => {
    n += 1;
    if (n === 2) primaDellaSeconda?.();
    const usage = { prompt_tokens: Math.ceil(String(init.body).length / 4), completion_tokens: 5 };
    if (n < richieste) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${n}`, type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  const esito = await talosLavora({ cartella: s.cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks: await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' }),
    onGiro: (e) => eventi.push(e) });
  return { esito, ripieghi: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'ripiego'), richieste: n };
}

test('D9-01 — modello locale ancora in apertura alla prima richiesta: nessuna riga di ripiego, e il giro va in fondo', { timeout: 15_000 }, async (t) => {
  const { esito, ripieghi } = await giro(t, async () => { throw nonPronto(); });
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(ripieghi.length, 0, JSON.stringify(ripieghi));
});

test('D9-02 — AL CONTRARIO: un modello diverso o una finestra sbagliata (senza nonPronto) restano un guasto e lo dicono', { timeout: 15_000 }, async (t) => {
  const { ripieghi } = await giro(t, async () => { throw modelloDiverso(); });
  assert.equal(ripieghi.length, 1);
  assert.equal(ripieghi[0].codice, 'CTX_RUNTIME_PROFILE_MISMATCH');
});

test('D9-03 — condizione di Performance: ancora non pronto alla richiesta DOPO, la riga torna (una volta)', { timeout: 15_000 }, async (t) => {
  const { ripieghi, richieste } = await giro(t, async () => { throw nonPronto(); }, { richieste: 2 });
  assert.equal(richieste, 2, 'premessa: due richieste nello stesso giro');
  assert.equal(ripieghi.length, 1, JSON.stringify(ripieghi));
});

test('D9-04 — condizione di Performance: non pronto da oltre 60 secondi, la riga torna anche alla prima richiesta di un giro nuovo', { timeout: 15_000 }, async (t) => {
  let adesso = Date.parse('2026-11-04T08:00:00.000Z');
  t.mock.method(Date, 'now', () => adesso);
  const profilo = async () => { throw nonPronto(); };
  const s = scena(t, profilo);
  const corri = async (runId) => {
    const eventi = [];
    // revisione D9, R1: un motore incastrato in apertura NON risponde; risponde come llama.cpp (`tools/server/README.md`, GET /health) col 503
    await talosLavora({ cartella: s.cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
      fetchDiRete: incastrato, ...SENZA_ATTESA,
      contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks: await s.service.createKernelHooks({ sessionId: 'chat', runId }), onGiro: (e) => eventi.push(e) }).catch(soloIl503);
    return eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'ripiego');
  };
  assert.equal((await corri('giro-1')).length, 0, 'primo giro, appena aperto: muto');
  adesso += 61_000;
  assert.equal((await corri('giro-2')).length, 1, 'oltre 60 s ancora non pronto: la riga torna');
});

test('D9-05 — un profilo riuscito azzera il conto: una nuova apertura dopo oltre 60 s dal primo «non pronto» si salta di nuovo', { timeout: 15_000 }, async (t) => {
  let adesso = Date.parse('2026-11-04T08:00:00.000Z');
  t.mock.method(Date, 'now', () => adesso);
  let pronto = false;
  const s = scena(t, async ({ sessionId }) => { if (!pronto) throw nonPronto(); return { provider: 'local', model: 'test', windowTokens: 32_768, responseReserve: 4_096, sessionId }; });
  const corri = async (runId) => {
    const eventi = [];
    await talosLavora({ cartella: s.cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
      fetchDiRete: async () => Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks: await s.service.createKernelHooks({ sessionId: 'chat', runId }), onGiro: (e) => eventi.push(e) });
    return eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'ripiego');
  };
  assert.equal((await corri('giro-1')).length, 0, 'prima apertura: muto');
  adesso += 30_000; pronto = true;
  await corri('giro-2');
  adesso += 40_000; pronto = false;
  assert.equal((await corri('giro-3')).length, 0, 'apertura nuova dopo un profilo riuscito: il conto riparte, muto');
});

/* Revisione avversaria di D9 del Desktop (04/11/2026, REVISIONE-D9-MOTORE-2026-11-04.md): SD1, SD3 e SD4 dalla sua sonda. */
const fatto = async () => Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
async function corriIn(s, sessionId, runId, fetchDiRete = fatto) {
  const eventi = [];
  const esito = await talosLavora({ cartella: s.cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete, ...(fetchDiRete === incastrato ? SENZA_ATTESA : {}),
    contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks: await s.service.createKernelHooks({ sessionId, runId }), onGiro: (e) => eventi.push(e) }).catch(fetchDiRete === incastrato ? soloIl503 : (e) => { throw e; });
  return { esito, ripieghi: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'ripiego') };
}

test('D9-SD1 — catena vera: il profilo VERO col motore in apertura non dà il ripiego; pronto col modello sbagliato sì', { timeout: 20_000 }, async (t) => {
  let runtime = { state: 'loading', modelId: 'test', windowTokens: 32_768 };
  const s = scena(t, async () => resolveDesktopDefaultProfile({ provider: 'local', model: 'test', readLocalRuntime: async () => runtime, env: {} }));
  const primo = await corriIn(s, 'chat', 'giro-1');
  assert.equal(primo.esito.comeFinita, 'concluso');
  assert.equal(primo.ripieghi.length, 0, JSON.stringify(primo.ripieghi));
  runtime = { state: 'ready', modelId: 'altro', windowTokens: 32_768 };
  const secondo = await corriIn(s, 'chat', 'giro-2');
  assert.equal(secondo.ripieghi.length, 1, 'al contrario: modello diverso = guasto vero');
  assert.equal(secondo.ripieghi[0].codice, 'CTX_RUNTIME_PROFILE_MISMATCH');
});

test('D9-SD3 — il conto dei 60 s è per conversazione: una seconda conversazione appena arrivata al motore incastrato resta muta', { timeout: 20_000 }, async (t) => {
  let adesso = Date.parse('2026-11-04T08:00:00.000Z');
  t.mock.method(Date, 'now', () => adesso);
  const s = scena(t, async () => { throw nonPronto(); }, ['chat', 'altra']);
  assert.equal((await corriIn(s, 'chat', 'giro-1', incastrato)).ripieghi.length, 0);
  adesso += 61_000;
  assert.equal((await corriIn(s, 'chat', 'giro-2', incastrato)).ripieghi.length, 1, 'premessa: la prima conversazione oltre 60 s lo dice');
  assert.equal((await corriIn(s, 'altra', 'giro-1', incastrato)).ripieghi.length, 0, 'la seconda è appena arrivata: muta');
});

test('D9-SD4 — reperto R1: una apertura NUOVA, minuti dopo che la precedente era finita con una risposta, non eredita il conto vecchio', { timeout: 20_000 }, async (t) => {
  let adesso = Date.parse('2026-11-04T08:00:00.000Z');
  t.mock.method(Date, 'now', () => adesso);
  // giro di una richiesta col modello in apertura; il modello poi si apre e risponde, e nessuno rilegge il profilo
  const s = scena(t, async () => { throw nonPronto(); });
  assert.equal((await corriIn(s, 'chat', 'giro-1')).ripieghi.length, 0, 'premessa: prima apertura muta');
  adesso += 5 * 60_000; // la persona cambia modello locale, o il motore si riapre: un'apertura nuova, appena iniziata
  const { ripieghi } = await corriIn(s, 'chat', 'giro-2');
  assert.equal(ripieghi.length, 0, `apertura nuova appena iniziata detta come ripiego: ${JSON.stringify(ripieghi)}`);
});

test('D9-SD5 — la cura R1 vale per UNA conversazione: la risposta arrivata a un\u2019altra non azzera il conto di quella incastrata', { timeout: 20_000 }, async (t) => {
  let adesso = Date.parse('2026-11-04T08:00:00.000Z');
  t.mock.method(Date, 'now', () => adesso);
  const s = scena(t, async () => { throw nonPronto(); }, ['chat', 'altra']);
  assert.equal((await corriIn(s, 'altra', 'giro-1', incastrato)).ripieghi.length, 0, 'premessa: prima richiesta muta');
  adesso += 61_000;
  assert.equal((await corriIn(s, 'chat', 'giro-1')).ripieghi.length, 0, 'premessa: la prima conversazione riceve una risposta');
  assert.equal((await corriIn(s, 'altra', 'giro-2', incastrato)).ripieghi.length, 1, 'la conversazione incastrata da oltre 60 s lo dice ancora');
});

/* Verifica della cura R1 del Desktop (04/11/2026): con la cura la risposta del giro 1 di D9-05 azzera il conto già lei, e D9-05 non
   guarda più l'azzeramento del profilo riuscito. Qui il fornitore è incastrato in tutti i giri: lo azzera solo il profilo del giro 2. */
test('D9-05b — un profilo riuscito SENZA risposta del fornitore azzera il conto', { timeout: 20_000 }, async (t) => {
  let adesso = Date.parse('2026-11-04T08:00:00.000Z');
  t.mock.method(Date, 'now', () => adesso);
  let pronto = false;
  const s = scena(t, async ({ sessionId }) => { if (!pronto) throw nonPronto(); return { provider: 'local', model: 'test', windowTokens: 32_768, responseReserve: 4_096, sessionId }; });
  assert.equal((await corriIn(s, 'chat', 'giro-1', incastrato)).ripieghi.length, 0, 'prima apertura: muto');
  adesso += 30_000; pronto = true;
  await corriIn(s, 'chat', 'giro-2', incastrato);
  adesso += 40_000; pronto = false;
  assert.equal((await corriIn(s, 'chat', 'giro-3', incastrato)).ripieghi.length, 0, 'apertura nuova dopo un profilo riuscito: il conto riparte, muto');
});
