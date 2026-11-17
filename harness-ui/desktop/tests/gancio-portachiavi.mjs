/*
 * 11/11/2026, round 3 of the shell keyring cure (judge v1401 K1, v1402 G1-G2). The trip wire every process started by the tests
 * carries: no test may reach the owner's real Windows keyring, whatever the launch looks like. Rounds 1-2 READ the text of the
 * launch sites; the controller then kept eleven mutants alive with launches the reader did not know (`spawnSync`, `fork`, a new
 * spec, a variable deleted between the check and the spawn, a shell that drops it before its own child). This file does not read
 * any launch: it sits in the processes themselves.
 *   1. In THIS process, `module.registerHooks` (nodejs.org/docs/latest-v24.x/api/module.html, «Synchronous customization hooks»,
 *      read 11/11/2026 through ctx7) stops every `import` and `require` of `@napi-rs/keyring`, of its native platform package
 *      (`@napi-rs/keyring-win32-x64-msvc`) and of any `keyring*.node`, and `process.dlopen` stops a `.node` loaded directly: a line
 *      goes to the trace file, the exit code becomes 97 and the load throws. The hooks see only what is loaded AFTER them, so a
 *      child gets this file through `--import` (NODE_OPTIONS), before its own entry point.
 *   2. EVERY child this process starts receives the hook, also when the caller hands an explicit `env` (even `{}`): the four async
 *      launch forms meet in `ChildProcess.prototype.spawn` (spawn, fork, exec, execFile), the three sync ones are wrapped by name
 *      and re-exported (`syncBuiltinESMExports`). `creaAvvioFiglio` drops NODE_OPTIONS on purpose (runtime.mjs:79): the hook is
 *      put back here, at the moment of the launch.
 *   3. Round k3 (judge v1521-v1522, PR #23): a child is NEVER refused for the shape of its options: it starts, with two walls in its
 *      environment that its own children inherit too, (1) always the hook in NODE_OPTIONS, (2) TALOS_HARNESS_UI_KEYRING=memoria when
 *      the child has no choice of its own (a test that sets one on purpose keeps it; the real keyring is blocked by wall 1 anyway).
 *      Node v24.22.2 hands the process_wrap binding positional arguments (lib/internal/child_process.js:438-447: file, args, cwd,
 *      envPairs, stdio, flags, uid, gid), v24.18.0 one options object (:401): both are read. Only a named real-user exemption that is
 *      not on the list still does not start (a request of the test, not a shape of the launch).
 * Precedent: Hermes marks every test process and its children (`tests/conftest.py:352-356`, `HERMES_TEST_ISOLATION`) and its
 * product refuses the real data under that mark (`hermes_state_guard.py:42-60`); here the mark is the loaded hook itself.
 * Never in the product: only `tests/support.mjs` and the tests import it.
 */
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import childProcess from 'node:child_process';
import workerThreads from 'node:worker_threads';
import { VARIABILE_REGISTRO_UTENTE_VERO, VARIABILE_UTENTE_VERO, esenzioneChiesta, esenzioneNominata } from './esenzioni-utente-vero.mjs';

export const SEGNO_GANCIO = Symbol.for('talos.prova.gancioPortachiavi');
/** Installed in this process (a marked test process, or a named real-user control): never twice. Not a mark for the product. */
const INSTALLATO = Symbol.for('talos.prova.gancioPortachiavi.installato');
export const URL_GANCIO = import.meta.url;
export const VARIABILE_REGISTRO = 'TALOS_PROVA_GANCIO_REGISTRO';
/** The product's explicit test mark (`src/guardia-portachiavi-prove.mjs`, P045): every child of a test process carries it. */
export const VARIABILE_PROVA_ISOLATA = 'TALOS_PROVA_ISOLATA';
export const OPZIONE_GANCIO = '--import=' + URL_GANCIO;
/** Wall 2 (round k3): the product's test keychain (`src/adattatore-keyring.mjs`, PORTACHIAVI_MEMORIA). */
export const VARIABILE_PORTACHIAVI = 'TALOS_HARNESS_UI_KEYRING';
export const PORTACHIAVI_DI_PROVA = 'memoria';
const registroDiSerie = join(dirname(dirname(fileURLToPath(import.meta.url))), '.prove', 'gancio-portachiavi.jsonl');

