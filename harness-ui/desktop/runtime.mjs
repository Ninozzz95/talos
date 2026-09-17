import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function risolviPercorsi({ appPath, isPackaged = false, resourcesPath, harnessDir } = {}) {
  if (!isAbsolute(appPath ?? '')) throw new Error('Percorso app assoluto richiesto.');
  if (harnessDir && !isAbsolute(harnessDir)) throw new Error('Il percorso dichiarato deve essere assoluto.');
  if (isPackaged && !harnessDir && !isAbsolute(resourcesPath ?? '')) throw new Error('Percorso risorse assente.');
  const root = harnessDir || (isPackaged ? join(resourcesPath, 'harness-ui') : dirname(appPath));
  const localRuntime = isPackaged && !harnessDir ? Object.freeze({
    cpu: join(resourcesPath, 'local-runtime', 'cpu', 'llama-server.exe'),
    vulkan: join(resourcesPath, 'local-runtime', 'vulkan', 'llama-server.exe'),
  }) : undefined;
  return Object.freeze({ root: resolve(root), server: join(root, 'server.mjs'), bootstrap: join(appPath, 'child-bootstrap.mjs'), localRuntime });
}

export function scegliMotoreLocale({ percorsi, env = process.env, sonda = spawnSync, preferenza = 'auto' }) {
  if (env.TALOS_LLAMA_SERVER_PATH?.trim()) return { percorso: env.TALOS_LLAMA_SERVER_PATH.trim(), variante: 'personalizzato', dispositivi: [], motivo: 'Percorso imposto esplicitamente in ambiente.' };
  if (!percorsi.localRuntime) return undefined;
  // llama.cpp b10517, common/arg.cpp, consultato 13/09/2026:
  // --list-devices esce 0 ANCHE quando stampa (none).
  const prova = (variante, args) => {
    try { return sonda(percorsi.localRuntime[variante], args, { windowsHide: true, shell: false, timeout: 15000, encoding: 'utf8', maxBuffer: 256 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { return { error }; }
  };
  const manuale = ['vulkan', 'cpu'].includes(preferenza);
  const esito = preferenza === 'cpu' ? null : prova('vulkan', ['--list-devices']);
  const dispositivi = esito && !esito.error && esito.status === 0
    ? [...`${esito.stdout ?? ''}\n${esito.stderr ?? ''}`.matchAll(/^\s*Vulkan\d+:\s*(.+?)\s*$/gm)].map(m => m[1].replace(/\s+\(\d+ MiB,.*\)$/, '')) : [];
  if (manuale) return { percorso: percorsi.localRuntime[preferenza], variante: preferenza, dispositivi: preferenza === 'vulkan' ? dispositivi : [],
    motivo: `Scelta manuale: ${preferenza === 'cpu' ? 'processore' : 'scheda grafica (Vulkan)'}${preferenza === 'vulkan' && !dispositivi.length ? '; la sonda non ha confermato dispositivi utilizzabili' : ''}.` };
  if (dispositivi.length) return { percorso: percorsi.localRuntime.vulkan, variante: 'vulkan', dispositivi, motivo: 'La scheda grafica è stata enumerata dal motore incluso.' };
  const cpu = prova('cpu', ['--version']);
  if (!cpu.error && cpu.status === 0) {
    return { percorso: percorsi.localRuntime.cpu, variante: 'cpu', dispositivi: [], motivo: esito?.error || esito?.status !== 0 ? 'La verifica della scheda grafica è fallita o è scaduta: uso il processore.' : 'Nessuna scheda grafica enumerata: uso il processore.' };
  }
  throw new Error('Il motore locale incluso non si avvia. Reinstallare TALOS e consultare il registro.');
}

function portaValida(port) { return Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== 4174; }

export function creaAvvioFiglio({ execPath, percorsi, port, token, reportFile, dataDir, motoreLocale, env = process.env }) {
  if (!isAbsolute(execPath ?? '')) throw new Error('Percorso eseguibile assoluto richiesto.');
  if (!portaValida(port)) throw new Error('La porta del figlio non è consentita.');
  if (!/^[a-f0-9]{64}$/.test(token ?? '')) throw new Error('Credenziale locale non valida.');
  const ambiente = Object.fromEntries(Object.entries(env).filter(([k, v]) => v !== undefined && !/^(NODE_OPTIONS|NODE_PATH|TALOS_PACKAGED_NODE|ELECTRON_RUN_AS_NODE|ELECTRON_ENABLE_LOGGING|ELECTRON_LOG_FILE|ELECTRON_NO_ASAR)$/i.test(k)));
  if (motoreLocale) {
    ambiente.TALOS_LLAMA_SERVER_PATH = motoreLocale.percorso;
    if (motoreLocale.variante !== 'personalizzato') {
      delete ambiente.TALOS_LLAMA_SERVER_FALLBACK_PATH;
      if (motoreLocale.variante === 'vulkan' && percorsi.localRuntime?.cpu) ambiente.TALOS_LLAMA_SERVER_FALLBACK_PATH = percorsi.localRuntime.cpu;
    }
  }
  /*
   * Black-box hotfix 15/09/2026: the desktop selects a thin adapter in front
   * of the benchmarked kernel. An explicitly configured owner runtime still
   * wins; only the desktop default changes. Mobile and TALOS-BANCO do not pass
   * through this launcher.
   */
  if (!ambiente.TALOS_OWNER_RUNTIME_MODULE?.trim()) {
    ambiente.TALOS_OWNER_RUNTIME_MODULE = join(percorsi.root, 'src', 'kernel', 'talosHarness.desktop-hotfix.mjs');
  }
  Object.assign(ambiente, {
    ELECTRON_RUN_AS_NODE: '1', TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(port),
    TALOS_HARNESS_UI_TOKEN: token, TALOS_HARNESS_UI_REPORT_FILE: reportFile,
    TALOS_DESKTOP_DATA_DIR: dataDir,
    TALOS_HARNESS_UI_SESSIONS_DIR: join(dataDir, 'sessions'),
    /*
     * ⛔ (16/09/2026) — l'app installata ha un namespace SUO nel portachiavi (`<servizio>-desktop`,
     *   nasce vuoto, mai condiviso con il server da sorgente) e ignora i semi di chiavi
     *   dall'ambiente: le chiavi arrivano solo dalla UI. Vedi `src/adattatore-keyring.mjs`.
     */
    TALOS_HARNESS_UI_KEYRING_SCOPE: 'desktop',
  });
  return { command: execPath, args: ['--import', pathToFileURL(percorsi.bootstrap).href, percorsi.server], options: {
    cwd: percorsi.root, env: ambiente, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true, shell: false,
  } };
}

// Il backend rifiuta listen(0). La prenotazione viene rilasciata prima dello spawn:
// una collisione fallisce esplicitamente, il ciclo ripete la scelta, senza porte fisse.
export async function scegliPortaEffimera() {
  const port = await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(errore => errore ? reject(errore) : resolvePort(port));
    });
  });
  if (!portaValida(port)) throw new Error('Il sistema non ha assegnato una porta consentita.');
  return port;
}

export function validaHandshake(dati, port) {
  if (!dati || dati.host !== '127.0.0.1' || !portaValida(dati.port) || dati.port !== port) throw new Error('Risposta di avvio locale non valida.');
  return `http://127.0.0.1:${port}`;
}

export function urlIngresso(base, token) {
  const url = new URL(base);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !portaValida(Number(url.port)) || url.username || url.password || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Indirizzo locale non consentito.');
  url.pathname = '/'; url.search = ''; url.hash = ''; url.searchParams.set('token', token);
  return url.href;
}
