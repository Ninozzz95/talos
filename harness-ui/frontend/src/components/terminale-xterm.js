/*
 * terminale-xterm.js — il CORPO del terminale: la xterm.js di una scheda, i suoi appunti, il suo
 * menu contestuale e i frame del ponte verso la PTY.
 *
 * ⭐⭐⭐ Nasce il 16/09/2026 (P0/A punto 3) da un difetto dell'owner: «nel terminale non si copia e
 * non si incolla». Root cause misurata nel codice, non dedotta — nel cablaggio che stava dentro
 * `legacy/app.js` non c'era NESSUNA chiamata a `attachCustomKeyEventHandler`, nessun addon degli
 * appunti, nessun `contextmenu` sul corpo e nessun `navigator.clipboard`: Ctrl+C finiva dritto in
 * `onData` e partiva alla PTY come `^C`, e Ctrl+V dipendeva dal caso.
 *
 * ⛔ Perché un componente e non due righe in più nel monolite: è il pattern del repo
 * (`components/*.js` con `{document}` iniettato) e soprattutto è l'unico modo per PROVARE la
 * decisione sui tasti. Tutto ciò che decide sta in funzioni pure — `azioneAppunti`,
 * `vociMenuTerminale` — e quello che tocca il DOM riceve `documento`, `Terminal`, gli addon e gli
 * appunti dall'esterno: la suite monta un terminale finto e verifica anche il verso contrario.
 *
 * ── Ricerca 16/09/2026, alla fonte ──────────────────────────────────────────────────────────────
 *  · xterm.js, API `Terminal` (xtermjs.org/docs/api/terminal/classes/terminal):
 *      `attachCustomKeyEventHandler` «is run before keys are processed, giving consumers of
 *      xterm.js ultimate control as to what keys should be processed by the terminal and what keys
 *      should not» — torna `false` per dire «questo tasto è mio»;
 *      `paste(data)` «writes text to the terminal, performing the necessary transformations for
 *      pasted text» (è lui che sa il bracketed paste mode: non si scrive nella PTY a mano);
 *      `getSelection()` «useful for implementing copy behavior outside of xterm.js»,
 *      `hasSelection()`, `selectAll()`, `clear()`.
 *  · xterm.js, `ITerminalOptions`: `rightClickSelectsWord` «whether to select the word under the
 *      cursor on right click» — acceso qui, così il tasto destro ha sempre qualcosa da copiare.
 *  · VS Code, docs «Terminal Basics» e microsoft/vscode #147339: Ctrl+C copia SOLO quando c'è una
 *      selezione, altrimenti manda l'interruzione; su Windows valgono anche Ctrl+Insert (copia) e
 *      Shift+Insert (incolla); Ctrl+Shift+C / Ctrl+Shift+V sono le forme che non litigano con la
 *      shell. È la convenzione che seguiamo, dichiarata invece che spacciata per invenzione.
 *
 * ⛔ NON si usa `@xterm/addon-clipboard`: serve a OSC 52, cioè a far scrivere negli appunti un
 *   programma remoto (tmux, vim), e non è ciò che manca qui. Due misure lo escludono da questa
 *   corsia: dipende da `js-base64` (registro npm, letto il 16/09/2026 — sarebbe una seconda libreria
 *   da vendorizzare) e va caricato con un `<script>` in `index.template.html` + `mockup-to-template.mjs`,
 *   fuori dai file di questa lavorazione. Resta una riga aperta, dichiarata nel rapporto.
 */

import { apriMenuContestuale, creaMenuContestuale } from './terminale.js';
import { t } from './lingua.js';

/* ═════════════════════════ i frame del ponte verso la PTY ═════════════════════════ */

/** Dati grezzi da/verso la shell. */
export const TIPO_FRAME_DATI = 0;
/** Messaggi di controllo (resize, aggancio, uscita) in JSON. */
export const TIPO_FRAME_CONTROLLO = 1;

/** Un frame client: primo byte il tipo, il resto il testo in UTF-8. */
export function codificaFrameClient(tipo, testo) {
  const corpo = new TextEncoder().encode(testo);
  const frame = new Uint8Array(corpo.length + 1);
  frame[0] = tipo;
  frame.set(corpo, 1);
  return frame;
}

/**
 * Il frame che arriva dal server. Torna `null` per un frame vuoto — che non è «dati vuoti»:
 * è un frame che non dice niente, e confonderli è come leggere un tipo a caso.
 */
export function decodificaFrameServer(buffer) {
  const byte = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (byte.length === 0) return null;
  return { tipo: byte[0], corpo: new TextDecoder().decode(byte.subarray(1)) };
}

/* ═════════════════════════ le parole a schermo ═════════════════════════ */