/** The trace file of this process: the one its parent handed down, or `desktop/.prove/gancio-portachiavi.jsonl`. */
export function registroDelGancio(env = process.env) {
  for (const nome of [VARIABILE_REGISTRO, VARIABILE_REGISTRO_UTENTE_VERO]) {
    const dato = Object.entries(env).find(([k]) => k.toUpperCase() === nome)?.[1];
    if (typeof dato === 'string' && dato.trim()) return dato.trim();
  }
  return registroDiSerie;
}

/** The keyring, by package name, native package, `.node` file or resolved URL. */
export function eDelPortachiavi(cosa) {
  let testo = String(cosa ?? '');
  try { testo = decodeURIComponent(testo); } catch {}
  return /(^|[\\/])@napi-rs[\\/]keyring(-[\w.-]+)?([\\/]|$)/i.test(testo) || /(^|[\\/])keyring[^\\/]*\.node$/i.test(testo);
}

function scrivi(riga) {
  const file = registroDelGancio();
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ ...riga, pid: process.pid, ppid: process.ppid, ora: new Date().toISOString() }) + '\n');
}

function blocca(modo, cosa, da) {
  scrivi({ tipo: 'bloccato', modo, cosa: String(cosa), da: da ? String(da) : null });
  process.exitCode = 97;
  throw Object.assign(new Error('TALOS-GANCIO-PORTACHIAVI: a test process tried to load the real Windows keyring (' + modo + ' ' + cosa
    + '). The shell tests must run with TALOS_HARNESS_UI_KEYRING=memoria (tests/support.mjs).'), { code: 'TALOS_GANCIO_PORTACHIAVI' });
}

/** A copy of `env` that carries the hook: one NODE_OPTIONS spelling with `--import=<this file>`, and the trace file. */
export function ambienteColGancio(env) {
  const copia = {};
  const opzioni = [];
  for (const [k, v] of Object.entries(env ?? {})) {
    if (k.toUpperCase() === 'NODE_OPTIONS') { if (typeof v === 'string' && v.trim()) opzioni.push(v.trim()); }
    else copia[k] = v;
  }
  const unite = opzioni.join(' ');
  const conGancio = unite.split(/\s+/).includes(OPZIONE_GANCIO) ? unite : (unite + ' ' + OPZIONE_GANCIO).trim();
  /* Round (k), 11/11: a real-user control of P045 asks BY NAME (`esenzioni-utente-vero.mjs`) for a child the hook does not mark. It
     gets the hook all the same (the trip wire: the real keyring cannot load in it) and its trace under a name the product does not
     read; the hook adds no mark (the caller's own env decides: `ambienteDaUtenteVero` hands none). A name not on the list does not start. */
  const esenzione = esenzioneChiesta(env);
  if (esenzione !== undefined) {
    if (!esenzioneNominata(esenzione)) rifiuta('a real-user exemption without a name of the list: ' + JSON.stringify(esenzione));
    const senzaTraccia = Object.fromEntries(Object.entries(copia).filter(([k]) => ![VARIABILE_REGISTRO, VARIABILE_REGISTRO_UTENTE_VERO].includes(k.toUpperCase())));
    return { ...senzaTraccia, NODE_OPTIONS: conGancio, [VARIABILE_REGISTRO_UTENTE_VERO]: registroDelGancio(env) };
  }
  copia.NODE_OPTIONS = conGancio;
  if (!Object.keys(copia).some(k => k.toUpperCase() === VARIABILE_REGISTRO)) copia[VARIABILE_REGISTRO] = registroDelGancio();
  // Wall 2 (round k3, judge v1522): the memory keychain, unless the child already has a choice of its own (kept as it is).
  if (!Object.keys(copia).some(k => k.toUpperCase() === VARIABILE_PORTACHIAVI)) copia[VARIABILE_PORTACHIAVI] = PORTACHIAVI_DI_PROVA;
  // Round 4 (P045): the product's own explicit mark rides along too (`src/guardia-portachiavi-prove.mjs`).
  if (!Object.keys(copia).some(k => k.toUpperCase() === VARIABILE_PROVA_ISOLATA)) copia[VARIABILE_PROVA_ISOLATA] = '1';
  return copia;
}

