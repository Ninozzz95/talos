/**
 * Il browser VIVO di una sessione: un Chromium di sistema pilotato dal nostro server.
 *
 * ⛔ 07/09/2026, owner: «bisogna trovare un modo per visualizzare ogni fottuta pagina web —
 *   dobbiamo fare meglio degli altri». Il tag `iframe` non può farlo: un sito che vieta la cornice
 *   lascia un rettangolo grigio, e Chrome ci carica dentro la propria pagina d'errore sparando un
 *   `load` regolare, così nemmeno il ripiego scatta. Tutti i concorrenti diretti usano un browser
 *   VERO — Hermes un `webview` di Electron, altri il Chrome dell'utente via estensione oppure
 *   un browser in-app — e i servizi che lo fanno da server (Browserbase, Steel, Cloudflare
 *   Browser Run) ne trasmettono lo schermo via CDP invece di incorniciarlo.
 *
 * ⭐ Il nostro vantaggio, e non è estetico: il browser lo apre il SERVER, cioè lo stesso posto dove
 *   gira l'agente e dove vive il dev server. `localhost:5173` è vero per tutti e due, senza tunnel.
 *   Hermes dichiara nel proprio `preview-reach.ts` che col gateway cloud quel problema non ha
 *   soluzione: qui non si pone.
 *
 * Questo modulo è il COLLANTE fra i tre pezzi già provati, e non ne duplica nessuno:
 *   `browser-vivo.mjs`   trova e avvia il Chromium, parla CDP
 *   `browser-stream.mjs` trasmette i fotogrammi e riporta indietro i gesti
 *   `browser-annota.mjs` mette l'overlay nella pagina e descrive un elemento
 *
 * ── I tre vincoli che la ricerca ha aggiunto, e che dal nostro codice non si vedevano ───────────
 *
 * 1. ⛔ UNA SCHEDA NON È UN CONFINE. Le schede aperte nel contesto predefinito **si scambiano
 *    cookie, localStorage e sessionStorage**: due sessioni TALOS che aprono due pagine si
 *    vedrebbero i dati a vicenda. Il confine è il BrowserContext, che è un confine di *storage*,
 *    non di finestra — schede di contesti diversi stanno nella stessa finestra senza problemi.
 *    ⇒ Un contesto per sessione, creato con `Target.createBrowserContext` e buttato con
 *    `Target.disposeBrowserContext` quando la sessione chiude.
 *    (vercel-labs/agent-browser #1068 e la guida CDP di browser-use, lette il 07/09/2026.)
 *
 * 2. ⛔ UNA SCHEDA PUÒ MORIRE SENZA DIRCELO (crash del renderer, la persona che la chiude nella
 *    finestra vera). Senza ascoltare `Target.detachedFromTarget` il gestore continua a credere
 *    viva una scheda che non c'è più, e ogni comando successivo fallisce in un modo che non
 *    somiglia alla causa. ⇒ Si ascolta, e la scheda morta si toglie dalla mappa subito.
 *    (Il pattern «SessionManager come unica fonte di verità», stessa guida.)
 *
 * 3. ⛔ LA DURATA È IL COSTO. Sui servizi in cloud si paga al minuto («optimizing your agent to
 *    close sessions promptly is the largest cost lever», Steel, 07/09/2026); qui non si paga in
 *    denaro ma in RAM sul computer di chi ci lavora — una scheda dimenticata tiene vivo un
 *    Chromium intero. ⇒ Una scadenza per inattività: niente gesti, niente trasmissione, niente
 *    navigazioni per un tempo dichiarato ⇒ la scheda si chiude da sé.
 *
 * ── E la regola che vale su tutto ───────────────────────────────────────────────────────────────
 * ⛔ Una sola finestra per tutto il server: aprire un browser per sessione vorrebbe dire N processi
 *   Chrome sul computer di chi ci lavora.
 * ⛔ Il profilo è NOSTRO e sta fuori dal progetto: TALOS non tocca mai il profilo personale, non
 *   vede le tue schede e non eredita i tuoi cookie.
 * ⛔ Ciò che arriva dalla pagina (testo, HTML, errori di console) è contenuto NON AFFIDABILE:
 *   diventa un dato dentro un pacchetto, mai un'istruzione per il modello.
 */
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { avviaBrowserVivo, trovaChromium, creaClientCdp, apriSchedaVuota, vaiA } from './browser-vivo.mjs';
import { avviaTrasmissione, fermaTrasmissione, mandaClic, mandaTasto, mandaRotella, ridimensiona } from './browser-stream.mjs';
import { installaOverlay, descriviElemento, raccogliErrori } from './browser-annota.mjs';

