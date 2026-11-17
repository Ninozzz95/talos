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

/*
 * S3 (Tester 06/11/2026, cura 08/11): PRIMA di servire una sessione a un'altra porta (la finestra via HTTP, il telefono via
 *   `session.events`) la si allinea all'archivio: se un altro processo (la CLI, un'altra finestra) ha continuato il giornale, qui si
 *   rilegge. UNA sola funzione per le due porte, mai una copia. Come Hermes: `gateway/session_execution.py:106-128` scarta l'agente in
 *   cache se il conteggio dei messaggi sul DB è cambiato («possible cross-process write», #45966) prima di servire il giro, e
 *   `gateway/session_controls.py:119` (`_resume_transcript`) rilegge la trascrizione dal DB quando un secondo cliente si attacca.
 * Condizioni della CLI (06/11 09:10), che ospita anche lei il remoto con un registro federato (un Proxy):
 *   · solo `sessionRegistry.allineaSessione` del registro che chi chiama ha già: nessuna dipendenza nuova;
 *   · il metodo può mancare (torna `null` subito, niente da aspettare) o lanciare (si scrive nel log e si va avanti con la copia di
 *     qui, come prima: un'apertura non fallisce per l'affitto, come `session-facade.ts` della CLI);
 *   · una sessione che il registro locale non ha non si riallinea mai: lo dice il registro stesso (`{ stato: 'assente' }`);
 *   · un giro vivo in QUESTO processo non si ricarica mai: lo garantisce `ricaricaDalDisco` (`sessioneFermaQui`).
 * Torna `null` oppure la promessa dell'esito (`{ stato, ricaricata, detentore?, messaggio? }`, o `null` se ha lanciato), mai un rifiuto.
 */
export function allineaSessioneDaFuori(sessionRegistry, sessionId, { scrivere }) {
  if (typeof sessionRegistry?.allineaSessione !== 'function') return null;
  return (async () => {
    try { return await sessionRegistry.allineaSessione(sessionId, { scrivere }); }
    catch (errore) {
      console.error(`[affitto] session ${sessionId} not aligned:`, errore instanceof Error ? errore.message : errore);
      return null;
    }
  })();
}

export function iscriviConRigiocata({ sessionRegistry, sessionId, daSequenza = 0, manda, capacita = null }) {
  const replay = creaReplayCoalescente((evento) => { manda(evento); });
  const disiscrivi = sessionRegistry.iscriviti(sessionId, replay.ascoltatore, daSequenza, { capacita }); // R-34 parte 2: le capacità del client
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
