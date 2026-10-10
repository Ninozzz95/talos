/*
 * ⭐ C3 (09/10/2026, «talos desktop») — gli stati FINALI del run e del passo, in un posto solo.
 *
 * Prima di C3 erano dieci copie dello stesso elenco (`run.mjs`, `store.mjs`, `scheduler.mjs`, `read-model.mjs`, `run-stream.mjs`,
 *   `per-il-modello.mjs`, `azioni-del-run.mjs`, l'orchestratore, `http-app.mjs` due volte), misurate con un grep il 09/10. Due stati
 *   nuovi (`succeeded_with_set_aside` per il run, `set_aside` per il passo) avrebbero dovuto entrare in tutte e dieci: la copia che
 *   se ne dimentica tiene aperto per sempre lo stream di un run finito, o rifiuta di eliminarlo. Un elenco solo, letto da tutti.
 */

/** Il run è finito e non accetta più fatti: riuscito, riuscito con passi messi da parte, fallito, annullato. */
export const STATI_FINALI_DEL_RUN = Object.freeze(['succeeded', 'succeeded_with_set_aside', 'failed', 'cancelled']);

/** Il passo è fermo per sempre. `set_aside` è finale ma NON soddisfatto: chi lo aspetta non parte (decisione owner 07/10). */
export const STATI_FINALI_DEL_PASSO = Object.freeze(['succeeded', 'failed', 'cancelled', 'skipped', 'superseded', 'set_aside']);

/** I fatti che chiudono un run (quelli che portano un run in uno degli `STATI_FINALI_DEL_RUN`). */
export const FATTI_DI_FINE_DEL_RUN = Object.freeze(['run_succeeded', 'run_succeeded_with_set_aside', 'run_failed', 'run_cancelled']);

export const runFinito = (status) => STATI_FINALI_DEL_RUN.includes(status);
export const passoFinito = (state) => STATI_FINALI_DEL_PASSO.includes(state);
