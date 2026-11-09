/*
 * FE-066 — la bolla del computer use, la parte del guscio (forma `Downloads/TALOS/frontend/in-corso/FORMA-BOLLA-COMPUTER-USE-2026-11-03.md`, decisione dell'owner del 02/11:
 *   la pagina è del Frontend, la finestra del Desktop). Una seconda `BrowserWindow` piccola, sempre sopra, fuori dalle catture, che carica `bolla.html` dallo stesso server.
 *
 * Che cosa fa il guscio, e basta:
 *   · la finestra: senza cornice, trasparente, fuori dalla barra delle applicazioni, `contextIsolation` e `sandbox` come la principale, NESSUN preload e nessuna `partition`:
 *     senza partition la bolla vede il cookie della principale e il suo `BroadcastChannel('talos-bolla')`;
 *   · il gettone non passa di qui: la bolla carica `${base}/bolla.html` DOPO che la principale è entrata col biglietto e ha il cookie, e ricarica quando cambia la
 *     generazione del server (`main.mjs`, `mostraOAggiorna`), altrimenti le API darebbero 401;
 *   · la misura: `enablePreferredSizeMode` e `preferred-size-changed` (docs Electron `web-contents.md`, via Context7 il 03/11/2026): la pagina non manda niente, il guscio
 *     legge quanto spazio le serve e allarga verso l'alto, col centro e il fondo fermi;
 *   · «Apri in TALOS»: la pagina fa `window.open('talos-bolla:porta-davanti')`, qui si nega e si porta davanti la principale, come gli aggiornamenti;
 *   · la scorciatoia globale: `register` fallisce IN SILENZIO se un altro programma la tiene (docs Electron `global-shortcut.md`), quindi il risultato si guarda e si
 *     dice, nel registro e nella voce del menu. Il mouse resta: la voce del vassoio apre la bolla anche senza scorciatoia;
 *   · il posto: centro e fondo in `bolla.json`, scritto col temporaneo e la rinomina.
 *
 * Fonti, lette il 03/11/2026 (`TALOS-RICERCHE/concorrenti/hermes-agent-2026-11-01/apps/desktop/electron`):
 *   · `main.ts:13420-13470`, la finestra rapida: `frame:false`, `transparent:true`, `skipTaskbar` fuori dal Mac, `alwaysOnTop`, `sandbox`, `show:false`;
 *   · `hud-overlay.ts:20-21`, `setAlwaysOnTop(true, 'screen-saver')` fuori dal Mac;
 *   · `quick-entry.ts:404-466`, la scorciatoia: `isRegistered` poi `register`, e un «occupata» che si mostra, mai inghiottito (goose non guarda il risultato,
 *     `goose-2026-11-01/ui/desktop/src/main.ts:2398`: non si copia).
 *   Diverso da Hermes: la sua finestra rapida si nasconde quando perde il fuoco; la nostra bolla resta a riposo come pillola, e aperta/chiusa li decide la pagina col fuoco.
 *
 * ⛔ Spenta di serie (`--talos-bolla` sulla riga di comando) finché il computer use non è montato: una pillola sullo schermo che non fa niente sarebbe una funzione finta.
 * ⛔ La combinazione Ctrl+Alt+Space è DECISA dall'owner (decisione 58 del registro; ricerca `RICERCA-SCORCIATOIA-BOLLA-2026-11-03.md`, A: non scrive niente con AltGr).
 *   La decisione 136 ha cambiato solo il tasto del freno (Esc), non questa. Il freno da tastiera
 *   NON è qui: sta nell'aiutante del computer use, e oggi non esiste.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

export const ARGOMENTO_BOLLA = '--talos-bolla';
export const SCORCIATOIA_BOLLA = 'Control+Alt+Space';
export const INDIRIZZO_PORTA_DAVANTI = 'talos-bolla:porta-davanti';
/** Pixel DIP. La pillola a riposo è alta 64; la carta aperta cresce fino a `maxA`. Da rimisurare dal vivo con la pagina vera (treno). */
export const MISURA_BOLLA = Object.freeze({ larghezza: 480, altezza: 64, minL: 320, maxL: 600, minA: 48, maxA: 640, margine: 24 });

