import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TESTI_APPUNTI,
  TIPO_FRAME_CONTROLLO,
  TIPO_FRAME_DATI,
  azioneAppunti,
  codificaFrameClient,
  collegaAppunti,
  creaTerminaleXterm,
  decodificaFrameServer,
  vociMenuTerminale,
} from '../../src/components/terminale-xterm.js';

/*
 * ⭐⭐⭐ P0/A punto 3 — 16/09/2026. «Nel terminale non si copia e non si incolla.»
 *
 * Root cause misurata nel codice, non dedotta: il cablaggio xterm.js in `legacy/app.js` non
 * chiamava MAI `attachCustomKeyEventHandler`, non caricava nessun addon degli appunti, non
 * registrava nessun `contextmenu` sul corpo del terminale e non toccava mai `navigator.clipboard`.
 * Ctrl+C finiva dritto in `onData` e partiva alla PTY come `^C`; Ctrl+V dipendeva dal caso.
 *
 * Ricerca 16/09/2026:
 *  · xterm.js, API `Terminal`: `attachCustomKeyEventHandler` «is run before keys are processed,
 *    giving consumers ultimate control as to what keys should be processed by the terminal»;
 *    `paste(data)` «performs the necessary transformations for pasted text»; `getSelection()`
 *    «useful for implementing copy behavior outside of xterm.js»; `hasSelection()`; `selectAll()`;
 *    `clear()`; opzione `rightClickSelectsWord`.
 *  · VS Code (docs «Terminal Basics» + microsoft/vscode #147339): Ctrl+C copia SOLO quando c'è una
 *    selezione, altrimenti manda SIGINT; su Windows valgono anche Ctrl+Insert (copia) e
 *    Shift+Insert (incolla); Ctrl+Shift+C / Ctrl+Shift+V sono le forme che non litigano con la shell.
 *
 * ⛔ La decisione su un tasto è una FUNZIONE PURA (`azioneAppunti`): così si può provare la tabella
 *   intera — e soprattutto il verso contrario, cioè che senza selezione Ctrl+C NON copia.
 */

/* ───────────────── fakes: le unit di questo repo non caricano un DOM ───────────────── */

function nodoFinto(tag = 'div') {
  const nodo = {
    tag,
    className: '',
    id: '',
    dataset: {},
    style: {},
    hidden: false,
    disabled: false,
    type: '',
    textContent: '',
    figli: [],
    ascoltatori: new Map(),
    offsetWidth: 200,
    offsetHeight: 120,
    ownerDocument: null,
    append(...x) { this.figli.push(...x); },
    replaceChildren(...x) { this.figli = x; },
    setAttribute(nome, valore) { (this.attributi ??= {})[nome] = String(valore); },
    getAttribute(nome) { return this.attributi?.[nome] ?? null; },
    addEventListener(tipo, fn) { this.ascoltatori.set(tipo, [...(this.ascoltatori.get(tipo) ?? []), fn]); },
    removeEventListener(tipo, fn) { this.ascoltatori.set(tipo, (this.ascoltatori.get(tipo) ?? []).filter((f) => f !== fn)); },
    querySelector(sel) {
      const tutti = this.figli.flatMap((f) => (f?.tag ? [f, ...(f.figli ?? [])] : []));
      if (sel.startsWith('#')) return tutti.find((f) => f.id === sel.slice(1)) ?? null;
      if (sel.startsWith('[role=menuitem]')) return tutti.find((f) => f.attributi?.role === 'menuitem' && !f.disabled) ?? null;
      return null;
    },
    scatena(tipo, evento = {}) {
      for (const fn of this.ascoltatori.get(tipo) ?? []) fn({ preventDefault() {}, stopPropagation() {}, ...evento });
    },
    focus() { this.aFuoco = true; },
    remove() { this.rimosso = true; },
  };
  return nodo;
}

function documentoFinto() {
  const doc = { creati: [], createElement(tag) { const n = nodoFinto(tag); n.ownerDocument = doc; doc.creati.push(n); return n; } };
  return doc;
}

class TerminalFinto {
  constructor(opzioni) {
    this.opzioni = opzioni;
    this.addons = [];
    this.incollate = [];
    this.selezione = '';
    this.pulito = 0;
    this.tuttoSelezionato = 0;
    this.cols = 80;
    this.rows = 24;
  }

