/*
 * Giro di sicurezza 4 (11/11/2026; controllore del giro 3, reperto C2: mutanti C01 e C02 vivi) — un `electron` FINTO per far girare
 * `main.mjs` VERO sotto Node. Nessun Chromium, nessuna finestra: ogni oggetto ricorda che cosa gli è stato chiesto.
 * Il copione, quando la principale carica il documento dell'app: una cornice del servizio arriva (`did-frame-navigate`), poi il suo
 * processo cade (cornice «staccata», come in Chromium); dopo 2,5 secondi si scrive in `PROVA_USCITA` che cosa ha fatto il guscio e si esce.
 * Il servizio locale è quello finto di `./servizio/server.mjs` (la prova lo indica con `TALOS_DESKTOP_HARNESS_DIR`).
 */
import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const USCITA = process.env.PROVA_USCITA;
const CAP = 'C'.repeat(43);
const rapporto = { switch: [], primaDiReady: null, pronta: false, finestre: 0, avvisi: [], copioni: [], dialoghi: [], errori: [], ascoltiCornici: null, fine: null };
const scrivi = () => { if (USCITA) writeFileSync(USCITA, JSON.stringify(rapporto, null, 1)); };
let finito = false;
function fine(come) {
  if (finito) return;
  finito = true;
  rapporto.fine = come;
  scrivi();
  setTimeout(() => process.exit(0), 50);
}
process.on('uncaughtException', (e) => { rapporto.errori.push(String(e?.stack ?? e)); fine('eccezione'); });
process.on('unhandledRejection', (e) => { rapporto.errori.push(String(e?.stack ?? e)); });
setTimeout(() => fine('tetto'), 25000).unref?.();

const percorsi = new Map();
const switchVeri = new Map();
const nulla = () => {};

const commandLine = {
  appendSwitch(nome, valore) { rapporto.switch.push({ nome, valore: valore ?? null, primaDiReady: !rapporto.pronta }); switchVeri.set(nome, valore ?? ''); },
  getSwitchValue(nome) { return switchVeri.get(nome) ?? ''; },
  hasSwitch(nome) { return switchVeri.has(nome); },
  appendArgument: nulla, removeSwitch(nome) { switchVeri.delete(nome); },
};

class App extends EventEmitter {
  commandLine = commandLine;
  isPackaged = false;
  getAppPath() { return fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\\/]$/u, ''); }
  getPath(nome) { return percorsi.get(nome) ?? process.env.APPDATA ?? process.env.TEMP; }
  setPath(nome, valore) { percorsi.set(nome, valore); }
  setName = nulla; setAppUserModelId = nulla;
  getName() { return 'TALOS'; }
  getVersion() { return '0.0.0'; }
  getLocale() { return 'en-US'; }
  requestSingleInstanceLock() { return true; }
  whenReady() { return new Promise((fatto) => setTimeout(() => { rapporto.pronta = true; fatto(); }, 30)); }
  quit() { fine('quit'); }
  exit(codice) { fine(`exit ${codice}`); }
  enableSandbox = nulla;
}
export const app = new App();

class Cornice {
  constructor(id, processo, numero, url) { Object.assign(this, { frameTreeNodeId: id, processId: processo, routingId: numero, url, detached: false }); }
  isDestroyed() { return false; }
  executeJavaScript() { return Promise.resolve(undefined); }
}

class WebContents extends EventEmitter {
  url = '';
  mainFrame = { frames: [], executeJavaScript: (copione) => { rapporto.copioni.push({ dove: 'cornice-principale', copione }); return Promise.resolve(undefined); } };
  executeJavaScript(copione) { rapporto.copioni.push({ dove: 'contenuto', copione }); return Promise.resolve(undefined); }
  getURL() { return this.url; }
  setWindowOpenHandler = nulla; setWebRTCIPHandlingPolicy = nulla;
  getZoomFactor() { return 1; }
  isDestroyed() { return false; }
  reload = nulla;
}

