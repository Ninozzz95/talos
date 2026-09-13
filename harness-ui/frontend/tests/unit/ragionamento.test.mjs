import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ETICHETTA_INTERRUTTORE_RAGIONAMENTO, argomentoDelRagionamento, etichettaRagionamento, formattaDurataRagionamento,
} from '../../src/components/ragionamento.js';

/* ───────────── L'argomento corrente (13/09 sera, «fare meglio di Hermes») ───────────── */

test('ARGOMENTO — un titolo in grassetto vince, e vale il PIÙ RECENTE', () => {
  const testo = '**Leggo la cartella**\nCi sono 40 file.\n\n**Scelgo i test della chat**\nComincio da';
  assert.equal(argomentoDelRagionamento(testo), 'Scelgo i test della chat');
});

test('ARGOMENTO — senza titoli: l’ultima frase COMPLETA, non il pezzo che sta arrivando', () => {
  /* ⭐ Un inizio vero preso dallo store (qwen3.8-flash), tagliato dove l'aveva tagliato il flusso. */
  const reale = 'Good results. Let me open the most promising pages for line 1 (facts and numbers):\n1. agentmarketcap.ai blog —';
  assert.equal(argomentoDelRagionamento(reale), 'Let me open the most promising pages for line 1 (facts and numbers):');
  assert.equal(argomentoDelRagionamento('Devo capire dove stanno i test. Poi apro il primo file e'), 'Devo capire dove stanno i test.');
});

test('ARGOMENTO — pulisce il markdown e sta su una riga', () => {
  assert.equal(argomentoDelRagionamento('- Apro `tests/chat.test.mjs` per primo.\n'), 'Apro tests/chat.test.mjs per primo.');
  const lunga = `${'Controllo ogni file della cartella dei test uno per uno '.repeat(3)}fino in fondo.\n`;
  const breve = argomentoDelRagionamento(lunga);
  assert.equal(breve.length, 90);
  assert.ok(breve.endsWith('…'));
});

test('ARGOMENTO AL CONTRARIO — niente frasi a metà, niente frammenti, niente punti che non chiudono', () => {
  assert.equal(argomentoDelRagionamento(''), null);
  assert.equal(argomentoDelRagionamento('   '), null);
  assert.equal(argomentoDelRagionamento('Sto leggendo la cartella dei'), null, 'una frase senza fine non si mostra');
  assert.equal(argomentoDelRagionamento('Ok.\nBene. '), null, 'meno di tre parole non è un argomento');
  assert.equal(argomentoDelRagionamento('Aggiorno alla v0.1.33 e poi'), null, 'il punto di un numero di versione non chiude una frase');
  assert.equal(argomentoDelRagionamento('**Plann'), null, 'un grassetto non chiuso non è un titolo');
});

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
