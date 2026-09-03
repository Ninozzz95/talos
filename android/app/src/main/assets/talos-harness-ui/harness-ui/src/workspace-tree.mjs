/**
 * workspace-tree.mjs — l'albero file REALE di una sessione (piano
 * `elegant-spinning-dongarra.md`, FASE 1, §1.3, riga "Contesto workspace").
 *
 * ⛔ Riusa `discoNode` dal kernel compilato — lo stesso oggetto che
 * l'attrezzo `elenca` usa DENTRO talosLavora, ri-esportato apposta da
 * talosHarness.mjs (vedi la sua doc): zero copie, stesso principio già
 * seguito da agent-service.mjs per talosLavora stesso.
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

import { discoNode as discoNodeReale } from '../../../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs';
import { isPathInside } from './path-policy.mjs';

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
 * @param {typeof discoNodeReale} [deps.discoNodeFn] — SOLO per test
 * @returns {Promise<Array<{nome:string, cartella:boolean}>>} cartelle prima, poi file, ciascuno alfabetico
 */
export async function leggiAlberoWorkspace({ cartella, percorso = '' }, { discoNodeFn = discoNodeReale } = {}) {
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
    const disco = discoNodeFn({ radice: cartella });
    voci = await disco.elenca(percorso);
  } catch (errore) {
    if (errore instanceof WorkspaceTreeError) throw errore;
    throw new WorkspaceTreeError('Percorso non leggibile');
  }

  return voci
    .map((v) => ({ nome: v.nome, cartella: Boolean(v.cartella) }))
    .sort((a, b) => (a.cartella === b.cartella ? a.nome.localeCompare(b.nome, 'en') : a.cartella ? -1 : 1));
}
