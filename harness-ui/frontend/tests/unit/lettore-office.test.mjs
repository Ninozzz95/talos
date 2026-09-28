/*
 * F5 File reader (26/09/2026) — le parti Office del lettore che girano senza browser: il modello di un foglio di calcolo
 * letto con SheetJS da un file VERO (scritto qui con la stessa libreria), e gli aiuti puri della resa PowerPoint. La resa
 * nel DOM, la ripulitura (DOMPurify) e la cornice ospite si provano nel browser vero.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { MASSIMO_COLONNE, MASSIMO_RIGHE, modelloCartella, nomeColonna, notaTaglio, numeroAllItaliana } from '../../src/components/lettore/office/foglio.js';
import { carattereValido, coloreValido, conOpacita, immagineDati, inCqw, paragrafi } from '../../src/components/lettore/office/presentazione.js';

function cartellaVera() {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Nome', 'Importo', 'Data'], ['Rossi, Mario', 1234.5, new Date(Date.UTC(2026, 8, 26))], ['Bianchi', 7, null]], { cellDates: true }), 'Conti');
  const nascosto = XLSX.utils.aoa_to_sheet([['segreto di lavoro']]);
  XLSX.utils.book_append_sheet(libro, nascosto, 'Appunti');
  libro.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
  const grande = [];
  for (let r = 0; r < MASSIMO_RIGHE + 50; r += 1) grande.push(Array.from({ length: MASSIMO_COLONNE + 5 }, (_, c) => (r === 0 ? `C${c}` : r * c)));
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(grande), 'Grande');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([]), 'Vuoto');
  return XLSX.write(libro, { type: 'array', bookType: 'xlsx' });
}

test('LETTORE-FOGLIO: i fogli di un file vero, coi testi come li mostra Excel e il foglio nascosto dichiarato', () => {
  const fogli = modelloCartella(cartellaVera());
  assert.deepEqual(fogli.map((f) => f.nome), ['Conti', 'Appunti', 'Grande', 'Vuoto']);
  const conti = fogli[0];
  assert.deepEqual(conti.righe[0], ['Nome', 'Importo', 'Data']);
  assert.equal(conti.righe[1][0], 'Rossi, Mario', 'la virgola dentro una cella resta nella cella');
  assert.equal(conti.righe[1][1], '1234,5', 'un numero col formato Generale si legge all’italiana, come in Excel italiano');
  assert.equal(conti.righe[1][2], '26/09/2026', 'la data breve (codice 14) è gg/mm/aaaa, non m/d/yy');
  assert.equal(conti.righe[2][2], '', 'una cella vuota è una stringa vuota, non «undefined»');
  assert.deepEqual([conti.righeTotali, conti.colonneTotali, conti.primaRiga, conti.primaColonna], [3, 3, 1, 0]);
  assert.equal(fogli[1].nascosto, true);
  assert.equal(fogli[0].nascosto, false);
  assert.deepEqual([fogli[3].righe, fogli[3].righeTotali], [[], 0], 'un foglio vuoto non è un errore');
});

test('LETTORE-FOGLIO: i tetti — 1.000 righe e 100 colonne lette, le misure vere dette sotto la tabella', () => {
  const grande = modelloCartella(cartellaVera())[2];
  assert.equal(grande.righe.length, MASSIMO_RIGHE, 'la lettura si ferma alle righe mostrate');
  assert.ok(grande.righe.every((r) => r.length <= MASSIMO_COLONNE));
  assert.deepEqual([grande.righeTotali, grande.colonneTotali], [MASSIMO_RIGHE + 50, MASSIMO_COLONNE + 5], 'le misure vere vengono da !fullref');
  // CLDR italiano: le quattro cifre non hanno il separatore delle migliaia (1000, ma 10.000), in Node come in Chromium
  assert.equal(notaTaglio(grande), 'Mostrate le prime 1000 righe di 1050 e le prime 100 colonne di 105. Il file intero si apre con l’app del sistema.');
  assert.match(notaTaglio({ ...grande, righeTotali: 25000 }), /di 25\.000/u);
  assert.equal(notaTaglio(modelloCartella(cartellaVera())[0]), '');
  assert.deepEqual([nomeColonna(0), nomeColonna(25), nomeColonna(26), nomeColonna(701)], ['A', 'Z', 'AA', 'ZZ']);
  assert.deepEqual(['1,234.50', '49.9', '12%', '-0.5', '1.23E+15'].map(numeroAllItaliana), ['1.234,50', '49,9', '12%', '-0,5', '1,23E+15']);
});

test('LETTORE-FOGLIO: un file che non è un foglio si rifiuta con un errore, non con una tabella inventata', () => {
  assert.throws(() => modelloCartella(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])));
});

test('LETTORE-PPTX: solo colori esadecimali e nomi di carattere semplici entrano negli stili', () => {
  assert.equal(coloreValido('#C00000'), '#C00000');
  assert.equal(coloreValido(' #fff '), '#fff');
  for (const cattivo of ['red', 'rgb(1,2,3)', '#12', 'url(x)', '#fff;background:url(x)', null, 7]) assert.equal(coloreValido(cattivo), null, String(cattivo));
  assert.equal(carattereValido('Calibri Light'), 'Calibri Light');
  assert.equal(carattereValido('Città Sans'), 'Città Sans');
  for (const cattivo of ['Arial";x', 'a}b', 'url(x)', '', 'x'.repeat(65)]) assert.equal(carattereValido(cattivo), null, cattivo);
  assert.equal(conOpacita('#2F6F7D', 0.5), '#2F6F7D80');
  assert.equal(conOpacita('#abc', 0), '#aabbcc00');
  assert.equal(conOpacita('#2F6F7D', undefined), '#2F6F7D');
  assert.equal(conOpacita('#2F6F7D', 1), '#2F6F7D');
  assert.equal(conOpacita('verde', 0.5), null);
  assert.equal(inCqw(48, 960), '5cqw', '48 px su una slide da 960 px');
  assert.equal(inCqw(2.6666666666666665, 960), '0.278cqw');
});

test('LETTORE-PPTX: i paragrafi si spezzano al segmento "\\n" (come li legge pptx-viewer-core) e a isParagraphBreak', () => {
  // la forma MISURATA su una presentazione vera (pptxgenjs 4.0.1): il ritorno a capo è un segmento "\n"
  const misurato = paragrafi({ textSegments: [{ text: 'Primo ', style: { bold: true } }, { text: 'in corsivo', style: { italic: true } }, { text: '\n', style: {} }, { text: 'Secondo', style: { color: '#C00000' } }] });
  assert.deepEqual(misurato.map((p) => p.map((s) => s.text)), [['Primo ', 'in corsivo'], ['Secondo']]);
  assert.equal(misurato[1][0].style.color, '#C00000');
  const conFlag = paragrafi({ textSegments: [{ text: 'a', style: {} }, { text: '', style: {}, isParagraphBreak: true }, { text: 'b', style: {} }] });
  assert.deepEqual(conFlag.map((p) => p.map((s) => s.text)), [['a'], ['b']]);
  const vuotoInMezzo = paragrafi({ text: 'uno\n\ntre' });
  assert.deepEqual(vuotoInMezzo.map((p) => p.map((s) => s.text)), [['uno'], [], ['tre']], 'un paragrafo vuoto in mezzo resta (è una riga vuota)');
  assert.deepEqual(paragrafi({}), []);
  assert.deepEqual(paragrafi({ text: 'finisce a capo\n' }).map((p) => p.map((s) => s.text)), [['finisce a capo']]);
});

test('LETTORE-PPTX-IMMAGINI: le immagini arrivano dai BYTE (data:), mai dal blob: che il gestore darebbe', async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const chiesti = [];
  const gestore = {
    getMediaArrayBuffer: async (p) => { chiesti.push(p); return p.endsWith('.png') ? png.buffer : undefined; },
    getImageData: async (p) => (p.endsWith('.emf') ? 'blob:http://x/1' : p.endsWith('.wmf') ? 'data:image/png;base64,AAAA' : 'blob:http://x/2'),
  };
  assert.equal(await immagineDati(gestore, 'ppt/media/image1.png'), `data:image/png;base64,${Buffer.from(png).toString('base64')}`);
  assert.equal(await immagineDati(gestore, 'ppt/media/manca.jpeg'), null, 'un file che non c’è non diventa un’immagine');
  assert.equal(await immagineDati(gestore, 'ppt/media/disegno.emf'), null, 'un blob: dal convertitore non passa');
  assert.equal(await immagineDati(gestore, 'ppt/media/disegno.wmf'), 'data:image/png;base64,AAAA', 'un EMF/WMF convertito in data: sì');
  assert.deepEqual(chiesti, ['ppt/media/image1.png', 'ppt/media/manca.jpeg']);
});
