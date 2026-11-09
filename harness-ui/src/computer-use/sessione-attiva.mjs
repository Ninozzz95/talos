/*
 * Quale sessione sta usando il computer (contratto del segno, riga 35; forma decisa dal Desktop il 05/11/2026 alle 17:45/17:47,
 * OK del Mobile alle 17:48 — supera la forma FE-071 a insieme).
 * L'ospite del computer use segna `true` quando il compito prende lo schermo e `false` alla fine (esito, Stop, errore);
 * il flusso del PC (`GET /api/v1/remote/events`) ascolta i cambi e all'apertura manda SEMPRE UNA riga, l'istantanea:
 * `{type, sessionId, attivo:true}` se un compito usa lo schermo, `{type, sessionId:null, attivo:false}` a riposo.
 * Così la bolla manda le risposte a QUELLA sessione e mai alla chat visibile (riga 36). Senza dipendenze.
 * UNA sessione corrente: con due compiti il segnale segue l'ULTIMO acceso; un `false` da una sessione che non è la corrente
 * si ignora (lo schermo resta a quella corrente). Id vuoto o non stringa, `attivo` non booleano: ignorati.
 * Un evento solo quando lo stato cambia davvero.
 */
export const TIPO_SEGNALE_SESSIONE = 'talos.computer-use-sessione';

const evento = (sessionId, attivo) => ({ type: TIPO_SEGNALE_SESSIONE, sessionId, attivo });

export function creaSessioneAttiva() {
  let corrente = null;
  const ascoltatori = new Set();
  const avvisa = (e) => {
    for (const fn of [...ascoltatori]) {
      try { fn(e); } catch { /* una finestra chiusa non toglie il segnale alle altre */ }
    }
  };
  return {
    segna(sessionId, attivo) {
      if (typeof sessionId !== 'string' || sessionId === '' || typeof attivo !== 'boolean') return;
      if (attivo) {
        if (sessionId === corrente) return;
        corrente = sessionId;
      } else {
        if (sessionId !== corrente) return;
        corrente = null;
      }
      avvisa(evento(sessionId, attivo));
    },
    istantanea() {
      return evento(corrente, corrente !== null);
    },
    ascolta(fn) {
      const voce = (e) => fn(e);
      ascoltatori.add(voce);
      return () => { ascoltatori.delete(voce); };
    },
  };
}
