/*
 * Il Terminale: settima superficie dell'estrazione, e la prima che sta sopra
 * un backend costruito lo stesso giorno (riga W1-01, `terminal-registry.mjs`).
 *
 * Decisione G8-G10 del redesign: il terminale dichiara SEMPRE da quale
 * cartella parte, se è isolato o gira sulla tua macchina, e CHI ha lanciato il
 * comando (tu o l'agente). Più le schede multiple, che il backend ora regge.
 *
 * ⛔⛔ La riconnessione. Ricerca del 05/09/2026:
 *  · backoff esponenziale CON jitter — 500 ms che raddoppiano, tetto 30 s,
 *    ±50% di rumore: senza jitter, al riavvio del server tutti i client
 *    tornano insieme e lo travolgono;
 *  · un tetto ai tentativi, e poi uno stato «scollegato» DICHIARATO. Ritentare
 *    all'infinito non è resilienza: è nascondere a chi guarda che è finita;
 *  · identità della CONNESSIONE e identità della SESSIONE sono due cose, e chi
 *    riprende deve dire SE ha ripreso davvero (in Ably è il flag `resumed`).
 * Fonti: websocket.org/guides/reconnection/ · faqs.ably.com/connection-state-recovery
 * · oneuptime.com/blog/post/2026-01-27-websocket-reconnection/view
 *
 * ⭐⭐⭐ Il segnale «ripreso» ORA ESISTE, ed è misurato invece che dedotto. Il
 * ponte manda `{evento:'agganciato', ripreso:bool}` prima di ogni byte, e la
 * risposta viene dal registro delle PTY — l'unico che sa se ha riagganciato
 * una shell viva o ne ha aperta una nuova perché il reaper aveva chiuso la
 * precedente. Dall'esterno quei due casi sono identici (il backlog si rigioca
 * comunque, e una PTY appena nata ha backlog vuoto come una viva che non ha
 * ancora stampato): dedurlo sarebbe un indovinello.
 *
 * ⛔ Restano TRE esiti, non due: ripresa · shell nuova · **non dichiarato**.
 * Un ponte che non manda il segnale non diventa «shell nuova» per comodità —
 * si continua a dire che non lo sappiamo. Appiattire l'ignoto sul negativo è
 * il modo in cui un'interfaccia comincia a mentire senza che nessuno lo scelga.
 *
 * ⛔ Un 403 NON si ritenta. È il registro che dice «questa scheda non è tua o
 * non esiste» (W1-01, forma di CVE-2026-59224): insistere sarebbe bussare a
 * una porta che ha già risposto, e nasconderebbe l'unica cosa utile da dire.
 */
const ATTESA_INIZIALE_MS = 500;
const ATTESA_MASSIMA_MS = 30_000;
const TENTATIVI_MASSIMI = 12;

/** Backoff esponenziale con jitter ±50%. */
export function attesaPrimaDiRiprovare(tentativo, { casuale = Math.random } = {}) {
  const base = Math.min(ATTESA_INIZIALE_MS * (2 ** Math.max(0, tentativo - 1)), ATTESA_MASSIMA_MS);
  // ±50%: due client caduti insieme non tornano insieme.
  return Math.round(base * (0.5 + casuale()));
}

