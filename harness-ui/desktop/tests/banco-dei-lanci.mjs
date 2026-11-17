/*
 * 11/11/2026, round 3 (judge v1401 K1-K6): the BENCH of the launches. Round 2 cut one call at a time out of a spec and ran only that
 * call; whatever happened around it (a variable deleted between the check and the spawn, `spawnSync`, `fork`, a second spec file)
 * was invisible. The bench runs the WHOLE spec text instead (every test body, every helper), with every free name replaced:
 *   - every child-process function of the real `node:child_process` (names read from the module, never listed by hand) and every
 *     `.launch(` (Playwright's `_electron.launch`) is a RECORDER: it copies the environment the child would get AT THE MOMENT of the
 *     call, notes the spec line from the stack, and starts nothing;
 *   - the pure helpers of the shell are the real ones (`preparaRuntime`, `creaAvvioFiglio`, the keyring readers, `node:path`);
 *   - everything else (files, sockets, windows, `assert`, timers) is an inert stand-in that answers everything and does nothing, so a
 *     body runs on past its first window step to its later launches (`guscio.spec.mjs:208`), and no file or process is touched.
 * The `process` a spec sees has the runner's environment WITHOUT the in-memory keyring and WITH invented provider keys (K2, K5): the
 * verdict does not depend on who runs it. Pure: nothing is launched, nothing is written but the one `preparaRuntime` folder.
 * The module text runs inside `with (scope)` (MDN «with», «Symbol.unscopables», read 11/11/2026): a Function built at run time is
 * sloppy, and the Proxy's `has` trap claims every name except the few real globals listed below.
 */
import * as percorso from 'node:path';
import * as indirizzi from 'node:url';
import * as cripto from 'node:crypto';
import * as processiFigli from 'node:child_process';

export const NOME = 'TALOS_HARNESS_UI_KEYRING';
/** Invented values, never real ones: planted in the runner's environment so a leak to a child is seen by name AND by value. */
export const CHIAVI_FINTE = Object.freeze({
  GEMINI_API_KEY: 'finto-banco-gemini-0001', OPENAI_API_KEY: 'finto-banco-openai-0002', OPENROUTER_API_KEY: 'finto-banco-openrouter-0003',
  ANTHROPIC_API_KEY: 'finto-banco-anthropic-0004', HF_TOKEN: 'finto-banco-hf-0005', FINTO_PROVA_API_KEY: 'finto-banco-altra-0006',
});
/** The launch names: every function the real child-process module exports, plus Playwright's `launch`. */
export const NOMI_DI_LANCIO = new Set([...Object.keys(processiFigli).filter(k => typeof processiFigli[k] === 'function' && /^[a-z]/.test(k)), 'launch']);
const GLOBALI_VERI = new Set(['Object', 'Array', 'Math', 'String', 'Number', 'Boolean', 'Promise', 'Symbol', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'Map', 'Set', 'WeakMap', 'WeakSet', 'RegExp', 'Buffer', 'URLSearchParams', 'encodeURIComponent', 'decodeURIComponent',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Infinity', 'NaN', 'undefined', 'BigInt', 'Reflect', 'Proxy', 'Intl', 'queueMicrotask']);
const INERTE = Symbol('inerte');
export const eInerte = v => typeof v === 'function' && v[INERTE] === true;

/** The environment of whoever runs the tests, as the bench lets a spec see it: no test keyring, invented keys planted. */
export function ambienteDiChiCorre() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== NOME && !(k.toUpperCase() in CHIAVI_FINTE)));
  return { ...env, ...CHIAVI_FINTE };
}

