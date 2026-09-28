/*
 * F7-2 (owner 27/09/2026, «NSIS assistito + benvenuto in app») — le immagini dell'installer nei colori di TALOS.
 * NSIS vuole BMP a 24 bit: laterale 164×314 per le pagine di benvenuto e di fine (`installerSidebar`,
 * `uninstallerSidebar`), intestazione 150×57 per le pagine interne (`installerHeader`) — le misure di Modern UI 2, lette
 * nella doc di electron-builder (opzioni NSIS) il 27/09/2026.
 * Le compone CHROMIUM (Playwright del frontend) con il font vero della app, `Instrument Sans` (`frontend/src/assets/fonts`,
 * solo woff2: resvg non lo legge), e il marchio di `public/talos/brand/logo-short.svg` nell'accento Calm; poi il PNG si
 * decodifica (pngjs) e si scrive come BMP. Fondo = `MUI_BGCOLOR` di `assets/installer.nsh` (#1E1F22, il tema Calm scuro),
 * così l'immagine e la pagina sono un pezzo solo.
 * Uso (sviluppo, non build): node scripts/genera-immagini-installer.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const frontend = join(root, '..', 'frontend');
const require = createRequire(join(frontend, 'package.json'));
const { chromium } = require('@playwright/test');
const { PNG } = require('pngjs');

const FONDO = '#1e1f22';
const TESTO = '#f3f1ec';
const SMORZATO = '#a9abb2';
const ACCENTO = '#c08b3c';
/* incorporati come data: URL — da `setContent` (origine about:blank) un file:// non si carica, e il testo ricadeva su Arial */
const font = (peso) => `data:font/woff2;base64,${readFileSync(join(frontend, 'src', 'assets', 'fonts', `instrument-sans-latin-${peso}-normal.woff2`)).toString('base64')}`;
const marchio = readFileSync(join(root, '..', 'public', 'talos', 'brand', 'logo-short.svg'), 'utf8')
  .replace(/<!--[\s\S]*?-->/u, '').replaceAll('currentColor', ACCENTO);

const pagina = (larghezza, altezza, corpo) => `<!doctype html><html><head><style>
@font-face { font-family: 'Instrument Sans'; font-weight: 500; src: url('${font(500)}') format('woff2'); }
@font-face { font-family: 'Instrument Sans'; font-weight: 600; src: url('${font(600)}') format('woff2'); }
html, body { margin: 0; width: ${larghezza}px; height: ${altezza}px; overflow: hidden; background: ${FONDO}; }
body { font-family: 'Instrument Sans', sans-serif; color: ${TESTO}; }
svg { display: block; }
</style></head><body>${corpo}</body></html>`;

const IMMAGINI = [
  {
    file: 'installerSidebar.bmp', larghezza: 164, altezza: 314, testo: true,
    corpo: `<div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; padding-top:78px; gap:14px">
      <div style="width:84px; height:84px">${marchio.replace('<svg ', '<svg width="84" height="84" ')}</div>
      <div style="text-align:center; line-height:1">
        <div style="font-weight:600; font-size:24px; letter-spacing:0.02em">TALOS</div>
        <div style="margin-top:7px; font-weight:500; font-size:10px; letter-spacing:0.22em; color:${SMORZATO}">WORKSPACE</div>
      </div></div>`,
  },
  {
    /* solo il marchio: il titolo della pagina interna lo scrive NSIS accanto, e un «TALOS» qui sarebbe un doppione */
    file: 'installerHeader.bmp', larghezza: 150, altezza: 57,
    corpo: `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center">
      <div style="width:40px; height:40px">${marchio.replace('<svg ', '<svg width="40" height="40" ')}</div></div>`,
  },
];

/** BMP a 24 bit, righe dal basso, ogni riga allineata a 4 byte (formato Windows DIB, BITMAPINFOHEADER). */
function bmpDa(png) {
  const { width: w, height: h, data } = png;
  const riga = Math.ceil((w * 3) / 4) * 4;
  const dati = riga * h;
  const b = Buffer.alloc(54 + dati);
  b.write('BM', 0, 'ascii'); b.writeUInt32LE(54 + dati, 2); b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28);
  b.writeUInt32LE(0, 30); b.writeUInt32LE(dati, 34); b.writeInt32LE(2835, 38); b.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y += 1) {
    const dest = 54 + (h - 1 - y) * riga;
    for (let x = 0; x < w; x += 1) {
      const s = (y * w + x) * 4;
      b[dest + x * 3] = data[s + 2]; b[dest + x * 3 + 1] = data[s + 1]; b[dest + x * 3 + 2] = data[s];
    }
  }
  return b;
}

/* niente antialiasing a subpixel: in un bitmap le frange colorate di ClearType restano per sempre */
const browser = await chromium.launch({ args: ['--disable-lcd-text'] });
try {
  for (const img of IMMAGINI) {
    const pag = await browser.newPage({ viewport: { width: img.larghezza, height: img.altezza }, deviceScaleFactor: 1 });
    await pag.setContent(pagina(img.larghezza, img.altezza, img.corpo));
    const caricati = await pag.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').length; });
    if (img.testo && caricati < 2) throw new Error(`${img.file}: Instrument Sans non caricato (${caricati} font)`);
    const png = PNG.sync.read(await pag.screenshot({ type: 'png' }));
    writeFileSync(join(root, 'assets', img.file), bmpDa(png));
    await pag.close();
    console.log(`${img.file}: ${png.width}×${png.height}`);
  }
} finally { await browser.close(); }
