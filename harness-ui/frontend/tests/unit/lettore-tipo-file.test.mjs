/*
 * F5 File reader (26/09/2026) — il tipo di un file dal nome E dai byte (`src/components/lettore/tipo-file.js`).
 * Le firme sono quelle dello standard WHATWG MIME Sniffing (§6.1, §6.4, §7.1) e di [MS-CFB] per i vecchi Office: qui
 * si provano coi loro byte veri, e soprattutto nei versi in cui nome e contenuto si contraddicono.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estensioneDi, firmaDeiByte, sembraTesto, tipoDaNome, tipoDelFile } from '../../src/components/lettore/tipo-file.js';

const b = (...x) => new Uint8Array(x.flat());
const s = (testo) => [...new TextEncoder().encode(testo)];
const PNG = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = b(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const GIF = b(s('GIF89a'), 1, 0);
const WEBP = b(s('RIFF'), 0x24, 0x10, 0, 0, s('WEBPVP8 '));
const AVIF = b(0, 0, 0, 0x1c, s('ftypavif'), 0, 0, 0, 0);
const ICO = b(0, 0, 1, 0, 1, 0);
const BMP = b(s('BM'), 0x36, 0, 0, 0);
const PDF = b(s('%PDF-1.7\n%âã'));
const ZIP = b(0x50, 0x4b, 0x03, 0x04, 0x14, 0, 6, 0);
const OLE = b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0);
const TESTO = b(s('# Titolo\n\nCittà, perché, 東京 — ok.\n'));

test('estensioneDi e tipoDaNome: il nome vero, minuscolo, anche dentro un percorso e per i file «punto»', () => {
  assert.equal(estensioneDi('cartella/Sotto\\Relazione.DOCX'), 'docx');
  assert.equal(estensioneDi('.gitignore'), 'gitignore');
  assert.equal(estensioneDi('LEGGIMI'), '');
  assert.equal(tipoDaNome('a.md').tipo, 'markdown');
  assert.equal(tipoDaNome('a.tsv').tipo, 'tabella');
  assert.equal(tipoDaNome('index.HTM').tipo, 'html');
  assert.equal(tipoDaNome('logo.svg').tipo, 'immagine');
  assert.equal(tipoDaNome('a.xls').tipo, 'foglio');
  assert.equal(tipoDaNome('a.ods').tipo, 'foglio');
  assert.equal(tipoDaNome('a.pptm').macro, true);
  assert.equal(tipoDaNome('a.pptx').macro, false);
  assert.equal(tipoDaNome('.env').tipo, 'testo');
  assert.equal(tipoDaNome('LEGGIMI').tipo, 'binario');
  assert.equal(tipoDaNome('archivio.zip').tipo, 'binario');
});

test('firmaDeiByte: ogni firma coi suoi byte, e niente firma su pochi byte o su un testo', () => {
  assert.equal(firmaDeiByte(PNG), 'png');
  assert.equal(firmaDeiByte(JPEG), 'jpeg');
  assert.equal(firmaDeiByte(GIF), 'gif');
  assert.equal(firmaDeiByte(b(s('GIF87a'))), 'gif');
  assert.equal(firmaDeiByte(WEBP), 'webp');
  assert.equal(firmaDeiByte(AVIF), 'avif');
  assert.equal(firmaDeiByte(ICO), 'ico');
  assert.equal(firmaDeiByte(BMP), 'bmp');
  assert.equal(firmaDeiByte(PDF), 'pdf');
  assert.equal(firmaDeiByte(ZIP), 'zip');
  assert.equal(firmaDeiByte(OLE), 'ole');
  assert.equal(firmaDeiByte(b(0x89, 0x50, 0x4e)), null, 'un PNG troncato non è un PNG');
  assert.equal(firmaDeiByte(b(s('RIFF'), 0, 0, 0, 0, s('WAVEfmt '))), null, 'un RIFF che non è WEBP (un WAV)');
  assert.equal(firmaDeiByte(TESTO), null);
  assert.equal(firmaDeiByte(new ArrayBuffer(0)), null);
});

test('sembraTesto: UTF-8 valido e niente controlli; un carattere tagliato al limite degli 8 KiB non lo rende binario', () => {
  assert.equal(sembraTesto(TESTO), true);
  assert.equal(sembraTesto(b(s('tab\tfine\r\n'), 0x0c, 0x1b)), true);
  assert.equal(sembraTesto(b(s('a'), 0, s('b'))), false, 'un NUL');
  assert.equal(sembraTesto(b(s('a'), 0x07)), false, 'un BEL');
  assert.equal(sembraTesto(b(0xc3, 0x28)), false, 'UTF-8 non valido');
  const lungo = new Uint8Array(8193);
  lungo.fill(0x61);
  lungo.set([0xe2, 0x82, 0xac], 8190); // «€» a cavallo del limite: 8190, 8191 dentro, 8192 fuori
  assert.equal(sembraTesto(lungo), true);
});

test('tipoDelFile: nome e contenuto d\'accordo, nessun avviso', () => {
  for (const [nome, byte, tipo] of [['foto.png', PNG, 'immagine'], ['foto.JPG', JPEG, 'immagine'], ['a.gif', GIF, 'immagine'], ['a.webp', WEBP, 'immagine'],
    ['a.avif', AVIF, 'immagine'], ['a.ico', ICO, 'immagine'], ['a.bmp', BMP, 'immagine'], ['a.pdf', PDF, 'pdf'], ['a.docx', ZIP, 'documento'],
    ['a.xlsx', ZIP, 'foglio'], ['a.ods', ZIP, 'foglio'], ['a.pptx', ZIP, 'presentazione'], ['a.xls', OLE, 'foglio'], ['note.md', TESTO, 'markdown'],
    ['dati.csv', b(s('a,b\n1,2\n')), 'tabella'], ['index.html', b(s('<!doctype html><p>ciao')), 'html'], ['logo.svg', b(s('<svg xmlns="http://www.w3.org/2000/svg"/>')), 'immagine'],
    ['main.py', b(s('print(1)\n')), 'testo'], ['vuoto.md', b(), 'markdown']]) {
    const esito = tipoDelFile({ nome, byte });
    assert.equal(esito.tipo, tipo, nome);
    assert.equal(esito.avviso, null, nome);
  }
  assert.equal(tipoDelFile({ nome: 'macro.docm', byte: ZIP }).macro, true);
  assert.equal(tipoDelFile({ nome: 'macro.xlsm', byte: ZIP }).macro, true);
});

test('tipoDelFile: quando nome e byte si contraddicono vince la firma, e lo si DICE', () => {
  const pngComePdf = tipoDelFile({ nome: 'scansione.pdf', byte: PNG });
  assert.equal(pngComePdf.tipo, 'immagine');
  assert.equal(pngComePdf.avviso, 'Il nome indica un PDF, ma il contenuto è un\'immagine PNG.');
  const pdfComeTesto = tipoDelFile({ nome: 'appunti.txt', byte: PDF });
  assert.equal(pdfComeTesto.tipo, 'pdf');
  assert.equal(pdfComeTesto.avviso, 'Il nome indica un file di testo, ma il contenuto è un PDF.');
  const xlsxComeXls = tipoDelFile({ nome: 'vecchio-nome.xls', byte: ZIP });
  assert.equal(xlsxComeXls.tipo, 'foglio', 'SheetJS legge un xlsx anche se si chiama .xls');
  // un file senza estensione non aveva promesso niente: nessuna contraddizione da dire
  const senzaNome = tipoDelFile({ nome: 'SCANSIONE', byte: PNG });
  assert.deepEqual([senzaNome.tipo, senzaNome.avviso], ['immagine', null]);
});

test('tipoDelFile: un formato binario SENZA la sua firma è rotto, non testo; i vecchi Office si dicono per nome', () => {
  const rotto = tipoDelFile({ nome: 'relazione.docx', byte: TESTO });
  assert.equal(rotto.tipo, 'binario');
  assert.equal(rotto.avviso, 'Il nome indica un documento Word, ma il contenuto non lo è: il file è rotto o ha il nome sbagliato.');
  assert.equal(tipoDelFile({ nome: 'foto.png', byte: TESTO }).avviso, 'Il nome indica un\'immagine, ma il contenuto non lo è: il file è rotto o ha il nome sbagliato.');
  assert.equal(tipoDelFile({ nome: 'a.pdf', byte: b() }).tipo, 'binario', 'un PDF vuoto');
  const doc = tipoDelFile({ nome: 'lettera.doc', byte: OLE });
  assert.deepEqual([doc.tipo, doc.avviso], ['binario', 'I file Word precedente al 2007 non si mostrano qui: si aprono con l\'app del sistema.']);
  assert.equal(tipoDelFile({ nome: 'slide.ppt', byte: OLE }).tipo, 'binario');
  assert.equal(tipoDelFile({ nome: 'testo.odt', byte: ZIP }).tipo, 'binario');
  assert.match(tipoDelFile({ nome: 'strano.docx', byte: OLE }).avviso, /precedente al 2007/u, 'un .docx che è in realtà un .doc');
  assert.deepEqual([tipoDelFile({ nome: 'dati.zip', byte: ZIP }).tipo, tipoDelFile({ nome: 'dati.zip', byte: ZIP }).avviso], ['binario', null]);
});

test('tipoDelFile: un testo col nome giusto ma byte non testuali è binario; senza estensione decide il contenuto', () => {
  const md = tipoDelFile({ nome: 'note.md', byte: b(s('# a'), 0, 1, 2) });
  assert.deepEqual([md.tipo, md.avviso], ['binario', 'Il nome indica un file Markdown, ma il contenuto non è testo.']);
  assert.equal(tipoDelFile({ nome: 'logo.svg', byte: b(s('<svg>'), 0) }).tipo, 'binario');
  assert.equal(tipoDelFile({ nome: 'LEGGIMI', byte: TESTO }).tipo, 'testo');
  assert.equal(tipoDelFile({ nome: 'LEGGIMI', byte: b(1, 2, 3) }).tipo, 'binario');
  assert.equal(tipoDelFile({ nome: 'LEGGIMI', byte: b() }).tipo, 'binario', 'vuoto e senza estensione: niente da mostrare come testo');
  assert.equal(tipoDelFile({ nome: 'LEGGIMI', byte: TESTO.buffer }).tipo, 'testo', 'accetta anche un ArrayBuffer');
});
