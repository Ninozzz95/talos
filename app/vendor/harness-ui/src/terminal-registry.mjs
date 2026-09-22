/**
 * terminal-registry.mjs — W1-01 (05/09). Il registro che decide **CHI può
 * attaccarsi a quale PTY**. Ledger: `.claude/LEDGER-W1-01-SCHEDE-TERMINALE-2026-09-05.md`.
 *
 * ⛔⛔⛔ Perché è un modulo A PARTE da `pty-terminal.mjs`: quello è il ciclo
 * di vita di una PTY (spawn, backlog, reap); questo è **autorizzazione**.
 * Fino al 04/9 le due cose erano la stessa cosa perché l'id della PTY *era*
 * il `sessionId`, quindi non c'era niente da autorizzare. Nel momento in cui
 * una sessione può avere PIÙ schede, il `terminalId` diventa un identificativo
 * scelto dal client — ed è esattamente la forma di difetto che ha prodotto
 * **CVE-2026-59224** (Open WebUI, 2026 —
 * github.com/advisories/GHSA-j657-m4c4-24jq, letto il 05/09/2026): il proxy
 * WebSocket del terminale costruiva l'URL a monte concatenando il `session_id`
 * ricevuto dal client senza validarlo, e con un id vivo ci si **agganciava
 * alla PTY di un'altra persona**. L'identità inoltrata era una pretesa
 * «bearer», senza legame di integrità.
 *
 * ⇒ Il principio NON NEGOZIABILE di questo file: **il `terminalId` non decide
 * MAI la cartella**. La cartella si risolve UNA volta, alla creazione, dalla
 * sessione vera (`cartellaDiSessione`), e da lì resta congelata nella voce.
 * Il client può solo NOMINARE un terminale che il server gli ha già dato.
 * È la cura standard per IDOR/BOLA — OWASP API1:2023 Broken Object Level
 * Authorization, oggi #1: «l'API si fida di un identificativo fornito dal
 * client senza verificare che il chiamante possa accedere a QUELL'oggetto»
 * (ricerca 05/09/2026).
 *
 * ⛔ Il difetto misurato che questo file chiude, `server.mjs:589` prima di oggi:
 *
 *     risolviCartella: (id) => sessionRegistry.cartellaDi(id)
 *       ?? config.cartelleProgetto[0]?.percorso ?? process.cwd()
 *
 * Un id **sconosciuto** non veniva rifiutato: cadeva sul primo progetto
 * configurato. Con l'id legato al `sessionId` il danno era contenuto; con un
 * `terminalId` libero **qualunque stringa apriva una shell**. Qui quel `??`
 * non esiste: `risolviPerConnessione()` torna `null`, e chi lo chiama rifiuta.
 *
 * ⛔ Il tetto per sessione NON è burocrazia: su Windows ogni PTY porta con sé
 * un processo `conhost` (node-pty#471, ConPTY — letto il 05/09/2026), e
 * `conhost` è noto per sopravvivere alla morte del processo figlio. Schede
 * illimitate = processi di sistema illimitati.
 */
import { randomUUID } from 'node:crypto';

/**
 * Tetto di schede per sessione. Otto: abbastanza per il lavoro vero (build,
 * test, log, un paio di scratch), abbastanza poco da non lasciare in giro
 * decine di `conhost` su Windows. ⛔ Dichiarato, non indovinato a runtime.
 */
export const SCHEDE_MASSIME_PER_SESSIONE = 8;

/*
 * ⛔⛔ Quanto vive una scheda DIMENTICATA — 24 ore dall'ultimo aggancio.
 *
 * Il registro delle PTY ha gia' il suo reaper, ma chiude la SHELL, non la
 * scheda: e' voluto, perche' un F5 dieci minuti dopo deve riaprire nella
 * cartella giusta invece di prendere un 403. Il prezzo era che le schede non
 * si dimenticavano MAI: su un server acceso per settimane e' crescita lenta,
 * e non era misurata da nessuno.
 *
 * ⛔ Il tetto e' molto piu' lungo della grazia delle PTY, di proposito: dopo
 * la scadenza una riconnessione riceve 403, quindi il numero non e' un
 * dettaglio di implementazione ma una PROMESSA — «una scheda che non tocchi
 * per un giorno non c'e' piu'». Lo stato dell'arte dice esattamente questo:
 * la scadenza si applica lato SERVER, con una politica di durata dichiarata,
 * e la pulizia si programma invece di affidarla al caso (una GC probabilistica
 * puo' non passare mai). Ricerca del 05/09/2026:
 * cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html ·
 * modelcontextprotocol.io/seps/2567-sessionless-mcp
 *
 * ⛔ E una scheda tolta in SILENZIO sarebbe il difetto peggiore di quello che
 * cura: `reap()` torna chi ha tolto e perche', e `misura()` dice quante ne
 * esistono adesso — un problema di dimensionamento che nessuno puo' vedere
 * non e' un problema risolto.
 */
