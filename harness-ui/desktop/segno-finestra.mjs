/*
 * FE-070 — il segno del computer use, la parte del guscio (contratto `Downloads/TALOS/desktop/in-corso/CONTRATTO-SEGNO-COMPUTER-USE-2026-11-05.md`, sezione
 *   «segno-finestra.mjs»; nota `computer-use-pc-segue-il-bozzetto-05-11`: cursore di TALOS e bordo «TALOS guarda questa finestra» come dal bozzetto approvato).
 *   La pagina `segno.html` è del Frontend; gli eventi li manda il computer use sul canale della bolla. Qui solo le finestre che la ospitano.
 *
 * Che cosa fa il guscio, e basta:
 *   · una `BrowserWindow` trasparente per schermo, grande quanto lo schermo, che carica `${base}/segno.html?fx=&fy=&fw=&fh=&scala=`: il rettangolo dello schermo
 *     in pixel FISICI (`screen.dipToScreenRect`, solo Windows; altrove DIP × scaleFactor) e la sua scala. Una per schermo e non una sola su tutto lo schermo virtuale
 *     (cua, `overlay.rs:5-6`): con scale diverse una finestra sola avrebbe una scala sola, e la pagina disegnerebbe storto sull'altro schermo;
 *   · come la bolla: senza preload e senza `partition` (stesso cookie e stesso `BroadcastChannel('talos-bolla')`), carica DOPO la principale, ricarica quando cambia la
 *     generazione del server, si mostra solo con una pagina arrivata con 200, la navigazione resta sull'origine;
 *   · PRIMA di `showInactive`: `setIgnoreMouseEvents(true)` (i clic passano alla finestra sotto: Hermes `main.ts:12681-12690`, «una finestra trasparente che prende il
 *     mouse mangia i clic del desktop»), `setAlwaysOnTop(true,'screen-saver')` (Hermes `hud-overlay.ts:20-21`), `setContentProtection(true)` (WDA_EXCLUDEFROMCAPTURE:
 *     il modello non vede il nostro cursore nelle sue foto). Mai il fuoco: `focusable:false` e solo `showInactive`;
 *   · si ricostruisce a `display-added`, `display-removed` e `display-metrics-changed` (Hermes `main.ts:17901-17905`), una volta sola per raffica; un cambio della sola
 *     area di lavoro (la barra delle applicazioni che si nasconde) non conta, perché le finestre coprono lo schermo intero;
 *   · Windows 10 prima della 2004 (build < 19041): la documentazione di Electron dice che lì `setContentProtection` vale WDA_MONITOR, cioè un rettangolo NERO in ogni
 *     cattura. Quindi niente finestre, e la bolla lo dice una volta per avvio (`{tipo:'segno-assente', motivo:'windows-vecchio'}`, FE-073);
 *   · il ripiego (c): la pagina chiede con `window.open('talos-segno:ripiego')` (la stessa porta senza ponte della bolla, `talos-bolla:porta-davanti`), il guscio nega e
 *     risponde a tutte le pagine pronte con la posizione vera del mouse in pixel fisici globali, al più ogni 100 ms. Il guscio non vede gli eventi del computer use: chi
 *     sa quando serve (un clic senza curva prevista) è la pagina.
 *
 * Fonti, lette il 05/11/2026: docs Electron `screen.md` (dipToScreenRect, dipToScreenPoint, display-metrics-changed con changedMetrics) e `browser-window.md`
 *   (setContentProtection, showInactive, focusable) via Context7; Hermes `hud-overlay.ts:20-21`, `main.ts:12636-12690`, `wake-indicator-window.ts:65-117`;
 *   UI-TARS `ScreenMarker.ts:47-67,223-245`; cua `overlay.rs:5-6,562-563,1508-1517`; Claude in Chrome `agent-visual-indicator.js` (pointer-events:none, z-index massimo).
 *
 * ⛔ Spento di serie: lo stesso cancello della bolla (`--talos-bolla`), finché il computer use non è montato.
 */

import { release } from 'node:os';

