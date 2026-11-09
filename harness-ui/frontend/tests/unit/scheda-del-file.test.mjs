/*
 * FE-065 (owner 02/11/2026: «il file deve essere stilizzato bene con icona e nome estensione»; scelta B): ogni file del messaggio
 *   è una scheda col glifo della Libreria (icona della famiglia ed estensione), il nome e «tipo · peso · token».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { schedaDelFile } from '../../src/components/allegati.js';
import { dimensioneLeggibile } from '../../src/components/conversazione.js';

test('FE-065 la scheda dice estensione, famiglia e tipo in parole', () => {
  assert.deepEqual(schedaDelFile({ tipo: 'file', nome: 'relazione-trimestre.pdf', byte: 1_258_291 }), { estensione: 'PDF', famiglia: 'pdf', tipo: 'PDF', peso: dimensioneLeggibile(1_258_291) });
  assert.match(dimensioneLeggibile(1_258_291), /^1[.,]2 MB$/u);
  assert.equal(schedaDelFile({ nome: 'ordini.csv' }).famiglia, 'spreadsheet');
  assert.equal(schedaDelFile({ nome: 'pulizia.py' }).tipo, 'Codice');
  assert.equal(schedaDelFile({ nome: 'foto.zip' }).tipo, 'Archivio');
  assert.equal(schedaDelFile({ nome: 'nota-di-prova.txt' }).tipo, 'Testo');
  assert.equal(schedaDelFile({ percorso: 'C:\\p\\allegati\\dati.json' }).estensione, 'JSON', 'senza nome vale il percorso');
  assert.equal(schedaDelFile({ percorso: 'C:\\cartella.v2\\LEGGIMI' }).estensione, 'FILE', 'Windows: il punto di una cartella non è l’estensione');
  assert.equal(schedaDelFile({ percorso: '/home/a.b/LEGGIMI' }).estensione, 'FILE', 'lo stesso con la barra');
});

test('FE-065 il peso c’è solo se si conosce; senza estensione resta «FILE»', () => {
  assert.equal(schedaDelFile({ nome: 'nota.txt' }).peso, '');
  assert.equal(schedaDelFile({ nome: 'nota.txt', byte: -1 }).peso, '');
  assert.equal(schedaDelFile({ nome: 'nota.txt', byte: null }).peso, '', 'un peso assente non diventa «0 byte»');
  assert.equal(schedaDelFile({ nome: 'nota.txt', byte: 0 }).peso, dimensioneLeggibile(0), 'un file vuoto misurato sì');
  assert.deepEqual(schedaDelFile({ nome: 'LEGGIMI' }), { estensione: 'FILE', famiglia: 'file', tipo: 'File', peso: '' });
  assert.equal(schedaDelFile(null), null);
});