let principale = null;
export class BrowserWindow extends EventEmitter {
  static getAllWindows() { return []; }
  constructor(opzioni = {}) {
    super();
    rapporto.finestre += 1;
    this.opzioni = opzioni;
    this.webContents = new WebContents();
    if (!principale && opzioni.titleBarStyle === 'hidden') principale = this;
  }
  async loadURL(indirizzo) {
    this.webContents.url = indirizzo;
    if (this === principale) setTimeout(() => copione(this), 50);
    return undefined;
  }
  isDestroyed() { return false; }
  isMinimized() { return false; }
  isMaximized() { return false; }
  getNormalBounds() { return { x: 0, y: 0, width: 1200, height: 800 }; }
  show = nulla; hide = nulla; focus = nulla; restore = nulla; maximize = nulla; destroy = nulla; close = nulla; setTitle = nulla;
  setTitleBarOverlay = nulla; removeMenu = nulla; setBounds = nulla; setIgnoreMouseEvents = nulla; setAlwaysOnTop = nulla;
}

/* Il copione della principale: una cornice del servizio arriva, poi il suo processo cade. */
function copione(finestra) {
  const contenuto = finestra.webContents;
  contenuto.emit('did-finish-load');
  const base = new URL(contenuto.url).origin;
  const indirizzo = `${base}/api/v1/pagine/${CAP}/pagina.html`;
  const cornice = new Cornice(41, 7, 9, indirizzo);
  contenuto.mainFrame.frames = [cornice];
  rapporto.ascoltiCornici = contenuto.listenerCount('did-frame-navigate');
  contenuto.emit('did-frame-navigate', {}, indirizzo, 200, 'OK', false, 7, 9);
  setTimeout(() => { cornice.detached = true; }, 100);
  setTimeout(() => {
    rapporto.avvisi = rapporto.copioni.filter((c) => c.copione.includes('talos:anteprime-cadute')).map((c) => ({ dove: c.dove, percorso: c.copione.includes(`/api/v1/pagine/${CAP}/pagina.html`) }));
    fine('copione');
  }, 2500);
}

class Sessione {
  webRequest = { onHeadersReceived: nulla, onBeforeRequest: nulla };
  setPermissionRequestHandler = nulla; setPermissionCheckHandler = nulla; on = nulla; setProxy = async () => {};
}
const sessioni = new Map();
export const session = {
  defaultSession: new Sessione(),
  fromPartition(nome) { if (!sessioni.has(nome)) sessioni.set(nome, new Sessione()); return sessioni.get(nome); },
};

export const dialog = { showMessageBox: async (opzioni) => { rapporto.dialoghi.push(opzioni?.message ?? ''); fine('dialogo'); return { response: 2 }; }, showErrorBox: nulla };
export const globalShortcut = { register: () => true, unregister: nulla, unregisterAll: nulla, isRegistered: () => false };
export const Menu = { buildFromTemplate: () => ({ popup: nulla, items: [] }), setApplicationMenu: nulla, getApplicationMenu: () => null };
export const net = { fetch: (...a) => globalThis.fetch(...a) };
export const powerMonitor = new EventEmitter();
export const powerSaveBlocker = { start: () => 1, stop: nulla, isStarted: () => false };
const schermo = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
export const screen = Object.assign(new EventEmitter(), { getAllDisplays: () => [schermo], getPrimaryDisplay: () => schermo, getDisplayMatching: () => schermo, getCursorScreenPoint: () => ({ x: 0, y: 0 }) });
export const shell = { openPath: async () => '', openExternal: async () => {} };
export class Tray extends EventEmitter { setToolTip = nulla; setContextMenu = nulla; isDestroyed() { return false; } destroy = nulla; }
export default { app, BrowserWindow, dialog, globalShortcut, Menu, net, powerMonitor, powerSaveBlocker, screen, session, shell, Tray };