export const INDIRIZZO_RIPIEGO = 'talos-segno:ripiego';
export const MESSAGGIO_ASSENTE = Object.freeze({ tipo: 'segno-assente', motivo: 'windows-vecchio' });
export const MESSAGGIO_SENZA_PROTEZIONE = Object.freeze({ tipo: 'segno-assente', motivo: 'protezione' });
/** La prima build di Windows 10 con WDA_EXCLUDEFROMCAPTURE (versione 2004). */
export const BUILD_ESCLUSIONE_CATTURE = 19041;
/** Le metriche che cambiano il rettangolo fisico di uno schermo. `workArea` no. */
const METRICHE_CHE_CONTANO = new Set(['bounds', 'scaleFactor', 'rotation']);
const EVENTI_SCHERMO = ['display-added', 'display-removed', 'display-metrics-changed'];
/** Come il server (`http-app.mjs`, `requireValidStaticQuery`): fino a sei cifre, fino a sei decimali. */
const NUMERO_SEMPLICE = /^-?\d{1,6}(?:\.\d{1,6})?$/u;

/** Vero su Windows prima della 2004, e su un Windows di cui non si legge la versione: meglio la pillola che un rettangolo nero. */
export function windowsVecchio(piattaforma, versione) {
  if (piattaforma !== 'win32') return false;
  const m = /^(\d+)\.(\d+)\.(\d+)/u.exec(String(versione ?? ''));
  if (!m) return true;
  const [maggiore, , build] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return maggiore < 10 || (maggiore === 10 && build < BUILD_ESCLUSIONE_CATTURE);
}

/** Lo schermo in pixel fisici e la sua scala. Windows: la conversione del sistema; altrove DIP × scaleFactor. */
export function schermoFisico(display, screen) {
  const scala = Number(display?.scaleFactor);
  const b = display?.bounds ?? {};
  const r = typeof screen?.dipToScreenRect === 'function'
    ? screen.dipToScreenRect(null, { x: b.x, y: b.y, width: b.width, height: b.height })
    : { x: Math.round(b.x * scala), y: Math.round(b.y * scala), width: Math.round(b.width * scala), height: Math.round(b.height * scala) };
  return { fx: r.x, fy: r.y, fw: r.width, fh: r.height, scala };
}

function numeroSemplice(n, positivo) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('Misura dello schermo non valida.');
  const testo = String(Number(n.toFixed(6)));
  if (!NUMERO_SEMPLICE.test(testo) || (positivo && Number(testo) <= 0)) throw new Error('Misura dello schermo non valida.');
  return testo;
}

/** Le cinque chiavi della pagina, numeri semplici; misure e scala positive. Lancia se lo schermo non va. */
function parametriSchermo(schermo) {
  const q = new URLSearchParams();
  for (const [k, positivo] of [['fx', false], ['fy', false], ['fw', true], ['fh', true], ['scala', true]]) q.append(k, numeroSemplice(schermo?.[k], positivo));
  return q;
}

/** Solo `http://127.0.0.1:<porta>/segno.html` con le cinque chiavi, numeri semplici: lo stesso controllo di `indirizzoBolla`. */
export function indirizzoSegno(base, schermo) {
  const url = new URL(base);
  const porta = Number(url.port);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !Number.isInteger(porta) || porta < 1024 || porta > 65535 || url.username || url.password) {
    throw new Error('Indirizzo locale non consentito.');
  }
  const q = parametriSchermo(schermo);
  url.pathname = '/segno.html'; url.search = `?${q}`; url.hash = '';
  return url.href;
}

export function opzioniFinestraSegno(confini) {
  return {
    ...confini, title: 'TALOS', frame: false, transparent: true, backgroundColor: '#00000000', focusable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
    hasShadow: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    /* l'animazione del cursore non rallenta mentre la principale è sotto o ridotta (Hermes `main.ts:12672`) */
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  };
}

function stessaOrigine(indirizzo, base) {
  try { return Boolean(base) && new URL(indirizzo).origin === new URL(base).origin; } catch { return false; }
}

const codicePosta = (messaggio) => `postMessage(${JSON.stringify(messaggio)}, location.origin)`;

/**
 * @param {{ accesa: boolean, BrowserWindow: Function, screen: object, registro: (riga: string) => void, postaNellaBolla: (messaggio: object) => boolean,
 *   piattaforma?: string, vecchio?: boolean, ritardoRicostruisci?: number, intervalloRipiego?: number, adesso?: () => number }} o
 */
