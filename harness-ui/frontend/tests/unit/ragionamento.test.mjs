import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ETICHETTA_INTERRUTTORE_RAGIONAMENTO, etichettaRagionamento, formattaDurataRagionamento,
} from '../../src/components/ragionamento.js';

/*
 * ⛔ Le parole della riga del ragionamento compresso (decisione owner 13/09/2026, vedi il modulo).
 * Quante cose guarda: 4 etichette per stato, 6 durate, 5 ingressi senza durata, e il verso contrario
 * che conta di più — una rigiocata non deve mai dire «poco».
 */

test('RAGIONAMENTO-ETICHETTA — mentre scrive, finito con una durata, finito in fretta, finito senza durata', () => {
  assert.equal(etichettaRagionamento({ inCorso: true }), 'Sta ragionando…');
  assert.equal(etichettaRagionamento({ inCorso: false, secondi: 12.2 }), 'Ha ragionato per 12 s');
  assert.equal(etichettaRagionamento({ inCorso: false, secondi: 0.4 }), 'Ha ragionato poco', 'sotto il secondo non si scrive «0 s»');
  assert.equal(etichettaRagionamento({ inCorso: false }), 'Ha ragionato');
});

test('RAGIONAMENTO-DURATA — secondi, minuti, e il bordo dei 60', () => {
  assert.equal(formattaDurataRagionamento(1), '1 s');
  assert.equal(formattaDurataRagionamento(12.4), '12 s');
  assert.equal(formattaDurataRagionamento(59.4), '59 s');
  assert.equal(formattaDurataRagionamento(59.6), '1 min', 'l’arrotondamento non scrive «60 s»');
  assert.equal(formattaDurataRagionamento(65), '1 min 5 s');
  assert.equal(formattaDurataRagionamento(120), '2 min');
});

test('RAGIONAMENTO-ETICHETTA AL CONTRARIO — senza una durata vera non si inventa «poco»', () => {
  /*
   * ⛔ Il trabocchetto misurato: gli eventi non portano un orario, e in una rigiocata inizio e fine
   *   distano pochi millisecondi. Chi chiama passa `null`; qui si prova che nessuna forma di «non so»
   *   diventi una durata.
   */
  for (const secondi of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 'non-un-numero']) {
    assert.equal(etichettaRagionamento({ inCorso: false, secondi }), 'Ha ragionato', `${String(secondi)} è diventato una durata`);
  }
  assert.equal(etichettaRagionamento({ inCorso: true, secondi: 30 }), 'Sta ragionando…', 'mentre scrive la durata non conta');
  assert.doesNotMatch(etichettaRagionamento({ inCorso: false, secondi: 3 }), /Sta ragionando/, 'un ragionamento finito non dice mai che sta ragionando');
});

test('RAGIONAMENTO-INTERRUTTORE — il nome dice cosa fa, non «mostra/nascondi»', () => {
  assert.equal(ETICHETTA_INTERRUTTORE_RAGIONAMENTO, 'Apri il ragionamento mentre scrive');
  assert.doesNotMatch(ETICHETTA_INTERRUTTORE_RAGIONAMENTO, /mostra|nascond/i);
});
