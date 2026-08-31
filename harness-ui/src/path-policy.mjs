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