export function creaSegnoFinestre({ accesa, BrowserWindow, screen, registro, postaNellaBolla, piattaforma = process.platform, vecchio = windowsVecchio(piattaforma, release()), ritardoRicostruisci = 200, intervalloRipiego = 100, adesso = Date.now }) {
  /* solo Windows: altrove `dipToScreenRect` non c'è (finestra e ripiego userebbero conversioni diverse) e Linux non ha `setContentProtection` */
  const fuoriWindows = piattaforma !== 'win32';
  /** @type {{ finestra: any, schermo: object, pronta: boolean }[]} */
  let voci = [];
  let base = null; let generazione = null; let caricata = null;
  let ascolta = false; let chiuso = false; let timer = null; let ultimoRipiego = -Infinity; let avvisata = false;
  /** Protezione dalle catture rifiutata su uno schermo: il segno resta spento per tutto l'avvio, su tutti gli schermi (la bolla dice «assente»). */
  let rifiutata = false;
  /** Che cosa dire alla bolla, una volta per avvio: Windows vecchio, o la protezione rifiutata. */
  let assente = vecchio ? MESSAGGIO_ASSENTE : null;

  /** Una riga e un messaggio alla bolla alla prima volta; dopo, la finestra si chiude e basta. */
  function rifiuta(finestra, riga) {
    finestra.destroy();
    if (rifiutata) return null;
    rifiutata = true;
    registro(riga);
    assente ??= MESSAGGIO_SENZA_PROTEZIONE; bollaPronta();
    return null;
  }

  function crea(display) {
    let schermo;
    try { schermo = schermoFisico(display, screen); parametriSchermo(schermo); } catch {
      registro(`Segno: uno schermo con misure non valide (${display?.id ?? '?'}), lì il cursore di TALOS non c'è.`);
      return null;
    }
    const finestra = new BrowserWindow(opzioniFinestraSegno({ ...display.bounds }));
    /* le tre cose PRIMA di mostrarla: mai una finestra che prende i clic, che sta sotto, o che finisce nelle catture */
    finestra.setIgnoreMouseEvents(true);
    finestra.setAlwaysOnTop(true, 'screen-saver');
    try { finestra.setContentProtection(true); } catch {
      return rifiuta(finestra, 'Segno: protezione dalle catture non disponibile, il cursore di TALOS resta spento su tutti gli schermi (il modello vedrebbe un cursore finto).');
    }
    /* `setContentProtection` è void e tace se SetWindowDisplayAffinity fallisce (cua `overlay.rs:1560` ne controlla il risultato): si rilegge */
    if (finestra.isContentProtected?.() === false) {
      return rifiuta(finestra, 'Segno: Windows ha rifiutato la protezione dalle catture, il cursore di TALOS resta spento su tutti gli schermi (il modello vedrebbe un cursore finto).');
    }
    /* creata in DIP sullo schermo principale, poi rimessa al suo posto: con scale diverse la prima misura può sbagliare (Hermes `hud-ipc.ts:223`, setBounds) */
    finestra.setBounds({ ...display.bounds });
    const voce = { finestra, schermo, pronta: false };
    const wc = finestra.webContents;
    /* lo zoom di Chromium va per origine: «Ingrandisci» nella principale (stessa 127.0.0.1) sposterebbe cursore e bordo. Isolato, e a 1 a ogni caricamento */
    wc.setZoomMode('isolated');
    wc.on('did-navigate', (_evento, _indirizzo, codice) => {
      voce.pronta = codice === 200;
      if (!voce.pronta && !finestra.isDestroyed()) { finestra.hide(); registro(`Segno: la pagina non c'è (HTTP ${codice}); il cursore di TALOS resta nascosto.`); }
    });
    wc.on('did-fail-load', (_evento, codice, descrizione, _indirizzo, cornicePrincipale) => {
      if (cornicePrincipale !== true) return;
      voce.pronta = false;
      if (!finestra.isDestroyed()) { finestra.hide(); registro(`Segno: caricamento non riuscito (${descrizione || codice}).`); }
    });
    /* a ogni caricamento buono, anche dopo un 404: `ready-to-show` arriva una volta sola */
    wc.on('did-finish-load', () => {
      if (finestra.isDestroyed()) return;
      wc.setZoomFactor(1);
      if (voce.pronta) finestra.showInactive();
    });
    wc.setWindowOpenHandler(({ url }) => {
      if (url === INDIRIZZO_RIPIEGO) setImmediate(ripiego);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (evento, destinazione) => { if (!stessaOrigine(destinazione, base)) evento.preventDefault(); });
    wc.on('will-redirect', (evento) => { if (!stessaOrigine(evento.url, base)) evento.preventDefault(); });
    return voce;
  }

  function distruggi() {
    for (const { finestra } of voci) if (!finestra.isDestroyed()) finestra.destroy();
    voci = [];
  }

  function costruisci() {
    distruggi();
    if (rifiutata) return;
    voci = screen.getAllDisplays().map(crea).filter(Boolean);
    caricata = null;
    /* uno schermo rifiutato spegne anche gli altri: mai un cursore visibile mentre la bolla dice «assente» */
    if (rifiutata) distruggi();
  }

  function suSchermo(_evento, _display, metriche) {
    if (Array.isArray(metriche) && !metriche.some(m => METRICHE_CHE_CONTANO.has(m))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (chiuso) return; // `chiudi` lo cancella; e se sfuggisse, a guscio chiuso non si riapre niente
      costruisci();
      if (base !== null) aggiorna(base, generazione).catch(() => registro('Segno: caricamento non riuscito dopo il cambio di schermi.'));
    }, ritardoRicostruisci);
  }

  /** Dopo la principale, alla stessa generazione: crea se serve, ricarica solo se il server è cambiato. Vero se ha caricato. */
  async function aggiorna(nuovaBase, nuovaGenerazione) {
    if (!accesa || vecchio || fuoriWindows || chiuso || rifiutata) return false;
    indirizzoSegno(nuovaBase, { fx: 0, fy: 0, fw: 1, fh: 1, scala: 1 }); // un indirizzo non locale non apre niente, nemmeno le finestre
    base = nuovaBase; generazione = nuovaGenerazione;
    if (!ascolta) { ascolta = true; for (const e of EVENTI_SCHERMO) screen.on(e, suSchermo); }
    if (voci.length === 0 || voci.some(v => v.finestra.isDestroyed())) costruisci();
    if (rifiutata) return false;
    if (caricata === nuovaGenerazione) return false;
    await Promise.all(voci.map((v) => { v.pronta = false; return v.finestra.loadURL(indirizzoSegno(nuovaBase, v.schermo)); }));
    /* un cambio di schermi durante il caricamento rifà `caricata = null` e ricarica col suo timer: segnarla qui non salta niente */
    caricata = nuovaGenerazione;
    return true;
  }

  /** Il cursore vero, in pixel fisici globali, a tutte le pagine pronte. Al più ogni `intervalloRipiego` ms: tutte le pagine chiedono allo stesso evento. */
  function ripiego() {
    if (!accesa || vecchio || fuoriWindows || chiuso || rifiutata) return false;
    const ora = adesso();
    if (ora - ultimoRipiego < intervalloRipiego) return false;
    ultimoRipiego = ora;
    const dip = screen.getCursorScreenPoint();
    let p;
    if (typeof screen.dipToScreenPoint === 'function') p = screen.dipToScreenPoint(dip);
    else { const scala = Number(screen.getDisplayNearestPoint(dip)?.scaleFactor) || 1; p = { x: dip.x * scala, y: dip.y * scala }; }
    const codice = codicePosta({ tipo: 'segno-ripiego', punto: { x: Math.round(p.x), y: Math.round(p.y) } });
    for (const { finestra, pronta } of voci) {
      if (pronta && !finestra.isDestroyed()) finestra.webContents.executeJavaScript(codice).catch(() => registro('Segno: ripiego non consegnato.'));
    }
    return true;
  }

  /** La pagina della bolla è pronta: su Windows vecchio le si dice, una volta per avvio, che il cursore di TALOS non si vede. */
  function bollaPronta() {
    if (!accesa || !assente || avvisata) return;
    avvisata = postaNellaBolla(assente) === true;
  }

  function chiudi() {
    chiuso = true;
    clearTimeout(timer); timer = null;
    if (ascolta) { for (const e of EVENTI_SCHERMO) screen.removeListener(e, suSchermo); ascolta = false; }
    distruggi();
  }

  return { aggiorna, ripiego, bollaPronta, chiudi };
}
