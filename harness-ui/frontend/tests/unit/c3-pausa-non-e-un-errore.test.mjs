import assert from 'node:assert/strict';
import test from 'node:test';

import { spiegaErrore, vestizioneErrore } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { statoSessione } from '../../src/components/session-item.js';

/*
 * C3 tappa 4 (09/10/2026), review del bugfixer Y-4B-1 e Y-4B-2 — una delega IN PAUSA chiude il giro con un RunError
 *   `code:'in-pausa'` e «⏸ paused on request: before round N.». Le misure del bugfixer su d7e7d0b35:
 *   `statoSessione({conclusa:true, ultimoEsito:'errore', motivoChiusura:'in-pausa'})` ⇒ `{classe:'errore', tono:'danger'}` (rossa
 *   nell'albero e nella Board) e `spiegaErrore('⏸ paused on request…', 'in-pausa')` ⇒ badge «Errore», danger (carta della chat).
 *   Dettaglio e diagramma dicevano già «In pausa». Al contrario: un errore vero resta rosso, una fermata resta «Fermato».
 */
test('C3-PAUSA-SESSIONE — a paused child is «in pausa», amber, in the session tree and the Board; a real error stays red', () => {
  impostaLingua('it');
  const pausa = statoSessione({ conclusa: true, interrotta: false, ultimoEsito: 'errore', motivoChiusura: 'in-pausa' });
  assert.deepEqual([pausa.classe, pausa.tono, pausa.testo], ['in-pausa', 'warning', 'in pausa']);
  assert.match(pausa.aiuto, /menu della delega/u);
  const errore = statoSessione({ conclusa: true, interrotta: false, ultimoEsito: 'errore', motivoChiusura: 'errore' });
  assert.deepEqual([errore.classe, errore.tono], ['errore', 'danger']);
  assert.equal(statoSessione({ conclusa: true, interrotta: false, ultimoEsito: 'errore', motivoChiusura: 'fermata' }).classe, 'fermata');
});

test('C3-PAUSA-CARTA — the chat card of a paused child says «In pausa» (amber, with how to resume), in both languages; a stop stays «Fermato»', () => {
  try {
    impostaLingua('it');
    const it = spiegaErrore('⏸ paused on request: before round 3.', 'in-pausa');
    const vestitaIt = vestizioneErrore(it);
    assert.deepEqual([vestitaIt.badge, vestitaIt.tono], ['In pausa', 'warning']);
    assert.equal(it.cosa, 'Questa delega è in pausa.');
    assert.doesNotMatch(it.perche, /round|paused/u, 'no English left on screen');
    assert.match(it.rimedi[0], /menu della delega/u);
    impostaLingua('en');
    const en = vestizioneErrore(spiegaErrore('⏸ paused on request: before round 3.', 'in-pausa'));
    assert.equal(en.badge, 'Paused');
    impostaLingua('it');
    const fermo = vestizioneErrore(spiegaErrore('⛔ stopped on request: before round 2.', 'fermato'));
    assert.deepEqual([fermo.badge, fermo.tono], ['Fermato', 'accent'], 'a stop is still a stop');
    const guasto = vestizioneErrore(spiegaErrore('The provider refused the request.', 'PROVIDER_REQUEST_ERROR'));
    assert.notEqual(guasto.badge, 'In pausa', 'a real error is not a pause');
  } finally { impostaLingua('it'); }
});
