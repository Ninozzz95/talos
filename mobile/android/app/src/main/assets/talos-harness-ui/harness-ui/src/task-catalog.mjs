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
 *
 * ⛔⛔ 28/8 — CARICAMENTO CONDIZIONALE, per il deployment on-device (FASE 5,
 * execution plane): `TALOS-BANCO/` è una QUARTA cartella sorella che esiste
 * sulla macchina di sviluppo ma non su un telefono — un `import` statico
 * qui impedirebbe all'INTERO server (session-registry.mjs lo importa,
 * server.mjs importa session-registry) di partire ovunque quel corpus non
 * ci sia, anche per una sessione reale che non lo tocca mai.
 *
 * ⛔ Prima scelta, SBAGLIATA, corretta nello stesso giro: `require(esm)`
 * (stabile da Node 24.15.0, ricerca 28/8) sembrava evitare un `await` — ma
 * fallisce con `ERR_REQUIRE_ASYNC_MODULE`, verificato ESEGUENDO il
 * `require` vero, non supposto: da qualche parte nel grafo di
 * `corsaDiCoding.mjs` c'è un top-level await, e `require()` di un grafo ESM
 * asincrono non è permesso per costruzione. Corretto con un vero `import()`
 * dinamico — asincrono, quindi i DUE chiamanti (`http-app.mjs` per
 * `listaTaskDisponibili`, `session-registry.mjs` per `preparaEsecuzione`)
 * sono stati aggiornati ad `await`arli: erano già dentro funzioni async che
 * awaitano chiamate vicine (`campaignService.listCampaigns()`), quindi non
 * è un cambio di forma, solo una riga in più identica alle altre.
 */
async function corpusCoding() {
  try {
    return await import('../../../TALOS-BANCO/corpusCoding.mjs');
  } catch {
    return null;
  }
}
async function corsaDiCoding() {
  try {
    return await import('../../../TALOS-BANCO/corsaDiCoding.mjs');
  } catch {
    return null;
  }
}

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
export async function listaTaskDisponibili() {
  const modulo = await corpusCoding();
  if (!modulo) return [];
  return modulo.CORPUS_CODING.map((task) => ({
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
 * @returns {Promise<{cartella:string, comandoProva:string, task:object, pulisci:()=>void}>}
 */
export async function preparaEsecuzione(taskId) {
  if (typeof taskId !== 'string' || taskId.length === 0) {
    throw new TaskCatalogError('Id task non valido', 'QUERY_INVALID');
  }
  const modulo = await corpusCoding();
  const task = modulo?.CORPUS_CODING.find((candidato) => candidato.id === taskId);
  if (!task) throw new TaskCatalogError(`Task non ammesso: ${taskId}`);

  const esecutore = await corsaDiCoding();
  const { dove, butta } = esecutore.preparaCopia(task);
  return {
    cartella: dove,
    comandoProva: task.comando,
    task,
    pulisci: butta,
  };
}