/** ⛔ Nomi umani, mai tecnici: a schermo non compaiono «clipboard», «paste» né «xterm». */
export const TESTI_APPUNTI = Object.freeze({
  titoloMenu: 'Terminale',
  copia: 'Copia',
  incolla: 'Incolla',
  selezionaTutto: 'Seleziona tutto',
  pulisci: 'Pulisci lo schermo',
  copiaNegataTitolo: 'Non ho potuto copiare',
  copiaNegataTesto: 'Gli appunti di sistema non sono raggiungibili da questa finestra: seleziona il testo e usa il menu del tasto destro del sistema.',
  incollaNegataTitolo: 'Non ho potuto incollare',
  incollaNegataTesto: 'Gli appunti di sistema non sono raggiungibili da questa finestra: dai il permesso agli appunti, oppure incolla con il tasto destro del sistema.',
});

/* ═════════════════════════ la decisione sui tasti (pura) ═════════════════════════ */

/**
 * Cosa fare di un tasto premuto dentro il terminale.
 *
 * ⛔ Il caso che comanda è il NEGATIVO: Ctrl+C **senza selezione** torna `null`, cioè resta della
 *   shell e diventa `^C`. Chi preme Ctrl+C per fermare un comando deve fermarlo — sempre, anche il
 *   giorno in cui questo file viene riscritto. È la convenzione di VS Code, e qui è un test.
 *
 * @param {KeyboardEvent|null} evento
 * @param {{haSelezione?:boolean, apple?:boolean}} contesto
 * @returns {'copia'|'incolla'|null} `null` = non è nostro, lo processa il terminale
 */
export function azioneAppunti(evento, { haSelezione = false, apple = false } = {}) {
  if (!evento) return null;
  if (evento.type && evento.type !== 'keydown') return null; // si decide una volta sola, sul keydown
  if (evento.altKey) return null;                            // con Alt è un altro tasto, non il nostro
  const mod = apple ? evento.metaKey === true : evento.ctrlKey === true;
  const tasto = String(evento.key ?? '');

  /* Le due forme di Windows che passano dal tasto Insert (VS Code le tiene, e la gente le usa). */
  if (tasto === 'Insert') {
    if (mod && !evento.shiftKey) return haSelezione ? 'copia' : null;
    if (evento.shiftKey && !mod) return 'incolla';
    return null;
  }

  if (!mod) return null;
  const lettera = tasto.toLowerCase();
  /* ⛔ Copiare il vuoto non è copiare: senza selezione né Ctrl+C né Ctrl+Shift+C fanno niente di
     nostro — il primo scende alla shell, il secondo non è un comando di shell e cade lì. */
  if (lettera === 'c') return haSelezione ? 'copia' : null;
  if (lettera === 'v') return 'incolla'; // vale sia Ctrl+V sia Ctrl+Shift+V
  return null;
}

/**
 * Le voci del menu del corpo, con lo stato giusto.
 * ⛔ «Copia» spenta quando non c'è selezione: un menu si giudica da ciò che dice quando NON si può
 *   fare una cosa — una voce accesa che non fa niente è peggio di una voce spenta.
 * @returns {Array<[string, Function, boolean]>} come le vuole `apriMenuContestuale`
 */
export function vociMenuTerminale(term, { copia, incolla }) {
  return [
    [t(TESTI_APPUNTI.copia), () => copia(), Boolean(term?.hasSelection?.())],
    [t(TESTI_APPUNTI.incolla), () => incolla(), true],
    [t(TESTI_APPUNTI.selezionaTutto), () => term?.selectAll?.(), true],
    [t(TESTI_APPUNTI.pulisci), () => term?.clear?.(), true],
  ];
}

/* ═════════════════════════ il montaggio della xterm ═════════════════════════ */

/**
 * Monta una xterm.js dentro il corpo del terminale e la tiene misurata.
 *
 * ⛔ Si monta SOLO quando si vede: xterm.js non sa misurarsi dentro un elemento nascosto
 *   (xterm.js #3029, #494). Questa funzione non lo decide — lo decide chi la chiama; qui c'è la
 *   seconda difesa, il `ResizeObserver` che ignora il montaggio nascosto.
 * ⛔ Il resize alla PTY parte SOLO se cols/rows sono davvero cambiati: `fit()` gira a ogni
 *   movimento, la PTY no.
 *
 * @returns {{term:object, fit:object, mount:HTMLElement, osservatore:object, distruggi:Function}|null}
 */
