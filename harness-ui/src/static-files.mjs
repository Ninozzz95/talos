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
   * ⭐⭐⭐ 11/09 — la schermata d'avvio. È un file a parte, e non un pezzo di `app.js`, perché deve
   *   arrivare PRIMA del primo disegno: `app.js` è il bundle grosso, cioè proprio il tempo che il
   *   velo esiste per coprire.
   * ⛔ Senza questa riga il server risponde **404** e non lo dice a nessuno: il velo resta a schermo
   *   per sempre, e sotto c'è la app che nessuno può toccare. Trovato dal vivo, non da un test —
   *   la pagina non lanciava un solo errore.
   * ⛔ Questa mappa è cablata apposta: `file` non si costruisce MAI dal `pathname` della richiesta
   *   (vedi la nota qui sotto su DEC-053), e una voce in più è il solo modo di aggiungere un asset.
   */
  '/avvio.js': { file: 'avvio.js', contentType: 'text/javascript; charset=utf-8' },
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
  '/talos/brand/logo-short.svg': { file: 'talos/brand/logo-short.svg', contentType: 'image/svg+xml' },
  '/talos/browser-annota.js': { file: 'talos/browser-annota.js', contentType: 'text/javascript; charset=utf-8' }, // 06/9: l'overlay iniettato dal proxy
  ...Object.fromEntries(FONT_FILES.map((name) => [
    `/fonts/${name}`,
    { file: `fonts/${name}`, contentType: 'font/woff2' },
  ])),
  /*
   * ⭐⭐⭐ 28/8 — Terminale REALE (LEDGER-TERMINALE-REALE.md): xterm.js
   * vendorizzato (mai una CDN, stesso principio dei font sopra). Trovato
   * dalla verifica dal vivo — senza queste tre righe la allowlist
   * rispondeva 404 su tutti e tre i file e la UI mostrava onestamente
   * "xterm.js non caricato" invece di fingersi connessa.
   */
  '/vendor/xterm/xterm.js': { file: 'vendor/xterm/xterm.js', contentType: 'text/javascript; charset=utf-8' },
  '/vendor/xterm/xterm.css': { file: 'vendor/xterm/xterm.css', contentType: 'text/css; charset=utf-8' },
  '/vendor/xterm/addon-fit.js': { file: 'vendor/xterm/addon-fit.js', contentType: 'text/javascript; charset=utf-8' },
  /** ⭐ 28/8 — renderer WebGL: la vista Terminale ha bisogno di questo per i colori ANSI, vedi il commento in montaTerminaleSeServe() (app.js) e vendor/xterm/README.md per il perché. */
  '/vendor/xterm/addon-webgl.js': { file: 'vendor/xterm/addon-webgl.js', contentType: 'text/javascript; charset=utf-8' },
  /**
   * ⭐⭐⭐ 02/9 — formattatore dei blocchi di codice: Prism 1.30.0
   * vendorizzato (core + 19 linguaggi in un file solo, vedi
   * `vendor/prism/README.md`), stesso principio di xterm qui sopra — mai
   * una CDN. ⛔ Questa riga NON è facoltativa: la allowlist è esplicita, e
   * senza risponderebbe 404 lasciando ogni blocco senza evidenziazione —
   * esattamente il difetto già pagato con xterm il 28/8, quattro righe più
   * su, dove è costato una verifica dal vivo per accorgersene.
   */
  '/vendor/prism/prism.js': { file: 'vendor/prism/prism.js', contentType: 'text/javascript; charset=utf-8' },
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