export function createTerminalSurface({
  documentObj,
  labels,
  trasporto,
  creaVista,
  testId,
  onCloseTab,
  programmaAttesa = (fn, ms) => setTimeout(fn, ms),
  annullaAttesa = (id) => clearTimeout(id),
  casuale = Math.random,
}) {
  if (!documentObj || !trasporto || typeof creaVista !== 'function') {
    throw new TypeError('dipendenze terminale mancanti');
  }
  if (!labels || !labels.states || !labels.launchedBy) {
    throw new TypeError('il terminale richiede le sue etichette (states, launchedBy)');
  }

  const radice = documentObj.createElement('section');
  radice.className = 'talos-terminal';
  radice.setAttribute('aria-label', labels.regionLabel || 'Terminale');
  if (testId) radice.dataset.testid = testId;

  /*
   * L'intestazione che dichiara le tre cose di G8-G10. Non è decorazione: un
   * terminale che non dice da dove parte è un comando dato al buio.
   */
  const intestazione = documentObj.createElement('div');
  intestazione.className = 'talos-terminal__header';
  const cartella = documentObj.createElement('span');
  cartella.className = 'talos-terminal__folder';
  const isolamento = documentObj.createElement('span');
  isolamento.className = 'talos-terminal__isolation';
  const autore = documentObj.createElement('span');
  autore.className = 'talos-terminal__author';
  intestazione.append(cartella, isolamento, autore);

  const corpo = documentObj.createElement('div');
  corpo.className = 'talos-terminal__body';

  /*
   * Lo stato del collegamento parla, ma con parsimonia: è una regione
   * `role="status"` piccola e separata, e cambia solo quando lo stato cambia
   * davvero — non a ogni byte che arriva dalla shell.
   */
  const stato = documentObj.createElement('p');
  stato.className = 'talos-terminal__state';
  stato.setAttribute('role', 'status');

  radice.append(intestazione, corpo, stato);

  let props = { tab: null, launchedBy: null };
  let vista = null;
  let connessione = null;
  let tentativi = 0;
  let timer = null;
  let statoCorrente = 'closed';
  let ultimaFrase = null;
  let avutoOutput = false;
  let agganciamento = null;
  let distrutta = false;

  /*
   * La frase giusta per come siamo arrivati qui. Alla PRIMA connessione non
   * c'è niente da riprendere, quindi «collegato» e basta; da lì in poi conta
   * cosa ha dichiarato il ponte, e `null` resta «non dichiarato».
   */
  function statoDellAggancio() {
    if (!avutoOutput) return 'open';
    if (agganciamento === true) return 'reconnected-resumed';
    if (agganciamento === false) return 'reconnected-new';
    return 'reconnected-unknown';
  }

  function scriviStato(chiave, extra = null) {
    statoCorrente = chiave;
    radice.dataset.stato = chiave;
    const frase = [labels.states[chiave] || chiave, extra].filter(Boolean).join(' ');
    if (frase !== ultimaFrase) {
      ultimaFrase = frase;
      stato.textContent = frase;
    }
  }

  function fermaAttesa() {
    if (timer !== null) {
      annullaAttesa(timer);
      timer = null;
    }
  }

  function chiudiConnessione() {
    fermaAttesa();
    if (connessione) {
      connessione.destroy();
      connessione = null;
    }
  }

  function apri() {
    if (distrutta || !props.tab) return;
    connessione = trasporto.open({
      terminalId: props.tab.terminalId,
      onData: (dati) => {
        avutoOutput = true;
        vista?.scrivi(dati);
      },
      onExit: (codice) => {
        // L'uscita della shell è un fatto, non una caduta di rete: non si ritenta.
        chiudiConnessione();
        scriviStato('exited', codice === null || codice === undefined ? null : String(codice));
      },
      onError: (errore) => {
        /*
         * ⛔ 403: il registro ha detto no. Non si ritenta — e si dice perché,
         * altrimenti chi guarda vede solo «non funziona».
         */
        if (errore?.status === 403 || errore?.code === 'TERMINAL_FORBIDDEN') {
          chiudiConnessione();
          scriviStato('forbidden');
          return;
        }
        scriviStato('error');
      },
      onAttach: (ripreso) => {
        agganciamento = ripreso;
        // Il segnale può arrivare prima o dopo `onState('open')`: chi arriva
        // secondo scrive lo stato, così l'ordine sul filo non decide la frase.
        if (statoCorrente === 'open' || statoCorrente === 'reconnected-unknown'
          || statoCorrente === 'reconnected-resumed' || statoCorrente === 'reconnected-new') {
          scriviStato(statoDellAggancio());
        }
      },
      onState: (nuovo) => {
        if (nuovo === 'open') {
          tentativi = 0;
          scriviStato(statoDellAggancio());
          return;
        }
        if (nuovo === 'closed' && statoCorrente !== 'exited' && statoCorrente !== 'forbidden') {
          riprova();
        }
      },
    });
  }

  function riprova() {
    if (distrutta) return;
    connessione = null;
    // ⛔ Il dichiarato del ponte vale per LA connessione che l'ha detto: si
    // azzera, altrimenti la prossima erediterebbe una risposta non sua.
    agganciamento = null;
    if (tentativi >= TENTATIVI_MASSIMI) {
      // ⛔ Ritentare all'infinito nasconde a chi guarda che è finita.
      scriviStato('disconnected', String(tentativi));
      return;
    }
    tentativi += 1;
    const attesa = attesaPrimaDiRiprovare(tentativi, { casuale });
    scriviStato('reconnecting', `${Math.round(attesa / 1000)}`);
    timer = programmaAttesa(() => { timer = null; apri(); }, attesa);
  }

  function disegnaIntestazione() {
    const scheda = props.tab;
    // ⛔ Senza scheda non si scrive una cartella finta: si dice che non c'è.
    cartella.textContent = scheda?.cartella || labels.noFolder || '';
    if (scheda?.cartella) cartella.setAttribute('title', scheda.cartella);
    else cartella.removeAttribute('title');

    /*
     * ⛔ Isolato o sulla tua macchina: TRE stati, non due. Se non lo sappiamo
     * lo diciamo — far credere «sulla tua macchina» a una shell isolata, o il
     * contrario, cambia cosa una persona si sente libera di scrivere.
     */
    const isolata = scheda?.isolato;
    const chiaveIsolamento = isolata === true ? 'isolated' : (isolata === false ? 'host' : 'unknownIsolation');
    isolamento.textContent = labels.isolation?.[chiaveIsolamento] || '';
    isolamento.dataset.isolamento = chiaveIsolamento;

    const chi = props.launchedBy;
    autore.textContent = chi ? (labels.launchedBy[chi] || chi) : (labels.launchedBy.unknown || '');
    autore.dataset.autore = chi || 'unknown';
  }

  return Object.freeze({
    element: radice,
    update(nextProps = {}) {
      const schedaPrima = props.tab?.terminalId ?? null;
      props = { ...props, ...nextProps };
      disegnaIntestazione();
      const schedaOra = props.tab?.terminalId ?? null;
      if (schedaOra === schedaPrima) return;
      // Cambiare scheda è cambiare shell: si chiude e si riparte da zero.
      chiudiConnessione();
      vista?.destroy();
      vista = null;
      tentativi = 0;
      avutoOutput = false;
      agganciamento = null;
      ultimaFrase = null;
      if (!schedaOra) {
        corpo.replaceChildren();
        scriviStato('closed');
        return;
      }
      vista = creaVista({ document: documentObj, contenitore: corpo, onInput: (testo) => connessione?.send(testo), onResize: (c, r) => connessione?.resize(c, r) });
      scriviStato('connecting');
      apri();
    },
    /** Chiudere una scheda è una decisione della persona: non si ritenta dopo. */
    chiudi() {
      if (!props.tab) return false;
      chiudiConnessione();
      scriviStato('closed');
      if (typeof onCloseTab === 'function') onCloseTab(props.tab);
      return true;
    },
    stato: () => statoCorrente,
    destroy() {
      if (distrutta) return false;
      distrutta = true;
      chiudiConnessione();
      vista?.destroy();
      vista = null;
      radice.remove();
      return true;
    },
  });
}
