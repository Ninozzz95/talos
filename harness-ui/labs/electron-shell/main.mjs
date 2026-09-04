/**
 * ⭐⭐⭐ 04/9 — W1-10 + W2-13, LAB: la shell Electron sottile (piano 57.1 e 57.2).
 *
 * Cosa fa, e solo questo: genera un token, avvia il VERO `server.mjs` come
 * figlio Node separato (mai il Node di Electron: `node-pty` e gli addon
 * nativi restano quelli già provati sul server), aspetta l'handshake e la
 * salute, apre UNA finestra sulla UI con il cookie del token. Alla chiusura
 * uccide il figlio. Niente tray, niente updater, niente installer: W2-14…17.
 *
 * W2-13 (ciclo di vita): una sola istanza (`requestSingleInstanceLock`: la
 * seconda porta in primo piano la prima); il figlio è governato dalla
 * macchina a stati di `lifecycle.mjs` (crash ⇒ riavvio con backoff, poi
 * resa dichiarata); `powerMonitor` suspend/resume ⇒ la salute si risonda al
 * risveglio e la pagina si ricarica solo se il figlio è cambiato; posizione
 * e dimensione della finestra in `labs/stores/electron-shell/window-state.json`
 * (`windowStatePersistence` non esiste in Electron 44: verificato sui docs).
 *
 * Sicurezza del renderer (Electron 44, valori espliciti anche dove sono
 * già i default): `contextIsolation: true`, `nodeIntegration: false`,
 * `sandbox: true`, nessun preload. La pagina è una pagina web: parla al
 * server via HTTP/SSE/WS come nel browser, con in più il cookie
 * `talos_token` che il server pretende su `/api/*` (vedi `http-app.mjs`).
 *
 * GPU: `ignore-gpu-blocklist` è acceso apposta — la lezione del 02/09 (lag
 * da 6 a 109 ms con la GPU spenta nel browser dell'owner) vale anche qui.
 * W2-17 misurerà con la sonda rAF di W0-03 se resta giusto.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, powerMonitor, screen } from 'electron';
import { creaCicloDiVita } from './lifecycle.mjs';
import { leggiStatoFinestra, salvaStatoFinestra } from './window-state.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE_HARNESS_UI = join(QUI, '..', '..');
const FILE_STATO_FINESTRA = join(QUI, '..', 'stores', 'electron-shell', 'window-state.json');
const ATTESA_MASSIMA_MS = 30_000;
const INTERVALLO_MS = 150;

app.commandLine.appendSwitch('ignore-gpu-blocklist');

/*
 * Una sola istanza. La seconda esce subito e la prima riporta la finestra in
 * primo piano: due shell vorrebbero dire due server, due porte, due token —
 * e una persona che non sa più quale sta guardando.
 */
if (!app.requestSingleInstanceLock()) {
  console.log('[shell] già in esecuzione: passo il fuoco alla finestra aperta');
  app.exit(0);
}

const token = randomBytes(32).toString('hex'); // 64 caratteri esadecimali: sopra il minimo di 32 di config.mjs
let cartellaHandshake = null;
let finestra = null;
let base = null;
let generazioneFiglio = 0; // cresce a ogni figlio avviato: la pagina si ricarica solo se il figlio è cambiato
let generazioneMostrata = 0;

