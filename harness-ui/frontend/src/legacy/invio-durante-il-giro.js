/*
 * ⛔⛔⛔ IL BIVIO DELL'INVIO DURANTE UN GIRO — la DECISIONE, staccata dal DOM.
 *
 * Owner, due volte: 11/09 «funziona malissimo», 13/09 «adesso quasi inutilizzabile». Il difetto
 * che nomina è sempre lo stesso: scrive mentre il modello lavora, vuole ACCODARE, e parte un
 * REINDIRIZZAMENTO. Le due vie esistono entrambe e sono vive (POST .../queue e POST .../redirect):
 * il difetto non è che la coda manchi, è che parte l'altra.
 *
 * ⛔ Misurato nel codice il 13/09, e non nel solo sorgente: le due cause stanno ANCHE nel pacchetto
 *   servito (`public/app.js`), quindi sono ciò che l'owner ha davvero sotto le dita.
 *
 *   1. `apriBivioInvio` apriva il bivio col fuoco su «Indirizza ora»
 *      (`[data-bivio="indirizza"]`, sorgente riga 9945 / bundle riga 26494). Chi preme Invio per
 *      mandare un messaggio trova il bivio aperto e preme Invio una seconda volta — il gesto più
 *      naturale del mondo — e quel secondo Invio attiva il pulsante che ha il fuoco. Un <button>
 *      si attiva con Invio e con Spazio: il reindirizzamento partiva da solo, senza che nessuno
 *      lo scegliesse davvero.
 *   2. Il pulsante «Reindirizza» si scopre da solo appena c'è del testo, DENTRO la barra del
 *      composer subito prima di microfono e invio (sorgente riga 9311): la fila si allarga sotto
 *      il cursore mentre si scrive, e il clic diretto fa partire il reindirizzamento senza
 *      chiedere niente.
 *
 * ⇒ Qui sta la regola, in funzioni PURE: nessun DOM, nessuna rete, nessuno stato globale. Il
 *   monolite (`legacy/app.js`, 20.638 righe e nessuna cucitura) resta il posto dove si tocca lo
 *   schermo; QUESTO è il posto dove si decide, ed è l'unico che una prova può interrogare senza
 *   un browser. Estratto il gruppo che governa questo momento e NIENT'ALTRO: bivio, coda,
 *   reindirizzo, cronologia del campo di scrittura.
 *
 * ⛔ L'invariante che questo file esiste per difendere: NESSUN ingresso di `decidiInvio` produce
 *   un reindirizzamento. Il reindirizzamento non è mai una conseguenza dell'Invio — è solo il
 *   frutto di una scelta esplicita, e `reindirizzoConsentito` è il cancello che lo pretende.
 */

/** Le quattro uscite possibili dell'Invio. Fra queste NON c'è «indirizza», ed è il punto. */
export const AZIONE_COMANDO = 'comando';
export const AZIONE_ACCODA = 'accoda';
export const AZIONE_BIVIO = 'bivio';
export const AZIONE_INVIA = 'invia';

/**
 * Che cosa deve fare l'Invio, dato ciò che c'è nel campo e se un giro sta girando.
 *
 * ⛔ `!` non è né un indirizzo né una coda: un comando gira sulla macchina, subito, e chiedere
 *   «indirizzo o accodo?» sarebbe una domanda senza risposta giusta (D-10D).
 * ⛔ Ctrl/⌘+Invio salta il bivio e accoda diretto (B15): chi sa già cosa vuole non paga una
 *   domanda in più.
 */
export function decidiInvio({ testo = '', giroAttivo = false, conCtrl = false } = {}) {
  const pulito = String(testo ?? '');
  if (pulito.startsWith('!')) return AZIONE_COMANDO;
  const durante = Boolean(pulito) && Boolean(giroAttivo);
  if (conCtrl) return durante ? AZIONE_ACCODA : AZIONE_INVIA;
  if (durante) return AZIONE_BIVIO;
  return AZIONE_INVIA;
}

