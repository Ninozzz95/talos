/*
 * F5 File reader (26/09/2026) — i FILE DI PROVA del lettore, generati da capo con le librerie vere (niente binari nel repo):
 *   un file per ogni formato che il lettore mostra, più i casi limite (nome che mente, file grande, formato che non si mostra,
 *   macro, file vuoto). Li usano la prova browser (`lettore-file.spec.mjs`) e lo script che prepara la sessione per l'owner
 *   sul 4174, con la stessa Libreria seminata: una voce della Libreria nasce dalla cartella `.harness-ui-library/` che il
 *   server, la prima volta che tocca un progetto, sposta nella cartella dati dell'app (PO-26, `cartella-dati-progetto.mjs`).
 *
 * ⛔ JPEG e WebP non hanno un codificatore in Node senza dipendenze nuove: li disegna il browser (`immaginiDalBrowser`, una
 *   tela e `toDataURL`). PNG, GIF e BMP si scrivono qui a mano, byte per byte, secondo le loro specifiche.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

import * as docx from 'docx';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import PptxGenJS from 'pptxgenjs';
import * as XLSX from 'xlsx';

/* ------------------------------------------------------------------ immagini scritte a mano */

const BARRE = [[0x2f, 0x6f, 0x7d], [0xc0, 0x7a, 0x2b], [0x5b, 0x8c, 0x3a], [0x8a, 0x4f, 0x9e]];