const intero = (n) => Number.isFinite(n) ? Math.round(n) : NaN;
const fra = (n, minimo, massimo) => Math.min(Math.max(n, minimo), massimo);

/** La bolla si accende solo con l'argomento esatto. */
export function bollaAccesa(argv = []) {
  return argv.includes(ARGOMENTO_BOLLA);
}

/** Lo stesso controllo dell'ingresso della principale (`runtime.mjs`, `urlIngresso`), senza gettone: solo `http://127.0.0.1:<porta>/bolla.html`. */
export function indirizzoBolla(base) {
  const url = new URL(base);
  const porta = Number(url.port);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !Number.isInteger(porta) || porta < 1024 || porta > 65535 || url.username || url.password) {
    throw new Error('Indirizzo locale non consentito.');
  }
  url.pathname = '/bolla.html'; url.search = ''; url.hash = '';
  return url.href;
}

export function opzioniFinestraBolla(confini) {
  return {
    ...confini, title: 'TALOS', frame: false, transparent: true, backgroundColor: '#00000000', skipTaskbar: true, alwaysOnTop: true, show: false,
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, enablePreferredSizeMode: true },
  };
}

/** Dentro l'area di lavoro dello schermo, sempre: una bolla fuori dallo schermo non si ritrova. */
function dentro({ x, y, width, height }, area) {
  return { x: fra(x, area.x, area.x + area.width - width), y: fra(y, area.y, area.y + area.height - height), width, height };
}

/** La nuova misura chiesta dalla pagina, col centro e il fondo fermi: la carta si apre sopra la pillola. */
export function nuoviConfini(attuali, misura, area) {
  const width = fra(intero(misura?.width) || MISURA_BOLLA.larghezza, MISURA_BOLLA.minL, Math.min(MISURA_BOLLA.maxL, area.width));
  const height = fra(intero(misura?.height) || MISURA_BOLLA.altezza, MISURA_BOLLA.minA, Math.min(MISURA_BOLLA.maxA, area.height));
  const centro = attuali.x + attuali.width / 2;
  const fondo = attuali.y + attuali.height;
  return dentro({ x: Math.round(centro - width / 2), y: fondo - height, width, height }, area);
}

/** Il posto salvato: `{ centro, fondo }` interi, o `null` (file assente, rotto, valori strani: vale il posto di serie). */
export function leggiPosto(file) {
  try {
    const { centro, fondo } = JSON.parse(readFileSync(file, 'utf8'));
    return Number.isInteger(centro) && Number.isInteger(fondo) ? { centro, fondo } : null;
  } catch { return null; }
}

function salvaPosto(file, posto) {
  const temporaneo = `${file}.tmp`;
  writeFileSync(temporaneo, `${JSON.stringify(posto)}\n`);
  renameSync(temporaneo, file);
}

/** Come le altre voci del menu nativo (`segnalazione.mjs`): inglese di serie, italiano se il sistema è in italiano. */
export function etichettaBolla(lingua, { occupata, scorciatoia }) {
  const tasti = scorciatoia.replace('Control', 'Ctrl');
  if (/^it(?:[-_]|$)/iu.test(String(lingua ?? ''))) return occupata ? `Mostra la bolla (un altro programma usa ${tasti})` : `Mostra la bolla (${tasti})`;
  return occupata ? `Show the bubble (another program uses ${tasti})` : `Show the bubble (${tasti})`;
}

function stessaOrigine(indirizzo, base) {
  try { return Boolean(base) && new URL(indirizzo).origin === new URL(base).origin; } catch { return false; }
}

/**
 * @param {{ accesa: boolean, BrowserWindow: Function, globalShortcut: object, screen: object, registro: (riga: string) => void, portaDavanti: () => void,
 *   filePosto: string, lingua: string, scorciatoia?: string, ritardoSalva?: number, quandoPronta?: () => void }} o
 *   `quandoPronta`: la pagina è arrivata con 200 e ha finito di caricare (FE-073: il segno le dice, su Windows vecchio, che il cursore non si vede).
 */