export const ORE_PRIMA_DI_DIMENTICARE_UNA_SCHEDA = 24;

/**
 * Registro delle schede terminale.
 *
 * @param {object} deps
 * @param {(sessionId:string)=>string|null} deps.cartellaDiSessione  L'UNICA autorità sulla cartella. `null` ⇒ la sessione non esiste ⇒ niente terminale.
 * @param {(terminalId:string)=>void} [deps.chiudiPtyFn]  Chiude la PTY vera quando una scheda viene chiusa esplicitamente.
 * @param {(terminalId:string)=>{viva:boolean}|null} [deps.statoPtyFn]  Per dire in elenco se la shell è ancora viva, senza esporre la voce interna del registro PTY.
 * @param {string|null} [deps.cartellaStandaloneLegacy]  ⛔ DEBITO DICHIARATO, vedi `risolviPerConnessione`. `null` (default) = registro STRETTO: un id ignoto si rifiuta e basta.
 */
export function creaRegistroSchedeTerminale({
  cartellaDiSessione,
  chiudiPtyFn = () => {},
  statoPtyFn = () => null,
  cartellaStandaloneLegacy = null,
  schedeMassimePerSessione = SCHEDE_MASSIME_PER_SESSIONE,
  orePrimaDiDimenticare = ORE_PRIMA_DI_DIMENTICARE_UNA_SCHEDA,
  generaId = randomUUID,
  clock = () => new Date(),
} = {}) {
  /** @type {Map<string, {terminalId:string, sessionId:string|null, cartella:string, creatoAlle:string, origine:string}>} */
  const schede = new Map();

  function schedeDi(sessionId) {
    return [...schede.values()].filter((voce) => voce.sessionId === sessionId);
  }

  function pubblica(voce) {
    return {
      terminalId: voce.terminalId,
      sessionId: voce.sessionId,
      cartella: voce.cartella,
      creatoAlle: voce.creatoAlle,
      origine: voce.origine,
      /* ⛔ Tre stati, non due: `attiva:false` significa "scheda registrata, shell non ancora aperta o già uscita" — mai confuso con "scheda inesistente" (quella non compare proprio). */
      attiva: statoPtyFn(voce.terminalId)?.viva === true,
    };
  }

  /**
   * Registra la PRIMA scheda di una sessione con `terminalId === sessionId`.
   *
   * ⭐ Compatibilità all'indietro OBBLIGATORIA: `public/harness-ui/app.js` è
   * congelato da un contratto (`frontend/tests/contract/legacy-contract-snapshot.test.mjs`
   * blocca byte-count e sha256) e si collega a `?id=<sessionId>`. Tenendo la
   * prima scheda uguale al `sessionId`, il monolite continua a funzionare
   * **senza una riga di modifica**.
   *
   * ⛔ Non è un fallback travestito: la cartella la dà comunque
   * `cartellaDiSessione()`, cioè il registro delle sessioni. Se la sessione
   * non esiste, qui non nasce niente.
   */
  function registraPrimaScheda(sessionId, cartella) {
    const voce = {
      terminalId: sessionId,
      sessionId,
      cartella,
      creatoAlle: clock().toISOString(),
      ultimoAggancioMs: clock().getTime(),
      origine: 'prima-scheda',
    };
    schede.set(sessionId, voce);
    return voce;
  }

  return {
    /**
     * Crea una scheda per una sessione VERA. È l'unica porta da cui nasce un
     * `terminalId` nuovo, e l'id lo sceglie il SERVER (`randomUUID`), mai il
     * client — un id imprevedibile è metà della cura raccomandata da OWASP
     * per le WebSocket (il browser non applica la same-origin policy alle WS
     * come la applica a `fetch`: serve il controllo Origin esplicito **più**
     * un valore che non si indovina — WebSocket Security Cheat Sheet, letto
     * il 05/09/2026).
     */
    crea({ sessionId } = {}) {
      if (typeof sessionId !== 'string' || sessionId === '') {
        return { erroreAvvio: 'Sessione non valida', code: 'QUERY_INVALID' };
      }
      const cartella = cartellaDiSessione(sessionId);
      if (typeof cartella !== 'string' || cartella === '') {
        /* ⛔ Qui viveva il `??` di server.mjs:589. Una sessione che non esiste non prende una cartella di ripiego: non prende NIENTE. */
        return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      }
      const gia = schedeDi(sessionId);
      if (gia.length >= schedeMassimePerSessione) {
        return { erroreAvvio: `Massimo ${schedeMassimePerSessione} terminali per sessione`, code: 'TERMINAL_LIMIT_REACHED' };
      }
      if (gia.length === 0) return pubblica(registraPrimaScheda(sessionId, cartella));
      let terminalId = generaId();
      /* ⛔ AL CONTRARIO — un `generaId` che collide (o un test che ne inietta uno fisso) non deve MAI sovrascrivere una scheda viva di qualcun altro. */
      while (schede.has(terminalId)) terminalId = `${terminalId}-${schede.size}`;
      const voce = {
        terminalId,
        sessionId,
        cartella,
        creatoAlle: clock().toISOString(),
        ultimoAggancioMs: clock().getTime(),
        origine: 'rotta',
      };
      schede.set(terminalId, voce);
      return pubblica(voce);
    },

    /** Elenco delle schede di UNA sessione — mai di tutte: una sessione non vede i terminali delle altre. */
    elenca(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return { erroreAvvio: 'Sessione non valida', code: 'QUERY_INVALID' };
      if (cartellaDiSessione(sessionId) === null) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      return { items: schedeDi(sessionId).map(pubblica) };
    },

    /**
     * Chiusura ESPLICITA di una scheda: chiude anche la PTY vera.
     *
     * ⛔⛔ La proprietà si verifica, non si presume: chiudere un terminale che
     * appartiene a un'ALTRA sessione risponde `NOT_FOUND` — lo stesso codice di
     * un terminale inesistente, di proposito. Distinguere «non esiste» da «non
     * è tuo» regalerebbe a chi prova id a caso una sonda per scoprire quali
     * esistono (OWASP API1:2023, ricerca 05/09/2026).
     */
    chiudi({ sessionId, terminalId } = {}) {
      if (typeof sessionId !== 'string' || sessionId === '' || typeof terminalId !== 'string' || terminalId === '') {
        return { erroreAvvio: 'Terminale non valido', code: 'QUERY_INVALID' };
      }
      const voce = schede.get(terminalId);
      if (!voce || voce.sessionId !== sessionId) {
        return { erroreAvvio: 'Terminale non trovato', code: 'NOT_FOUND' };
      }
      chiudiPtyFn(terminalId);
      schede.delete(terminalId);
      return { ok: true, terminalId, sessionId };
    },

    /**
     * L'UNICA domanda che `terminal-ws.mjs` ha il diritto di fare: «questo id
     * può attaccarsi, e a quale cartella?». Tre esiti, in quest'ordine:
     *
     *  1. **scheda già registrata** → la sua voce, con la cartella congelata
     *     alla creazione (⛔ mai ri-risolta a ogni connessione: è così che si
     *     evita che un cambio di stato altrove sposti una shell già aperta);
     *  2. **id che è un `sessionId` VIVO** → prima scheda di quella sessione,
     *     registrata al volo. È la porta di compatibilità del monolite
     *     congelato, e l'autorità resta il registro delle sessioni;
     *  3. **tutto il resto** → `null`, cioè **rifiuto**. Nessuna PTY nasce.
     *
     * ⛔ DEBITO DICHIARATO — `cartellaStandaloneLegacy`. Il monolite congelato
     * ha una TERZA strada, misurata il 05/09 leggendo `public/app.js` (non
     * presunta): `idTerminaleCorrente()` fa
     * `if (state.realSession.id) return state.realSession.id;` e **altrimenti
     * inventa un `crypto.randomUUID()` lato client** — un terminale
     * "standalone" senza nessuna sessione, raggiungibile aprendo il tab
     * Terminale prima di avviare qualsiasi cosa. Quel caso è esattamente ciò
     * che il `??` di server.mjs teneva in piedi. Qui il default è `null`, cioè
     * **rifiuto**; chi vuole tenere viva quella funzione del monolite deve
     * passare una cartella ESPLICITA a costruzione — una riga sola, visibile,
     * con un tetto suo — invece di una catena di `??` valutata a ogni
     * connessione. ⛔ Si spegne rimettendo `null` in `server.mjs` il giorno in
     * cui il frontend nuovo sostituisce il monolite.
     */
    risolviPerConnessione(id) {
      if (typeof id !== 'string' || id === '') return null;
      const registrata = schede.get(id);
      if (registrata) {
        // ⛔ «Ultimo aggancio», non «ultima creazione»: e' l'uso che tiene viva
        // una scheda, ed e' l'unico momento in cui qualcuno la nomina davvero.
        registrata.ultimoAggancioMs = clock().getTime();
        return registrata;
      }
      const cartellaSessione = cartellaDiSessione(id);
      if (typeof cartellaSessione === 'string' && cartellaSessione !== '') {
        return registraPrimaScheda(id, cartellaSessione);
      }
      if (typeof cartellaStandaloneLegacy === 'string' && cartellaStandaloneLegacy !== '') {
        const standalone = [...schede.values()].filter((voce) => voce.sessionId === null);
        /* ⛔ Tetto anche qui: senza, «qualunque stringa apre una shell» resterebbe vero per la porta legacy. */
        if (standalone.length >= schedeMassimePerSessione) return null;
        const voce = {
          terminalId: id,
          sessionId: null,
          cartella: cartellaStandaloneLegacy,
          creatoAlle: clock().toISOString(),
        ultimoAggancioMs: clock().getTime(),
          origine: 'standalone-legacy',
        };
        schede.set(id, voce);
        return voce;
      }
      return null;
    },

    /**
     * ⭐⭐⭐ Dimentica le schede che nessuno tocca da `orePrimaDiDimenticare`.
     *
     * ⛔ Una scheda si toglie SOLO se la sua shell e' gia' morta: finche' una
     * PTY e' viva la scheda serve, per lunga che sia l'attesa — buttarla
     * lascerebbe un processo vivo senza piu' nessuno che possa raggiungerlo,
     * che e' esattamente la perdita che questa funzione dovrebbe curare.
     *
     * ⛔ Torna CHI ha tolto e PERCHE': una scheda sparita in silenzio sarebbe
     * peggio del problema, perche' la prossima riconnessione riceve 403 e
     * nessuno saprebbe dire da dove viene.
     */
    dimenticaLeVecchie({ adesso = clock().getTime() } = {}) {
      const limite = orePrimaDiDimenticare * 60 * 60 * 1000;
      const tolte = [];
      for (const [terminalId, voce] of [...schede]) {
        const ferma = adesso - (voce.ultimoAggancioMs ?? 0);
        if (ferma < limite) continue;
        const pty = statoPtyFn(terminalId);
        if (pty && pty.viva) continue;
        schede.delete(terminalId);
        tolte.push({ terminalId, sessionId: voce.sessionId, origine: voce.origine, fermaDaMs: ferma });
      }
      return { tolte, restano: schede.size };
    },

    /**
     * Quante schede esistono adesso, e da quanto tace la piu' vecchia.
     * ⛔ Serve a vedere un problema di dimensionamento PRIMA che diventi una
     * perdita: un numero che nessuno puo' leggere non e' una garanzia.
     */
    misura({ adesso = clock().getTime() } = {}) {
      let piuVecchiaMs = null;
      let conShellViva = 0;
      for (const [terminalId, voce] of schede) {
        const ferma = adesso - (voce.ultimoAggancioMs ?? 0);
        if (piuVecchiaMs === null || ferma > piuVecchiaMs) piuVecchiaMs = ferma;
        const pty = statoPtyFn(terminalId);
        if (pty && pty.viva) conShellViva += 1;
      }
      return { schede: schede.size, conShellViva, piuVecchiaFermaDaMs: piuVecchiaMs, orePrimaDiDimenticare };
    },

    /** ⛔ Solo per i test e per lo shutdown — mai per decidere un permesso. */
    _schede: schede,
  };
}
