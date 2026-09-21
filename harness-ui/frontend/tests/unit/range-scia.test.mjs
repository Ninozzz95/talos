/*
 * La scia del cursore: la parte percorsa a sinistra del pallino.
 * ⛔ Provata anche AL VERSO CONTRARIO: una scala senza escursione non deve dividere per zero, e un
 * valore fuori scala non deve produrre una scia più lunga della pista.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentualeRange, aggiornaScia, VARIABILE_SCIA } from '../../src/components/range-scia.js';

test('la scia copre quanto il valore percorso', () => {
  assert.equal(percentualeRange(0, 0, 5), 0);
  assert.equal(percentualeRange(5, 0, 5), 100);
  assert.equal(percentualeRange(4, 0, 5), 80);   // «Alto» su sei tacche: copre Off, Minimo, Basso, Medio
  assert.equal(percentualeRange(50, 0, 200), 25);
});

test('una scala senza escursione non divide per zero, e fuori scala si ferma ai bordi', () => {
  assert.equal(percentualeRange(3, 3, 3), 0);
  assert.equal(percentualeRange(-10, 0, 5), 0);
  assert.equal(percentualeRange(99, 0, 5), 100);
});

test('valori non numerici non producono una scia inventata', () => {
  assert.equal(percentualeRange('', 0, 5), 0);
  assert.equal(percentualeRange('alto', 0, 5), 0);
  assert.equal(percentualeRange(undefined, 0, 5), 0);
});

test('aggiornaScia scrive la variabile che il CSS legge — e ignora ciò che non è un cursore', () => {
  const finto = { type: 'range', value: '4', min: '0', max: '5', style: { valori: {}, setProperty(k, v) { this.valori[k] = v; } } };
  assert.equal(aggiornaScia(finto), 80);
  assert.equal(finto.style.valori[VARIABILE_SCIA], '80%');
  assert.equal(aggiornaScia({ type: 'text', style: { setProperty() { throw new Error('non deve toccarlo'); } } }), 0);
  assert.equal(aggiornaScia(null), 0);
});