/** Le tre scelte del bivio, nell'ordine in cui stanno nel markup. */
export const SCELTE_BIVIO = Object.freeze(['indirizza', 'accoda', 'annulla']);

/*
 * ⛔⛔ LA SCELTA PREDEFINITA È QUELLA CONSERVATIVA, e non è un dettaglio di stile.
 *
 * Delle due strade, «accoda» è quella che non toglie niente a nessuno: il messaggio arriva alla
 * fine del turno e il lavoro in corso non viene toccato. «Indirizza» interrompe il giro al
 * prossimo punto sicuro — è l'azione che costa. Quando un bivio si apre col fuoco addosso a una
 * delle due, quella diventa ciò che accade a chi preme Invio senza guardare: il fuoco È il
 * default, e il default deve essere il gesto che non fa danno.
 */
export const SCELTA_PREDEFINITA_BIVIO = 'accoda';
export const SELETTORE_SCELTA_PREDEFINITA = `[data-bivio="${SCELTA_PREDEFINITA_BIVIO}"]`;

/*
 * ⛔ IL CANCELLO DEL REINDIRIZZAMENTO. Un reindirizzamento parte SOLO se chi lo chiede sa dire da
 *   dove viene, e l'unica provenienza buona è una scelta fatta apposta da una persona. Serve a
 *   rendere impossibile la classe di difetto — non a curarne un'istanza: qualunque strada futura
 *   che arrivi qui «per conseguenza» viene respinta invece di partire in silenzio.
 */
export const ORIGINE_SCELTA_ESPLICITA = 'scelta-esplicita';
export function reindirizzoConsentito(origine) {
  return origine === ORIGINE_SCELTA_ESPLICITA;
}

/*
 * ⛔ La scorciatoia «Reindirizza» nella barra del composer. Resta ACCESA come prima — spegnerla è
 *   una decisione di prodotto che non spetta a me, e la suite `frontend/tests/browser/
 *   baseline-shell.spec.mjs` (RUN-REDIRECT-05 e vicini) codifica oggi la comparsa del pulsante.
 *   Sta qui, con un nome, perché l'owner la spenga con UNA riga il giorno che vuole: la fila che
 *   si allarga sotto il cursore mentre si scrive è il secondo modo in cui parte un
 *   reindirizzamento non voluto, e va detto invece di essere cambiato di nascosto.
 */
export const SCORCIATOIA_REINDIRIZZO_ABILITATA = true;
export function mostraPulsanteReindirizzo({
  giroAttivo = false,
  haTesto = false,
  scorciatoiaAbilitata = SCORCIATOIA_REINDIRIZZO_ABILITATA,
} = {}) {
  if (!scorciatoiaAbilitata) return false;
  return Boolean(giroAttivo && haTesto);
}

/*
 * ───────────────────────── PO-21 — la freccia in su ─────────────────────────
 *
 * La cronologia col tasto ↑ esisteva già, ma era dei soli COMANDI `!`: `ricordaComandoDiretto`
 * salvava il comando SENZA il suo `!` e `scorriCronologiaComandi` glielo rimetteva rileggendolo.
 *
 * ⛔⛔ Ed è lì la trappola che l'estensione ai messaggi normali avrebbe fatto scattare: rimettere
 *   `!` davanti a OGNI voce ripescata avrebbe trasformato un messaggio normale in un comando di
 *   shell al primo ↑. Un difetto che non esisteva finché la lista conteneva solo comandi, e che
 *   sarebbe nato nel momento esatto in cui ci fosse entrato un messaggio.
 * ⇒ Le voci si salvano VERBATIM, esattamente come sono state scritte — `!` compreso quando c'era —
 *   e si ripescano senza toccarle. Chiave nuova (v2) perché le voci v1 hanno l'altra forma: si
 *   migrano rimettendo il `!` che a loro spettava, invece di essere buttate o fraintese.
 *
 * ⛔ TRE SCELTE NON SONO MIE e le lascio all'owner, prendendo ogni volta la via conservativa:
 *   · UNA lista sola, non due: ↑ è un gesto solo, e due liste vorrebbero un secondo gesto che
 *     nessuno ha chiesto.
 *   · GLOBALE, come oggi: per-sessione è un cambiamento di comportamento, non un'estensione.
 *   · TETTO invariato a 50: il numero che c'era, non uno nuovo scelto da me.
 */
