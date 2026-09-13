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

export function scegliMotoreLocale({ percorsi, env = process.env, sonda = spawnSync }) {
  if (env.TALOS_LLAMA_SERVER_PATH?.trim()) return env.TALOS_LLAMA_SERVER_PATH;
  if (!percorsi.localRuntime) return undefined;
  for (const variante of ['vulkan', 'cpu']) {
    const file = percorsi.localRuntime[variante];
    const esito = sonda(file, ['--version'], { windowsHide: true, shell: false, timeout: 15000, stdio: 'ignore' });
    if (!esito.error && esito.status === 0) return file;
  }
  throw new Error('Il motore locale incluso non si avvia. Reinstallare TALOS e consultare il registro.');
}

function portaValida(port) { return Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== 4174; }

export function creaAvvioFiglio({ execPath, percorsi, port, token, reportFile, dataDir, env = process.env }) {
  if (!isAbsolute(execPath ?? '')) throw new Error('Percorso eseguibile assoluto richiesto.');
  if (!portaValida(port)) throw new Error('La porta del figlio non è consentita.');
  if (!/^[a-f0-9]{64}$/.test(token ?? '')) throw new Error('Credenziale locale non valida.');
  const ambiente = Object.fromEntries(Object.entries(env).filter(([k, v]) => v !== undefined && !/^(NODE_OPTIONS|NODE_PATH|TALOS_PACKAGED_NODE|ELECTRON_RUN_AS_NODE|ELECTRON_ENABLE_LOGGING|ELECTRON_LOG_FILE|ELECTRON_NO_ASAR)$/i.test(k)));
  Object.assign(ambiente, {
    ELECTRON_RUN_AS_NODE: '1', TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(port),
    TALOS_HARNESS_UI_TOKEN: token, TALOS_HARNESS_UI_REPORT_FILE: reportFile,
    TALOS_DESKTOP_DATA_DIR: dataDir,
    TALOS_HARNESS_UI_SESSIONS_DIR: join(dataDir, 'sessions'),
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
