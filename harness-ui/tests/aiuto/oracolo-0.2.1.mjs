/*
 * L'ORACOLO della 0.2.1 per le prove del doppio controllo (sesto giro della riparazione dei permessi, 13/11/2026, owner 18:49, giudice
 * v1801): l'albero INTERO della 0.2.1 (`harness-ui/src`, `context-engine/src` e i loro `package.json`) estratto dal commit 5e9fdc1b9 con
 * `git archive` in una cartella di prova sotto la cartella temporanea, e caricato da lì. ⛔ Non è il file che usa il prodotto
 * (`src/kernel/fermo-0.2.1-5e9fdc1b9/`) né la copia delle prove (`fixtures/`): se una delle due cambiasse, l'oracolo non cambierebbe.
 * I moduli dell'albero estratto prendono i pacchetti (`node_modules`) da quelli del repo: solo la risoluzione dei nomi senza percorso
 * passa dal file corrispondente del repo (`module.registerHooks`, nodejs.org/api/module.html, letta il 13/11/2026: «synchronous hook
 * functions that are run directly on the thread where the modules are loaded»). Niente viene eseguito: si carica il cancello e lo si
 * interroga a parole. Senza git o senza il commit (una copia fatta con `git archive`) l'oracolo non c'è e chi lo usa salta, dicendolo.
 * La cartella estratta resta (si riusa alla corsa dopo, nessuna cancellazione).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const COMMIT_DELLA_021 = '5e9fdc1b9';
/** La radice del repo (questo file sta in `harness-ui/tests/aiuto/`). */
export const RADICE_DEL_REPO = fileURLToPath(new URL('../../../', import.meta.url));
/* una copia senza storia (i mutanti, la base delle prove rosse) può dire dove sta un clone col commit: si legge solo da lì */
const REPO_CON_LA_STORIA = process.env.TALOS_PROVE_REPO_CON_LA_STORIA || RADICE_DEL_REPO;
const git = (argomenti) => spawnSync('git', ['-C', REPO_CON_LA_STORIA, ...argomenti], { maxBuffer: 256 * 1024 * 1024, windowsHide: true });

/** C'è il commit della 0.2.1 (un clone con la storia)? */
export function conIlCommitDella021() {
  try { return git(['cat-file', '-e', `${COMMIT_DELLA_021}^{commit}`]).status === 0; } catch { return false; }
}
/** I byte di un file come stanno nel commit della 0.2.1, o `null`. */
export function fileDella021(percorso) {
  const r = git(['show', `${COMMIT_DELLA_021}:${percorso}`]);
  return r.status === 0 ? r.stdout : null;
}
export const sha256 = (dati) => createHash('sha256').update(dati).digest('hex');

/** Un archivio tar di `git archive` (ustar, con le intestazioni pax `g` e `x`) nella cartella `dove`. */
function estraiTar(archivio, dove) {
  const radice = path.resolve(dove);
  let i = 0;
  let nomeLungo = null;
  while (i + 512 <= archivio.length) {
    const testa = archivio.subarray(i, i + 512);
    if (testa.every((b) => b === 0)) break;
    const campo = (a, b) => testa.subarray(a, b).toString('utf8').replace(/\0[\s\S]*$/u, '');
    let nome = campo(0, 100);
    const prefisso = campo(345, 500);
    if (prefisso) nome = `${prefisso}/${nome}`;
    const dimensione = parseInt(campo(124, 136).trim() || '0', 8);
    const tipo = String.fromCharCode(testa[156]);
    const dati = archivio.subarray(i + 512, i + 512 + dimensione);
    i += 512 + Math.ceil(dimensione / 512) * 512;
    if (tipo === 'g') continue;
    if (tipo === 'x') { nomeLungo = /(?:^|\n)\d+ path=([^\n]*)\n/u.exec(dati.toString('utf8'))?.[1] ?? null; continue; }
    if (nomeLungo) { nome = nomeLungo; nomeLungo = null; }
    const destinazione = path.resolve(radice, ...nome.split('/').filter(Boolean));
    if (!destinazione.startsWith(radice + path.sep)) throw new Error(`fuori dalla cartella dell'oracolo: ${nome}`);
    if (tipo === '5') mkdirSync(destinazione, { recursive: true });
    else if (tipo === '0' || tipo === '\0') { mkdirSync(path.dirname(destinazione), { recursive: true }); writeFileSync(destinazione, dati); }
  }
}

let agganciata = null;
function agganciaIPacchetti(cartella) {
  if (agganciata === cartella) return;
  const sotto = pathToFileURL(cartella).href.replace(/\/?$/u, '/');
  const viva = pathToFileURL(RADICE_DEL_REPO).href.replace(/\/?$/u, '/');
  registerHooks({
    resolve(specificatore, contesto, prossimo) {
      const genitore = contesto.parentURL;
      if (typeof genitore === 'string' && genitore.toLowerCase().startsWith(sotto.toLowerCase()) && !/^(?:\.{1,2}\/|\/|[A-Za-z]:|node:|file:|data:)/u.test(specificatore)) {
        return prossimo(specificatore, { ...contesto, parentURL: viva + genitore.slice(sotto.length) });
      }
      return prossimo(specificatore, contesto);
    },
  });
  agganciata = cartella;
}

let caricato;
/** `{ cartella, verificaPermessoScrittura, cancellazioneCritica }` della 0.2.1 estratta dal commit, o `null` se il commit non c'è. */
export async function oracoloDella021() {
  if (caricato !== undefined) return caricato;
  caricato = null;
  if (!conIlCommitDella021()) return null;
  const archivio = git(['archive', '--format=tar', COMMIT_DELLA_021, 'harness-ui/src', 'harness-ui/package.json', 'context-engine/src', 'context-engine/package.json']);
  if (archivio.status !== 0) return null;
  let cartella = path.join(os.tmpdir(), `talos-oracolo-021-${COMMIT_DELLA_021}-${sha256(archivio.stdout).slice(0, 12)}`);
  if (!existsSync(path.join(cartella, '.completo'))) {
    const mia = `${cartella}-${process.pid}-${Date.now()}`;
    estraiTar(archivio.stdout, mia);
    writeFileSync(path.join(mia, '.completo'), `${COMMIT_DELLA_021}\n`);
    try { renameSync(mia, cartella); } catch { cartella = mia; } // un'altra prova l'ha già messa: si usa la propria
  }
  agganciaIPacchetti(cartella);
  const kernel = pathToFileURL(path.join(cartella, 'harness-ui', 'src', 'kernel')).href;
  const { verificaPermessoScrittura } = await import(`${kernel}/talosHarness.mjs`);
  const { cancellazioneCritica } = await import(`${kernel}/cancellazioni-critiche.mjs`);
  caricato = { cartella, verificaPermessoScrittura, cancellazioneCritica };
  return caricato;
}
