import assert from 'node:assert/strict';
import test from 'node:test';

import { descriviCoda, normalizzaStatoCoda } from '../../src/components/coda-messaggi.js';

/* ───────────── ⭐⭐ 14/09 — le parole della coda (vedi le fonti nel modulo) ───────────── */

test('CODA — a giro vivo: quanti, cosa, quando parte, e l’azione è la stessa del bivio', () => {
  const d = descriviCoda({ voci: [{ id: 'a', testo: 'poi aggiorna il README', immagini: 0 }], inPausa: false }, { giroVivo: true });
  assert.equal(d.conteggio, '1 in coda');
  assert.equal(d.testo, '«poi aggiorna il README»', 'la riga mostra il messaggio: la spiegazione non ci stava mai');
  assert.equal(d.spiegazione, 'Parte quando TALOS finisce di rispondere');
  assert.equal(d.titoloTesto, '«poi aggiorna il README» — Parte quando TALOS finisce di rispondere');
  assert.equal(d.azione, 'Indirizza ora');
  assert.equal(d.tono, 'neutro');
});

test('CODA — dopo uno stop: in pausa, e non promette più una partenza che non avverrà', () => {
  const d = descriviCoda({ voci: [{ id: 'a', testo: 'poi aggiorna il README' }, { id: 'b', testo: 'e i test' }], inPausa: true });
  assert.equal(d.conteggio, '2 in pausa', 'quanti aspettano sta nel badge, che non si accorcia');
  assert.equal(d.tono, 'attenzione');
  assert.equal(d.testo, '«poi aggiorna il README»');
  assert.equal(d.spiegazione, 'In pausa dallo stop: parte solo se lo invii tu');
  assert.equal(d.azione, 'Invia ora');
  assert.doesNotMatch(`${d.testo} ${d.spiegazione}`, /fine di questo giro|finisce di rispondere/, '⛔ la frase del giro vivo non sopravvive a uno stop');
});

test('CODA — la pausa la decide lo stop, l’azione la decide il giro (14/09, giro vero)', () => {
  const inPausaAGiroVivo = descriviCoda({ voci: [{ id: 'b', testo: 'e i test' }], inPausa: true }, { giroVivo: true });
  assert.equal(inPausaAGiroVivo.conteggio, '1 in pausa', 'un giro ripreso non toglie la pausa alle voci rimaste');
  assert.equal(inPausaAGiroVivo.azione, 'Indirizza ora', 'a giro vivo la stessa rotta indirizza: il pulsante lo dice');
  assert.doesNotMatch(`${inPausaAGiroVivo.spiegazione} ${inPausaAGiroVivo.titoloTesto}`, /giro è fermo/, '⛔ la parola che mentiva nella foto 06');
  const ferma = descriviCoda({ voci: [{ id: 'b', testo: 'e i test' }], inPausa: true }, { giroVivo: false });
  assert.equal(ferma.azione, 'Invia ora', 'AL CONTRARIO: stesso stato della coda, giro fermo, azione diversa');
  assert.equal(ferma.conteggio, inPausaAGiroVivo.conteggio);
});

test('CODA AL CONTRARIO — niente in coda, niente banner; una pausa senza voci non è una pausa', () => {
  assert.equal(descriviCoda({ voci: [], inPausa: false }), null);
  assert.equal(descriviCoda({ voci: [], inPausa: true }), null);
  assert.equal(descriviCoda(undefined), null);
  assert.deepEqual(normalizzaStatoCoda({ voci: [], inPausa: true }), { voci: [], inPausa: false });
  assert.deepEqual(normalizzaStatoCoda({ voci: [{ id: 'x', testo: '   ' }, 7, null], inPausa: true }), { voci: [], inPausa: false }, 'voci senza testo non contano');
});

test('CODA — un testo lunghissimo ha un tetto nella riga, il titolo lo porta INTERO, e più voci si contano', () => {
  const lungo = 'Controlla ogni file della cartella dei test uno per uno fino in fondo e poi scrivi il resoconto '.repeat(3).trim();
  const d = descriviCoda({ voci: [{ id: 'a', testo: lungo }, { id: 'b', testo: 'x' }, { id: 'c', testo: 'y' }] });
  assert.equal(d.conteggio, '3 in coda');
  assert.ok(d.testo.length <= 202 && d.testo.endsWith('…»'), `tetto della riga: ${d.testo.length} caratteri`);
  assert.doesNotMatch(d.testo, /altr/, '⛔ niente conteggio in coda al testo: è la parte che i puntini tagliavano');
  assert.ok(d.titoloTesto.startsWith(`«${lungo}»`), '⛔ il titolo porta il messaggio intero, non quello tagliato della riga');
});

test('CODA — un messaggio di 90 caratteri NON si taglia a mano: decide la larghezza della riga', () => {
  const medio = 'Quando hai finito, aggiungi in fondo una riga che dica quanti numeri hai trovato davvero.';
  assert.equal(descriviCoda({ voci: [{ id: 'a', testo: medio }] }).testo, `«${medio}»`, '14/09, giro vero: a 1440 px si fermava a «quan…» con spazio libero');
});
