import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/*
 * ⛔⛔⛔ 30/8 — questo file portava anche `createPathPolicy()`, la fabbrica
 * che risolveva le campagne JSONL di TALOS-BANCO per la Board — RIMOSSA
 * insieme a `campaign-service.mjs`/`report-source.mjs`/`cost-reader.mjs`
 * (piano `elegant-spinning-dongarra.md`, "Board — da campagne TALOS-BANCO
 * a cruscotto sessioni"): TALOS-BANCO è uno strumento di misura esterno,
 * concettualmente estraneo al prodotto — l'intero server non deve più
 * sapere dov'è. Restano SOLO le due primitive di sicurezza generali,
 * usate da `workspace-files.mjs`/`workspace-tree.mjs` per il containment
 * dei percorsi del workspace — quelle non erano MAI state campagna-specifiche,
 * solo ospitate nello stesso file.
 */

import { existsSync as esisteSync, realpathSync as realpathSyncNativa } from 'node:fs';
import { basename as nomeBase, dirname as cartellaDi, relative as relativoA, resolve as risolvi, sep as separatore } from 'node:path';

/**
 * ⭐⭐⭐ 04/9 — W1-13, I FILE DI CONTROLLO DI TALOS (review 03/09). Sono i file che decidono COSA
 * l'agente può fare: hook, MCP, plugin, registro di fiducia, runtime del
 * provider, istruzioni (`CLAUDE.md`/`AGENTS.md`/`.claude/`), skill, memoria.
 * Una scrittura del modello su uno di questi non è una modifica al
 * progetto: è una modifica alle REGOLE — e va approvata a mano ANCHE in
 * Full access, anche con un permesso per-attrezzo «sempre».
 *
 * `file`: per nome, a qualunque profondità (un `CLAUDE.md` annidato è
 * letto comunque). `cartelleOvunque`: per segmento, a qualunque profondità
 * (anche FUORI dal workspace: `~/.claude/` è controllo per chiunque).
 * `cartelleAllaRadice`: solo come primo segmento sotto il workspace — un
 * progetto che si chiama `skills` non deve diventare tutto intoccabile.
 */
export const FILE_DI_CONTROLLO = Object.freeze({
  file: Object.freeze(['.harness-ui-hooks.json', '.harness-ui-mcp.json', '.provider-runtime.json', 'CLAUDE.md', 'AGENTS.md']),
  cartelleOvunque: Object.freeze(['.harness-ui-plugins', '.hooks-trust', '.claude', '.memory-store']),
  cartelleAllaRadice: Object.freeze(['skills']),
});

/** Il percorso REALE anche di un file che non esiste ancora: si risale al primo antenato esistente, lo si risolve (symlink/junction), si riattacca il resto. */
function percorsoRealeAncheSeManca(assoluto, realpathFn) {
  const resto = [];
  let corrente = assoluto;
  while (!esisteSync(corrente)) {
    const padre = cartellaDi(corrente);
    if (padre === corrente) return assoluto; // radice del volume inesistente: niente da risolvere
    resto.unshift(nomeBase(corrente));
    corrente = padre;
  }
  return risolvi(realpathFn(corrente), ...resto);
}

/**
 * True se `percorso` (relativo al workspace o assoluto) tocca un file di
 * controllo. ⛔ Confronto sul percorso REALE: `../`, symlink e junction
 * che puntano a uno di quei file non lo aggirano. Mai un'eccezione: un
 * percorso che non si riesce a risolvere torna `true` (fallisce chiuso —
 * meglio una card di troppo che una regola riscritta in silenzio).
 */
export function ePercorsoDiControllo(cartella, percorso, { realpathFn = realpathSyncNativa } = {}) {
  if (typeof cartella !== 'string' || cartella.length === 0 || typeof percorso !== 'string' || percorso.length === 0) return false;
  let radice;
  let reale;
  try {
    radice = percorsoRealeAncheSeManca(risolvi(cartella), realpathFn);
    reale = percorsoRealeAncheSeManca(risolvi(cartella, percorso), realpathFn);
  } catch {
    return true;
  }
  if (FILE_DI_CONTROLLO.file.includes(nomeBase(reale))) return true;
  const relativo = relativoA(radice, reale);
  const dentro = relativo !== '' && !relativo.startsWith('..') && !relativo.includes(`..${separatore}`);
  const segmenti = (dentro ? relativo : reale).split(/[\\/]+/).filter(Boolean);
  const cartelle = segmenti.slice(0, -1);
  if (cartelle.some((s) => FILE_DI_CONTROLLO.cartelleOvunque.includes(s))) return true;
  if (dentro && cartelle.length > 0 && FILE_DI_CONTROLLO.cartelleAllaRadice.includes(cartelle[0])) return true;
  return false;
}

