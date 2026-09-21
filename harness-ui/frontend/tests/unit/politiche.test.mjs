/*
 * Le quattro politiche: un posto solo, e il valore del kernel intatto.
 * ⛔ Provato anche AL VERSO CONTRARIO: un valore che non è dei nostri non deve produrre un nome
 * inventato, e nessuna etichetta italiana deve finire dove passa il contratto col kernel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POLITICHE, politica, nomeUmanoPolitica, descrizionePolitica, notaPolitica, valoriPolitiche, vuoleConferma } from '../../src/components/politiche.js';

test('i quattro valori sono quelli del kernel, nell ordine dal piu prudente al piu libero', () => {
  assert.deepEqual(valoriPolitiche(), ['Read only', 'Workspace write', 'On request', 'Full access']);
});

test('ogni politica ha nome umano, descrizione e nota, e nessuna e in inglese', () => {
  for (const p of POLITICHE) {
    assert.ok(p.nome.length > 3, p.valore);
    assert.ok(p.descrizione.length > 20, p.valore);
    assert.ok(p.nota.length > 3, p.valore);
    assert.notEqual(p.nome, p.valore, `${p.valore}: il nome a schermo non puo essere il valore tecnico`);
  }
});

test('il nome umano si legge dal valore', () => {
  assert.equal(nomeUmanoPolitica('Read only'), 'Solo lettura');
  assert.equal(nomeUmanoPolitica('Workspace write'), 'Scrive nel progetto');
  assert.equal(nomeUmanoPolitica('On request'), 'Chiede prima');
  assert.equal(nomeUmanoPolitica('Full access'), 'Accesso pieno');
});

test('un valore sconosciuto NON diventa un nome inventato', () => {
  assert.equal(nomeUmanoPolitica('Qualcosa altro'), 'Qualcosa altro');
  assert.equal(politica('Qualcosa altro'), null);
  assert.equal(descrizionePolitica('Qualcosa altro'), '');
  assert.equal(notaPolitica('Qualcosa altro'), '');
});

test('solo l accesso pieno vuole una conferma esplicita', () => {
  assert.equal(vuoleConferma('Full access'), true);
  for (const v of ['Read only', 'Workspace write', 'On request']) assert.equal(vuoleConferma(v), false, v);
});

test('le politiche sono congelate: nessuno le cambia sotto i piedi di un altro schermo', () => {
  assert.throws(() => { POLITICHE[0].nome = 'altro'; }, TypeError);
});
