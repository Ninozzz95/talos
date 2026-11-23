/*
 * «One line», step 3 (11/11/2026, brief point c): the ONE exemption the terminal's tests need from the keyring trip wire.
 *
 * `run-tests.mjs` loads the trip wire (`percorsi.mjs`, `gancioInUso()`) and then this file, both through NODE_OPTIONS. Nineteen
 * tests (`doctor-keyring`, `keyring-reasons`, `keyring`) write a FAKE `@napi-rs/keyring` (plain JavaScript, a Map) into their
 * temporary folder and check where the product finds it; the trip wire refuses every keyring by name, the fake ones too.
 *
 * What passes, and nothing else:
 *   - the bare name `@napi-rs/keyring` asked from a file INSIDE the run's private temp folder (`TALOS_PROVA_FINTI_PORTACHIAVI`,
 *     a folder named `talos-cli-test-run-*`): it is resolved as Node does (each `node_modules` going up, the first one found
 *     wins, `main` or `index.js`), and it passes only if that first hit, after following links, is a `.js`/`.cjs` file inside the
 *     same folder. A first hit anywhere else goes on to the trip wire, which refuses it; no hit at all is MODULE_NOT_FOUND, as
 *     Node would say (never a load);
 *   - a `.js`/`.cjs` file of a `@napi-rs/keyring` folder asked by absolute path, when its real path is inside that folder.
 * A `.node` file, the native platform package, the real package (`cli/node_modules`, `harness-ui/node_modules`, a drive-root
 * `node_modules`) and a fake outside the run's folder never pass: they reach the trip wire (`blocca`, exit 97).
 * Hooks registered later run first (nodejs.org/docs/latest-v24.x/api/module.html, «registerHooks() more than once forms LIFO
 * chains», read 11/11/2026 through ctx7), so the trip wire is imported HERE, before these hooks: an exempted fake never reaches
 * it, everything else does.
 * Children: every launch ends in the `spawn_sync` or `process_wrap` binding; here both hand the child this file and the folder
 * again (the trip wire adds itself on its own), so a test's child that resolves a fake (`keyring-reasons.test.ts:141`) gets the
 * same exemption and nothing wider.
 * Precedent: Hermes keeps one explicit list of what its hermetic run lets through, «no HERMES_TEST_* glob» (`scripts/run_tests.sh:207-215`).
 */
import {existsSync, readFileSync, realpathSync, statSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {basename, dirname, extname, isAbsolute, join, relative, resolve as risolviPercorso} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {PREFISSO_CARTELLA_FINTI, VARIABILE_FINTI, gancioInUso} from './percorsi.mjs';

await import(pathToFileURL(gancioInUso()).href);

export const OPZIONE_FINTI = '--import=' + import.meta.url;
const NOME = '@napi-rs/keyring';
const CARTELLA_DEL_PORTACHIAVI = /(^|[\\/])@napi-rs[\\/]keyring[\\/]/i;
const ESTENSIONI_AMMESSE = new Set(['.js', '.cjs']);
const MANCANTE = Symbol('mancante');
const INSTALLATO = Symbol.for('talos.prova.fintiPortachiavi.installato');

const reale = percorso => { try { return realpathSync.native(percorso); } catch { return null; } };
const eFile = percorso => { try { return statSync(percorso).isFile(); } catch { return false; } };
const dentro = (cartella, percorso) => { const rel = relative(cartella, percorso); return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel); };

/** The run's private temp folder, real path; null (no exemption at all) when unset, relative, misnamed or missing. */
export function cartellaDeiFinti(env = process.env) {
  const chiave = Object.keys(env ?? {}).find(k => k.toUpperCase() === VARIABILE_FINTI);
  const valore = chiave === undefined ? '' : String(env[chiave]).trim();
  if (!valore || !isAbsolute(valore) || !basename(valore).startsWith(PREFISSO_CARTELLA_FINTI)) return null;
  return reale(valore);
}

/** The file Node's CommonJS resolution gives for a package folder (`main`, its extensions, `index.js`); null with `exports`. */
function fileDelPacchetto(pacchetto) {
  let dati = {};
  const pkg = join(pacchetto, 'package.json');
  if (existsSync(pkg)) { try { dati = JSON.parse(readFileSync(pkg, 'utf8')); } catch { return null; } }
  if (dati.exports !== undefined) return null;
  const candidati = [];
  if (typeof dati.main === 'string' && dati.main) {
    const m = join(pacchetto, dati.main);
    candidati.push(m, m + '.js', m + '.json', m + '.node', join(m, 'index.js'));
  }
  candidati.push(join(pacchetto, 'index.js'));
  return candidati.find(eFile) ?? null;
}

