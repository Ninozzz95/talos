/*
 * Connessione col server — lo stato onesto nella barra di stato (T-15).
 *
 * 05/9, owner: «t 15 approvato adesso». Prima, a server caduto, lo schermo
 * taceva per 15 s e all'invio usciva «Failed to fetch»; al ritorno nessun
 * segno. Qui: una macchina a quattro stati che ascolta i segnali che la app
 * ha già (l'EventSource che riprova, le fetch che falliscono, gli eventi
 * online/offline del browser) e li conferma con un battito su
 * `/api/v1/health` SOLO quando qualcosa non va — mai in stato sano.
 *
 * Ricerca del 05/09/2026:
 *  - EventSource: `onerror` con readyState CONNECTING = sta riprovando da solo;
 *    CLOSED = ha rinunciato, si riapre a mano (MDN EventSource; html.spec.whatwg.org
 *    §9.2; javascript.info/server-sent-events).
 *  - UX: l'indicatore compare dopo il PRIMO tentativo fallito, non quando
 *    l'invio fallisce; dopo che i tentativi automatici si esauriscono, un
 *    «Riprova» manuale (websocket.org/guides/reconnection; coder/mux #1194,
 *    2025: «Reconnecting to server (attempt N)…»).
 *  - `navigator.onLine` e gli eventi online/offline sono inaffidabili da soli:
 *    si confermano con un battito vero (xjavascript.com online-offline;
 *    websocket.org/guides/heartbeat; oneuptime 2026-01-24 connection health).
 */

export const STATI = Object.freeze(['collegato', 'riconnessione', 'caduto', 'ricollegato']);

/** Le parole a schermo (H22: niente termini tecnici). */
export const TESTI = Object.freeze({
  collegato: '',
  riconnessione: (n) => `Connessione persa · riprovo${n > 1 ? ` (${n})` : '…'}`,
  caduto: 'Il server non risponde',
  ricollegato: 'Collegato di nuovo',
});

export const RITMO = Object.freeze({
  battitoMinimoMs: 2000, // primo battito dopo un segnale di caduta
  battitoMassimoMs: 15000, // tetto della crescita geometrica
  tentativiPrimaDiArrendersi: 4, // poi «caduto» + Riprova manuale (il battito continua, più lento)
  ricollegatoVisibileMs: 4000,
});

/**
 * La macchina. `ping()` deve risolvere a true se il server risponde 200.
 * `suCambio(stato, dettagli)` riceve ogni transizione; `suRicollegato()` è il
 * gancio per riaprire lo stream degli eventi.
 * Tutto il tempo passa da `adesso()`/`pianifica()` per essere provabile in Node.
 */
export function creaSorveglianzaConnessione({
  ping,
  suCambio = () => {},
  suRicollegato = () => {},
  pianifica = (fn, ms) => globalThis.setTimeout(fn, ms),
  annulla = (id) => globalThis.clearTimeout(id),
} = {}) {
  let stato = 'collegato';
  let tentativi = 0;
  let timer = null;
  let timerRicollegato = null;
  let battitoInCorso = false;
  let epoca = 0;
  let sospesa = false;
  const caduta = () => stato === 'riconnessione' || stato === 'caduto';

  const cambia = (nuovo, dettagli = {}) => {
    if (stato === nuovo && nuovo !== 'riconnessione') return;
    stato = nuovo;
    suCambio(nuovo, { tentativi, ...dettagli });
  };
  const fermaBattito = () => {
    if (timer != null) { annulla(timer); timer = null; }
  };
  const fermaConferma = () => {
    if (timerRicollegato != null) { annulla(timerRicollegato); timerRicollegato = null; }
  };

  const pianificaBattito = (subito = false) => {
    fermaBattito();
    if (sospesa || !caduta() || battitoInCorso) return;
    const ms = subito ? 0 : Math.min(RITMO.battitoMassimoMs,
      RITMO.battitoMinimoMs * 2 ** Math.max(0, tentativi - 1));
    timer = pianifica(battito, ms);
  };

  const tornato = () => {
    // Una ripresa appartiene a una caduta, non a ogni evento dello stream.
    if (sospesa || !caduta()) return;
    epoca += 1;
    fermaBattito();
    fermaConferma();
    tentativi = 0;
    cambia('ricollegato');
    if (sospesa || stato !== 'ricollegato') return;
    timerRicollegato = pianifica(() => {
      timerRicollegato = null;
      if (!sospesa && stato === 'ricollegato') cambia('collegato');
    }, RITMO.ricollegatoVisibileMs);
    suRicollegato();
  };

  async function battito() {
    timer = null;
    if (sospesa || !caduta() || battitoInCorso) return;
    const epocaRichiesta = epoca;
    battitoInCorso = true;
    let vivo = false;
    try { vivo = await ping() === true; } catch { vivo = false; }
    battitoInCorso = false;
    if (sospesa) return;
    // Un ping vecchio non può smentire una ripresa né certificare una nuova caduta.
    if (epocaRichiesta !== epoca) { pianificaBattito(); return; }
    if (vivo) { tornato(); return; }
    tentativi += 1;
    cambia(tentativi >= RITMO.tentativiPrimaDiArrendersi ? 'caduto' : 'riconnessione');
    pianificaBattito();
  }

  const sospetto = (motivo) => {
    if (!caduta()) {
      epoca += 1;
      fermaConferma();
      tentativi = 1;
      cambia('riconnessione', { tentativi, motivo });
    }
    if (timer == null && !battitoInCorso) pianificaBattito();
  };
  // Conserva il contratto esistente: un nuovo segnale esplicito può riattivare
  // la sorveglianza dopo ferma(); una risposta pendente, da sola, non può farlo.
  const riprendi = () => { sospesa = false; };

  return {
    stato: () => stato,
    tentativi: () => tentativi,
    segnalaRete(ok, motivo = 'fetch') { riprendi(); if (ok) tornato(); else sospetto(motivo); },
    segnalaSse(readyState) { riprendi(); sospetto(readyState === 2 ? 'sse-chiuso' : 'sse-riprova'); },
    segnalaEventoVivo() { riprendi(); tornato(); },
    segnalaBrowser(online) { riprendi(); if (online) pianificaBattito(true); else sospetto('browser-offline'); },
    riprova() { riprendi(); pianificaBattito(true); },
    ferma() {
      sospesa = true;
      epoca += 1;
      fermaBattito();
      fermaConferma();
    },
  };
}

/**
 * Scrive lo stato nel pezzo di barra di stato del mockup:
 * `<span data-runtime-connessione>` + `<button data-runtime-riprova>`.
 */
export function aggiornaStatoConnessione(barra, stato, { tentativi = 0 } = {}) {
  if (!barra) return;
  const span = barra.querySelector('[data-runtime-connessione]');
  const riprova = barra.querySelector('[data-runtime-riprova]');
  if (!span) return;
  const testo = typeof TESTI[stato] === 'function' ? TESTI[stato](tentativi) : TESTI[stato] || '';
  span.textContent = testo;
  span.hidden = !testo;
  span.dataset.stato = stato;
  if (riprova) riprova.hidden = stato !== 'caduto';
  barra.dataset.connessione = stato;
}
