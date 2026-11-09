/*
 * Decisione 99 (owner 03/11/2026 sera, registro riga 99; fonti FONTI-D99-TESTE-DEI-RIFIUTI-2026-11-03.md).
 *   1. `REFUSED [CODICE].` della delega (`rifiutoDellaDelega`, talosHarness.mjs:750) è un no del kernel: ROSSO, come `REFUSED.`
 *      (H-05). Prima `INIZIO_FALLITO` leggeva solo `REFUSED.` e la delega rifiutata col codice era VERDE.
 *   2. `REFUSED: ` degli elenchi a pagine (talosHarness.mjs:5526-5559) è un passo del giro: NEUTRO, come la copia saltata
 *      (Hermes `tool_result_classification.py:27-31`). Mai verde, mai rosso.
 *   3. Il kernel non cambia: il freno dei giri continua a contarli (decisione 99, seconda risposta).
 *   Revisione della CLI (REVISIONE-D99-2026-11-03): R1 il neutro SOLO per gli attrezzi a pagine (talosHarness.mjs:5392, più i nomi di
 *   prima di C5); R2 i due tetti (5534, 5559) hanno la loro frase, «elenco fermato», perché la pagina non è mai arrivata.
 *   ⛔ AL CONTRARIO: un esito che PARLA di un rifiuto in mezzo al testo resta com'era; `REFUSED.` resta rosso; il no della persona
 *      resta `declined`; un testo qualunque resta verde; un `REFUSED: ` di un attrezzo che non pagina resta com'era.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as esito from '../../src/components/esito-comando.js';
import { esitoDaContenuto } from '../../src/components/conversazione-figlia.js';

const DELEGA_COL_CODICE = [
  'REFUSED [DELEGATION_SOLO_LIMIT]. You are working alone here: call again to ask the person. No child was started.',
  'REFUSED [DELEGATION_DEPTH]. Too deep. Retrying the same call will be refused again: change the request, or tell the person what blocks it. No child was started.',
  'REFUSED [X1]. the delegation was refused. No child was started.',
];
/* le quattro teste del kernel, copiate da talosHarness.mjs:5526-5559 (i nomi degli elenchi riempiti a mano) */
const GIA_RICEVUTO = [
  'REFUSED: this cursor was already served in this run, so you already have that page of the library listing.',
  'REFUSED: this listing is finished — you have already received all 216',
];
const TETTO = [
  'REFUSED: 11 pages of this same library listing have already been served in this run',
  'REFUSED: this would be page 3 of the same library listing',
];
const A_PAGINE = ['library_find', 'research_find', 'elenca', 'library_list', 'library_search'];

test('D99-01: la delega rifiutata col codice è rossa, in chat e nel pannello della figlia', () => {
  for (const t of DELEGA_COL_CODICE) {
    assert.equal(esito.esitoDichiaraFallimento('delega_sottotask', t), true, t);
    assert.equal(esitoDaContenuto('delega_sottotask', t), 'error', t);
  }
});

test('D99-02: l elenco a pagine rifiutato è neutro (copia saltata), mai verde né rosso, su ogni attrezzo a pagine', () => {
  assert.equal(typeof esito.rifiutoDiElenco, 'function', 'manca rifiutoDiElenco in esito-comando.js');
  for (const nome of A_PAGINE) {
    for (const t of [...GIA_RICEVUTO, ...TETTO]) {
      assert.equal(esito.esitoDichiaraFallimento(nome, t), false, `${nome}: ${t}`);
      assert.equal(esitoDaContenuto(nome, t), 'duplicate', `${nome}: ${t}`);
    }
  }
});

test('D99-05 (R2): già ricevuto e tetto sono due cose diverse', () => {
  for (const t of GIA_RICEVUTO) assert.equal(esito.rifiutoDiElenco('library_find', t), 'ricevuto', t);
  for (const t of TETTO) assert.equal(esito.rifiutoDiElenco('research_find', t), 'fermato', t);
  assert.equal(esito.rifiutoDiElenco('elenca', 'REFUSED: pages of this same listing'), 'ricevuto', 'senza il numero non è la testa del tetto');
  assert.equal(esito.rifiutoDiElenco('elenca', 'REFUSED: this would be page x'), 'ricevuto', 'senza il numero di pagina non è la testa del tetto');
  assert.equal(esito.rifiutoDiElenco('elenca', 'REFUSED: note 11 pages of this same listing'), 'ricevuto', 'il tetto sta subito dopo la testa');
  assert.equal(esito.rifiutoDiElenco('elenca', 'REFUSED: see the note. REFUSED: 11 pages of this same listing'), 'ricevuto', 'il tetto si legge solo in testa');
});