/** True when a child environment (object or `K=V` pairs) carries the hook and the trace file. */
export function portaIlGancio(env) {
  const voci = Array.isArray(env) ? env.map(c => { const i = String(c).indexOf('='); return [String(c).slice(0, i), String(c).slice(i + 1)]; })
    : Object.entries(env ?? {});
  const opzioni = voci.filter(([k]) => k.toUpperCase() === 'NODE_OPTIONS');
  const valore = nome => voci.find(([k]) => k.toUpperCase() === nome)?.[1];
  // a named real-user control child carries the hook and its trace under the exemption's own name (round k)
  const traccia = esenzioneNominata(valore(VARIABILE_UTENTE_VERO)) ? VARIABILE_REGISTRO_UTENTE_VERO : VARIABILE_REGISTRO;
  return opzioni.length === 1 && String(opzioni[0][1]).split(/\s+/).includes(OPZIONE_GANCIO)
    && String(valore(traccia) ?? '').trim() !== '';
}

function rifiuta(cosa) {
  scrivi({ tipo: 'rifiutato', cosa: String(cosa) });
  throw Object.assign(new Error('TALOS-GANCIO-PORTACHIAVI: the hook cannot be handed to this child (' + cosa + '), so it does not start.'), { code: 'TALOS_GANCIO_RIFIUTATO' });
}