export class PathPolicyError extends Error {
  constructor(message, code = 'PATH_NOT_ALLOWED') {
    super(message);
    this.name = 'PathPolicyError';
    this.code = code;
  }
}

export function isPathInside(rootRealPath, candidateRealPath) {
  const difference = relative(resolve(rootRealPath), resolve(candidateRealPath));
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function validateRoot(root) {
  if (typeof root !== 'string' || root.trim() === '' || root.includes('\0') || !isAbsolute(root)) {
    throw new PathPolicyError('Radice non valida', 'PATH_NOT_ALLOWED');
  }
  return resolve(root);
}

function validateCandidate(candidate) {
  if (typeof candidate !== 'string' || candidate.trim() === '' || candidate.includes('\0') || isAbsolute(candidate)) {
    throw new PathPolicyError('Percorso non valido', 'PATH_NOT_ALLOWED');
  }
  // Windows device paths, UNC e alternate data stream non sono percorsi di
  // workspace: non devono poter cambiare semantica fra API diverse.
  if (/^(?:\\\\\?\\|\\\\\.\\|\\\\)/u.test(candidate) || /(?:^|[\\/])[^\\/]+:[^\\/]*$/u.test(candidate)) {
    throw new PathPolicyError('Percorso speciale non consentito', 'PATH_NOT_ALLOWED');
  }
  return candidate;
}

/**
 * Risolve un percorso attraverso il filesystem e verifica il containment sul
 * percorso reale, quindi anche junction/symlink che puntano fuori. Per i
 * nuovi file si può usare `allowMissing`: viene risolto il genitore reale e
 * il nome finale resta dentro la radice.
 */
export async function resolveContainedRealPath(root, candidate, options = {}) {
  const rootAbsolute = validateRoot(root);
  const relativeCandidate = validateCandidate(candidate);
  const realpathFn = options.realpathFn ?? realpath;
  let rootReal;
  try { rootReal = await realpathFn(rootAbsolute); } catch { throw new PathPolicyError('Radice non leggibile', 'PATH_ROOT_UNREADABLE'); }
  const lexical = resolve(rootReal, relativeCandidate);
  if (!isPathInside(rootReal, lexical)) throw new PathPolicyError('Percorso fuori dall’area autorizzata', 'PATH_NOT_ALLOWED');
  let realCandidate;
  try {
    realCandidate = await realpathFn(lexical);
  } catch (error) {
    if (!options.allowMissing) throw new PathPolicyError('Percorso non trovato', 'PATH_NOT_FOUND');
    const parent = dirname(lexical);
    let parentReal;
    try { parentReal = await realpathFn(parent); } catch { throw new PathPolicyError('Cartella genitore non trovata', 'PATH_NOT_FOUND'); }
    realCandidate = join(parentReal, lexical.slice(parent.length + 1));
  }
  if (!isPathInside(rootReal, realCandidate)) throw new PathPolicyError('Percorso fuori dall’area autorizzata', 'PATH_NOT_ALLOWED');
  return realCandidate;
}

/** Apre un handle soltanto dopo il controllo realpath; il chiamante è tenuto a chiuderlo. */
export async function openContainedFile(root, candidate, flags = 'r', options = {}) {
  const realCandidate = await resolveContainedRealPath(root, candidate, options);
  const openFn = options.openFn ?? open;
  let handle;
  try { handle = await openFn(realCandidate, flags); } catch { throw new PathPolicyError('File non leggibile', 'PATH_OPEN_FAILED'); }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new PathPolicyError('Il percorso non è un file', 'PATH_NOT_FILE');
    return handle;
  } catch (error) {
    await handle.close().catch(() => {});
    if (error instanceof PathPolicyError) throw error;
    throw new PathPolicyError('File non leggibile', 'PATH_OPEN_FAILED');
  }
}
