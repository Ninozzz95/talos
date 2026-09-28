/*
 * ATLAS F3 (27/09/2026) — la card della Libreria è quella del mobile, e queste prove sono i casi dei test del MOBILE
 * (`mobile/tests/unit/lib/libraryFilePresentation.test.ts`, `mobile/tests/unit/library/libraryThumbnails.test.ts`,
 * ramo `lane/talos-mobile-allineamento`) con gli stessi ingressi e gli stessi risultati attesi: la copia si misura contro
 * la stessa verità dell'originale.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  anteprimaTipografica,
  decodificaInizioDelTesto,
  genereAnteprimaLibreria,
  presentazioneFileLibreria,
  titoloAnteprima,
  TITOLO_ANTEPRIMA_MAX,
} from '../../src/components/libreria-scheda.js';

const voce = (nome, mediaType) => ({ id: 'v1', nome, mediaType });

test('LIB-SCHEDA-01: le estensioni finiscono nelle stesse famiglie del mobile', () => {
  const casi = [
    ['photo.jpeg', 'image/jpeg', 'image'],
    ['contract.pdf', 'application/pdf', 'pdf'],
    ['brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'word'],
    ['budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'spreadsheet'],
    ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'presentation'],
    ['worker.ts', 'text/plain', 'code'],
    ['payload.json', 'application/json', 'data'],
    ['notes.md', 'text/markdown', 'text'],
    ['backup.zip', 'application/zip', 'archive'],
    ['opaque.bin', 'application/octet-stream', 'file'],
  ];
  for (const [nome, tipo, famiglia] of casi) assert.equal(presentazioneFileLibreria(nome, tipo).famiglia, famiglia, nome);
});

test('LIB-SCHEDA-02: l\'etichetta è l\'estensione vera, in maiuscolo; senza suffisso decide il tipo', () => {
  assert.equal(presentazioneFileLibreria('CAMERA.JPEG', 'image/jpeg').estensione, 'JPEG');
  assert.equal(presentazioneFileLibreria('README.markdown', 'text/markdown').estensione, 'MARKDOWN');
  assert.deepEqual(presentazioneFileLibreria('extensionless', 'application/pdf'), { estensione: 'PDF', famiglia: 'pdf' });
  assert.deepEqual(presentazioneFileLibreria('extensionless', 'application/octet-stream'), { estensione: 'FILE', famiglia: 'file' });
});

test('LIB-SCHEDA-03: immagini apribili e PDF hanno un\'anteprima vera', () => {
  assert.equal(genereAnteprimaLibreria(voce('foto.png', 'image/png')), 'image');
  assert.equal(genereAnteprimaLibreria(voce('foto.jpg', 'image/jpeg')), 'image');
  assert.equal(genereAnteprimaLibreria(voce('piano.pdf', 'application/pdf')), 'pdf');
});

test('LIB-SCHEDA-04: testo, Markdown, CSV, HTML e JSON si disegnano come mini-documento', () => {
  for (const [nome, tipo] of [['appunti.md', 'text/markdown'], ['note.txt', 'text/plain'], ['costi.csv', 'text/csv'], ['pagina.html', 'text/html'], ['dati.json', 'application/json']]) {
    assert.equal(genereAnteprimaLibreria(voce(nome, tipo)), 'typographic', nome);
  }
});

test('AL CONTRARIO — LIB-SCHEDA-05: niente anteprima per ciò di cui non si legge una pagina, né per SVG e HEIC', () => {
  assert.equal(genereAnteprimaLibreria(voce('backup.zip', 'application/zip')), 'none');
  assert.equal(genereAnteprimaLibreria(voce('lettera.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')), 'none');
  assert.equal(genereAnteprimaLibreria(voce('foto.heic', 'image/heic')), 'none');
  assert.equal(genereAnteprimaLibreria(voce('logo.svg', 'image/svg+xml')), 'none');
  assert.equal(genereAnteprimaLibreria({ nome: 'senza-id.png', mediaType: 'image/png' }), 'none');
});

/* ⛔ Il desktop, a differenza del mobile, riceve l'elenco SENZA `mediaType` (`session-registry.mjs`, `elencaLibreria`):
   il tipo si ricava dall'estensione, e per le immagini solo se il server dice anche `fileType: 'image'`. Trovato dalla
   prova ATLAS-F3-02 sul server vero, dopo foto fatte con dati finti più ricchi del server. */
test('LIB-SCHEDA-10: senza mediaType (come arriva dal server) PDF e immagini si riconoscono lo stesso', () => {
  assert.equal(genereAnteprimaLibreria({ id: 'v1', nome: 'Report.pdf', fileType: 'document' }), 'pdf');
  assert.equal(genereAnteprimaLibreria({ id: 'v1', nome: 'foto.png', fileType: 'image' }), 'image');
  assert.equal(genereAnteprimaLibreria({ id: 'v1', nome: 'appunti.md', fileType: 'document' }), 'typographic');
});

