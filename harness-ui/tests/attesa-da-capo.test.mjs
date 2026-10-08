/*
 * ATTESA-DA-CAPO (08/10/2026, bugfixer, riprodotto dal vivo sulla 4176) — riaperta una sessione mentre il modello tace, la bolla
 * d'attesa ripartiva da 0 (8 s contro i 33 s veri). `etaDellEvento` dà l'età di UNA `_sequenza`, dagli istanti in memoria: la
 * bolla rigiocata chiede quella dell'evento che l'ha aperta. ⛔ Senza finestra: la prima stesura teneva gli ultimi 64 eventi, e un
 * ragionamento in streaming spingeva fuori l'apertura (review di «talos desktop»: 93 sessioni su 109 del backup del 4174).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { etaDellEvento } from '../src/session-registry.mjs';

test('ATTESA-DA-CAPO-01 — l’età di quella sequenza, anche con decine di migliaia di eventi dopo', () => {
  const istanti = new Map([[1, 1_000]]);
  for (let s = 2; s <= 28_815; s += 1) istanti.set(s, 1_000 + s); // la sessione più lunga del backup: 28.814 pezzi dopo l'apertura
  assert.equal(etaDellEvento(1, { istanti, adesso: 34_000 }), 33_000);
  assert.equal(etaDellEvento(28_815, { istanti, adesso: 34_000 }), 34_000 - 1_000 - 28_815);
  assert.equal(etaDellEvento(1, { istanti: { 1: 1_000 }, adesso: 34_000 }), 33_000, 'anche da un oggetto semplice');
});

test('ATTESA-DA-CAPO-02 — al contrario: senza orologio, senza istanti, sequenza ignota o nel futuro, niente inventato', () => {
  const istanti = new Map([[1, 1_000], [2, 50_000]]);
  assert.equal(etaDellEvento(1, { istanti, adesso: null }), null, 'senza «adesso» niente');
  assert.equal(etaDellEvento(1, { istanti: null, adesso: 34_000 }), null, 'una sessione ripresa da disco non ha istanti: niente, mai uno zero');
  assert.equal(etaDellEvento(3, { istanti, adesso: 34_000 }), null, 'una sequenza che non c’è');
  assert.equal(etaDellEvento(2, { istanti, adesso: 34_000 }), null, 'un istante dopo «adesso»: nessuna età negativa');
  for (const storta of [null, '1', 1.5, -1, Number.NaN]) assert.equal(etaDellEvento(storta, { istanti, adesso: 34_000 }), null, `sequenza ${String(storta)}`);
});