  open(mount) { this.mount = mount; this.textarea = { focus() {} }; }
  /* come l'API vera: l'addon riceve il terminale su cui lavora (`activate(terminal)`) */
  loadAddon(addon) { this.addons.push(addon); addon.term = this; }
  onData(fn) { this.suDati = fn; return { dispose() {} }; }
  attachCustomKeyEventHandler(fn) { this.gestoreTasti = fn; }
  hasSelection() { return this.selezione.length > 0; }
  getSelection() { return this.selezione; }
  selectAll() { this.tuttoSelezionato += 1; this.selezione = 'tutto'; }
  clear() { this.pulito += 1; }
  paste(testo) { this.incollate.push(testo); }
  focus() { this.aFuoco = true; }
  dispose() { this.disposto = true; }
}

/* `fit()` è ciò che CAMBIA cols/rows: il finto lo fa davvero, altrimenti il test non potrebbe
   distinguere «misurato e uguale» da «mai misurato» — e passerebbe per costruzione. */
const FitFinto = {
  FitAddon: class {
    fit() {
      this.chiamate = (this.chiamate ?? 0) + 1;
      if (this.prossimeCols !== undefined && this.term) this.term.cols = this.prossimeCols;
    }
  },
};

function osservatoreFinto() {
  const registrati = [];
  class Finto {
    constructor(fn) { this.fn = fn; registrati.push(this); }
    observe(nodo) { this.nodo = nodo; }
    disconnect() { this.spento = true; }
  }
  return { Finto, registrati };
}

/** Un evento tastiera finto: solo i campi che la decisione guarda. */
const tasto = (extra) => ({ type: 'keydown', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, key: '', preventDefault() { this.prevenuto = true; }, ...extra });

/* ───────────────────────────────── la decisione ───────────────────────────────── */

test('P0A3-CTRL-C-SENZA-SELEZIONE-VA-ALLA-SHELL: è il caso che non si deve rompere', () => {
  // ⛔ Questo è IL vincolo: chi preme Ctrl+C per fermare un comando deve fermarlo, sempre.
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, key: 'c' }), { haSelezione: false }), null);
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, key: 'C' }), { haSelezione: false }), null);
  // e con una selezione copia, come in VS Code
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, key: 'c' }), { haSelezione: true }), 'copia');
});

test('P0A3-TABELLA-DEI-TASTI: copia e incolla nelle forme che Windows e VS Code usano davvero', () => {
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, shiftKey: true, key: 'C' }), { haSelezione: true }), 'copia');
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, key: 'Insert' }), { haSelezione: true }), 'copia');
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, key: 'v' }), { haSelezione: false }), 'incolla');
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, shiftKey: true, key: 'V' }), { haSelezione: false }), 'incolla');
  assert.equal(azioneAppunti(tasto({ shiftKey: true, key: 'Insert' }), { haSelezione: false }), 'incolla');
  // su Apple comanda ⌘, non Ctrl
  assert.equal(azioneAppunti(tasto({ metaKey: true, key: 'c' }), { haSelezione: true, apple: true }), 'copia');
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, key: 'c' }), { haSelezione: true, apple: true }), null);
});

test('P0A3-AL-CONTRARIO: tutto il resto resta della shell', () => {
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, shiftKey: true, key: 'C' }), { haSelezione: false }), null, 'copiare il vuoto non è copiare');
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, key: 'Insert' }), { haSelezione: false }), null);
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, altKey: true, key: 'v' }), {}), null, 'con Alt è un altro tasto');
  assert.equal(azioneAppunti(tasto({ key: 'v' }), {}), null, 'senza modificatore si scrive, non si incolla');
  assert.equal(azioneAppunti(tasto({ ctrlKey: true, key: 'a' }), { haSelezione: true }), null, 'Ctrl+A in bash è «inizio riga»: non si ruba');
  assert.equal(azioneAppunti(tasto({ type: 'keyup', ctrlKey: true, key: 'v' }), {}), null, 'si decide sul keydown, una volta sola');
  assert.equal(azioneAppunti(null, {}), null);
});

/* ───────────────────────────────── i frame del ponte ───────────────────────────────── */

test('P0A3-FRAME: il primo byte è il tipo, il resto è testo UTF-8, e il giro completo torna identico', () => {
  const frame = codificaFrameClient(TIPO_FRAME_DATI, 'ls -la — àèì');
  assert.equal(frame[0], TIPO_FRAME_DATI);
  assert.deepEqual(decodificaFrameServer(frame), { tipo: TIPO_FRAME_DATI, corpo: 'ls -la — àèì' });
  const controllo = codificaFrameClient(TIPO_FRAME_CONTROLLO, '{"tipo":"resize"}');
  assert.equal(controllo[0], TIPO_FRAME_CONTROLLO);
  // AL CONTRARIO: un frame vuoto non è un frame
  assert.equal(decodificaFrameServer(new Uint8Array(0)), null);
});

