import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

/*
 * 15/10/2026 (bugfixer, seconda passata della revisione) — UNA PROVA DI UNITÀ APPESA TENEVA FERMA LA SUITE PER SEMPRE.
 *   Misurato: `tests/unit/provider-modale-salva-browser.test.mjs` è rimasta appesa più di 20 minuti (fermata a mano), e la suite
 *   aspettava lei. La causa NON era la `dist` mancante, come avevo scritto: senza la `dist` la stessa prova passa 19 su 19 in 15 s, e
 *   sei corse in parallelo passano tutte. Quattordici prove di unità aprono un browser (otto il Chrome installato, `channel: 'chrome'`),
 *   e nessuna ha un tetto: un `launch`, un `close` o un'attesa che non torna più tiene appeso il file, e il file tiene appesa la suite.
 *   Il runner non passava né `--test-timeout` né `--test-force-exit`.
 * ⇒ Di serie: ogni prova (e ogni gancio) ha un tetto di 3 minuti — la più lunga misurata oggi ne prende 19 s — e a fine file il
 *   processo esce anche se un browser o un handle restano aperti. Così una prova appesa diventa una ROSSA con il suo nome e
 *   «test timed out after 180000ms», invece di una suite che non finisce. Chi passa i suoi valori li tiene.
 * Fonte: nodejs.org/api/cli.html, `--test-timeout` e `--test-force-exit` (Node 24); misurati qui sotto in `runner-prove-node.test.mjs`
 *   (un gancio `before` appeso: senza il tetto non finisce; un `after` appeso con un handle vivo: serve anche `--test-force-exit`).
 */
export const TETTO_DI_SERIE_MS = 180_000;

/** Gli argomenti di `node --test` per la suite del frontend: quelli di chi chiama, più i due di serie se non li ha già dati. */
export function argomentiDelRunner(argomenti = [], { tettoMs = TETTO_DI_SERIE_MS } = {}) {
  const dato = (nome) => argomenti.some((a) => a === nome || a.startsWith(`${nome}=`));
  return [
    ...(dato('--test-timeout') ? [] : [`--test-timeout=${tettoMs}`]),
    ...(dato('--test-force-exit') ? [] : ['--test-force-exit']),
    ...argomenti,
  ];
}

/*
 * 12/11/2026 (censimento delle 95 prove di unità che aprono un browser, giudice v1614-v1615) — COL PROFILO FINTO NESSUN BROWSER PARTIVA.
 *   Misurato su edba3aee8 e su desktop-v0.2.1, 15 file, 4 lavoratori: 95 rosse su 95 col profilo finto, 95 verdi su 95 con l'ambiente
 *   qui sotto. Due cause, tutte e due dell'ambiente delle prove, nessuna del prodotto:
 *   - 31 prove (headless shell): Playwright cerca i binari in `%LOCALAPPDATA%\ms-playwright` (coreBundle.js, `defaultCacheDirectory`),
 *     cioè sotto il profilo finto, dove non ci sono → «Executable doesn't exist».
 *   - 64 prove (`channel: 'chrome'`): da Chrome 136 il canale dei DevTools vuole una cartella dati che NON sia quella di serie; con un
 *     USERPROFILE finto senza `AppData\Local` Chrome non risolve quella di serie e rifiuta il canale («DevTools remote debugging requires
 *     a non-default data directory») → «browser has been closed». Stesso LOCALAPPDATA, USERPROFILE con la cartella: verde; senza: rosso.
 * ⇒ Di serie il runner dà ai figli i binari di Playwright dell'utente vero (`os.userInfo().homedir` legge il profilo dal sistema, non
 *   dall'ambiente) — SOLO la cartella dei binari `ms-playwright`, mai il profilo — quando sotto quello dato non ci sono, e crea la
 *   `AppData\Local` dentro un USERPROFILE che non ce l'ha. Chi passa `PLAYWRIGHT_BROWSERS_PATH` lo tiene; col profilo vero non cambia niente.
 * Fonti: playwright.dev/docs/browsers («Managing browser binaries», PLAYWRIGHT_BROWSERS_PATH); developer.chrome.com/blog/remote-debugging-port.
 */
function cartellaCacheDi(piattaforma, ambiente, casa) {
  if (piattaforma === 'win32') return ambiente.LOCALAPPDATA || join(casa, 'AppData', 'Local');
  if (piattaforma === 'darwin') return join(casa, 'Library', 'Caches');
  return ambiente.XDG_CACHE_HOME || join(casa, '.cache');
}

/** La cartella dell'utente detta dal sistema, non dall'ambiente; '' dove il sistema non la sa (`os.userInfo()` lancia). */
export function casaDelSistema(leggi = userInfo) {
  try { return leggi().homedir || ''; } catch { return ''; }
}

/** L'ambiente dei figli di `node --test`: `{ ambiente, cartelleDaCreare }`. Non tocca l'ambiente di chi chiama. */
export function ambienteDelleProve(ambiente = process.env, {
  cartellaUtenteVera = casaDelSistema(), esiste = existsSync, piattaforma = process.platform,
} = {}) {
  const risultato = { ...ambiente };
  const cartelleDaCreare = [];
  if (!risultato.PLAYWRIGHT_BROWSERS_PATH && cartellaUtenteVera) {
    const casaData = (piattaforma === 'win32' ? ambiente.USERPROFILE : ambiente.HOME) || cartellaUtenteVera;
    const dati = join(cartellaCacheDi(piattaforma, ambiente, casaData), 'ms-playwright');
    const veri = join(cartellaCacheDi(piattaforma, {}, cartellaUtenteVera), 'ms-playwright');
    if (!esiste(dati) && esiste(veri)) risultato.PLAYWRIGHT_BROWSERS_PATH = veri;
  }
  if (piattaforma === 'win32' && ambiente.USERPROFILE) {
    const locale = join(ambiente.USERPROFILE, 'AppData', 'Local');
    if (!esiste(locale)) cartelleDaCreare.push(locale);
  }
  return { ambiente: risultato, cartelleDaCreare };
}
