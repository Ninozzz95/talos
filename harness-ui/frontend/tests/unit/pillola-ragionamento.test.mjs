import test from 'node:test';
import assert from 'node:assert/strict';

import { livelliDaMostrare, statoDelLivello, SCALA_RAGIONAMENTO } from '../../src/components/pillola-ragionamento.js';

/*
 * 24/10/2026 — la regola di quale livello di ragionamento si mostra, spostata da `creaEffortPicker` a `pillola-ragionamento.js`
 * perché la usano il cursore di «Nuova sessione» e la pillola del compositore. Qui i casi che il cursore copriva solo nel browser.
 */
const TUTTI = SCALA_RAGIONAMENTO.map((valore) => ({ valore }));
const valori = (l) => l.map((x) => x.valore);

test('PILLOLA-RAG-01 livelli: quelli dichiarati dal modello, «none» resta; senza catalogo la lista intera', () => {
  assert.deepEqual(valori(livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['high', 'low'] })), ['none', 'low', 'high']);
  assert.deepEqual(valori(livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: null })), SCALA_RAGIONAMENTO);
  assert.deepEqual(valori(livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: [] })), SCALA_RAGIONAMENTO);
});

test('PILLOLA-RAG-02 A9: con la mappa del filo restano solo i livelli che partono così come sono («none» se il modello si spegne)', () => {
  const filo = { none: 'low', low: 'low', high: 'high', xhigh: 'max', max: 'max' };
  assert.deepEqual(valori(livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['low', 'high', 'max'], filo })), ['low', 'high', 'max']);
});

test('PILLOLA-RAG-03 una scelta della lista è mostrata e «toccata»; senza scelta e senza filo: «Automatico», niente nota', () => {
  const livelli = livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['low', 'medium', 'high'] });
  const s = statoDelLivello({ livelli, valoreIniziale: 'medium' });
  assert.equal(livelli[s.indice].valore, 'medium');
  assert.equal(s.toccato, true);
  assert.equal(s.nota, null);
  const auto = statoDelLivello({ livelli, valoreIniziale: null });
  assert.equal(auto.toccato, false);
  assert.equal(auto.nota, null);
});

test('PILLOLA-RAG-04 BUG-18: una scelta fuori lista scende al più vicino PIÙ DEBOLE, mai a «none», mai più su', () => {
  const livelli = livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['low', 'medium', 'high'] }); // none, low, medium, high
  assert.equal(livelli[statoDelLivello({ livelli, valoreIniziale: 'max' }).indice].valore, 'high');
  assert.equal(livelli[statoDelLivello({ livelli, valoreIniziale: 'xhigh' }).indice].valore, 'high');
  const senzaNone = [{ valore: 'low' }, { valore: 'high' }];
  assert.equal(senzaNone[statoDelLivello({ livelli: senzaNone, valoreIniziale: 'minimal' }).indice].valore, 'low', 'minimal non diventa mai none');
  assert.equal(senzaNone[statoDelLivello({ livelli: senzaNone, valoreIniziale: 'medium' }).indice].valore, 'low', 'prima il più debole');
});

test('PILLOLA-RAG-05 A9: si mostra il livello che PARTE, e la nota dice la scelta e ciò che parte; null ⇒ «non lo riceve»', () => {
  const filo = { none: 'low', low: 'low', high: 'high', xhigh: 'max', max: 'max' };
  const livelli = livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['low', 'high', 'max'], filo });
  const s = statoDelLivello({ livelli, valoreIniziale: 'xhigh', filo });
  assert.equal(livelli[s.indice].valore, 'max');
  assert.deepEqual(s.nota, { chiave: 'effortSentAs', scelto: 'xhigh', inviato: 'max' });
  const uguale = statoDelLivello({ livelli, valoreIniziale: 'high', filo });
  assert.equal(uguale.nota, null, 'AL CONTRARIO: un livello che parte com\'è non porta la riga');
  const nonParte = statoDelLivello({ livelli: [{ valore: 'low' }, { valore: 'medium' }], valoreIniziale: 'none', filo: { none: null, low: 'low', medium: 'medium' } });
  assert.equal(nonParte.toccato, false);
  assert.equal(nonParte.senzaTacca, true);
  assert.deepEqual(nonParte.nota, { chiave: 'effortNotTaken', scelto: 'none' });
});

test('PILLOLA-RAG-06 «Automatico + riga» (owner 09/10): senza scelta, nessuna tacca, e la nota dice che cosa parte', () => {
  const filo = { low: 'low', high: 'high', max: 'max', auto: 'max' };
  const livelli = livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['low', 'high', 'max'], filo });
  const s = statoDelLivello({ livelli, valoreIniziale: null, filo });
  assert.equal(s.toccato, false);
  assert.equal(s.senzaTacca, true);
  assert.equal(livelli[s.indice].valore, 'max');
  assert.deepEqual(s.nota, { chiave: 'effortAutoSent', inviato: 'max' });
});

test('PILLOLA-RAG-07 nessun livello (owner 24/10): `nessuno`, la pillola non si mostra', () => {
  const s = statoDelLivello({ livelli: [], valoreIniziale: 'high', filo: {} });
  assert.equal(s.nessuno, true);
  assert.deepEqual(s.nota, { chiave: 'effortNotSent' });
  assert.equal(statoDelLivello({ livelli: [{ valore: 'low' }] }).nessuno, false);
});
