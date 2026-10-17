/*
 * 13/10/2026, review avversaria di `ac8f5a362` («l'archivio si ripara da solo») — la CAUSA della divergenza, non il sintomo.
 *
 * Dal giornale della sessione 36289618 (letta solo nella struttura: tipi e ruoli): le 7 righe di ripiego stanno TUTTE a
 * `giro: 0`, subito dopo `RunStarted`, e TUTTE e sole nei giri la cui storia nuova comincia con un `system` DOPO il messaggio
 * della persona (7 su 7; nei 12 giri senza quel `system`, zero). Quel `system` è l'aggiornamento del contesto del progetto che
 * `agent-service.mjs` appende IN CODA quando il preambolo è cambiato (modello, permesso, mappa, AGENTS.md):
 *   `messaggiIniziali = [...messaggiIniziali, { role: 'system', content: coda }]`
 * Il kernel lo archivia con `capture('start')` (è storia vera, resta nella conversazione), ma il guscio in `prepare` staccava
 * OGNI `system` in coda come effimero (`staccaEffimeri`): l'archivio aveva N+1 messaggi, la richiesta ne portava N ⇒
 * `CTX_HISTORY_DIVERGED`, forma «più corta». Con la riparazione, a ogni giro così l'archivio INTERO (versioni e riassunti
 * compresi) andava da parte.
 *
 * Qui: guscio vero + servizio vero + archivio vero + motore vero, fornitore finto. Nessuna rete.
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
const AGGIORNAMENTO = '[Project context update: replaces the earlier one] model: another/model';
const PIANO = 'Plan mode is on';

function scena(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-coda-di-sistema-'));
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

async function giro({ cartella, service }, numero, resto = {}) {
  const eventi = [];
  const fornitore = fintoFornitore();
  const esito = await talosLavora({
    cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: fornitore.fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0',
    contextHooks: await service.createKernelHooks({ sessionId: 'chat', runId: `giro-${numero}` }),
    onGiro: (e) => eventi.push(e),
    ...resto,
  });
  assert.equal(esito.comeFinita, 'concluso', `giro ${numero} concluso`);
  return { esito, eventi, fornitore };
}

const righe = (eventi, motivo) => eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === motivo);

test('ARCHIVIO-CODA-DI-SISTEMA-01 — un aggiornamento di sistema in coda alla storia NON fa divergere l’archivio: niente da parte, niente ripiego, a nessun giro', async (t) => {
  const s = scena(t);
  const primo = await giro(s, 1);
  let storia = primo.esito.messaggiFinali;
  for (let numero = 2; numero <= 4; numero += 1) {
    /* come `agent-service.mjs`: storia + messaggio della persona + aggiornamento del preambolo IN CODA (è storia vera) */
    const iniziali = [...storia, { role: 'user', content: `giro ${numero}` }, { role: 'system', content: `${AGGIORNAMENTO} ${numero}` }];
    const { esito, eventi, fornitore } = await giro(s, numero, { messaggiIniziali: iniziali });
    assert.equal(righe(eventi, 'archivio-riallineato').length, 0, `giro ${numero}: l'archivio non va riallineato`);
    assert.equal(righe(eventi, 'ripiego').length, 0, `giro ${numero}: il motore lavora, nessun ripiego`);
    assert.ok(fornitore.corpi[0].messages.some((m) => m.role === 'system' && String(m.content).includes(`${AGGIORNAMENTO} ${numero}`)), 'l aggiornamento arriva al modello');
    storia = esito.messaggiFinali;
    assert.ok(storia.some((m) => m.role === 'system' && String(m.content).includes(`${AGGIORNAMENTO} ${numero}`)), 'e resta nella storia');
  }
  assert.deepEqual(s.daParte, [], 'nessuna copia da parte');
  /* l'archivio È la storia: stessi messaggi, stesso ordine (l'archivio non ha buchi né pezzi in meno) */
  const archiviati = [];
  for (let dopo = 0; ;) { const pagina = await s.store.readOriginals({ sessionId: 'chat', afterSequence: dopo, limit: 1000 }); archiviati.push(...pagina); if (pagina.length < 1000) break; dopo = pagina.at(-1).sequence; }
  assert.deepEqual(archiviati.map((r) => r.message), storia);
});

test('ARCHIVIO-CODA-DI-SISTEMA-02, al contrario — la nota del Piano (effimera davvero) non entra né nell’archivio né nella storia, e arriva al modello', async (t) => {
  const s = scena(t);
  const { esito, eventi, fornitore } = await giro(s, 1, { modalitaOperativa: 'piano' });
  assert.ok(fornitore.corpi[0].messages.some((m) => m.role === 'system' && String(m.content).includes(PIANO)), 'la nota del Piano arriva al modello');
  assert.equal(esito.messaggiFinali.some((m) => m.role === 'system' && String(m.content).includes(PIANO)), false, 'ma non è storia');
  const archiviati = await s.store.readOriginals({ sessionId: 'chat', limit: 1000 });
  assert.equal(archiviati.some((r) => String(r.message.content).includes(PIANO)), false, 'né archivio');
  assert.equal(righe(eventi, 'archivio-riallineato').length + righe(eventi, 'ripiego').length, 0);
  assert.deepEqual(s.daParte, []);
});

test('ARCHIVIO-CODA-DI-SISTEMA-03 — Piano E aggiornamento in coda insieme: l’aggiornamento è storia, la nota del Piano no', async (t) => {
  const s = scena(t);
  const primo = await giro(s, 1);
  const iniziali = [...primo.esito.messaggiFinali, { role: 'user', content: 'giro 2' }, { role: 'system', content: AGGIORNAMENTO }];
  const { esito, eventi, fornitore } = await giro(s, 2, { messaggiIniziali: iniziali, modalitaOperativa: 'piano' });
  assert.equal(righe(eventi, 'archivio-riallineato').length + righe(eventi, 'ripiego').length, 0);
  assert.deepEqual(s.daParte, []);
  const primaRichiesta = fornitore.corpi[0].messages;
  assert.ok(primaRichiesta.some((m) => String(m.content).includes(AGGIORNAMENTO)) && primaRichiesta.some((m) => String(m.content).includes(PIANO)));
  const archiviati = (await s.store.readOriginals({ sessionId: 'chat', limit: 1000 })).map((r) => r.message);
  assert.deepEqual(archiviati, esito.messaggiFinali);
  assert.equal(archiviati.some((m) => String(m.content).includes(PIANO)), false);
});