/** Un piccolo istogramma: sfondo chiaro, quattro barre, una linea di base. */
function pixelIstogramma(larghezza, altezza) {
  const px = Buffer.alloc(larghezza * altezza * 3, 0xf6);
  const metti = (x, y, [r, g, b]) => { const i = (y * larghezza + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
  const altezze = [0.45, 0.8, 0.6, 0.95];
  const passo = Math.floor(larghezza / (BARRE.length + 1));
  for (let k = 0; k < BARRE.length; k += 1) {
    const x0 = passo * (k + 0.5) | 0; const x1 = x0 + (passo * 0.7 | 0);
    const top = Math.round(altezza - 12 - altezze[k] * (altezza - 30));
    for (let y = top; y < altezza - 12; y += 1) for (let x = x0; x < x1; x += 1) metti(x, y, BARRE[k]);
  }
  for (let x = 6; x < larghezza - 6; x += 1) metti(x, altezza - 12, [0x33, 0x33, 0x33]);
  return px;
}

export function png(larghezza = 480, altezza = 300) {
  const rgbPx = pixelIstogramma(larghezza, altezza);
  const righe = Buffer.alloc((larghezza * 3 + 1) * altezza);
  for (let y = 0; y < altezza; y += 1) {
    righe[y * (larghezza * 3 + 1)] = 0; // filtro None
    rgbPx.copy(righe, y * (larghezza * 3 + 1) + 1, y * larghezza * 3, (y + 1) * larghezza * 3);
  }
  const blocco = (tipo, dati) => {
    const lunghezza = Buffer.alloc(4); lunghezza.writeUInt32BE(dati.length);
    const tipoDati = Buffer.concat([Buffer.from(tipo, 'ascii'), dati]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tipoDati) >>> 0);
    return Buffer.concat([lunghezza, tipoDati, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(larghezza, 0); ihdr.writeUInt32BE(altezza, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8 bit, RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), blocco('IHDR', ihdr), blocco('IDAT', deflateSync(righe)), blocco('IEND', Buffer.alloc(0))]);
}

export function bmp(larghezza = 240, altezza = 150) {
  const rgbPx = pixelIstogramma(larghezza, altezza);
  const riga = Math.ceil((larghezza * 3) / 4) * 4;
  const dati = Buffer.alloc(riga * altezza);
  for (let y = 0; y < altezza; y += 1) {
    for (let x = 0; x < larghezza; x += 1) {
      const s = (y * larghezza + x) * 3; const d = (altezza - 1 - y) * riga + x * 3; // dal basso, BGR
      dati[d] = rgbPx[s + 2]; dati[d + 1] = rgbPx[s + 1]; dati[d + 2] = rgbPx[s];
    }
  }
  const testa = Buffer.alloc(54);
  testa.write('BM', 0, 'ascii'); testa.writeUInt32LE(54 + dati.length, 2); testa.writeUInt32LE(54, 10);
  testa.writeUInt32LE(40, 14); testa.writeInt32LE(larghezza, 18); testa.writeInt32LE(altezza, 22);
  testa.writeUInt16LE(1, 26); testa.writeUInt16LE(24, 28); testa.writeUInt32LE(dati.length, 34);
  return Buffer.concat([testa, dati]);
}

/** GIF «senza compressione»: codici LZW letterali a 8 bit, con un CLEAR prima che il dizionario faccia crescere il codice. */
export function gif(larghezza = 160, altezza = 100) {
  const tavolozza = [[0xf6, 0xf6, 0xf6], ...BARRE, [0x33, 0x33, 0x33]];
  const indici = new Uint8Array(larghezza * altezza);
  const rgbPx = pixelIstogramma(larghezza, altezza);
  for (let i = 0; i < indici.length; i += 1) {
    const c = [rgbPx[i * 3], rgbPx[i * 3 + 1], rgbPx[i * 3 + 2]];
    const k = tavolozza.findIndex((t) => t[0] === c[0] && t[1] === c[1] && t[2] === c[2]);
    indici[i] = k < 0 ? 0 : k;
  }
  const minimo = 7; const clear = 1 << minimo; const fine = clear + 1; // 128 colori ⇒ codici da 8 bit
  const codici = [];
  for (let i = 0; i < indici.length; i += 1) { if (i % 120 === 0) codici.push(clear); codici.push(indici[i]); }
  codici.push(fine);
  const byte = []; let acc = 0; let bit = 0;
  for (const c of codici) { acc |= c << bit; bit += 8; while (bit >= 8) { byte.push(acc & 0xff); acc >>>= 8; bit -= 8; } }
  if (bit > 0) byte.push(acc & 0xff);
  const sottoBlocchi = [];
  for (let i = 0; i < byte.length; i += 255) { const pezzo = byte.slice(i, i + 255); sottoBlocchi.push(pezzo.length, ...pezzo); }
  const gct = Buffer.alloc(128 * 3);
  tavolozza.forEach(([r, g, b], i) => { gct[i * 3] = r; gct[i * 3 + 1] = g; gct[i * 3 + 2] = b; });
  const lsd = Buffer.alloc(7); lsd.writeUInt16LE(larghezza, 0); lsd.writeUInt16LE(altezza, 2); lsd[4] = 0x80 | (6 << 4) | 6;
  const descrittore = Buffer.alloc(10); descrittore[0] = 0x2c; descrittore.writeUInt16LE(larghezza, 5); descrittore.writeUInt16LE(altezza, 7);
  return Buffer.concat([Buffer.from('GIF89a', 'ascii'), lsd, gct, descrittore, Buffer.from([minimo, ...sottoBlocchi, 0, 0x3b])]);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
  <rect width="320" height="180" rx="14" fill="#f4f7f8"/>
  <g font-family="Segoe UI, sans-serif" font-size="13" fill="#23313a">
    <rect x="20" y="30" width="80" height="44" rx="8" fill="#2f6f7d"/><text x="60" y="57" text-anchor="middle" fill="#fff">Richiesta</text>
    <rect x="120" y="30" width="80" height="44" rx="8" fill="#c07a2b"/><text x="160" y="57" text-anchor="middle" fill="#fff">Piano</text>
    <rect x="220" y="30" width="80" height="44" rx="8" fill="#5b8c3a"/><text x="260" y="57" text-anchor="middle" fill="#fff">Risposta</text>
    <path d="M100 52h20M200 52h20" stroke="#23313a" stroke-width="2"/>
    <text x="160" y="130" text-anchor="middle">Schema del flusso (SVG)</text>
  </g>
</svg>
`;

/** JPEG e WebP disegnati dal browser: una tela, un gradiente, del testo. */
export async function immaginiDalBrowser(page) {
  const dati = await page.evaluate(() => {
    const tela = document.createElement('canvas');
    tela.width = 640; tela.height = 400;
    const c = tela.getContext('2d');
    const g = c.createLinearGradient(0, 0, 640, 400);
    g.addColorStop(0, '#1d4e5a'); g.addColorStop(1, '#d99a4e');
    c.fillStyle = g; c.fillRect(0, 0, 640, 400);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 18; i += 1) { c.beginPath(); c.arc(40 + i * 34, 300 - Math.sin(i / 2) * 90, 10, 0, Math.PI * 2); c.fill(); }
    c.font = '600 34px Segoe UI, sans-serif'; c.fillText('Foto di prova — TALOS', 40, 80);
    return { jpg: tela.toDataURL('image/jpeg', 0.86), webp: tela.toDataURL('image/webp', 0.86) };
  });
  const decodifica = (url, atteso) => {
    if (!url.startsWith(`data:${atteso};base64,`)) throw new Error(`il browser non ha codificato ${atteso}`);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  };
  return { jpg: decodifica(dati.jpg, 'image/jpeg'), webp: decodifica(dati.webp, 'image/webp') };
}

/* ------------------------------------------------------------------ testi */

const MARKDOWN = `# Relazione del progetto

Questo file prova la **resa Markdown** del lettore: titoli, _corsivo_, \`codice in linea\`, elenchi, tabelle e blocchi.

## Cosa è stato fatto

- Lettore dei file nel rail e a schermo intero
- Le quattro famiglie di formati
  - testo e codice
  - PDF, immagini, documenti Office
- HTML reso **senza rete**

> Una citazione: il file resta nella cartella del progetto.

| Formato | Dove si apre | Stato |
|---|---|---|
| PDF | Lettore di Chromium | ✓ |
| DOCX | docx-preview | ✓ |
| XLSX | SheetJS | ✓ |

\`\`\`js
export function saluta(nome) {
  return \`Ciao, \${nome}!\`;
}
\`\`\`

Un collegamento: [documentazione](https://example.com/docs).
`;

const CODICE = `/**
 * Registro delle sessioni — file di prova del lettore (evidenziazione del codice).
 */
import { readFile } from 'node:fs/promises';

const TETTO = 256;

export class Registro {
  #voci = new Map();

  aggiungi(id, dati) {
    if (this.#voci.size >= TETTO) throw new Error('registro pieno');
    this.#voci.set(id, { ...dati, creatoIl: new Date().toISOString() });
    return this;
  }

  async caricaDa(percorso) {
    const testo = await readFile(percorso, 'utf8');
    for (const riga of testo.split('\\n').filter(Boolean)) {
      const { id, ...resto } = JSON.parse(riga);
      this.aggiungi(id, resto);
    }
    return this.#voci.size;
  }
}
`;

function csv(righe = 250) {
  const intestazione = 'data,cliente,prodotto,quantita,importo';
  const clienti = ['Rossi, Mario', 'Bianchi Srl', 'Verdi & Figli', '"Il Negozio"', 'Neri'];
  const prodotti = ['Licenza', 'Supporto', 'Formazione', 'Hardware'];
  const corpo = [];
  for (let i = 0; i < righe; i += 1) {
    const giorno = String((i % 28) + 1).padStart(2, '0');
    const mese = String((i % 12) + 1).padStart(2, '0');
    const cliente = clienti[i % clienti.length];
    const campo = /[",]/.test(cliente) ? `"${cliente.replaceAll('"', '""')}"` : cliente;
    corpo.push(`2026-${mese}-${giorno},${campo},${prodotti[i % prodotti.length]},${(i % 7) + 1},${((i * 37) % 900 + 49.9).toFixed(2)}`);
  }
  return `${intestazione}\n${corpo.join('\n')}\n`;
}

const PAGINA_HTML = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Pagina di prova</title>
<link rel="stylesheet" href="stile.css">
</head>
<body>
  <header><img src="logo.svg" alt="Logo" width="48" height="48"><h1>Pagina di prova del lettore</h1></header>
  <main>
    <p id="script">Lo script della pagina <strong>non</strong> è partito.</p>
    <p id="rete">La prova di rete non è ancora partita.</p>
    <p>Un'immagine esterna (deve restare vuota, niente rete): <img id="esterna" src="https://example.com/immagine.png" alt="immagine esterna" width="40" height="40"></p>
    <p><a href="https://example.com/">Un collegamento esterno</a></p>
    <button id="contatore" type="button">Cliccato 0 volte</button>
  </main>
  <script>
    document.getElementById('script').textContent = 'Lo script della pagina è partito.';
    let n = 0;
    document.getElementById('contatore').addEventListener('click', (e) => { n += 1; e.target.textContent = 'Cliccato ' + n + ' volte'; });
    fetch('https://example.com/').then(
      () => { document.getElementById('rete').textContent = 'ATTENZIONE: la rete ha risposto.'; },
      () => { document.getElementById('rete').textContent = 'La rete è bloccata, come deve.'; },
    );
  </script>
</body>
</html>
`;

const STILE_CSS = `body { font-family: Georgia, serif; margin: 0; background: #fbf8f1; color: #2b2622; }
header { display: flex; align-items: center; gap: 12px; padding: 16px 24px; background: #2f6f7d; color: #fff; }
header h1 { margin: 0; font-size: 22px; }
main { padding: 16px 24px; line-height: 1.6; }
#script { font-weight: bold; color: #2f6f7d; }
button { font: inherit; padding: 6px 12px; }
`;

/* La Libreria tiene UN file per voce: la sua pagina HTML porta con sé stile e immagine. */
const PAGINA_HTML_SOLA = PAGINA_HTML
  .replace('<link rel="stylesheet" href="stile.css">', `<style>\n${STILE_CSS}</style>`)
  .replace('<img src="logo.svg" alt="Logo" width="48" height="48">', `<img src="data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}" alt="Logo" width="48" height="48">`);

/* ------------------------------------------------------------------ documenti */

async function pdf() {
  const doc = await PDFDocument.create();
  doc.setTitle('Relazione trimestrale');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let p = 1; p <= 3; p += 1) {
    const pagina = doc.addPage([595, 842]);
    pagina.drawText(`Relazione trimestrale - pagina ${p} di 3`, { x: 56, y: 770, size: 20, font: grassetto, color: rgb(0.18, 0.43, 0.49) });
    const righe = [
      'Questo PDF e stato generato per provare il lettore di Chromium dentro TALOS.',
      'Si scorre, si ingrandisce e si cerca con gli strumenti del lettore stesso.',
      `Sezione ${p}: numeri, tabelle e testo lungo per riempire la pagina.`,
    ];
    righe.forEach((t, i) => pagina.drawText(t, { x: 56, y: 720 - i * 22, size: 12, font }));
    for (let r = 0; r < 12; r += 1) {
      pagina.drawRectangle({ x: 56, y: 560 - r * 28, width: 483, height: 24, color: r % 2 ? rgb(0.95, 0.96, 0.97) : rgb(1, 1, 1), borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.5 });
      pagina.drawText(`Voce ${p}.${r + 1}`, { x: 64, y: 567 - r * 28, size: 11, font });
      pagina.drawText(`${(r * 123.45 + p * 10).toFixed(2)} EUR`, { x: 440, y: 567 - r * 28, size: 11, font });
    }
  }
  return Buffer.from(await doc.save());
}

async function documentoWord(immagine) {
  const { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = docx;
  const cella = (testo, grassetto = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: testo, bold: grassetto })] })], width: { size: 33, type: WidthType.PERCENTAGE } });
  const documento = new Document({
    creator: 'TALOS — file di prova',
    title: 'Relazione',
    numbering: { config: [{ reference: 'punti', levels: [{ level: 0, format: 'bullet', text: '•', alignment: 'left' }] }] },
    sections: [{
      children: [
        new Paragraph({ text: 'Relazione del trimestre', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun('Questo documento Word prova la resa di '), new TextRun({ text: 'docx-preview', bold: true }), new TextRun(' dentro il lettore: '), new TextRun({ text: 'grassetto', bold: true }), new TextRun(', '), new TextRun({ text: 'corsivo', italics: true }), new TextRun(' e '), new TextRun({ text: 'sottolineato', underline: {} }), new TextRun('.')] }),
        new Paragraph({ text: 'Punti principali', heading: HeadingLevel.HEADING_2 }),
        ...['Lettore nel rail destro', 'Schermo intero dal rail', 'Sola lettura, niente macro'].map((t) => new Paragraph({ text: t, numbering: { reference: 'punti', level: 0 } })),
        new Paragraph({ text: 'Tabella', heading: HeadingLevel.HEADING_2 }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
          new TableRow({ children: [cella('Formato', true), cella('Libreria', true), cella('Licenza', true)] }),
          new TableRow({ children: [cella('DOCX'), cella('docx-preview'), cella('Apache-2.0')] }),
          new TableRow({ children: [cella('XLSX'), cella('SheetJS'), cella('Apache-2.0')] }),
          new TableRow({ children: [cella('PPTX'), cella('pptx-viewer-core'), cella('MIT')] }),
        ] }),
        new Paragraph({ text: 'Immagine', heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [new ImageRun({ type: 'png', data: immagine, transformation: { width: 320, height: 200 } })] }),
        new Paragraph({ children: [new TextRun({ text: 'Fine del documento.', italics: true })] }),
      ],
    }],
  });
  return Packer.toBuffer(documento);
}

function foglio() {
  const libro = XLSX.utils.book_new();
  const vendite = [['Data', 'Cliente', 'Prodotto', 'Quantità', 'Importo']];
  for (let i = 0; i < 320; i += 1) vendite.push([new Date(Date.UTC(2026, i % 12, (i % 28) + 1)), ['Rossi, Mario', 'Bianchi Srl', 'Verdi & Figli'][i % 3], ['Licenza', 'Supporto', 'Formazione'][i % 3], (i % 7) + 1, Math.round(((i * 37) % 900 + 49.9) * 100) / 100]);
  const fv = XLSX.utils.aoa_to_sheet(vendite, { cellDates: true });
  fv['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 9 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(libro, fv, 'Vendite');
  const riepilogo = XLSX.utils.aoa_to_sheet([['Trimestre', 'Totale'], ['Q1', 12450.5], ['Q2', 13980], ['Q3', 15210.25], ['Q4', 16800]]);
  riepilogo.B6 = { t: 'n', f: 'SUM(B2:B5)', v: 58440.75 };
  riepilogo['!ref'] = 'A1:B6';
  riepilogo.A6 = { t: 's', v: 'Anno' };
  XLSX.utils.book_append_sheet(libro, riepilogo, 'Riepilogo');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Appunti di lavoro (foglio nascosto)']]), 'Appunti');
  libro.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }] };
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

async function presentazione(immagine) {
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_16x9';
  p.title = 'Presentazione di prova';
  const s1 = p.addSlide();
  s1.background = { color: '1F4E5A' };
  s1.addText('Il lettore di TALOS', { x: 0.6, y: 1.6, w: 8.8, h: 1.2, fontSize: 40, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI' });
  s1.addText('Presentazione di prova · 26/09/2026', { x: 0.6, y: 2.8, w: 8.8, h: 0.6, fontSize: 18, color: 'D9E6E9', fontFace: 'Segoe UI' });
  const s2 = p.addSlide();
  s2.addText('Cosa si vede', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 30, bold: true, color: '1F4E5A' });
  s2.addText([
    { text: 'Testo, codice e Markdown', options: { bullet: true } },
    { text: 'PDF col lettore di Chromium', options: { bullet: true } },
    { text: 'Word, Excel e PowerPoint in sola lettura', options: { bullet: true, bold: true } },
    { text: 'HTML reso senza rete', options: { bullet: true, color: 'C07A2B' } },
  ], { x: 0.6, y: 1.3, w: 5.2, h: 3, fontSize: 20, color: '23313A' });
  s2.addShape(p.ShapeType.roundRect, { x: 6.2, y: 1.4, w: 3.2, h: 2.4, fill: { color: 'F4F7F8' }, line: { color: '2F6F7D', width: 2 }, rectRadius: 0.2 });
  s2.addText('Sola lettura', { x: 6.2, y: 2.3, w: 3.2, h: 0.6, align: 'center', fontSize: 20, bold: true, color: '2F6F7D' });
  const s3 = p.addSlide();
  s3.addText('Numeri e immagine', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E5A' });
  s3.addTable([
    [{ text: 'Formato', options: { bold: true, fill: { color: 'E8EEF0' } } }, { text: 'Libreria', options: { bold: true, fill: { color: 'E8EEF0' } } }],
    ['DOCX', 'docx-preview'], ['XLSX', 'SheetJS'], ['PPTX', 'pptx-viewer-core'],
  ], { x: 0.5, y: 1.3, w: 4.6, colW: [1.6, 3], fontSize: 14, border: { type: 'solid', color: 'C9D3D6', pt: 1 } });
  s3.addImage({ data: `image/png;base64,${immagine.toString('base64')}`, x: 5.5, y: 1.3, w: 4, h: 2.5 });
  return p.write({ outputType: 'nodebuffer' });
}

async function zip() {
  const z = new JSZip();
  z.file('dentro/leggimi.txt', 'Un archivio: il lettore non lo apre, lo dice e offre l’app del sistema.\n');
  return z.generateAsync({ type: 'nodebuffer' });
}

/* ------------------------------------------------------------------ la cartella */

/**
 * Scrive i file di prova in `cartella`. Torna l'elenco dei percorsi relativi scritti, e le voci che mette in Libreria.
 * @param {string} cartella
 * @param {{ immagini?: {jpg?:Buffer, webp?:Buffer}, libreria?: boolean }} [opzioni]
 */
export async function scriviFileDelLettore(cartella, { immagini = {}, libreria = true } = {}) {
  const grafico = png();
  const [pdfByte, docxByte, pptxByte, zipByte] = await Promise.all([pdf(), documentoWord(grafico), presentazione(grafico), zip()]);
  const xlsxByte = foglio();
  const file = {
    'Leggimi.md': MARKDOWN,
    'note.txt': 'Note di lavoro.\nSeconda riga.\n\tRiga con una tabulazione.\n',
    'sorgente/registro.mjs': CODICE,
    'dati/vendite.csv': csv(250),
    'dati/config.json': `${JSON.stringify({ nome: 'talos-prova', versione: '0.1.15', lettore: { formati: ['md', 'pdf', 'docx', 'xlsx', 'pptx'], rete: false } }, null, 2)}\n`,
    'pagina/index.html': PAGINA_HTML,
    'pagina/stile.css': STILE_CSS,
    'pagina/logo.svg': SVG,
    'immagini/grafico.png': grafico,
    'immagini/punto.gif': gif(),
    'immagini/mappa.bmp': bmp(),
    'immagini/schema.svg': SVG,
    ...(immagini.jpg ? { 'immagini/foto.jpg': immagini.jpg } : {}),
    ...(immagini.webp ? { 'immagini/foto.webp': immagini.webp } : {}),
    'documenti/relazione.pdf': pdfByte,
    'documenti/relazione.docx': docxByte,
    'documenti/budget.xlsx': xlsxByte,
    'documenti/presentazione.pptx': pptxByte,
    'casi-limite/finto.docx': 'Questo è un file di testo con il nome di un documento Word.\n',
    'casi-limite/senza-estensione': pdfByte,
    'casi-limite/immagine-rinominata.pdf': grafico,
    'casi-limite/con-macro.docm': docxByte,
    'casi-limite/archivio.zip': zipByte,
    'casi-limite/rotto.docx': zipByte, // uno ZIP col nome di un Word: la firma dice Office, la resa (nella cornice) fallisce
    'casi-limite/vuoto.txt': '',
    'casi-limite/registro-grande.log': Array.from({ length: 9000 }, (_, i) => `2026-09-26T10:${String(i % 60).padStart(2, '0')}:00Z riga ${i + 1} del registro di prova, abbastanza lunga da far crescere il file`).join('\n'),
  };
  for (const [relativo, contenuto] of Object.entries(file)) {
    const assoluto = join(cartella, ...relativo.split('/'));
    mkdirSync(dirname(assoluto), { recursive: true });
    writeFileSync(assoluto, contenuto);
  }
  const voci = [];
  if (libreria) {
    const seme = [
      ['Relazione trimestrale.pdf', 'application/pdf', pdfByte],
      ['Relazione.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docxByte],
      ['Budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsxByte],
      ['Presentazione.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', pptxByte],
      ['Leggimi.md', 'text/markdown', Buffer.from(MARKDOWN)],
      ['Pagina.html', 'text/html', Buffer.from(PAGINA_HTML_SOLA)],
      ['Grafico.png', 'image/png', grafico],
      ['vendite.csv', 'text/csv', Buffer.from(csv(250))],
      ['registro.mjs', 'text/javascript', Buffer.from(CODICE)],
      ...(immagini.jpg ? [['Foto.jpg', 'image/jpeg', immagini.jpg]] : []),
    ];
    const adesso = new Date().toISOString();
    seme.forEach(([nome, mediaType, byte], i) => {
      const id = `lib-lettore-${String(i + 1).padStart(2, '0')}`;
      const base = join(cartella, '.harness-ui-library', id);
      mkdirSync(base, { recursive: true });
      writeFileSync(join(base, 'meta.json'), JSON.stringify({ nome, mediaType, origine: 'uploaded', creatoIl: adesso, aggiornatoIl: adesso }, null, 2));
      writeFileSync(join(base, 'contenuto'), byte);
      voci.push({ id, nome });
    });
  }
  return { file: Object.keys(file), voci };
}
