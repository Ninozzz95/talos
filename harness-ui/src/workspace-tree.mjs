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
import { FRASI_DEI_MOTIVI_DEI_FILE } from './motivi-dei-file.mjs';

/** 16/10/2026: il rifiuto porta il suo MOTIVO (`motivi-dei-file.mjs`), e la frase è quella della tabella. Un argomento che non è un
    motivo resta la frase di prima, senza motivo (chi la costruiva così, prove comprese, non perde il messaggio). */
export class WorkspaceTreeError extends Error {
  constructor(motivoOFrase) {
    const motivo = typeof motivoOFrase === 'string' && Object.hasOwn(FRASI_DEI_MOTIVI_DEI_FILE, motivoOFrase) ? motivoOFrase : null;
    super(motivo ? FRASI_DEI_MOTIVI_DEI_FILE[motivo] : String(motivoOFrase ?? ''));
    this.name = 'WorkspaceTreeError';
    this.code = 'QUERY_INVALID';
    if (motivo) this.reason = motivo;
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
/* Mobile, 30/10/2026: lo STESSO confronto sul PC e sul Pad (lingua fissa, numeri naturali, maiuscole e accenti alla pari), e uno spareggio sul
   nome esatto — l'ordine è totale e stabile fra un aggiornamento e l'altro, nessuna riga che salta */
const COLLATORE_DEI_NOMI = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
function confrontaNomi(a, b) {
  return COLLATORE_DEI_NOMI.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

export async function leggiAlberoWorkspace({ cartella, percorso = '' }, { discoNodeFn } = {}) {
  if (typeof percorso !== 'string' || percorso.includes('\0') || isAbsolute(percorso)) {
    throw new WorkspaceTreeError('path-invalid');
  }

  let voci;
  try {
    const radiceReale = realpathSync(cartella);
    const candidatoReale = percorso === '' ? radiceReale : realpathSync(resolve(cartella, percorso));
    if (!isPathInside(radiceReale, candidatoReale)) {
      throw new WorkspaceTreeError('path-outside-session');
    }
    const disco = (discoNodeFn ?? (({ radice }) => createWorkspaceDisk({ rootDir: radice })) )({ radice: cartella });
    voci = await disco.elenca(percorso);
  } catch (errore) {
    if (errore instanceof WorkspaceTreeError) throw errore;
    // 16/10/2026 (mobile): una cartella che non c'è non è «illeggibile»: lo dice
    throw new WorkspaceTreeError(errore?.code === 'ENOENT' ? 'folder-not-found' : 'path-not-readable');
  }

  return voci
    .map((v) => ({ nome: v.nome, cartella: Boolean(v.cartella) }))
    /* 30/10/2026 (prova della candidata sul 4174: «relazione-2» veniva dopo «relazione-19»): i numeri nei nomi in ordine NATURALE
       (relazione-2 prima di relazione-10); le cartelle restano in testa */
    .sort((a, b) => (a.cartella === b.cartella ? confrontaNomi(a.nome, b.nome) : a.cartella ? -1 : 1));
}
