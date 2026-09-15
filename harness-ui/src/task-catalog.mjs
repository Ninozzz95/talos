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
 * Il catalogo non possiede più un corpus implicito: riceve un provider
 * esplicito dal runtime configurato. Senza provider il risultato è
 * `TASK_CATALOG_UNAVAILABLE`, non una fixture o un import da un checkout
 * fratello. Questo mantiene la promessa di portabilità del desktop.
 */
export class TaskCatalogError extends Error {
  constructor(message, code = 'TASK_NOT_ALLOWED') {
    super(message);
    this.name = 'TaskCatalogError';
    this.code = code;
  }
}

function providerRequired(provider) {
  if (!provider || typeof provider.list !== 'function' || typeof provider.prepare !== 'function') {
    throw new TaskCatalogError('Il catalogo task non è disponibile in questa installazione. Configura il runtime proprietario.', 'TASK_CATALOG_UNAVAILABLE');
  }
  return provider;
}

/**
 * Un elenco LEGGERO — mai il corpo intero della consegna, che può essere
 * lungo (i task storia, quando arriveranno, elencano casi di test interi).
 * Chi avvia una sessione riceve la consegna vera da `preparaEsecuzione`, non
 * da qui: questa funzione è per un menu, non per lanciare niente.
 */
export function listaTaskDisponibili(provider) {
  return providerRequired(provider).list().map((task) => ({
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
export function preparaEsecuzione(taskId, provider) {
  if (typeof taskId !== 'string' || taskId.length === 0) {
    throw new TaskCatalogError('Id task non valido', 'QUERY_INVALID');
  }
  const risultato = providerRequired(provider).prepare(taskId);
  if (!risultato || typeof risultato !== 'object' || typeof risultato.cartella !== 'string' || !risultato.task) {
    throw new TaskCatalogError('Il catalogo task ha restituito una sessione non valida.', 'TASK_CATALOG_INVALID');
  }
  return risultato;
}
