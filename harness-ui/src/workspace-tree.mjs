/**
 * workspace-tree.mjs — l'albero file REALE di una sessione (piano
 * `elegant-spinning-dongarra.md`, FASE 1, §1.3, riga "Contesto workspace").
 *
 * L'accesso al disco passa dall'adapter locale `workspace-disk.mjs`: nessun
 * import da repository esterni e una sola policy di elenco, provata sul disco
 * reale. Il contratto `{nome, cartella}` resta compatibile con il vecchio
 * `discoNode` così i chiamanti e i test non cambiano.
 *
 * ⭐ UN livello alla volta, mai un dump ricorsivo intero: la UI espande le
 * cartelle a richiesta (`percorso` sale un pezzo per volta). Stessa lezione
 * di `talos-non-vede-i-file-del-corpus-storia` in memoria — un elenco
 * piatto esplode in byte prima di essere utile a chi guarda.
 *
 * ⛔⛔ `percorso` arriva da una query string HTTP, non da un modello
 * cooperativo dentro un tool call: `discoNode.elenca()` stesso NON sanifica
 * `..` o percorsi assoluti (verificato leggendo dist/kernelPerIlBanco.js —
 * usa `path.join` puro, che non contiene la risalita). Qui il controllo è
 * ESPLICITO — stesso `isPathInside` già in path-policy.mjs, importato, non
 * duplicato — perché un endpoint HTTP è raggiungibile da chiunque tocchi il
 * loopback, non solo da un modello che gioca secondo le regole.
 */
import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { isPathInside } from './path-policy.mjs';
import { createWorkspaceDisk } from './workspace-disk.mjs';

export class WorkspaceTreeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkspaceTreeError';
    this.code = 'QUERY_INVALID';
  }
}

/**
 * @param {object} input
 * @param {string} input.cartella — radice della sessione (già allowlisted a monte da task-catalog.preparaEsecuzione)
 * @param {string} [input.percorso] — sottocartella relativa da elencare; '' = radice
 * @param {object} [deps]
 * @param {Function} [deps.discoNodeFn] — SOLO per compatibilità/test; il default è l'adapter locale
 * @returns {Promise<Array<{nome:string, cartella:boolean}>>} cartelle prima, poi file, ciascuno alfabetico
 */
export async function leggiAlberoWorkspace({ cartella, percorso = '' }, { discoNodeFn } = {}) {
  if (typeof percorso !== 'string' || percorso.includes('\0') || isAbsolute(percorso)) {
    throw new WorkspaceTreeError('Percorso non valido');
  }

  let voci;
  try {
    const radiceReale = realpathSync(cartella);
    const candidatoReale = percorso === '' ? radiceReale : realpathSync(resolve(cartella, percorso));
    if (!isPathInside(radiceReale, candidatoReale)) {
      throw new WorkspaceTreeError('Percorso fuori dalla cartella della sessione');
    }
    const disco = (discoNodeFn ?? (({ radice }) => createWorkspaceDisk({ rootDir: radice })) )({ radice: cartella });
    voci = await disco.elenca(percorso);
  } catch (errore) {
    if (errore instanceof WorkspaceTreeError) throw errore;
    throw new WorkspaceTreeError('Percorso non leggibile');
  }

  return voci
    .map((v) => ({ nome: v.nome, cartella: Boolean(v.cartella) }))
    .sort((a, b) => (a.cartella === b.cartella ? a.nome.localeCompare(b.nome, 'en') : a.cartella ? -1 : 1));
}
