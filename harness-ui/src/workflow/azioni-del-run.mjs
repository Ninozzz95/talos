/*
 * ⛔⛔ A10 (07/10/2026, `desktop-bugfixer`, concordato con «talos desktop») — QUALI CONTROLLI VALGONO ADESSO SU UN RUN.
 *
 * Il difetto: un run può finire in «Serve attenzione» senza nessun passo fallito — `activity_uncertain:<id>` e
 * `budget_overrun` (`run.mjs`, `addAttention`) — e lì `resume` era rifiutato («only a paused run can be resumed») e
 * `retry` lanciava «there is no failed step to retry»: il modello non aveva nessuna azione valida, e il rifiuto non
 * diceva quale usare né perché il run aspettava.
 *
 * ⇒ La regola del rifiuto vive QUI, una volta sola, ed è la stessa che decide le azioni ammesse: l'orchestratore la
 *   importa, e la risposta al modello e il suo stato leggono `azioniConsentiteDelRun`. Due copie della stessa regola
 *   sarebbero due risposte diverse alla stessa domanda il giorno che una cambia.
 * ⛔ Nessuna transizione nuova: riaprire `resume` per quelle cause è la macchina a stati (C3, «talos desktop»).
 * ⛔ I motivi sono i codici del riduttore così come sono (`node_failed`, `activity_uncertain:<id>`, `budget_overrun`):
 *   un vocabolario solo.
 */

export const AZIONI_DEL_RUN = Object.freeze(['pause', 'resume', 'cancel', 'retry']);
const RUN_TERMINALI = new Set(['succeeded', 'failed', 'cancelled']);

/** Il motivo per cui `action` non vale ora su `run`, in inglese per il modello; `null` se vale (stessa regola di prima). */
export function rifiutoDelControllo(action, run) {
  if (run.cancelRequested) return 'the run is being cancelled';
  if (RUN_TERMINALI.has(run.status)) return `the run has already ended (${run.status})`;
  if (action === 'retry' && !['running', 'needs_attention'].includes(run.status)) {
    return `only a running run or one that needs attention can retry its failed steps (this one is ${run.status})`;
  }
  if (action === 'pause') {
    if (run.pauseRequested) return 'the run is already pausing: the steps in progress are finishing';
    if (run.status !== 'running') return `only a running run can be paused (this one is ${run.status})`;
  }
  if (action === 'resume' && run.status !== 'paused') {
    return run.pauseRequested ? 'the run is still pausing: wait for the steps in progress to finish'
      : `only a paused run can be resumed (this one is ${run.status})`;
  }
  if (action === 'cancel' && run.status === null) return 'the run does not exist';
  return null;
}

/** I passi che `retry` rifarebbe: quelli `failed`, in ordine di id (la stessa lista che usa l'orchestratore). */
export function passiFallitiDelRun(state) {
  const nodi = state?.nodes instanceof Map ? [...state.nodes.values()] : [];
  return nodi.filter((node) => node?.state === 'failed').map((node) => node.nodeId).sort();
}

/** Le azioni che la regola accetterebbe ora, nell'ordine di `AZIONI_DEL_RUN`. `retry` solo se c'è un passo fallito. */
export function azioniConsentiteDelRun(state) {
  const run = state?.run;
  if (!run) return [];
  return AZIONI_DEL_RUN.filter((azione) => rifiutoDelControllo(azione, run) === null
    && (azione !== 'retry' || passiFallitiDelRun(state).length > 0));
}

/** Perché il run aspetta: i codici del riduttore, senza doppioni, ordinati. Vuoto fuori da «Serve attenzione». */
export function motiviDiAttenzioneDelRun(run) {
  return [...new Set(Array.isArray(run?.needsAttentionReasons) ? run.needsAttentionReasons : [])].sort();
}

/** La coda del messaggio di rifiuto: le azioni valide e, se ci sono, i motivi dell'attenzione. */
export function codaDelRifiuto(state) {
  const azioni = azioniConsentiteDelRun(state);
  const motivi = motiviDiAttenzioneDelRun(state?.run);
  return ` Allowed actions now: ${azioni.length > 0 ? azioni.join(', ') : 'none'}.`
    + (motivi.length > 0 ? ` The run needs attention because: ${motivi.join(', ')}.` : '');
}
