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
 *     generazione del server, si mostra solo con una pagina arrivata con 200 che batte (giro 5), la navigazione resta sull'origine;
 *   · PRIMA di `showInactive`: `setIgnoreMouseEvents(true)` (i clic passano alla finestra sotto: Hermes `main.ts:12681-12690`, «una finestra trasparente che prende il
 *     mouse mangia i clic del desktop»), `setAlwaysOnTop(true,'screen-saver')` (Hermes `hud-overlay.ts:20-21`), `setContentProtection(true)` (WDA_EXCLUDEFROMCAPTURE:
 *     il modello non vede il nostro cursore nelle sue foto). Mai il fuoco: `focusable:false` e solo `showInactive`;
 *   · si ricostruisce a `display-added`, `display-removed` e `display-metrics-changed` (Hermes `main.ts:17901-17905`), una volta sola per raffica; un cambio della sola
 *     area di lavoro (la barra delle applicazioni che si nasconde) non conta, perché le finestre coprono lo schermo intero;
 *   · Windows 10 prima della 2004 (build < 19041): la documentazione di Electron dice che lì `setContentProtection` vale WDA_MONITOR, cioè un rettangolo NERO in ogni
 *     cattura. Quindi niente finestre, e la bolla lo dice una volta per avvio (`{tipo:'segno-assente', motivo:'windows-vecchio'}`, FE-073);
 *   · il ripiego (c): la pagina chiede con `window.open('talos-segno:ripiego')` (la stessa porta senza ponte della bolla, `talos-bolla:porta-davanti`), il guscio nega e
 *     risponde a tutte le pagine pronte con la posizione vera del mouse in pixel fisici globali, al più ogni 100 ms. Il guscio non vede gli eventi del computer use: chi
 *     sa quando serve (un clic senza curva prevista) è la pagina;
 *   · giro 5 della bolla (owner 14/11): il battito. La pagina, DOPO aver disegnato, apre `talos-segno:battito` ogni MS_BATTITO (stessa porta, negata). Il segno è
 *     acceso (`acceso()`, che il server legge) solo quando OGNI schermo ha la sua pagina arrivata con 200 che batte; senza battito per MS_SENZA_BATTITO, su
 *     `unresponsive` o su `render-process-gone` si spegne e il server lo sa (`quandoCambia`, nei due versi). Le finestre si MOSTRANO solo col segno acceso E nessun
 *     aiutante col suo cursore (`aiutante(conCursore)`, detto dal server): mai due cursori.
 *
 * Fonti, lette il 05/11/2026: docs Electron `screen.md` (dipToScreenRect, dipToScreenPoint, display-metrics-changed con changedMetrics) e `browser-window.md`
 *   (setContentProtection, showInactive, focusable) via Context7; Hermes `hud-overlay.ts:20-21`, `main.ts:12636-12690`, `wake-indicator-window.ts:65-117`;
 *   UI-TARS `ScreenMarker.ts:47-67,223-245`; cua `overlay.rs:5-6,562-563,1508-1517`; Claude in Chrome `agent-visual-indicator.js` (pointer-events:none, z-index massimo).
 *
 * ⛔ Spento di serie: lo stesso cancello della bolla (`--talos-bolla`), finché il computer use non è montato.
 */

import { release } from 'node:os';

export const INDIRIZZO_RIPIEGO = 'talos-segno:ripiego';
/** Giro 5 della bolla (owner 14/11): il battito della pagina del segno, dopo il disegno (`frontend/src/segno.js`, `creaBattito`; stesso valore in `bolla-messaggi.js`). */
export const INDIRIZZO_BATTITO = 'talos-segno:battito';
/** Ogni quanto batte la pagina (lo stesso numero della pagina, `bolla-messaggi.js` MS_BATTITO). */
export const MS_BATTITO = 500;
/** Senza battito per tanto, la pagina è ferma: il segno si spegne e torna il cursore dell'aiutante. Sta sotto un passo del compito (una foto, una risposta
    del modello e il volo del cursore da 250 a 850 ms; i tetti del ciclo danno 6 s a passo, misurati 8 s il 10/11) e lascia 3 battiti persi prima di spegnere
    (una pausa del renderer non lo spegne). Electron dice `unresponsive` solo dopo 5 s (Hermes `hud-close.ts:7-10`): il battito arriva prima. */
