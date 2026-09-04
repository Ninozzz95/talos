/**
 * ⭐⭐⭐ 04/9 — W1-10, LAB: la shell Electron sottile (piano 57.1).
 *
 * Cosa fa, e solo questo: genera un token, avvia il VERO `server.mjs` come
 * figlio Node separato (mai il Node di Electron: `node-pty` e gli addon
 * nativi restano quelli già provati sul server), aspetta l'handshake e la
 * salute, apre UNA finestra sulla UI con il cookie del token. Alla chiusura
 * uccide il figlio. Niente tray, niente updater, niente installer: W2.
 *
 * Perché un figlio e non il server dentro il processo Electron: il server
 * resta identico a quello che gira nel browser (browser-first invariato),
 * si può riavviare senza chiudere la finestra (W2-13), e non prende in
 * prestito il runtime di Electron per gli addon nativi.
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
import { app, BrowserWindow } from 'electron';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE_HARNESS_UI = join(QUI, '..', '..');
const ATTESA_MASSIMA_MS = 30_000;
const INTERVALLO_MS = 150;

app.commandLine.appendSwitch('ignore-gpu-blocklist');

let figlio = null;
let cartellaHandshake = null;

function attendi(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function attendiHandshake(file, scadenzaMs) {
  const inizio = Date.now();
  for (;;) {
    try {
      const dati = JSON.parse(readFileSync(file, 'utf8'));
      if (typeof dati.host === 'string' && Number.isInteger(dati.port)) return dati;
    } catch { /* non ancora */ }
    if (figlio && figlio.exitCode !== null) throw new Error(`server.mjs è uscito con codice ${figlio.exitCode} prima di legare una porta`);
    if (Date.now() - inizio > scadenzaMs) throw new Error(`nessun handshake entro ${scadenzaMs} ms`);
    await attendi(INTERVALLO_MS);
  }
}

async function attendiSalute(base, token, scadenzaMs) {
  const inizio = Date.now();
  for (;;) {
    try {
      const r = await fetch(`${base}/api/v1/health`, { headers: { cookie: `talos_token=${token}` } });
      if (r.ok) return;
    } catch { /* non ancora */ }
    if (Date.now() - inizio > scadenzaMs) throw new Error(`/api/v1/health non risponde entro ${scadenzaMs} ms`);
    await attendi(INTERVALLO_MS);
  }
}

function avviaFiglio(token, fileHandshake) {
  const nodo = process.env.TALOS_PACKAGED_NODE || 'node';
  const proc = spawn(nodo, ['server.mjs'], {
    cwd: RADICE_HARNESS_UI,
    env: {
      ...process.env,
      TALOS_HARNESS_UI_TOKEN: token,
      TALOS_HARNESS_UI_REPORT_FILE: fileHandshake,
      // ⛔ Electron mette ELECTRON_RUN_AS_NODE e simili nell'ambiente dei figli in alcuni percorsi: il server deve vedere un Node normale.
      ELECTRON_RUN_AS_NODE: undefined,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
    shell: false,
  });
  proc.on('exit', (codice) => { console.log(`[shell] server.mjs uscito (${codice})`); });
  return proc;
}

async function avvia() {
  const token = randomBytes(32).toString('hex'); // 64 caratteri esadecimali: sopra il minimo di 32 di config.mjs
  cartellaHandshake = mkdtempSync(join(tmpdir(), 'talos-electron-'));
  const fileHandshake = join(cartellaHandshake, 'report.json');
  figlio = avviaFiglio(token, fileHandshake);
  const { host, port } = await attendiHandshake(fileHandshake, ATTESA_MASSIMA_MS);
  const base = `http://${host}:${port}`;
  await attendiSalute(base, token, ATTESA_MASSIMA_MS);

  const finestra = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'TALOS',
    show: false,
    backgroundColor: '#1e1f22',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  finestra.once('ready-to-show', () => finestra.show());
  // ⛔ Il token passa UNA volta nell'URL e il server risponde 302 a `/` con il cookie: la barra e la cronologia del renderer non lo tengono.
  await finestra.loadURL(`${base}/?token=${token}`);
  console.log(`[shell] finestra aperta su ${base} (token nel cookie, non nell'URL)`);
}

app.whenReady().then(avvia).catch((errore) => {
  console.error('[shell] avvio fallito:', errore.message);
  app.exit(1);
});

app.on('before-quit', () => {
  if (figlio && figlio.exitCode === null) figlio.kill();
  if (cartellaHandshake) { try { rmSync(cartellaHandshake, { recursive: true, force: true }); } catch { /* migliore sforzo */ } }
});
app.on('window-all-closed', () => app.quit());
