/*
 * Il ritentativo dopo «contesto pieno» nel SERVIZIO del contesto (16/10/2026): la CLI usa i ganci del servizio col suo kernel, senza
 * il guscio desktop, e ha chiesto che il ritentativo stia qui «così vale per tutti e due». Una richiesta mandata SENZA aspettare il
 * riassunto in volo (`sentWithoutWaiting`, owner 16/10 sera «Non aspettare se entra») che il fornitore rifiuta per contesto pieno
 * si prepara di nuovo con `waitForInFlight` e si riprova UNA volta, nello stesso array (il kernel lo rilegge a ogni invio).
 * Il motore è vero; il suo «senza attesa» si simula sulla prima preparazione (il motore lo prova da solo in giro-non-aspettare).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };
const MESSAGGI = [{ role: 'system', content: 'Sei un assistente.' }, { role: 'user', content: 'Elenca la cartella.' }];
const pieno = () => Object.assign(new Error("HTTP 400 after 1 attempt: This endpoint's maximum context length is 60000 tokens. However, you requested about 61234 tokens."), { status: 400 });

async function scena(t, { secondaFallisce = false, avvolgi = null } = {}) {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-10-16T08:00:00.000Z' });
  const alMotore = [];
  const motore = { ...engine, prepareForRequest: async (opzioni) => {
    alMotore.push(opzioni.waitForInFlight === true);
    if (alMotore.length === 2 && secondaFallisce) throw Object.assign(new Error('Il contesto richiede una compattazione completata.'), { code: 'CTX_COMPACTION_REQUIRED' });
    const esito = await engine.prepareForRequest(opzioni);
    return alMotore.length === 1 ? { ...esito, sentWithoutWaiting: true } : { ...esito, messages: [...esito.messages, { role: 'user', content: 'RIPREPARATA' }] };
  } };
  const service = createDesktopContextService({ store, engine: motore, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-16T08:00:00.000Z' });
  t.after(() => service.close());
  const veri = await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const ganci = avvolgi ? avvolgi(veri) : veri;
  const preparato = await ganci.prepare({ messages: MESSAGGI, tools: [] });
  const spediti = [];
  const operazione = async () => { spediti.push(preparato.messages.map(m => m.content)); if (spediti.length === 1) throw pieno(); return { scelta: 'ok' }; };
  return { ganci, preparato, spediti, operazione, alMotore };
}

test('RITENTA-SERVIZIO-01 — mandata senza aspettare e rifiutata per contesto pieno: una seconda preparazione che aspetta, nello stesso array, poi ok', async (t) => {
  const s = await scena(t);
  assert.deepEqual(await s.ganci.infer({ signal: new AbortController().signal }, s.operazione), { scelta: 'ok' });
  assert.equal(s.spediti.length, 2);
  assert.deepEqual(s.alMotore, [false, true], 'la seconda preparazione chiede al motore di aspettare il riassunto in volo');
  assert.ok(s.spediti[1].includes('RIPREPARATA'), 'la richiesta riprovata è quella nuova, nello stesso array che il kernel rilegge');
  assert.equal(s.preparato.retriedAfterContextFull, true, 'si vede: chi vuole lo dice a parole');
});

test('RITENTA-SERVIZIO-02 — AL CONTRARIO: col ritentativo spento (il guscio desktop fa il suo) un tentativo solo', async (t) => {
  const s = await scena(t);
  await assert.rejects(s.ganci.infer({ signal: new AbortController().signal, retryContextFull: false }, s.operazione), /maximum context length/u);
  assert.equal(s.spediti.length, 1);
});

test('RITENTA-SERVIZIO-03 — se la seconda preparazione fallisce passa il «contesto pieno» del fornitore, classificato, non l errore del motore', async (t) => {
  const s = await scena(t, { secondaFallisce: true });
  await assert.rejects(s.ganci.infer({ signal: new AbortController().signal }, s.operazione), (e) => /maximum context length/u.test(e.message) && e.classificazione === 'contesto-pieno');
  assert.equal(s.spediti.length, 1);
});

test('RITENTA-SERVIZIO-04 — uno Stop resta uno Stop: nessuna seconda preparazione, nessuna seconda richiesta', async (t) => {
  const s = await scena(t);
  const stop = new AbortController();
  const operazione = async () => { s.spediti.push('x'); stop.abort(); throw pieno(); };
  await assert.rejects(s.ganci.infer({ signal: stop.signal }, operazione), /maximum context length/u);
  assert.equal(s.spediti.length, 1);
  assert.deepEqual(s.alMotore, [false]);
});

/* F6 della CLI (16/10/2026): l'ospite che avvolge `prepare` (la CLI: `retryStale`, `context-archive.ts`) vede passare dal SUO
   involucro anche la seconda preparazione del ritentativo, come lo vedrebbe dal kernel. */
test('RITENTA-SERVIZIO-05 — la seconda preparazione passa dalla prepare AVVOLTA dall ospite, non da quella interna', async (t) => {
  const viste = [];
  const s = await scena(t, { avvolgi: (veri) => ({ ...veri, prepare: async (input) => { viste.push(input.waitForInFlight === true); return veri.prepare(input); } }) });
  assert.deepEqual(await s.ganci.infer({ signal: new AbortController().signal }, s.operazione), { scelta: 'ok' });
  assert.deepEqual(viste, [false, true], 'la prima dal kernel, la seconda dal ritentativo: tutte e due dall involucro');
  assert.ok(s.spediti[1].includes('RIPREPARATA'));
});
