/**
 * ⛔⛔⛔ P0 · PUNTO 7 — IL FAILSAFE DELLA GENERAZIONE, IN UNA PORTA SOLA (16/09/2026).
 *
 * ## Il difetto che questo file chiude
 *
 * TALOS aveva TRE tetti sulla DURATA di una risposta del modello, tutti e tre deadline TOTALI —
 * cioè misurate dall'inizio della chiamata, indifferenti al fatto che il modello stesse parlando:
 *
 *   1. `talosHarness.mjs` · `AbortSignal.timeout(180_000)` su ogni giro, streaming compreso;
 *   2. `runtime-owner-adapter.mjs` · `AbortSignal.timeout(timeoutSeconds * 1000)`, default 60 s;
 *   3. `undici` sotto `fetch` · `headersTimeout` e `bodyTimeout` a 300 s DI SERIE, mai dichiarati.
 *
 * Misurato il 16/09/2026 con un fornitore finto non-OpenRouter che emette un token ogni 2 s per
 * 90 s, col default di 60 s: la risposta veniva **tagliata a 60 s mentre i token arrivavano**, e
 * l'errore diceva «Il fornitore ha superato il tempo massimo» — una bugia, il fornitore stava
 * rispondendo benissimo.
 *
 * ⛔ È la stessa forma del tetto sui GIRI, tolto l'11/09/2026 (`giri-senza-tetto.test.mjs`): *un
 *   tetto sulla durata non è una guardia contro il guasto — è una guardia contro il TEMPO, e il
 *   primo a incontrarla è il compito lungo ma SANO*.
 *
 * ## Perché un'INATTIVITÀ e non un numero più grande
 *
 * Alzare 60 a 600 sposta il muro, non lo toglie: il giorno del prompt da 200k token su CPU si
 * ripresenta identico. La domanda giusta non è «quanto può durare» ma «da quanto tempo è MORTO».
 *
 * Ricerca fatta PRIMA di scrivere, 16/09/2026:
 *  · **OpenAI Codex CLI** — `DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000`
 *    (`codex-rs/model-provider-info/src/lib.rs`): un'inattività dello stream, non un tetto totale.
 *  · **openai/codex#39771**, «High-reasoning Responses WebSocket idle timeout is a false
 *    dead-stream (model resumed after 8.5 min of no text frames)»: con ragionamento alto perfino
 *    CINQUE minuti di silenzio sono normali, e l'issue conclude che «lowering the stream idle
 *    timeout globally is not a safe fix because healthy reasoning can produce no response frames
 *    for that length of time».
 *  · **openai/codex#23807** e **#31376**: stalli di ESATTAMENTE 300 s fra un risultato di attrezzo
 *    e la richiesta successiva — la firma inconfondibile di un tetto di trasporto che nessuno ha
 *    dichiarato (i nostri 300 s di undici).
 *  · **ggml-org/llama.cpp#22997** e `tools/server/README.md`: durante il *prefill* di un prompt
 *    lungo llama-server non manda **nessun byte** per minuti; da lì `sse_ping_interval`, i commenti
 *    SSE emessi apposta per rendere osservabile un canale vivo che tace.
 *  · **OpenRouter · Streaming**: durante l'elaborazione il canale porta commenti SSE
 *    (`: OPENROUTER PROCESSING`) come keep-alive.
 *  · **Anthropic** (anthropics/anthropic-sdk-python#1698): sopra i ~10 minuti lo streaming diventa
 *    obbligatorio — cioè il primo fornitore al mondo mette la sua soglia di «operazione lunga ma
 *    sana» a dieci minuti, non a uno.
 *
 * ⇒ **30 minuti.** Il numero non è tondo per caso: è ~6× l'inattività di Codex e ~3× la soglia
 *   Anthropic, cioè ampiamente oltre il peggior silenzio SANO documentato (8,5 minuti misurati
 *   nell'issue #39771), e comunque un ordine di grandezza sotto «per sempre». Chi ha un caso
 *   peggiore lo dice con `TALOS_GENERATION_IDLE_MS`.
 *
 * ## Cosa NON è questo failsafe
 *
 * ⛔ Non è un timeout di generazione, e l'errore che produce non deve dirlo: quando scatta, il
 *   canale è **morto** — nessun byte, nessun commento, per mezz'ora. La classe è `rete`
 *   («la connessione con il fornitore del modello è caduta»), ed è TRANSITORIA: una ricerca caduta
 *   così si può riprendere. Chiamarlo «timeout» manderebbe a studiare il modello invece del cavo.
 *
 * ⛔ Non sostituisce lo STOP della persona, che resta la prima e più veloce via d'uscita: qui il
 *   `userSignal` è sempre onorato per primo, e la prova `P0-D-08`/`P0-D-09` misura che chiude in
 *   meno di un secondo anche su un fornitore che tace.
 */

