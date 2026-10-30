import test from 'node:test';
import assert from 'node:assert/strict';

import { paroleCheInizianoNelTratto } from '../../src/components/ritmo-streaming.js';

/*
 * 28/10/2026 — LE PAROLE GIÀ VISIBILI NON SI RICOLORANO. Misurato con la sonda del browser (chiesta dal Mobile per la regola delle tre
 * app): dopo una pausa, al pezzo nuovo le ultime parole già a schermo tornavano a salire dal trasparente — «scorre.» al 42%, «che» al
 * 69%, «risposta» all'84%. Causa: il ritmo rivela pochi caratteri a fotogramma, e `contaParole(tratto)` contava come parola NUOVA
 * anche la continuazione di una parola già cominciata («Sec» poi «onda» = due parole). I tempi in più, assegnati camminando
 * all'indietro dalla coda, cadevano sulle parole precedenti.
 * Cura come Streamdown (`packages/streamdown/lib/animate.ts:571`, clone del 23/10: `skipAnimation = prevLen > 0 && partStart <
 * prevLen`): una parola si conta dove COMINCIA. Nel tratto [da, a) contano solo i caratteri non bianchi preceduti da un bianco (o
 * dall'inizio del testo), guardando anche il carattere PRIMA del tratto.
 */
test('PAROLE-VISIBILI-01 — una parola rivelata a pezzi conta una volta sola, dove comincia', () => {
  const testo = 'Prima parte. Seconda';
  const da = 'Prima parte. '.length;
  assert.equal(paroleCheInizianoNelTratto(testo, da, da + 3), 1, '«Sec»: comincia qui');
  assert.equal(paroleCheInizianoNelTratto(testo, da + 3, testo.length), 0, '«onda»: continua, non comincia');
  assert.equal(paroleCheInizianoNelTratto(testo, 0, testo.length), 3);
});

test('PAROLE-VISIBILI-02 — bianchi, inizio del testo, tratti vuoti o rovesciati', () => {
  assert.equal(paroleCheInizianoNelTratto('ciao', 0, 2), 1, 'all\'inizio del testo una parola comincia');
  assert.equal(paroleCheInizianoNelTratto('a b', 1, 2), 0, 'solo uno spazio');
  assert.equal(paroleCheInizianoNelTratto('a\n\tb', 1, 4), 1, 'a capo e tabulazione sono bianchi');
  assert.equal(paroleCheInizianoNelTratto('abc', 2, 2), 0);
  assert.equal(paroleCheInizianoNelTratto('abc', 3, 1), 0);
  assert.equal(paroleCheInizianoNelTratto('', 0, 5), 0);
});

test('PAROLE-VISIBILI-03 — rivelare un testo carattere per carattere dà lo stesso numero di parole che rivelarlo in un colpo', () => {
  const testo = 'Il modello ci sta ancora lavorando, poi\nscrive **grassetto** e `codice` finale.';
  let somma = 0;
  for (let i = 0; i < testo.length; i += 1) somma += paroleCheInizianoNelTratto(testo, i, i + 1);
  assert.equal(somma, (testo.match(/\S+/g) ?? []).length);
  /* al contrario: il conteggio di prima (le parole DENTRO ogni tratto) dà di più, ed è il difetto */
  let vecchio = 0;
  for (let i = 0; i < testo.length; i += 3) vecchio += (testo.slice(i, i + 3).match(/\S+/g) ?? []).length;
  assert.ok(vecchio > somma, `il vecchio conteggio a pezzi da 3 contava ${vecchio} parole su ${somma}`);
});
