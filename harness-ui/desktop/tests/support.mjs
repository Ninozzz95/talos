import { mkdirSync, mkdtempSync, cpSync, copyFileSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/* 11/11/2026 (round 3, judge v1401 K1): every spec imports this file, so every spec process carries the keyring trip wire and hands
   it to every child it starts (`gancio-portachiavi.mjs`). The specs read the trace after each launch (`nessunPortachiaviVero`). */
import { OPZIONE_GANCIO, VARIABILE_REGISTRO, registroDelGancio, righeDelGancio } from './gancio-portachiavi.mjs';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** How many trace lines exist now: a spec takes it just before a launch and reads only what came after. */
export const lineeDelGancio = () => righeDelGancio().length;
/** Where the caller stands, as `tests/<file>:<line>` (read from the stack, so an edit above never leaves a stale line number). */
function chiama() {
  const riga = new Error().stack.split('\n').slice(3).find(r => /[\\/]desktop[\\/]/.test(r)) ?? '';
  const m = riga.match(/([^\\/()]+\.m?js):(\d+):\d+\)?\s*$/);
  return m ? 'tests/' + m[1] + ':' + m[2] : 'unknown site';
}
/** Red, with the site, when any process started since line `da` tried to load the real keyring or could not get the hook. */
export function nessunPortachiaviVero(da = 0, dove = chiama()) {
  const toccate = righeDelGancio(registroDelGancio(), da).filter(r => r.tipo !== 'caricato');
  if (toccate.length) throw new Error(dove + ': a process started by this test reached for the real Windows keyring or ran without the hook: ' + JSON.stringify(toccate));
}
/** The positive check: the child with this pid really loaded the hook (a `caricato` line written by the child itself). */
export const figlioColGancio = (pid, da = 0) => righeDelGancio(registroDelGancio(), da).some(r => r.tipo === 'caricato' && r.pid === pid);
export const attendi = ms => new Promise(r => setTimeout(r, ms));

export function preparaRuntime(nome) {
  mkdirSync(join(root, '.prove'), { recursive: true });
  const dataDir = mkdtempSync(join(root, '.prove', nome + '-'));
  const runtime = join(dataDir, 'harness-ui');
  mkdirSync(runtime);
  copyFileSync(join(root, '..', 'server.mjs'), join(runtime, 'server.mjs'));
  cpSync(join(root, '..', 'src'), join(runtime, 'src'), { recursive: true });
  for (const nome of ['public', 'node_modules']) symlinkSync(join(root, '..', nome), join(runtime, nome), 'junction');
  const contesto = join(dataDir, 'context-engine');
  mkdirSync(contesto);
  copyFileSync(join(root, '..', '..', 'context-engine', 'package.json'), join(contesto, 'package.json'));
  cpSync(join(root, '..', '..', 'context-engine', 'src'), join(contesto, 'src'), { recursive: true });
  symlinkSync(join(root, '..', 'node_modules'), join(contesto, 'node_modules'), 'junction');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|TOKEN|SECRET|PASSWORD|TALOS_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE/i.test(k)));
  /* 10/11/2026: the filter above also drops `TALOS_HARNESS_UI_KEYRING`, and the shell gives its server the `desktop` keyring scope
     (runtime.mjs:109): every run opened the owner's real Windows keyring (`server.mjs:220` legacy copy, `:261` renewal lock).
     The in-memory test keyring is set HERE, after the filter, never inherited (`tests/portachiavi-di-prova.test.mjs`). */
  Object.assign(env, { TALOS_DESKTOP_DATA_DIR: dataDir, TALOS_DESKTOP_HARNESS_DIR: runtime, TALOS_INTRO: '0', TALOS_HARNESS_UI_KEYRING: 'memoria' });
  /* 11/11/2026 (round 3, K1): the hook rides along explicitly too (the filter above drops NODE_OPTIONS and every TALOS_ name); the
     spawn wrapper of the hook would put it back anyway, also into the server child that `creaAvvioFiglio` strips of NODE_OPTIONS. */
  Object.assign(env, { NODE_OPTIONS: OPZIONE_GANCIO, [VARIABILE_REGISTRO]: registroDelGancio() });
  /* 11/11/2026 (round 4, P045): the explicit test mark the PRODUCT reads before it would import the real keyring
     (`src/guardia-portachiavi-prove.mjs`): it holds also where the hook is not loaded (a packaged Electron drops NODE_OPTIONS). */
  env.TALOS_PROVA_ISOLATA = '1';
  return { dataDir, runtime, env };
}

/* 11/11/2026 (judge v1381 B9): a narrow trip wire, not the general cure. `preparaRuntime` links the TRACKED `harness-ui/public`,
   which a copy or a worktree that was never built serves as it was committed on 14/10: that page invents the terminal id and the
   server answers 403 (`src/terminal-ws.mjs:110-113`), and R01-GUSCIO used to fail two minutes later without saying why. The
   guard reads what the window received; the route is the one the page source calls (`frontend/src/legacy/app.js:18915`). The
   general cure (a source run serving the stale tracked page, `README.md:71`) is the judge's P033 and stays with the owner. */
export const PERCORSO_TERMINALI = '/api/v1/terminals';
export function controllaPaginaServita(script) {
  const letti = Array.isArray(script) ? script.filter(s => typeof s?.testo === 'string') : [];
  if (letti.some(s => s.testo.includes(PERCORSO_TERMINALI))) return;
  throw new Error('The page served to the shell is older than its server: none of its ' + letti.length + ' scripts calls `'
    + PERCORSO_TERMINALI + '`, so the Terminal would get a 403: build the frontend first, `npm --prefix harness-ui/frontend run build`, '
    + 'then copy `harness-ui/frontend/dist/*` into `harness-ui/public/` (as .github/workflows/ci.yml does before this test).');
}

/* 09/11/2026, R01-GUSCIO rosso sui cancelli di main (corsa 42660197808, `guscio.spec.mjs:131`): la schermata al guasto mostrava
   `TALOS-R01` su una riga sua, ma la prova cercava la riga nei BYTE della PTY con un'espressione che toglie solo le CSI. La ConPTY
   mette il cambio di titolo (OSC 0) all'inizio di un suo fotogramma, dove capita: sugli stessi cancelli R01-BACKEND ha ricevuto
   `$ ESC]0;UCRT64:/c/Users/runneradmin BEL echo TALOS-R01`, e quando il fotogramma comincia proprio prima della riga d'uscita
   la riga non comincia più dopo un `\n`. Si legge ciò che il terminale MOSTRA: il buffer di xterm (API `buffer.active`,
   `getLine(i).translateToString(true)`, xtermjs.org/docs/api/terminal/interfaces/ibuffer). Le istanze si tengono avvolgendo il
   globale `window.Terminal`, che `legacy/app.js` legge solo quando crea la scheda: va chiamata PRIMA di aprire il Terminale. */
export function osservaTerminali(pagina) {
  return pagina.evaluate(() => {
    const Originale = window.Terminal;
    if (!Originale || window.__terminaliProva) return Boolean(Originale);
    window.__terminaliProva = [];
    window.Terminal = class extends Originale { constructor(...argomenti) { super(...argomenti); window.__terminaliProva.push(this); } };
    return true;
  });
}

export function righeDelTerminale(pagina) {
  return pagina.evaluate(() => (window.__terminaliProva ?? []).flatMap(term => {
    try {
      const buffer = term.buffer.active;
      return Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)?.translateToString(true) ?? '');
    } catch { return []; } // una scheda smontata nel frattempo
  }));
}
