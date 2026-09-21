import test from 'node:test';
import assert from 'node:assert/strict';
import { titoloNota, quandoNota, filtraNote, sommarioNote } from '../../src/components/note.js';

// 06/09 — C24 e la prova T14: «Note» era una voce di menu con un contatore vivo e nessuna pagina.

test('NOTE-TITOLO: senza titolo si usa la prima riga, mai «(senza titolo)»', () => {
  assert.equal(titoloNota({ titolo: 'Problema percorsi WSL' }), 'Problema percorsi WSL');
  assert.equal(titoloNota({ titolo: '   ', contenuto: 'Il comando cd converte /mnt/c\naltro' }), 'Il comando cd converte /mnt/c');
  assert.equal(titoloNota({ contenuto: '\n\n  prima riga vera  \n' }), 'prima riga vera');
  // AL CONTRARIO: senza niente si dice che non c'è, non si finge
  assert.equal(titoloNota({}), 'Nota senza titolo');
  assert.equal(titoloNota(null), 'Nota senza titolo');
});

test('NOTE-QUANDO: relativo fino a 24 ore, poi la data (H26)', () => {
  const adesso = new Date('2026-09-06T18:00:00');
  assert.equal(quandoNota(new Date('2026-09-06T14:32:00'), adesso), 'oggi 14:32');
  assert.equal(quandoNota(new Date('2026-09-05T09:10:00'), adesso), 'ieri 09:10');
  assert.equal(quandoNota(new Date('2026-09-01T09:10:00'), adesso), '01/09 09:10');
  // AL CONTRARIO: una data illeggibile non produce «Invalid Date» a schermo
  assert.equal(quandoNota('non una data', adesso), '');
  assert.equal(quandoNota(null, adesso), '');
});

test('NOTE-RICERCA: cerca nel titolo e nel testo, e senza query non filtra niente', () => {
  const note = [
    { titolo: 'Percorsi WSL', contenuto: 'il comando cd sbaglia' },
    { titolo: 'Test verdi', contenuto: 'la suite passa' },
  ];
  assert.equal(filtraNote(note, 'wsl').length, 1);
  assert.equal(filtraNote(note, 'SUITE').length, 1, 'la ricerca non distingue maiuscole');
  assert.equal(filtraNote(note, '').length, 2);
  assert.equal(filtraNote(note, '   ').length, 2);
  assert.equal(filtraNote(note, 'zzz').length, 0);
  assert.deepEqual(filtraNote(null, 'x'), []);
});

test('NOTE-PLURALE: il plurale italiano non si fa con una «s»', () => {
  assert.equal(sommarioNote(0), 'nessuna nota');
  assert.equal(sommarioNote(1), '1 nota');
  assert.equal(sommarioNote(2), '2 note');
  assert.equal(sommarioNote(undefined), 'nessuna nota');
});
