/*
 * ⛔ Difetto (11) delle foto del 25/09 (giro vero GLM sul 4174, fase Workflow UI): una proposta di workflow RESPINTA
 *   dal server appariva nella conversazione identica a una riuscita — nessun segno di errore sulla riga.
 * CAUSA, misurata nel kernel il 26/09: l'esito di un attrezzo che fallisce comincia col NOME dell'attrezzo —
 *   `workflow_plan_propose failed [WORKFLOW_DEFINITION_INVALID]: …` (`talosHarness.mjs:10646-10651`) — e la regola
 *   della chat (`esitoAttrezzoFallito`) riconosceva solo gli esiti che cominciano con `REFUSED.`/`ERROR`/`FAILED`.
 *   Non è un caso isolato: nel kernel ci sono 37 esiti nella forma `<attrezzo> failed…` (note, attività, memoria,
 *   libreria, ricerche, Officina, domanda, piano), più due alias (`search failed` di `web_search`, `delegation failed`
 *   di `delega_sottotask`). Tutti verdi a schermo.
 * La regola è UNA, condivisa da chat e pannello della figlia (`conversazione-figlia.js`, `esitoDaContenuto`): la
 *   stessa chiamata non può essere verde in un posto e rossa nell'altro.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { esitoDichiaraFallimento } from '../../src/components/esito-comando.js';
import { esitoDaContenuto } from '../../src/components/conversazione-figlia.js';

const FALLITI = [
  ['workflow_plan_propose', 'workflow_plan_propose failed [WORKFLOW_DEFINITION_INVALID]: phase "p2" has no nodes'],
  ['workflow_plan_propose', 'workflow_plan_propose failed [QUERY_INVALID]: expected exactly one "draft" object (title, objective, phases, nodes) and a valid tool call identity.'],
  ['notes_create', 'notes_create failed: title is required'],
  ['ask_user_question', 'ask_user_question failed [QUERY_INVALID]: questions must be an array'],
  ['web_search', 'search failed: blocked by policy'],
  ['delega_sottotask', 'delegation failed: child limit reached'],
  ['workflow_plan_propose', 'REFUSED. workflow_plan_propose requires the root agent with a planning store. Nothing was proposed.'],
  ['leggi', 'ERROR: file not found'],
];

const RIUSCITI = [
  ['workflow_plan_propose', '{"schema":"talos.workflow-proposal-receipt.v1","workflowId":"902e47a4-b29b-854e-8cd6-8f5d1bb43acd","version":1,"status":"proposed","preflight":{"errors":[],"warnings":[]}}'],
  /* Un file letto che PARLA di un fallimento non è una lettura fallita: il nome davanti deve essere quello dell'attrezzo. */
  ['leggi', 'notes_create failed: this line is inside a log file'],
  ['cerca', 'build failed: src/a.mjs:12'],
  ['notes_create', '{"id":"n-1","title":"ok"}'],
  /* `failed` senza i due punti del contratto non è l'intestazione del kernel. */
  ['notes_create', 'notes_create failed to be slow, all good'],
];

test('ESITO-FAIL-01 — un esito «<attrezzo> failed…» è un fallimento (chat e figlia, stessa risposta)', () => {
  for (const [nome, testo] of FALLITI) {
    assert.equal(esitoDichiaraFallimento(nome, testo), true, `${nome}: «${testo.slice(0, 60)}»`);
    assert.equal(esitoDaContenuto(nome, testo), 'error', `figlia, ${nome}: «${testo.slice(0, 60)}»`);
  }
});

test('ESITO-FAIL-02 — AL CONTRARIO: una ricevuta, un file che nomina un altro attrezzo, un «failed» senza contratto restano riusciti', () => {
  for (const [nome, testo] of RIUSCITI) {
    assert.equal(esitoDichiaraFallimento(nome, testo), false, `${nome}: «${testo.slice(0, 60)}»`);
    assert.equal(esitoDaContenuto(nome, testo), 'success', `figlia, ${nome}: «${testo.slice(0, 60)}»`);
  }
});
