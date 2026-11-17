/*
 * ⛔⛔ P045 (11/11/2026, owner via the judge, v1404-v1407) — A TEST RUN NEVER OPENS THE REAL SYSTEM KEYCHAIN.
 *
 * Rounds 1-3 kept the tests away from the owner's Windows Credential Manager from the TEST side (`memoria`, then a hook that every
 * test process carries). The controller of round 3 still found four roads with no trace: a child started through the
 * `spawn_sync` binding, a shell that drops NODE_OPTIONS before its own node child, a worker thread, a `.node` with another name.
 * This is the PRODUCT side: the one function that imports `@napi-rs/keyring` (`creaAdattatorePortachiaviSistema`) asks here first.
 *
 * The mark is ONLY EXPLICIT (judge P1, read by the owner: «never guessed»), never deduced from folders:
 *   1. the environment: `TALOS_PROVA_ISOLATA` (ours, set by `desktop/tests/support.mjs` and handed to every child by the test hook),
 *      `TALOS_PROVA_GANCIO_REGISTRO` (the hook's trace), `NODE_TEST_CONTEXT` / `NODE_TEST_WORKER_ID` (set by `node --test` for its
 *      test files, nodejs.org/docs/latest-v24.x/api/test.html, read 11/11/2026 through ctx7), the hook loaded in this process, or
 *      `--test` in this process's own `execArgv` (`--test-isolation=none`);
 *   2. the ancestry, because a child started with a rebuilt environment loses every variable at once: an ancestor whose command
 *      line is `node … --test`, `playwright … test` or carries the test hook. Hermes does exactly this (`hermes_state_guard.py:89-114`,
 *      `_has_pytest_ancestor`: «Ancestry is the one test-context signal that survives an env rebuild»).
 * NOT a mark: a custom TALOS_HOME, APPDATA, data folder or profile. A real user on any folder keeps a working keychain (decision 375).
 *
 * The cost for the real user (judge v1407): the ancestry is read ONCE, in parallel, from the moment the server starts
 * (`guardia-portachiavi-prove.avvio.mjs`, imported third by `server.mjs`), and only the first keychain access waits for it, at most
 * 1 s COUNTED FROM THAT ACCESS (last round, owner 11/11 10:42: counted from the start, the module graph ate the second while the
 * finished read waited for the thread — 13 «tempo» in 20 at normal load, controller 11/11; now `attendiAntenati`). A parent
 * that is already gone (a detached start, `cmd /c start`) leaves nothing to walk: no read at all (`process.kill(ppid, 0)`). Windows
 * reads the chain of THIS pid through the Windows Script Host (`cscript`, WMI `Win32_Process`, 120-600 ms measured on 11/11, against
 * 1200-1900 ms for PowerShell), hidden, reading the command line of the ancestors only; Linux reads `/proc`. Unreadable, refused or slower than 1 s ⇒ no mark, as Hermes does («Fails open»): the
 * environment mark still holds, and a real user never loses the keychain because WMI is slow.
 * The log line names the mark it saw (a variable or an ancestor, and which) and never a value or a path.
 */
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Our explicit mark: `1` in every process the desktop tests start. */
export const VARIABILE_PROVA_ISOLATA = 'TALOS_PROVA_ISOLATA';
/** The environment names that mark a test run, in the order they are reported. */
export const NOMI_DEL_SEGNO = Object.freeze([VARIABILE_PROVA_ISOLATA, 'TALOS_PROVA_GANCIO_REGISTRO', 'NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID']);
const SEGNO_GANCIO = Symbol.for('talos.prova.gancioPortachiavi');
/** The person's wait at the FIRST keychain access, at most, counted from that access: then «no mark» (judge v1407: at most 1 s). */
export const TEMPO_MASSIMO_ANTENATI_MS = 1000;
/** The life of the `cscript` child, whatever happens (a hung WMI): nobody waits for it, only the first access waits, see above. */
export const TEMPO_VITA_LETTURA_MS = 10000;
const COPIONE_WINDOWS = fileURLToPath(new URL('./guardia-portachiavi-prove.wsf', import.meta.url));
const SEPARA_RIGHE = '\u001e';
const SEPARA_CAMPI = '\u001f';

/** The mark in the environment (or in this very process), or null. Only names, never a value. */
export function segnoNellAmbiente(env = process.env, execArgv = process.execArgv) {
  const chiavi = Object.keys(env ?? {});
  for (const nome of NOMI_DEL_SEGNO) {
    const chiave = chiavi.find(k => k.toUpperCase() === nome);
    if (chiave !== undefined && String(env[chiave] ?? '').trim() !== '') return Object.freeze({ tipo: 'variabile', nome });
  }
  if (globalThis[SEGNO_GANCIO]) return Object.freeze({ tipo: 'gancio', nome: 'gancio-portachiavi' });
  if (Array.isArray(execArgv) && execArgv.includes('--test')) return Object.freeze({ tipo: 'argomento', nome: '--test' });
  return null;
}

