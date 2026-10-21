/*
 * L'ISCRIZIONE agli eventi di una sessione, con la sua rigiocata: la sequenza che la rotta `/events` faceva da sola e che ora serve
 * anche al controllo remoto (18/10/2026, `src/remoto/operazioni.mjs`). Una sola strada, perché il telefono deve vedere la storia
 * esattamente come la finestra del PC.
 *
 * In ordine (le ragioni stanno nei commenti della rotta `/events` in http-app.mjs, che li conserva):
 *   1. la storia dal numero `daSequenza` in poi, COALESCENTE (11/09: 34.019 → 1.391 eventi su una sessione lunga), poi il presente
 *      com'è, evento per evento (`sse-replay-coalescente.mjs`);
 *   2. `talos.fine-rigiocata` (13/09 notte): il confine fra storia e presente, evento di solo trasporto senza `_sequenza`;
 *   3. lo stato EFFIMERO di adesso: la coda (`talos.coda`, 14/09) e l'obiettivo (`talos.obiettivo`, /goal G6 15/10), anche vuoti.
 * Torna la funzione che disiscrive.
 */

import { creaReplayCoalescente } from './sse-replay-coalescente.mjs';

export function iscriviConRigiocata({ sessionRegistry, sessionId, daSequenza = 0, manda }) {
  const replay = creaReplayCoalescente((evento) => { manda(evento); });
  const disiscrivi = sessionRegistry.iscriviti(sessionId, replay.ascoltatore, daSequenza);
  replay.fineReplay();
  manda({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null });
  if (typeof sessionRegistry.statoCoda === 'function') {
    const coda = sessionRegistry.statoCoda(sessionId);
    if (coda && !('erroreAvvio' in coda)) manda({ type: 'CUSTOM', name: 'talos.coda', value: { voci: coda.voci, inPausa: coda.inPausa } });
  }
  if (typeof sessionRegistry.statoObiettivo === 'function') {
    const stato = sessionRegistry.statoObiettivo(sessionId);
    const tetti = typeof sessionRegistry.tettiObiettivo === 'function' ? sessionRegistry.tettiObiettivo() : null;
    if (stato && !('erroreAvvio' in stato)) manda({ type: 'CUSTOM', name: 'talos.obiettivo', value: { obiettivo: stato.obiettivo ?? null, ...(tetti ? { tetti } : {}) } });
  }
  return disiscrivi;
}
