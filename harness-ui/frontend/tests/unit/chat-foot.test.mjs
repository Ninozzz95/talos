import test from 'node:test';
import assert from 'node:assert/strict';
import { statoGiri, etichettaPermesso, etichettaPermessoConEccezioni, tonoPermesso } from '../../src/components/chat-foot.js';

// 06/09 — B12 (il contatore dei giri) e B11 (la pillola del permesso dice il vero, eccezioni comprese).

test('PIEDE-GIRI: il contatore tace sotto metà del tetto, poi è quieto, poi si accende', () => {
  assert.equal(statoGiri(9, 24), null); // 37%: un numero che non chiede niente a nessuno
  assert.equal(statoGiri(12, 24), 'quieto'); // esattamente il 50%
  assert.equal(statoGiri(19, 24), 'quieto'); // 79%
  assert.equal(statoGiri(20, 24), 'vicino'); // 83%: il tetto è vicino
  assert.equal(statoGiri(24, 24), 'vicino');
  // AL CONTRARIO: senza numero non si mostra niente; senza tetto dichiarato non c'è percentuale
  assert.equal(statoGiri(null, 24), null);
  assert.equal(statoGiri('molti', 24), null);
  assert.equal(statoGiri(0, null), null);
  assert.equal(statoGiri(3, null), 'quieto');
  assert.equal(statoGiri(3, 0), 'quieto');
});

test('PIEDE-PERMESSO: nome umano, mai il nome tecnico (H22)', () => {
  assert.equal(etichettaPermesso('Full access'), 'Accesso completo');
  assert.equal(etichettaPermesso('On request'), 'Su richiesta');
  assert.equal(etichettaPermesso(''), 'Permesso non scelto');
  assert.equal(etichettaPermesso(undefined), 'Permesso non scelto');
  assert.equal(tonoPermesso('Full access'), 'danger');
  assert.equal(tonoPermesso('Workspace write'), 'warning');
  assert.equal(tonoPermesso('Read only'), null);
});

test('PIEDE-ECCEZIONI: la pillola dichiara i cancelli per attrezzo, che il permesso non promette', () => {
  // il caso misurato: «Accesso completo» scelto, e due attrezzi su «chiedi» ereditati dal server
  assert.equal(etichettaPermessoConEccezioni('Full access', { scrivi: 'chiedi', shell: 'chiedi' }), 'Accesso completo · 2 eccezioni');
  assert.equal(etichettaPermessoConEccezioni('Full access', { scrivi: 'nega' }), 'Accesso completo · 1 eccezione');
  // AL CONTRARIO: senza eccezioni la pillola resta quella di sempre, e un valore vuoto non conta
  assert.equal(etichettaPermessoConEccezioni('Full access', {}), 'Accesso completo');
  assert.equal(etichettaPermessoConEccezioni('Full access', null), 'Accesso completo');
  assert.equal(etichettaPermessoConEccezioni('Full access', { scrivi: '', shell: null }), 'Accesso completo');
});
