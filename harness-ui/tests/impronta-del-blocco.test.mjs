/*
 * FE-003, condizione 2 del Mobile (03/11/2026): `impronta` entra nella `chiave` di `talos.blocco.azione.v1`, quindi PC e telefono devono
 * calcolarla uguale, o un blocco usato sul telefono non si spegne sul PC. Vive accanto al lettore e viaggia col pin; questi valori sono
 * fissi: se cambiano, i blocchi già usati tornano premibili.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { impronta } from '../src/blocchi/impronta.mjs';
import { impronta as delPc } from '../frontend/src/components/blocchi/aggancio.js';

const FISSI = [
  ['', '45h'],
  ['root = Scelte("a", null, "Ok?", [{testo: "Sì"}])', '1peymrq'],
  ['perché', 'vbhqgw'],
  ['🙂 ciao', '1qazj37'],
  ['riga uno\nriga due', '9afldb'],
  ['riga uno\r\nriga due', '10uk2de'],
];

test('IMPRONTA-01 valori fissi, anche con accenti, emoji e a capo', () => {
  for (const [testo, atteso] of FISSI) assert.equal(impronta(testo), atteso, JSON.stringify(testo));
});

test('IMPRONTA-02 il testo si prende così com\'è: nessun ritocco agli spazi o agli a capo', () => {
  assert.notEqual(impronta('a'), impronta('a\n'));
  assert.notEqual(impronta('a\nb'), impronta('a\r\nb'));
  assert.notEqual(impronta(' a'), impronta('a'));
});

test('IMPRONTA-03 il PC usa la stessa funzione del modulo condiviso', () => {
  assert.equal(delPc, impronta);
});