/* ───────────────────────────────── il montaggio ───────────────────────────────── */

test('P0A3-MONTA: una xterm per scheda, con il tasto destro che seleziona la parola', () => {
  const documento = documentoFinto();
  const contenitore = nodoFinto('div');
  const { Finto, registrati } = osservatoreFinto();
  const dati = [];
  const misure = [];
  const pezzi = creaTerminaleXterm({
    documento,
    contenitore,
    Terminal: TerminalFinto,
    FitAddon: FitFinto,
    id: 'scheda-1',
    tema: { background: '#000' },
    fontFamily: 'JetBrains Mono',
    suDati: (d) => dati.push(d),
    suMisura: (m) => misure.push(m),
    Osservatore: Finto,
  });
  assert.equal(pezzi.mount.className, 'talos-terminal__mount');
  assert.equal(pezzi.mount.dataset.terminaleMount, 'scheda-1');
  assert.equal(contenitore.figli.length, 1);
  assert.equal(pezzi.term.opzioni.rightClickSelectsWord, true, 'il tasto destro deve selezionare la parola (ITerminalOptions)');
  assert.equal(pezzi.term.opzioni.fontFamily, 'JetBrains Mono');
  assert.equal(pezzi.term.mount, pezzi.mount);
  pezzi.term.suDati('ciao');
  assert.deepEqual(dati, ['ciao']);
  // il ridimensionamento parla alla PTY solo quando cambiano DAVVERO le colonne
  assert.equal(registrati.length, 1);
  registrati[0].fn();
  assert.deepEqual(misure, [], 'stesse cols/rows dopo il fit: nessun resize inutile alla PTY');
  assert.equal(pezzi.fit.chiamate, 2, 'il fit gira comunque: è il RESIZE alla PTY che non deve partire');
  pezzi.fit.prossimeCols = 120;
  registrati[0].fn();
  assert.deepEqual(misure, [{ cols: 120, rows: 24 }]);
  // AL CONTRARIO: se il montaggio è nascosto non si misura niente (xterm.js #3029)
  pezzi.fit.prossimeCols = 200;
  pezzi.mount.hidden = true;
  registrati[0].fn();
  assert.deepEqual(misure, [{ cols: 120, rows: 24 }], 'nascosto: nessuna misura, nemmeno un fit');
  pezzi.mount.hidden = false;
  // AL CONTRARIO: se il contenitore non c'è, non si monta niente e lo si dice
  assert.equal(creaTerminaleXterm({ documento, contenitore: null, Terminal: TerminalFinto, FitAddon: FitFinto, id: 'x' }), null);
});

/* ───────────────────────────────── copia e incolla ───────────────────────────────── */

function bancoAppunti({ testoNegli = 'incollato', negaLettura = false, negaScrittura = false } = {}) {
  const scritti = [];
  const avvisi = [];
  const documento = documentoFinto();
  const contenitore = nodoFinto('div');
  const radice = nodoFinto('div');
  radice.ownerDocument = documento;
  const pezzi = creaTerminaleXterm({
    documento, contenitore, Terminal: TerminalFinto, FitAddon: FitFinto, id: 'scheda-1',
    Osservatore: osservatoreFinto().Finto,
  });
  const scollega = collegaAppunti(pezzi.term, {
    documento,
    ospite: pezzi.mount,
    radiceMenu: radice,
    appunti: {
      writeText: async (t) => { if (negaScrittura) throw new Error('permesso negato'); scritti.push(t); },
      readText: async () => { if (negaLettura) throw new Error('permesso negato'); return testoNegli; },
    },
    avvisa: (titolo, testo) => avvisi.push({ titolo, testo }),
    finestra: { innerWidth: 1440, innerHeight: 900 },
  });
  return { ...pezzi, radice, scritti, avvisi, scollega };
}

test('P0A3-COPIA: Ctrl+Shift+C porta la selezione negli appunti e il tasto non arriva alla shell', async () => {
  const banco = bancoAppunti();
  banco.term.selezione = 'npm run build';
  const evento = tasto({ ctrlKey: true, shiftKey: true, key: 'C' });
  assert.equal(banco.term.gestoreTasti(evento), false, 'il tasto è nostro: xterm non deve processarlo');
  assert.equal(evento.prevenuto, true);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(banco.scritti, ['npm run build']);
  assert.deepEqual(banco.avvisi, []);
});