/**
 * Trenta minuti. Vedi la motivazione in testa al file: è oltre il peggior silenzio SANO
 * documentato (8,5 min, openai/codex#39771), non un numero scelto perché suona grande.
 */
export const INATTIVITA_GENERAZIONE_MS_PREDEFINITA = 1_800_000;

/**
 * ⛔ Sotto il minuto non è un failsafe, è il tetto di prima con un altro nome: un prefill lungo su
 * CPU tace molto più a lungo. Chi scrive un valore più basso lo sta usando per il verso sbagliato.
 */
export const INATTIVITA_GENERAZIONE_MS_MINIMA = 60_000;

/** Il nome della variabile, in un posto solo: lo cita il README e lo leggono i test. */
export const VARIABILE_INATTIVITA_GENERAZIONE = 'TALOS_GENERATION_IDLE_MS';

/**
 * Il silenzio del fornitore: nessun byte E nessun commento SSE per tutto il limite.
 *
 * ⛔ `classe: 'rete'` e non `'timeout-fornitore'`: `classificaGuasto` in `runtime-owner-adapter.mjs`
 *   legge questo `code` ESPLICITAMENTE, invece di lasciare che la tabella dei segni indovini dal
 *   testo del messaggio — un filtro che riconosce la MENZIONE di una parola non riconosce la cosa.
 */
export class SilenzioDelFornitoreError extends Error {
  constructor(limiteMs) {
    const minuti = Math.max(1, Math.round(limiteMs / 60_000));
    super(`Connessione con il fornitore interrotta: nessun dato per ${minuti} minuti.`);
    this.name = 'SilenzioDelFornitoreError';
    this.code = 'PROVIDER_SILENCE';
    this.classe = 'rete';
    this.transitorio = true;
    this.limiteMs = limiteMs;
  }
}

/**
 * Il limite di inattività, letto dall'ambiente.
 *
 * ⛔ Un valore illeggibile NON spegne la guardia in silenzio: si torna al default e si va avanti.
 *   Lo ZERO invece la spegne davvero, ed è l'unico modo DICHIARATO per farlo — chi lo scrive sa
 *   cosa sta facendo, e la differenza fra «non ho capito il tuo valore» e «hai chiesto niente
 *   guardia» deve restare leggibile.
 * ⛔ Sotto il minimo si SALE al minimo invece di obbedire: vedi `INATTIVITA_GENERAZIONE_MS_MINIMA`.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {number} millisecondi; `0` significa nessun failsafe
 */
export function leggiInattivitaGenerazioneMs(env = process.env) {
  const grezzo = env?.[VARIABILE_INATTIVITA_GENERAZIONE];
  if (grezzo === undefined || grezzo === null || String(grezzo).trim() === '') return INATTIVITA_GENERAZIONE_MS_PREDEFINITA;
  const valore = Number(grezzo);
  if (!Number.isFinite(valore) || valore < 0) return INATTIVITA_GENERAZIONE_MS_PREDEFINITA;
  if (valore === 0) return 0;
  return Math.max(INATTIVITA_GENERAZIONE_MS_MINIMA, Math.round(valore));
}

