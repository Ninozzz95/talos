/*
 * Revisione avversaria di 0120d21e0 (16/10/2026, owner «Non aspettare se entra»). Col motore del contesto la richiesta ora parte
 * fino alla finestra VERA (finestra − riserva), cioè dentro il margine che esisteva proprio per gli errori della stima (15% con
 * l'euristica, 5% con l'ancora del fornitore: la parte aggiunta dopo l'ultima risposta resta stimata a byte/3,5). Se la stima ha
 * sbagliato, il fornitore risponde «contesto pieno». Col motore sano l'`infer` del servizio (`context-desktop-service.mjs:129`) è
 * `operation(signal)`, senza il ritentativo K8 che ha il legacy (`talosHarness.desktop-hotfix.mjs:928-961`): il giro muore.
 *
 * ⛔ Questa prova dimostra solo che il PERCORSO non c'è (nessuna seconda richiesta): il fornitore finto accetta la seconda, e qui
 *   non c'è niente da riassumere. La cura giusta ritenta dopo aver aspettato o usato il riassunto in volo/pronto, come K8 nel
 *   legacy (che con una storia così corta non può riassumere niente e rilancia l'errore: per questo non c'è un controllo legacy).
 *
 * Guscio vero + servizio vero + archivio vero + motore vero, fornitore finto (come `archivio-capture-non-ferma`). Nessuna rete.
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

function scena(t, { senzaAttesaDalMotore = false } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-overflow-motore-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-10-16T08:00:00.000Z' });
  const alMotore = []; // che cosa riceve davvero il motore (`waitForInFlight`), oltre al gancio
  const motore = { ...engine, prepareForRequest: async (opzioni) => {
    alMotore.push(opzioni.waitForInFlight === true);
    const esito = await engine.prepareForRequest(opzioni);
    return senzaAttesaDalMotore && alMotore.length === 1 ? { ...esito, sentWithoutWaiting: true } : esito;
  } };
  const service = createDesktopContextService({ store, engine: motore, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-16T08:00:00.000Z' });
  t.after(() => service.close());
  return { cartella, service, alMotore };
}

/** Il fornitore dice «contesto pieno» alla PRIMA richiesta (la stima aveva sottovalutato), poi risponde. */
function fornitoreCheRifiutaUnaVolta() {
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    corpi.push(JSON.parse(init.body));
    if (corpi.length === 1) {
      return new Response(JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 60000 tokens. However, you requested about 61234 tokens." } }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 5 } });
  };
  return { fetchDiRete, corpi };
}

async function giro(cartella, contextHooks) {
  const fornitore = fornitoreCheRifiutaUnaVolta();
  let esito = null; let errore = null;
  try {
    esito = await talosLavora({
      cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
      fetchDiRete: fornitore.fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks,
    });
  } catch (e) { errore = e; }
  return { esito, errore, fornitore };
}

/*
 * Cura (16/10/2026): il ritentativo scatta dopo una richiesta mandata SENZA aspettare il riassunto in volo (`sentWithoutWaiting`, la
 * sola che parte senza margine): si rifà la preparazione con `waitForInFlight` e si riprova una volta. Senza quell'invio la richiesta
 * aveva il margine di sempre, e riprovarla uguale darebbe lo stesso rifiuto: niente secondo tentativo, come prima.
 * Qui il «senza attesa» del motore si simula sui ganci veri del servizio (il motore lo prova da solo in giro-non-aspettare).
 */
function ganciCheMandanoSenzaAttesa(veri, preparazioni) {
  return { ...veri, prepare: async (payload) => {
    preparazioni.push(payload.waitForInFlight === true);
    const esito = await veri.prepare(payload);
    return preparazioni.length === 1 ? { ...esito, sentWithoutWaiting: true } : esito;
  } };
}

test('NON-ASPETTARE-REV-01 — mandata senza aspettare, un «contesto pieno» del fornitore vale UN ritentativo che aspetta il riassunto (come K8)', async (t) => {
  const s = scena(t);
  const preparazioni = [];
  const { esito, errore, fornitore } = await giro(s.cartella, ganciCheMandanoSenzaAttesa(await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' }), preparazioni));
  assert.ok(fornitore.corpi.length >= 2, `una sola richiesta: il giro è morto al primo «contesto pieno» (${errore?.code ?? errore?.message ?? esito?.comeFinita})`);
  assert.equal(preparazioni[1], true, 'la seconda preparazione chiede al motore di aspettare il riassunto in volo');
  assert.deepEqual(s.alMotore.slice(0, 2), [false, true], 'e il servizio lo passa davvero al motore');
  assert.equal(esito?.comeFinita, 'concluso');
});

test('NON-ASPETTARE-REV-02 — AL CONTRARIO: mandata col margine di sempre, nessun secondo tentativo uguale al primo', async (t) => {
  const s = scena(t);
  const { fornitore, errore } = await giro(s.cartella, await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' }));
  assert.equal(fornitore.corpi.length, 1, 'una sola richiesta: il rifiuto passa come prima');
  assert.match(String(errore?.message ?? ''), /maximum context length|HTTP 400/u);
});

test('NON-ASPETTARE-REV-05 — col segno messo dal MOTORE riprova il guscio (corregge e riattacca gli effimeri), il servizio no: un ritentativo solo', async (t) => {
  const s = scena(t, { senzaAttesaDalMotore: true });
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  let preparazioniDelGuscio = 0;
  const { esito, fornitore } = await giro(s.cartella, { ...veri, prepare: (payload) => { preparazioniDelGuscio += 1; return veri.prepare(payload); } });
  assert.equal(esito?.comeFinita, 'concluso');
  assert.equal(fornitore.corpi.length, 2, 'due richieste, non tre');
  assert.equal(preparazioniDelGuscio, 2, 'la seconda preparazione l ha chiesta il guscio, non il servizio per conto suo');
});