/** The first `node_modules/@napi-rs/keyring` going up from `da`, as Node walks; null when there is none. */
function primoPacchetto(da) {
  for (let dir = da; ; dir = dirname(dir)) {
    if (basename(dir).toLowerCase() !== 'node_modules') {
      const pacchetto = join(dir, 'node_modules', '@napi-rs', 'keyring');
      if (existsSync(pacchetto)) return pacchetto;
    }
    if (dirname(dir) === dir) return null;
  }
}

/** The fake file to let through, MANCANTE for «Node finds none», null for «not ours: the trip wire decides». */
export function fintoDaLasciare(specificatore, parentURL, cartella) {
  if (!cartella || typeof specificatore !== 'string') return null;
  let file;
  if (specificatore === NOME) {
    if (typeof parentURL !== 'string' || !parentURL.startsWith('file:')) return null;
    const padre = fileURLToPath(parentURL);
    const da = reale(dirname(padre)) ?? risolviPercorso(dirname(padre));
    if (!dentro(cartella, da)) return null;
    const pacchetto = primoPacchetto(da);
    if (pacchetto === null) return MANCANTE;
    file = fileDelPacchetto(pacchetto);
    if (file === null) return null;
  } else {
    let percorso = specificatore;
    if (percorso.startsWith('file:')) { try { percorso = fileURLToPath(percorso); } catch { return null; } }
    if (!isAbsolute(percorso) || !CARTELLA_DEL_PORTACHIAVI.test(percorso)) return null;
    file = percorso;
  }
  const vero = reale(file);
  if (vero === null || !eFile(vero) || !ESTENSIONI_AMMESSE.has(extname(vero).toLowerCase()) || !dentro(cartella, vero)) return null;
  return vero;
}

function installa(cartella) {
  const lasciati = new Set();
  registerHooks({
    resolve(specificatore, contesto, prossimo) {
      const esito = fintoDaLasciare(specificatore, contesto?.parentURL, cartella);
      if (esito === MANCANTE) {
        const codice = contesto?.conditions?.includes?.('require') ? 'MODULE_NOT_FOUND' : 'ERR_MODULE_NOT_FOUND';
        throw Object.assign(new Error(`Cannot find module '${specificatore}'`), {code: codice});
      }
      if (esito === null) return prossimo(specificatore, contesto);
      const url = pathToFileURL(esito).href;
      lasciati.add(url);
      return {url, format: 'commonjs', shortCircuit: true};
    },
    load(url, contesto, prossimo) {
      if (!lasciati.has(url)) return prossimo(url, contesto);
      return {format: 'commonjs', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true};
    },
  });
  /* The child gets this file and the SAME folder: whatever the caller wrote in its env for the variable is replaced. */
  const conEsenzione = coppie => {
    const fuori = [];
    const opzioni = [];
    for (const coppia of coppie) {
      const testo = String(coppia);
      const i = testo.indexOf('=');
      const nome = testo.slice(0, i).toUpperCase();
      if (nome === 'NODE_OPTIONS') { const valore = testo.slice(i + 1).trim(); if (valore) opzioni.push(valore); }
      else if (nome !== VARIABILE_FINTI) fuori.push(testo);
    }
    if (!opzioni.join(' ').split(/\s+/).includes(OPZIONE_FINTI)) opzioni.push(OPZIONE_FINTI);
    return [...fuori, 'NODE_OPTIONS=' + opzioni.join(' '), VARIABILE_FINTI + '=' + cartella];
  };
  const legame = process.binding('spawn_sync');
  const sincronoPrima = legame.spawn;
  legame.spawn = function spawnSyncConFinti(opzioni) {
    if (opzioni && Array.isArray(opzioni.envPairs)) opzioni.envPairs = conEsenzione(opzioni.envPairs);
    return sincronoPrima.call(this, opzioni);
  };
  const {Process} = process.binding('process_wrap');
  const processoPrima = Process.prototype.spawn;
  Process.prototype.spawn = function processWrapConFinti(opzioni) {
    if (opzioni && Array.isArray(opzioni.envPairs)) opzioni.envPairs = conEsenzione(opzioni.envPairs);
    return processoPrima.call(this, opzioni);
  };
}

if (!globalThis[INSTALLATO]) {
  globalThis[INSTALLATO] = true;
  const cartella = cartellaDeiFinti();
  if (cartella) installa(cartella);
}
