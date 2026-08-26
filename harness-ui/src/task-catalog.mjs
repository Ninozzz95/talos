/**
 * task-catalog.mjs — quali task sono LANCIABILI da Harness UI, e come
 * ottenere una cartella vera per farli girare. Piano
 * `elegant-spinning-dongarra.md`, FASE 1, §1.5 (Opzione A).
 *
 * ⛔⛔ ALLOWLIST STRETTA, stesso principio di `path-policy.mjs`: un id che non
 * è testualmente uno dei task del corpus non produce MAI una cartella. Prima
 * di questo file, Harness UI era read-only per costruzione (`http-app.mjs`
 * rifiuta ogni metodo che non sia GET/HEAD) — questo è il PRIMO punto dove
 * un browser può far succedere qualcosa di reale sul disco, quindi l'elenco
 * ammesso non è "qualunque cartella passi", è SOLO ciò che è già nel corpus.
 *
 * ⛔ Solo `progetti/` (CORPUS_CODING) in questa prima fase, DICHIARATO — non
 * `storia/`. Letto `spazioDaCommit.mjs`: i task storia passano da
 * `preparaDaCommit`, che fa `git archive` su AVM-miniera (una QUARTA cartella
 * sorella) e un junction verso il suo `node_modules` — più macchinari, più
 * cose che possono non esserci nell'ambiente di chi apre Harness UI. I task
 * `progetti/` bastano a provare l'intero ciclo (checkout, esecuzione, pulizia)
 * con un `cpSync` locale e nessuna dipendenza esterna. `storia/` resta una
 * riga aperta, non un buco silenzioso.
 */
import { CORPUS_CODING } from '../../../TALOS-BANCO/corpusCoding.mjs';
import { preparaCopia } from '../../../TALOS-BANCO/corsaDiCoding.mjs';

export class TaskCatalogError extends Error {
  constructor(message, code = 'TASK_NOT_ALLOWED') {
    super(message);
    this.name = 'TaskCatalogError';
    this.code = code;
  }
}

/**
 * Un elenco LEGGERO — mai il corpo intero della consegna, che può essere
 * lungo (i task storia, quando arriveranno, elencano casi di test interi).
 * Chi avvia una sessione riceve la consegna vera da `preparaEsecuzione`, non
 * da qui: questa funzione è per un menu, non per lanciare niente.
 */
export function listaTaskDisponibili() {
  return CORPUS_CODING.map((task) => ({
    id: task.id,
    progetto: task.progetto,
    difficolta: task.difficolta,
    consegnaCorta: task.consegnaCorta,
  }));
}

/**
 * Da un id ammesso a una cartella VERA e usa-e-getta, pronta per
 * `talosLavora`. Lancia `TaskCatalogError` su qualunque id che non sia
 * ESATTAMENTE uno dei task del corpus — nessuna normalizzazione, nessun
 * fallback: lo stesso stile di `assertSafeSegment` in `path-policy.mjs`.
 *
 * @returns {{cartella:string, comandoProva:string, task:object, pulisci:()=>void}}
 */
export function preparaEsecuzione(taskId) {
  if (typeof taskId !== 'string' || taskId.length === 0) {
    throw new TaskCatalogError('Id task non valido', 'QUERY_INVALID');
  }
  const task = CORPUS_CODING.find((candidato) => candidato.id === taskId);
  if (!task) throw new TaskCatalogError(`Task non ammesso: ${taskId}`);

  const { dove, butta } = preparaCopia(task);
  return {
    cartella: dove,
    comandoProva: task.comando,
    task,
    pulisci: butta,
  };
}
