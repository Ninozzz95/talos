/*
 * Owner 10/10/2026 («Parole del chip in IT/EN»), trovato rigiocando la bolla in C09: il genere del chip («pagina aperta»,
 *   «immagine», «schermata», «allegato») e la virgola del costo («~1,3k token») erano scritti in italiano dentro allegati.js e
 *   restavano italiani con l'interfaccia in inglese. Regola owner 03/10: ogni parola in inglese e italiano, dal dizionario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { chipAllegato, etichettaCosto, generePerLoSchermo } from '../../src/components/allegati.js';

const CASI = [[{ daBrowser: true, tipo: 'immagine' }, 'open page', 'pagina aperta'], [{ tipo: 'immagine' }, 'image', 'immagine'],
  [{ tipo: 'schermata' }, 'screenshot', 'schermata'], [{ tipo: 'testo' }, 'file', 'file'], [null, 'attachment', 'allegato']];

test('CHIP-LINGUA-01 in English the chip genre and the cost are English (open page, image… · ~1.3k token)', (t) => {
  t.after(() => impostaLingua('it'));
  impostaLingua('en');
  for (const [allegato, en] of CASI) assert.equal(generePerLoSchermo(allegato), en, JSON.stringify(allegato));
  assert.equal(etichettaCosto(1334), '~1.3k token');
  assert.equal(etichettaCosto(23_456), '~23k token');
  assert.equal(chipAllegato({ daBrowser: true, percorso: 'https://example.com/a/b', caratteri: 5000 }).genere, 'open page');
});

test('CHIP-LINGUA-02 AL CONTRARIO: in Italian the words of before, unchanged (pagina aperta… · ~1,3k token)', (t) => {
  t.after(() => impostaLingua('it'));
  impostaLingua('it');
  for (const [allegato, , it] of CASI) assert.equal(generePerLoSchermo(allegato), it, JSON.stringify(allegato));
  assert.equal(etichettaCosto(1334), '~1,3k token');
  assert.equal(etichettaCosto(340), '~340 token');
});