/**
 * Il guardiano dell'inattività, in una funzione sola.
 *
 * Aspetta `promessa`; se non si conclude entro `limiteMs` aborta il `controller` e rifiuta con
 * l'errore che `creaErrore` costruisce. Lo `userSignal` vince sempre e subito.
 *
 * ⛔ Nessun timer nuovo «per far quadrare una corsa»: questo È il timer del failsafe, uno solo, e
 *   viene CANCELLATO da ogni via d'uscita (`pulisci`). Il listener sullo stop è `{once:true}` e si
 *   toglie comunque: un ascoltatore lasciato su un segnale che vive quanto la sessione è una
 *   perdita che cresce a ogni giro.
 * ⭐ `programmaTimer`/`annullaTimer` sono iniettabili perché una prova non deve aspettare mezz'ora
 *   per provare la mezz'ora.
 *
 * @template T
 * @param {Promise<T>|T} promessa
 * @param {{limiteMs:number, controller:AbortController, userSignal?:AbortSignal|null,
 *          creaErrore?:(ms:number)=>Error, programmaTimer?:Function, annullaTimer?:Function}} opzioni
 * @returns {Promise<T>}
 */
export function sorvegliaInattivita(promessa, {
  limiteMs,
  controller,
  userSignal = null,
  creaErrore = (ms) => new SilenzioDelFornitoreError(ms),
  programmaTimer = setTimeout,
  annullaTimer = clearTimeout,
} = {}) {
  return new Promise((risolvi, rifiuta) => {
    let conclusa = false;
    let timer = null;
    const pulisci = () => {
      if (timer !== null) annullaTimer(timer);
      userSignal?.removeEventListener?.('abort', fermaUtente);
    };
    const chiudi = (azione, valore) => {
      if (conclusa) return;
      conclusa = true;
      pulisci();
      azione(valore);
    };
    function fermaUtente() {
      const motivo = userSignal.reason ?? new DOMException('Fermato dall’utente', 'AbortError');
      controller.abort(motivo);
      chiudi(rifiuta, motivo);
    }
    /*
     * ⛔⛔⛔ 16/09/2026 — IL GUINZAGLIO SULLA PROMESSA SI ATTACCA PER PRIMO, E SEMPRE.
     *
     * Stava in fondo, dopo un `return` anticipato: se lo Stop era GIÀ arrivato quando questa
     * funzione viene chiamata, si usciva subito e `lettore.read()` restava **senza un solo
     * gestore**. Quando poi il corpo veniva demolito, quella promessa rifiutava nel vuoto: un
     * `unhandledRejection` che esplode dopo, addosso a chi non c'entra.
     * ⛔ Misurato: il difetto è comparso solo quando il guardiano è stato DAVVERO agganciato —
     *   `PH-FALLBACK-20` («stop DOPO che la richiesta è partita») ha cominciato a segnalare
     *   «asynchronous activity after the test ended ... AbortError: This operation was aborted»
     *   pur restando verde come singola prova, e a fallire era il FILE. Finché il guardiano era
     *   inerte non si vedeva niente, perché non c'era nessuna lettura da orfanare.
     * ⭐ `chiudi` è idempotente: chi arriva primo decide, e chi arriva dopo è un no-op. Quindi
     *   attaccare prima non cambia nessun esito — cambia solo che nessuna rejection resta sola.
     */
    Promise.resolve(promessa).then((v) => chiudi(risolvi, v), (e) => chiudi(rifiuta, e));
    if (userSignal?.aborted) { fermaUtente(); return; }
    userSignal?.addEventListener?.('abort', fermaUtente, { once: true });
    /* ⛔ `limiteMs` a zero (o non numerico) = nessun failsafe: si aspetta, e basta. */
    if (Number.isFinite(limiteMs) && limiteMs > 0) {
      timer = programmaTimer(() => {
        const errore = creaErrore(limiteMs);
        controller.abort(errore);
        chiudi(rifiuta, errore);
      }, limiteMs);
      timer?.unref?.();
    }
  });
}