test('AL CONTRARIO — LIB-SCHEDA-11: un «.png» che il server non chiama immagine, o un SVG, non diventano immagini', () => {
  assert.equal(genereAnteprimaLibreria({ id: 'v1', nome: 'finto.png', fileType: 'document' }), 'none');
  assert.equal(genereAnteprimaLibreria({ id: 'v1', nome: 'logo.svg', fileType: 'image' }), 'none');
  assert.equal(genereAnteprimaLibreria({ id: 'v1', nome: 'archivio.zip', fileType: 'document' }), 'none');
});

test('LIB-SCHEDA-06: il titolo del mini-documento è la prima riga vera, ripulita dal Markdown', () => {
  assert.equal(anteprimaTipografica('\n\n#  Prospetto dei costi\n\nUna riga di corpo\nUn\'altra\n')?.titolo, 'Prospetto dei costi');
});

test('LIB-SCHEDA-07: quattro barre proporzionate, mai sotto un terzo', () => {
  const anteprima = anteprimaTipografica(['Titolo', 'x'.repeat(60), 'x'.repeat(30), 'x'].join('\n'));
  assert.equal(anteprima.righe.length, 4);
  assert.ok(Math.abs(anteprima.righe[0] - 1) < 1e-5);
  assert.ok(Math.abs(anteprima.righe[1] - 0.5) < 1e-5);
  assert.ok(anteprima.righe[2] >= 0.34);
  assert.ok(anteprima.righe[3] >= 0.34);
});

test('AL CONTRARIO — LIB-SCHEDA-08: senza testo non c\'è mini-documento (la card cade sul glifo)', () => {
  for (const vuoto of [null, undefined, '', '   \n\n \n', '###\n---\n']) assert.equal(anteprimaTipografica(vuoto), null);
});

test('LIB-SCHEDA-09: il titolo si accorcia a parola entro 35 caratteri', () => {
  assert.equal(TITOLO_ANTEPRIMA_MAX, 35);
  assert.equal(titoloAnteprima('Prospetto dei costi'), 'Prospetto dei costi');
  const lungo = titoloAnteprima('Il prezzo del gas sale ancora a settembre, dice il ministero');
  assert.equal(lungo, 'Il prezzo del gas sale ancora a…');
  assert.ok(lungo.length <= 35);
  assert.equal(titoloAnteprima('x'.repeat(80)), `${'x'.repeat(34)}…`);
});

/* Revisione Codex 27/09, rilievo 11 — DIFFERENZA DAL MOBILE, dichiarata: sul mobile un XLSX mostra il testo che il vault ne
   ha estratto; qui un'estrazione non c'è, e leggerne i byte disegnava «PK…��…». Glifo del formato; CSV e TSV restano testo. */
test('LIB-SCHEDA-12: i fogli di calcolo BINARI prendono il glifo, i fogli di testo il mini-documento', () => {
  for (const nome of ['budget.xlsx', 'vecchio.xls', 'conti.ods']) assert.equal(genereAnteprimaLibreria({ id: 'v1', nome, fileType: 'document' }), 'none', nome);
  assert.equal(genereAnteprimaLibreria(voce('senza-estensione', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')), 'none');
  for (const nome of ['costi.csv', 'righe.tsv']) assert.equal(genereAnteprimaLibreria({ id: 'v1', nome, fileType: 'document' }), 'typographic', nome);
});

test('LIB-SCHEDA-13: l’inizio di un file si decodifica onesto — UTF-8, UTF-16 col BOM, e niente spazzatura binaria', () => {
  const utf8 = new TextEncoder().encode('Prospetto dei costi\nè così');
  assert.equal(decodificaInizioDelTesto(utf8), 'Prospetto dei costi\nè così');
  const le = new Uint8Array([0xFF, 0xFE, ...[...'Ciao'].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodificaInizioDelTesto(le), 'Ciao');
  const be = new Uint8Array([0xFE, 0xFF, ...[...'Ciao'].flatMap((c) => [0, c.charCodeAt(0)])]);
  assert.equal(decodificaInizioDelTesto(be), 'Ciao');
  /* il taglio a 16 KB in mezzo a un carattere lascia UN sostitutivo in coda: non è binario */
  const tagliato = new Uint8Array([...new TextEncoder().encode('testo lungo '.repeat(20)), 0xC3]);
  assert.match(decodificaInizioDelTesto(tagliato), /^testo lungo/);
});

test('AL CONTRARIO — LIB-SCHEDA-14: un contenuto binario non diventa un mini-documento', () => {
  const zip = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x21, 0x00]);
  assert.equal(decodificaInizioDelTesto(zip), null, 'un NUL dice binario');
  const sporco = new Uint8Array(Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? 0xFF : 0x61)));
  assert.equal(decodificaInizioDelTesto(sporco), null, 'troppi caratteri sostitutivi dicono binario');
  assert.equal(anteprimaTipografica(decodificaInizioDelTesto(zip)), null, 'e la card cade sul glifo');
});
