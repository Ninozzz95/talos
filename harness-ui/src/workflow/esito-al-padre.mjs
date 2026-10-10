/*
 * ⭐ C3b (owner 09/10/2026 sera, `decisioni-owner-c3b-avvio-automatico-09-10` punto 4) — L'ESITO DI UN WORKFLOW SVEGLIA IL PADRE.
 *   Nella prova dal vivo del 09/10 glm-5.3-flash, avviato il Workflow, aspettava con `sleep 30` dentro la shell (carta
 *   d'approvazione da root) perché a fine run nessuno avvisava la sessione: le deleghe sì (F-020), i Workflow no.
 *   Decisioni: il padre fermo riparte con un messaggio che porta esito e risultati quando un run della sessione FINISCE (riuscito,
 *   con passi messi da parte, fallito, annullato) e anche quando entra in «Serve attenzione» — da noi un passo fallito porta lì,
 *   non a `failed` (`run.mjs`, `deriveAttentionFromFailedNodes`), e la persona deve saperlo dal modello. Vale per OGNI Workflow
 *   della sessione, non solo per quelli avviati da soli. La pausa no: l'ha chiesta qualcuno e la carta la mostra.
 * Come Hermes: chi ha creato il task si sveglia quando il task finisce, si blocca o si arrende, ogni volta che succede
 *   (`gateway/kanban_watchers_notifier.py:39`, `_WAKE_KINDS`), e il risultato «re-enters the conversation as a new message»
 *   (`tools/delegate_tool_dispatch.py:325`).
 * ⛔ Il testo passa dal CONFINE DEI DATI (`testoDellEsitoWorkflow`): i resoconti dei passi li hanno scritti altri modelli.
 * ⛔ Limite dichiarato: il cambio di stato si osserva quando si scrive. Se il server si spegne fra il fatto scritto e la coda del
 *   padre scritta, quel risveglio si perde (il run resta visibile, e `workflow_status` lo dice). Hermes tiene un cursore per
 *   iscrizione; qui non c'è ancora.
 */
import { testoDellEsitoWorkflow } from '../kernel/confine-dati.mjs';
import { esitoDelRunPerIlPadre } from './per-il-modello.mjs';
import { STATI_FINALI_DEL_RUN } from './stati-finali.mjs';
import { readRunState, watchRunStatusChanges } from './store.mjs';

export const STATI_CHE_SVEGLIANO_IL_PADRE = Object.freeze([...STATI_FINALI_DEL_RUN, 'needs_attention']);
const SVEGLIANO = new Set(STATI_CHE_SVEGLIANO_IL_PADRE);

/**
 * @param {{ store: object, accodaFn: (input: { sessionId: string, runId: string, testo: string, chiave: string }) => boolean,
 *   onErrore?: (errore: unknown, dove: object) => void }} deps
 * @returns {() => void} smette di guardare
 */
export function creaRisveglioDaiWorkflow({ store, accodaFn, onErrore = () => {} } = {}) {
  if (!store || typeof accodaFn !== 'function') throw new Error('creaRisveglioDaiWorkflow needs the workflow store and accodaFn');
  async function consegna({ runId, seq, status }) {
    try {
      const input = await readRunState(store, { runId });
      const sessionId = input.events?.[0]?.payload?.rootSessionId;
      if (typeof sessionId !== 'string') return;
      /* lo stato riletto può essere già andato oltre (un «Serve attenzione» seguito subito da un annullamento): l'esito dice lo
         stato del FATTO osservato, il resto è il run com'è adesso, e il cambio dopo avrà il suo risveglio */
      const esito = { ...esitoDelRunPerIlPadre(input), stato: status };
      accodaFn({ sessionId, runId, testo: testoDellEsitoWorkflow(esito), chiave: `${runId}:${seq}` });
    } catch (errore) {
      onErrore(errore, { runId, seq, status });
    }
  }
  return watchRunStatusChanges(store, { onChange: (change) => { if (SVEGLIANO.has(change.status)) void consegna(change); } });
}
