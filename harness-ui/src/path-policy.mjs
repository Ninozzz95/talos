import { isAbsolute, relative, resolve, sep } from 'node:path';

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
