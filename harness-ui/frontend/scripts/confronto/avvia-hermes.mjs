/*
 * Avvia l'app di riferimento (la copia compilata) con il debug remoto su una porta
 * fissa, staccato dalla shell, e aspetta che risponda. Se è già su, non fa niente.
 *
 * Ricerca 05/09/2026: un'app Electron si guida da fuori con Chrome DevTools
 * Protocol; Playwright vi si aggancia con `chromium.connectOverCDP` (docs
 * Playwright «Connecting to an existing browser», BrowserStack guide 2026;
 * microsoft/playwright#39008: con Electron 30+ NON si passa
 * `--remote-debugging-port=0` da riga di comando — l'app di riferimento
 * espone invece la variabile `HERMES_DESKTOP_CDP_PORT`, letta nel suo `electron-main.mjs`).
 *
 * Uso: node scripts/confronto/avvia-hermes.mjs [--porta=9705] [--radice=<hermes-root>]
 * Variabili: TALOS_CONFRONTO_HERMES_ROOT (cartella con node_modules/electron e apps/desktop).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';

const ARGV = process.argv.slice(2);
const arg = (nome, pre) => ARGV.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? pre;
export const PORTA_CDP_HERMES = Number(arg('porta', process.env.TALOS_CONFRONTO_HERMES_CDP || '9705'));
const RADICE = arg('radice', process.env.TALOS_CONFRONTO_HERMES_ROOT
  || join(process.env.LOCALAPPDATA || '', 'Temp/claude/C--Users-Antonino-Desktop-projects-AVM-harness-desktop/af5c3844-a5da-4bb5-a142-7740e39b623d/scratchpad/confronto/hermes-root'));
const ELECTRON = join(RADICE, 'node_modules/electron/dist/electron.exe');
const APP = join(RADICE, 'apps/desktop');
const LOG_DIR = join(process.cwd(), 'artifacts/confronto');

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

/** I pid degli electron.exe che vengono dalla NOSTRA copia dell'app di riferimento (percorso), letti con PowerShell. */
export function elencaElectronDiHermes() {
  if (process.platform !== 'win32') return [];
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*hermes-root*' } | ForEach-Object { $_.Id }"],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    return out.split(/\r?\n/).map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
  } catch { return []; }
}

export async function hermesRisponde(porta = PORTA_CDP_HERMES) {
  try { const r = await fetch(`http://127.0.0.1:${porta}/json/version`); return r.ok ? await r.json() : null; } catch { return null; }
}

export async function avviaHermes({ porta = PORTA_CDP_HERMES, attesaMassimaMs = 60_000 } = {}) {
  const gia = await hermesRisponde(porta);
  if (gia) return { giaAperto: true, versione: gia['Browser'] };
  /*
   * ⛔ 05/09: l'app di riferimento usa `app.requestSingleInstanceLock()` — una seconda istanza chiama
   * `app.quit()` e esce con codice 0 senza una riga di log (electron/electron#35681, #7842,
   * letti il 05/09/2026). Se una copia è già aperta SENZA debug remoto, ogni avvio nuovo muore
   * in silenzio e si aspetta una porta che non arriverà. Ho perso mezz'ora perché `tasklist /FI`
   * da Git Bash rispondeva «0 processi» con un filtro rotto: qui si guarda con PowerShell.
   */
  const vive = elencaElectronDiHermes();
  if (vive.length) throw new Error(`Hermes è già aperto senza debug remoto (pid ${vive.join(', ')}): chiudilo con \`taskkill //PID ${vive[0]} //T //F\` e rilancia`);
  if (!existsSync(ELECTRON)) throw new Error(`Electron non trovato: ${ELECTRON} (TALOS_CONFRONTO_HERMES_ROOT?)`);
  if (!existsSync(join(APP, 'dist/electron-main.mjs'))) throw new Error(`Hermes desktop non compilato in ${APP}`);
  mkdirSync(LOG_DIR, { recursive: true });
  const log = openSync(join(LOG_DIR, 'hermes-desktop.log'), 'a');
  // `HERMES_DESKTOP_CDP_PORT` accende il debug SOLO in modalità sviluppo (dev server); sulla copia
  // compilata (dist-run) l'unica via è lo switch di Chromium sulla riga di comando, come il 04/09.
  const figlio = spawn(ELECTRON, [`--remote-debugging-port=${porta}`, APP], {
    cwd: APP,
    env: { ...process.env, HERMES_DESKTOP_CDP_PORT: String(porta), HERMES_DESKTOP_DISABLE_GPU: '' },
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: false,
  });
  figlio.unref();
  const inizio = Date.now();
  while (Date.now() - inizio < attesaMassimaMs) {
    const v = await hermesRisponde(porta);
    if (v) return { giaAperto: false, pid: figlio.pid, versione: v['Browser'], dopoMs: Date.now() - inizio };
    await attesa(500);
  }
  throw new Error(`Hermes non ha esposto il debug remoto su ${porta} entro ${attesaMassimaMs / 1000} s (log: artifacts/confronto/hermes-desktop.log)`);
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const esito = await avviaHermes();
  console.log(JSON.stringify(esito));
}