function installa() {
  if (typeof registerHooks !== 'function' || typeof syncBuiltinESMExports !== 'function') {
    throw new Error('TALOS-GANCIO-PORTACHIAVI: this runtime has no module.registerHooks; the keyring trip wire cannot be installed.');
  }
  /* Round (k): a named real-user control of P045 (`esenzioni-utente-vero.mjs`) gets the trip wire but no mark: this process sets
     neither TALOS_PROVA_ISOLATA nor the hook's symbol, and its own children lose the exemption (they are marked again). */
  const esenteQui = esenzioneNominata(esenzioneChiesta(process.env)) ? esenzioneChiesta(process.env) : null;
  const perIlFiglio = env => ambienteColGancio(esenteQui ? Object.fromEntries(Object.entries(env ?? {}).filter(([k]) => ![VARIABILE_UTENTE_VERO, VARIABILE_REGISTRO_UTENTE_VERO].includes(k.toUpperCase()))) : env);
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (eDelPortachiavi(specifier)) blocca('resolve', specifier, context?.parentURL);
      const risolto = nextResolve(specifier, context);
      if (eDelPortachiavi(risolto?.url)) blocca('resolve', risolto.url, context?.parentURL);
      return risolto;
    },
    load(url, context, nextLoad) {
      if (eDelPortachiavi(url)) blocca('load', url);
      return nextLoad(url, context);
    },
  });
  const dlopen = process.dlopen;
  process.dlopen = function dlopenColGancio(modulo, file, ...resto) {
    if (eDelPortachiavi(file)) blocca('dlopen', file);
    return dlopen.call(this, modulo, file, ...resto);
  };
  /* Round k3: the pairs a child starts with, both walls in. Pairs that are not a list (none: the child inherits this process's env;
     anything else) start from this process's env, as the child would have; never a refusal. */
  const conGancio = (coppie) => Object.entries(perIlFiglio(Array.isArray(coppie)
    ? Object.fromEntries(coppie.map(c => { const s = String(c); const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }))
    : process.env)).map(([k, v]) => k + '=' + v);
  const { ChildProcess } = childProcess;
  const spawnVero = ChildProcess.prototype.spawn;
  ChildProcess.prototype.spawn = function spawnColGancio(opzioni) {
    // options that are not an object: node's own validation answers (ERR_INVALID_ARG_TYPE), never the hook
    if (opzioni !== null && typeof opzioni === 'object') opzioni.envPairs = conGancio(opzioni.envPairs);
    return spawnVero.call(this, opzioni);
  };
  /* Last piece of round 4 (owner 11/11 09:41, «segno obbligatorio nelle prove»): on a saturated machine the product guard's ancestry
     read times out, so the explicit mark must already be on every child. The raw channels the controller used get it too: the
     `spawn_sync` and `process_wrap` bindings (hook + mark, as above) and a Worker with its own env (the mark; a worker has no
     NODE_OPTIONS of its own). This process is a test process: it carries the mark itself, so default and SHARE_ENV workers do. */
  if (!esenteQui && !Object.keys(process.env).some(k => k.toUpperCase() === VARIABILE_PROVA_ISOLATA)) process.env[VARIABILE_PROVA_ISOLATA] = '1';
  const legame = process.binding('spawn_sync');
  const legameVero = legame.spawn;
  legame.spawn = function spawnSyncLegatoColGancio(opzioni, ...resto) {
    if (opzioni !== null && typeof opzioni === 'object') opzioni.envPairs = conGancio(opzioni.envPairs);
    else scrivi({ tipo: 'forma-sconosciuta', legame: 'spawn_sync', cosa: typeof opzioni });
    return legameVero.call(this, opzioni, ...resto);
  };
  const { Process } = process.binding('process_wrap');
  const processoVero = Process.prototype.spawn;
  Process.prototype.spawn = function processWrapColGancio(...argomenti) {
    // node <= 24.18: one options object; node >= 24.22: (file, args, cwd, envPairs, stdio, flags, uid, gid)
    if (argomenti[0] !== null && typeof argomenti[0] === 'object') argomenti[0].envPairs = conGancio(argomenti[0].envPairs);
    else argomenti[3] = conGancio(argomenti[3]);
    return processoVero.apply(this, argomenti);
  };
  const WorkerVero = workerThreads.Worker;
  workerThreads.Worker = class WorkerColSegno extends WorkerVero {
    constructor(file, opzioni) {
      const env = opzioni?.env;
      if (!esenteQui && env !== undefined && env !== workerThreads.SHARE_ENV) {
        // an env that is not an object: the Worker's own validation answers, never the hook
        if (env !== null && typeof env === 'object') opzioni = { ...opzioni, env: Object.keys(env).some(k => k.toUpperCase() === VARIABILE_PROVA_ISOLATA) ? env : { ...env, [VARIABILE_PROVA_ISOLATA]: '1' } };
      }
      super(file, opzioni);
    }
  };
  for (const nome of ['spawnSync', 'execSync', 'execFileSync']) {
    const vero = childProcess[nome];
    childProcess[nome] = function sincronoColGancio(comando, secondo, terzo) {
      // The argument shapes of node's own normalizeSpawnArguments: (cmd[, args][, options]); execSync is (cmd[, options]).
      const conArgomenti = nome !== 'execSync';
      const argomenti = conArgomenti && Array.isArray(secondo) ? secondo : [];
      const date = !conArgomenti ? secondo : (Array.isArray(secondo) || secondo == null ? terzo : secondo);
      // options that are not an object: node's own validation answers (ERR_INVALID_ARG_TYPE), never the hook
      if (date != null && typeof date !== 'object') return vero.apply(this, arguments);
      const opzioni = { ...(date ?? {}), env: perIlFiglio(date?.env ?? process.env) };
      return conArgomenti ? vero.call(this, comando, argomenti, opzioni) : vero.call(this, comando, opzioni);
    };
  }
  syncBuiltinESMExports();
  globalThis[INSTALLATO] = true;
  if (!esenteQui) globalThis[SEGNO_GANCIO] = Object.freeze({ url: URL_GANCIO, registro: registroDelGancio() });
  scrivi({ tipo: 'caricato', eseguibile: process.execPath, avvio: process.argv[1] ?? null, ...(esenteQui ? { esenzione: esenteQui } : {}) });
}

/** The trace lines, from the n-th on (one test reads only what its own launch wrote). */
export function righeDelGancio(registro = registroDelGancio(), da = 0) {
  let testo = '';
  try { testo = readFileSync(registro, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return testo.split('\n').filter(Boolean).slice(da).map(r => JSON.parse(r));
}

if (!globalThis[INSTALLATO] && !globalThis[SEGNO_GANCIO]) installa();