export function creaBolla({ accesa, BrowserWindow, globalShortcut, screen, registro, portaDavanti, filePosto, lingua, scorciatoia = SCORCIATOIA_BOLLA, ritardoSalva = 300, quandoPronta = () => {} }) {
  let finestra = null; let base = null; let generazione = null; let caricata = null;
  let stato = { registrata: false, occupata: false, scorciatoia };
  let pronta = false; // N5: la pagina della bolla è arrivata con 200

  const areaDi = (confini) => { try { return screen.getDisplayMatching(confini).workArea; } catch { return screen.getPrimaryDisplay().workArea; } };

  function crea() {
    const primaria = screen.getPrimaryDisplay().workArea;
    const posto = leggiPosto(filePosto) ?? { centro: Math.round(primaria.x + primaria.width / 2), fondo: primaria.y + primaria.height - MISURA_BOLLA.margine };
    const prima = { x: Math.round(posto.centro - MISURA_BOLLA.larghezza / 2), y: posto.fondo - MISURA_BOLLA.altezza, width: MISURA_BOLLA.larghezza, height: MISURA_BOLLA.altezza };
    const questa = new BrowserWindow(opzioniFinestraBolla(dentro(prima, areaDi(prima))));
    /* sopra anche le app a tutto schermo: su Windows il livello va provato dal vivo, la documentazione dice solo che dipende dal sistema */
    questa.setAlwaysOnTop(true, 'screen-saver');
    /*
     * fuori dalle catture (Windows: WDA_EXCLUDEFROMCAPTURE), come vuole il bozzetto («bolla e cursore non compaiono»). ⛔ N4 della seconda revisione: il modello quindi
     *   NON la vede, ma i suoi clic la colpiscono lo stesso, perché sta sopra a tutto e non lascia passare i clic. Per questo il guscio dice dove sta (`rettangoloFisico()`, in pixel fisici):
     *   il computer use esclude quel rettangolo. Hermes fa passare i clic con un canale verso la pagina (`hud-ipc.ts:173`), che qui non c'è.
     */
    try { questa.setContentProtection(true); } catch { registro('Bolla: protezione dalle catture non disponibile.'); }
    /* N5 della seconda revisione: si mostra solo una pagina arrivata con 200. Senza la pagina (404) o con un caricamento fallito resta nascosta, e si dice */
    questa.webContents.on('did-navigate', (_evento, _indirizzo, codice) => {
      pronta = codice === 200;
      if (!pronta && !questa.isDestroyed()) { questa.hide(); registro(`Bolla: la pagina non c'è (HTTP ${codice}); la bolla resta nascosta.`); }
    });
    questa.webContents.on('did-fail-load', (_evento, codice, descrizione, _indirizzo, cornicePrincipale) => {
      if (cornicePrincipale !== true) return;
      pronta = false;
      if (!questa.isDestroyed()) { questa.hide(); registro(`Bolla: caricamento non riuscito (${descrizione || codice}); la bolla resta nascosta.`); }
    });
    questa.webContents.on('did-finish-load', () => { if (pronta && finestra === questa) quandoPronta(); });
    questa.webContents.setWindowOpenHandler(({ url }) => {
      if (url === INDIRIZZO_PORTA_DAVANTI) setImmediate(portaDavanti);
      return { action: 'deny' };
    });
    questa.webContents.on('will-navigate', (evento, destinazione) => { if (!stessaOrigine(destinazione, base)) evento.preventDefault(); });
    questa.webContents.on('will-redirect', (evento) => { if (!stessaOrigine(evento.url, base)) evento.preventDefault(); });
    questa.webContents.on('preferred-size-changed', (_evento, misura) => {
      if (questa.isDestroyed()) return;
      const attuali = questa.getBounds();
      questa.setBounds(nuoviConfini(attuali, misura, areaDi(attuali)));
    });
    let timer = null;
    questa.on('move', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (questa.isDestroyed()) return;
        const { x, y, width, height } = questa.getBounds();
        try { salvaPosto(filePosto, { centro: Math.round(x + width / 2), fondo: y + height }); } catch { registro('Bolla: impossibile salvare il posto.'); }
      }, ritardoSalva);
    });
    /* a riposo resta una pillola: si mostra senza rubare il fuoco */
    questa.once('ready-to-show', () => { if (pronta && !questa.isDestroyed()) questa.showInactive(); });
    /* una finestra distrutta si riconosce da `isDestroyed()`: `aggiorna` e `mostra` la rifanno, e la creazione azzera `caricata` */
    questa.on('closed', () => { clearTimeout(timer); });
    return questa;
  }

  /** Dopo la principale, alla stessa generazione: crea se serve, ricarica solo se il server è cambiato. Vero se ha caricato. */
  async function aggiorna(nuovaBase, nuovaGenerazione) {
    if (!accesa) return false;
    base = nuovaBase; generazione = nuovaGenerazione;
    if (!finestra || finestra.isDestroyed()) { pronta = false; finestra = crea(); caricata = null; }
    if (caricata === nuovaGenerazione) return false;
    pronta = false; // la ridice `did-navigate` della pagina nuova
    const questa = finestra;
    await questa.loadURL(indirizzoBolla(nuovaBase));
    if (finestra === questa) caricata = nuovaGenerazione;
    return true;
  }

  function mostra() {
    if (!accesa) return;
    if ((!finestra || finestra.isDestroyed()) && base) aggiorna(base, generazione).catch(() => registro('Bolla: caricamento non riuscito.'));
    if (!finestra || finestra.isDestroyed()) return;
    if (!pronta) { registro('Bolla: la pagina non è pronta, la bolla non si apre.'); return; }
    finestra.show(); finestra.focus();
  }

  /**
   * N4: dove sta la bolla visibile, in PIXEL FISICI dello schermo, per chi deve evitarla (il computer use cattura e clicca in pixel fisici); `null` se non si vede.
   * 03/11 (Computer use): `getBounds()` è in DIP, e a scala 150% la zona finiva altrove. Su Windows converte il sistema (`dipToScreenRect`, solo Windows, scala
   * dello schermo della finestra); altrove la scala dello schermo che la contiene.
   */
  function rettangoloFisico() {
    if (!finestra || finestra.isDestroyed() || !finestra.isVisible()) return null; // spenta non ha mai una finestra
    const logico = finestra.getBounds();
    if (typeof screen.dipToScreenRect === 'function') return screen.dipToScreenRect(finestra, logico);
    let scala = 1;
    try { scala = Number(screen.getDisplayMatching(logico)?.scaleFactor) || 1; } catch { /* nessuno schermo: scala 1 */ }
    const per = (v) => Math.round(v * scala);
    return { x: per(logico.x), y: per(logico.y), width: per(logico.width), height: per(logico.height) };
  }

  /**
   * FE-073: un messaggio nella pagina della bolla, con `postMessage` sulla sua stessa finestra (la pagina accetta solo quella sorgente e quell'origine, `bolla.js`).
   *   Vero se consegnato a una pagina arrivata con 200; falso senza finestra o con la pagina non pronta: chi manda riprova a `quandoPronta`.
   */
  function posta(messaggio) {
    if (!finestra || finestra.isDestroyed() || !pronta) return false; // spenta non ha finestra
    finestra.webContents.executeJavaScript(`postMessage(${JSON.stringify(messaggio)}, location.origin)`).catch(() => registro('Bolla: messaggio non consegnato.'));
    return true;
  }

  function registraScorciatoia() {
    if (!accesa) return stato;
    let ok = false;
    try { ok = !globalShortcut.isRegistered(scorciatoia) && globalShortcut.register(scorciatoia, mostra); } catch { ok = false; }
    stato = { registrata: ok, occupata: !ok, scorciatoia };
    if (!ok) registro(`Bolla: la scorciatoia ${scorciatoia.replace('Control', 'Ctrl')} non è registrata, la usa un altro programma. La bolla si apre dal menu del vassoio.`);
    return stato;
  }

  function voceDelMenu() {
    /* `lingua` può essere una funzione: `app.getLocale()` vale solo dopo `ready` */
    return accesa ? { id: 'mostra-bolla', label: etichettaBolla(typeof lingua === 'function' ? lingua() : lingua, stato), click: mostra } : null;
  }

  function chiudi() {
    if (stato.registrata) { try { globalShortcut.unregister(scorciatoia); } catch { /* già rilasciata */ } }
    stato = { ...stato, registrata: false };
    if (finestra && !finestra.isDestroyed()) finestra.destroy();
  }

  return { aggiorna, mostra, registraScorciatoia, voceDelMenu, chiudi, rettangoloFisico, posta };
}
