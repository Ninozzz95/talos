/*
 * ⛔⛔⛔ IL TETTO DEI GIRI NON ESISTE PIÙ, E NESSUNO PUÒ RIMETTERLO DI NASCOSTO.
 *
 * Owner, 11/09/2026, davanti alla carta «Il giro ha finito i passi che aveva a disposizione senza
 * chiudere il compito» su una sessione a 24/24: «avevamo detto che non c'erano limiti e doveva
 * essere così».
 *
 * Misurato sulla sessione `7b21ff93` (ricerca web su GLM 5.3 + paper PDF sul Desktop): **37
 * chiamate ad attrezzi in 24 giri**, e il compito si è fermato PRIMA di generare il documento —
 * l'ultima chiamata stava ancora leggendo il PDF di origine. Il tetto non ha protetto da niente:
 * ha tagliato un lavoro che stava andando avanti.
 *
 * ⛔ Un tetto sul NUMERO DI GIRI non è una guardia contro il loop — è una guardia contro il TEMPO,
 *   e il primo a incontrarla è il task lungo ma sano. Le guardie vere restano tutte, ed è la difesa
 *   a più strati che la ricerca prescrive (FutureAGI «Infinite-Loop Agent Failure»; Inkog «AI Agent
 *   Infinite Loop Detection & Prevention»; arXiv:2607.01641 «When Agents Do Not Stop», letti
 *   l'11/09/2026 — *multiple layers of termination conditions*: un solo freno fallisce, gli strati no):
 *     1. lo STOP della persona;
 *     2. la deduplica delle chiamate identiche nello stesso giro (`fermatoPerRipetizione`);
 *     3. la compattazione periodica, che è ciò che rende sostenibile un ciclo senza tetto.
 *
 * ⇒ Questo file prova le due metà che contano: che un task LUNGO arriva in fondo, e che la
 *   diagnosi «giri esauriti» resta viva dove un tetto viene fissato apposta (il pre-loop planner,
 *   una misura del banco). Un cancello che provasse solo la prima lascerebbe rimettere il tetto
 *   senza accorgersene.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { comeSonoFinitiIGiri, talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* Più dei 24 di prima, e abbastanza da attraversare due compattazioni (ogni 8 giri). */
const GIRI_DA_FARE = 30;

/**
 * Un fornitore finto che chiede un attrezzo per `giriDiAttrezzo` volte e poi risponde.
 * ⛔ L'argomento cambia a ogni giro apposta: due chiamate IDENTICHE sono un caso diverso, coperto
 *   dalla guardia sulla ripetizione — qui si misura la lunghezza del lavoro, non il loop.
 */
function fornitoreCheLavoraALungo(giriDiAttrezzo) {
  let chiamate = 0;
  return {
    get chiamate() { return chiamate; },
    fetchDiRete: async () => {
      chiamate += 1;
      if (chiamate <= giriDiAttrezzo) {
        return Response.json({
          choices: [{
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: `call_${chiamate}`,
                type: 'function',
                function: { name: 'elenca', arguments: JSON.stringify({ percorso: '.', nota: `giro ${chiamate}` }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          /* ⛔ Senza `usage` il kernel lascia il conto a `null` (IGNOTO non e GRATIS, sua regola):
             il confronto fra i due strumenti misurerebbe l'assenza del dato, non i giri. */
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
      }
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'Fatto, il compito è chiuso.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
    },
  };
}

test('⭐⭐⭐ un task che vuole 30 giri arriva in fondo: nessun tetto lo taglia più a 24', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-giri-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const fornitore = fornitoreCheLavoraALungo(GIRI_DA_FARE);

  const esito = await talosLavora({
    cartella,
    task: { consegna: 'un lavoro lungo, come la ricerca che si è fermata a 24/24' },
    modello: 'x', chiave: 'y',
    fetchDiRete: fornitore.fetchDiRete,
  });

  assert.notEqual(
    esito.comeFinita,
    'giri-esauriti',
    '⛔ il tetto dei giri è tornato: è esattamente la carta che l’owner non vuole più vedere',
  );
  assert.equal(esito.comeFinita, 'concluso');
  /*
   * ⛔ La misura è QUANTE VOLTE IL MODELLO È STATO INTERROGATO, contata dal fornitore finto:
   *   è il numero che il vecchio tetto tagliava. `esito.usage.giri` conta la stessa cosa dal lato
   *   del kernel e deve concordare — due strumenti sullo stesso fatto, come vuole la regola.
   */
  assert.ok(
    fornitore.chiamate > 24,
    `⛔ il lavoro si è fermato dopo ${fornitore.chiamate} interrogazioni: col vecchio tetto di 24 questo task moriva qui`,
  );
  assert.ok(esito.usage.giri > 24, `il kernel conta ${esito.usage.giri} giri: non concorda col fornitore (${fornitore.chiamate})`);
});

test('⛔⛔ e la sua diagnosi non compare più nel testo consegnato: era la frase che l’owner leggeva a schermo', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-giri-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const fornitore = fornitoreCheLavoraALungo(GIRI_DA_FARE);

  const esito = await talosLavora({
    cartella, task: { consegna: 'un lavoro lungo' }, modello: 'x', chiave: 'y',
    fetchDiRete: fornitore.fetchDiRete,
  });

  const detto = String(esito.messaggiFinali?.at(-1)?.content ?? '') + String(esito.detto ?? '');
  assert.ok(!/giri esauriti/i.test(detto), `⛔ la frase «giri esauriti» è tornata nel testo: ${detto.slice(0, 200)}`);
});

/*
 * ⛔⛔⛔ IL VERSO CONTRARIO, e non è una formalità: senza questo, `comeSonoFinitiIGiri` potrebbe
 *   essere diventata una funzione che non dice MAI «giri esauriti» — cioè un ramo morto invece di
 *   un ramo che scatta quando deve. Il pre-loop planner un tetto ce l'ha ancora (8, voluto), e il
 *   banco può fissarne uno per una misura: lì la diagnosi serve ancora, ed è ancora giusta.
 */
test('⛔⛔⛔ AL CONTRARIO — dove un tetto viene fissato APPOSTA, «giri esauriti» resta la diagnosi', () => {
  const finito = comeSonoFinitiIGiri({ giroRaggiunto: 8, giriMassimi: 8, haRisposto: false });
  assert.equal(finito.esito, 'giri-esauriti');
  assert.match(finito.detto, /giri esauriti: 8 su 8/);
});

test('⛔ e con il tetto tolto nessun numero di giri, per grande che sia, produce «giri esauriti»', () => {
  for (const giro of [24, 25, 1_000, 10_000]) {
    const esito = comeSonoFinitiIGiri({ giroRaggiunto: giro, giriMassimi: Number.POSITIVE_INFINITY, haRisposto: true });
    assert.equal(esito.esito, 'concluso', `al giro ${giro} è ricomparso un tetto`);
  }
  /* ⛔ E un tetto ASSENTE non deve scivolare nel ramo del tetto per colpa di un confronto con
     `undefined`: è così che un ramo smette di scattare per il motivo sbagliato. */
  const senzaTetto = comeSonoFinitiIGiri({ giroRaggiunto: 99, giriMassimi: undefined, haRisposto: true });
  assert.equal(senzaTetto.esito, 'concluso');
});