/** Dove vive il profilo del browser pilotato: fuori dal progetto, dentro i temporanei di sistema. */
export function cartellaProfiloPredefinita(base = tmpdir()) {
  return join(base, 'talos-browser-vivo');
}

/** Quanto può restare aperta una scheda che nessuno tocca. Dieci minuti: il tempo di leggere una pagina. */
export const INATTIVITA_MS = 10 * 60 * 1000;

export function errorePagina(codice, messaggio, causa) {
  const e = new Error(messaggio);
  e.code = codice;
  if (causa) e.cause = causa;
  return e;
}

export function creaGestoreBrowserVivo({
  trovaFn = trovaChromium,
  avviaFn = avviaBrowserVivo,
  clientFn = creaClientCdp,
  connettiFn = null, // (wsUrl) => Promise<socket ws>, iniettata da chi crea il gestore
  cartellaProfilo = cartellaProfiloPredefinita(),
  schedeMassime = 6,
  inattivitaMs = INATTIVITA_MS,
  orologio = () => Date.now(),
} = {}) {
  let finestra = null; // {browser, cdp, socket, canale, staccaMorte}
  const schede = new Map(); // sessionId → {cdpSessionId, targetId, contestoId, url, ferma, errori, staccaErrori, toccataA}

  function tocca(scheda) { scheda.toccataA = orologio(); }

  /** La scheda è morta là fuori: si toglie dalla mappa, senza provare a parlarle. */
  function dimentica(targetId) {
    for (const [sessionId, scheda] of schede) {
      if (scheda.targetId !== targetId) continue;
      if (scheda.staccaErrori) { try { scheda.staccaErrori(); } catch { /* già staccati */ } }
      scheda.ferma = null;
      schede.delete(sessionId);
      return sessionId;
    }
    return null;
  }

  async function assicuraFinestra() {
    if (finestra) return finestra;
    const trovato = trovaFn();
    if (!trovato) {
      throw errorePagina('BROWSER_VIVO_ASSENTE',
        'Non trovo un browser Chromium su questo computer. TALOS ne usa uno già installato — Chrome o Edge — e non ne scarica uno suo.');
    }
    const browser = await avviaFn({ percorso: trovato.percorso, cartellaProfilo });
    if (typeof connettiFn !== 'function') {
      await browser.chiudi();
      throw errorePagina('BROWSER_VIVO_SENZA_CONNESSIONE', 'Manca il modo di collegarsi al browser (connettiFn)');
    }
    let socket;
    try {
      socket = await connettiFn(browser.wsUrl);
    } catch (causa) {
      await browser.chiudi();
      throw errorePagina('BROWSER_VIVO_CONNESSIONE_FALLITA', 'Il browser è partito ma non risponde al protocollo di controllo', causa);
    }
    const cdp = clientFn(socket);
    // vincolo 2: la verità su chi è vivo la dice il browser, non la nostra mappa
    const staccaMorte = cdp.su('Target.detachedFromTarget', (evento) => { if (evento?.targetId) dimentica(evento.targetId); });
    /*
     * ⛔ 07/9, trovato dalla prova C25: cliccando un link DENTRO la pagina, TALOS continuava a
     *   credere di stare all'indirizzo di prima — la barra mostrava il vecchio, e chi rileggeva la
     *   pagina rileggeva quella sbagliata. Una pagina viva naviga per conto suo (un clic, un
     *   redirect, un `history.pushState`): l'indirizzo lo dice il browser, non la nostra memoria.
     */
    const segnaIndirizzo = (sessione, url) => {
      if (!url) return;
      for (const scheda of schede.values()) {
        if (scheda.cdpSessionId === sessione) { scheda.url = url; tocca(scheda); }
      }
    };
    const daContesto = (contesto) => (typeof contesto === 'string' ? contesto : contesto?.sessionId);
    const staccaNavigazione = cdp.su('Page.frameNavigated', (evento, contesto) => {
      const frame = evento?.frame;
      if (!frame || frame.parentId) return; // solo il frame principale: un iframe dentro la pagina non è «la pagina»
      segnaIndirizzo(daContesto(contesto), frame.url);
    });
    /*
     * ⛔⛔ 07/9 — misurato sul 4174 cliccando «Issues» dentro github: la pagina cambiava DAVVERO
     *   (l'annotazione leggeva «Issues Search Issues…») e l'indirizzo di TALOS restava quello di
     *   prima. Causa: i siti moderni navigano SENZA ricaricare il documento (`history.pushState`,
     *   Turbo, i router delle SPA), e `Page.frameNavigated` non scatta — è il limite che il modulo
     *   del motore aveva dichiarato e lasciato aperto. `Page.navigatedWithinDocument` è l'evento che
     *   racconta proprio quel caso: senza, la barra mente su metà del web.
     */
    const staccaDentroDocumento = cdp.su('Page.navigatedWithinDocument', (evento, contesto) => {
      segnaIndirizzo(daContesto(contesto), evento?.url);
    });
    finestra = { browser, cdp, socket, canale: trovato.canale, staccaMorte, staccaNavigazione, staccaDentroDocumento };
    return finestra;
  }

  async function chiudiFinestraSeVuota() {
    if (!finestra || schede.size > 0) return;
    const f = finestra;
    finestra = null;
    try { f.staccaMorte?.(); } catch { /* l'ascoltatore può essere già andato */ }
    try { f.staccaNavigazione?.(); } catch { /* idem */ }
    try { f.staccaDentroDocumento?.(); } catch { /* idem */ }
    try { f.cdp.chiudi(); } catch { /* il socket può essere già andato */ }
    try { await f.browser.chiudi(); } catch { /* idem per il processo */ }
  }

  function schedaDi(sessionId) {
    const scheda = schede.get(sessionId);
    if (!scheda) throw errorePagina('BROWSER_VIVO_SCHEDA_ASSENTE', 'Questa sessione non ha una pagina aperta');
    return scheda;
  }

  const gestore = {
    /** Apre (o riusa) la scheda di questa sessione e ci porta l'indirizzo. */
    async apri(sessionId, url, { larghezza = 1280, altezza = 800 } = {}) {
      if (!sessionId) throw errorePagina('BROWSER_VIVO_SENZA_SESSIONE', 'Serve la sessione a cui appartiene la scheda');
      await gestore.raccogliScadute();
      if (!schede.has(sessionId) && schede.size >= schedeMassime) {
        throw errorePagina('BROWSER_VIVO_TROPPE_SCHEDE', `Troppe pagine aperte insieme: il massimo è ${schedeMassime}`);
      }
      const { cdp } = await assicuraFinestra();
      let scheda = schede.get(sessionId);
      if (!scheda) {
        // vincolo 1: un contesto per sessione, così i cookie di una non finiscono nell'altra
        let contestoId = null;
        try {
          const contesto = await cdp.invia('Target.createBrowserContext', { disposeOnDetach: true });
          contestoId = contesto?.browserContextId ?? null;
        } catch { contestoId = null; } // un Chromium che non lo offre non deve impedire di navigare
        const aperta = await apriSchedaVuota(cdp, contestoId ? { browserContextId: contestoId } : {});
        scheda = {
          cdpSessionId: aperta.sessionId, targetId: aperta.targetId, contestoId,
          url: null, ferma: null, errori: null, staccaErrori: null, toccataA: orologio(),
        };
        schede.set(sessionId, scheda);
        await ridimensiona(cdp, scheda.cdpSessionId, { larghezza, altezza });
        /*
         * ⛔ L'overlay serve ad ANNOTARE, non a vedere: se non si installa (un frame che non c'è
         *   ancora, un mondo isolato rifiutato) la pagina deve aprirsi lo stesso, senza gli spilli.
         *   Trovato da un test, non da una lettura: la prima versione faceva fallire l'apertura
         *   INTERA perché il mondo isolato non era pronto — cioè rompeva la cosa principale per la
         *   cosa accessoria. Chi non ha l'overlay lo dichiara (`annotabile: false`), non lo finge.
         */
        try {
          await installaOverlay(cdp, scheda.cdpSessionId);
          scheda.annotabile = true;
        } catch (causa) {
          scheda.annotabile = false;
          scheda.motivoNonAnnotabile = causa instanceof Error ? causa.message : String(causa);
        }
        try {
          const errori = raccogliErrori(cdp, scheda.cdpSessionId);
          scheda.errori = errori;
          scheda.staccaErrori = errori.smetti;
        } catch { scheda.errori = null; scheda.staccaErrori = null; }
      }
      const esito = await vaiA(cdp, scheda.cdpSessionId, url);
      scheda.url = esito.url || url;
      tocca(scheda);
      return { ok: esito.ok, stato: esito.stato, errore: esito.errore ?? null, url: scheda.url, canale: finestra?.canale ?? null, isolata: Boolean(scheda.contestoId), annotabile: Boolean(scheda.annotabile) };
    },

    /** Comincia a trasmettere: `onFrame` riceve un fotogramma per volta. Torna la funzione per smettere. */
    async segui(sessionId, onFrame, opzioni = {}) {
      const scheda = schedaDi(sessionId);
      if (scheda.ferma) await scheda.ferma();
      /*
       * ⛔ 07/9 — il fotogramma porta anche l'INDIRIZZO corrente. Misurato sul 4174: cliccando
       *   «Issues» dentro github la pagina navigava davvero, il server lo sapeva (`frameNavigated` e
       *   `navigatedWithinDocument`) e la barra dell'indirizzo di TALOS mostrava ancora la pagina di
       *   prima — visto nello screenshot. Chi guarda deve poter fidarsi di quella barra: dire dove
       *   sei è metà del mestiere di un browser.
       */
      const trasmissione = await avviaTrasmissione(finestra.cdp, scheda.cdpSessionId, opzioni, (frame) => {
        tocca(scheda); // chi guarda sta usando la pagina: non è inattiva
        onFrame({ ...frame, url: scheda.url });
      });
      scheda.ferma = async () => {
        scheda.ferma = null;
        trasmissione.sgancia();
        await fermaTrasmissione(finestra.cdp, scheda.cdpSessionId).catch(() => {});
      };
      return scheda.ferma;
    },

    /** Un gesto della persona: clic, tasto o rotella, già in coordinate della PAGINA. */
    async gesto(sessionId, gesto = {}) {
      const scheda = schedaDi(sessionId);
      tocca(scheda);
      const cdp = finestra.cdp;
      const s = scheda.cdpSessionId;
      if (gesto.tipo === 'clic') return mandaClic(cdp, s, gesto);
      if (gesto.tipo === 'tasto') return mandaTasto(cdp, s, gesto);
      if (gesto.tipo === 'rotella') return mandaRotella(cdp, s, gesto);
      throw errorePagina('BROWSER_VIVO_GESTO_IGNOTO', `Gesto non riconosciuto: ${gesto?.tipo}`);
    },

    /*
     * ⛔ 08/09/2026, owner: «non si estende a tutto schermo». La misura della finestra pilotata era
     *   fissa a 1280x800 e non c'entrava niente col riquadro che la persona ha davanti: la pagina
     *   arrivava con la forma sbagliata e restavano bande vuote ai lati. Qui la vista dice quanto
     *   e' grande DAVVERO, all'apertura e a ogni ridimensionamento, e la pagina prende quella forma.
     *
     * ⛔ Non ricarica niente: `Emulation.setDeviceMetricsOverride` cambia il viewport della pagina
     *   gia' aperta. Ricaricare per un ridimensionamento perderebbe lo scorrimento, i moduli
     *   compilati a meta' e — su una pagina che l'agente sta leggendo — il lavoro fatto.
     */
    async misura(sessionId, { larghezza, altezza } = {}) {
      const scheda = schedaDi(sessionId);
      tocca(scheda);
      const esito = await ridimensiona(finestra.cdp, scheda.cdpSessionId, { larghezza, altezza });
      return { larghezza: esito?.larghezza ?? null, altezza: esito?.altezza ?? null, url: scheda.url };
    },

    /** Il pacchetto di un elemento sotto un punto: selettore, HTML, stili, antenati, errori. */
    async descrivi(sessionId, punto) {
      const scheda = schedaDi(sessionId);
      tocca(scheda);
      const pacchetto = await descriviElemento(finestra.cdp, scheda.cdpSessionId, punto);
      return { ...pacchetto, url: scheda.url, errori: scheda.errori?.errori ?? [] };
    },

    /** Chiude la scheda di questa sessione; l'ultima porta via anche il browser. */
    async chiudi(sessionId) {
      const scheda = schede.get(sessionId);
      if (!scheda) return { chiusa: false };
      if (scheda.ferma) await scheda.ferma().catch(() => {});
      if (scheda.staccaErrori) { try { scheda.staccaErrori(); } catch { /* già staccati */ } }
      schede.delete(sessionId);
      if (finestra) {
        await finestra.cdp.invia('Target.closeTarget', { targetId: scheda.targetId }).catch(() => {});
        // il contesto se ne va con la scheda: è lui a tenere i cookie, e nessun altro lo usa
        if (scheda.contestoId) await finestra.cdp.invia('Target.disposeBrowserContext', { browserContextId: scheda.contestoId }).catch(() => {});
      }
      await chiudiFinestraSeVuota();
      return { chiusa: true };
    },

    /** vincolo 3: chi non viene toccato da un pezzo se ne va, e col suo Chromium. */
    async raccogliScadute() {
      const adesso = orologio();
      const scadute = [...schede.entries()].filter(([, s]) => adesso - s.toccataA > inattivitaMs).map(([id]) => id);
      for (const sessionId of scadute) await gestore.chiudi(sessionId).catch(() => {});
      return scadute;
    },

    /** Cosa c'è di vivo adesso — per Doctor e per le prove. */
    stato() {
      const adesso = orologio();
      return {
        finestraAperta: Boolean(finestra),
        canale: finestra?.canale ?? null,
        schede: [...schede.entries()].map(([sessionId, s]) => ({
          sessionId, url: s.url, trasmette: Boolean(s.ferma), isolata: Boolean(s.contestoId), annotabile: Boolean(s.annotabile), fermaDaMs: adesso - s.toccataA,
        })),
        cartellaProfilo,
        inattivitaMs,
      };
    },

    /** Spegne tutto: si chiama quando il server chiude. */
    async spegni() {
      for (const sessionId of [...schede.keys()]) await gestore.chiudi(sessionId).catch(() => {});
      schede.clear();
      await chiudiFinestraSeVuota();
    },
  };

  return gestore;
}
