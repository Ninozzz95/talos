/*
 * ricerca-per-parole.test.mjs — decisione owner 27/09 (memoria `decisioni-owner-capacita-sezioni-27-09`): la ricerca che
 *   Memoria, Note, Attività e Ricerca approfondita usano per il modello. Il caso vero è la sessione 56066b64: «memorie
 *   salvate dall'utente» e «*» non trovavano niente con 5 memorie nel negozio.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { chiedeTutto, cercaPerParole, paroleDellaRicerca, piega, punteggioPerParole } from '../src/ricerca-per-parole.mjs';

const MEMORIE = [
  { titolo: 'Preferenze risposta', corpo: 'Risposte brevi, in italiano' },
  { titolo: 'Progetto attuale', corpo: 'Lavoro sulla scheda GitHub di TALOS' },
  { titolo: 'Attività della settimana', corpo: 'Rilascio desktop venerdì' },
];
const testi = (m) => ({ titolo: m.titolo, corpo: m.corpo });

test('RICERCA-PAROLE — vuota, spazi o «*» chiedono TUTTO, nell’ordine ricevuto', () => {
  for (const q of ['', '   ', '*', ' * ', '**', undefined, null]) {
    assert.equal(chiedeTutto(q), true, String(q));
    const r = cercaPerParole(MEMORIE, q, testi);
    assert.equal(r.tutte, true);
    assert.deepEqual(r.trovate, MEMORIE);
  }
  assert.equal(chiedeTutto('a*'), false);
});

test('RICERCA-PAROLE — ogni parola conta da sola; il titolo pesa più del corpo', () => {
  const r = cercaPerParole(MEMORIE, 'risposte github', testi);
  assert.equal(r.tutte, false);
  assert.deepEqual(r.trovate.map((m) => m.titolo), ['Preferenze risposta', 'Progetto attuale']);
  // «risposta» nel titolo (3) batte «github» nel solo corpo (1); il corpo dice «risposte», che non contiene «risposta»
  assert.equal(punteggioPerParole(testi(MEMORIE[0]), ['risposta']), 3);
  assert.equal(punteggioPerParole(testi(MEMORIE[0]), ['rispost']), 4, 'nel titolo e nel corpo');
  assert.equal(punteggioPerParole(testi(MEMORIE[1]), ['github']), 1);
});

test('RICERCA-PAROLE — senza accenti e senza punteggiatura; le parole corte escono se ne restano altre', () => {
  assert.equal(piega('Attività VENERDÌ'), 'attivita venerdi');
  assert.deepEqual(paroleDellaRicerca("memorie salvate dall'utente"), ['memorie', 'salvate', 'dall', 'utente']);
  assert.deepEqual(paroleDellaRicerca('la nota di ieri'), ['nota', 'ieri']);
  assert.deepEqual(paroleDellaRicerca('IA'), ['ia'], 'se restano solo parole corte si tengono');
  assert.deepEqual(cercaPerParole(MEMORIE, 'attivita venerdi', testi).trovate.map((m) => m.titolo), ['Attività della settimana']);
});

test('RICERCA-PAROLE — AL CONTRARIO: una parola che non c’è non trova niente, e non è «tutto»', () => {
  const r = cercaPerParole(MEMORIE, 'zanzibar', testi);
  assert.deepEqual(r.trovate, []);
  assert.equal(r.tutte, false);
  assert.deepEqual(r.parole, ['zanzibar']);
  assert.equal(punteggioPerParole(testi(MEMORIE[0]), []), 0, 'senza parole il punteggio è zero');
});

test('RICERCA-PAROLE — un NUMERO conta sempre: «Nota di prova 3» mette la nota 3 in cima (collaudo vero del 27/09)', () => {
  const note = [5, 4, 3, 2, 1].map((n) => ({ titolo: `Nota di prova ${n}`, corpo: 'contenuto fittizio per il test' }));
  assert.deepEqual(paroleDellaRicerca('Nota di prova 3'), ['nota', 'prova', '3']);
  assert.equal(cercaPerParole(note, 'Nota di prova 3', (n) => n).trovate[0].titolo, 'Nota di prova 3');
  assert.deepEqual(paroleDellaRicerca('la 0.1.16'), ['0', '1', '16'], 'i pezzi di una versione restano, «la» no');
});
