/*
 * Riga 199 (PC 0.2.5, 22/11/2026) — la spia del disco e dei processi per le prove «0 tocchi» di T5-T10.
 *   Va importata PRIMA dei moduli di TALOS (con `await import` dopo di lei): sostituisce le porte di `fs`, `fs/promises` e
 *   `child_process` e chiama `syncBuiltinESMExports`, così anche le importazioni per nome dei moduli la vedono.
 *   Un percorso che parte con due barre e nomina l'ospite inventato (`OSPITE`) è CONTATO e riceve ENOENT senza chiamare la porta vera:
 *   nemmeno la corsa rossa esce dalla macchina. La condivisione `\\NAS\lavoro` è simulata (esiste, è una cartella, il suo percorso vero
 *   è quello scritto): misurarla è lecito, come oggi, ed è contata a parte. Un processo che cancellerebbe non parte mai.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import processi from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

export const B = '\\';
export const OSPITE = 'ospite-finto-talos';
export const NAS = 'nas-finto-talos';
export const unc = (...pezzi) => B + B + pezzi.join(B);
export const tocchi = [];      // { porta, percorso }: deve restare vuoto
export const delNas = [];      // la condivisione del progetto, simulata
export const eseguiti = [];    // processi fermati che nominavano l'ospite
export const distruttivi = []; // processi fermati che avrebbero cancellato

const testoDi = (x) => (typeof x === 'string' ? x : Buffer.isBuffer(x) ? x.toString('utf8') : x instanceof URL ? x.href : null);
const enoent = (porta) => Object.assign(new Error(`ENOENT: spia di rete (${porta})`), { code: 'ENOENT' });
const statFinto = () => ({ isSymbolicLink: () => false, isDirectory: () => true, isFile: () => false });
export const versoLOspite = (s) => /^[\\/]{2}/u.test(s) && s.toLowerCase().includes(OSPITE);
const sottoNas = (s) => /^[\\/]{2}/u.test(s) && s.replaceAll('/', B).toLowerCase().includes(`${B}${B}${NAS}${B}lavoro`);
/* un disco di QUESTA macchina scritto come dispositivo (`\\?\C:`, `\\.\C:`, `\\?\GLOBALROOT\…` senza ospite, `\\?\Volume{…}`) va al disco vero */
const dueBarreNonLocali = (s) => /^[\\/]{2}/u.test(s) && (!/^[\\/]{2}[?.][\\/]+(?:[A-Za-z]:|GLOBALROOT[\\/]|Volume\{)/iu.test(s)
  || /[\\/](?:Mup|LanmanRedirector|WebDavRedirector|RdpDr|UNC)(?:[\\/]|$)/iu.test(s));
export const altri = [];       // altri `\\…` fermati dalla spia (mai al disco vero)
/* giro unico (punto 7): un collegamento DENTRO la condivisione simulata, `prefisso` (minuscolo) → `bersaglio`: il percorso vero cambia */
export const collegamentiDelNas = new Map();
const rinominaNas = (p) => {
  for (const [da, a] of collegamentiDelNas) if (p.toLowerCase() === da || p.toLowerCase().startsWith(`${da}${B}`)) return a + p.slice(da.length);
  return p;
};

const PORTE_PROMESSE = ['realpath', 'lstat', 'stat', 'open', 'readdir', 'readlink', 'access', 'readFile', 'opendir'];
const PORTE_SYNC = ['realpathSync', 'existsSync', 'statSync', 'lstatSync', 'readdirSync', 'openSync', 'readlinkSync', 'accessSync', 'readFileSync', 'opendirSync'];
const vere = new Map();

function finta(porta, promessa, vera, s, args, self) {
  if (s !== null && versoLOspite(s)) {
    tocchi.push({ porta, percorso: s });
    if (porta === 'existsSync') return false;
    if (promessa) return Promise.reject(enoent(porta));
    throw enoent(porta);
  }
  if (s !== null && sottoNas(s)) {
    delNas.push(porta);
    const vero = rinominaNas(s.replaceAll('/', B).replace(/\\+$/u, ''));
    const risposta = /^realpath/u.test(porta) ? vero : porta === 'existsSync' ? true : /stat/u.test(porta) ? statFinto() : null;
    if (risposta === null) { if (promessa) return Promise.reject(enoent(porta)); throw enoent(porta); }
    return promessa ? Promise.resolve(risposta) : risposta;
  }
  if (s !== null && dueBarreNonLocali(s)) {
    /* chiusa: ogni altro `\\…` (anche `\\localhost`, `\\<questa macchina>`) non arriva mai al disco vero */
    altri.push(`${porta} ${s}`);
    if (porta === 'existsSync') return false;
    if (promessa) return Promise.reject(enoent(porta));
    throw enoent(porta);
  }
  return vera.apply(self, args);
}
function spia(modulo, porta, promessa) {
  const vera = modulo[porta];
  vere.set(`${promessa}${porta}`, vera);
  const sostituta = function (...args) { return finta(porta, promessa, vera, testoDi(args[0]), args, this); };
  if (porta === 'realpathSync') {
    const nativa = vera.native;
    sostituta.native = function (...args) { return finta('realpathSync.native', false, nativa, testoDi(args[0]), args, this); };
  }
  modulo[porta] = sostituta;
}
for (const porta of PORTE_PROMESSE) spia(fsp, porta, true);
for (const porta of PORTE_SYNC) spia(fs, porta, false);

const DISTRUTTIVO = /clean["\s,]+-f|reset["\s,]+--hard|checkout["\s,]+--/u;
const processiVeri = new Map();
for (const porta of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync']) {
  const vera = processi[porta];
  processiVeri.set(porta, vera);
  processi[porta] = function (...args) {
    const opzioni = args.find((a) => a && typeof a === 'object' && !Array.isArray(a));
    const cwd = testoDi(opzioni?.cwd) ?? '';
    if (versoLOspite(cwd)) { tocchi.push({ porta: `${porta}(cwd)`, percorso: cwd }); throw enoent(porta); }
    if (sottoNas(cwd)) { delNas.push(`${porta}(cwd)`); throw enoent(porta); }
    if (dueBarreNonLocali(cwd)) { altri.push(`${porta}(cwd) ${cwd}`); throw enoent(porta); }
    const testo = JSON.stringify(args.map((a) => (typeof a === 'function' ? null : a)));
    if (DISTRUTTIVO.test(testo)) { distruttivi.push(porta); throw enoent(porta); }
    if (testo.toLowerCase().includes(OSPITE)) { eseguiti.push(porta); throw enoent(porta); }
    return vera.apply(this, args);
  };
}
syncBuiltinESMExports();

export function azzera() { tocchi.length = 0; delNas.length = 0; altri.length = 0; eseguiti.length = 0; distruttivi.length = 0; }
export const elencoDeiTocchi = () => tocchi.map((x) => `${x.porta} ${x.percorso}`);
/** Rimette le porte vere (da chiamare in `after`). */
export function togliLaSpia() {
  for (const porta of PORTE_PROMESSE) fsp[porta] = vere.get(`true${porta}`);
  for (const porta of PORTE_SYNC) fs[porta] = vere.get(`false${porta}`);
  for (const [porta, vera] of processiVeri) processi[porta] = vera;
  syncBuiltinESMExports();
}