export const MS_SENZA_BATTITO = 2_000;
/** Chi dice `aiutante(conCursore)` senza nome (le prove, un guscio con un figlio solo). */
const AIUTANTE_SOLO = Symbol('aiutante');
export const MESSAGGIO_ASSENTE = Object.freeze({ tipo: 'segno-assente', motivo: 'windows-vecchio' });
export const MESSAGGIO_SENZA_PROTEZIONE = Object.freeze({ tipo: 'segno-assente', motivo: 'protezione' });
/** La prima build di Windows 10 con WDA_EXCLUDEFROMCAPTURE (versione 2004). */
export const BUILD_ESCLUSIONE_CATTURE = 19041;
/** Le metriche che cambiano il rettangolo fisico di uno schermo. `workArea` no. */
const METRICHE_CHE_CONTANO = new Set(['bounds', 'scaleFactor', 'rotation']);
const EVENTI_SCHERMO = ['display-added', 'display-removed', 'display-metrics-changed'];
/** Giro 4 della bolla (13/11): quanto si aspetta la pagina del segno dopo `loadURL` prima di darla per mancata. La pagina è locale e piccola (FE-072, < 40 KB);
    Hermes aspetta 4 s la sua finestra prima del ripiego (`window-reveal.ts:18`). Qui di più: mancata vuol dire spento per tutto l'avvio.
    Giro 5: «pronta» vuol dire che ha battuto almeno una volta, non solo che è arrivata con 200. */
export const MS_PAGINA_PRONTA = 15_000;
/** Chromium: una navigazione sostituita da un'altra (il server ripartito a metà caricamento). Non è un guasto (Hermes `window-renderer-lifecycle.ts:200`). */
const ERR_ABORTED = -3;
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
    /* giro 6 della bolla (14/11): la finestra nasce nascosta e si mostra al primo battito; il suo renderer resta attivo da nascosta (UI-TARS
       `ScreenMarker.ts:61`; Electron `browser-window-options.md`, «Whether the renderer should be active when `show` is `false`»). Il primo battito non
       aspetta i fotogrammi, che in una finestra mai mostrata non arrivano (misurato dal vivo il 14/11): `creaBattito` parte anche dai timer */
    paintWhenInitiallyHidden: true,
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
 *   piattaforma?: string, vecchio?: boolean, ritardoRicostruisci?: number, intervalloRipiego?: number, adesso?: () => number,
 *   quandoCambia?: (acceso: boolean) => void, msPaginaPronta?: number, msSenzaBattito?: number }} o
 */