/** A command line in tokens (double quotes group, as Windows writes them). */
export function tokenDellaRiga(riga) {
  const token = [];
  for (const m of String(riga ?? '').matchAll(/"([^"]*)"|(\S+)/g)) token.push(m[1] ?? m[2]);
  return token;
}

const nomeBase = t => String(t).replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop().toLowerCase();

/** Which test launcher a command line is: 'node --test', 'playwright test', 'gancio-portachiavi', or null. */
export function lanciatoreDiProva(riga) {
  const token = Array.isArray(riga) ? riga.map(String) : tokenDellaRiga(riga);
  if (!token.length) return null;
  if (token.some(t => nomeBase(t.replace(/^--(import|require)=/, '')) === 'gancio-portachiavi.mjs')) return 'gancio-portachiavi';
  const eseguibile = nomeBase(token[0]);
  if ((eseguibile === 'node' || eseguibile === 'node.exe') && token.slice(1).includes('--test')) return 'node --test';
  const playwright = token.findIndex(t => {
    const n = String(t).replace(/\\/g, '/').toLowerCase();
    return n.endsWith('/playwright/cli.js') || n.endsWith('/@playwright/test/cli.js') || ['playwright', 'playwright.cmd', 'playwright.exe'].includes(nomeBase(t));
  });
  if (playwright >= 0 && token.slice(playwright + 1).includes('test')) return 'playwright test';
  return null;
}

/**
 * The walk up from `pid` in a process table (`pid → { ppid, nato, riga }`): an ancestor counts only if it was born BEFORE its child
 * (a dead parent's pid reused by another process is not a parent: without this a real user could be refused by chance). Pure.
 * @returns {null | { tipo: 'antenato', nome: string, livello: number }}
 */
export function antenatoDiProva(tabella, pid) {
  let figlio = tabella.get(pid);
  const visti = new Set([pid]);
  for (let livello = 1; figlio && livello <= 64; livello += 1) {
    const ppid = figlio.ppid;
    if (!ppid || visti.has(ppid)) return null;
    visti.add(ppid);
    const padre = tabella.get(ppid);
    if (!padre) return null;
    if (padre.nato === undefined || figlio.nato === undefined || padre.nato > figlio.nato) return null;
    const nome = lanciatoreDiProva(padre.riga);
    if (nome) return Object.freeze({ tipo: 'antenato', nome, livello });
    figlio = padre;
  }
  return null;
}

/** The Windows Script Host output (records and fields split by RS/US) in a table. WMI dates (yyyymmddHHMMSS.ffffff±UUU) compare as text. */
export function tabellaDaWindows(testo) {
  const tabella = new Map();
  for (const record of String(testo ?? '').split(SEPARA_RIGHE)) {
    const [pid, ppid, nato, riga = ''] = record.split(SEPARA_CAMPI);
    const n = Number(pid);
    if (!Number.isSafeInteger(n) || !/^\d{14}\.\d{6}/.test(nato ?? '')) continue;
    tabella.set(n, { ppid: Number(ppid) || 0, nato: nato.slice(0, 21), riga });
  }
  return tabella;
}

function leggiWindows(tempoMassimo, pid) {
  return new Promise((fatto) => {
    const cscript = join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'cscript.exe');
    /* SPAWN-AMBIENTE-01 (round k3, 11/11): the reader gets only what Windows Script Host and WMI need, never the server's whole
       environment (the local API token, receipt keys, search key). */
    const ambiente = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(SystemRoot|windir|SystemDrive|TEMP|TMP|PATH|PATHEXT|ComSpec)$/i.test(k)));
    let figlio;
    try {
      figlio = execFile(cscript, ['//NoLogo', '//B', COPIONE_WINDOWS, String(pid)], { windowsHide: true, timeout: tempoMassimo, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', env: ambiente },
        (errore, stdout) => fatto(errore ? null : tabellaDaWindows(stdout)));
    } catch { fatto(null); return; }
    figlio.on('error', () => fatto(null));
  });
}

function leggiLinux() {
  const tabella = new Map();
  for (const voce of readdirSync('/proc')) {
    if (!/^\d+$/.test(voce)) continue;
    try {
      const stat = readFileSync(`/proc/${voce}/stat`, 'utf8');
      const dopo = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const riga = readFileSync(`/proc/${voce}/cmdline`, 'utf8').split('\0').filter(Boolean);
      tabella.set(Number(voce), { ppid: Number(dopo[1]) || 0, nato: Number(dopo[19]), riga });
    } catch { /* a process that ended while reading */ }
  }
  return tabella;
}