/**
 * Lo stesso guardiano, messo addosso al CORPO di una risposta già arrivata.
 *
 * ⛔ Il conteggio si azzera a ogni **byte**, non a ogni `data:` — quindi i commenti SSE
 *   (`: OPENROUTER PROCESSING`, i ping di llama-server) contano come VITA. Un failsafe che
 *   guardasse solo i pacchetti con contenuto scarterebbe muto proprio ciò che il fornitore manda
 *   apposta per dire «sono vivo», e ucciderebbe la connessione più sana che c'è.
 *
 * ⭐ Perché qui e non solo nel dispatcher: `bodyTimeout` di undici copre il trasporto HTTP, ma non
 *   il motore locale servito da un ponte, né gli SDK nativi, né l'agente ACP. Questo confine li
 *   vede tutti, perché parla di `Response`, e produce un errore NOSTRO e classificato invece di un
 *   `UND_ERR_BODY_TIMEOUT` che arriverebbe in chat come «terminated».
 *
 * @param {Response} risposta
 * @param {{limiteMs:number, userSignal?:AbortSignal|null, programmaTimer?:Function, annullaTimer?:Function}} opzioni
 * @returns {Response} la stessa risposta, col corpo sorvegliato (o intatta se non c'è corpo)
 */
export function sorvegliaCorpoDiGenerazione(risposta, {
  limiteMs,
  userSignal = null,
  programmaTimer = setTimeout,
  annullaTimer = clearTimeout,
} = {}) {
  /*
   * ⛔⛔⛔ 16/09/2026 — QUESTA GUARDIA È NATA DA UN DIFETTO CHE È VISSUTO INVISIBILE PER UN GIRO.
   *
   * L'aggancio scriveva `sorveglia(conCacheDichiarata(await fetch(...)))` e `conCacheDichiarata` è
   * `async`: qui arrivava una **Promise**, non una `Response`. Una Promise non ha `.body`, quindi
   * la riga sotto la restituiva **intatta** — e il failsafe risultava attaccato a niente su
   * deepseek, z.ai, openai e su tutto il percorso cloud, in streaming e non. Nessun errore, nessun
   * avviso: il chiamante riceveva esattamente ciò che aveva passato, e sembrava che funzionasse.
   * A fermare i silenzi era il `bodyTimeout` del dispatcher, 1,2× più tardi e con un altro nome.
   *
   * ⇒ Un contratto violato si DICE. È la stessa lezione di [[il-catch-giusto-nasconde-il-bug-sbagliato]]:
   *   chi degrada in silenzio deve dichiarare quale guasto copre e rilanciare gli errori di
   *   contratto. Qui «non ho un corpo da sorvegliare» è un caso legittimo (una 204, una risposta
   *   già materializzata); «mi hai dato una Promise» non lo è mai.
   */
  if (typeof risposta?.then === 'function') {
    throw new TypeError('sorvegliaCorpoDiGenerazione vuole una Response già risolta, non una Promise: senza `await` il failsafe resterebbe attaccato a niente.');
  }
  if (!Number.isFinite(limiteMs) || limiteMs <= 0) return risposta;
  const corpo = risposta?.body;
  if (!corpo || typeof corpo.getReader !== 'function') return risposta;

  const lettore = corpo.getReader();
  const controller = new AbortController();
  const sorvegliato = new ReadableStream({
    async pull(uscita) {
      try {
        const { done, value } = await sorvegliaInattivita(lettore.read(), {
          limiteMs, controller, userSignal, programmaTimer, annullaTimer,
        });
        if (done) { uscita.close(); return; }
        uscita.enqueue(value);
      } catch (errore) {
        await lettore.cancel(errore).catch(() => {});
        uscita.error(userSignal?.aborted ? (userSignal.reason ?? errore) : errore);
      }
    },
    cancel(motivo) { return lettore.cancel(motivo); },
  });
  return new Response(sorvegliato, {
    status: risposta.status,
    statusText: risposta.statusText,
    headers: risposta.headers,
  });
}