export function creaSegnoFinestre({ accesa, BrowserWindow, screen, registro, postaNellaBolla, piattaforma = process.platform, vecchio = windowsVecchio(piattaforma, release()), ritardoRicostruisci = 200, intervalloRipiego = 100, adesso = Date.now, quandoCambia = () => {}, msPaginaPronta = MS_PAGINA_PRONTA, msSenzaBattito = MS_SENZA_BATTITO }) {
  /* solo Windows: altrove `dipToScreenRect` non c'è (finestra e ripiego userebbero conversioni diverse) e Linux non ha `setContentProtection` */
  const fuoriWindows = piattaforma !== 'win32';
  /** `pronta`: arrivata con 200; `battito`: batte adesso; `battuta`: ha battuto almeno una volta in questo caricamento; `mostrata`: la finestra si vede.
      @type {{ finestra: any, schermo: object, pronta: boolean, battito: boolean, battuta: boolean, mostrata: boolean, timerBattito: any }[]} */
  let voci = [];
  /* Giro 5 della bolla: ciò che il server sa (`acceso()`, `quandoCambia`) e ciò che il server dice (un aiutante gira col suo cursore). Di serie spento: il server
     parte prima della pagina, quindi col cursore dell'aiutante. */
  let statoAcceso = false; let aiutanteConCursore = false; const conIlCursore = new Set(); // i figli che hanno detto «il mio aiutante ha il suo cursore»
  let base = null; let generazione = null; let caricata = null;
  let ascolta = false; let chiuso = false; let timer = null; let ultimoRipiego = -Infinity; let avvisata = false;
  /** Protezione dalle catture rifiutata su uno schermo: il segno resta spento per tutto l'avvio, su tutti gli schermi (la bolla dice «assente»). */
  let rifiutata = false;
  /** Che cosa dire alla bolla, una volta per avvio: Windows vecchio, o la protezione rifiutata. */
  let assente = vecchio ? MESSAGGIO_ASSENTE : null;
  /* Giro 4 della bolla (controllore CU, 13/11): la pagina del segno è mancata su uno schermo (HTTP diverso da 200, caricamento della cornice principale fallito,
     processo della pagina morto, mai pronta in `msPaginaPronta`). Il segno non si vede: spento per tutto l'avvio su tutti gli schermi, come con la protezione
     rifiutata, e `acceso()` falso. Prima restava vero: il server teneva l'aiutante con `--no-overlay` e sullo schermo non c'era nessun cursore. */
  let paginaMancata = false;
  let timerPronta = null; let tentativo = 0;

  /**
   * Giro 5 della bolla: lo stato si ricalcola a OGNI cambio (battito, battito perso, pagina, schermi, protezione, chiusura, aiutante). Acceso = acceso di serie,
   * Windows 2004 o dopo, protezione tenuta, pagina mai mancata, guscio aperto, e OGNI schermo con la sua pagina arrivata con 200 che batte. Le finestre si
   * mostrano solo se in più nessun aiutante gira col suo cursore (mai due cursori); si nascondono PRIMA di dirlo al server. Il server lo sa a ogni cambio,
   * nei due versi: spento ⇒ l'aiutante riprende il suo cursore al confine del passo; acceso ⇒ il prossimo aiutante parte senza.
   */
  function ricalcola() {
    const ora = accesa === true && !vecchio && !fuoriWindows && !rifiutata && !paginaMancata && !chiuso
      && voci.length > 0 && voci.every((v) => !v.finestra.isDestroyed() && v.pronta && v.battito);
    const mostra = ora && !aiutanteConCursore;
    for (const v of voci) {
      if (v.finestra.isDestroyed()) continue;
      if (mostra && !v.mostrata) { v.mostrata = true; v.finestra.showInactive(); } else if (!mostra && v.mostrata) { v.mostrata = false; v.finestra.hide(); }
    }
    if (ora === statoAcceso) return;
    statoAcceso = ora;
    quandoCambia(ora);
  }

  /** Il battito di una pagina (dopo il suo disegno): vale solo da una pagina arrivata con 200, finché il guscio è aperto. Ogni battito rinnova il termine.
      Pagina mancata e protezione rifiutata non servono qui: `ricalcola` le tiene spente comunque, e le loro finestre si chiudono. */
  function batte(voce) {
    if (!voce.pronta || voce.finestra.isDestroyed() || chiuso) return;
    voce.battito = true; voce.battuta = true;
    clearTimeout(voce.timerBattito);
    voce.timerBattito = setTimeout(() => {
      voce.timerBattito = null;
      if (!voce.battito || chiuso) return;
      perdeIlBattito(voce, `Segno: la pagina non batte da ${msSenzaBattito} ms; il cursore di TALOS si spegne, torna quello dell'aiutante.`);
    }, msSenzaBattito);
    voce.timerBattito.unref?.();
    ricalcola();
  }

  /** La pagina è ferma (nessun battito nel termine, o Electron la dice `unresponsive`): spento finché non batte di nuovo. Non per sempre: una pagina che si
      sblocca e batte riaccende il segno, che si mostra solo dopo che l'aiutante col suo cursore si è chiuso. */
  function perdeIlBattito(voce, riga) {
    clearTimeout(voce.timerBattito); voce.timerBattito = null;
    if (!voce.battito) return;
    voce.battito = false;
    registro(riga);
    ricalcola();
  }

  /** Una riga e un messaggio alla bolla alla prima volta; dopo, la finestra si chiude e basta. */
  function rifiuta(finestra, riga) {
    finestra.destroy();
    if (rifiutata) return null;
    rifiutata = true;
    ricalcola(); // da `aggiorna` o da un cambio di schermi: col segno acceso il server lo sa e riaccende il cursore dell'aiutante
    registro(riga);
    assente ??= MESSAGGIO_SENZA_PROTEZIONE; bollaPronta();
    return null;
  }

  /** La pagina del segno è mancata: si nasconde tutto SUBITO, il server lo sa una volta (l'aiutante riaccende il suo cursore), le finestre si chiudono fuori
      dal gestore dell'evento di Electron. Una pagina buona arrivata dopo non si mostra più: il cursore dell'aiutante è già tornato, sarebbero due. */
  function mancaLaPagina(riga) {
    if (paginaMancata || chiuso) return;
    paginaMancata = true;
    clearTimeout(timerPronta); timerPronta = null;
    registro(riga);
    ricalcola(); // nasconde SUBITO ogni finestra mostrata, prima di dirlo al server (giro 5: lo fa `ricalcola`, una volta sola per tutti i casi)
    setImmediate(distruggi);
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
    const voce = { finestra, schermo, pronta: false, battito: false, battuta: false, mostrata: false, timerBattito: null };
    const wc = finestra.webContents;
    /* giro 5: la pagina bloccata (Electron, dopo circa 5 s senza risposta del renderer; Hermes `hud-close.ts:7-10`, «nobody acts on»): spento subito, senza
       aspettare il termine del battito. `responsive` da solo non lo riaccende: serve il battito, cioè il disegno */
    finestra.on('unresponsive', () => {
      if (finestra.isDestroyed()) return;
      perdeIlBattito(voce, `Segno: la pagina non risponde; il cursore di TALOS si spegne, torna quello dell'aiutante.`);
    });
    /* lo zoom di Chromium va per origine: «Ingrandisci» nella principale (stessa 127.0.0.1) sposterebbe cursore e bordo. Isolato, e a 1 a ogni caricamento */
    wc.setZoomMode('isolated');
    wc.on('did-navigate', (_evento, _indirizzo, codice) => {
      voce.pronta = codice === 200;
      if (!voce.pronta && !finestra.isDestroyed()) { finestra.hide(); mancaLaPagina(`Segno: la pagina non c'è (HTTP ${codice}); il cursore di TALOS resta spento, torna quello dell'aiutante.`); }
    });
    wc.on('did-fail-load', (_evento, codice, descrizione, _indirizzo, cornicePrincipale) => {
      if (cornicePrincipale !== true || codice === ERR_ABORTED) return; // una cornice interna, o una navigazione sostituita da un'altra
      voce.pronta = false;
      if (!finestra.isDestroyed()) { finestra.hide(); mancaLaPagina(`Segno: caricamento non riuscito (${descrizione || codice}); il cursore di TALOS resta spento, torna quello dell'aiutante.`); }
    });
    /* il processo della pagina muore: il segno sparisce dallo schermo senza altri eventi (Electron `render-process-gone`; `clean-exit` è un'uscita normale) */
    wc.on('render-process-gone', (_evento, dettagli) => {
      if (finestra.isDestroyed() || dettagli?.reason === 'clean-exit') return;
      voce.pronta = false;
      mancaLaPagina(`Segno: la pagina si è fermata (${dettagli?.reason ?? '?'}); il cursore di TALOS resta spento, torna quello dell'aiutante.`);
    });
    /* a ogni caricamento lo zoom torna a 1. Giro 5: la finestra NON si mostra qui (un caricamento finito non vuol dire disegnato, e `ready-to-show` si può
       perdere: Hermes `main.ts:12294-12300` del 22/10): si mostra al primo battito di ogni schermo, in `ricalcola` */
    wc.on('did-finish-load', () => {
      if (finestra.isDestroyed()) return;
      wc.setZoomFactor(1);
    });
    wc.setWindowOpenHandler(({ url }) => {
      if (url === INDIRIZZO_BATTITO) batte(voce);
      else if (url === INDIRIZZO_RIPIEGO) setImmediate(ripiego);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (evento, destinazione) => { if (!stessaOrigine(destinazione, base)) evento.preventDefault(); });
    wc.on('will-redirect', (evento) => { if (!stessaOrigine(evento.url, base)) evento.preventDefault(); });
    return voce;
  }

  function distruggi() {
    for (const v of voci) { clearTimeout(v.timerBattito); v.timerBattito = null; if (!v.finestra.isDestroyed()) v.finestra.destroy(); }
    voci = [];
  }

  function costruisci() {
    distruggi();
    if (rifiutata || paginaMancata) { ricalcola(); return; }
    voci = screen.getAllDisplays().map(crea).filter(Boolean);
    caricata = null;
    /* uno schermo rifiutato spegne anche gli altri: mai un cursore visibile mentre la bolla dice «assente» */
    if (rifiutata) distruggi();
    ricalcola(); // finestre nuove, nessun battito ancora: spento finché non battono (giro 5)
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
    if (!accesa || vecchio || fuoriWindows || chiuso || rifiutata || paginaMancata) return false;
    indirizzoSegno(nuovaBase, { fx: 0, fy: 0, fw: 1, fh: 1, scala: 1 }); // un indirizzo non locale non apre niente, nemmeno le finestre
    base = nuovaBase; generazione = nuovaGenerazione;
    if (!ascolta) { ascolta = true; for (const e of EVENTI_SCHERMO) screen.on(e, suSchermo); }
    if (voci.length === 0 || voci.some(v => v.finestra.isDestroyed())) costruisci();
    if (rifiutata) return false;
    if (caricata === nuovaGenerazione) return false;
    /* giro 5: la pagina nuova non ha ancora battuto (la vecchia non c'è più): spento finché non batte, e il termine vecchio non la giudica */
    const caricando = voci.map((v) => {
      v.pronta = false; v.battito = false; v.battuta = false; clearTimeout(v.timerBattito); v.timerBattito = null;
      return v.finestra.loadURL(indirizzoSegno(nuovaBase, v.schermo));
    });
    ricalcola();
    /* la pagina mai pronta: scaduto il tempo, una finestra viva di QUESTO caricamento la cui pagina non ha mai battuto spegne il segno. Un caricamento dopo
       (server nuovo, cambio di schermi) prende il suo tempo e questo controllo non vale più. Giro 5: pronta = ha battuto, non solo arrivata con 200. */
    const mio = ++tentativo;
    clearTimeout(timerPronta);
    timerPronta = setTimeout(() => {
      timerPronta = null;
      if (mio !== tentativo || chiuso) return;
      if (voci.some((v) => !v.finestra.isDestroyed() && !v.battuta)) mancaLaPagina(`Segno: la pagina non ha battuto entro ${msPaginaPronta} ms (manca, si è rotta o non disegna); il cursore di TALOS resta spento, torna quello dell'aiutante.`);
    }, msPaginaPronta);
    timerPronta.unref?.();
    await Promise.all(caricando);
    /* un cambio di schermi durante il caricamento rifà `caricata = null` e ricarica col suo timer: segnarla qui non salta niente */
    caricata = nuovaGenerazione;
    return true;
  }

  /** Il cursore vero, in pixel fisici globali, a tutte le pagine pronte. Al più ogni `intervalloRipiego` ms: tutte le pagine chiedono allo stesso evento. */
  function ripiego() {
    if (!accesa || vecchio || fuoriWindows || chiuso || rifiutata || paginaMancata) return false;
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

  /** Giudice v1790: il segno si vede davvero (acceso, Windows 2004 o dopo, protezione tenuta, guscio aperto). Solo allora il server spegne il cursore dell'aiutante.
      Giro 4: e la sua pagina non è mancata. Giro 5: e OGNI schermo ha battuto, cioè disegna; prima del primo battito è falso (il server parte col cursore
      dell'aiutante). È lo stato che `ricalcola` ha detto al server: le due cose non si separano mai. */
  function acceso() {
    return statoAcceso;
  }

  /** Giro 5: un server dice se un suo aiutante gira col suo cursore (`{ tipo: 'segno-aiutante', conCursore }`, `main.mjs`, `chi` = il figlio). Finché UNO
      qualunque sì, il segno non si mostra; un figlio uscito si dice con `false` (il suo aiutante esce con lui). Solo il vero `true` conta come cursore. */
  function aiutante(conCursore, chi = AIUTANTE_SOLO) {
    if (conCursore === true) conIlCursore.add(chi); else conIlCursore.delete(chi);
    aiutanteConCursore = conIlCursore.size > 0;
    ricalcola();
  }

  function chiudi() {
    chiuso = true;
    ricalcola(); // si nasconde, e se era acceso il server lo sa una volta
    clearTimeout(timer); timer = null;
    clearTimeout(timerPronta); timerPronta = null;
    if (ascolta) { for (const e of EVENTI_SCHERMO) screen.removeListener(e, suSchermo); ascolta = false; }
    distruggi();
  }

  return { aggiorna, ripiego, bollaPronta, chiudi, acceso, aiutante };
}
