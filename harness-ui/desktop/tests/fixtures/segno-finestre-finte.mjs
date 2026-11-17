/*
 * Le finestre e lo schermo finti del segno del computer use (FE-070), comuni a `segno-finestra.test.mjs`, `segno-battito.test.mjs` e alla prova del filo
 *   intero del server (`tests/computer-use-segno-battito-filo.test.mjs`). Electron non parte: tutto si inietta, come in `bolla-finestra.test.mjs`.
 *   Spostate qui dal giro 5 della bolla (14/11/2026); in più `batti()` (la pagina del segno manda il suo battito con `window.open`, come il ripiego), gli
 *   eventi della finestra (`emetti('unresponsive')`) e `hide()` scritto anche in `ordine`.
 */

export const BASE = 'http://127.0.0.1:51234';
/** Lo stesso indirizzo di `segno-finestra.mjs` e di `frontend/src/components/computer-use/bolla-messaggi.js` (le prove lo confrontano). */
export const BATTITO = 'talos-segno:battito';
/* due schermi: il principale al 150%, il secondo a destra al 100% (in DIP, come li dà Electron) */
export const PRINCIPALE = Object.freeze({ id: 1, bounds: { x: 0, y: 0, width: 1280, height: 720 }, workArea: { x: 0, y: 0, width: 1280, height: 680 }, scaleFactor: 1.5 });
export const SECONDO = Object.freeze({ id: 2, bounds: { x: 1280, y: 0, width: 1920, height: 1080 }, workArea: { x: 1280, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 });

/* la conversione di Windows, finta ma fedele: ogni schermo ha la sua scala, l'origine fisica del secondo è dopo la larghezza fisica del primo */
export function dipFisico(r) {
  if (r.x >= SECONDO.bounds.x) return { x: 1920 + (r.x - 1280), y: r.y, width: r.width, height: r.height };
  return { x: Math.round(r.x * 1.5), y: Math.round(r.y * 1.5), width: Math.round(r.width * 1.5), height: Math.round(r.height * 1.5) };
}

export function finti({ schermi = [PRINCIPALE, SECONDO], windows = true, protezione = true, protezioneTiene = true } = {}) {
  const finestre = [];
  const chiamate = [];
  class FintaFinestra {
    constructor(opzioni) {
      this.opzioni = opzioni; this.confini = { x: opzioni.x, y: opzioni.y, width: opzioni.width, height: opzioni.height };
      this.caricati = []; this.eventi = {}; this.contenuto = {}; this.distrutta = false; this.visibile = false; this.fuoco = false;
      this.ordine = []; this.eseguiti = []; this.apertura = null; this.rimessa = null;
      const io = this;
      this.webContents = {
        setWindowOpenHandler(f) { io.apertura = f; },
        on(nome, f) { (io.contenuto[nome] ??= []).push(f); },
        async executeJavaScript(codice) { io.eseguiti.push(codice); },
        /* lo zoom come Chromium: di serie per origine, quindi il menu «Ingrandisci» della principale arriva anche qui */
        zoom: 1, modoZoom: 'default',
        setZoomMode(modo) { this.modoZoom = modo; },
        /* come Electron: su un webContents distrutto ogni metodo lancia «Object has been destroyed» */
        chiamateZoom: 0,
        setZoomFactor(fattore) { this.chiamateZoom++; if (io.distrutta) throw new TypeError('Object has been destroyed'); this.zoom = fattore; },
      };
      finestre.push(this);
    }
    on(nome, f) { (this.eventi[nome] ??= []).push(f); }
    once(nome, f) { this.on(nome, f); }
    emetti(nome, ...a) { for (const f of this.eventi[nome] ?? []) f(...a); }
    emettiContenuto(nome, ...a) { for (const f of this.contenuto[nome] ?? []) f(...a); }
    async loadURL(u) { this.caricati.push(u); }
    setIgnoreMouseEvents(si) { this.ordine.push(['ignora', si]); }
    setAlwaysOnTop(si, livello) { this.ordine.push(['sopra', si, livello]); }
    setContentProtection(si) { if (!protezione) throw new Error('non disponibile'); this.ordine.push(['protetta', si]); this.protetta = si && (typeof protezioneTiene === 'function' ? protezioneTiene(this.opzioni) : protezioneTiene); }
    /* Electron: `setContentProtection` è void e tace se SetWindowDisplayAffinity fallisce; si legge dopo */
    isContentProtected() { return this.protetta === true; }
    setBounds(c) { this.confini = { ...c }; this.rimessa = { ...c }; }
    getBounds() { return { ...this.confini }; }
    isDestroyed() { return this.distrutta; }
    destroy() { this.distrutta = true; this.emetti('closed'); }
    show() { this.visibile = true; this.fuoco = true; this.ordine.push(['show']); }
    showInactive() { this.visibile = true; this.ordine.push(['showInactive']); }
    hide() { this.visibile = false; this.ordine.push(['hide']); }
    isVisible() { return this.visibile; }
    focus() { this.fuoco = true; }
    /* come Electron: `did-navigate` col codice HTTP, poi `did-finish-load` */
    carica(codice = 200) { this.emettiContenuto('did-navigate', {}, this.caricati.at(-1), codice); this.emettiContenuto('did-finish-load'); }
    /* giro 5: la pagina del segno, dopo aver disegnato, batte con `window.open(BATTITO)`; il guscio nega la finestra */
    batti() { return this.apertura?.({ url: BATTITO }); }
  }
  const ascoltatori = {};
  const cursore = { x: 1500, y: 100 };
  const screen = {
    getAllDisplays: () => schermi.map(s => ({ ...s, bounds: { ...s.bounds } })),
    getPrimaryDisplay: () => schermi[0],
    getCursorScreenPoint: () => ({ ...cursore }),
    getDisplayNearestPoint: (p) => schermi.find(s => p.x >= s.bounds.x && p.x < s.bounds.x + s.bounds.width) ?? schermi[0],
    on(nome, f) { chiamate.push(['on', nome]); (ascoltatori[nome] ??= []).push(f); },
    removeListener(nome, f) { chiamate.push(['off', nome]); ascoltatori[nome] = (ascoltatori[nome] ?? []).filter(g => g !== f); },
  };
  if (windows) {
    screen.dipToScreenRect = (finestra, r) => { chiamate.push(['rect', finestra]); return dipFisico(r); };
    screen.dipToScreenPoint = (p) => { const r = dipFisico({ ...p, width: 0, height: 0 }); return { x: r.x, y: r.y }; };
  }
  const emettiSchermo = (nome, ...a) => { for (const f of ascoltatori[nome] ?? []) f({}, ...a); };
  const righe = [];
  const bolla = { messaggi: [], riesce: true };
  return {
    finestre, chiamate, ascoltatori, cursore, emettiSchermo, righe, bolla, schermi,
    dipendenze: { piattaforma: 'win32', BrowserWindow: FintaFinestra, screen, registro: (r) => righe.push(r), postaNellaBolla: (m) => { if (!bolla.riesce) return false; bolla.messaggi.push(m); return true; } },
  };
}
export const prossimoGiro = () => new Promise((ok) => setImmediate(ok));
export const aspetta = (ms) => new Promise((ok) => setTimeout(ok, ms));
export const vivi = (f) => f.finestre.filter(w => !w.distrutta);
