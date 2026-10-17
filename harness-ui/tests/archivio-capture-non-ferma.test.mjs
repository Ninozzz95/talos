/*
 * 13/10/2026, review avversaria di `ac8f5a362` — la riparazione dell'archivio vive in `prepare`, ma il kernel chiama PRIMA
 * `capture` (`reason: 'start'`, poi `before-request`, `response`, `tool-result`, `finished`), che sincronizza gli originali in
 * modo severo. Una storia davvero riscritta (il caso per cui la riparazione è nata) lancia `CTX_HISTORY_DIVERGED` già in
 * `capture('start')`, fuori da ogni `try` del kernel: il giro MORIVA prima di arrivare a `prepare`, e la riparazione non era
 * raggiungibile. Regola dell'owner (12/10/2026): un servizio di supporto del giro che fallisce non ferma mai la chat.
 *
 * Guscio vero + servizio vero + archivio vero + motore vero, fornitore finto. Nessuna rete.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };

function scena(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-capture-non-ferma-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const daParte = [];
  const spia = { ...store, setAsideSession: async (argomenti) => { daParte.push(argomenti.asideId); return store.setAsideSession(argomenti); } };
  const engine = createContextEngine({ store: spia, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-10-13T08:00:00.000Z' });
  const service = createDesktopContextService({ store: spia, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-13T08:00:00.000Z' });
  t.after(() => service.close());
  return { cartella, store, service, daParte };
}

function fintoFornitore({ chiamateTool = 1 } = {}) {
  const corpi = [];
  let lavoro = 0;
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    lavoro += 1;
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (lavoro <= chiamateTool) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${corpi.length}_${lavoro}`, type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  return { fetchDiRete, corpi };
}

async function giro({ cartella }, contextHooks, resto = {}) {
  const eventi = [];
  const fornitore = fintoFornitore();
  const esito = await talosLavora({
    cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: fornitore.fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0',
    contextHooks, onGiro: (e) => eventi.push(e),
    ...resto,
  });
  return { esito, eventi, fornitore };
}

const righe = (eventi, motivo) => eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === motivo);

test('ARCHIVIO-CAPTURE-NON-FERMA-01 — una storia riscritta fra due giri: il giro NON muore in capture, l’archivio si riallinea in prepare e lo dice una volta', async (t) => {
  const s = scena(t);
  const primo = await giro(s, await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' }));
  assert.equal(primo.esito.comeFinita, 'concluso');
  /* la storia torna riscritta in mezzo (una riparazione della ripresa, un altro processo, un giornale ricostruito) */
  const riscritta = primo.esito.messaggiFinali.map((m, i) => (i === primo.esito.messaggiFinali.length - 1 ? { ...m, content: `${m.content} (riscritto)` } : m));
  const secondo = await giro(s, await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-2' }), { messaggiIniziali: [...riscritta, { role: 'user', content: 'continua' }] });
  assert.equal(secondo.esito.comeFinita, 'concluso', 'il giro arriva in fondo');
  assert.equal(secondo.fornitore.corpi.length, 2, 'tutte le richieste partono');
  assert.equal(righe(secondo.eventi, 'archivio-riallineato').length, 1, 'riallineato, una volta');
  assert.equal(righe(secondo.eventi, 'ripiego').length, 0, 'il motore ha lavorato: non è un ripiego');
  assert.equal(s.daParte.length, 1);
  assert.deepEqual((await s.store.readOriginals({ sessionId: 'chat', limit: 1000 })).map((r) => r.message), secondo.esito.messaggiFinali, 'l archivio vivo è la storia del giro');
});

test('ARCHIVIO-CAPTURE-NON-FERMA-02 — capture che fallisce A METÀ giro (dopo un attrezzo) non ferma il giro; uno Stop resta uno Stop', async (t) => {
  const s = scena(t);
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const motivi = [];
  const hooks = { ...veri, capture: async (payload) => { motivi.push(payload.reason); if (payload.reason === 'tool-result') throw Object.assign(new Error('archivio occupato'), { code: 'CTX_PERSISTENCE_FAILED' }); return veri.capture(payload); } };
  const { esito, fornitore } = await giro(s, hooks);
  assert.equal(esito.comeFinita, 'concluso', 'il giro arriva in fondo');
  assert.equal(fornitore.corpi.length, 2);
  assert.ok(motivi.includes('tool-result') && motivi.includes('finished'));
  /* ciò che capture non ha scritto lo recupera la sincronizzazione dopo: l'archivio non ha buchi */
  assert.deepEqual((await s.store.readOriginals({ sessionId: 'chat', limit: 1000 })).map((r) => r.message), esito.messaggiFinali);

  const stop = new AbortController();
  const fermati = { ...veri, capture: async (payload) => { if (payload.reason === 'before-request') { stop.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }); } return veri.capture(payload); } };
  let errore = null; let finito = null;
  const s2 = scena(t);
  try { finito = await giro(s2, { ...fermati, capture: fermati.capture, prepare: (await s2.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' })).prepare }, { segnaleStop: stop.signal }); } catch (e) { errore = e; }
  assert.equal(finito?.fornitore.corpi.length ?? 0, 0, 'dopo uno Stop non parte nessuna richiesta');
  assert.ok(errore || finito?.esito?.comeFinita !== 'concluso', 'uno Stop resta uno Stop');
});