/** The process table of this machine, or null when it cannot be read in time. */
export async function leggiTabellaProcessi({ piattaforma = process.platform, tempoMassimo = TEMPO_MASSIMO_ANTENATI_MS, pid = process.pid } = {}) {
  try {
    if (piattaforma === 'win32') return await leggiWindows(tempoMassimo, pid);
    if (piattaforma === 'linux') return leggiLinux();
  } catch { /* fails open */ }
  return null;
}

let letturaInCorso = null;
let decisione = null;

/** True while the process `pid` exists (signal 0 only asks; EPERM means it exists and is someone else's). `segnala` is for the tests. */
export function processoVivo(pid, segnala = process.kill) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { segnala(pid, 0); return true; } catch (errore) { return errore?.code === 'EPERM'; }
}

/**
 * The ancestry read, started at most once per process (or thread) and shared, WITHOUT a deadline of its own (the cscript child lives
 * at most `TEMPO_VITA_LETTURA_MS`): `{ segno, stato: 'letto'|'illeggibile'|'senza-genitore' }`. Never rejects. The options are for the tests.
 */
export function avviaLetturaAntenati({ leggi = leggiTabellaProcessi, pid = process.pid, ppid = process.ppid, vivo = processoVivo } = {}) {
  if (letturaInCorso) return letturaInCorso;
  if (!vivo(ppid)) { letturaInCorso = Promise.resolve(Object.freeze({ segno: null, stato: 'senza-genitore' })); return letturaInCorso; }
  letturaInCorso = Promise.resolve().then(() => leggi({ tempoMassimo: TEMPO_VITA_LETTURA_MS, pid })).then(
    (tabella) => Object.freeze(tabella ? { segno: antenatoDiProva(tabella, pid), stato: 'letto' } : { segno: null, stato: 'illeggibile' }),
    () => Object.freeze({ segno: null, stato: 'illeggibile' }));
  return letturaInCorso;
}

/**
 * The FIRST keychain access asks here, once, and the answer is shared: the read (already under way since the start, or started now),
 * or `{ segno: null, stato: 'tempo' }` when it is not there `tempoMassimo` after THIS call. Counting from the access, not from the start,
 * gives the read all the module-loading time for free and bounds what the person waits: a read that finished while the thread was busy
 * BEFORE this call is handled before this timer can fire (the timer is armed only now; it was the timer of the start that fired first,
 * controller 11/11, `esperimento-ciclo`).
 * ⚠ It holds ONLY if the thread is free after this call (round k, controller's reperto A1, measured 5/5 by injection): when the access
 * arms the timer and the thread then stays busy past `tempoMassimo`, the event loop runs the due timers before the poll phase that
 * delivers the finished read, so the answer is «tempo» with the read already done. Accepted on purpose: the person never waits more
 * than about 1 s and «tempo» fails open (a real user keeps the keychain); a test process does not rely on the read, its explicit mark
 * decides first (every child of a test carries it, `desktop/tests/gancio-portachiavi.mjs`). P045-22 pins this behaviour.
 */
export function attendiAntenati({ tempoMassimo = TEMPO_MASSIMO_ANTENATI_MS, ...lettura } = {}) {
  if (decisione) return decisione;
  const inCorso = avviaLetturaAntenati(lettura);
  decisione = new Promise((fatto) => {
    const scadenza = setTimeout(() => fatto(Object.freeze({ segno: null, stato: 'tempo' })), tempoMassimo);
    inCorso.then((esito) => { clearTimeout(scadenza); fatto(esito); });
  });
  return decisione;
}

/** For the tests only: forget the shared read and the shared decision. */
export function dimenticaLetturaAntenati() { letturaInCorso = null; decisione = null; }

/** The mark of a test run: the environment handed in and this process's own (no read needed), then the ancestry. Null for a real user. */
export async function segnoDiProva({ env = process.env, execArgv = process.execArgv, ambienteDelProcesso = process.env, antenati = attendiAntenati } = {}) {
  return segnoNellAmbiente(env, execArgv) ?? segnoNellAmbiente(ambienteDelProcesso, execArgv) ?? (await antenati()).segno ?? null;
}

/** The one log line of the refusal: the kind and the NAME of the mark, never a value of the environment nor a path. */
export function rigaDellaGuardia(segno) {
  const tipi = { variabile: 'variable', gancio: 'test hook', argomento: 'argument', antenato: 'ancestor' };
  const tipo = tipi[segno?.tipo] ?? 'mark';
  const nome = [...NOMI_DEL_SEGNO, 'gancio-portachiavi', '--test', 'node --test', 'playwright test'].includes(segno?.nome) ? segno.nome : 'unknown';
  return `[provider-store] test run (${tipo} ${nome}): the real system keychain is not opened, this server has no keychain`
    + ` / prova (${tipo} ${nome}): il portachiavi vero del sistema non si apre, questo server resta senza portachiavi`;
}