export function creaTerminaleXterm({
  documento = globalThis.document,
  contenitore,
  Terminal,
  FitAddon,
  id,
  tema,
  fontFamily = 'Menlo, Consolas, monospace',
  fontSize = 13,
  scrollback = 5000,
  suDati = () => {},
  suMisura = () => {},
  Osservatore = globalThis.ResizeObserver,
} = {}) {
  if (!contenitore || !Terminal || !FitAddon) return null;

  const mount = documento.createElement('div');
  mount.className = 'talos-terminal__mount';
  mount.dataset.terminaleMount = id;
  contenitore.append(mount);

  const term = new Terminal({
    fontFamily,
    fontSize,
    cursorBlink: true,
    scrollback,
    theme: tema,
    /* ⛔ 16/09 — il tasto destro seleziona la parola sotto il cursore (ITerminalOptions):
       senza questa, il menu contestuale si apriva quasi sempre con «Copia» spenta, cioè inutile. */
    rightClickSelectsWord: true,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(mount);
  fit.fit();
  term.onData((dati) => suDati(dati));

  const osservatore = new Osservatore(() => {
    if (mount.hidden) return;
    const primaCols = term.cols;
    const primaRows = term.rows;
    fit.fit();
    if (term.cols !== primaCols || term.rows !== primaRows) suMisura({ cols: term.cols, rows: term.rows });
  });
  osservatore.observe(mount);

  return {
    term,
    fit,
    mount,
    osservatore,
    distruggi() {
      osservatore.disconnect();
      try { term.dispose(); } catch { /* già smontata */ }
      mount.remove();
    },
  };
}

/* ═════════════════════════ copia, incolla e menu del corpo ═════════════════════════ */

/**
 * Dà al terminale gli appunti: i tasti, il menu del tasto destro, e un avviso onesto quando il
 * permesso manca. Torna la funzione che scollega tutto.
 *
 * @param {object} term la xterm.js montata
 * @param {object} opzioni
 * @param {HTMLElement} opzioni.ospite il nodo che riceve il tasto destro (il montaggio della scheda)
 * @param {HTMLElement} opzioni.radiceMenu dove vive il menu (la stessa radice degli altri menu)
 * @param {object} opzioni.appunti `navigator.clipboard`, o un doppio nei test
 * @param {Function} opzioni.avvisa (titolo, testo) — quando non si può fare, si DICE
 */
export function collegaAppunti(term, {
  documento = globalThis.document,
  ospite,
  radiceMenu = documento.body,
  appunti = globalThis.navigator?.clipboard,
  apple = false,
  avvisa = () => {},
  finestra = globalThis,
} = {}) {
  if (!term || !ospite) return () => {};
  const menu = creaMenuContestuale(radiceMenu, { id: 'menuTerminale', etichetta: TESTI_APPUNTI.titoloMenu });
  const chiudiMenu = () => { menu.hidden = true; menu.replaceChildren(); };

  async function copia() {
    const testo = term.getSelection?.() ?? '';
    if (!testo) return;
    try {
      await appunti?.writeText(testo);
    } catch {
      /* ⛔ Mai il silenzio: un copia che non copia e non lo dice è peggio di un copia che manca. */
      avvisa(t(TESTI_APPUNTI.copiaNegataTitolo), t(TESTI_APPUNTI.copiaNegataTesto));
    }
  }

  async function incolla() {
    let testo = '';
    try {
      testo = (await appunti?.readText()) ?? '';
    } catch {
      avvisa(t(TESTI_APPUNTI.incollaNegataTitolo), t(TESTI_APPUNTI.incollaNegataTesto));
      return;
    }
    if (!testo) return;
    /* ⛔ `term.paste`, non `onData` a mano: è lui che fa le trasformazioni del bracketed paste mode
       (API xterm.js). Scrivere il testo grezzo nella PTY incolla senza `\x1b[200~` e la shell lo
       esegue riga per riga — cioè un incolla che LANCIA i comandi invece di scriverli. */
    term.paste(testo);
  }

  /* I tasti: la decisione è pura, qui si esegue soltanto. `false` = «questo tasto è mio». */
  term.attachCustomKeyEventHandler((evento) => {
    const azione = azioneAppunti(evento, { haSelezione: Boolean(term.hasSelection?.()), apple });
    if (!azione) return true;
    evento.preventDefault?.();
    if (azione === 'copia') void copia(); else void incolla();
    return false;
  });

  const suTastoDestro = (evento) => {
    evento.preventDefault?.();
    apriMenuContestuale(menu, {
      titolo: t(TESTI_APPUNTI.titoloMenu),
      voci: vociMenuTerminale(term, { copia, incolla }),
      x: evento.clientX ?? 0,
      y: evento.clientY ?? 0,
      chiudi: chiudiMenu,
      finestra,
    });
  };
  ospite.addEventListener('contextmenu', suTastoDestro);

  /*
   * ⛔ Un clic fuori e Esc chiudono il menu — e si registrano UNA VOLTA SOLA per radice, non una
   *   per scheda: con otto schede sarebbero otto ascoltatori che fanno tutti la stessa cosa, e il
   *   progetto ha già pagato una volta il prezzo dei gestori sommati (il doppio toggle della pill).
   */
  if (!radiceMenu.__talosMenuTerminaleCollegato) {
    radiceMenu.__talosMenuTerminaleCollegato = true;
    radiceMenu.addEventListener('pointerdown', (evento) => {
      if (!menu.hidden && !menu.contains?.(evento.target)) chiudiMenu();
    });
    radiceMenu.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && !menu.hidden) { chiudiMenu(); evento.stopPropagation?.(); }
    });
  }

  return function scollega() {
    ospite.removeEventListener('contextmenu', suTastoDestro);
    chiudiMenu();
  };
}