/*
 * ⛔⛔ IL DISPATCHER — e perché NON è `setGlobalDispatcher`.
 *
 * Sotto `fetch` c'è undici, con `headersTimeout` e `bodyTimeout` a **300 s di serie**: se non li
 * si tocca, il tetto che si è appena tolto dal codice resta là sotto, tacito. È il caso di
 * openai/codex#23807 (stalli di esattamente 300 s) e del post di raphael.badia.cc
 * («Fixing Headers Timeout Error with Vercel AI SDK», letto 16/09/2026).
 *
 * La ricetta che circola è `setGlobalDispatcher(new Agent({...}))` dal pacchetto npm `undici`.
 * Qui NON si può e NON si deve:
 *
 *  · `undici` **non è una dipendenza dichiarata** di harness-ui (misurato: non compare in
 *    `package.json`; sul disco c'è solo come dipendenza transitiva di qualcun altro). Aggiungerla
 *    è una dipendenza nuova, e non serve.
 *  · È **globale**: cambierebbe i tetti di OGNI fetch dell'applicazione — ricerca web, hub dei
 *    modelli, proxy delle immagini, MCP. Quelle chiamate devono restare impazienti. Il punto 7
 *    parla della durata del RAGIONAMENTO, non della pazienza di tutto il prodotto.
 *  · Ed è **fragile in modo silenzioso**: misurato il 16/09/2026 su Node v24.18.0, il `fetch`
 *    globale legge `Symbol.for('undici.globalDispatcher.1')`; scrivere solo su `.2` non ha alcun
 *    effetto (prova: 5003 ms con un tetto da 1200 ms, cioè il tetto non ha morso). Una cura che
 *    arriva inerte e non protesta è peggio di nessuna cura.
 *
 * ⇒ Si costruisce un dispatcher **per richiesta**, dalla classe che Node stesso usa già — misurato
 *   funzionante: `fetch(url, { dispatcher })` con tetto 1200 ms su header a 5000 ms fallisce con
 *   `UND_ERR_HEADERS_TIMEOUT` in 1498 ms. Nessuna dipendenza nuova, nessun effetto fuori dalle
 *   chiamate ai fornitori.
 */

/** Costruito una volta sola per limite: un Agent tiene un pool di socket, non se ne fa uno a giro. */
const dispatcherPerLimite = new Map();

/**
 * Il dispatcher undici per le chiamate ai fornitori, con i tetti ALLINEATI al failsafe.
 *
 * ⛔ I tetti del trasporto stanno un po' SOPRA il failsafe (× `MARGINE`), mai sotto: così a
 *   scadere per primo è sempre la NOSTRA guardia, che produce un errore classificato e leggibile,
 *   e mai `UND_ERR_BODY_TIMEOUT`, che in chat arriverebbe come «terminated». Il trasporto è la
 *   rete di sicurezza della rete di sicurezza.
 * ⛔ `limiteMs` a 0 (failsafe spento) ⇒ tetti a 0, che per undici significa **disabilitato**
 *   (docs undici, `Client`/`Dispatcher`): chi spegne la guardia spegne anche i 300 s taciti,
 *   altrimenti spegnerebbe solo quella che si vede.
 *
 * @param {{limiteMs:number, dispatcherGlobale?:any}} opzioni
 * @returns {any|null} il dispatcher, o `null` se questo Node non permette di costruirlo (e allora
 *   restano i 300 s di serie: il chiamante non deve fingere che vada bene, deve dirlo)
 */
export function dispatcherDiGenerazione({ limiteMs, dispatcherGlobale = undefined } = {}) {
  const MARGINE = 1.2;
  const tetto = Number.isFinite(limiteMs) && limiteMs > 0 ? Math.round(limiteMs * MARGINE) : 0;
  if (dispatcherPerLimite.has(tetto)) return dispatcherPerLimite.get(tetto);
  /*
   * La classe arriva dal dispatcher che Node ha già costruito per sé: è lo stesso `Agent` del suo
   * undici interno, senza importarne una seconda copia. Se l'ambiente ha un proxy, quella classe è
   * un `EnvHttpProxyAgent` e accetta le stesse opzioni: si eredita la forma giusta invece di
   * imporne una.
   */
  const attuale = dispatcherGlobale ?? globalThis[Symbol.for('undici.globalDispatcher.1')];
  const Costruttore = attuale?.constructor;
  if (typeof Costruttore !== 'function') { dispatcherPerLimite.set(tetto, null); return null; }
  let costruito = null;
  try {
    costruito = new Costruttore({ headersTimeout: tetto, bodyTimeout: tetto });
    /* ⛔ Una prova che l'oggetto sia davvero un dispatcher: senza `dispatch` non lo è. */
    if (typeof costruito?.dispatch !== 'function') costruito = null;
  } catch {
    costruito = null;
  }
  dispatcherPerLimite.set(tetto, costruito);
  return costruito;
}
