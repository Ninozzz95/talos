/*
 * 29/10/2026 — la `capture` del motore del contesto non ferma più il giro del nucleo NATIVO (sonda `_sonda-divergenza-nativo.mjs` in
 * r4-compattazione: col motore acceso una storia attiva diversa dall'archivio faceva morire il giro con CTX_HISTORY_DIVERGED, dalla
 * `capture` iniziale che rilanciava e da tre `capture` senza `try`; il guscio desktop invece ricadeva). Regola dell'owner (12/10/2026):
 * un servizio di supporto del giro che fallisce non ferma mai la chat. Forma concordata con la CLI il 29/10: ogni errore non-Stop della
 * `capture` si dice UNA volta con la riga del ripiego, il giro prosegue, `prepare` ripara. Uno Stop resta uno Stop.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4),
  windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false,
  requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: model.provider, model: model.model }) }; // la forma di c1-import-giornale-nuovo
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-capture-nativo-'));
  writeFileSync(join(c, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
/* il fornitore finto: un attrezzo (così passano anche le capture di `tool-result`), poi la risposta */
function fornitore() {
  let n = 0;
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    n += 1;
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (n === 1) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${n}`, type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
}
const lavora = (c, contextHooks, resto = {}) => {
  const eventi = [];
  return talosLavora({ cartella: c, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete: fornitore(),
    contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks, onGiro: (e) => eventi.push(e), ...resto })
    .then((esito) => ({ esito, eventi }));
};
const ripieghi = (eventi) => eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'ripiego');

test('CAPTURE-NATIVO-01 la storia diverge dall\'archivio: il giro del nucleo nativo arriva in fondo, il ripiego si dice una volta col codice', async (t) => {
  const c = cartella(t);
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-10-29T20:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:test' } : null), isSessionEnabled: (id) => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-29T20:00:00.000Z' });
  t.after(() => service.close());
  const primo = await lavora(c, await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' }));
  assert.equal(primo.esito.comeFinita, 'concluso', 'premessa: il primo giro va');
  // lo Stop dell'owner (richieste 12-13 del suo file): la storia attiva perde la coda e prende un messaggio nuovo
  const storia = [...primo.esito.messaggiFinali.slice(0, -2), { role: 'user', content: "D'ora in poi farai tutto inline" }];
  const secondo = await lavora(c, await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-2' }), { messaggiIniziali: storia });
  assert.equal(secondo.esito.comeFinita, 'concluso', 'il giro NON muore di CTX_HISTORY_DIVERGED');
  assert.deepEqual(ripieghi(secondo.eventi).map((e) => e.codice), ['CTX_HISTORY_DIVERGED'], 'detto una volta, col suo codice');
});

test('CAPTURE-NATIVO-02 una capture che fallisce a OGNI chiamata (start, before-request, response, tool-result, finished): il giro va, una riga sola', async (t) => {
  const c = cartella(t);
  const viste = [];
  const ganci = {
    capture: async ({ reason }) => { viste.push(reason); throw Object.assign(new Error('archivio guasto'), { code: 'CTX_STORE_BROKEN' }); },
    prepare: async ({ messages }) => ({ messages }),
  };
  const { esito, eventi } = await lavora(c, ganci);
  assert.equal(esito.comeFinita, 'concluso');
  for (const reason of ['start', 'before-request', 'response', 'tool-result', 'finished']) assert.ok(viste.includes(reason), `premessa: la capture «${reason}» è stata chiamata`);
  assert.deepEqual(ripieghi(eventi).map((e) => e.codice), ['CTX_STORE_BROKEN']);
});

test('CAPTURE-NATIVO-03 AL CONTRARIO: uno Stop resta uno Stop — la capture che lancia AbortError non viene ingoiata', async (t) => {
  const c = cartella(t);
  const ganci = {
    capture: async ({ reason }) => { if (reason === 'response') throw Object.assign(new Error('fermato'), { name: 'AbortError' }); },
    prepare: async ({ messages }) => ({ messages }),
  };
  let lanciato = null;
  let esito = null;
  try { ({ esito } = await lavora(c, ganci)); } catch (errore) { lanciato = errore; }
  assert.ok(lanciato?.name === 'AbortError' || (esito && esito.comeFinita !== 'concluso'), 'un AbortError non diventa un giro concluso');
});

/*
 * Trovato dal vivo il 29/10/2026 notte (Desktop, prova «li ferma il modello» sul 4174): un sotto-agente fermato a metà giro consegnava
 * al padre come «risultato» la frase interna «The active history differs from the archive…». Lo Stop arriva mentre gira un attrezzo,
 * la `capture('tool-result')` che segue fallisce (CTX_HISTORY_DIVERGED: la storia interrotta non combacia con l'archivio) e il gestore
 * RILANCIAVA quell'errore perché `segnaleStop.aborted`: l'esito del giro diventava l'errore dell'archivio invece dello Stop.
 */
test('CAPTURE-NATIVO-05 Stop durante un attrezzo e capture che fallisce dopo: il giro è «fermato», mai l\'errore interno dell\'archivio', async (t) => {
  const c = cartella(t);
  const stop = new AbortController();
  const divergenza = Object.assign(new Error('The active history differs from the archive. The originals are kept; the full version must be recovered.'), { code: 'CTX_HISTORY_DIVERGED' });
  const ganci = {
    capture: async ({ reason }) => { if (reason === 'tool-result' || reason === 'finished') { stop.abort(); throw divergenza; } },
    prepare: async ({ messages }) => ({ messages }),
  };
  let lanciato = null;
  let esito = null;
  try { ({ esito } = await lavora(c, ganci, { segnaleStop: stop.signal })); } catch (errore) { lanciato = errore; }
  // uno Stop chiude il giro SUBITO (REV-B8-A4) — o con l'esito «fermato» o con un errore DI STOP — ma mai con l'errore dell'archivio
  if (lanciato) {
    assert.equal(lanciato.fermatoSuRichiesta, true, `è un errore di Stop, non della capture: ${lanciato.message}`);
    assert.doesNotMatch(String(lanciato.message), /differs from the archive/u, 'la frase interna non diventa il risultato');
  } else {
    assert.equal(esito.comeFinita, 'fermato', 'uno Stop è uno Stop');
    assert.doesNotMatch(JSON.stringify(esito), /differs from the archive/u, 'la frase interna non diventa il risultato');
  }
});

test('CAPTURE-NATIVO-04 il sorgente: ogni capture del nucleo passa dal gestore che non ferma il giro (un sesto punto non torna senza)', () => {
  const sorgente = readFileSync(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8');
  const dirette = sorgente.match(/contextHooks\?\.capture\?\.\(/gu) ?? [];
  assert.equal(dirette.length, 1, 'una sola chiamata diretta: quella dentro catturaSenzaFermare');
  const chiamate = sorgente.match(/await catturaSenzaFermare\('(start|before-request|response|tool-result|finished)'/gu) ?? [];
  assert.deepEqual(chiamate.map((c) => c.match(/'([a-z-]+)'/u)[1]).sort(), ['before-request', 'finished', 'response', 'start', 'tool-result']);
});