export const CHIAVE_CRONOLOGIA_V1 = 'talos.harness.desktop.comandi.v1';
export const CHIAVE_CRONOLOGIA_V2 = 'talos.harness.desktop.composer.v2';
export const TETTO_CRONOLOGIA = 50;

const usabile = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * La cronologia del campo di scrittura. `leggi`/`scrivi` sono iniettati: in produzione sono
 * `localStorage`, che in una finestra privata LANCIA invece di restituire vuoto — e una
 * cronologia assente non deve mai impedire di mandare un messaggio.
 */
export function creaCronologiaComposer({ leggi, scrivi, tetto = TETTO_CRONOLOGIA } = {}) {
  let voci = null;
  let indice = -1;

  function carica() {
    if (voci) return voci;
    voci = [];
    try {
      const v2 = JSON.parse(leggi(CHIAVE_CRONOLOGIA_V2) || '[]');
      if (Array.isArray(v2) && v2.length) voci = v2.filter(usabile);
      else {
        const v1 = JSON.parse(leggi(CHIAVE_CRONOLOGIA_V1) || '[]');
        /* ⛔ le voci v1 erano comandi salvati SENZA il loro `!`: si rimette, o al primo ↑ un
           comando tornerebbe su travestito da messaggio. */
        if (Array.isArray(v1)) voci = v1.filter(usabile).map((c) => `!${c}`);
      }
    } catch { voci = []; }
    return voci;
  }

  /** Ricorda il testo COSÌ COM'È STATO SCRITTO. Vale per ogni via: invio, coda, indirizzo, comando. */
  function ricorda(testo) {
    const pulito = String(testo ?? '').trim();
    if (!pulito) return;
    const lista = carica();
    if (lista[0] !== pulito) lista.unshift(pulito);
    voci = lista.slice(0, tetto);
    indice = -1;
    try { scrivi(CHIAVE_CRONOLOGIA_V2, JSON.stringify(voci)); } catch { /* niente cronologia, il messaggio parte lo stesso */ }
  }

  /**
   * ↑/↓ scorrono la cronologia. `direzione` = -1 (più indietro) o +1 (più avanti).
   *
   * ⛔ Solo a campo VUOTO, o mentre si sta già scorrendo: in una textarea le frecce muovono il
   *   cursore fra le righe, ed è ciò che si aspetta chi sta scrivendo un messaggio lungo.
   * @returns {string|null} il testo da mettere nel campo, o `null` se il tasto NON va consumato.
   */
  function scorri(direzione, { campoVuoto = false } = {}) {
    const inScorrimento = indice >= 0;
    if (!campoVuoto && !inScorrimento) return null;
    const lista = carica();
    if (!lista.length) return null;
    const prossimo = indice + (direzione < 0 ? 1 : -1);
    if (prossimo < -1 || prossimo >= lista.length) return null;
    indice = prossimo;
    /* Tornati oltre il più recente si torna al foglio bianco, non all'ultimo messaggio ripetuto. */
    return prossimo === -1 ? '' : lista[prossimo];
  }

  /*
   * ⛔ 13/09, review — QUI c'erano anche `azzeraScorrimento` e `staScorrendo`, e non li chiamava
   *   NESSUNO: né il monolite né la prova. Erano invisibili anche ai cancelli, perché
   *   `cancello.mjs` e `statico.mjs` leggono una lista fissa (`src/legacy/app.js` + `src/components`
   *   + `src/bridge`) e questo file nuovo non vi compare. ⇒ tolti: un'uscita che nessuno apre non è
   *   un'API, è codice morto che nessuna misura può vedere morire.
   */
  return {
    ricorda,
    scorri,
    voci: () => [...carica()],
  };
}
