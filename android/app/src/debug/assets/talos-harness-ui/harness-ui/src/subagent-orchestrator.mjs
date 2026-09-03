/**
 * subagent-orchestrator.mjs — sub-agenti, delega isolata verso una sessione
 * figlia — il differenziatore diretto contro Hermes (vincolo persistente
 * dell'owner, MEMORY.md). Vedi LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md §18
 * per il ledger completo di questa copia.
 *
 * ⭐ 29/8 — porta VERBATIM dal canonico
 * (AVM-harness-desktop/harness-ui/src/subagent-orchestrator.mjs, FASE G.4):
 * zero dipendenze cross-modulo oltre quelle iniettate, zero adattamento
 * richiesto — dichiarato già nell'intestazione originale.
 *
 * ⛔ Zero registro proprio: opera sulla STESSA `Map` `sessioni` di
 * `session-registry.mjs`, iniettata — mai una seconda fonte di verità
 * su quali sessioni esistono.
 *
 * ⭐⭐⭐ I numeri sotto sono quelli VERI di Hermes (Nous Research),
 * letti dal loro repo clonato il 28/8 — non inventati, non presi da
 * doc secondari (due correzioni fatte quel giorno su claim sbagliati
 * di doc secondari, vedi il ledger):
 * `_DEFAULT_MAX_CONCURRENT_CHILDREN = 10` (tools/delegate_tool.py) e
 * `delegation.max_spawn_depth` default **2**, con la nota nel loro
 * stesso codice "for parity with the original MAX_DEPTH constant".
 */

/** Fonte: `tools/delegate_tool.py`, Hermes (Nous Research), letto il 28/8. */
export const LIMITE_FIGLI_CONCORRENTI = 10;

/**
 * Fonte: `tools/delegate_tool.py`, stesso file. A differenza di Hermes
 * (che non ha un tetto duro oltre il default, solo un avviso in log),
 * questa prima fetta applica un tetto DURO — scelta più prudente
 * finché non c'è una misura reale che dica se serve di più (stesso
 * principio "si aggiunge quando serve" già in uso per `GIRI_MASSIMI`
 * nel kernel).
 */
export const LIMITE_PROFONDITA_DELEGA = 2;

/**
 * Traduce il risultato di `agent-service.avviaSessione` (il "risultato"
 * catturato dentro il `.then()`/`.catch()` di `avviaESegui`) nella
 * forma onesta che il kernel (`onDelega`) si aspetta — mai un successo
 * inventato quando la figlia non ha concluso per davvero.
 *
 * @param {{ok?: boolean, esito?: object|null, erroreInterno?: string|null}|null} risultato
 */
export function esitoDelegaDaRisultato(risultato) {
  if (risultato?.ok) {
    return {
      riassunto: risultato.esito?.detto || '(il sotto-agente non ha lasciato un riassunto testuale)',
      esito: 'concluso',
    };
  }
  if (risultato?.esito) {
    // giri-esauriti / fermato: la figlia ha girato, non ha chiuso il task.
    return {
      riassunto: risultato.esito.detto || `Il sotto-task non si è concluso (${risultato.esito.comeFinita}).`,
      esito: 'fallito',
    };
  }
  // erroreInterno: avviaSessione dichiara di non lanciare mai, ma un ripiego onesto resta necessario (stesso principio già in uso nel .catch() di avviaESegui).
  return { riassunto: null, esito: 'fallito', motivo: risultato?.erroreInterno ?? 'errore sconosciuto nella sessione figlia' };
}

/**
 * @param {Map<string, object>} sessioni — la STESSA Map di session-registry.mjs.
 * @param {Function} avviaESeguiFn — la funzione interna avviaESegui di session-registry.mjs, non una sua copia.
 */
export function creaSubagentOrchestrator({ sessioni, avviaESeguiFn }) {
  function contaFigliAttivi(sessionPadreId) {
    let n = 0;
    for (const voce of sessioni.values()) {
      if (voce.padreId === sessionPadreId && !voce.conclusa) n += 1;
    }
    return n;
  }

  /** Per il foglio "Albero sessione" (C.3) — ordinati per avvio, il più vecchio prima. */
  function elencaFigli(sessionPadreId) {
    const figli = [];
    for (const [sessionId, voce] of sessioni.entries()) {
      if (voce.padreId === sessionPadreId) {
        figli.push({
          sessionId,
          task: voce.task?.consegna ?? null,
          conclusa: voce.conclusa,
          esitoDelega: voce.esitoDelega ?? null,
          avviataAlle: voce.avviataAlle ?? null,
        });
      }
    }
    figli.sort((a, b) => String(a.avviataAlle).localeCompare(String(b.avviataAlle)));
    return figli;
  }

  /**
   * @returns {Promise<{riassunto?: string, esito: 'concluso'|'fallito'|'rifiutato', motivo?: string}>}
   * Non lancia MAI — un rifiuto (cartella invalida, tetto raggiunto,
   * padre scomparso) è un `esito:'rifiutato'` con `motivo`, non
   * un'eccezione: il dispatcher del kernel lo traduce in un REFUSED
   * onesto per il modello, stessa disciplina di ogni altro cancello.
   */
  function delegaSottoTask({ sessionPadreId, task, cartella }) {
    return new Promise((resolve) => {
      const padre = sessioni.get(sessionPadreId);
      if (!padre) {
        resolve({ esito: 'rifiutato', motivo: 'la sessione padre non esiste più' });
        return;
      }
      if (cartella === padre.cartella) {
        resolve({ esito: 'rifiutato', motivo: 'la cartella della delega deve essere diversa da quella del padre' });
        return;
      }
      const profonditaVoluta = (padre.profonditaDelega ?? 0) + 1;
      if (profonditaVoluta > LIMITE_PROFONDITA_DELEGA) {
        resolve({ esito: 'rifiutato', motivo: `profondità di delega massima raggiunta (limite ${LIMITE_PROFONDITA_DELEGA})` });
        return;
      }
      if (contaFigliAttivi(sessionPadreId) >= LIMITE_FIGLI_CONCORRENTI) {
        resolve({ esito: 'rifiutato', motivo: `limite di ${LIMITE_FIGLI_CONCORRENTI} figli concorrenti raggiunto` });
        return;
      }
      let risoltaGiaConcluso = false;
      const risultatoAvvio = avviaESeguiFn({
        taskId: `delega:${sessionPadreId}`,
        cartella,
        task: { consegna: task },
        padreId: sessionPadreId,
        profonditaDelega: profonditaVoluta,
        onConclusioneFn: (risultatoSessione) => {
          risoltaGiaConcluso = true;
          resolve(esitoDelegaDaRisultato(risultatoSessione));
        },
      });
      // ⛔ AL CONTRARIO: avviaESeguiFn può rifiutare PRIMA di avviare (es. chiave API non configurata) — mai una Promise appesa in eterno se onConclusioneFn non scatterà mai.
      if (!risoltaGiaConcluso && risultatoAvvio?.erroreAvvio) {
        resolve({ esito: 'rifiutato', motivo: risultatoAvvio.erroreAvvio });
      }
    });
  }

  return Object.freeze({ delegaSottoTask, contaFigliAttivi, elencaFigli });
}