/** Index just after the bracket that closes the one at `apertura`, skipping strings, templates and comments. */
export function chiusura(testo, apertura) {
  const coppie = { '(': ')', '[': ']', '{': '}' };
  const pila = [];
  for (let i = apertura; i < testo.length; i++) {
    const c = testo[i];
    if (c === '/' && testo[i + 1] === '/') { i = testo.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && testo[i + 1] === '*') { i = testo.indexOf('*/', i + 2) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') { i = fineStringa(testo, i); continue; }
    if (c === '/' && eRegex(testo, i)) { i = fineRegex(testo, i); continue; }
    if (coppie[c]) pila.push(coppie[c]);
    else if (c === ')' || c === ']' || c === '}') {
      if (pila.pop() !== c) throw new Error('Unbalanced ' + c + ' at line ' + rigaDi(testo, i));
      if (!pila.length) return i + 1;
    }
  }
  throw new Error('Unbalanced bracket from line ' + rigaDi(testo, apertura));
}
export function fineStringa(testo, i) {
  const quota = testo[i];
  for (let j = i + 1; j < testo.length; j++) {
    if (testo[j] === '\\') { j++; continue; }
    if (testo[j] === quota) return j;
    if (quota === '`' && testo[j] === '$' && testo[j + 1] === '{') { j = chiusura(testo, j + 1) - 1; continue; }
    if (quota !== '`' && testo[j] === '\n') break;
  }
  throw new Error('Unterminated string at line ' + rigaDi(testo, i));
}
export const rigaDi = (testo, indice) => testo.slice(0, indice).split('\n').length;
/** A `/` that opens a regular expression literal: what stands before it cannot end an expression (MDN «Lexical grammar»). */
export function eRegex(testo, i) {
  if (testo[i + 1] === '/' || testo[i + 1] === '*') return false;
  let j = i - 1;
  while (j >= 0 && /\s/.test(testo[j])) j--;
  if (j < 0) return true;
  if (/[(,=:[!&|?{};+\-*%<>~^]/.test(testo[j])) return true;
  const parola = testo.slice(0, j + 1).match(/([A-Za-z_$][\w$]*)$/);
  return Boolean(parola && /^(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(parola[1]));
}
/** The index of the `/` that closes the regular expression opened at `i` (escapes and character classes skipped). */
export function fineRegex(testo, i) {
  let classe = false;
  for (let j = i + 1; j < testo.length; j++) {
    const c = testo[j];
    if (c === '\\') { j++; continue; }
    if (c === '\n') break;
    if (c === '[') classe = true;
    else if (c === ']') classe = false;
    else if (c === '/' && !classe) return j;
  }
  throw new Error('Unterminated regular expression at line ' + rigaDi(testo, i));
}
/** The text with comments blanked (same length, same lines): a comment naming a function is not a reference (C12). */
export function senzaCommenti(testo) {
  let fuori = '';
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (c === '/' && testo[i + 1] === '/') { const fine = testo.indexOf('\n', i); const f = fine < 0 ? testo.length : fine; fuori += ' '.repeat(f - i); i = f - 1; continue; }
    if (c === '/' && testo[i + 1] === '*') { const f = testo.indexOf('*/', i + 2) + 2; fuori += testo.slice(i, f).replace(/[^\n]/g, ' '); i = f - 1; continue; }
    if (c === '\'' || c === '"' || c === '`') { const f = fineStringa(testo, i); fuori += testo.slice(i, f + 1); i = f; continue; }
    if (c === '/' && eRegex(testo, i)) { const f = fineRegex(testo, i); fuori += testo.slice(i, f + 1); i = f; continue; }
    fuori += c;
  }
  return fuori;
}

/** Code only: comments AND string contents blanked (same length, same lines). An identifier counted here is a real reference. */
export function soloCodice(testo) {
  const senza = senzaCommenti(testo);
  let fuori = '';
  for (let i = 0; i < senza.length; i++) {
    const c = senza[i];
    if (c === '\'' || c === '"' || c === '`') { const f = fineStringa(senza, i); fuori += c + senza.slice(i + 1, f).replace(/[^\n]/g, ' ') + senza[f]; i = f; continue; }
    if (c === '/' && eRegex(senza, i)) { const f = fineRegex(senza, i); fuori += '/' + ' '.repeat(f - i - 1) + '/'; i = f; continue; }
    fuori += c;
  }
  return fuori;
}
/** The only shell specs no keyring test runs, each with its reason (K4: every other spec of the folder is in by itself). */
export const SPEC_FUORI = Object.freeze({
  'installer.spec.mjs': 'installs and starts the REAL installed app on purpose (declared «real» by the judge, never run on this PC)',
});

/** An inert stand-in: callable, constructible, awaitable as itself, iterable as empty, a string as ''. `sopra` wins over it. */
export function inerte(nome, sopra = {}, quandoLancio = null) {
  const f = function () {};
  f[INERTE] = true;
  return new Proxy(f, {
    get(t, k) {
      if (k === INERTE) return true;
      if (typeof k === 'string' && Object.hasOwn(sopra, k)) return sopra[k];
      if (k === 'then') return undefined;
      if (k === Symbol.toPrimitive || k === 'toString' || k === 'valueOf' || k === 'toJSON') return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.asyncIterator) return async function* () {};
      if (typeof k === 'symbol') return undefined;
      if (k === 'length') return 0;
      if (quandoLancio && NOMI_DI_LANCIO.has(k)) return (...a) => quandoLancio(nome + '.' + k, k, a);
      return inerte(nome + '.' + k, {}, quandoLancio);
    },
    apply: () => inerte(nome + '()', {}, quandoLancio),
    construct: () => inerte('new ' + nome, {}, quandoLancio),
    set: () => true, has: () => true, deleteProperty: () => true, defineProperty: () => true,
  });
}

/** Each `import … from '…'` of a module text, blanked in place (lines kept), with what it binds. Unknown forms are red. */
export function importazioni(testo, dove) {
  const legami = [];
  const vuoto = testo.replace(/^import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?/gm, (tutto, clausola, _q, modulo) => {
    const c = clausola.trim();
    const m = c.match(/^(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([\s\S]*)\}|\*\s+as\s+([A-Za-z_$][\w$]*))?$/);
    if (!m) throw new Error(dove + ': an import this bench cannot read: ' + c);
    if (m[1]) legami.push({ modulo, nome: m[1], esportato: 'default' });
    if (m[3]) legami.push({ modulo, nome: m[3], esportato: '*' });
    for (const voce of (m[2] ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
      const [esportato, nome] = voce.split(/\s+as\s+/);
      legami.push({ modulo, nome: (nome ?? esportato).trim(), esportato: esportato.trim() });
    }
    return tutto.replace(/[^\n]/g, ' ');
  });
  if (/^\s*import\s*['"]/m.test(vuoto)) throw new Error(dove + ': a bare import this bench cannot follow');
  return { testo: vuoto, legami };
}

/**
 * Runs a module text (or a function body) with every free name taken from `ambito`, real globals kept, the rest inert.
 * `lanci` receives every launch with the environment it would hand over, read at the moment of the call.
 */
const SCOSTAMENTO = 3; // «async function anonymous(__ambito\n) {\n» plus the «with» line: text line 1 is source line 4
/** The recorder of the launches of one bench run: the environment is copied at the call, the line read from the stack. */
export function creaRegistratore({ file, processo, lanci }) {
  const registra = (chi, api, argomenti) => {
    const pila = new Error().stack.split('\n');
    const posto = pila.map(r => r.match(/<anonymous>:(\d+):(\d+)/)).find(Boolean);
    const riga = posto ? Number(posto[1]) - SCOSTAMENTO : null;
    let opzioni = null;
    if (api === 'launch') opzioni = argomenti[0];
    else if (api === 'exec' || api === 'execSync') opzioni = argomenti[1];
    else opzioni = argomenti.slice(1).find(a => a && typeof a === 'object' && !Array.isArray(a) && !eInerte(a)) ?? (eInerte(argomenti[1]) ? argomenti[1] : null);
    const dato = opzioni && typeof opzioni === 'object' ? opzioni.env : (eInerte(opzioni) ? opzioni : undefined);
    const ambiente = dato === undefined ? { ...processo.env } : (dato && typeof dato === 'object' && !eInerte(dato) ? { ...dato } : dato);
    lanci.push({ file, riga, chi, api, ambiente });
    if (api === 'spawnSync') return inerte('esito', { status: 1, pid: 0, stdout: '', stderr: '', output: [] });
    if (api === 'execSync' || api === 'execFileSync') return '';
    return inerte(chi, { exitCode: null, pid: 4242, connected: false, killed: false }, registra);
  };
  return registra;
}

export async function eseguiNelBanco(testo, { ambito = {}, file, processo, registra, attesaMs = 1500 }) {
  const corpo = 'with (__ambito) {\n' + testo.replace(/\bimport\.meta\b/g, '__importMeta').replace(/\bimport\s*\(/g, '__importa(') + '\n}';
  const scope = { ...ambito };
  for (const nome of NOMI_DI_LANCIO) if (!(nome in scope) && nome !== 'launch') scope[nome] = (...a) => registra(nome, nome, a);
  let fermo = false;
  const orologio = { t: Date.now() };
  class DataDelBanco extends Date { static now() { orologio.t += 1000; return orologio.t; } }
  Object.assign(scope, {
    process: processo, Date: DataDelBanco,
    __importMeta: { url: indirizzi.pathToFileURL(file).href, filename: file, dirname: percorso.dirname(file) },
    __importa: async () => inerte('import()', {}, registra),
    setTimeout: fn => { if (!fermo && typeof fn === 'function') setImmediate(() => { if (!fermo) fn(); }); return inerte('timer'); },
    setInterval: () => inerte('timer'), setImmediate: fn => { if (!fermo && typeof fn === 'function') setImmediate(() => { if (!fermo) fn(); }); return inerte('timer'); },
    console: inerte('console'),
    // A page or a server the bench never started has no address: `new URL` of a stand-in is a stand-in, not a crash.
    URL: new Proxy(URL, { construct: (T, a) => { try { if (a.some(eInerte)) throw new Error(); return new T(...a); } catch { return inerte('URL', {}, registra); } } }),
    JSON: { stringify: JSON.stringify, parse: (t, ...r) => { if (eInerte(t)) return inerte('JSON.parse()', {}, registra); try { return JSON.parse(t, ...r); } catch { return inerte('JSON.parse()', {}, registra); } } },
  });
  const proxy = new Proxy(scope, {
    has: (t, k) => typeof k === 'string' && (k in t || !GLOBALI_VERI.has(k)),
    get: (t, k) => {
      if (typeof k === 'symbol') return undefined;
      if (k in t) return t[k];
      return inerte(k, {}, registra);
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const AsyncFunction = (async () => {}).constructor;
  let funzione;
  try { funzione = new AsyncFunction('__ambito', corpo); } catch (e) { throw new Error(file + ': the bench cannot compile this text: ' + e.message); }
  const corri = promessa => Promise.race([promessa.then(() => 'fine', e => 'errore: ' + (e?.message ?? e)),
    new Promise(r => setTimeout(() => r('tempo'), attesaMs))]);
  const esito = await corri(funzione(proxy));
  /** Runs one collected test body (a closure made inside the scope above), capped like the module text. */
  const corpo1 = fn => corri(Promise.resolve().then(() => fn(inerte('t', {}, registra))));
  return { esito, corpo: corpo1, ferma: () => { fermo = true; } };
}

/** The real pure helpers, made tolerant of inert values (a stand-in path becomes a placeholder path, never a crash). */
const SEGNAPOSTO = percorso.join(process.platform === 'win32' ? 'C:\\' : '/', 'banco-dei-lanci', 'sconosciuto');
const aTesto = v => (eInerte(v) ? SEGNAPOSTO : v);
export function tollerante(modulo) {
  return Object.fromEntries(Object.entries(modulo).map(([k, v]) => [k, typeof v === 'function' && !/^[A-Z]/.test(k)
    ? (...a) => v(...a.map(aTesto)) : v]));
}
/** Options objects handed to a real helper: inert values become the placeholder path, one level down (`percorsi` too). */
export function opzioniTolleranti(o) {
  if (!o || typeof o !== 'object' || eInerte(o)) return o;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, eInerte(v) ? SEGNAPOSTO
    : (v && typeof v === 'object' && !Array.isArray(v) && k !== 'env' ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, aTesto(b)])) : v)]));
}
export const moduliVeri = { 'node:path': tollerante(percorso), 'node:url': tollerante(indirizzi), 'node:crypto': cripto };