function attendi(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function attendiHandshake(handle, file, scadenzaMs) {
  const inizio = Date.now();
  for (;;) {
    try {
      const dati = JSON.parse(readFileSync(file, 'utf8'));
      if (typeof dati.host === 'string' && Number.isInteger(dati.port)) return dati;
    } catch { /* non ancora */ }
    if (handle.proc.exitCode !== null) return null;
    if (Date.now() - inizio > scadenzaMs) return null;
    await attendi(INTERVALLO_MS);
  }
}

async function saluteOk(baseUrl) {
  try {
    const r = await fetch(`${baseUrl}/api/v1/health`, { headers: { cookie: `talos_token=${token}` } });
    return r.ok;
  } catch { return false; }
}

async function attendiSaluteFino(baseUrl, scadenzaMs) {
  const inizio = Date.now();
  for (;;) {
    if (await saluteOk(baseUrl)) return true;
    if (Date.now() - inizio > scadenzaMs) return false;
    await attendi(INTERVALLO_MS);
  }
}

const ciclo = creaCicloDiVita({
  avviaFiglio: () => {
    cartellaHandshake ??= mkdtempSync(join(tmpdir(), 'talos-electron-'));
    const fileHandshake = join(cartellaHandshake, `report-${Date.now()}.json`);
    const nodo = process.env.TALOS_PACKAGED_NODE || 'node';
    const proc = spawn(nodo, ['server.mjs'], {
      cwd: RADICE_HARNESS_UI,
      env: { ...process.env, TALOS_HARNESS_UI_TOKEN: token, TALOS_HARNESS_UI_REPORT_FILE: fileHandshake, ELECTRON_RUN_AS_NODE: undefined },
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
      shell: false,
    });
    generazioneFiglio += 1;
    const handle = { proc, fileHandshake, generazione: generazioneFiglio, get exitCode() { return proc.exitCode; } };
    proc.on('exit', (codice) => { console.log(`[shell] server.mjs uscito (${codice}), generazione ${handle.generazione}`); ciclo.figlioUscito(codice); });
    console.log(`[shell] server.mjs avviato, pid ${proc.pid}, generazione ${handle.generazione}`);
    return handle;
  },
  uccidiFiglio: (handle) => { if (handle?.proc && handle.proc.exitCode === null) handle.proc.kill(); },
  attendiSalute: async (handle) => {
    if (!handle) return false;
    const dati = await attendiHandshake(handle, handle.fileHandshake, ATTESA_MASSIMA_MS);
    if (!dati) return false;
    base = `http://${dati.host}:${dati.port}`;
    return attendiSaluteFino(base, ATTESA_MASSIMA_MS);
  },
  onStato: (stato, dettaglio) => {
    console.log(`[shell] stato: ${stato}${dettaglio ? ` ${JSON.stringify(dettaglio)}` : ''}`);
    if (stato === 'pronto') void mostraOAggiorna();
  },
  onAvviso: (messaggio) => {
    console.warn(`[shell] ${messaggio}`);
    if (finestra && !finestra.isDestroyed() && /non lo riavvio più/.test(messaggio)) {
      dialog.showMessageBox(finestra, { type: 'error', title: 'TALOS', message: 'Il server locale continua a cadere.', detail: messaggio });
    }
  },
});

async function mostraOAggiorna() {
  if (!base) return;
  if (!finestra || finestra.isDestroyed()) {
    const schermi = screen.getAllDisplays().map((d) => d.workArea);
    const stato = leggiStatoFinestra(FILE_STATO_FINESTRA, schermi);
    finestra = new BrowserWindow({
      width: stato.width, height: stato.height, x: stato.x, y: stato.y,
      minWidth: 900, minHeight: 600, title: 'TALOS', show: false, backgroundColor: '#1e1f22',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    if (stato.massimizzata) finestra.maximize();
    finestra.once('ready-to-show', () => finestra.show());
    let timer = null;
    const salva = () => {
      if (!finestra || finestra.isDestroyed()) return;
      const massimizzata = finestra.isMaximized();
      const b = massimizzata ? finestra.getNormalBounds() : finestra.getBounds();
      salvaStatoFinestra(FILE_STATO_FINESTRA, { ...b, massimizzata });
    };
    const salvaDifferito = () => { clearTimeout(timer); timer = setTimeout(salva, 400); };
    finestra.on('resize', salvaDifferito); finestra.on('move', salvaDifferito);
    finestra.on('maximize', salvaDifferito); finestra.on('unmaximize', salvaDifferito);
    finestra.on('close', salva);
    finestra.on('closed', () => { finestra = null; });
    // ⛔ Il token passa UNA volta nell'URL e il server risponde 302 a `/` con il cookie: la barra e la cronologia del renderer non lo tengono.
    await finestra.loadURL(`${base}/?token=${token}`);
    generazioneMostrata = generazioneFiglio;
    console.log(`[shell] finestra aperta su ${base} (token nel cookie, non nell'URL)`);
    return;
  }
  if (generazioneMostrata !== generazioneFiglio) {
    // Figlio nuovo (riavvio dopo crash o dopo il sonno): cookie e porta possono essere cambiati ⇒ si rientra dalla porta col token.
    await finestra.loadURL(`${base}/?token=${token}`);
    generazioneMostrata = generazioneFiglio;
    console.log(`[shell] finestra ricaricata sul figlio nuovo (${base})`);
  }
}

app.on('second-instance', () => {
  if (finestra && !finestra.isDestroyed()) { if (finestra.isMinimized()) finestra.restore(); finestra.focus(); }
});

app.whenReady().then(async () => {
  powerMonitor.on('suspend', () => { console.log('[shell] sospensione'); ciclo.sospendi(); });
  powerMonitor.on('resume', () => { console.log('[shell] risveglio: risondo la salute'); void ciclo.riprendi(); });
  const esito = await ciclo.avvia();
  if (esito !== 'pronto') console.error(`[shell] avvio non riuscito: stato ${esito}`);
}).catch((errore) => {
  console.error('[shell] avvio fallito:', errore.message);
  app.exit(1);
});

app.on('before-quit', () => {
  ciclo.chiudi();
  if (cartellaHandshake) { try { rmSync(cartellaHandshake, { recursive: true, force: true }); } catch { /* migliore sforzo */ } }
});
app.on('window-all-closed', () => app.quit());