test('P0A3-INCOLLA: Ctrl+V legge gli appunti e passa da `paste`, che sa le trasformazioni del bracketed mode', async () => {
  const banco = bancoAppunti({ testoNegli: 'git status' });
  const evento = tasto({ ctrlKey: true, key: 'v' });
  assert.equal(banco.term.gestoreTasti(evento), false);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(banco.term.incollate, ['git status']);
});

test('P0A3-QUANDO-NON-SI-PUO-SI-DICE: permesso negato ⇒ un avviso, mai il silenzio', async () => {
  const banco = bancoAppunti({ negaLettura: true });
  banco.term.gestoreTasti(tasto({ ctrlKey: true, key: 'v' }));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(banco.term.incollate, []);
  assert.equal(banco.avvisi.length, 1);
  assert.ok(banco.avvisi[0].testo.length > 10, 'un avviso senza spiegazione è rumore');

  const altro = bancoAppunti({ negaScrittura: true });
  altro.term.selezione = 'x';
  altro.term.gestoreTasti(tasto({ ctrlKey: true, shiftKey: true, key: 'C' }));
  await new Promise((r) => setImmediate(r));
  assert.equal(altro.avvisi.length, 1);
});

test('P0A3-CTRL-C-PASSA: senza selezione il tasto torna alla shell (xterm lo processa e diventa ^C)', () => {
  const banco = bancoAppunti();
  banco.term.selezione = '';
  const evento = tasto({ ctrlKey: true, key: 'c' });
  assert.equal(banco.term.gestoreTasti(evento), true, 'xterm DEVE processarlo: è l’interruzione del comando');
  assert.equal(evento.prevenuto, undefined);
  assert.deepEqual(banco.scritti, []);
});

/* ───────────────────────────────── il menu del corpo ───────────────────────────────── */

test('P0A3-MENU: il tasto destro sul corpo apre Copia · Incolla · Seleziona tutto · Pulisci lo schermo', async () => {
  const banco = bancoAppunti({ testoNegli: 'echo ciao' });
  banco.term.selezione = 'riga scelta';
  banco.mount.scatena('contextmenu', { clientX: 120, clientY: 300, preventDefault() { this.prevenuto = true; } });
  const menu = banco.radice.figli.find((f) => f.id === 'menuTerminale');
  assert.ok(menu, 'il menu non è stato creato nella radice');
  const etichette = menu.figli.filter((f) => f.attributi?.role === 'menuitem').map((f) => f.textContent);
  assert.deepEqual(etichette, [TESTI_APPUNTI.copia, TESTI_APPUNTI.incolla, TESTI_APPUNTI.selezionaTutto, TESTI_APPUNTI.pulisci]);
  // ⛔ nessun nome tecnico a schermo: né i nomi xterm né quelli degli attrezzi del modello
  for (const testo of etichette) assert.ok(!/xterm|clipboard|paste|terminal|pty/iu.test(testo), `nome tecnico a schermo: ${testo}`);
});

test('P0A3-MENU-VOCI: «Copia» è spenta senza selezione, e «Seleziona tutto» e «Pulisci» fanno il loro mestiere', () => {
  const term = new TerminalFinto({});
  const voci = vociMenuTerminale(term, { copia: () => {}, incolla: () => {} });
  const abilitate = Object.fromEntries(voci.map(([testo, , abilitato]) => [testo, abilitato]));
  assert.equal(abilitate[TESTI_APPUNTI.copia], false, 'senza selezione non c’è niente da copiare');
  term.selezione = 'qualcosa';
  const conSelezione = vociMenuTerminale(term, { copia: () => {}, incolla: () => {} });
  assert.equal(conSelezione.find(([t]) => t === TESTI_APPUNTI.copia)[2], true);
  conSelezione.find(([t]) => t === TESTI_APPUNTI.selezionaTutto)[1]();
  assert.equal(term.tuttoSelezionato, 1);
  conSelezione.find(([t]) => t === TESTI_APPUNTI.pulisci)[1]();
  assert.equal(term.pulito, 1);
});

test('P0A3-SCOLLEGA: il menu si smonta e il contextmenu non resta appeso', () => {
  const banco = bancoAppunti();
  assert.equal(banco.mount.ascoltatori.get('contextmenu').length, 1);
  banco.scollega();
  assert.equal(banco.mount.ascoltatori.get('contextmenu').length, 0);
});