test('D99-06 (R1): un REFUSED: di un attrezzo che non pagina resta com era', () => {
  for (const nome of ['leggi', 'copia', 'shell', 'notes_list', 'mcp__server__tool', undefined, '']) {
    for (const t of [...GIA_RICEVUTO, ...TETTO]) {
      assert.equal(esito.rifiutoDiElenco(nome, t), null, `${nome}: ${t}`);
      assert.notEqual(esitoDaContenuto(nome, t), 'duplicate', `${nome}: ${t}`);
    }
  }
  assert.equal(esitoDaContenuto('leggi', GIA_RICEVUTO[0]), 'success', 'una lettura il cui testo inizia così resta com era');
});

test('D99-03: al contrario, niente altro cambia', () => {
  assert.equal(esito.esitoDichiaraFallimento('leggi', 'REFUSED. Outside the workspace.'), true);
  assert.equal(esito.esitoDichiaraFallimento('leggi', 'The file says REFUSED [X]. somewhere'), false);
  assert.equal(esito.esitoDichiaraFallimento('leggi', 'REFUSED [X] without the dot'), false, 'senza il punto non è la testa del kernel');
  assert.equal(esito.esitoDichiaraFallimento('leggi', 'REFUSED [A-B]. no'), false, 'il codice ha l insieme di conCodice del kernel');
  assert.equal(esito.esitoDichiaraFallimento('leggi', 'REFUSEDX'), false);
  assert.equal(esito.rifiutoDiElenco('library_find', 'Page 2 of 5: REFUSED: in a file name'), null);
  assert.equal(esito.rifiutoDiElenco('library_find', 'REFUSED. Outside the workspace.'), null);
  assert.equal(esito.esitoDichiaraFallimento('leggi', 'REFUSED to say more [ABC]. here'), false, 'le quadre vengono subito dopo REFUSED');
  assert.equal(esito.rifiutoDiElenco('library_find', undefined), null);
  assert.equal(esito.rifiutoDiElenco('library_find', { toString: () => 'REFUSED: x' }), null, 'solo un testo, mai un oggetto che si finge testo');
  assert.equal(esitoDaContenuto('leggi', 'contenuto qualunque'), 'success');
  assert.equal(esitoDaContenuto('leggi', 'DECLINED. The person said no.'), 'declined');
});

test('D99-04: la chat usa la stessa regola, con le sue due frasi, fuori dai contatori', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const attese = [
    [/const elencoGiaAvuto = evento\.duplicate !== true && info \? rifiutoDiElenco\(info\.nome, testoEsito\) : null;/, 'il nome dell attrezzo arriva alla regola'],
    [/const copiaSaltata = evento\.duplicate === true \|\| Boolean\(elencoGiaAvuto\);/, 'la riga neutra'],
    [/tr\(elencoGiaAvuto === 'fermato' \? 'app\.activity\.listingStopped' : elencoGiaAvuto \? 'app\.activity\.alreadyListed' : 'app\.activity\.duplicateSkipped'/, 'le due frasi'],
    [/if \(rifiuto\.rifiutato && !elencoGiaAvuto\) \{/, 'il dettaglio non dice «lo strumento ha rifiutato» sotto una riga neutra'],
  ];
  for (const [re, msg] of attese) assert.ok(re.test(app), msg);
  assert.ok(!/elencoGiaRicevuto/.test(app), 'la vecchia regola senza il nome non resta in chat');
  const testi = readFileSync(new URL('../../src/i18n/testi/app.js', import.meta.url), 'utf8');
  assert.equal(testi.split("'activity.alreadyListed':").length - 1, 2, 'la frase già ricevuto in italiano e in inglese');
  assert.equal(testi.split("'activity.listingStopped':").length - 1, 2, 'la frase del tetto in italiano e in inglese');
  assert.ok(testi.includes("'activity.listingStopped': '{nome}: listing stopped, skipped'"));
  assert.ok(testi.includes("'activity.listingStopped': '{nome}: elenco fermato, saltato'"));
});
