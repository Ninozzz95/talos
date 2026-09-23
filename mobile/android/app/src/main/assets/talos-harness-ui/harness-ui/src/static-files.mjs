import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_STATIC_BYTES = 4_194_304;
/** ⭐ Riconciliazione con la copia mobile (24/8) — vedi harness-ui-due-copie-divergenti.md: stessi 10 file .woff2, stesso font/weight/subset. */
const FONT_FILES = Object.freeze([
  'instrument-sans-latin-ext-400-normal.woff2',
  'instrument-sans-latin-400-normal.woff2',
  'instrument-sans-latin-ext-500-normal.woff2',
  'instrument-sans-latin-500-normal.woff2',
  'instrument-sans-latin-ext-600-normal.woff2',
  'instrument-sans-latin-600-normal.woff2',
  'jetbrains-mono-latin-ext-400-normal.woff2',
  'jetbrains-mono-latin-400-normal.woff2',
  'jetbrains-mono-latin-ext-500-normal.woff2',
  'jetbrains-mono-latin-500-normal.woff2',
]);
const STATIC_ASSETS = Object.freeze({
  '/': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/styles.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/app.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  /*
   * ⭐⭐⭐ 26/8, DEC-053 — MAI PIÙ una copia locale sincronizzata a mano
   * (harness-ui-due-copie-divergenti.md era esattamente questo difetto).
   * publicDir ora È mobile/public/harness-ui/: `talos/brand/` è FRATELLO
   * di `harness-ui/`, non figlio — `../` risale alla radice condivisa
   * `mobile/public/` una volta sola, verso l'UNICO file reale che l'app
   * mobile stessa monta a runtime. `file` qui è un valore CABLATO nel
   * sorgente, mai costruito da `pathname` della richiesta: il `..` non
   * apre un varco di traversal, sceglie solo quale asset fisso servire.
   */
  '/talos/brand/logo-short.svg': { file: '../talos/brand/logo-short.svg', contentType: 'image/svg+xml' },
  ...Object.fromEntries(FONT_FILES.map((name) => [
    `/fonts/${name}`,
    { file: `fonts/${name}`, contentType: 'font/woff2' },
  ])),
});

export function createStaticHandler(publicDir, fsAdapter = { readFile }) {
  return async function staticHandler(pathname) {
    const asset = STATIC_ASSETS[pathname];
    if (!asset) return null;
    let body;
    try {
      body = await fsAdapter.readFile(join(publicDir, asset.file));
    } catch (error) {
      // ⭐ 26/8 — un asset MAPPATO ma fisicamente assente (percorso di
      // sviluppo diverso, TALOS_HARNESS_UI_PUBLIC_DIR di test senza la
      // radice condivisa accanto) è un 404 onesto, non un 500 generico:
      // la richiesta era legittima, manca solo il file.
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    if (body.length > MAX_STATIC_BYTES) {
      const error = new Error('Asset statico oltre limite');
      error.code = 'PAYLOAD_LIMIT';
      throw error;
    }
    return { statusCode: 200, contentType: asset.contentType, body };
  };
}
