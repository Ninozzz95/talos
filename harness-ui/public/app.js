(() => {
  'use strict';

  /*
   * Owner 24/8: montato dentro uno shadow root da `HarnessSessionScreen.vue`
   * (non più un documento a sé tramite `window.location.assign` — la stessa
   * pagina resta la SPA, la cronologia resta condivisa, il tasto Indietro
   * torna a essere quello vero di sempre). `HarnessSessionScreen.vue` pianta
   * `window.__talosHarnessRoot` PRIMA di aggiungere questo script; ROOT()
   * torna a `document` se qualcuno lo apre com'era prima (nessuna regressione
   * per un test/anteprima diretto del file).
   */
  function ROOT() { return window.__talosHarnessRoot || document; }
  /*
   * `:root` nel CSS di questo file è diventato `:host` (vedi styles.css) —
   * `:root` dentro un foglio di stile di uno shadow root punta SEMPRE
   * all'`<html>` reale della pagina, non all'host: le variabili --sidebar
   * ecc. sarebbero finite sul documento sbagliato, o peggio, `:host` le
   * dichiara direttamente sull'host e una dichiarazione diretta batte
   * SEMPRE un valore ereditato — scrivere su document.documentElement non
   * avrebbe avuto alcun effetto visibile, sovrascritto in silenzio da
   * `:host`. HOST() punta all'elemento giusto per leggere/scrivere queste
   * proprietà personalizzate.
   */
  function HOST() { return window.__talosHarnessHost || document.documentElement; }
  const $ = (selector, root = ROOT()) => root.querySelector(selector);
  const $$ = (selector, root = ROOT()) => [...root.querySelectorAll(selector)];
  /*
   * Piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3 (`adb reverse`).
   * Su desktop questa pagina gira DENTRO ciò che `server.mjs` serve da
   * `http://localhost:4174/` — un percorso relativo (`/api/v1/...`) risolve
   * lì per costruzione, `window.__talosHarnessApiBase` non esiste,
   * `API()` torna il percorso invariato: ZERO cambio di comportamento
   * desktop. Su mobile `HarnessSessionScreen.vue` pianta quella variabile
   * PRIMA di eseguire questo script (stesso momento di ROOT()/HOST()) con
   * `http://localhost:4174` — l'origine reale del tunnel `adb reverse`,
   * diversa dall'origine Capacitor da cui questo script gira.
   */
  function API(pathname) { return `${window.__talosHarnessApiBase || ''}${pathname}`; }
  /*
   * Piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 4 — trovato
   * verificando dal vivo, non ipotizzato: `talos-embedded` da solo
   * significava "mai un fetch qui" ovunque nel file (HARNESS-BOARD-MOBILE-
   * HONESTY-01 e le sue sorelle, scritte PRIMA che un backend mobile
   * esistesse — onesto allora, ma ora blocca esattamente il tunnel che la
   * Fase 1-3 ha costruito). La domanda giusta non è più "sono embedded?"
   * ma "sono embedded E SENZA un backend da raggiungere?" — quando
   * `API()` ha una base reale (mobile col tunnel attivo), il comportamento
   * torna quello vero, identico al desktop.
   */
  function embeddedDemoOnly() { return HOST().classList.contains('talos-embedded') && !window.__talosHarnessApiBase; }

  const state = {
    view: 'chat',
    mode: 'chat',
    settingsSection: 'appearance',
    queueMode: false,
    permissions: 'Workspace write',
    /*
     * ⭐⭐⭐ FASE B (28/8) — override per-attrezzo, PIÙ SPECIFICO di
     * `permissions` sopra. `{}` = nessun override (comportamento di
     * oggi) — mai mandato vuoto al server (config.mjs lo rifiuterebbe:
     * "{} esplicito non ha senso"), solo letto per popolare il foglio.
     */
    permessiPerAttrezzo: {},
    /*
     * ⭐ 27/8 — stringa vuota = nessuna scelta esplicita, non un modello
 * demo inventato. `aggiornaPillolaModello()` mostra un invito neutro finché
 * l'owner non sceglie qualcosa dal foglio Modello; non espone mai il valore
 * interno "Predefinito del server".
     */
    model: '',
    /** Selezione esplicita delle sessioni reali nella sidebar. */
    sessionSelection: { active: false, selected: new Set(), available: new Map(), deleting: false },
    /** Ragionamento nascosto di default; il foglio Modello lo rende opt-in. */
    showReasoning: false,
    // ⭐ 28/8 — stesso principio di `model`: null = nessuna scelta esplicita, "reasoning" resta assente dal corpo della richiesta (comportamento di sempre). Un valore fra quelli di LIVELLI_RAGIONAMENTO appena l'owner tocca lo slider dell'effort picker.
    effort: null,
    environment: null,
    // ⛔ 27/8, trovato dalla pipeline QA visiva: la card "Session topology" leggeva questo valore come stato iniziale — restava "Refactor auth flow" finché nessuna funzione lo toccava, cioè sempre, all'apertura della pagina.
    session: 'Nessuna sessione',
    running: true,
    /*
     * ⭐⭐⭐ 27/8, secondo giro — owner: "nella modale nuova sessione non
     * deve esserci il campo text... quello si fa direttamente da
     * interfaccia chat". "Nuova" sceglie cartella+modello e basta; questo
     * campo porta quella scelta fino al primo messaggio scritto nel
     * composer normale, che avvia la sessione vera — {cartellaId,
     * nomeCartella, modello} oppure null quando non c'è nulla in attesa.
     */
    pendingCustomSession: null,
    /** ⭐ 27/8 — {percorso, nome} del file bersaglio quando si apre il foglio Apri/Rinomina/Elimina dall'albero, null altrimenti. I fogli sono statici (sheetTemplates), questo li parametrizza. */
    alberoFileTarget: null,
    // ⭐⭐⭐ 30/8 — piano "Board — da campagne TALOS-BANCO a cruscotto
    // sessioni": `sessioni` è il riepilogo REALE da GET /api/v1/sessions
    // (la stessa rotta che alimenta già la sidebar), mai le campagne di
    // uno strumento di misura esterno.
    board: {
      initialized: false,
      bootstrapPromise: null,
      sessioni: [],
      generation: 0,
    },
    modelLab: {
      initialized: false,
      loadingCapacity: false,
      loadingCatalog: false,
      loadingRuntime: false,
      loadingInstalled: false,
      capacity: null,
      catalog: null,
      runtimes: [],
      installed: [],
      catalogError: null,
      runtimeError: null,
      installedError: null,
      /** ⭐ Fase 5 punto 4 — esito di `GET /api/v1/local-models/:id/fit` per modello, id -> { stato, ... } o { errore }. Vuota finché la persona non chiede la verifica: `/fit` legge l'header GGUF e misura la macchina, non si fa da soli su ogni riga a ogni render. */
      fit: new Map(),
      runtimeSessionId: null,
      runtimeEventSource: null,
      runtimeBlocks: new Map(),
      providers: [],
      loadingProviders: false,
      providerError: null,
      selectedModel: null,
      selectedRuntime: '',
      selectedRuntimeModel: '',
      section: 'overview',
      search: '',
      provider: 'all',
      hfQuery: '', hfResults: [], hfSelected: null, hfDetail: null, hfError: null, hfCursor: null, hfSort: 'downloads', hfDirection: '-1', hfAuthor: '', hfFilters: [], downloads: [], downloadTimer: null,
      installedSearch: '', importProgress: null, importStatus: '', importXhr: null,
    },
    /*
     * ⭐⭐⭐ 26/8 — riconciliazione desktop→mobile, DEC-053 (owner, 24/8:
     * "harness deve essere fatto sia per mobile che desktop... quando
     * riprenderemo il desktop lo legheremo al desktop"). Stessa forma di
     * `state.realSession` già viva su `lane/harness-ui` (AVM-harness-ui,
     * pipeline AG-UI reale): qui arriva SOLO la parte di consumo eventi
     * (vedi handleRealEvent più sotto), non ancora agganciata a nessun
     * pulsante — vedi la nota davanti a startRealSession per il perché.
     */
    realSession: {
      id: null,
      taskId: null,
      /** Modello realmente usato dal giro corrente, letto dal RunStarted persistito. */
      currentRunModel: null,
      /** Una cronologia conclusa accumula i delta e li committa sui rispettivi eventi End. */
      deferHistoricalRendering: false,
      generation: 0,
      eventSource: null,
      messageElements: new Map(),
      runCount: 0,
      taskBubbleMostrata: false,
      /** Piano §1.3, riga Review — percorso -> {path, code, nuovo}, UNA voce per file scritto, non solo l'ultima. */
      reviewFiles: new Map(),
      /** Piano §1.3, riga "Contesto workspace" — la cartella corrente sfogliata nell'albero file reale, '' = radice. */
      /** ⭐⭐⭐ 27/8 — l'albero VERO: cache per livello (percorso -> voci già scaricate, mai ributtate finché non cambia qualcosa) + quali cartelle sono aperte (persiste fra un redraw e l'altro, così riaprire un run non richiude tutto). Sostituisce treePercorso, il vecchio modello "un livello alla volta con su/giù". */
      treeCache: new Map(),
      treeOpen: new Set(),
      treeWorkspaceKey: null,
      treeUiRestored: false,
      /** Progetto allowlistato mostrato in sola lettura prima del primo messaggio. */
      previewProjectId: null,
      previewWorkspaceName: null,
      /** Piano §1.3-BIS.T — toolCallId -> nome attrezzo, SOLO per riconoscere quando un ToolCallResult appartiene a "shell" e specchiarlo nella vista Terminale. Non tocca il rendering generico della chat, già esistente. */
      toolCallNomi: new Map(),
      /**
       * ⭐⭐⭐ 30/8, owner: "raggruppati in un collapse come fa Claude, con
       * diff totale accanto" (riferimento: Claude Code stesso, screenshot
       * allegati — vedi LEDGER-RAGGRUPPAMENTO-TOOL-CALL-DIFF-2026-08-30.md).
       * `null` = nessun batch di tool-call aperto ora; un oggetto quando
       * una sequenza ININTERROTTA di tool-call è in corso — chiuso (mai
       * più riaperto) alla prima cosa che non è una tool-call: testo
       * dell'assistente, un nuovo blocco di ragionamento, o fine turno.
       * Vedi apriBatchSeServe/chiudiBatchTool.
       */
      batchAttivo: null,
      /** ⭐ 30/8 — l'ultimo batch chiuso, per attribuire correttamente il diff di uno StateDelta che arriva DOPO la chiusura (il caso normale) — vedi chiudiBatchTool/updateRealReview. */
      ultimoBatchChiuso: null,
      /** ⛔ 27/8 — vero se l'ULTIMO evento visto su questa connessione era RunFinished/RunError: dice a onerror se la chiusura che sta per arrivare è attesa (niente da segnalare) o una vera interruzione. Vedi collegaEventiSessione. */
      eventoTerminaleVisto: false,
      /** Correlazione del redirect prioritario: evita il falso stato idle fra il RunFinished del giro abortito e il RunStarted della ripartenza. */
      redirectPendingId: null,
      /** Una risposta HTTP tardiva non può prevalere su Cancelled/Failed già arrivati via SSE. */
      redirectInvalidatedIds: new Set(),
      /** Distingue la POST ancora in volo dal redirect già accettato e annunciato via SSE. */
      redirectRequestInFlight: false,
      /** UUID creato prima della rete: Stop può annullare anche se arriva al server per primo. */
      redirectRequestIntentId: null,
      /** ⛔⛔⛔ 27/8, owner: "le risposte non sono formattate" — testo GREZZO
       * accumulato per messageId, così renderizzaMarkdownSemplice() lavora
       * sempre sul markdown intero visto finora, non su un singolo delta:
       * `.assistant-copy` mostra il RENDER, non è più la fonte del testo. */
      testoGrezzoMessaggi: new Map(),
      /** ⭐⭐⭐ 02/09 — messageId -> { prefisso, nodiCoda }: quanto testo è già reso in blocchi STABILI e quali nodi DOM sono la coda ancora aperta (vedi renderizzaMarkdownIncrementale). */
      renderIncrementale: new Map(),
      /** ⭐⭐⭐ 02/09 — cronologia REALE delle pagine lette da `naviga` in questa sessione: [{ url, testo, quando }] e l'indice mostrato (indietro/avanti). */
      browserPagine: [],
      browserIndice: -1,
      /** ⭐⭐⭐ 27/8, R1 — messageId(ragionamento) -> {summaryText, detail, grezzo}, la bolla collassabile che ospita il ragionamento in streaming (riusa la stessa forma di appendToolNote, non un componente nuovo). Il testo grezzo si accumula qui per lo stesso motivo di testoGrezzoMessaggi: renderizzaMarkdownSemplice lavora sul totale, non sul delta. */
      ragionamentoBubble: new Map(),
      /** ⛔⛔⛔ 27/8, owner: "ricevo risposte duplicate" — ogni evento.`_sequenza` (assegnato dal server, vedi session-registry.mjs broadcast()) entra qui la PRIMA volta che passa da handleRealEvent; una riconnessione (EventSource nativo dopo una caduta, o runDirectShell che ne apre una fresca) rimanda l'intero buffer da capo, e questo Set lo riconosce e lo scarta invece di duplicare bubble/testo. Sopravvive a un `continua:true` (stessa sessione, nuovo giro) — si azzera SOLO per una sessione davvero diversa. */
      sequenzeViste: new Set(),
      /** ⛔⛔⛔ 27/8, owner: "verifica che i messaggi... persistano dopo il refresh" — vero SOLO fra l'appendUserFollowUp ottimista di resumeSession() e il RunStarted (seguito:true) che arriva davvero: consumato una volta, evita che handleRealEvent mostri lo stesso follow-up due volte dal vivo. Vedi il case RunStarted per il perché non è sempre così. */
      followUpBubbleInAttesa: false,
      /** ⭐⭐⭐ 27/8, owner: "non esiste nessun loading quando il modello elabora... fa sembrare che si sia piantato" — l'elemento DOM della bolla di attesa (porta di TalosLineLoader.vue, mobile), o null quando non ce n'è una a schermo. Vedi mostraAttesaRisposta()/nascondiAttesaRisposta(). */
      attesaBubble: null,
      /** Timer e istante monotono della riga di attivita. Restano separati dal
       * DOM per fermarli anche quando il nodo e gia stato rimosso. */
      attesaTimer: null,
      attesaAvviataA: null,
      /** ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — l'ultimo
       * StateDelta path /usage visto (forma OpenRouter: prompt_tokens,
       * completion_tokens, prompt_tokens_details.cached_tokens, giri),
       * null finché nessun giro ha mai riportato consumo — mai un
       * contatore finto, la stessa onestà di IGNOTO-vs-GRATIS già in uso
       * lato kernel. Vedi il case 'StateDelta' e la riga "Main" nel
       * foglio Albero sessione. */
      usage: null,
      /** ⭐⭐⭐ 28/8 — permesso "On request": requestId -> l'elemento DOM
       * della card interattiva (appendApprovalCard). Il kernel è
       * DAVVERO in pausa dentro verificaPermessoScrittura mentre questa
       * mappa ha una voce — mai un timeout automatico, mai una risposta
       * inventata: solo un click vero (o un ApprovalResolved arrivato
       * da un altro client) la svuota. */
      approvazioniPendenti: new Map(),
      /** ⭐⭐⭐ 28/8 — la radice ASSOLUTA della sessione corrente (da RunStarted→contesto.cartella, la STESSA stringa già mostrata in "Root" nel Context Rail) — serve per calcolare il percorso assoluto di una sottocartella quando l'owner sceglie "Imposta come radice" nel menu dell'albero. `null` finché nessun RunStarted è mai arrivato. */
      cartellaAssoluta: null,
      /**
       * ⭐⭐⭐ FASE D (28/8) — coda messaggi: i testi CONFERMATI dal server
       * (risposta della POST .../queue), FIFO, in attesa di essere
       * consegnati. Un bubble in chat compare SOLO quando arriva DAVVERO
       * l'evento QueuedMessageDelivered (mai ottimisticamente al POST: un
       * messaggio può restare in coda per giri interi mentre il modello
       * chiama altri attrezzi, mostrarlo subito in chat mentirebbe su
       * cosa il modello ha già "visto") — vedi renderizzaBannerCoda() e
       * il case QueuedMessageDelivered.
       */
      codaMessaggi: [],
    },
  };

  const QA_VIEWPORTS = Object.freeze({
    'desktop': '1440x900',
    'laptop': '1024x800',
    'tablet': '768x1024',
    'mobile': '390x844',
    'mobile-narrow': '320x720',
    'capabilities': '390x844',
  });

  const appShell = $('#app');
  const views = $$('.view-pane');
  const chatConversation = $('.conversation');
  const mobileViewButtons = $$('[data-mobile-view]');
  const modeTabs = $$('.mode-tab');
  const backdrop = $('#overlayBackdrop');
  const sessionsPanel = $('#sessionsPanel');
  const sessionSelectionToolbar = $('#sessionSelectionToolbar');
  const sessionSelectionToggle = $('#sessionSelectionToggle');
  const sessionSelectionSelectAll = $('#sessionSelectionSelectAll');
  const sessionSelectionDelete = $('#sessionSelectionDelete');
  const sessionSelectionCount = $('#sessionSelectionCount');
  const inspectorPanel = $('#inspectorPanel');
  const commandDialog = $('#commandDialog');
  const commandSearch = $('#commandSearch');
  const sheetDialog = $('#sheetDialog');
  const harnessDialogBackdrop = $('#harnessDialogBackdrop');
  const sheetTitle = $('#sheetTitle');
  const sheetEyebrow = $('#sheetEyebrow');
  const sheetBody = $('#sheetBody');
  const composerInput = $('#composerInput');
  const composerForm = $('#composerForm');
  const redirectRunButton = $('#redirectRunButton');
  const sendButton = $('.send-btn', composerForm);
  const queuedMessage = $('#queuedMessage');
  const sessionTitle = $('#sessionTitle');
  const toastRegion = $('#toastRegion');
  const runStrip = $('.run-strip');
  const runStateToggle = $('#runStateToggle');
  const desktopInspectorToggle = $('.desktop-context-toggle');
  const sessionsCollapseBtn = $('#sessionsCollapseBtn');
  const commandEmpty = $('#commandEmpty');
  const diffPath = $('#diffPath');
  const diffCode = $('#diffCode');
  const sessionsBoardList = $('#sessionsBoardList');
  const refreshSessionsBoardButton = $('[data-action="refresh-sessions-board"]');
  const boardEyebrow = $('#boardEyebrow');
  const boardTitle = $('#boardTitle');
  const boardDescription = $('#boardDescription');
  const composerMic = $('.composer-mic');
  const embeddedSessionBack = $('[data-open-panel="sessions"]');
  const topbar = $('.topbar');
  const embeddedHeaderScrollers = [...new Set([...views, chatConversation].filter(Boolean))];
  const embeddedHeaderScrollPositions = new WeakMap();
  let compattazioneInCorso = false;
  let streamingScrollFrame = null;
  let streamingScrollTarget = null;
  /*
   * ⛔⛔⛔ 02/9 — owner dal vivo: "lo scrolling automatico fa schifo non
   * centra bene la risposta in streaming... lo streaming dell output è
   * macchinoso ed estremamente scattoso". Poi, precisato dopo un primo
   * giro di correzione: "lo scroll non deve fermarsi a fine pagina ma a
   * meta... quando scrollo alla fine output deve essere a meta non alla
   * fine" — cioè il punto attivo (dove il testo sta arrivando ORA) va
   * tenuto a META' del viewport, non incollato al fondo dello schermo.
   *
   * La versione originale ANDAVA nella direzione giusta (centrava) ma
   * era rotta nel bersaglio: centrava il bounding box dell'INTERA bolla
   * (che cresce), non il punto dove il testo sta davvero arrivando — una
   * volta che la bolla è più alta del viewport, il "centro della bolla"
   * scappa via dalla coda che si sta scrivendo, e il punto seguito non è
   * più quello giusto. E non controllava mai se l'utente avesse
   * scrollato via di sua iniziativa, quindi lo inseguiva comunque.
   *
   * Confrontato col codice REALE di Hermes Agent (owner l'ha chiesto
   * esplicitamente) — repo locale, `apps/desktop/src/components/
   * assistant-ui/thread/list.tsx`: usano `use-stick-to-bottom` come
   * "single writer" di scrollTop, con commento esplicito — *"Snap
   * instantly, not spring — a spring can't tell live-token growth from
   * a session-switch bulk relayout, and chasing the latter reads as the
   * view scrolling to random spots before settling"* — e seguono SOLO
   * se l'utente non si è spostato di sua iniziativa. Hermes insegue il
   * FONDO (la loro scelta di prodotto); qui si insegue il CENTRO (scelta
   * esplicita di QUESTO owner) — stesso principio "singolo writer,
   * istantaneo mai a molla, mai contro un utente che si è spostato",
   * bersaglio diverso.
   *
   * Bersaglio corretto: il fondo del CONTENUTO scritto finora
   * (getBoundingClientRect().bottom dell'elemento messaggio — si sposta
   * in giù ad ogni frame insieme al testo vero), portato a metà
   * dell'altezza del viewport. Mai `behavior:'smooth'`, sempre
   * istantaneo (stesso motivo di Hermes sopra). streamingLastTargetTop
   * ricorda l'ultimo valore che abbiamo scritto NOI: il listener di
   * scroll qui sotto lo confronta con lo scrollTop reale per capire se è
   * stato l'utente a spostarsi (stessa tecnica di resolveThreadScrollTarget
   * in Hermes, con uno scopo diverso: lì evita un re-trigger su un resto
   * di sub-pixel, qui distingue "siamo stati noi" da "si è mosso lui").
   */
  let streamingAutoFollow = true;
  let streamingLastTargetTop = null;
  const CONVERSATION_FOLLOW_EPSILON_PX = 24;

  /*
   * ⭐⭐⭐ 02/9 — owner dal vivo: "lo streaming ha lag sostanziali a meta
   * testo... trova un modo per strumentare tutte queste statistiche per
   * loggarle e debuggarle". Un registro leggero, SEMPRE attivo (costo
   * minimo: un push su un array capato — mai una console.log di
   * default, sarebbe rumore ad ogni token) — consultabile DOPO una
   * sessione lenta senza aver dovuto accendere nulla in anticipo:
   * `window.talosStreamingLog()` in devtools restituisce le ultime
   * STREAMING_LOG_CAP righe (quando, evento, durata del render, lunghezza
   * del delta, bersaglio di scroll). `window.__talosHarnessStreamingVerbose
   * = true` aggiunge anche uno specchio in console in tempo reale, per chi
   * vuole guardare mentre succede.
   */
  const STREAMING_LOG_CAP = 4000; // 02/09 — 400 righe coprivano ~6s di stream (un delta ogni ~50ms): i buchi calcolati su una finestra parziale mentivano. 4000 righe = uno stream intero, costo trascurabile (oggetti piccoli).
  const streamingLog = [];
  function logStreaming(evento, dettagli) {
    const riga = { quandoMs: Math.round(performance.now()), evento, ...dettagli };
    streamingLog.push(riga);
    if (streamingLog.length > STREAMING_LOG_CAP) streamingLog.shift();
    if (window.__talosHarnessStreamingVerbose) console.debug('[streaming]', evento, dettagli);
  }
  window.talosStreamingLog = () => streamingLog.slice();
  /*
   * ⛔⛔⛔ 02/9 — owner: "c'è un delay assurdo tra quando invio messaggio,
   * quando elabora e quando stampa — strumenta tutte queste cose in
   * maniera più precisa". Il log di streaming qui sopra misura BENE il
   * tratto finale (delta→render), ma non dice niente su ciò che viene
   * prima: chi si mangia i secondi fra il tocco su «Invia» e il primo
   * carattere a schermo? Senza segmentarlo si tira a indovinare fra rete,
   * provider, kernel e noi.
   *
   * ⭐ Ricerca web (regola zero, 02/9): il TTFT lato client si misura
   * "recording a monotonic timestamp immediately before sending the
   * request, then a second timestamp upon receiving the first valid SSE
   * data chunk containing a content delta" — e va scomposto, perché
   * include code del provider, prefill e rete
   * (clickhouse.com/resources/engineering/llm-inference-latency,
   * bentoml.com/llm/llm-inference-basics/llm-inference-metrics). Qui si
   * segna OGNI tappa della catena reale, così il ritardo si ATTRIBUISCE
   * invece di essere un unico numero opaco:
   *
   *   invio          il gesto della persona (submit del composer)
   *   postInviata    un istante prima della fetch verso il nostro server
   *   postRisposta   la POST ha risposto (il kernel ha accettato il giro)
   *   sseCollegato   EventSource costruito
   *   primoEvento    primo messaggio SSE di QUALUNQUE tipo (il canale vive)
   *   runStarted     il kernel dichiara il giro partito
   *   primoDelta     primo frammento di testo dal modello  ⇐ TTFT vero
   *   primoPixel     primo carattere STAMPATO sullo schermo ⇐ ciò che si vede
   *
   * `window.talosLatenzaRisposta()` in devtools restituisce i tratti già
   * sottratti, in ordine: il tratto più lungo È la causa, senza dibattito.
   */
  const TAPPE_LATENZA = ['invio', 'postInviata', 'postRisposta', 'sseCollegato', 'primoEvento', 'runStarted', 'primoDelta', 'primoPixel'];
  let misuraLatenzaCorrente = null;
  const misureLatenzaPassate = [];
  function iniziaMisuraLatenza(etichetta) {
    misuraLatenzaCorrente = { etichetta, avviataIl: new Date().toISOString(), tappe: new Map(), eventiRigiocati: 0, caratteriRigiocati: 0 };
    segnaTappaLatenza('invio');
  }
  /**
   * ⛔⛔⛔ 02/9 — la PRIMA versione di questa misura mentiva su un
   * follow-up, e se ne è accorta da sola: dava `primoDelta → primoPixel =
   * 7877 ms` (contro 4 ms sul primo messaggio della stessa sessione), un
   * numero che sembrava accusare il nostro renderer. Non era vero: su un
   * resume l'EventSource RIGIOCA tutta la cronologia prima di arrivare al
   * turno nuovo, e `runStarted`/`primoDelta` venivano consumati dal PRIMO
   * evento RIGIOCATO — cioè da un messaggio VECCHIO, già a schermo. I
   * tratti erano quindi misurati fra cose diverse.
   * ⇒ Le tappe del turno vero si registrano solo quando NON siamo dentro
   * un replay (`deferHistoricalRendering`), e il replay ha una tappa sua
   * (`replayFinito`) con quanti eventi/caratteri è costato: così si vede
   * separatamente quanto pesa rileggere il passato e quanto aspetta il
   * modello. Una misura che non sa distinguerli non è una misura.
   */
  const TAPPE_SOLO_TURNO_VERO = new Set(['runStarted', 'primoDelta', 'primoPixel']);
  function segnaTappaLatenza(nome) {
    // ⛔ Solo la PRIMA volta per giro: un secondo delta non è "il primo delta".
    if (!misuraLatenzaCorrente || misuraLatenzaCorrente.tappe.has(nome)) return;
    if (TAPPE_SOLO_TURNO_VERO.has(nome) && state.realSession.deferHistoricalRendering) return;
    misuraLatenzaCorrente.tappe.set(nome, performance.now());
    if (nome === 'primoPixel') {
      misureLatenzaPassate.push(misuraLatenzaCorrente);
      if (misureLatenzaPassate.length > 40) misureLatenzaPassate.shift();
      misuraLatenzaCorrente = null;
    }
  }
  /** Quanto costa rileggere il passato: un evento rigiocato per chiamata. */
  function contaEventoRigiocato(caratteri) {
    if (!misuraLatenzaCorrente) return;
    misuraLatenzaCorrente.eventiRigiocati += 1;
    misuraLatenzaCorrente.caratteriRigiocati += caratteri || 0;
  }
  function riassumiMisuraLatenza(misura) {
    if (!misura) return null;
    const presenti = TAPPE_LATENZA.filter((nome) => misura.tappe.has(nome));
    const tratti = [];
    for (let i = 1; i < presenti.length; i += 1) {
      tratti.push({
        tratto: `${presenti[i - 1]} → ${presenti[i]}`,
        ms: Math.round(misura.tappe.get(presenti[i]) - misura.tappe.get(presenti[i - 1])),
      });
    }
    const primo = misura.tappe.get(presenti[0]);
    const ultimo = misura.tappe.get(presenti[presenti.length - 1]);
    const piuLungo = tratti.reduce((max, t) => (t.ms > (max?.ms ?? -1) ? t : max), null);
    return {
      etichetta: misura.etichetta,
      avviataIl: misura.avviataIl,
      totaleMs: Math.round(ultimo - primo),
      // ⛔ `completa:false` = il giro non è arrivato a stampare: il totale
      // è un parziale, non un tempo di risposta. Mai confonderli.
      completa: misura.tappe.has('primoPixel'),
      tratti,
      trattoPiuLungo: piuLungo,
      replay: { eventi: misura.eventiRigiocati, caratteri: misura.caratteriRigiocati },
    };
  }
  window.talosLatenzaRisposta = () => ({
    inCorso: riassumiMisuraLatenza(misuraLatenzaCorrente),
    ultime: misureLatenzaPassate.map(riassumiMisuraLatenza).reverse(),
  });
  /** Riassunto pronto per un'occhiata rapida: quante righe 'render' hanno superato la soglia, la piu' lenta, la media. */
  window.talosStreamingLogRiassunto = (sogliaMs = 16) => {
    const render = streamingLog.filter((r) => r.evento === 'render');
    const lente = render.filter((r) => r.durataMs > sogliaMs);
    const media = render.length ? render.reduce((s, r) => s + r.durataMs, 0) / render.length : 0;
    const piuLenta = render.reduce((max, r) => (r.durataMs > (max?.durataMs ?? -1) ? r : max), null);
    return { righeRender: render.length, righeLente: lente.length, sogliaMs, durataMediaMs: Math.round(media * 10) / 10, piuLenta };
  };
  let streamingRenderFrame = null;
  const streamingRenderPending = new Set();
  let treeRenderTimer = null;
  let treeRenderInFlight = null;
  let treeRenderNeedsRerun = false;
  let sessionListRefreshTimer = null;

  if (HOST().classList.contains('talos-embedded')) {
    embeddedSessionBack?.setAttribute('aria-label', 'Torna alle sessioni Codice');
  }

  const motionAnimations = new Set();

  /**
   * Porta il fondo del CONTENUTO scritto finora (non il centro
   * dell'intera bolla — vedi il commento sopra la dichiarazione di
   * streamingAutoFollow) a metà del viewport, durante uno stream — SOLO
   * se l'utente non se n'è già andato per conto suo. Una sola richiesta
   * per frame evita animazioni concorrenti.
   */
  let spazioCodaConversazioneUltimo = -1;
  /**
   * ⛔⛔⛔ 02/09 — misurato dal vivo (qa-visual-pipeline.mjs, scenario
   * `qa-scroll-sessione-e-streaming`): il fondo del testo in streaming
   * stava 403px SOTTO il centro di un viewport da 1214px, costante per 75
   * campioni di fila — lo scroll era già al massimo. Il bersaglio "a metà"
   * di scrollStreamingOutput è irraggiungibile se sotto l'ultimo messaggio
   * c'è solo il padding di 190px: serve mezzo viewport di spazio in coda.
   * La variabile `--stream-follow-space` esiste nel CSS (padding-bottom di
   * .conversation, checkpoint cca79b08) — e il commit bf15bb3e ha TOLTO la
   * riga che la impostava: da allora valeva 0, e il centro era vero solo
   * nella matematica, mai sullo schermo. Lo spazio resta per tutta la
   * sessione (owner: "quando scrollo alla fine l'output deve essere a
   * metà, non alla fine") e torna 0 su una conversazione vuota, così
   * l'hero resta centrato.
   */
  function aggiornaSpazioCodaConversazione(conversation) {
    if (!conversation) return;
    const haMessaggi = !!conversation.querySelector('.message');
    const spazio = haMessaggi ? Math.ceil(conversation.clientHeight / 2) : 0;
    if (spazio === spazioCodaConversazioneUltimo) return;
    spazioCodaConversazioneUltimo = spazio;
    conversation.style.setProperty('--stream-follow-space', `${spazio}px`);
  }

  function scrollStreamingOutput(element) {
    if (!element || !element.isConnected) return;
    streamingScrollTarget = element;
    if (!streamingAutoFollow) return;
    if (streamingScrollFrame !== null) return;
    const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
    streamingScrollFrame = schedule(() => {
      streamingScrollFrame = null;
      const target = streamingScrollTarget;
      streamingScrollTarget = null;
      const conversation = $('#conversation');
      if (!target || !target.isConnected || !conversation || !streamingAutoFollow) {
        logStreaming('scroll-skip', { hasTarget: !!target, connesso: target?.isConnected, hasConversation: !!conversation, streamingAutoFollow });
        return;
      }
      aggiornaSpazioCodaConversazione(conversation); // prima di leggere scrollHeight: il clamp a maxScroll deve vedere lo spazio in coda
      const containerRect = conversation.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const fondoContenuto = conversation.scrollTop + (targetRect.bottom - containerRect.top);
      const maxScroll = Math.max(0, conversation.scrollHeight - conversation.clientHeight);
      const nuovoTop = Math.max(0, Math.min(maxScroll, fondoContenuto - conversation.clientHeight / 2));
      streamingLastTargetTop = nuovoTop;
      // Istantaneo, mai 'smooth': vedi il commento di Hermes citato sopra.
      conversation.scrollTop = nuovoTop;
      logStreaming('scroll', { nuovoTop: Math.round(nuovoTop), scrollHeight: conversation.scrollHeight, clientHeight: conversation.clientHeight });
    });
  }

  /**
   * Aggiorna streamingAutoFollow ad ogni scroll reale di #conversation.
   * Confronta lo scrollTop reale con l'ultimo bersaglio che abbiamo
   * scritto NOI (streamingLastTargetTop): se combaciano (entro
   * un'epsilon) lo scroll è stato nostro o l'utente non si è mosso — si
   * continua a seguire; se non combaciano, è stato l'utente a spostarsi
   * di sua iniziativa — si smette di inseguirlo (si riarma su
   * RunStarted). Prima che uno stream sia mai partito
   * (streamingLastTargetTop ancora nullo) non c'è nulla da confrontare:
   * non tocca streamingAutoFollow. Passive: mai bloccare lo scroll nativo.
   */
  function collegaSeguiFondoConversazione() {
    const conversation = $('#conversation');
    if (!conversation) return;
    conversation.addEventListener('scroll', () => {
      if (streamingLastTargetTop === null) return;
      streamingAutoFollow = Math.abs(conversation.scrollTop - streamingLastTargetTop) <= CONVERSATION_FOLLOW_EPSILON_PX;
    }, { passive: true });
    // Lo spazio in coda è metà dell'altezza VISIBILE: se la finestra cambia, cambia anche lui.
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => aggiornaSpazioCodaConversazione(conversation)).observe(conversation);
  }
  collegaSeguiFondoConversazione();

  /**
   * Un replay SSE può consegnare centinaia di delta nello stesso frame. Il
   * testo grezzo resta accumulato evento per evento, ma il markdown entra nel
   * DOM una volta per frame; TextMessageEnd forza comunque l'ultimo commit.
   */
  /*
   * ⛔⛔⛔ 02/09 — owner, dal vivo: "l'animazione deve essere fluida come se
   * si scrivesse su una macchina da scrivere: con impostazione Cursore una
   * lettera alla volta, streammata velocemente; per Dissolvenza una
   * dissolvenza super smooth delle parole".
   *
   * Misurato PRIMA (qa-scroll-sessione-e-streaming, scheda in primo piano):
   * il render costa ≤0,2 ms e segue ogni 'delta' entro un frame — il
   * testo però ARRIVA a raffiche (buchi fra delta di 100-500 ms, a volte
   * secondi), quindi sullo schermo compaiono blocchi di parole a scatti:
   * la "scattosità" era il ritmo del provider, reso pari pari.
   *
   * Cura: un RITMO DI RIVELAZIONE nostro. Il testo ricevuto resta in
   * testoGrezzoMessaggi per intero; sullo schermo se ne mostra un prefisso
   * (`statoRender.mostrato`) che avanza a ogni frame a velocità costante e
   * alta — lettere una alla volta con "Cursore", parole intere con
   * "Dissolvenza" — e accelera in proporzione all'arretrato, così il
   * ritardo rispetto al testo vero non supera mai ~0,3 s (un provider a
   * raffiche viene livellato, uno veloce non viene frenato). Con
   * "Nessuna", con movimento ridotto, o nel ripristino di una cronologia,
   * nessun ritmo: tutto subito, come prima. Stesso principio dello
   * "smooth streaming" di ChatGPT/Claude web (buffer + cadenza costante),
   * scritto in vanilla JS sopra il renderer incrementale già esistente:
   * un prefisso più corto è un input come un altro per lui.
   */
  const RITMO_STREAMING = {
    typewriter: { caratteriAlSecondo: 160, ritardoMassimoMs: 300, perParola: false },
    fade: { caratteriAlSecondo: 140, ritardoMassimoMs: 350, perParola: true, dissolvenzaMs: 420 },
  };

  function modalitaAnimazioneStreaming() {
    if (state.realSession.deferHistoricalRendering) return 'none';
    if (HOST().classList.contains('reduce-motion') || document.body.classList.contains('reduce-motion')) return 'none';
    const scelta = HOST().dataset.talosStreamingAnimation;
    return scelta === 'typewriter' || scelta === 'fade' ? scelta : 'none';
  }

  function contaParole(testo) {
    const m = String(testo).match(/\S+/g);
    return m ? m.length : 0;
  }

  /**
   * Avanza `statoRender.mostrato` verso `testo.length` secondo il ritmo
   * scelto. Torna il numero di caratteri rivelati in questo frame.
   */
  function avanzaRitmoStreaming(statoRender, testo, modalita, ora) {
    const ritmo = RITMO_STREAMING[modalita];
    const arretrato = testo.length - statoRender.mostrato;
    if (arretrato <= 0) { statoRender.ultimoTickMs = ora; return 0; }
    const dtMs = Math.min(100, Math.max(0, ora - (statoRender.ultimoTickMs ?? ora)));
    statoRender.ultimoTickMs = ora;
    const velocita = Math.max(ritmo.caratteriAlSecondo, arretrato / (ritmo.ritardoMassimoMs / 1000));
    let passo = Math.min(arretrato, Math.max(1, Math.ceil(velocita * dtMs / 1000)));
    if (dtMs === 0 && statoRender.ultimoTickMs !== null) passo = Math.min(passo, 1);
    let prossimo = statoRender.mostrato + passo;
    if (ritmo.perParola) {
      // parole intere: si estende fino al prossimo spazio (o alla fine), così nessuna parola compare a metà
      const fineParola = testo.slice(prossimo).search(/\s/);
      prossimo = fineParola === -1 ? testo.length : prossimo + fineParola;
      const nuoveParole = contaParole(testo.slice(statoRender.mostrato, prossimo));
      for (let k = 0; k < nuoveParole; k += 1) statoRender.paroleRecenti.push(ora);
      const soglia = ora - ritmo.dissolvenzaMs;
      while (statoRender.paroleRecenti.length > 0 && statoRender.paroleRecenti[0] < soglia) statoRender.paroleRecenti.shift();
      if (statoRender.paroleRecenti.length > 400) statoRender.paroleRecenti.splice(0, statoRender.paroleRecenti.length - 400);
    }
    const rivelati = prossimo - statoRender.mostrato;
    statoRender.mostrato = prossimo;
    return rivelati;
  }

  /**
   * Dissolvenza per PAROLA: le ultime K parole del testo mostrato (K =
   * parole rivelate negli ultimi `dissolvenzaMs`) diventano <span
   * class="stream-word"> con un animation-delay NEGATIVO pari al tempo già
   * trascorso dalla loro comparsa. La coda del markdown viene ricostruita a
   * ogni frame (renderizzaMarkdownIncrementale) — uno span ricreato
   * riparte da dove era, non da zero: è questo che rende la dissolvenza
   * continua invece di un lampeggio (la lezione del vecchio
   * `:last-child`, vedi il CSS). Il codice (pre/code) non si dissolve
   * parola per parola. Parole già avvolte nei blocchi stabili restano come
   * sono: la loro animazione sta già finendo da sola.
   */
  function avvolgiParoleRecenti(copia, tempi, ora) {
    let restanti = tempi.length;
    if (restanti === 0) return;
    let indice = tempi.length - 1;
    const walker = document.createTreeWalker(copia, NodeFilter.SHOW_TEXT);
    const nodi = [];
    let n;
    while ((n = walker.nextNode())) nodi.push(n);
    for (let i = nodi.length - 1; i >= 0 && restanti > 0; i -= 1) {
      const nodo = nodi[i];
      const genitore = nodo.parentElement;
      if (!genitore) continue;
      if (genitore.classList.contains('stream-word')) { restanti -= 1; indice -= 1; continue; }
      /*
       * ⛔ 02/9 — trovato ISPEZIONANDO l'HTML prodotto, non cercandolo: la
       * dissolvenza aveva avvolto anche l'etichetta del linguaggio e il
       * testo del pulsante Copia dell'intestazione del blocco di codice
       * (`<span class="code-block-lang"><span class="stream-word">Python`).
       * Quelli non sono output del modello: sono cornice dell'interfaccia,
       * scritti da noi, e non devono comparire in dissolvenza come se il
       * modello li stesse scrivendo. `pre, code` era già escluso per lo
       * stesso motivo — mancava la testa del blocco, che prima non esisteva.
       */
      if (genitore.closest('pre, code, .code-block-head')) continue;
      const pezzi = nodo.textContent.split(/(\s+)/).filter((p) => p.length > 0);
      if (pezzi.length === 0) continue;
      const nuovi = [];
      let testoPiano = '';
      for (let k = pezzi.length - 1; k >= 0; k -= 1) {
        const pezzo = pezzi[k];
        if (/^\s+$/.test(pezzo) || restanti <= 0) { testoPiano = pezzo + testoPiano; continue; }
        if (testoPiano) { nuovi.unshift(document.createTextNode(testoPiano)); testoPiano = ''; }
        const span = document.createElement('span');
        span.className = 'stream-word';
        span.textContent = pezzo;
        span.style.animationDelay = `-${Math.max(0, Math.round(ora - tempi[Math.max(0, indice)]))}ms`;
        restanti -= 1;
        indice -= 1;
        nuovi.unshift(span);
      }
      if (testoPiano) nuovi.unshift(document.createTextNode(testoPiano));
      if (nuovi.length === 1 && nuovi[0].nodeType === Node.TEXT_NODE) continue; // nessuna parola avvolta in questo nodo
      const frag = document.createDocumentFragment();
      for (const nuovo of nuovi) frag.appendChild(nuovo);
      nodo.replaceWith(frag);
    }
  }

  function renderizzaMessaggioStreamingOra(messageId) {
    streamingRenderPending.delete(messageId);
    const element = state.realSession.messageElements.get(messageId);
    const testoGrezzo = state.realSession.testoGrezzoMessaggi.get(messageId);
    if (!element || typeof testoGrezzo !== 'string') return false;
    const copia = $('.assistant-copy', element);
    if (!copia) return false;
    let statoRender = state.realSession.renderIncrementale.get(messageId);
    if (!statoRender) { statoRender = { prefisso: null, nodiCoda: [], mostrato: 0, ultimoTickMs: null, paroleRecenti: [], fineRicevuta: false }; state.realSession.renderIncrementale.set(messageId, statoRender); }
    const t0 = performance.now();
    const modalita = modalitaAnimazioneStreaming();
    let rivelati = 0;
    if (modalita === 'none') {
      rivelati = testoGrezzo.length - statoRender.mostrato;
      statoRender.mostrato = testoGrezzo.length;
      statoRender.paroleRecenti = [];
    } else {
      rivelati = avanzaRitmoStreaming(statoRender, testoGrezzo, modalita, t0);
    }
    const arretrato = testoGrezzo.length - statoRender.mostrato;
    renderizzaMarkdownIncrementale(copia, statoRender, testoGrezzo.slice(0, statoRender.mostrato));
    if (modalita === 'fade') avvolgiParoleRecenti(copia, statoRender.paroleRecenti, t0);
    /*
     * ⛔⛔⛔ 02/9 — owner: "il logo di caricamento deve esistere fino a
     * quando la risposta viene STREAMMATA E STAMPATA". Questo è l'unico
     * punto del codice che sa di aver messo caratteri VERI sullo schermo:
     * `renderizzaMarkdownIncrementale` è appena tornata e `mostrato` è il
     * numero di caratteri effettivamente resi. La bolla di attesa si
     * chiude QUI e in nessun altro punto del percorso del testo — non
     * all'arrivo del primo delta (vedi il commento gemello nel case
     * `TextMessageContent`), che precede il primo pixel di un frame o
     * più, e con un ritmo di rivelazione attivo anche di parecchio.
     * ⛔ `mostrato > 0` e non `>= 0`: un frame che non ha ancora rivelato
     * nulla (ritmo appena partito) non è "stampato", e chiudere lì
     * riaprirebbe esattamente il buco che stiamo togliendo.
     */
    if (statoRender.mostrato > 0) {
      if (state.realSession.attesaBubble) segnaTappaLatenza('primoPixel');
      nascondiAttesaRisposta();
    }
    logStreaming('render', { messageId, testoLen: testoGrezzo.length, mostrato: statoRender.mostrato, rivelati, arretrato, modalita, durataMs: Math.round((performance.now() - t0) * 10) / 10 });
    /*
     * ⛔⛔⛔ 02/9 — owner dal vivo: "quando invio un messaggio la chat si
     * sposta in alto e non rimane a fine chat". Isolato leggendo il
     * codice (riproduzione dal vivo instabile per i tempi variabili del
     * provider, non per il difetto): un follow-up su una sessione
     * CONCLUSA (resumeSession) riapre un EventSource che RIPETE anche
     * gli eventi VECCHI già a schermo (RunStarted/TextMessageContent/
     * TextMessageEnd della cronologia precedente) — e questa funzione,
     * chiamata da TextMessageEnd per OGNI messaggio incluso quelli
     * vecchi, scrollava comunque: il replay del messaggio precedente
     * centrava lo scroll su contenuto VECCHIO invece di lasciare la
     * vista dov'era (già in fondo). Soppresso SOLO lo scroll (mai il
     * render: TextMessageEnd deve comunque committare il testo) mentre
     * `deferHistoricalRendering` è vero — vedi resumeSession() e il
     * ramo `followUpBubbleInAttesa` di RunStarted per dove si arma e
     * disarma per un resume, non solo per l'apertura di una sessione
     * conclusa (che lo usava già).
     */
    if (!state.realSession.deferHistoricalRendering) scrollStreamingOutput(element);
    if (arretrato > 0) {
      programmaRenderMessaggioStreaming(messageId); // c'è ancora testo da rivelare: un altro frame, finché non si è in pari
    } else if (statoRender.fineRicevuta) {
      // in pari E il messaggio è finito: il cursore si spegne SOLO adesso, non quando è arrivata la fine dal server
      element.classList.remove('is-streaming');
    }
    return true;
  }

  function flushMessaggiStreaming() {
    streamingRenderFrame = null;
    const messageIds = [...streamingRenderPending];
    for (const messageId of messageIds) renderizzaMessaggioStreamingOra(messageId);
  }

  function programmaRenderMessaggioStreaming(messageId) {
    streamingRenderPending.add(messageId);
    if (streamingRenderFrame !== null) return;
    const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
    streamingRenderFrame = schedule(flushMessaggiStreaming);
  }

  function cancellaRenderMessaggiStreaming() {
    if (streamingRenderFrame !== null) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(streamingRenderFrame);
      else window.clearTimeout(streamingRenderFrame);
    }
    streamingRenderFrame = null;
    streamingRenderPending.clear();
  }

  function cancellaRenderAlberoDifferito() {
    if (treeRenderTimer !== null) window.clearTimeout(treeRenderTimer);
    treeRenderTimer = null;
  }

  function programmaRenderAlberoReale() {
    const generation = state.realSession.generation;
    cancellaRenderAlberoDifferito();
    treeRenderTimer = window.setTimeout(() => {
      treeRenderTimer = null;
      if (generation !== state.realSession.generation) return;
      void renderizzaAlberoReale();
    }, 60);
  }

  function programmaAggiornamentoElencoSessioniReali() {
    if (sessionListRefreshTimer !== null) window.clearTimeout(sessionListRefreshTimer);
    sessionListRefreshTimer = window.setTimeout(() => {
      sessionListRefreshTimer = null;
      void aggiornaElencoSessioniReali();
    }, 60);
  }

  function motionMilliseconds(name, fallback = 0) {
    if (document.body.classList.contains('reduce-motion')) return 0;
    const raw = getComputedStyle(HOST()).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return fallback;
    return raw.endsWith('s') && !raw.endsWith('ms') ? value * 1000 : value;
  }

  function animateExit(element, options = {}, finalize = () => {}) {
    if (!element) { finalize(); return null; }
    const durationToken = options.durationToken || '--talos-motion-duration-surface-exit';
    const duration = motionMilliseconds(durationToken, 180);
    if (duration <= 0 || typeof element.animate !== 'function') {
      finalize();
      return null;
    }
    const style = getComputedStyle(HOST());
    const easing = options.easing
      || style.getPropertyValue('--talos-motion-ease-exit').trim()
      || 'ease-in';
    const transform = options.transform || 'translateY(6px)';
    element.classList.add('motion-exit');
    const animation = element.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform }],
      { duration, easing, fill: 'none' },
    );
    motionAnimations.add(animation);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      motionAnimations.delete(animation);
      element.classList.remove('motion-exit');
      finalize();
    };
    animation.finished.then(finish, finish);
    return animation;
  }

  function cancelMotionAnimations() {
    for (const animation of motionAnimations) animation.cancel();
    motionAnimations.clear();
  }

  // Ferma SOLO le animazioni di uscita in corso su UN elemento — usata da
  // showEmbeddedDialog/syncEmbeddedDialogBackdrop per evitare la corsa: un
  // closeEmbeddedDialog appena avviato (animazione WAAPI ~180ms) la cui
  // callback finale arriva DOPO che lo stesso elemento è già stato
  // riaperto per un contenuto nuovo, richiudendolo in silenzio. Mirata
  // (animation.effect.target === element), non globale come
  // cancelMotionAnimations(): non deve toccare animazioni indipendenti in
  // corso altrove nella pagina.
  function cancelMotionAnimationsFor(element) {
    if (!element) return;
    for (const animation of motionAnimations) {
      if (animation.effect?.target === element) animation.cancel();
    }
  }

  // Contatore "generazione" per elemento, chiave dell'altra metà della cura
  // sopra: quando una chiusura tardiva (la callback di closeEmbeddedDialog/
  // syncEmbeddedDialogBackdrop, che arriva SOLO dopo che l'animazione WAAPI
  // è finita o è stata cancellata) esegue, deve chiudere/nascondere solo se
  // NESSUNA riapertura più recente è avvenuta nel frattempo. Un contatore
  // esplicito, non la classe CSS motion-enter: quella dipende dall'evento
  // `animationend`, che jsdom (l'ambiente dei test unitari) non emette mai
  // — una guardia basata su quella classe resterebbe "vera" per sempre nei
  // test, bloccando anche chiusure legittime successive (trovato provando
  // AL CONTRARIO la prima versione di questa cura contro la suite intera).
  const motionGenerazione = new WeakMap();

  function prossimaGenerazione(element) {
    const generazione = (motionGenerazione.get(element) || 0) + 1;
    motionGenerazione.set(element, generazione);
    return generazione;
  }

  function markMotionEnter(element) {
    if (!element) return;
    // ⛔ 02/09, owner: "la chat deve trovarsi già in fondo senza animazioni" — durante il ripristino le bolle non entrano una a una, compaiono tutte insieme già in fondo.
    const conversazione = $('#conversation');
    if (conversazione?.classList.contains('is-restoring') && conversazione.contains(element)) return;
    element.classList.remove('motion-exit');
    element.classList.add('motion-enter');
    element.addEventListener('animationend', () => element.classList.remove('motion-enter'), { once: true });
  }

  /**
   * ⛔ 02/09, owner: "quando clicchi su una riga sessione la chat deve
   * trovarsi già in fondo senza animazioni". Le bolle appese durante il
   * RIPRISTINO di una sessione (#conversation.is-restoring) non scorrono
   * da sole: il fondo lo tiene mantieniFondoDuranteRipristino, istantaneo,
   * e la conversazione si mostra solo quando è già tutta in fondo. Prima
   * ognuna di queste sette chiamate faceva partire uno scrollIntoView
   * "smooth" 40ms dopo l'inserimento — decine di animazioni in gara con
   * lo scroll istantaneo. Fuori dal ripristino: comportamento di sempre.
   */
  function scorriAllaBollaAppesa(article) {
    window.setTimeout(() => {
      const conversazione = $('#conversation');
      if (!article.isConnected || conversazione?.classList.contains('is-restoring')) return;
      /*
       * ⛔⛔⛔ 02/9 — owner dal vivo: "quando invio un messaggio la chat
       * non resta ferma ma sale sopra" + "gap senza nulla" — riprodotto e
       * isolato con strumentazione diretta (Element.prototype.scrollTo/
       * scrollIntoView patchati, scrollTop campionato ogni 30-50ms):
       * `article.scrollIntoView({block:'end'})` non produceva ALCUN
       * movimento qui — zero pixel in 3s — anche su un elemento connesso
       * dentro un #conversation genuinamente overflowing
       * (scrollHeight 1630+ contro clientHeight 1214, misurato). Causa
       * nella gerarchia: #conversation sta dentro .chat-view/.view-pane,
       * che ha un `overflow` proprio (hidden, vince su .view-pane per
       * ordine di sorgente — vedi styles.css) ed è quindi ANCH'ESSO una
       * "scrolling box" per l'algoritmo nativo di scrollIntoView, che
       * cammina tutti gli antenati scrollabili — la doppia gerarchia lo
       * confondeva. `conversazione.scrollTo({top:scrollHeight})`,
       * chiamato DIRETTAMENTE sull'UNICO contenitore che sappiamo
       * scrollabile per davvero, non cammina antenati e non ha questo
       * problema — stessa tecnica (assegnazione diretta) già in uso e
       * verificata in passaASessione per il riclic sessione. Misurato:
       * scrollIntoView 0px mossi; scrollTo diretto, in ~60ms, esatto.
       */
      if (conversazione) {
        conversazione.scrollTo({ top: conversazione.scrollHeight, behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth' });
      }
    }, 40);
  }

  function icon(id) {
    return `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  }

  function demoLabelsEnabled() {
    return window.__talosHarnessUiLab === true
      || new URLSearchParams(window.location.search).get('ui-lab') === '1'
      || window.location.hash === '#ui-lab';
  }

  function ensureDemoLabels() {
    if (!demoLabelsEnabled()) return;
    $$('[data-demo-surface]').forEach((surface) => {
      if (surface.querySelector('.demo-surface-badge')) return;
      const badge = document.createElement('span');
      badge.className = 'demo-surface-badge';
      badge.textContent = 'Demo UI · non collegato';
      badge.setAttribute('aria-label', `Demo UI non collegata: ${surface.dataset.demoSurface || 'superficie'}`);
      if (surface.classList.contains('chat-view')) surface.querySelector('.conversation')?.prepend(badge);
      else if (surface.classList.contains('sessions-panel')) surface.querySelector('.brand-row')?.after(badge);
      else surface.prepend(badge);
    });
  }

  function applyQaState() {
    const requested = new URLSearchParams(window.location.search).get('qa');
    if (!requested || !Object.hasOwn(QA_VIEWPORTS, requested)) return;
    document.documentElement.dataset.qaState = requested;
    document.documentElement.dataset.qaViewport = QA_VIEWPORTS[requested];
    if (requested === 'capabilities') window.setTimeout(() => openSheet('capabilities'), 0);
    else setView('dashboard', { mode: 'dashboard' });
  }

  function syncNavigationState() {
    mobileViewButtons.forEach((button) => {
      const active = button.dataset.mobileView === state.view;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    modeTabs.forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setEmbeddedTopbarHidden(hidden) {
    if (!HOST().classList.contains('talos-embedded')) return;
    topbar?.classList.toggle('is-scroll-hidden', hidden);
  }

  function resetEmbeddedTopbarScroll(scroller = null) {
    setEmbeddedTopbarHidden(false);
    if (scroller) embeddedHeaderScrollPositions.set(scroller, Math.max(0, scroller.scrollTop));
    else embeddedHeaderScrollers.forEach((element) => {
      embeddedHeaderScrollPositions.set(element, Math.max(0, element.scrollTop));
    });
  }

  function embeddedScrollerAtEnd(scroller, current) {
    const maximum = scroller.scrollHeight - scroller.clientHeight;
    return maximum > 0 && maximum - current <= 2;
  }

  function handleEmbeddedContentScroll(event) {
    if (!HOST().classList.contains('talos-embedded')) return;
    const scroller = event.currentTarget;
    const current = Math.max(0, scroller.scrollTop);
    const previous = embeddedHeaderScrollPositions.get(scroller) ?? current;
    const delta = current - previous;
    embeddedHeaderScrollPositions.set(scroller, current);
    if (current <= 4) {
      setEmbeddedTopbarHidden(false);
      return;
    }
    if (delta < -1) {
      // Collapsing the topbar increases the scrollport height. Near the end,
      // the browser then clamps scrollTop to its smaller maximum and emits a
      // negative delta even though the person is still flinging downward.
      // A real upward gesture leaves that maximum, so only that case reopens.
      if (!embeddedScrollerAtEnd(scroller, current)) setEmbeddedTopbarHidden(false);
      return;
    }
    if (current > 12 && delta > 2) setEmbeddedTopbarHidden(true);
  }

  function setView(view, options = {}) {
    const target = $(`[data-view="${view}"]`);
    if (!target) return;
    const previous = views.find((pane) => pane.classList.contains('active'));
    // Una vista può diventare nuovamente il target mentre la sua precedente
    // animazione di uscita è ancora in corso. In quel caso la callback
    // terminale obsoleta non deve rimuovere `active` dalla vista appena
    // riaperta: fermiamo l'effetto e avanziamo la stessa generazione già
    // usata per dialog/backdrop, senza introdurre un secondo lifecycle.
    cancelMotionAnimationsFor(target);
    prossimaGenerazione(target);
    state.view = view;
    if (options.mode) state.mode = options.mode;
    else if (view === 'dashboard') state.mode = 'dashboard';
    else if (view === 'chat') state.mode = 'chat';
    else if (view === 'terminal') state.mode = 'terminal'; // ⭐ 27/8 — il tab "Terminale" (ex "Split", che non affiancava niente) evidenzia se stesso anche quando ci si arriva da altrove (⌘T, `!comando`)
    else state.mode = null;
    views.forEach((pane) => {
      if (pane !== target && pane !== previous) pane.classList.remove('active', 'motion-enter', 'motion-exit');
    });
    if (previous && previous !== target) {
      const generazioneAllaChiusura = prossimaGenerazione(previous);
      animateExit(previous, { durationToken: '--talos-motion-duration-tab-change', transform: 'translateX(-8px)' }, () => {
        if (motionGenerazione.get(previous) === generazioneAllaChiusura) previous.classList.remove('active');
      });
    }
    target.classList.add('active');
    if (previous !== target) markMotionEnter(target);
    syncNavigationState();
    target.scrollTop = 0;
    resetEmbeddedTopbarScroll(view === 'chat' ? chatConversation : target);
    window.__talosHarnessHostViewChange?.(view);
    if (view === 'settings') inizializzaModelLab();
    if (view === 'dashboard') ensureSessionsBoard();
    if (view === 'automations') renderAutomationsReali();
    if (view === 'terminal') apriVistaTerminaleReale(); // ⭐ 28/8 — Terminale REALE: montaggio/connessione PIGRI, solo alla prima apertura del tab (LEDGER-TERMINALE-REALE.md)
  }

  function syncInspectorToggle() {
    const expanded = window.innerWidth <= 1040 || !appShell.classList.contains('inspector-collapsed');
    desktopInspectorToggle?.setAttribute('aria-expanded', String(expanded));
  }

  function toggleDesktopInspector() {
    if (window.innerWidth <= 1040) {
      openPanel('inspector');
      return;
    }
    appShell.classList.toggle('inspector-collapsed');
    syncInspectorToggle();
  }

  // Owner 24/8: la sidebar sessioni comprimibile quanto l'inspector — stesso
  // schema esatto, un solo pulsante desktop-only, nessuna scorciatoia nuova.
  function syncSessionsToggle() {
    const expanded = window.innerWidth <= 1040 || !appShell.classList.contains('sessions-collapsed');
    sessionsCollapseBtn?.setAttribute('aria-expanded', String(expanded));
  }

  function toggleSessionsPanel() {
    if (window.innerWidth <= 1040) {
      openPanel('sessions');
      return;
    }
    appShell.classList.toggle('sessions-collapsed');
    syncSessionsToggle();
  }

  function openPanel(name) {
    if (name === 'inspector' && window.innerWidth > 1040) {
      appShell.classList.remove('inspector-collapsed');
      syncInspectorToggle();
      return;
    }
    if (name === 'sessions') sessionsPanel.classList.add('open');
    if (name === 'inspector') inspectorPanel.classList.add('open');
    backdrop.classList.add('show');
  }

  function closePanels() {
    sessionsPanel.classList.remove('open');
    inspectorPanel.classList.remove('open');
    backdrop.classList.remove('show');
  }

  function syncEmbeddedDialogBackdrop() {
    const shouldShow = commandDialog.open || sheetDialog.open;
    if (shouldShow) {
      cancelMotionAnimationsFor(harnessDialogBackdrop);
      prossimaGenerazione(harnessDialogBackdrop);
      harnessDialogBackdrop.hidden = false;
      harnessDialogBackdrop.style.pointerEvents = ''; // vedi closeEmbeddedDialog — riattiva se una chiusura precedente l'aveva spento
      markMotionEnter(harnessDialogBackdrop);
      return;
    }
    if (harnessDialogBackdrop.hidden || harnessDialogBackdrop.classList.contains('motion-exit')) return;
    const generazioneAllaChiusura = motionGenerazione.get(harnessDialogBackdrop) || 0;
    animateExit(
      harnessDialogBackdrop,
      { durationToken: '--talos-motion-duration-popover', transform: 'none' },
      // guardia: se nel frattempo qualcuno ha già riaperto il backdrop
      // (una prossimaGenerazione() più recente), questa callback tardiva
      // non deve nasconderlo.
      () => { if (motionGenerazione.get(harnessDialogBackdrop) === generazioneAllaChiusura) harnessDialogBackdrop.hidden = true; },
    );
  }

  const DIALOG_RESIZE_STORAGE_KEY = 'talos-harness-modal-sizes-v1';
  const DIALOG_RESIZE_BREAKPOINT = 780;
  /** ⭐⭐⭐ 02/09 — un telefono in orizzontale (915×412) è compatto quanto uno in verticale: stessa regola del CSS (`@media (max-width: 780px), (max-height: 540px) and (orientation: landscape)`), un solo posto in JS. */
  const layoutCompatto = () => window.innerWidth <= DIALOG_RESIZE_BREAKPOINT || (window.innerHeight <= 540 && window.innerWidth > window.innerHeight);
  const DIALOG_RESIZE_MIN = Object.freeze({
    commandDialog: { width: 420, height: 240 },
    sheetDialog: { width: 520, height: 340 },
  });

  function readSavedDialogSizes() {
    try {
      const value = JSON.parse(window.localStorage.getItem(DIALOG_RESIZE_STORAGE_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function clampDialogSize(dialog, width, height) {
    const configured = DIALOG_RESIZE_MIN[dialog.id] || DIALOG_RESIZE_MIN.sheetDialog;
    const maxWidth = Math.max(280, window.innerWidth - 24);
    const maxHeight = Math.max(240, window.innerHeight - 24);
    const minWidth = Math.min(configured.width, maxWidth);
    const minHeight = Math.min(configured.height, maxHeight);
    return {
      width: Math.min(maxWidth, Math.max(minWidth, Math.round(Number(width) || minWidth))),
      height: Math.min(maxHeight, Math.max(minHeight, Math.round(Number(height) || minHeight))),
    };
  }

  function applyDialogSize(dialog, width, height, { userSized = true } = {}) {
    const size = clampDialogSize(dialog, width, height);
    dialog.style.width = `${size.width}px`;
    dialog.style.height = `${size.height}px`;
    dialog.classList.toggle('dialog-user-sized', userSized);
    return size;
  }

  function saveDialogSize(dialog) {
    const key = dialog.dataset.dialogResizeKey;
    if (!key || layoutCompatto()) return;
    const rect = dialog.getBoundingClientRect();
    const size = clampDialogSize(dialog, rect.width, rect.height);
    try {
      const saved = readSavedDialogSizes();
      saved[key] = size;
      window.localStorage.setItem(DIALOG_RESIZE_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Preferenza visuale non bloccante: il dialog resta utilizzabile.
    }
  }

  function prepareResizableDialog(dialog, logicalKey) {
    dialog.dataset.dialogResizeKey = logicalKey;
    dialog.style.removeProperty('width');
    dialog.style.removeProperty('height');
    dialog.classList.remove('dialog-user-sized');
    if (layoutCompatto()) return;
    const saved = readSavedDialogSizes()[logicalKey];
    if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height)) {
      applyDialogSize(dialog, saved.width, saved.height);
    }
  }

  function clampOpenDialogsToViewport() {
    for (const dialog of [commandDialog, sheetDialog]) {
      if (!dialog.open || !dialog.classList.contains('dialog-user-sized')) continue;
      if (layoutCompatto()) {
        dialog.style.removeProperty('width');
        dialog.style.removeProperty('height');
        dialog.classList.remove('dialog-user-sized');
        continue;
      }
      const rect = dialog.getBoundingClientRect();
      applyDialogSize(dialog, rect.width, rect.height);
    }
  }

  function setupDialogResize() {
    for (const dialog of [commandDialog, sheetDialog]) {
      const resizeMount = dialog === sheetDialog ? $('.sheet-head', dialog) : $('.command-search', dialog);
      for (const axis of ['width', 'height', 'both']) {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = `dialog-resize-handle dialog-resize-handle--${axis}`;
        handle.dataset.dialogResize = axis;
        handle.setAttribute('aria-label', axis === 'width'
          ? 'Ridimensiona larghezza finestra'
          : axis === 'height'
            ? 'Ridimensiona altezza finestra'
            : 'Ridimensiona larghezza e altezza finestra');
        (resizeMount || dialog).appendChild(handle);

        handle.addEventListener('pointerdown', (event) => {
          if (layoutCompatto() || event.button !== 0) return;
          event.preventDefault();
          const start = dialog.getBoundingClientRect();
          const startX = event.clientX;
          const startY = event.clientY;
          dialog.classList.add('dialog-user-sized', 'dialog-resizing');
          handle.setPointerCapture(event.pointerId);

          const onMove = (moveEvent) => {
            const width = axis === 'height' ? start.width : start.width + moveEvent.clientX - startX;
            const height = axis === 'width' ? start.height : start.height + moveEvent.clientY - startY;
            applyDialogSize(dialog, width, height);
          };
          const onEnd = () => {
            dialog.classList.remove('dialog-resizing');
            if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
            saveDialogSize(dialog);
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onEnd);
            handle.removeEventListener('pointercancel', onEnd);
          };
          handle.addEventListener('pointermove', onMove);
          handle.addEventListener('pointerup', onEnd);
          handle.addEventListener('pointercancel', onEnd);
        });

        handle.addEventListener('keydown', (event) => {
          if (layoutCompatto()) return;
          const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
          const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
          if ((axis === 'width' && !horizontal) || (axis === 'height' && !vertical) || (axis === 'both' && !horizontal && !vertical)) return;
          event.preventDefault();
          const rect = dialog.getBoundingClientRect();
          const width = horizontal ? rect.width + (event.key === 'ArrowRight' ? 16 : -16) : rect.width;
          const height = vertical ? rect.height + (event.key === 'ArrowDown' ? 16 : -16) : rect.height;
          applyDialogSize(dialog, width, height);
          saveDialogSize(dialog);
        });
      }
    }
  }

  function showEmbeddedDialog(dialog) {
    if (!dialog.dataset.dialogResizeKey) prepareResizableDialog(dialog, `dialog:${dialog.id}`);
    cancelMotionAnimationsFor(dialog);
    prossimaGenerazione(dialog);
    if (!dialog.open) dialog.show();
    markMotionEnter(dialog);
    harnessDialogBackdrop.style.pointerEvents = ''; // ⛔ vedi closeEmbeddedDialog sotto — un dialog che riapre deve annullare la disattivazione lasciata da una chiusura precedente
    syncEmbeddedDialogBackdrop();
    syncBackgroundDialogPause();
  }

  function closeEmbeddedDialog(dialog) {
    if (!dialog.open || dialog.classList.contains('motion-exit')) return;
    /*
     * ⛔⛔⛔ 30/8, QA visiva (Task 5.2) — trovato dal vivo con
     * `elementFromPoint`: il backdrop resta CLICCABILE per un'intera
     * finestra dopo che il foglio è scomparso alla vista, perché
     * `hidden` diventa true solo alla fine di DUE animazioni in serie
     * (prima il dialog qui sotto, poi il backdrop dentro
     * syncEmbeddedDialogBackdrop, chiamata solo nella callback finale).
     * Disaccoppiare "sta sparendo alla vista" da "intercetta ancora i
     * click": pointer-events si spegne SUBITO, qui, non alla fine della
     * sequenza — la sequenza di animazioni/hidden resta INVARIATA
     * (nessun rischio sul resto del design, generazioni comprese).
     * Riattivato in showEmbeddedDialog sopra e nel ramo "shouldShow" di
     * syncEmbeddedDialogBackdrop qui sotto.
     * Condizionale sull'ALTRO dialog (non quello che sta chiudendo:
     * `dialog.open` è ancora true qui, .close() non è ancora stato
     * chiamato) per non spegnere il backdrop se un secondo dialog
     * embedded è comunque ancora aperto.
     */
    const altroDialogAperto = dialog === sheetDialog ? commandDialog.open : sheetDialog.open;
    if (!altroDialogAperto) harnessDialogBackdrop.style.pointerEvents = 'none';
    const generazioneAllaChiusura = motionGenerazione.get(dialog) || 0;
    animateExit(dialog, { durationToken: '--talos-motion-duration-popover' }, () => {
      // guardia: se nel frattempo il dialog è stato riaperto per un
      // contenuto nuovo (una prossimaGenerazione() più recente), questa
      // callback tardiva non deve richiuderlo — vedi cancelMotionAnimationsFor
      // sopra per l'altra metà della cura (ferma anche l'animazione visiva).
      if (dialog.open && motionGenerazione.get(dialog) === generazioneAllaChiusura) dialog.close();
      syncEmbeddedDialogBackdrop();
      syncBackgroundDialogPause();
    });
  }

  function transientLayersActive() {
    return commandDialog.open
      || sheetDialog.open
      || sessionsPanel.classList.contains('open')
      || inspectorPanel.classList.contains('open');
  }

  function dismissTransientLayers() {
    if (!transientLayersActive()) return false;
    closeEmbeddedDialog(commandDialog);
    closeEmbeddedDialog(sheetDialog);
    closePanels();
    return true;
  }

  function toast(title, message = '') {
    if (toastRegion.children.length >= 3) {
      const oldest = toastRegion.firstElementChild;
      animateExit(oldest, {}, () => oldest?.remove());
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    const strong = document.createElement('strong');
    strong.textContent = String(title);
    el.appendChild(strong);
    if (message) {
      const span = document.createElement('span');
      span.textContent = String(message);
      el.appendChild(span);
    }
    toastRegion.appendChild(el);
    markMotionEnter(el);
    window.setTimeout(() => animateExit(el, {}, () => el.remove()), 3300);
  }

  // REAL_DATA_RENDER_START
  function textElement(tagName, className, value) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value === null || value === undefined ? '—' : String(value);
    return element;
  }

  /**
   * ⭐⭐⭐ 28/8, owner: "la schermata iniziale non deve essere una chat
   * vuota, deve essere esattamente come fa il mobile" — stesso impianto
   * del brand hero HTML (index.html, #conversationEmptyState), qui in
   * versione JS per l'unico altro punto che ricrea l'empty-state dopo
   * `nuovaGenerazioneSessione()` (`avviaSessionePendente`, sotto). Un
   * solo posto per la struttura, non due copie che possono divergere.
   */
  function costruisciConversationHero(titolo, sottotitolo) {
    const hero = document.createElement('div');
    hero.className = 'conversation-hero';
    hero.id = 'conversationEmptyState';
    const logo = document.createElement('span');
    logo.className = 'hero-logo';
    logo.setAttribute('aria-hidden', 'true');
    logo.appendChild(textElement('span', 'hero-logo-mark', ''));
    hero.append(logo, textElement('span', 'hero-wordmark', 'TALOS'), textElement('p', 'hero-welcome-title', titolo));
    if (sottotitolo) hero.appendChild(textElement('p', 'hero-subtitle', sottotitolo));
    return hero;
  }

  /*
   * ⛔⛔⛔ 27/8, owner: "le risposte non sono formattate, cioè le basi" —
   * `.assistant-copy` riceveva il testo del modello con `.textContent +=`:
   * un elenco puntato del modello ("- Uno\n- Due") arrivava a schermo come
   * "- Uno - Due" su una riga sola — nessun a-capo, nessun elenco, nessun
   * grassetto. Le "basi" che mancavano: paragrafi, elenchi puntati/
   * numerati, blocchi di codice, grassetto, corsivo, codice inline.
   *
   * ⛔ Non un parser Markdown completo (niente tabelle, niente link, niente
   * markdown annidato dentro un elenco) — deliberatamente "le basi", non di
   * più: un motore CommonMark vero sarebbe una dipendenza nuova in un bundle
   * che dichiara "zero npm install" (vedi il README del progetto). Il resto
   * dell'app TALOS usa `markdown-it` (mobile/package.json) — qui niente
   * pacchetto, un renderer minimo scritto a mano, sufficiente per ciò che
   * un modello di solito produce in una risposta di chat.
   *
   * ⛔ MAI innerHTML con testo non fidato (il testo arriva dal modello, non
   * da noi): ogni nodo è costruito con createElement/createTextNode — una
   * stringa come "<img onerror=...>" nel testo del modello resta testo
   * letterale a schermo, mai eseguito.
   */
  /*
   * ⭐⭐⭐ 02/9 — formattatore dei blocchi di codice (owner: "crea un
   * formattatore di blocco codice, ricerca web dei migliori"). Prima ogni
   * ```fence``` diventava un `<pre><code>` nudo: nessuna evidenziazione,
   * nessuna etichetta, nessun modo di copiarlo, e l'identificatore di
   * linguaggio dopo i backtick veniva addirittura buttato via.
   *
   * ⭐ Ricerca web (regola zero): fra i tre affermati, **Prism** è quello
   * giusto QUI — Shiki evidenzia a build-time/server (pkgpulse.com/guides/
   * shiki-vs-prismjs-vs-highlightjs-2026), inadatto a un testo che arriva in
   * streaming nel browser; highlight.js indovina il linguaggio da solo ma
   * non serve, il fence ce lo DICE già. Prism è il più leggero e si
   * vendorizza offline. Sul disegno del blocco la ricerca è unanime
   * (streamdown.ai/docs/code-blocks, mui.com/x/react-chat, reui.io):
   * intestazione con il linguaggio + pulsante copia con conferma
   * transitoria, e ⛔ "defer code block rendering until the closing fence
   * arrives, or show a streaming indicator; copy disabled during
   * streaming" — che è esattamente il parametro `chiuso` qui sotto.
   *
   * ⛔ Il linguaggio si SCRIVE solo se il fence lo dichiara: mai indovinato
   * (il progetto vieta i fatti inventati), e mai scritto se Prism non
   * conosce quella grammatica — si mostra il nome dichiarato ma il testo
   * resta non evidenziato, senza fingere.
   * ⛔ Finché il fence è APERTO (`chiuso === false`) il blocco è ancora in
   * arrivo: nessuna evidenziazione (verrebbe rifatta a ogni frame su un
   * testo che cambia, con sfarfallio e costo inutile) e copia disabilitata
   * — si copierebbe codice a metà.
   */
  const LINGUAGGI_CODICE_ALIAS = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', mjs: 'javascript', cjs: 'javascript',
    py: 'python', python3: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
    html: 'markup', xml: 'markup', svg: 'markup', vue: 'markup', yml: 'yaml',
    'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', golang: 'go', rs: 'rust', md: 'markdown',
  };
  /** Il nome da mostrare nell'intestazione: quello dichiarato dal modello, non quello interno di Prism. */
  function etichettaLinguaggio(dichiarato) {
    const pulito = String(dichiarato || '').trim();
    if (!pulito) return '';
    const noti = { js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX', javascript: 'JavaScript', typescript: 'TypeScript', py: 'Python', python: 'Python', sh: 'Bash', bash: 'Bash', shell: 'Shell', json: 'JSON', yaml: 'YAML', yml: 'YAML', sql: 'SQL', html: 'HTML', xml: 'XML', css: 'CSS', rust: 'Rust', go: 'Go', java: 'Java', c: 'C', cpp: 'C++', 'c++': 'C++', csharp: 'C#', 'c#': 'C#', markdown: 'Markdown', md: 'Markdown', vue: 'Vue' };
    return noti[pulito.toLowerCase()] || pulito;
  }
  function costruisciBloccoCodice(testoCodice, linguaggioDichiarato, chiuso) {
    const blocco = document.createElement('div');
    blocco.className = 'code-block';
    if (!chiuso) blocco.classList.add('code-block-in-arrivo');
    const etichetta = etichettaLinguaggio(linguaggioDichiarato);
    const intestazione = document.createElement('div');
    intestazione.className = 'code-block-head';
    intestazione.append(textElement('span', 'code-block-lang', etichetta || 'testo'));
    const copia = document.createElement('button');
    copia.type = 'button';
    copia.className = 'code-block-copy';
    copia.textContent = chiuso ? 'Copia' : 'In arrivo…';
    copia.disabled = !chiuso;
    if (chiuso) {
      copia.addEventListener('click', async () => {
        await copyText(testoCodice, 'Codice copiato');
        copia.textContent = 'Copiato';
        copia.classList.add('is-fatto');
        window.setTimeout(() => { copia.textContent = 'Copia'; copia.classList.remove('is-fatto'); }, 1800);
      });
    }
    intestazione.append(copia);
    const pre = document.createElement('pre');
    const code = textElement('code', '', testoCodice);
    const chiave = LINGUAGGI_CODICE_ALIAS[String(linguaggioDichiarato || '').toLowerCase()] || String(linguaggioDichiarato || '').toLowerCase();
    const grammatica = chiuso && chiave && window.Prism?.languages?.[chiave];
    if (grammatica) {
      code.className = `language-${chiave}`;
      try {
        // `highlightElement` va bene, ma passa da un hook globale e da
        // `Prism.plugins`: qui basta la funzione pura, più prevedibile.
        code.innerHTML = window.Prism.highlight(testoCodice, grammatica, chiave);
      } catch {
        code.textContent = testoCodice; // ⛔ una grammatica che lancia non deve mangiarsi il codice: si torna al testo nudo
      }
    }
    pre.appendChild(code);
    blocco.append(intestazione, pre);
    return blocco;
  }

  function renderizzaMarkdownSemplice(testoGrezzo) {
    const frammento = document.createDocumentFragment();
    const testo = String(testoGrezzo ?? '');
    const righe = testo.split('\n');

    function applicaInline(contenitore, segmento) {
      // grassetto **x**, corsivo *x*/_x_, codice inline `x` — un solo giro,
      // nessuna combinazione annidata (le "basi", non un parser a stati).
      const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g;
      let ultimo = 0;
      let match;
      while ((match = pattern.exec(segmento))) {
        if (match.index > ultimo) contenitore.appendChild(document.createTextNode(segmento.slice(ultimo, match.index)));
        if (match[1] !== undefined) contenitore.appendChild(textElement('strong', '', match[1]));
        else if (match[2] !== undefined) contenitore.appendChild(textElement('code', '', match[2]));
        else contenitore.appendChild(textElement('em', '', match[3] !== undefined ? match[3] : match[4]));
        ultimo = pattern.lastIndex;
      }
      if (ultimo < segmento.length) contenitore.appendChild(document.createTextNode(segmento.slice(ultimo)));
    }

    let i = 0;
    let paragrafoCorrente = [];
    function chiudiParagrafo() {
      if (paragrafoCorrente.length === 0) return;
      const p = document.createElement('p');
      paragrafoCorrente.forEach((riga, indice) => {
        if (indice > 0) p.appendChild(document.createElement('br'));
        applicaInline(p, riga);
      });
      frammento.appendChild(p);
      paragrafoCorrente = [];
    }

    while (i < righe.length) {
      const riga = righe[i];
      const fenceMatch = /^```/.test(riga.trim());
      // ⭐ 28/8, owner: "l'output della chat ha --- come separatore, formatta anche quello" — riga isolata di 3+ trattini/asterischi/underscore, nessun altro carattere: la sintassi Markdown per un separatore orizzontale. "---" non ha lo spazio dopo il primo trattino richiesto da listaMatch sotto, quindi le due regex non collidono su questa sintassi.
      const hrMatch = /^(-{3,}|\*{3,}|_{3,})\s*$/.test(riga.trim());
      const listaMatch = /^(\s*)([-*])\s+(.*)$/.exec(riga);
      const listaNumMatch = /^(\s*)(\d+)\.\s+(.*)$/.exec(riga);
      const titoloMatch = /^(#{1,6})\s+(.*)$/.exec(riga);

      if (fenceMatch) {
        chiudiParagrafo();
        // ⭐ 02/9 — l'identificatore di linguaggio dopo i backtick di apertura
        // (```python) veniva SCARTATO: era l'unico posto dove il modello ci dice
        // di che linguaggio si tratta, e lo buttavamo via.
        const linguaggioDichiarato = riga.trim().slice(3).trim().split(/\s+/)[0] || '';
        const righeCodice = [];
        i += 1;
        while (i < righe.length && !/^```/.test(righe[i].trim())) { righeCodice.push(righe[i]); i += 1; }
        const chiuso = i < righe.length; // il fence ha trovato la sua riga di chiusura
        frammento.appendChild(costruisciBloccoCodice(righeCodice.join('\n'), linguaggioDichiarato, chiuso));
        i += 1; // salta la riga di chiusura ```
        continue;
      }
      if (hrMatch) {
        chiudiParagrafo();
        frammento.appendChild(document.createElement('hr'));
        i += 1;
        continue;
      }
      if (titoloMatch) {
        chiudiParagrafo();
        const livello = Math.min(titoloMatch[1].length, 6);
        const h = document.createElement(`h${livello}`);
        applicaInline(h, titoloMatch[2]);
        frammento.appendChild(h);
        i += 1;
        continue;
      }
      if (listaMatch || listaNumMatch) {
        chiudiParagrafo();
        const ordinata = !!listaNumMatch;
        const lista = document.createElement(ordinata ? 'ol' : 'ul');
        while (i < righe.length) {
          const m = ordinata ? /^(\s*)(\d+)\.\s+(.*)$/.exec(righe[i]) : /^(\s*)([-*])\s+(.*)$/.exec(righe[i]);
          if (!m) break;
          const li = document.createElement('li');
          applicaInline(li, m[3]);
          lista.appendChild(li);
          i += 1;
        }
        frammento.appendChild(lista);
        continue;
      }
      if (riga.trim() === '') {
        chiudiParagrafo();
        i += 1;
        continue;
      }
      paragrafoCorrente.push(riga);
      i += 1;
    }
    chiudiParagrafo();
    return frammento;
  }

  /**
   * ⭐⭐⭐ 02/09 — rendering INCREMENTALE dello streaming (review complessiva,
   * misurato: 13.068 caratteri in 162 delta = 1,28 s di main thread, ~8 ms a
   * frame che crescono col testo, perché renderizzaMarkdownSemplice() rilavora
   * TUTTO il markdown a ogni frame). Ricerca 02/09 — Hermes TUI/Desktop
   * (15×/14×), Streamdown, incremark, Textual: solo l'ULTIMO blocco può ancora
   * cambiare, i blocchi chiusi si analizzano una volta sola.
   *
   * In questo renderer un blocco si chiude su una riga vuota FUORI da un
   * ```fence``` (paragrafo, elenco, titolo e separatore finiscono lì; il fence è
   * l'unico costrutto che attraversa righe vuote): tagliare il testo
   * all'ultima riga vuota fuori fence e renderizzare i due pezzi separatamente
   * produce ESATTAMENTE lo stesso DOM del tutto-insieme. Il DOM resta piatto
   * (nessun wrapper: `.assistant-copy > :last-child` e `::after` continuano a
   * valere): si rimuovono solo i nodi della coda precedente e si appendono i
   * nuovi; i nodi stabili non si toccano più. Se il testo cambia all'indietro
   * (non è più un prefisso di ciò che era) si riparte da zero: il comportamento
   * di sempre, mai un DOM incoerente.
   */
  function confineBlocchiStabili(testo) {
    const righe = testo.split('\n');
    let dentroFence = false;
    let offset = 0;
    let confine = 0;
    for (let r = 0; r < righe.length - 1; r += 1) { // l'ultima riga è sempre coda
      const riga = righe[r];
      if (/^```/.test(riga.trim())) dentroFence = !dentroFence;
      offset += riga.length + 1;
      if (!dentroFence && riga.trim() === '') confine = offset;
    }
    return confine;
  }

  function renderizzaMarkdownIncrementale(contenitore, statoRender, testoGrezzo) {
    const testo = String(testoGrezzo ?? '');
    const confine = confineBlocchiStabili(testo);
    const stabile = testo.slice(0, confine);
    if (statoRender.prefisso === null || !stabile.startsWith(statoRender.prefisso)) {
      contenitore.replaceChildren(renderizzaMarkdownSemplice(stabile));
      statoRender.prefisso = stabile;
      statoRender.nodiCoda = [];
    } else {
      for (const nodo of statoRender.nodiCoda) nodo.remove();
      statoRender.nodiCoda = [];
      if (stabile.length > statoRender.prefisso.length) {
        // ⛔⛔⛔ 02/9 — owner dal vivo: "il rendering a dissolvenza... non
        // funziona bene". Causa trovata leggendo il CSS (talos-stream-fade):
        // era agganciata a `.assistant-copy > :last-child`, ma il vero
        // :last-child durante lo streaming è quasi sempre la CODA qui sotto
        // — distrutta e ricreata ad ogni frame (nodiCoda.forEach(remove) +
        // append, sopra). Un'animazione su un elemento appena creato riparte
        // da zero: la coda non finiva MAI di dissolversi, ricominciava ogni
        // frame. Il blocco giusto da animare è QUESTO — il testo che si è
        // appena STABILIZZATO (confineBlocchiStabili l'ha giudicato
        // definitivo) e che da qui in avanti non viene più toccato: marcato
        // una volta sola, l'animazione parte una volta sola e finisce.
        const nuovoStabile = renderizzaMarkdownSemplice(stabile.slice(statoRender.prefisso.length));
        const ultimoNodoStabile = nuovoStabile.lastElementChild;
        contenitore.appendChild(nuovoStabile);
        ultimoNodoStabile?.classList.add('stream-settle');
        statoRender.prefisso = stabile;
      }
    }
    const coda = renderizzaMarkdownSemplice(testo.slice(confine));
    statoRender.nodiCoda = [...coda.childNodes];
    contenitore.appendChild(coda);
  }

  function boardErrorMessage(error) {
    return messaggioErroreUtente(error, 'Il server locale non risponde. Apri Codice sul PC e riprova.');
  }

  /** Copy per persone: i dettagli tecnici restano nel Doctor e nel log. */
  function messaggioErroreUtente(error, fallback = 'La richiesta non è riuscita. Riprova.') {
    const messaggi = {
      PROJECTS_NOT_CONFIGURED: 'Non c’è ancora una cartella di progetto disponibile. Apri Doctor per capire cosa manca.',
      CONFIG_INVALID: 'La configurazione non è pronta. Apri Doctor per vedere come sistemarla.',
      RUNTIME_NOT_AVAILABLE: 'Questa funzione non è ancora disponibile. Apri Doctor per controllare lo stato.',
      METHOD_NOT_ALLOWED: 'Questa parte di TALOS deve essere aggiornata. Apri Doctor, aggiorna il servizio locale e riprova.',
      WORKSPACE_LAUNCH_NOT_AVAILABLE: 'Questo collegamento alla cartella non è più valido. Aprila di nuovo dal menu di Windows.',
      WORKSPACE_NOT_AVAILABLE: 'Questa cartella non è più disponibile. Controlla che esista e aprila di nuovo dal menu di Windows.',
      INTERNAL_ERROR: 'Il server locale ha incontrato un problema. Apri Doctor e riprova.',
      NOT_FOUND: 'Questa risorsa non è più disponibile. Aggiorna la pagina e riprova.',
    };
    if (error?.code && messaggi[error.code]) return messaggi[error.code];
    const messaggio = typeof error?.message === 'string' ? error.message.trim() : '';
    if (messaggio && !/TALOS_[A-Z0-9_]+|child_process|writeFileSync|stack| at [A-Za-z]:\\/i.test(messaggio)) return messaggio;
    return fallback;
  }

  /**
   * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — il
   * contatore costo/token per una sessione. Solo token, MAI un costo in
   * dollari: calcolarlo richiederebbe sapere con certezza quale modello
   * ha girato QUESTO giro (il server può ricadere sul suo default senza
   * dirlo al client) — mostrare un numero solo perché "probabilmente"
   * giusto sarebbe un bluff, lo stesso principio che vieta un
   * `enforcement` finto altrove in questo progetto. Token contati sono
   * sempre veri, indipendentemente dal prezzo.
   * ⛔⛔⛔ 30/8 — bug reale trovato E corretto riusando questa stessa
   * funzione per la Board (piano "Board — da campagne TALOS-BANCO a
   * cruscotto sessioni"): leggeva `usage.prompt_tokens_details?.cached_tokens`
   * (la forma NIDIFICATA della risposta grezza OpenRouter) — ma il kernel
   * (talosHarness.mjs, `conto`) espone un `cached_tokens` GIÀ appiattito,
   * verificato leggendo il sorgente vero, non presunto. Il campo nidificato
   * non esiste mai in `evento.totali`: la cache mostrava sempre "· cache"
   * assente, anche quando aveva colpito per davvero.
   */
  function formattaUsageBreve(usage, { live = false, finita = false } = {}) {
    if (!usage) return finita ? 'consumo non registrato' : 'contesto ignoto · in attesa del primo giro'; // 02/09 — una sessione finita non "aspetta" niente
    const prompt = Number(usage.prompt_tokens ?? 0) || 0;
    const completion = Number(usage.completion_tokens ?? 0) || 0;
    const cache = Number(usage.cached_tokens ?? 0) || 0;
    const totale = prompt + completion;
    const kilo = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    const cacheParte = cache > 0 ? ` · cache ${kilo(cache)}` : '';
    return `${kilo(totale)} token · ${usage.giri} gir${usage.giri === 1 ? 'o' : 'i'}${cacheParte}${live ? ' · live' : ''}`;
  }

  /** Ripatcha la riga "Main" del foglio Albero sessione SE è già aperto — non riapre né forza un redraw di tutto il foglio, stesso principio di aggiornaPillolaModello(). */
  function aggiornaContatoreUsage() {
    const nodo = $('[data-usage-summary]');
    if (nodo) nodo.textContent = `Main · ${formattaUsageBreve(state.realSession.usage, { live: true })}`;
  }

  /**
   * ⭐⭐⭐ 30/8 — piano "Board — da campagne TALOS-BANCO a cruscotto
   * sessioni": una riga per sessione REALE di Harness Desktop stesso
   * (`GET /api/v1/sessions`, la STESSA rotta che riempie già la sidebar —
   * zero meccanismo nuovo lato dati). Nessuna espansione/dettaglio: a
   * differenza della vecchia riga campagna, qui non c'è un'"evidenza" da
   * mostrare o nascondere, solo un riepilogo.
   */
  function formattaOraSessione(iso) {
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return iso;
    return data.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  }

  function creaRigaSessioneBoard(sessione) {
    const article = document.createElement('article');
    article.className = 'session-board-row';
    article.tabIndex = 0;

    const identity = document.createElement('span');
    const titolo = sessione.nome || sessione.taskId || 'Sessione';
    const modelloParte = sessione.modello ? ` · ${sessione.modello}` : '';
    identity.append(
      textElement('strong', '', titolo),
      textElement('small', '', `${formattaOraSessione(sessione.avviataAlle)}${modelloParte} · ${formattaUsageBreve(sessione.usage, { finita: Boolean(sessione.conclusa || sessione.interrotta) })}`),
    );

    const stato = sessione.interrotta
      ? { testo: 'Interrotta', classe: 'error' }
      : sessione.ultimoEsito === 'errore'
        ? { testo: 'Errore', classe: 'error' } // 02/09 — RunError non è "Conclusa"
        : sessione.conclusa
          ? { testo: 'Conclusa', classe: 'success' }
          : { testo: 'In corso', classe: '' };
    const chip = textElement('span', `status-chip ${stato.classe}`.trim(), stato.testo);

    article.append(identity, chip);
    // ⭐ 31/8 P0 — la Board usa lo stesso menu azioni della sidebar, non una
    // scorciatoia che apre direttamente la conferma di eliminazione.
    article.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      apriMenuAzioniSessione({ ...sessione, nome: titolo }, { x: event.clientX, y: event.clientY, focusElement: article });
    });
    return article;
  }

  /*
   * ⛔⛔⛔ 30/8, QA visiva (Task 14) — trovato dal vivo con 154 sessioni
   * reali sotto: il badge "Demo UI · non collegato" (`ensureDemoLabels()`,
   * scoped a `[data-demo-surface="board"]`) non veniva MAI nascosto qui,
   * a differenza di `aggiornaElencoSessioniReali()` (la sidebar), che lo
   * fa esplicitamente. Stesso identico badge già trovato-e-corretto in
   * più superfici diverse di questo stesso file (sidebar sessioni,
   * albero file, tree) — un pattern ricorrente: ogni superficie con dati
   * reali deve nasconderlo A MANO, non c'è un meccanismo automatico.
   */
  function renderSessionsBoard(sessioni) {
    sessionsBoardList.replaceChildren();
    if (sessioni.length > 0) {
      const demoBadge = sessionsBoardList.closest('[data-demo-surface="board"]')?.querySelector('.demo-surface-badge');
      if (demoBadge) demoBadge.hidden = true;
    }
    if (sessioni.length === 0) {
      sessionsBoardList.appendChild(textElement('p', 'board-empty', 'Nessuna sessione ancora — premi «Nuova» per iniziare.'));
      return;
    }
    for (const sessione of sessioni) sessionsBoardList.appendChild(creaRigaSessioneBoard(sessione));
  }

  async function apiGet(pathname) {
    const response = await fetch(API(pathname), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      const error = new Error('Risposta locale non valida');
      error.code = 'INTERNAL_ERROR';
      throw error;
    }
    if (!response.ok || !envelope?.ok) {
      const error = new Error(envelope?.error?.message || 'Richiesta locale non riuscita');
      error.code = envelope?.error?.code || 'INTERNAL_ERROR';
      throw error;
    }
    return envelope.data;
  }

  function formattaByteModelLab(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let index = 0;
    let scaled = value;
    while (scaled >= 1024 && index < units.length - 1) { scaled /= 1024; index += 1; }
    const display = Number.isInteger(scaled) || scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1);
    return `${display} ${units[index]}`;
  }

  function formattaContestoModelLab(tokens) {
    const value = Number(tokens);
    if (!Number.isFinite(value) || value <= 0) return 'non dichiarato';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M token`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}k token`;
    return `${Math.round(value)} token`;
  }

  /** ⭐ 02/09 — stesso stile di formattaByteModelLab/formattaContestoModelLab: nessuna dipendenza nuova, Intl già nel browser. Per download/preferiti Hugging Face nella scheda repository ridisegnata. */
  function formattaContoModelLab(numero) {
    const value = Number(numero);
    if (!Number.isFinite(value) || value < 0) return null;
    return new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }

  function runtimeModelLabPronto(runtime) {
    return runtime?.state === 'observed' && Array.isArray(runtime.models) && runtime.models.length > 0;
  }

  function renderizzaProviderModelLab() {
    const rows = Array.isArray(state.modelLab.providers) ? state.modelLab.providers : [];
    const status = $('#modelLabProviderStatus');
    if (status) {
      if (state.modelLab.providerError) status.textContent = 'Stato provider non disponibile';
      else if (state.modelLab.loadingProviders) status.textContent = 'Stato provider in lettura…';
      else {
        const configured = rows.filter((row) => row.keyConfigured).length;
        status.textContent = configured > 0 ? `${configured} access${configured === 1 ? 'o' : 'i'} configurat${configured === 1 ? 'o' : 'i'}` : 'Accesso provider non configurato';
      }
    }
    for (const card of $$('[data-provider-id]')) {
      const row = rows.find((item) => item.id === card.dataset.providerId);
      if (!row) continue;
      const stateNode = card.querySelector('[data-provider-state]');
      if (stateNode) stateNode.textContent = row.keyConfigured ? 'Chiave presente sul server' : (row.requiresKey ? 'Non configurato' : 'Chiave non necessaria');
      const execution = card.querySelector('[data-provider-execution]');
      if (execution) execution.textContent = row.execution || 'Collegamento non dichiarato';
      const providerHelp = card.querySelector('.provider-help');
      if (providerHelp && row.id !== 'openrouter' && row.id !== 'ollama' && row.id !== 'huggingface') {
        providerHelp.textContent = row.supportsEndpoint
          ? 'Chiave e indirizzo restano sul server locale.'
          : 'La chiave resta nel portachiavi del computer.';
      }
      card.classList.toggle('is-configured', Boolean(row.keyConfigured || row.endpointConfigured));
      const keyInput = card.querySelector('[data-provider-key]');
      const removeKey = card.querySelector('[data-provider-action="remove-key"]');
      if (removeKey) removeKey.hidden = !row.keyConfigured;
      const endpointBlock = card.querySelector('[data-provider-endpoint-block]');
      const endpointInput = card.querySelector('[data-provider-endpoint]');
      const endpointLabel = endpointInput?.closest('label');
      if (endpointLabel) endpointLabel.hidden = !row.supportsEndpoint;
      if (endpointBlock) endpointBlock.hidden = false;
      if (endpointInput && document.activeElement !== endpointInput) endpointInput.value = row.endpoint || '';
      const timeoutInput = card.querySelector('[data-provider-timeout]');
      if (timeoutInput && document.activeElement !== timeoutInput) timeoutInput.value = String(row.timeoutSeconds || 60);
      const resetRuntime = card.querySelector('[data-provider-action="reset-runtime"]');
      if (resetRuntime) resetRuntime.hidden = !row.supportsEndpoint || !row.endpointConfigured;
      if (keyInput) keyInput.value = '';
    }
  }

  async function caricaProviderModelLab() {
    if (state.modelLab.loadingProviders) return;
    state.modelLab.loadingProviders = true;
    state.modelLab.providerError = null;
    renderizzaProviderModelLab();
    try {
      const data = await apiGet('/api/v1/providers');
      state.modelLab.providers = Array.isArray(data?.items) ? data.items : [];
    } catch (error) {
      state.modelLab.providerError = error;
      state.modelLab.providers = [];
    } finally {
      state.modelLab.loadingProviders = false;
      renderizzaProviderModelLab();
    }
  }

  function mostraEsitoProvider(card, message, errore = false) {
    const feedback = card?.querySelector('[data-provider-feedback]');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-error', errore);
    feedback.hidden = false;
    if (!errore) window.setTimeout(() => { if (feedback.textContent === message) feedback.hidden = true; }, 3500);
  }

  async function gestisciAzioneProvider(button) {
    const card = button.closest('[data-provider-id]');
    const provider = card?.dataset.providerId;
    const action = button.dataset.providerAction;
    if (!provider || !action) return;
    const original = button.textContent;
    button.disabled = true;
    try {
      if (action === 'save-key') {
        const input = card.querySelector('[data-provider-key]');
        await apiPost(`/api/v1/providers/${encodeURIComponent(provider)}/key`, { key: input?.value || '' });
        if (input) input.value = '';
        mostraEsitoProvider(card, 'Chiave salvata nel portachiavi del computer.');
      } else if (action === 'remove-key') {
        await apiPost(`/api/v1/providers/${encodeURIComponent(provider)}/key/remove`, {});
        mostraEsitoProvider(card, 'Chiave rimossa.');
      } else if (action === 'save-runtime') {
        const endpoint = card.querySelector('[data-provider-endpoint]')?.value || '';
        const timeoutSeconds = Number(card.querySelector('[data-provider-timeout]')?.value || 60);
        await apiPost(`/api/v1/providers/${encodeURIComponent(provider)}/runtime`, { endpoint, timeoutSeconds });
        mostraEsitoProvider(card, 'Collegamento salvato.');
      } else if (action === 'reset-runtime') {
        await apiPost(`/api/v1/providers/${encodeURIComponent(provider)}/runtime/reset`, {});
        mostraEsitoProvider(card, 'Indirizzo predefinito ripristinato.');
      }
      await caricaProviderModelLab();
    } catch (error) {
      mostraEsitoProvider(card, error.message || 'Non è stato possibile salvare questa modifica.', true);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  /*
   * ⛔⛔⛔ 02/9 — QUI c'era una SECONDA `renderizzaModelliLocaliModelLab`,
   * più vecchia e più povera (nessun filtro di ricerca, nessuna azione
   * rinomina/copia/elimina, mostrava `model.id` invece del nome scelto).
   * In JS fra due dichiarazioni omonime nello stesso scope vince
   * l'ULTIMA: girava già quella più sotto, e questa era codice morto —
   * ma leggibile, quindi capace di far credere a chi legge (e a un test)
   * che il pannello Installati fosse quello scarno.
   * ⛔ È la STESSA classe di difetto già trovata oggi con
   * `renderizzaHfDetailModelLab`: due copie della stessa funzione in
   * questo file, una che ombreggia l'altra in silenzio. L'ha scoperta un
   * test nuovo che cercava «la» funzione e ha trovato la prima.
   * La versione viva, unica, è più sotto.
   */

  /*
   * ⭐⭐⭐ 02/9 — Fase 5, punto 4: la UI "PRIMA DI LOAD". Il backend
   * (`/fit`, `/qualify` — scritti il 02/09) sapeva già rispondere, ma
   * nessuno lo chiedeva: la lista Installati mostrava dimensione e
   * licenza e taceva sulla domanda che conta, «questo modello girerà su
   * QUESTA macchina?».
   *
   * ⭐ Ricerca 02/9 (aimultiple.com/self-hosted-llm,
   * tech-insider.org/lm-studio-vs-ollama-2026, localllm.in): la scala
   * standard è **Fits ≤90% dell'usabile · Tight nell'ultimo 10% · Won't
   * fit sopra**. E c'è un buco dichiarato nei due concorrenti diretti:
   * «neither currently implements a prominent "will not fit" warning UI
   * before model loading» — LM Studio può crashare senza avviso, Ollama
   * scivola in silenzio su CPU (misurato fino a **30× più lento**, e può
   * bloccare la macchina). Avvisare PRIMA è quindi un vantaggio reale,
   * non un abbellimento.
   *
   * ⛔ `tight` NON arriva dal server: è derivato qui dai byte che il
   * server ha già misurato (richiesti vs disponibili). Non è un dato
   * inventato — è una soglia dichiarata, applicata a numeri veri, e si
   * mostra solo quando entrambi i numeri esistono davvero.
   */
  const SOGLIA_TIGHT = 0.9;
  const VERDETTI_FIT = {
    compatible: { etichetta: 'Compatibile', classe: 'ok' },
    tight: { etichetta: 'Al limite', classe: 'warn' },
    'chat-only': { etichetta: 'Solo chat', classe: 'warn' },
    blocked: { etichetta: 'Non compatibile', classe: 'bad' },
    unknown: { etichetta: 'Non determinabile', classe: 'unknown' },
  };
  /** Il perché, in italiano piano: mai il codice grezzo del server a schermo. */
  const MOTIVI_FIT = {
    fits: 'memoria, spazio e contesto sono sufficienti',
    storage: 'non c\'è abbastanza spazio su disco',
    memory: 'non c\'è abbastanza memoria libera',
    context: 'il contesto del modello è più corto di quello richiesto dal profilo',
    capabilities: 'non è stato possibile osservare le capacità del modello',
    template: 'il template non dichiara gli attrezzi: può conversare, non lavorare come agente',
    measurement: 'la macchina non è stata misurata',
  };
  /**
   * Deriva il verdetto mostrato. ⛔ Alza `compatible` a `tight` SOLO se
   * entrambi i byte sono numeri veri: con `availableBytes: null` (che il
   * server restituisce quando non ha potuto misurare) non si inventa una
   * percentuale, si lascia `compatible`.
   */
  function verdettoFit(esito) {
    if (esito.state !== 'compatible') return esito.state;
    for (const parte of [esito.memory, esito.storage]) {
      const richiesti = parte?.requiredBytes;
      const disponibili = parte?.availableBytes;
      if (Number.isFinite(richiesti) && Number.isFinite(disponibili) && disponibili > 0 && richiesti > disponibili * SOGLIA_TIGHT) return 'tight';
    }
    return 'compatible';
  }
  function descriviFit(esito) {
    const verdetto = verdettoFit(esito);
    const voce = VERDETTI_FIT[verdetto] || VERDETTI_FIT.unknown;
    /*
     * ⭐⭐ 02/9 — quando manca memoria o spazio si dice QUANTO ne manca.
     * Misurato sul Qwen3 27B dell'owner: in chat chiede 16,18 GB contro
     * 15,23 liberi — bloccato per meno di 1 GB. «Non compatibile» e basta
     * nasconderebbe che basta liberare un poco, e il pannello memoria qui
     * accanto fa esattamente quello.
     * ⛔ Solo con entrambi i numeri veri: senza, si resta sul motivo secco.
     */
    const scarto = (parte) => {
      const richiesti = parte?.requiredBytes;
      const disponibili = parte?.availableBytes;
      if (!Number.isFinite(richiesti) || !Number.isFinite(disponibili) || richiesti <= disponibili) return '';
      return ` — ne mancano ${formattaByteModelLab(richiesti - disponibili)}`;
    };
    const motivo = verdetto === 'tight'
      ? `entra, ma sopra il ${Math.round(SOGLIA_TIGHT * 100)}% di ciò che è libero: sotto carico può non bastare`
      : (MOTIVI_FIT[esito.reason] || esito.reason || 'motivo non dichiarato')
        + (esito.reason === 'memory' ? scarto(esito.memory) : esito.reason === 'storage' ? scarto(esito.storage) : '');
    return { verdetto, classe: voce.classe, testo: `${voce.etichetta} — ${motivo}` };
  }
  function nodoVerdettoFit(modelId) {
    const voce = state.modelLab.fit.get(modelId);
    const nodo = document.createElement('p');
    nodo.className = 'model-lab-fit';
    nodo.dataset.modelFit = modelId;
    if (!voce) { nodo.hidden = true; return nodo; }
    if (voce.inCorso) { nodo.dataset.fitState = 'attesa'; nodo.textContent = 'Verifica in corso…'; return nodo; }
    if (voce.errore) {
      nodo.dataset.fitState = 'bad';
      // ⛔ L'errore VERO del server, non un "non compatibile" generico: non
      // sapere se un modello gira è diverso dal sapere che non gira.
      nodo.textContent = `Verifica non riuscita — ${voce.errore}`;
      return nodo;
    }
    const { classe, testo } = descriviFit(voce.esito);
    /*
     * ⛔ 02/9 — con un ripiego chat valido il verdetto NON resta rosso: il
     * modello è utilizzabile, solo non come agente. Rosso direbbe «non ti
     * serve a niente», che è falso.
     */
    nodo.dataset.fitState = voce.ripiegoChat ? 'warn' : classe;
    nodo.textContent = voce.ripiegoChat ? `Va bene per la chat, non come agente — ${testo.replace(/^[^—]*— /, '')}` : testo;
    const ctx = voce.esito.context;
    if (Number.isFinite(ctx?.availableTokens) && Number.isFinite(ctx?.requestedTokens)) {
      nodo.append(textElement('small', '', ` contesto ${ctx.availableTokens.toLocaleString('it-IT')} token su ${ctx.requestedTokens.toLocaleString('it-IT')} richiesti`));
    }
    return nodo;
  }
  /*
   * ⭐⭐⭐ 02/9 — la verifica chiedeva SOLO il profilo agente (65.536 token) e
   * bollava «non compatibile» modelli che per CHAT vanno benissimo: sul
   * Qwen3 27B dell'owner sono 28,9 GB a 65k contro ~17 GB a 8k, su 31,6 GB
   * di RAM. Dire «non compatibile» e basta è vero a metà, ed è la metà meno
   * utile.
   *
   * ⭐ Ricerca 02/9: Ollama sceglie il contesto in base alla memoria
   * disponibile (4K sotto 24 GiB, 32K fra 24 e 48, 256K sopra) — il
   * pattern affermato non è «ci sta / non ci sta», è **cosa può fare qui**.
   *
   * ⇒ Se il profilo agente non passa si chiede ANCHE quello chat, e si
   * riporta il meglio che il modello può fare su questa macchina.
   * ⛔ La seconda domanda si fa solo quando serve: un modello che va bene
   * come agente non ha bisogno di una seconda misura.
   */
  async function verificaCompatibilitaModello(modelId) {
    state.modelLab.fit.set(modelId, { inCorso: true });
    aggiornaNodoFit(modelId);
    const chiediFit = (profilo) => apiGet(`/api/v1/local-models/${encodeURIComponent(modelId)}/fit${profilo ? `?profile=${profilo}` : ''}`);
    try {
      const esito = await chiediFit();
      let ripiegoChat = null;
      if (esito.state !== 'compatible') {
        try {
          const chat = await chiediFit('chat');
          // ⛔ Solo se la chat passa DAVVERO: un ripiego che non passa non
          // si mostra, sarebbe rumore su una riga già negativa.
          if (chat.state === 'compatible') ripiegoChat = chat;
        } catch { /* ⛔ il ripiego è un extra: se fallisce resta il verdetto principale, mai un errore in più a schermo */ }
      }
      state.modelLab.fit.set(modelId, { esito, ripiegoChat });
    } catch (error) {
      state.modelLab.fit.set(modelId, { errore: error.message || 'errore non dichiarato' });
    }
    aggiornaNodoFit(modelId);
  }
  /** Sostituisce SOLO la riga toccata: un re-render dell'intera lista perderebbe il fuoco e la ricerca in corso. */
  function aggiornaNodoFit(modelId) {
    const vecchio = $(`[data-model-fit="${CSS.escape(modelId)}"]`);
    if (vecchio) vecchio.replaceWith(nodoVerdettoFit(modelId));
  }

  // P1 Model Lab: lista installati con ricerca e azioni reali.
  function renderizzaModelliLocaliModelLab() {
    const mount = $('#modelLabInstalledList');
    if (!mount) return;
    if (state.modelLab.installedError) { mount.replaceChildren(textElement('p', 'model-lab-empty', `Modelli locali non disponibili: ${state.modelLab.installedError.message}`)); return; }
    const query = String(state.modelLab.installedSearch || '').trim().toLowerCase();
    const visible = state.modelLab.installed.filter((model) => !query || [model.name, model.id, model.repo].some((value) => String(value || '').toLowerCase().includes(query)));
    if (visible.length === 0) { mount.replaceChildren(textElement('p', 'model-lab-empty', 'Nessun modello locale osservabile.')); return; }
    mount.replaceChildren(...visible.map((model) => {
      const row = document.createElement('article'); row.className = 'model-lab-installed-item';
      row.append(textElement('strong', '', model.name || model.id), textElement('span', '', `${model.state} · ${model.license || 'licenza non dichiarata'} · ${formattaByteModelLab(model.bytes)}`), textElement('small', '', `${model.repo || 'origine non dichiarata'} · sha256 ${String(model.sha256 || '').slice(0, 12) || 'non dichiarato'}`));
      const actions = document.createElement('div'); actions.className = 'model-lab-installed-actions';
      const rename = document.createElement('button'); rename.className = 'secondary-btn compact'; rename.type = 'button'; rename.textContent = 'Rinomina';
      rename.addEventListener('click', async () => { const next = window.prompt('Come vuoi chiamare questo modello?', model.name || model.id); if (next === null) return; try { await apiPost(`/api/v1/local-models/${encodeURIComponent(model.id)}/rename`, { name: next }); await caricaModelliLocaliModelLab(); } catch (error) { window.alert(error.message || 'Rinomina non riuscita.'); } });
      const copy = document.createElement('button'); copy.className = 'secondary-btn compact'; copy.type = 'button'; copy.textContent = 'Copia percorso';
      copy.addEventListener('click', async () => { try { await navigator.clipboard?.writeText(model.path || ''); copy.textContent = 'Percorso copiato'; window.setTimeout(() => { copy.textContent = 'Copia percorso'; }, 1800); } catch { copy.textContent = 'Copia non riuscita'; } });
      const remove = document.createElement('button'); remove.className = 'secondary-btn compact danger'; remove.type = 'button'; remove.textContent = 'Elimina';
      remove.addEventListener('click', async () => { if (!window.confirm(`Eliminare ${model.name || model.id}?`)) return; try { await apiPost(`/api/v1/local-models/${encodeURIComponent(model.id)}/delete`, {}); await caricaModelliLocaliModelLab(); } catch (error) { window.alert(error.message || 'Eliminazione non riuscita.'); } });
      /*
       * ⭐ Fase 5 punto 4 — "girerà su QUESTA macchina?", chiesto PRIMA di
       * caricare. Non parte da solo a ogni render: `/fit` legge l'header
       * GGUF dal disco e misura la macchina, farlo per ogni riga a ogni
       * ridisegno sarebbe lavoro vero speso senza che nessuno l'abbia
       * chiesto. È un gesto esplicito, e resta in memoria per la sessione.
       */
      const verifica = document.createElement('button');
      verifica.className = 'secondary-btn compact'; verifica.type = 'button'; verifica.textContent = 'Verifica compatibilità';
      verifica.addEventListener('click', () => { void verificaCompatibilitaModello(model.id); });
      actions.append(rename, copy, verifica, remove); row.append(actions, nodoVerdettoFit(model.id)); return row;
    }));
  }

  function renderizzaRuntimeModelLab() {
    const list = $('#modelLabRuntimeList');
    const status = $('#modelLabRuntimeStatus');
    const runtimeSelect = $('#modelLabRuntimeSelect');
    const modelSelect = $('#modelLabModelSelect');
    const runButton = $('#modelLabRunButton');
    const prompt = $('#modelLabPrompt');
    if (!list || !status || !runtimeSelect || !modelSelect || !runButton || !prompt) return;
    if (state.modelLab.runtimeError) {
      status.textContent = `Runtime non disponibili: ${state.modelLab.runtimeError.message}`;
      list.replaceChildren(textElement('p', 'model-lab-empty', 'La lettura dello stato runtime è fallita.'));
      runtimeSelect.replaceChildren(new Option('Nessun runtime osservato', ''));
      modelSelect.replaceChildren(new Option('Nessun modello osservato', ''));
      runtimeSelect.disabled = modelSelect.disabled = runButton.disabled = prompt.disabled = true;
      return;
    }
    const pronti = state.modelLab.runtimes.filter(runtimeModelLabPronto);
    status.textContent = pronti.length > 0 ? `${pronti.length} runtime pronto${pronti.length === 1 ? '' : 'i'} · stato osservato` : 'Nessun runtime pronto';
    list.replaceChildren(...(state.modelLab.runtimes.length > 0 ? state.modelLab.runtimes.map((runtime) => {
      const row = document.createElement('article');
      row.className = `model-lab-runtime-item ${runtimeModelLabPronto(runtime) ? 'ready' : 'unavailable'}`;
      row.dataset.runtimeState = runtime.state || 'unknown';
      row.append(
        textElement('strong', '', runtime.runtimeId),
        textElement('span', '', runtimeModelLabPronto(runtime) ? `${runtime.models.length} modelli · ${runtime.models.map((model) => model.name || model.id).join(', ')}` : 'non raggiunto'),
        textElement('small', '', runtime.modelsError ? `modelli non letti · ${runtime.modelsError}` : (runtime.observedAt ? `misurato ${new Date(runtime.observedAt).toLocaleTimeString()}` : 'misura non disponibile')),
      );
      return row;
    }) : [textElement('p', 'model-lab-empty', 'Nessun runtime osservato.')]));
    /*
     * ⛔⛔⛔ 02/9 (notte) — TERZO difetto dello stesso pannello, trovato
     * premendo il pulsante per davvero con un modello CARICATO: il
     * pannello memoria leggeva `state.modelLab.runtimes`, ma veniva
     * ridisegnato SOLO da `caricaCapacitaMacchina()` — che gira una volta
     * all'avvio. Caricare un modello dopo non cambiava nulla a schermo: la
     * riga continuava a dire «non tiene nessun modello» e il pulsante
     * restava disabilitato. Lo stato dei runtime si aggiorna QUI: è qui
     * che il pannello va rinfrescato.
     */
    aggiornaPannelloMemoria();
    const selected = pronti.find((runtime) => runtime.runtimeId === state.modelLab.selectedRuntime) || pronti[0];
    state.modelLab.selectedRuntime = selected?.runtimeId || '';
    const models = selected?.models || [];
    state.modelLab.selectedRuntimeModel = models.some((model) => model.id === state.modelLab.selectedRuntimeModel) ? state.modelLab.selectedRuntimeModel : (models[0]?.id || '');
    runtimeSelect.replaceChildren(...(pronti.length > 0 ? pronti.map((runtime) => new Option(runtime.runtimeId, runtime.runtimeId)) : [new Option('Nessun runtime pronto', '')]));
    runtimeSelect.value = state.modelLab.selectedRuntime;
    modelSelect.replaceChildren(...(models.length > 0 ? models.map((model) => new Option(model.name || model.id, model.id)) : [new Option('Nessun modello osservato', '')]));
    modelSelect.value = state.modelLab.selectedRuntimeModel;
    runtimeSelect.disabled = modelSelect.disabled = prompt.disabled = runButton.disabled = !selected;
    const gate = $('#modelLabRuntimeGate');
    if (gate) gate.classList.toggle('is-ready', Boolean(selected));
  }

  async function caricaRuntimeModelLab() {
    if (state.modelLab.loadingRuntime) return;
    state.modelLab.loadingRuntime = true;
    state.modelLab.runtimeError = null;
    try {
      const data = await apiGet('/api/v1/runtime');
      state.modelLab.runtimes = Array.isArray(data?.items) ? data.items : [];
    } catch (error) {
      state.modelLab.runtimeError = error;
      state.modelLab.runtimes = [];
    } finally {
      state.modelLab.loadingRuntime = false;
      renderizzaRuntimeModelLab();
    }
  }

  async function caricaModelliLocaliModelLab() {
    if (state.modelLab.loadingInstalled) return;
    state.modelLab.loadingInstalled = true;
    state.modelLab.installedError = null;
    try {
      const data = await apiGet('/api/v1/local-models');
      state.modelLab.installed = Array.isArray(data?.items) ? data.items : [];
    } catch (error) {
      state.modelLab.installedError = error;
      state.modelLab.installed = [];
    } finally {
      state.modelLab.loadingInstalled = false;
      renderizzaModelliLocaliModelLab();
    }
  }

  function ensureModelLabControls() {
    const hfPanel = $('#modelLabHfPanel'); const installedPanel = $('#modelLabInstalledPanel');
    if (hfPanel && !hfPanel.querySelector('[data-model-lab-enhanced="hf"]')) {
      const controls = document.createElement('div'); controls.dataset.modelLabEnhanced = 'hf'; controls.className = 'model-lab-enhanced-controls';
      controls.innerHTML = '<label class="setting-control"><span>Ordina</span><select id="modelLabHfSortControl" aria-label="Ordina risultati Hugging Face"><option value="downloads">Download</option><option value="likes">Preferiti</option><option value="created">Più recenti</option><option value="lastModified">Aggiornati</option></select></label><label class="setting-control"><span>Autore</span><input id="modelLabHfAuthorControl" type="search" aria-label="Filtra per autore Hugging Face" placeholder="Organizzazione" /></label><label class="setting-control"><span>Filtri</span><input id="modelLabHfFiltersControl" type="search" aria-label="Filtra modelli Hugging Face" placeholder="q4, text-generation" /></label><button class="secondary-btn compact" id="modelLabHfNextButtonControl" type="button" hidden>Carica altri risultati</button>';
      hfPanel.insertBefore(controls, hfPanel.querySelector('.model-lab-catalog-layout'));
    }
    if (installedPanel && !installedPanel.querySelector('[data-model-lab-enhanced="installed"]')) {
      const controls = document.createElement('div'); controls.dataset.modelLabEnhanced = 'installed'; controls.className = 'model-lab-enhanced-controls';
      controls.innerHTML = '<label class="search-field"><svg><use href="#i-search"></use></svg><input id="modelLabInstalledSearchControl" type="search" placeholder="Cerca modelli installati..." aria-label="Cerca modelli installati" /></label><input id="modelLabImportInput" type="file" accept=".gguf,application/octet-stream" hidden /><button class="secondary-btn compact" id="modelLabImportButton" type="button">Importa .gguf</button><button class="secondary-btn compact danger" id="modelLabImportCancelButton" type="button" hidden>Annulla</button><progress id="modelLabImportProgress" max="100" value="0" hidden aria-label="Avanzamento importazione"></progress><span class="settings-status" id="modelLabImportStatus" aria-live="polite"></span>';
      installedPanel.insertBefore(controls, $('#modelLabInstalledList'));
      $('#modelLabImportButton')?.addEventListener('click', () => $('#modelLabImportInput')?.click());
      $('#modelLabImportCancelButton')?.addEventListener('click', () => state.modelLab.importXhr?.abort());
      $('#modelLabImportInput')?.addEventListener('change', (event) => { const file = event.target.files?.[0]; if (file) importaModelloLocaleModelLab(file); event.target.value = ''; });
    }
  }

  function importaModelloLocaleModelLab(file) {
    const button = $('#modelLabImportButton'); const cancel = $('#modelLabImportCancelButton'); const progress = $('#modelLabImportProgress'); const status = $('#modelLabImportStatus');
    if (!file || !/\.gguf$/iu.test(file.name) || !Number.isSafeInteger(file.size) || file.size <= 0) { if (status) status.textContent = 'Scegli un file .gguf non vuoto.'; return; }
    const base = file.name.replace(/\.gguf$/iu, '').toLowerCase().replace(/[^a-z0-9]+/giu, '-').replace(/^-+|-+$/gu, '').slice(0, 96) || 'modello';
    const id = `${base}-${crypto.randomUUID().slice(0, 8)}`;
    const xhr = new XMLHttpRequest(); state.modelLab.importXhr = xhr; state.modelLab.importProgress = 0;
    if (button) { button.disabled = true; button.textContent = 'Importazione…'; } if (cancel) cancel.hidden = false; if (progress) { progress.hidden = false; progress.value = 0; }
    if (status) status.textContent = 'Sto copiando il modello nel catalogo locale…';
    xhr.open('POST', '/api/v1/local-models/import'); xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.setRequestHeader('X-Talos-Model-Id', id); xhr.setRequestHeader('X-Talos-Model-Filename', file.name); xhr.setRequestHeader('X-Talos-Model-Bytes', String(file.size)); xhr.setRequestHeader('X-Talos-Model-Name', file.name.replace(/\.gguf$/iu, ''));
    xhr.upload.addEventListener('progress', (event) => { if (!event.lengthComputable) return; state.modelLab.importProgress = Math.round((event.loaded / event.total) * 100); if (progress) progress.value = state.modelLab.importProgress; if (status) status.textContent = `Importazione ${state.modelLab.importProgress}%`; });
    const reset = () => { if (button) { button.disabled = false; button.textContent = 'Importa .gguf'; } if (cancel) cancel.hidden = true; state.modelLab.importXhr = null; };
    xhr.addEventListener('load', async () => { let payload = null; try { payload = JSON.parse(xhr.responseText || '{}'); } catch {} if (xhr.status >= 200 && xhr.status < 300 && payload?.ok) { if (status) status.textContent = 'Modello importato e verificato.'; if (progress) progress.value = 100; await caricaModelliLocaliModelLab(); } else if (status) status.textContent = payload?.error?.message || 'Non è stato possibile importare il modello.'; reset(); });
    xhr.addEventListener('error', () => { if (status) status.textContent = 'Collegamento interrotto: riprova.'; reset(); });
    xhr.addEventListener('abort', () => { if (status) status.textContent = 'Importazione annullata.'; reset(); });
    xhr.send(file);
  }

  function renderizzaDownloadModelLab() {
    const mount = $('#modelLabDownloadsList'); if (!mount) return;
    if (!state.modelLab.downloads.length) { mount.replaceChildren(textElement('p', 'model-lab-empty', 'Nessun download attivo.')); return; }
    mount.replaceChildren(...state.modelLab.downloads.map((item) => {
      const row = document.createElement('article'); row.className = 'model-lab-installed-item';
      const label = `${item.id} · ${item.state} · ${item.progress ?? 0}%`;
      row.append(textElement('strong', '', label), textElement('span', '', `${formattaByteModelLab(item.bytes)} / ${formattaByteModelLab(item.totalBytes)}`));
      if (['running', 'queued'].includes(item.state)) { const pause = document.createElement('button'); pause.className = 'secondary-btn compact'; pause.textContent = 'Pausa'; pause.addEventListener('click', async () => { await apiPost(`/api/v1/huggingface/downloads/${encodeURIComponent(item.id)}/pause`, {}); caricaDownloadModelLab(); }); row.append(pause); }
      if (['paused', 'failed'].includes(item.state)) { const resume = document.createElement('button'); resume.className = 'secondary-btn compact'; resume.textContent = 'Riprendi'; resume.addEventListener('click', async () => { await apiPost(`/api/v1/huggingface/downloads/${encodeURIComponent(item.id)}/resume`, {}); caricaDownloadModelLab(); }); row.append(resume); }
      if (!['ready', 'cancelled'].includes(item.state)) { const cancel = document.createElement('button'); cancel.className = 'secondary-btn compact'; cancel.textContent = 'Annulla'; cancel.addEventListener('click', async () => { await apiPost(`/api/v1/huggingface/downloads/${encodeURIComponent(item.id)}/cancel`, {}); caricaDownloadModelLab(); }); row.append(cancel); }
      return row;
    }));
  }
  async function caricaDownloadModelLab() {
    try { const data = await apiGet('/api/v1/huggingface/downloads'); state.modelLab.downloads = Array.isArray(data?.items) ? data.items : []; renderizzaDownloadModelLab(); if (state.modelLab.downloads.some((item) => ['queued', 'running', 'verifying'].includes(item.state))) { if (!state.modelLab.downloadTimer) state.modelLab.downloadTimer = setTimeout(() => { state.modelLab.downloadTimer = null; caricaDownloadModelLab(); }, 800); } else if (state.modelLab.downloads.some((item) => item.state === 'ready')) caricaModelliLocaliModelLab(); }
    catch (error) { const mount = $('#modelLabDownloadsList'); if (mount) mount.replaceChildren(textElement('p', 'model-lab-empty', error.message || 'Download non disponibili.')); }
  }
  function hfSetGroups(files) {
    const groups = new Map(); for (const file of files || []) { const key = file.path.replace(/-\d{5}-of-\d{5}(?=\.gguf$)/iu, ''); const group = groups.get(key) || []; group.push(file); groups.set(key, group); }
    return [...groups.values()].map((items) => items.sort((a, b) => a.path.localeCompare(b.path)));
  }
  function renderizzaModelCardReadme(detail) {
    const section = document.createElement('section');
    section.className = 'model-lab-model-card';
    if (detail.readme) section.append(textElement('h5', '', 'Scheda modello'), renderizzaMarkdownSemplice(detail.readme));
    for (const image of Array.isArray(detail.images) ? detail.images : []) {
      if (!image || typeof image.url !== 'string') continue;
      const wrapper = document.createElement('figure');
      const element = document.createElement('img');
      element.loading = 'lazy'; element.decoding = 'async'; element.alt = typeof image.alt === 'string' ? image.alt : '';
      element.src = API(`/api/v1/huggingface/image?url=${encodeURIComponent(image.url)}`);
      element.addEventListener('error', () => wrapper.replaceChildren(textElement('figcaption', 'model-lab-empty', 'Immagine della scheda non disponibile.')));
      wrapper.appendChild(element);
      section.appendChild(wrapper);
    }
    return section;
  }
  /*
   * ⭐⭐⭐ 02/09 — RIDISEGNATA, owner dal vivo: "la scheda modelli HF fa
   * schifo davvero". Skill frontend-design caricata (regola vincolante).
   * Riferimento: `TalosMobileLocalRepoDetail.vue` (mobile, 893 righe) —
   * stessa INFORMAZIONE (tag/licenza/download/preferiti, apri+copia link,
   * scheda README, varianti con stato), layout diverso perché il
   * desktop ha spazio: niente rail orizzontale a chip (pensata per un
   * pollice), un elenco verticale di righe — più naturale con mouse e
   * tastiera, stessa densità informativa di prima ma leggibile a colpo
   * d'occhio (stato in FORMA, non solo in testo: un pallino colorato
   * prima del nome). Zero campi inventati: `downloads`/`likes`/
   * `pipelineTag`/`gated` esistono già in `hf-hub-client.mjs#describeModel`
   * — semplicemente non venivano mai mostrati.
   */
  function renderizzaHfDetailModelLab() {
    const mount = $('#modelLabHfDetail'); if (!mount) return; const detail = state.modelLab.hfDetail;
    if (!detail) { mount.replaceChildren(textElement('p', 'model-lab-empty', 'Seleziona un repository per vedere i file GGUF.')); return; }
    const card = document.createElement('article'); card.className = 'hf-repo-card';

    const heading = document.createElement('div'); heading.className = 'hf-repo-heading';
    heading.append(textElement('h4', 'hf-repo-id', detail.repo));
    const actions = document.createElement('div'); actions.className = 'hf-repo-actions';
    const openLink = document.createElement('a'); openLink.className = 'secondary-btn compact'; openLink.href = `https://huggingface.co/${detail.repo}`; openLink.target = '_blank'; openLink.rel = 'noopener noreferrer';
    openLink.append(document.createTextNode('Apri su Hugging Face'), iconaSvgAlbero('i-link'));
    const copyLink = document.createElement('button'); copyLink.type = 'button'; copyLink.className = 'icon-btn'; copyLink.setAttribute('aria-label', 'Copia link del repository'); copyLink.title = 'Copia link del repository'; copyLink.append(iconaSvgAlbero('i-copy'));
    copyLink.addEventListener('click', async () => { try { await navigator.clipboard?.writeText(`https://huggingface.co/${detail.repo}`); copyLink.title = 'Link copiato'; window.setTimeout(() => { copyLink.title = 'Copia link del repository'; }, 1800); } catch { copyLink.title = 'Copia non riuscita'; } });
    actions.append(openLink, copyLink);
    heading.append(actions);

    const tags = document.createElement('div'); tags.className = 'hf-repo-tags';
    tags.append(textElement('span', 'hf-tag', detail.license || 'licenza non dichiarata'));
    tags.append(textElement('span', 'hf-tag', 'GGUF'));
    if (detail.pipelineTag) tags.append(textElement('span', 'hf-tag', detail.pipelineTag));
    tags.append(textElement('span', `hf-tag ${detail.gated ? 'hf-tag-gated' : 'hf-tag-public'}`, detail.gated ? 'Gated' : 'Pubblico'));

    const statsParti = [];
    const downloadLabel = formattaContoModelLab(detail.downloads);
    if (downloadLabel) statsParti.push(`${downloadLabel} download`);
    if (Number.isFinite(detail.likes) && detail.likes >= 0) statsParti.push(`${formattaContoModelLab(detail.likes)} ★`);
    statsParti.push(`revisione ${String(detail.revision || 'main').slice(0, 12)}`);
    const stats = textElement('p', 'hf-repo-stats', statsParti.join(' · '));

    const variants = document.createElement('div'); variants.className = 'hf-variant-list';
    const groups = hfSetGroups(detail.files);
    variants.append(textElement('p', 'hf-variant-list-heading', groups.length > 0 ? `Varianti GGUF osservate · ${groups.length}` : 'Varianti GGUF'));
    if (!groups.length) variants.append(textElement('p', 'model-lab-empty', 'Nessun file GGUF osservato.'));
    for (const files of groups) {
      const bytes = files.reduce((sum, file) => sum + Number(file.sizeBytes || 0), 0);
      const expected = files[0].path.match(/-\d{5}-of-(\d{5})\.gguf$/iu)?.[1];
      const incomplete = Boolean(expected && Number(expected) !== files.length);
      const missingHash = files.some((file) => !file.sha256);
      const row = document.createElement('article'); row.className = `hf-variant-row${incomplete ? ' is-incomplete' : missingHash ? ' is-unverified' : ' is-ready'}`;
      const status = document.createElement('span'); status.className = 'hf-variant-status'; status.setAttribute('aria-hidden', 'true');
      const info = document.createElement('div'); info.className = 'hf-variant-info';
      info.append(textElement('strong', '', files[0].path.split('/').pop()), textElement('small', '', `${files.length === 1 ? '1 file' : `${files.length} file`} · ${formattaByteModelLab(bytes)}`));
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-btn compact';
      button.disabled = incomplete || missingHash;
      button.textContent = incomplete ? `Set incompleto · ${files.length}/${expected}` : missingHash ? 'Hash non verificato' : 'Scarica';
      button.addEventListener('click', async () => { const id = `${detail.repo.replace(/[^a-z0-9_-]/giu, '-')}-${detail.revision.slice(0, 12)}-${files[0].path.replace(/[^a-z0-9]/giu, '-')}`.slice(0, 120); await apiPost('/api/v1/huggingface/download', { id, repo: detail.repo, revision: detail.revision, files: files.map((file) => ({ path: file.path, bytes: file.sizeBytes, sha256: file.sha256 })), bytes, sha256: files[0].sha256, license: detail.license || 'unknown', path: id }); setModelLabSection('downloads'); caricaDownloadModelLab(); });
      row.append(status, info, button);
      variants.append(row);
    }

    card.append(heading, tags, stats, renderizzaModelCardReadme(detail), variants);
    mount.replaceChildren(card);
  }
  function renderizzaHfRisultatiModelLab() { const mount = $('#modelLabHfResults'); if (!mount) return; if (state.modelLab.hfError) { mount.replaceChildren(textElement('p', 'model-lab-empty', state.modelLab.hfError.message)); return; } if (!state.modelLab.hfResults.length) { mount.replaceChildren(textElement('p', 'model-lab-empty', 'Nessun repository GGUF trovato.')); return; } mount.replaceChildren(...state.modelLab.hfResults.map((item) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'model-lab-list-item'; button.append(textElement('strong', '', item.repo), textElement('small', '', `${item.downloads ?? '—'} download · ${item.gated ? 'gated' : 'pubblico'}`)); button.addEventListener('click', async () => { state.modelLab.hfDetail = null; renderizzaHfDetailModelLab(); try { state.modelLab.hfDetail = await apiGet(`/api/v1/huggingface/repo?repo=${encodeURIComponent(item.repo)}&revision=${encodeURIComponent(item.revision || '')}`); } catch (error) { state.modelLab.hfError = error; } renderizzaHfDetailModelLab(); }); return button; })); }
  async function cercaHuggingFaceModelLab() { state.modelLab.hfQuery = $('#modelLabHfSearch')?.value?.trim() || ''; state.modelLab.hfError = null; const status = $('#modelLabHfStatus'); if (status) status.textContent = 'Ricerca in corso…'; try { const data = await apiGet(`/api/v1/huggingface/search?query=${encodeURIComponent(state.modelLab.hfQuery)}&limit=20`); state.modelLab.hfResults = data.items || []; if (status) status.textContent = `${state.modelLab.hfResults.length} repository osservati`; } catch (error) { state.modelLab.hfError = error; state.modelLab.hfResults = []; if (status) status.textContent = 'Ricerca non disponibile'; } renderizzaHfRisultatiModelLab(); }

  function aggiungiBloccoStreamModelLab(tipo, titolo, contenuto) {
    const mount = $('#modelLabStream');
    if (!mount) return;
    if (mount.querySelector('.model-lab-empty')) mount.replaceChildren();
    let block = mount.querySelector(`[data-model-lab-stream-block="${tipo}"]`);
    if (!block) {
      block = document.createElement('section');
      block.dataset.modelLabStreamBlock = tipo;
      block.className = `model-lab-stream-block model-lab-stream-${tipo}`;
      block.append(textElement('strong', '', titolo), textElement('pre', '', ''));
      mount.append(block);
    }
    const body = block.querySelector('pre');
    if (body && contenuto) body.textContent += String(contenuto);
  }

  function collegaEventiProvaModelLab(sessionId) {
    if (state.modelLab.runtimeEventSource) state.modelLab.runtimeEventSource.close();
    if (typeof EventSource !== 'function') { aggiungiBloccoStreamModelLab('error', 'Errore', 'EventSource non disponibile nel browser.'); return; }
    const source = new EventSource(API(`/api/v1/sessions/${encodeURIComponent(sessionId)}/events`));
    state.modelLab.runtimeEventSource = source;
    window.__talosHarnessModelLabEventSource = source;
    source.onmessage = (message) => {
      let event;
      try { event = JSON.parse(message.data); } catch { return; }
      if (event.type === 'TextMessageContent') aggiungiBloccoStreamModelLab('text', 'Risposta', event.delta);
      else if (event.type === 'ReasoningMessageContent') aggiungiBloccoStreamModelLab('reasoning', 'Ragionamento', event.delta);
      else if (event.type === 'ToolCallStart') aggiungiBloccoStreamModelLab('tool', 'Tool call', event.toolCallName || event.toolCallId);
      else if (event.type === 'ToolCallArgs') aggiungiBloccoStreamModelLab('tool', 'Tool call', event.delta);
      else if (event.type === 'RunError') aggiungiBloccoStreamModelLab('error', 'Errore', event.message || event.code || 'Runtime locale fallito');
      if (event.type === 'RunFinished' || event.type === 'RunError') {
        source.close();
        state.modelLab.runtimeEventSource = null;
        const cancel = $('#modelLabCancelButton'); if (cancel) cancel.hidden = true;
      }
    };
    source.onerror = () => { if (source.readyState === EventSource.CLOSED) aggiungiBloccoStreamModelLab('error', 'Errore', 'Connessione agli eventi interrotta.'); };
  }

  async function avviaProvaRuntimeModelLab() {
    const runtimeId = state.modelLab.selectedRuntime;
    const modelId = state.modelLab.selectedRuntimeModel;
    if (!runtimeId || !modelId) return;
    const runButton = $('#modelLabRunButton');
    const cancelButton = $('#modelLabCancelButton');
    runButton.disabled = true;
    cancelButton.hidden = false;
    $('#modelLabStream')?.replaceChildren(textElement('p', 'model-lab-empty', 'Avvio della sessione locale…'));
    try {
      const tasks = await apiGet('/api/v1/tasks');
      const taskId = tasks?.items?.[0]?.id;
      if (!taskId) {
        aggiungiBloccoStreamModelLab('error', 'Prova non disponibile', 'In questa installazione non ci sono ancora attività pronte per la prova. Puoi usare una sessione personalizzata oppure aprire Doctor per vedere cosa manca.');
        cancelButton.hidden = true;
        runButton.disabled = false;
        return;
      }
      const runtimeState = state.modelLab.runtimes.find((runtime) => runtime.runtimeId === runtimeId)?.runtimeState;
      if (runtimeId === 'llama.cpp' && runtimeState !== 'ready') await apiPost('/api/v1/runtime/load', { runtimeId, modelId });
      const data = await apiPost('/api/v1/sessions', { taskId, provider: 'local', runtimeId, modelId });
      state.modelLab.runtimeSessionId = data.sessionId;
      collegaEventiProvaModelLab(data.sessionId);
    } catch (error) {
      aggiungiBloccoStreamModelLab('error', 'Errore', error.message || 'Prova runtime non riuscita');
      cancelButton.hidden = true;
      runButton.disabled = false;
    }
  }

  async function annullaProvaRuntimeModelLab() {
    if (!state.modelLab.runtimeSessionId) return;
    try { await apiPost(`/api/v1/sessions/${encodeURIComponent(state.modelLab.runtimeSessionId)}/cancel`, {}); }
    catch (error) { aggiungiBloccoStreamModelLab('error', 'Errore', error.message || 'Annullamento non riuscito'); }
    state.modelLab.runtimeEventSource?.close();
    state.modelLab.runtimeEventSource = null;
    state.modelLab.runtimeSessionId = null;
    $('#modelLabCancelButton').hidden = true;
    $('#modelLabRunButton').disabled = false;
  }

  function renderizzaDettaglioModelLab(model) {
    const mount = $('#modelLabModelDetail');
    if (!mount) return;
    if (!model) {
      mount.replaceChildren(textElement('p', 'model-lab-empty', 'Seleziona un modello per vedere capacità osservate, contesto e prezzi.'));
      return;
    }
    mount.replaceChildren(
      textElement('span', 'eyebrow', 'Dettagli osservati'),
      textElement('h4', '', model.nome),
      textElement('code', 'model-lab-model-id', model.id),
      textElement('p', 'muted-copy', model.description || 'Il provider non ha fornito una descrizione.'),
      textElement('p', 'model-lab-detail-row', `Provider · ${model.provider}`),
      textElement('p', 'model-lab-detail-row', `Contesto · ${formattaContestoModelLab(model.contextLength)}`),
      textElement('p', 'model-lab-detail-row', `Input · ${model.inputModalities?.join(', ') || 'non dichiarato'}`),
      textElement('p', 'model-lab-detail-row', `Output · ${model.outputModalities?.join(', ') || 'non dichiarato'}`),
      textElement('p', 'model-lab-detail-row', `Parametri · ${model.supportedParameters?.join(', ') || 'non dichiarati'}`),
      textElement('p', 'model-lab-detail-row', `Prezzo input · ${model.prezzoPrompt ?? 'non dichiarato'}`),
      textElement('p', 'model-lab-detail-row', `Prezzo output · ${model.prezzoCompletion ?? 'non dichiarato'}`),
    );
  }

  function filtraCatalogoModelLab() {
    const { catalog } = state.modelLab;
    if (!catalog?.modelli) return [];
    const query = state.modelLab.search.trim().toLowerCase();
    return catalog.modelli.filter((model) => {
      const matchesQuery = !query || [model.id, model.nome, model.provider].some((value) => String(value || '').toLowerCase().includes(query));
      return matchesQuery && (state.modelLab.provider === 'all' || model.provider === state.modelLab.provider);
    });
  }

  function renderizzaCatalogoModelLab() {
    const list = $('#modelLabCatalogList');
    const count = $('#modelLabCatalogCount');
    if (!list || !count) return;
    if (state.modelLab.catalogError) {
      list.replaceChildren(textElement('p', 'model-lab-empty', `Catalogo non disponibile: ${state.modelLab.catalogError.message}`));
      count.textContent = 'Catalogo non disponibile';
      renderizzaDettaglioModelLab(null);
      return;
    }
    const filtered = filtraCatalogoModelLab();
    count.textContent = state.modelLab.catalog ? `${filtered.length} di ${state.modelLab.catalog.modelli.length} modelli osservati` : 'Catalogo non caricato';
    list.replaceChildren();
    if (!state.modelLab.catalog) { list.appendChild(textElement('p', 'model-lab-empty', 'Apri questa sezione per caricare il catalogo reale.')); return; }
    if (filtered.length === 0) { list.appendChild(textElement('p', 'model-lab-empty', 'Nessun modello corrisponde ai filtri.')); renderizzaDettaglioModelLab(null); return; }
    for (const model of filtered.slice(0, 120)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'model-lab-list-item'; button.setAttribute('aria-selected', String(state.modelLab.selectedModel?.id === model.id));
      button.append(textElement('strong', '', model.nome), textElement('small', '', `${model.provider} · ${model.id}${model.contextLength ? ` · ${Math.round(model.contextLength / 1000)}k ctx` : ''}`));
      button.addEventListener('click', () => { state.modelLab.selectedModel = model; renderizzaCatalogoModelLab(); renderizzaDettaglioModelLab(model); });
      list.appendChild(button);
    }
    if (!state.modelLab.selectedModel || !filtered.some((model) => model.id === state.modelLab.selectedModel.id)) {
      state.modelLab.selectedModel = filtered[0];
      renderizzaDettaglioModelLab(filtered[0]);
    }
  }

  /*
   * ⭐⭐⭐ 02/9 — «pulsanti che liberano la RAM» (owner). La ricerca ha
   * spostato il progetto rispetto alla richiesta letterale, e vale la pena
   * scriverlo qui:
   *
   * ⛔ NON si uccidono processi. Le fonti sulla sicurezza sono esplicite —
   * «do not force-close processes with names you do not recognize», «if you
   * cannot explain what a process does, do not kill it», e terminare un
   * processo di sistema (svchost, lsass) porta a un BSOD immediato. Il
   * progetto ha già pagato questa lezione con la sorveglianza che due volte
   * stava per uccidere la sessione VIVA dell'owner
   * ([[il-guardiano-accusava-la-sessione-dellowner]]).
   *
   * ⭐ E nessuno dei runtime affermati lo fa: Ollama (`ollama stop`,
   * `keep_alive: 0`) e LM Studio (`lms unload --all`) liberano memoria
   * SCARICANDO IL MODELLO, non terminando processi altrui. È anche la leva
   * che conta davvero: su questa macchina il modello 27B pesa 15,3 GB di
   * pesi — più di qualunque altra cosa si potrebbe chiudere.
   *
   * ⇒ Qui: si MISURA (la ricerca dice «start by checking what is using
   * memory», non dal kill), si mostra quanto ne tiene TALOS, e si offre un
   * pulsante che libera quella — l'unica memoria di cui siamo padroni.
   */
  function aggiornaPannelloMemoria() {
    const capacita = state.modelLab.capacity;
    const barra = $('#memoriaBarraUsata');
    const etichetta = $('#memoriaBarraEtichetta');
    const tenuta = $('#memoriaTenuta');
    const bottone = $('#memoriaScarica');
    if (!etichetta) return;
    const totale = capacita?.memory?.totalBytes;
    const libera = capacita?.memory?.freeBytes;
    if (!Number.isFinite(totale) || !Number.isFinite(libera) || totale <= 0) {
      etichetta.textContent = 'Memoria non misurata.';
      if (barra) barra.style.width = '0%';
      if (bottone) bottone.disabled = true;
      return;
    }
    const usata = Math.max(0, totale - libera);
    const percentuale = Math.min(100, Math.round((usata / totale) * 100));
    if (barra) {
      barra.style.width = `${percentuale}%`;
      // ⛔ Non solo il colore: la percentuale è scritta nell'etichetta qui sotto.
      barra.dataset.memoriaLivello = percentuale >= 90 ? 'critico' : percentuale >= 75 ? 'alto' : 'ok';
    }
    etichetta.textContent = `${formattaByteModelLab(usata)} in uso su ${formattaByteModelLab(totale)} · ${formattaByteModelLab(libera)} liberi (${percentuale}%)`;
    /*
     * ⛔ Quanto ne tiene TALOS si dichiara solo se un modello è DAVVERO
     * caricato: `runtimes` riporta lo stato osservato del runtime locale.
     * Senza quel dato non si scrive una stima — sarebbe un numero inventato
     * proprio dove la persona sta per premere un pulsante.
     */
    /*
     * ⛔⛔⛔ 02/9 (notte) — QUI leggevo due proprietà del runtime con nomi
     * che mi ero INVENTATO (una in italiano e una in inglese, in cascata
     * con `||`): nessuna delle due esiste nella risposta del server.
     * ⛔ Il nome esatto non si ripete qui apposta: un test lo vieta, e
     * citarlo alla lettera lo farebbe scattare sulla documentazione invece
     * che sul codice — è già successo due volte stanotte. Effetto: sempre `null`, pulsante disabilitato per
     * sempre, funzione morta — e la prova dal vivo non l'ha vista perché
     * «disabilitato» sembrava l'esito giusto (nessun modello era
     * caricato). Trovato solo caricandone uno DAVVERO.
     * ⇒ Il fatto osservabile è `runtimeState`: il supervisor dichiara
     * `ready` quando il runtime è su con un modello dentro. Il server non
     * espone QUALE modello sia (status() dà stato, porta e baseUrl), e
     * quindi non lo si scrive: si dice che c'è, non si inventa il nome.
     */
    const runtimeLocale = (state.modelLab.runtimes || []).find((r) => r.runtimeId === 'llama.cpp');
    const runtimeCarico = runtimeLocale?.runtimeState === 'ready';
    if (tenuta) {
      tenuta.hidden = false;
      tenuta.textContent = runtimeCarico
        ? 'TALOS tiene in memoria il runtime locale con un modello caricato.'
        : 'TALOS non tiene nessun modello in memoria adesso.';
    }
    if (bottone) bottone.disabled = !runtimeCarico;
  }

  async function liberaMemoriaModello() {
    const bottone = $('#memoriaScarica');
    const originale = bottone?.textContent;
    if (bottone) { bottone.disabled = true; bottone.textContent = 'Liberazione…'; }
    const primaLiberi = state.modelLab.capacity?.memory?.freeBytes;
    try {
      /*
       * ⛔ 02/9 (notte) — il corpo era `{}` e la rotta rispondeva SEMPRE
       * QUERY_INVALID: pretende `runtimeId`. Il pulsante non avrebbe mai
       * funzionato. `modelId` non si manda perche' il server non espone
       * quale modello sia caricato e l'implementazione lo ignora — la
       * rotta e' stata corretta per non chiederlo piu' (vedi http-app.mjs).
       */
      await apiPost('/api/v1/runtime/unload', { runtimeId: 'llama.cpp' });
      // ⭐ Si RIMISURA subito: il risultato si dichiara con i byte veri
      // liberati, non con un «fatto» generico.
      state.modelLab.capacity = null;
      await caricaCapacitaMacchina();
      // ⛔ Anche lo stato del runtime va riletto: senza, il pulsante
      // resterebbe abilitato su un runtime che ormai e' spento.
      await caricaRuntimeModelLab();
      const dopoLiberi = state.modelLab.capacity?.memory?.freeBytes;
      const guadagno = (Number.isFinite(primaLiberi) && Number.isFinite(dopoLiberi)) ? dopoLiberi - primaLiberi : null;
      toast('Memoria liberata', guadagno && guadagno > 0
        ? `${formattaByteModelLab(guadagno)} tornati disponibili.`
        : 'Modello scaricato. La misura di sistema può aggiornarsi con qualche secondo di ritardo.');
    } catch (error) {
      toast('Memoria non liberata', error.message || 'Il runtime locale non ha risposto.');
    } finally {
      if (bottone) { bottone.textContent = originale || 'Libera la memoria del modello'; }
      aggiornaPannelloMemoria();
    }
  }

  async function caricaCapacitaMacchina() {
    if (state.modelLab.loadingCapacity || state.modelLab.capacity) return;
    state.modelLab.loadingCapacity = true;
    try {
      const data = await apiGet('/api/v1/model-lab/capacity');
      state.modelLab.capacity = data;
      const set = (id, value) => { const el = $(`#${id}`); if (el) el.textContent = value; };
      set('machineCapacityStatus', 'Misurata');
      set('machineMemoryMetric', formattaByteModelLab(data.memory?.totalBytes));
      set('machineFreeMemoryMetric', formattaByteModelLab(data.memory?.freeBytes));
      set('machineStorageMetric', formattaByteModelLab(data.storage?.availableBytes));
      set('machineAllocatableMetric', formattaByteModelLab(data.storage?.allocatableBytes));
      set('machineCapacityDetail', `${data.platform || 'host'} · ${data.arch || 'arch'} · ${new Date(data.measuredAt).toLocaleTimeString()}`);
      aggiornaPannelloMemoria();
    } catch (error) {
      const el = $('#machineCapacityStatus'); if (el) el.textContent = 'Non disponibile';
      const detail = $('#machineCapacityDetail'); if (detail) detail.textContent = error.message || 'Misura non disponibile';
    } finally { state.modelLab.loadingCapacity = false; }
  }

  async function caricaCatalogoModelLab({ forza = false } = {}) {
    if (state.modelLab.loadingCatalog) return;
    state.modelLab.loadingCatalog = true;
    state.modelLab.catalogError = null;
    renderizzaCatalogoModelLab();
    try {
      state.modelLab.catalog = await apiGet(`/api/v1/models${forza ? '?forza=1' : ''}`);
      const providers = [...new Set(state.modelLab.catalog.modelli.map((model) => model.provider))].sort();
      const select = $('#modelLabProviderFilter');
      if (select) {
        const current = state.modelLab.provider;
        select.replaceChildren(new Option('Tutti i provider', 'all'), ...providers.map((provider) => new Option(provider, provider)));
        select.value = providers.includes(current) ? current : 'all';
        state.modelLab.provider = select.value;
      }
      const status = $('#modelLabCatalogStatus'); if (status) status.textContent = `${state.modelLab.catalog.modelli.length} modelli osservati`;
      renderizzaCatalogoModelLab();
    } catch (error) {
      state.modelLab.catalogError = error;
      renderizzaCatalogoModelLab();
    } finally { state.modelLab.loadingCatalog = false; }
  }

  function setModelLabSection(section) {
    state.modelLab.section = section;
    $$('[data-model-lab-tab]').forEach((tab) => { const active = tab.dataset.modelLabTab === section; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
    $$('[data-model-lab-panel]').forEach((panel) => { const active = panel.dataset.modelLabPanel === section; panel.classList.toggle('active', active); panel.hidden = !active; if (active) markMotionEnter(panel); });
    if (section === 'catalog' && !state.modelLab.catalog && !state.modelLab.catalogError) caricaCatalogoModelLab();
    if (section === 'installed' && !state.modelLab.loadingInstalled && state.modelLab.installed.length === 0 && !state.modelLab.installedError) caricaModelliLocaliModelLab();
    if (section === 'downloads') caricaDownloadModelLab();
  }

  const SETTINGS_SECTIONS = ['appearance', 'chat', 'models', 'providers', 'tools', 'privacy', 'workspace', 'account'];
  const SETTINGS_SECTION_STORAGE_KEY = 'talos.harness.desktop.settings.section.v1';

  /** List-detail Settings: una sola categoria visibile e un solo punto di verità per il tab attivo. */
  /*
   * ⭐⭐⭐ 02/09 — review complessiva, V14: cinque sezioni Settings erano un
   * paragrafo e un bottone. Ora mostrano lo stato VERO letto adesso: valori
   * di Aspetto per la chat, provider dal server (chiave sì/no, mai la chiave),
   * policy della sessione aperta, dati locali di questo browser (chiavi e
   * peso), workspace attivo. Niente scritto a mano: ogni riga viene da uno
   * stato o da una risposta del server.
   */
  const ETICHETTE_ASPETTO = {
    chatFontScale: { xcompact: 'Extra piccolo', compact: 'Compatto', default: 'Predefinito', large: 'Grande', xlarge: 'Extra grande' },
    messageStyle: { sections: 'Sezioni', bubbles: 'Bolle', plain: 'Piatto' },
    streamingAnimation: { fade: 'Dissolvenza', typewriter: 'Macchina da scrivere', none: 'Nessuna' },
    composerShape: { standard: 'Standard', compact: 'Compatto', classic: 'Classico' },
  };
  function riempiFatti(id, coppie) {
    const dl = $(`#${id}`);
    if (!dl) return;
    dl.replaceChildren(...coppie.map(([k, v]) => { const riga = document.createElement('div'); riga.append(textElement('dt', '', k), textElement('dd', '', v)); return riga; }));
  }
  async function renderSettingsRiepiloghi() {
    const impostazioni = leggiImpostazioniDesktop();
    const a = impostazioni.appearance;
    const etichetta = (gruppo, valore) => ETICHETTE_ASPETTO[gruppo]?.[valore] || String(valore);
    riempiFatti('settingsChatFacts', [
      ['Testo chat', etichetta('chatFontScale', a.chatFontScale)],
      ['Stile dei messaggi', etichetta('messageStyle', a.messageStyle)],
      ['Animazione risposta', etichetta('streamingAnimation', a.streamingAnimation)],
      ['Forma del composer', etichetta('composerShape', a.composerShape)],
      ['Chat a tutta larghezza', a.chatFullWidth ? 'Sì' : 'No'],
      ['Ragionamento mostrato', state.showReasoning ? 'Sì' : 'No'],
    ]);
    const regole = Object.keys(state.permessiPerAttrezzo || impostazioni.chat.permessiPerAttrezzo || {}).length;
    riempiFatti('settingsToolsFacts', [
      ['Policy attiva', String(state.permissions || impostazioni.chat.permissions || 'Workspace write')],
      ['Regole per attrezzo', regole === 0 ? 'Nessuna' : `${regole}`],
      ['Sessione', state.realSession.id ? (state.session || 'sessione aperta') : 'nessuna aperta: valgono i valori predefiniti'],
    ]);
    riempiFatti('settingsWorkspaceFacts', [
      ['Workspace attivo', state.realSession.cartellaAssoluta || (state.realSession.id ? 'in attesa del primo giro' : 'nessuna sessione aperta')],
      ['File scritti in questa sessione', String(state.realSession.reviewFiles.size)],
      ['Pagine lette in questa sessione', String(state.realSession.browserPagine.length)],
    ]);
    const privacy = $('#settingsPrivacyList');
    if (privacy) {
      const voci = [];
      try {
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const chiave = window.localStorage.key(i);
          if (!/^talos/i.test(chiave)) continue;
          voci.push([chiave, Buffer_len(window.localStorage.getItem(chiave) || '')]);
        }
      } catch { /* storage negato: la lista resta vuota, onestamente */ }
      privacy.replaceChildren(...(voci.length === 0
        ? [textElement('li', 'muted-copy', 'Nessuna preferenza TALOS salvata in questo browser.')]
        : voci.map(([chiave, byte]) => { const li = document.createElement('li'); li.append(textElement('code', '', chiave), textElement('span', 'muted-copy', ` · ${byte < 1024 ? `${byte} B` : `${(byte / 1024).toFixed(1)} KB`}`)); return li; })));
    }
    const lista = $('#settingsProvidersList');
    if (lista) {
      try {
        const risposta = await apiGet('/api/v1/providers');
        const provider = risposta.items || risposta.providers || (Array.isArray(risposta) ? risposta : []);
        lista.replaceChildren(...provider.map((p) => {
          const li = document.createElement('li');
          const stato = p.execution === 'local' || p.requiresKey === false
            ? (p.endpointConfigured ? `indirizzo impostato: ${p.endpoint}` : 'locale, nessuna chiave richiesta')
            : (p.keyConfigured ? 'chiave configurata sul server' : 'nessuna chiave');
          li.append(textElement('strong', '', p.label || p.id), textElement('span', `settings-provider-state ${p.keyConfigured || p.endpointConfigured ? 'is-ok' : ''}`, stato));
          return li;
        }));
        if (provider.length === 0) lista.replaceChildren(textElement('li', 'muted-copy', 'Il server non espone provider.'));
      } catch {
        lista.replaceChildren(textElement('li', 'muted-copy', 'Stato provider non leggibile adesso: il server locale non risponde.'));
      }
    }
  }
  function Buffer_len(testo) { return new TextEncoder().encode(testo).length; }

  function setSettingsSection(section, { persist = true } = {}) {
    queueMicrotask(() => { void renderSettingsRiepiloghi(); }); // 02/09 — i riepiloghi si rileggono a ogni cambio sezione
    const selected = SETTINGS_SECTIONS.includes(section) ? section : 'appearance';
    state.settingsSection = selected;
    $$('[data-settings-tab]').forEach((tab) => {
      const active = tab.dataset.settingsTab === selected;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    $$('[data-settings-panel]').forEach((panel) => {
      const active = panel.dataset.settingsPanel === selected;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
      if (active) markMotionEnter(panel);
    });
    if (persist) {
      try { window.localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, selected); } catch { /* preferenza non bloccante */ }
    }
    if (selected === 'models' && !state.modelLab.initialized) inizializzaModelLab();
  }

  function inizializzaSettingsNavigation() {
    $$('[data-settings-tab]').forEach((tab) => {
      tab.addEventListener('click', () => setSettingsSection(tab.dataset.settingsTab));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = SETTINGS_SECTIONS.indexOf(tab.dataset.settingsTab);
        const next = event.key === 'Home' ? 0
          : event.key === 'End' ? SETTINGS_SECTIONS.length - 1
            : (current + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
        const nextTab = document.querySelector(`[data-settings-tab="${SETTINGS_SECTIONS[next]}"]`);
        setSettingsSection(SETTINGS_SECTIONS[next]);
        nextTab?.focus();
      });
    });
    $$('[data-settings-go]').forEach((button) => button.addEventListener('click', () => {
      setSettingsSection(button.dataset.settingsGo);
      if (button.dataset.modelLabGo) setModelLabSection(button.dataset.modelLabGo);
    }));
    let saved = null;
    try { saved = window.localStorage.getItem(SETTINGS_SECTION_STORAGE_KEY); } catch { /* default appearance */ }
    setSettingsSection(saved || 'appearance', { persist: false });
  }

  async function cercaHuggingFaceModelLab({ append = false } = {}) {
    const search = $('#modelLabHfSearch', $('#modelLabCard'))?.value?.trim() || '';
    state.modelLab.hfQuery = search;
    if (!append) state.modelLab.hfCursor = null;
    state.modelLab.hfError = null;
    const sort = $('#modelLabHfSortControl')?.value || 'downloads';
    const author = $('#modelLabHfAuthorControl')?.value?.trim() || '';
    const filters = ($('#modelLabHfFiltersControl')?.value || '').split(',').map((value) => value.trim()).filter(Boolean).slice(0, 8);
    const status = $('#modelLabHfStatus'); if (status) status.textContent = 'Ricerca in corso...';
    try {
      const params = new URLSearchParams({ query: state.modelLab.hfQuery, limit: '20', sort, direction: '-1' });
      if (state.modelLab.hfCursor) params.set('cursor', state.modelLab.hfCursor);
      if (author) params.set('author', author);
      for (const filter of filters) params.append('filter', filter);
      const data = await apiGet(`/api/v1/huggingface/search?${params}`);
      state.modelLab.hfResults = append ? [...state.modelLab.hfResults, ...(data.items || [])] : (data.items || []);
      state.modelLab.hfCursor = data.nextCursor || null;
      if (status) status.textContent = `${state.modelLab.hfResults.length} repository osservati`;
    } catch (error) { state.modelLab.hfError = error; if (!append) state.modelLab.hfResults = []; if (status) status.textContent = 'Ricerca non disponibile'; }
    const next = $('#modelLabHfNextButtonControl'); if (next) next.hidden = !state.modelLab.hfCursor;
    renderizzaHfRisultatiModelLab();
  }

  function inizializzaModelLab() {
    if (state.modelLab.initialized) return;
    state.modelLab.initialized = true;
    ensureModelLabControls();
    $$('[data-model-lab-tab]').forEach((tab) => tab.addEventListener('click', () => setModelLabSection(tab.dataset.modelLabTab)));
    $('#modelLabSearch')?.addEventListener('input', (event) => { state.modelLab.search = event.target.value; renderizzaCatalogoModelLab(); });
    $('#modelLabProviderFilter')?.addEventListener('change', (event) => { state.modelLab.provider = event.target.value; renderizzaCatalogoModelLab(); });
    $('#modelLabRefreshButton')?.addEventListener('click', () => caricaCatalogoModelLab({ forza: true }));
    $('#modelLabRuntimeRefresh')?.addEventListener('click', () => caricaRuntimeModelLab());
    // ⭐ 02/9 — pannello memoria: rimisura e liberazione (vedi il commento su
    // aggiornaPannelloMemoria per perché NON si uccidono processi).
    $('#memoriaRimisura')?.addEventListener('click', async () => { state.modelLab.capacity = null; await caricaCapacitaMacchina(); await caricaRuntimeModelLab(); });
    $('#memoriaScarica')?.addEventListener('click', () => { void liberaMemoriaModello(); });
    $('#modelLabRuntimeSelect')?.addEventListener('change', (event) => { state.modelLab.selectedRuntime = event.target.value; state.modelLab.selectedRuntimeModel = ''; renderizzaRuntimeModelLab(); });
    $('#modelLabModelSelect')?.addEventListener('change', (event) => { state.modelLab.selectedRuntimeModel = event.target.value; renderizzaRuntimeModelLab(); });
    $('#modelLabRunButton')?.addEventListener('click', () => avviaProvaRuntimeModelLab());
    $('#modelLabCancelButton')?.addEventListener('click', () => annullaProvaRuntimeModelLab());
    $('#modelLabHfSearchButton')?.addEventListener('click', () => cercaHuggingFaceModelLab());
    $('#modelLabHfSearch')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') cercaHuggingFaceModelLab(); });
    $('#modelLabHfNextButtonControl')?.addEventListener('click', () => cercaHuggingFaceModelLab({ append: true }));
    $('#modelLabInstalledSearchControl')?.addEventListener('input', (event) => { state.modelLab.installedSearch = event.target.value; renderizzaModelliLocaliModelLab(); });
    $$('[data-provider-toggle]').forEach((toggle) => toggle.addEventListener('click', () => {
      const card = toggle.closest('[data-provider-id]');
      const detail = card?.querySelector('[data-provider-detail]');
      if (!detail) return;
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      detail.hidden = expanded;
      card?.classList.toggle('is-expanded', !expanded);
      if (!expanded) markMotionEnter(detail);
    }));
    $$('[data-provider-action]').forEach((button) => button.addEventListener('click', () => gestisciAzioneProvider(button)));
    caricaCapacitaMacchina();
    caricaRuntimeModelLab();
    caricaModelliLocaliModelLab();
    caricaProviderModelLab();
    const runButton = $('#modelLabRunButton');
    if (runButton) runButton.dataset.disabledReason = 'Seleziona un runtime osservato e un modello';
    setModelLabSection('overview');
  }

  /** ⭐ 26/8, riconciliazione desktop→mobile — stesso contratto envelope di apiGet, per POST /api/v1/sessions/*. */
  async function apiPost(pathname, body) {
    const response = await fetch(API(pathname), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      const error = new Error('Risposta locale non valida');
      error.code = 'INTERNAL_ERROR';
      throw error;
    }
    if (!response.ok || !envelope?.ok) {
      const error = new Error(envelope?.error?.message || 'Richiesta locale non riuscita');
      error.code = envelope?.error?.code || 'INTERNAL_ERROR';
      throw error;
    }
    return envelope.data;
  }

  /**
   * ⭐ 27/8 — blocco Settings/diagnostica: il pulsante Doctor mostrava
   * SEMPRE "Doctor: Healthy", hardcoded in due punti, indipendentemente
   * da qualunque stato reale del sistema (owner: "analizza bene...
   * eliminare tutti i mockup"). Ora legge GET /api/v1/doctor — i 4
   * controlli VERI di harness-ui/src/doctor.mjs (chiave API, shell
   * sandboxato via la stessa eseguiComandoSandboxato che l'attrezzo
   * `shell` usa davvero, git, naviga) — e riporta onestamente cosa
   * manca, mai un bluff.
   */
  function riassuntoDoctor(risultato) {
    const problemi = [];
    if (!risultato.chiaveApi) problemi.push('chiave API assente');
    if (risultato.shell !== 'wsl2') problemi.push('ambiente di lavoro da controllare');
    if (!risultato.git) problemi.push('git non trovato');
    if (!risultato.naviga) problemi.push('browser non disponibile');
    if (risultato.cartelleProgetto && !risultato.cartelleProgetto.disponibili) problemi.push('nessuna cartella di progetto disponibile');
    if (risultato.ownerRuntime && !risultato.ownerRuntime.pronto) problemi.push('servizio agente non pronto');
    if (risultato.catalogoTask && !risultato.catalogoTask.disponibile) problemi.push('attività predefinite non disponibili');
    if (risultato.sessioniPersistenza?.corrotte?.length) problemi.push(`${risultato.sessioniPersistenza.corrotte.length} sessione da controllare`);
    return problemi.length === 0
      ? { badge: 'Healthy', dettaglio: `Chiave API ok · ambiente ${risultato.shell} · git ok · browser ok · agente pronto.` }
      : { badge: `${problemi.length} da rivedere`, dettaglio: `${problemi.join(' · ')}.` };
  }

  /** Aggiorna lo stato accanto al bottone Doctor dentro il foglio "control", se è aperto — stesso principio di refresh automatico già in uso per le Automazioni. */
  async function refreshDoctorBadge() {
    const badgeEl = $('[data-doctor-status]', sheetBody);
    if (!badgeEl) return;
    try {
      badgeEl.textContent = riassuntoDoctor(await apiGet('/api/v1/doctor')).badge;
    } catch {
      badgeEl.textContent = 'Non disponibile';
    }
  }

  async function eseguiDoctor() {
    let risultato;
    try {
      risultato = await apiGet('/api/v1/doctor');
    } catch (error) {
      toast('Doctor non disponibile', error.message);
      return;
    }
    const { badge, dettaglio } = riassuntoDoctor(risultato);
    toast(`Doctor: ${badge}`, dettaglio);
    const badgeEl = $('[data-doctor-status]', sheetBody);
    if (badgeEl) badgeEl.textContent = badge;
  }

  /**
   * ⭐⭐⭐ 28/8 — FASE A (hook), piano `elegant-spinning-dongarra.md`.
   * Riempie `#hooksListMount` nel foglio "control" con gli hook VERI
   * del progetto della sessione attiva — mai un contatore inventato.
   * Nessuna sessione attiva → stato onesto, ZERO richiesta di rete
   * (stessa disciplina "niente fetch fantasma" di ogni altra superficie
   * di questo bundle). Ri-chiamata dopo ogni "Fida" riuscita, cosi' il
   * bottone sparisce subito — non serve richiudere/riaprire il foglio.
   */
  async function caricaPannelloHooks() {
    const mount = $('#hooksListMount', sheetBody);
    if (!mount) return; // il foglio "control" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva — apri o avvia un task per vedere gli hook del progetto.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico gli hook…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/hooks`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Hook non disponibili: ${error.message}`));
      return;
    }
    if (mount !== $('#hooksListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.harness-ui-hooks.json non valido: ${dati.errore}`));
      return;
    }
    if (!dati.hooks || dati.hooks.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessun hook dichiarato in questo progetto (.harness-ui-hooks.json).'));
      return;
    }
    mount.replaceChildren(...dati.hooks.map((hook) => rigaHook(hook)));
  }

  /*
   * ⭐⭐⭐ FASE C (28/8) — sub-agenti: il foglio "Albero sessione" mostrava
   * due righe INVENTATE ("Responsive audit"/"A11y review", mai
   * collegate a nulla). Stesso pattern di caricaPannelloHooks() appena
   * sopra: fetch reale, guardia anti-gara se il foglio cambia mentre la
   * fetch è in volo.
   */
  async function caricaAlberoSessione() {
    const mount = $('#subagentTreeMount', sheetBody);
    if (!mount) return; // il foglio "sessionTree" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico le deleghe…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/children`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Deleghe non disponibili: ${error.message}`));
      return;
    }
    if (mount !== $('#subagentTreeMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (!dati.figli || dati.figli.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna delega ancora — TALOS la avvia da sé con l\'attrezzo delega_sottotask quando un sotto-task è genuinamente separabile.'));
      return;
    }
    mount.replaceChildren(...dati.figli.map((figlio) => rigaFiglio(figlio)));
  }

  /** Una riga figlio — stesso idioma `.sheet-option` di rigaHook, cliccabile → passaASessione (una delega conclusa è una sessione reale come le altre). */
  function rigaFiglio(figlio) {
    const riga = document.createElement('button');
    riga.type = 'button';
    riga.className = 'sheet-option';
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon('i-branch');
    const testo = document.createElement('span');
    const successo = figlio.conclusa && figlio.esitoDelega === 'concluso';
    const fallita = figlio.conclusa && figlio.esitoDelega === 'fallito';
    testo.append(
      textElement('strong', null, tronca(figlio.task || '(compito non registrato)', 60)),
      textElement('small', null, figlio.conclusa ? `Delega · ${figlio.esitoDelega || 'conclusa'}` : 'Delega · in corso'),
    );
    const statoEl = textElement('span', successo ? 'status-chip success' : fallita ? 'status-chip error' : 'status-chip', successo ? '✓' : fallita ? '!' : '●');
    riga.append(iconEl, testo, statoEl);
    riga.addEventListener('click', () => {
      passaASessione(figlio.sessionId, figlio.sessionId, figlio.task);
      closeEmbeddedDialog(sheetDialog);
    });
    return riga;
  }

  /** Una riga hook — stesso idioma `.sheet-option` delle altre righe del Control plane. */
  function rigaHook(hook) {
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon('i-bolt');
    const testo = document.createElement('span');
    testo.append(
      textElement('strong', null, hook.id),
      textElement('small', null, hook.eventi.join(', ')),
    );
    let statoEl;
    if (hook.fidato) {
      statoEl = textElement('span', 'status-chip success', 'attivo');
    } else {
      const bottone = document.createElement('button');
      bottone.type = 'button';
      bottone.className = 'secondary-btn';
      bottone.textContent = 'Fida';
      bottone.addEventListener('click', async () => {
        bottone.disabled = true;
        bottone.textContent = 'Fido…';
        try {
          await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/hooks/${encodeURIComponent(hook.id)}/trust`, {});
          toast('Hook fidato', hook.id);
          caricaPannelloHooks();
        } catch (error) {
          bottone.disabled = false;
          bottone.textContent = 'Fida';
          toast('Non riuscito', error.message);
        }
      });
      statoEl = bottone;
    }
    riga.append(iconEl, testo, statoEl);
    return riga;
  }

  /**
   * ⭐⭐⭐ 29/8 — FASE E, piano `elegant-spinning-dongarra.md`. Stesso
   * identico pattern di caricaPannelloHooks() appena sopra, per i
   * server MCP: riempie `#mcpListMount` nel foglio "capabilities" coi
   * server VERI dichiarati dal progetto della sessione attiva — mai un
   * contatore inventato, mai una connessione reale solo per mostrare
   * l'elenco (quella parte vive in mcp-session.mjs, usata quando la
   * sessione lavora per davvero).
   */
  async function caricaPannelloMcp() {
    const mount = $('#mcpListMount', sheetBody);
    if (!mount) return; // il foglio "capabilities" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva — apri o avvia un task per vedere i server MCP del progetto.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico i server MCP…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/mcp`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Server MCP non disponibili: ${error.message}`));
      return;
    }
    if (mount !== $('#mcpListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.harness-ui-mcp.json non valido: ${dati.errore}`));
      return;
    }
    if (!dati.server || dati.server.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessun server MCP dichiarato in questo progetto (.harness-ui-mcp.json).'));
      return;
    }
    mount.replaceChildren(...dati.server.map((server) => rigaServerMcp(server)));
  }

  /**
   * ⭐⭐⭐ 29/8 — FASE F, piano `elegant-spinning-dongarra.md`. Stesso
   * identico pattern di caricaPannelloMcp() appena sopra, per le
   * skill — più semplice: nessun bottone "Fida" (le skill non hanno
   * un gate di fiducia, vedi skill-registry.mjs).
   */
  async function caricaPannelloSkill() {
    const mount = $('#skillsListMount', sheetBody);
    if (!mount) return; // il foglio "capabilities" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva — apri o avvia un task per vedere le skill del progetto.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico le skill…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/skills`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Skill non disponibili: ${error.message}`));
      return;
    }
    if (mount !== $('#skillsListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.harness-ui-skills non valido: ${dati.errore}`));
      return;
    }
    if (!dati.skills || dati.skills.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna skill dichiarata in questo progetto (.harness-ui-skills/).'));
      return;
    }
    mount.replaceChildren(...dati.skills.map((skill) => rigaSkill(skill)));
  }

  /**
   * ⭐⭐⭐ 29/8 — FASE N, piano `elegant-spinning-dongarra.md`. Stesso
   * identico pattern di caricaPannelloSkill() appena sopra — nessun
   * bottone "Fida" (una voce di Libreria non ha un gate di fiducia,
   * vedi library-store.mjs).
   */
  async function caricaPannelloLibreria() {
    const mount = $('#libraryListMount', sheetBody);
    if (!mount) return; // il foglio "capabilities" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva — apri o avvia un task per vedere la Libreria del progetto.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico la Libreria…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/library`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Libreria non disponibile: ${error.message}`));
      return;
    }
    if (mount !== $('#libraryListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.harness-ui-library non valida: ${dati.errore}`));
      return;
    }
    if (!dati.voci || dati.voci.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessun file in Libreria per questo progetto (.harness-ui-library/).'));
      return;
    }
    mount.replaceChildren(...dati.voci.map((voce) => rigaVoceLibreria(voce)));
  }

  /** ⭐⭐⭐ 29/8 — sempre attiva (una voce di Libreria non ha un gate di fiducia): niente bottone, solo il riassunto. */
  function rigaVoceLibreria(voce) {
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon(voce.fileType === 'image' ? 'i-image' : 'i-files');
    const testo = document.createElement('span');
    testo.append(
      textElement('strong', null, voce.nome),
      textElement('small', null, `${voce.origine === 'generated' ? 'Generato' : 'Caricato'} · ${voce.fileType}`),
    );
    riga.append(iconEl, testo, textElement('span', 'status-chip success', voce.origine === 'generated' ? 'generato' : 'caricato'));
    return riga;
  }

  /**
   * ⭐⭐⭐ FASE N, quarto sistema (30/8) — stesso identico pattern di
   * caricaPannelloLibreria() sopra. ⛔ Unica differenza reale: le note
   * sono GLOBALI (non del progetto della sessione attiva) — il testo
   * di stato onesto lo dice esplicitamente, mai lasciato ambiguo.
   */
  async function caricaPannelloNote() {
    const mount = $('#notesListMount', sheetBody);
    if (!mount) return; // il foglio "capabilities" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva — apri o avvia un task per vedere le Notes.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico le Notes…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/notes`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Notes non disponibili: ${error.message}`));
      return;
    }
    if (mount !== $('#notesListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.notes-store non valido: ${dati.errore}`));
      return;
    }
    if (!dati.note || dati.note.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna nota (.notes-store/, globale — non del progetto).'));
      return;
    }
    mount.replaceChildren(...dati.note.map((nota) => rigaNota(nota)));
  }

  /** ⭐⭐⭐ FASE N, quarto sistema (30/8) — sempre attiva (una nota non ha un gate di fiducia): niente bottone, solo il riassunto. */
  function rigaNota(nota) {
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon('i-files');
    const testo = document.createElement('span');
    testo.append(
      textElement('strong', null, nota.titolo),
      textElement('small', null, nota.contenuto.length > 80 ? `${nota.contenuto.slice(0, 80)}…` : nota.contenuto),
    );
    riga.append(iconEl, testo);
    return riga;
  }

  /**
   * ⭐⭐⭐ FASE N, quinto sistema (30/8) — stesso identico pattern di
   * caricaPannelloNote() sopra.
   */
  async function caricaPannelloAttivita() {
    const mount = $('#tasksListMount', sheetBody);
    if (!mount) return; // il foglio "capabilities" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva — apri o avvia un task per vedere i Tasks.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico i Tasks…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tasks`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Tasks non disponibili: ${error.message}`));
      return;
    }
    if (mount !== $('#tasksListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.tasks-store non valido: ${dati.errore}`));
      return;
    }
    if (!dati.attivita || dati.attivita.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna attività (.tasks-store/, globale — non del progetto).'));
      return;
    }
    mount.replaceChildren(...dati.attivita.map((attivita) => rigaAttivita(attivita)));
  }

  /** ⭐⭐⭐ FASE N, quinto sistema (30/8) — sempre attiva (un'attività non ha un gate di fiducia): niente bottone, lo stato al posto del riassunto — mai lo stesso status-chip "attivo" fisso delle skill, qui varia davvero (todo/doing/done). */
  function rigaAttivita(attivita) {
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon('i-files');
    const testo = document.createElement('span');
    testo.append(
      textElement('strong', null, attivita.titolo),
      textElement('small', null, `${attivita.priorita}${attivita.descrizione ? ` · ${attivita.descrizione}` : ''}`),
    );
    riga.append(iconEl, testo, textElement('span', `status-chip ${attivita.stato === 'done' ? 'success' : ''}`, attivita.stato));
    return riga;
  }

  /**
   * ⭐⭐⭐ FASE N, sesto sistema (30/8) — stesso identico pattern di
   * caricaPannelloAttivita() sopra.
   */
  async function caricaPannelloMemoria() {
    const mount = $('#memoryListMount', sheetBody);
    if (!mount) return; // il foglio "capabilities" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva — apri o avvia un task per vedere la Memory.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico la Memory…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/memory`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Memory non disponibile: ${error.message}`));
      return;
    }
    if (mount !== $('#memoryListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.memory-store non valido: ${dati.errore}`));
      return;
    }
    if (!dati.memorie || dati.memorie.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna memoria (.memory-store/, globale — non del progetto).'));
      return;
    }
    mount.replaceChildren(...dati.memorie.map((memoria) => rigaMemoria(memoria)));
  }

  /** ⭐⭐⭐ FASE N, sesto sistema (30/8) — sempre attiva (una memoria non ha un gate di fiducia): niente bottone, il genere al posto dell'origine. */
  function rigaMemoria(memoria) {
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon('i-bolt');
    const testo = document.createElement('span');
    testo.append(
      textElement('strong', null, memoria.titolo),
      textElement('small', null, memoria.contenuto.length > 80 ? `${memoria.contenuto.slice(0, 80)}…` : memoria.contenuto),
    );
    riga.append(iconEl, testo, textElement('span', 'status-chip success', memoria.genere));
    return riga;
  }

  /**
   * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research. Stesso pattern
   * ESATTO di caricaPannelloMemoria appena sopra — a DIFFERENZA di
   * Notes/Tasks/Memory (GLOBALI), Research è PER-PROGETTO come
   * Libreria: il messaggio "vuoto" lo dice, mai la frase "globale" già
   * usata per gli altri tre.
   */
  async function caricaPannelloRicerca() {
    const mount = $('#researchListMount', sheetBody);
    if (!mount) return; // il foglio "capabilities" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva — apri o avvia un task per vedere le Ricerche.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico le Ricerche…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/research`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Ricerche non disponibili: ${error.message}`));
      return;
    }
    if (mount !== $('#researchListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.harness-ui-research non valido: ${dati.errore}`));
      return;
    }
    if (!dati.ricerche || dati.ricerche.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna ricerca avviata in questo progetto.'));
      return;
    }
    mount.replaceChildren(...dati.ricerche.map((ricerca) => rigaRicerca(ricerca)));
  }

  /** ⭐⭐⭐ FASE N, ottavo sistema (30/8) — sempre attiva (una ricerca non ha un gate di fiducia): niente bottone, lo stato VIVO al posto dell'origine (running/paused/done/cancelled/failed — mai un fisso "attivo" come le skill). */
  function rigaRicerca(ricerca) {
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon('i-search');
    const testo = document.createElement('span');
    testo.append(
      textElement('strong', null, ricerca.titolo),
      textElement('small', null, String(ricerca.avviataAlle).slice(0, 10)),
    );
    riga.append(iconEl, testo, textElement('span', `status-chip ${ricerca.stato === 'done' ? 'success' : ''}`, ricerca.stato));
    return riga;
  }

  /**
   * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge. Stesso
   * pattern ESATTO di caricaPannelloMemoria appena sopra — a
   * DIFFERENZA di Notes/Tasks/Memory/Deep Research (mai una mutazione
   * owner-facing in tutta FASE N finora): un tool forgiato nasce
   * SEMPRE disabilitato (vedi la doc in tool-forge-store.mjs), quindi
   * il pannello porta l'UNICO controllo interattivo bidirezionale di
   * tutta la fase — un vero toggle, non un bottone "Fida" a senso
   * unico come MCP/Plugin.
   */
  async function caricaPannelloForge() {
    const mount = $('#forgeListMount', sheetBody);
    if (!mount) return; // il foglio "capabilities" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva — apri o avvia un task per vedere i tool forgiati.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico i tool forgiati…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tool-forge`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Tool forgiati non disponibili: ${error.message}`));
      return;
    }
    if (mount !== $('#forgeListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.tool-forge-store non valido: ${dati.errore}`));
      return;
    }
    if (!dati.strumenti || dati.strumenti.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessun tool forgiato (.tool-forge-store/, globale — non del progetto). Il modello ne crea uno con tool_create.'));
      return;
    }
    mount.replaceChildren(...dati.strumenti.map((strumento) => rigaToolForgiato(strumento)));
  }

  /**
   * ⭐⭐⭐⭐⭐ L'UNICA mutazione owner-facing di tutta FASE N — vedi la
   * doc in tool-forge-store.mjs sul perché: abilitare/disabilitare non
   * è mai un tool del modello, nemmeno sul mobile (station-only su
   * entrambe le piattaforme). Il bottone dice l'AZIONE ("Abilita"/
   * "Disabilita"), lo status-chip accanto dice lo STATO — due fatti
   * diversi, mai confusi in una sola etichetta.
   */
  function rigaToolForgiato(strumento) {
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon('i-settings');
    const testo = document.createElement('span');
    testo.append(
      textElement('strong', null, strumento.titolo),
      textElement('small', null, `${strumento.descrizione} · ${strumento.capacita.join(', ') || 'nessuna capacità'}`),
    );
    const statoEl = textElement('span', `status-chip ${strumento.abilitato ? 'success' : ''}`, strumento.abilitato ? 'abilitato' : 'disabilitato');
    const bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'secondary-btn';
    bottone.textContent = strumento.abilitato ? 'Disabilita' : 'Abilita';
    bottone.addEventListener('click', async () => {
      const prossimoStato = !strumento.abilitato;
      bottone.disabled = true;
      bottone.textContent = prossimoStato ? 'Abilito…' : 'Disabilito…';
      try {
        await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tool-forge/${encodeURIComponent(strumento.id)}/enable`, { abilitato: prossimoStato });
        toast(prossimoStato ? 'Tool abilitato' : 'Tool disabilitato', strumento.titolo);
        caricaPannelloForge();
      } catch (error) {
        bottone.disabled = false;
        bottone.textContent = strumento.abilitato ? 'Disabilita' : 'Abilita';
        toast('Non riuscito', error.message);
      }
    });
    riga.append(iconEl, testo, statoEl, bottone);
    return riga;
  }

  /** ⭐⭐⭐ 29/8 — sempre attiva (le skill non hanno un gate di fiducia): niente bottone, solo il riassunto. */
  function rigaSkill(skill) {
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon('i-bolt');
    const testo = document.createElement('span');
    testo.append(
      textElement('strong', null, skill.name),
      textElement('small', null, skill.description),
    );
    riga.append(iconEl, testo, textElement('span', 'status-chip success', 'attivo'));
    return riga;
  }

  /** ⭐⭐⭐ 29/8 — stesso identico pattern di rigaHook() appena sopra. */
  function rigaServerMcp(server) {
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon('i-link');
    const testo = document.createElement('span');
    testo.append(
      textElement('strong', null, server.id),
      textElement('small', null, `${server.comando} · tool: ${server.allowlist.join(', ')}`),
    );
    let statoEl;
    if (server.fidato) {
      statoEl = textElement('span', 'status-chip success', 'attivo');
    } else {
      const bottone = document.createElement('button');
      bottone.type = 'button';
      bottone.className = 'secondary-btn';
      bottone.textContent = 'Fida';
      bottone.addEventListener('click', async () => {
        bottone.disabled = true;
        bottone.textContent = 'Fido…';
        try {
          await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/mcp/${encodeURIComponent(server.id)}/trust`, {});
          toast('Server MCP fidato', server.id);
          caricaPannelloMcp();
        } catch (error) {
          bottone.disabled = false;
          bottone.textContent = 'Fida';
          toast('Non riuscito', error.message);
        }
      });
      statoEl = bottone;
    }
    riga.append(iconEl, testo, statoEl);
    return riga;
  }

  /**
   * ⭐⭐⭐ 29/8 — FASE G, piano `elegant-spinning-dongarra.md`. Stesso
   * identico pattern di caricaPannelloMcp() sopra, per i plugin —
   * riempie `#pluginsListMount` nel foglio "capabilities" coi plugin
   * VERI dichiarati dal progetto della sessione attiva (bottone "Fida"
   * come MCP: un plugin ESEGUE tool/hook, a differenza di una skill).
   */
  async function caricaPannelloPlugin() {
    const mount = $('#pluginsListMount', sheetBody);
    if (!mount) return; // il foglio "capabilities" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessuna sessione attiva — apri o avvia un task per vedere i plugin del progetto.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico i plugin…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/plugins`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Plugin non disponibili: ${error.message}`));
      return;
    }
    if (mount !== $('#pluginsListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.harness-ui-plugins/ non valido: ${dati.errore}`));
      return;
    }
    if (!dati.plugin || dati.plugin.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessun plugin dichiarato in questo progetto (.harness-ui-plugins/).'));
      return;
    }
    mount.replaceChildren(...dati.plugin.map((plugin) => rigaPlugin(plugin)));
  }

  /**
   * ⭐⭐⭐ 29/8 — stesso identico pattern di rigaServerMcp() sopra, con
   * un'aggiunta: gli AVVISI dello scanner (`elencaPlugin`,
   * session-registry.mjs → `scansionaPatternSospetti`, plugin-registry.mjs)
   * mostrati PRIMA del click "Fida" — mai un blocco, solo
   * informazione (vedi la doc lì sul perché un pattern scanner non è
   * un confine di sicurezza vero). Un plugin GIÀ fidato non li mostra
   * più: l'owner li ha già visti al momento della fiducia.
   */
  function rigaPlugin(plugin) {
    const wrapper = document.createElement('div');
    wrapper.className = 'plugin-panel-item';
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon('i-bolt');
    const testo = document.createElement('span');
    const pezzi = [];
    if (plugin.tools.length > 0) pezzi.push(`${plugin.tools.length} tool`);
    if (plugin.hooks.length > 0) pezzi.push(`${plugin.hooks.length} hook`);
    testo.append(
      textElement('strong', null, plugin.nome),
      textElement('small', null, `${plugin.descrizione}${pezzi.length ? ` · ${pezzi.join(', ')}` : ''}`),
    );
    let statoEl;
    if (plugin.fidato) {
      statoEl = textElement('span', 'status-chip success', 'attivo');
    } else {
      const bottone = document.createElement('button');
      bottone.type = 'button';
      bottone.className = 'secondary-btn';
      bottone.textContent = 'Fida';
      bottone.addEventListener('click', async () => {
        bottone.disabled = true;
        bottone.textContent = 'Fido…';
        try {
          await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/plugins/${encodeURIComponent(plugin.id)}/trust`, {});
          toast('Plugin fidato', plugin.id);
          caricaPannelloPlugin();
        } catch (error) {
          bottone.disabled = false;
          bottone.textContent = 'Fida';
          toast('Non riuscito', error.message);
        }
      });
      statoEl = bottone;
    }
    riga.append(iconEl, testo, statoEl);
    wrapper.append(riga);
    if (!plugin.fidato && plugin.avvisi?.length > 0) {
      const avvisi = document.createElement('div');
      avvisi.className = 'plugin-panel-warnings';
      avvisi.append(...plugin.avvisi.map((a) => textElement('span', 'status-chip error', `${a.origine}: ${a.avviso}`)));
      wrapper.append(avvisi);
    }
    return wrapper;
  }

  /**
   * ⭐⭐⭐ 27/8 — owner: "un picker per il modello, dropdown stilizzato
   * (l'abbiamo già fatto nel mobile)". Stesso pattern di
   * TalosMobileComposerModelPicker.vue (AVM/mobile/src/components/chat/),
   * adattato in vanilla JS: raggruppato per provider, cercabile, ogni
   * riga nome+id+contesto+prezzo, spunta sulla selezione — il catalogo
   * VERO di GET /api/v1/models (417 modelli OpenRouter oggi), non le 7
   * scorciatoie scritte a mano. Un errore di rete è dichiarato
   * (CATALOG_UNREACHABLE/CATALOG_UPSTREAM_ERROR), mai "zero modelli"
   * silenzioso — stessa disciplina del componente mobile.
   * @returns {{elemento: HTMLElement, getValore: () => string}}
   */
  /*
   * ⭐⭐⭐ 29/8 — FASE K, R2: `etichettaVuota` nuovo, opzionale — riusato
   * per il picker del planner ("Nessuno", owner: configurabile). Il picker
   * principale usa invece un invito neutro e non espone dettagli interni
   * del server prima della scelta esplicita.
   */
  function effortCompatibilePerModello(modello, effortCorrente = state.effort) {
    const capacita = modello?.reasoning;
    if (!capacita || typeof capacita !== 'object') return effortCorrente || null;

    const supportati = Array.isArray(capacita.supportedEfforts)
      ? capacita.supportedEfforts.filter((effort) => typeof effort === 'string' && effort !== 'none')
      : [];
    const effortPredefinito = typeof capacita.defaultEffort === 'string' && capacita.defaultEffort !== 'none'
      ? capacita.defaultEffort
      : null;
    const fallback = (effortPredefinito && (supportati.length === 0 || supportati.includes(effortPredefinito)))
      ? effortPredefinito
      : (supportati[0] || null);

    if (!effortCorrente) return capacita.mandatory ? fallback : null;
    if (effortCorrente === 'none') return capacita.mandatory ? fallback : 'none';
    if (supportati.length > 0 && !supportati.includes(effortCorrente)) {
      return capacita.mandatory ? fallback : (effortPredefinito || null);
    }
    return effortCorrente;
  }

  function creaModelPicker({ valoreIniziale = '', apriSubito = false, alSelezionato, etichettaVuota = 'Seleziona modello', aggiornaModelloPrincipale = true, sincronizzaSessione = false } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'model-picker';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sheet-input model-picker-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const triggerLabel = document.createElement('span');
    triggerLabel.className = 'model-picker-trigger-label';
    const chevronSpan = document.createElement('span');
    chevronSpan.className = 'model-picker-chevron';
    chevronSpan.innerHTML = icon('i-chevron');
    trigger.append(triggerLabel, chevronSpan);

    const panel = document.createElement('div');
    panel.className = 'model-picker-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'listbox');

    const searchLabel = document.createElement('label');
    searchLabel.className = 'model-picker-search';
    const searchIconSpan = document.createElement('span');
    searchIconSpan.innerHTML = icon('i-search');
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'sheet-input';
    searchInput.placeholder = 'Cerca modello o provider…';
    searchLabel.append(searchIconSpan, searchInput);

    const listEl = document.createElement('div');
    listEl.className = 'model-picker-list';

    const footer = document.createElement('div');
    footer.className = 'model-picker-footer';
    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'text-btn';
    const refreshIconSpan = document.createElement('span');
    refreshIconSpan.innerHTML = icon('i-history');
    refreshBtn.append(refreshIconSpan, document.createTextNode('Aggiorna'));
    const metaSpan = document.createElement('span');
    metaSpan.className = 'model-picker-meta';
    footer.append(refreshBtn, metaSpan);

    panel.append(searchLabel, listEl, footer);
    wrap.append(trigger, panel);

    let modelliCache = null;
    let valoreScelto = valoreIniziale;
    let aperto = false;
    let caricato = false;
    const gruppiAperti = new Set();

    function aggiornaTriggerLabel() {
      triggerLabel.textContent = valoreScelto || etichettaVuota;
    }

    function filtraModelli(query) {
      if (!modelliCache) return [];
      const q = query.trim().toLowerCase();
      if (!q) return modelliCache;
      return modelliCache.filter((m) => m.id.toLowerCase().includes(q) || m.nome.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q));
    }

    function raggruppaPerProvider(modelli) {
      const mappa = new Map();
      for (const m of modelli) {
        if (!mappa.has(m.provider)) mappa.set(m.provider, []);
        mappa.get(m.provider).push(m);
      }
      return [...mappa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }

    function renderLista() {
      const query = searchInput.value;
      if (!modelliCache) {
        listEl.replaceChildren(textElement('p', 'board-empty', 'Carico il catalogo da OpenRouter…'));
        return;
      }
      const filtrati = filtraModelli(query);
      if (filtrati.length === 0) {
        listEl.replaceChildren(textElement('p', 'board-empty', query.trim() ? `Nessun modello corrisponde a "${query.trim()}".` : 'Nessun modello disponibile.'));
        return;
      }
      const cercando = query.trim() !== '';
      const pezzi = [];
      for (const [provider, modelli] of raggruppaPerProvider(filtrati)) {
        const aprireGruppo = cercando || gruppiAperti.has(provider);
        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'model-picker-group-header';
        header.setAttribute('aria-expanded', String(aprireGruppo));
        const nameSpan = document.createElement('span');
        nameSpan.className = 'model-picker-group-name';
        nameSpan.textContent = provider;
        const countSpan = document.createElement('span');
        countSpan.className = 'model-picker-group-count';
        countSpan.textContent = String(modelli.length);
        const groupChevron = document.createElement('span');
        groupChevron.className = 'model-picker-group-chevron';
        groupChevron.innerHTML = icon('i-chevron');
        header.append(nameSpan, countSpan, groupChevron);
        header.addEventListener('click', () => {
          if (gruppiAperti.has(provider)) gruppiAperti.delete(provider); else gruppiAperti.add(provider);
          renderLista();
        });
        pezzi.push(header);
        if (!aprireGruppo) continue;
        for (const modello of modelli) {
          const opt = document.createElement('button');
          opt.type = 'button';
          opt.className = 'sheet-option model-picker-option';
          opt.setAttribute('role', 'option');
          opt.setAttribute('aria-selected', String(modello.id === valoreScelto));
          if (modello.id === valoreScelto) opt.classList.add('active');
          const iconWrap = document.createElement('span');
          iconWrap.className = 'sheet-icon';
          iconWrap.innerHTML = icon('i-brain');
          const textWrap = document.createElement('span');
          const dettagli = [];
          if (modello.alias) dettagli.push('ultima versione'); // ⭐ 27/8 — il gruppo è già quello giusto (senza ~), l'informazione "è un alias fluttuante" resta comunque visibile qui
          if (modello.contextLength) dettagli.push(`${Math.round(modello.contextLength / 1000)}k ctx`);
          if (modello.prezzoPrompt) dettagli.push(`$${(Number(modello.prezzoPrompt) * 1_000_000).toFixed(2)}/M in`);
          textWrap.append(
            textElement('strong', '', modello.nome),
            textElement('small', '', dettagli.length ? `${modello.id} · ${dettagli.join(' · ')}` : modello.id),
          );
          opt.append(iconWrap, textWrap);
          if (modello.id === valoreScelto) {
            const checkSpan = document.createElement('span');
            checkSpan.innerHTML = icon('i-check');
            opt.appendChild(checkSpan);
          }
          opt.addEventListener('click', async () => {
            const effortAlClick = state.effort;
            const prossimoEffort = aggiornaModelloPrincipale
              ? effortCompatibilePerModello(modello, effortAlClick)
              : effortAlClick;
            const applicaScelta = () => {
              valoreScelto = modello.id;
              if (aggiornaModelloPrincipale) {
                state.model = modello.id;
                // Se l'owner ha mosso lo slider mentre il salvataggio era in
                // corso, la sua scelta più recente è già accodata e vince.
                if (state.effort === effortAlClick) state.effort = prossimoEffort;
              }
              aggiornaTriggerLabel();
              if (aggiornaModelloPrincipale) {
                aggiornaPillolaModello();
                salvaPreferenzeChatDesktop();
              }
              chiudi();
              alSelezionato?.(modello.id);
            };

            // Su una sessione esistente il server è la fonte di verità. La
            // pillola non deve promettere un modello che il registro non ha
            // ancora accettato: mantiene il valore corrente finché la
            // scrittura durevole non è conclusa e resta aperta su errore.
            if (aggiornaModelloPrincipale && sincronizzaSessione && state.realSession.id) {
              if (panel.getAttribute('aria-busy') === 'true') return;
              panel.setAttribute('aria-busy', 'true');
              opt.disabled = true;
              try {
                await sincronizzaImpostazioniSessione({
                  modello: modello.id,
                  reasoning: prossimoEffort ? { effort: prossimoEffort } : null,
                });
                applicaScelta();
              } catch {
                valoreScelto = state.model || '';
                aggiornaTriggerLabel();
                renderLista();
              } finally {
                panel.removeAttribute('aria-busy');
                opt.disabled = false;
              }
              return;
            }
            applicaScelta();
          });
          pezzi.push(opt);
        }
      }
      listEl.replaceChildren(...pezzi);
    }

    async function carica({ forza = false } = {}) {
      listEl.replaceChildren(textElement('p', 'board-empty', 'Carico il catalogo da OpenRouter…'));
      try {
        const dati = await apiGet(`/api/v1/models${forza ? '?forza=1' : ''}`);
        modelliCache = dati.modelli;
        caricato = true;
        metaSpan.textContent = `${dati.modelli.length} modelli${dati.daCache ? ' · da cache' : ''}`;
        renderLista();
      } catch (error) {
        listEl.replaceChildren(textElement('p', 'board-empty', `Catalogo non disponibile: ${error.message}`));
        metaSpan.textContent = '';
      }
    }

    function apri() {
      aperto = true;
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      if (!caricato) carica();
      window.setTimeout(() => searchInput.focus(), 0);
    }
    function chiudi() {
      aperto = false;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', () => { if (aperto) chiudi(); else apri(); });
    searchInput.addEventListener('input', renderLista);
    refreshBtn.addEventListener('click', (event) => { event.preventDefault(); carica({ forza: true }); });
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        chiudi();
        trigger.focus();
      }
    });
    function onDocumentClick(event) {
      if (!wrap.isConnected) { document.removeEventListener('click', onDocumentClick); return; }
      // ⛔ NON wrap.contains(event.target): l'header di un gruppo, quando cliccato,
      // chiama renderLista() nel PROPRIO handler (bubble-phase) PRIMA che questo
      // ascoltatore su document veda l'evento — renderLista() fa
      // listEl.replaceChildren(...), che STACCA dal DOM il bottone appena cliccato.
      // contains() su un nodo staccato torna sempre false, quindi il click veniva
      // letto come "fuori dal pannello" e chiudeva tutto (bug reale, riprodotto e
      // diagnosticato dal vivo con un log mirato). composedPath() torna il percorso
      // REALE dell'evento al momento del dispatch, prima di ogni mutazione del DOM —
      // resta corretto anche se il target viene staccato mentre l'evento sta ancora
      // salendo verso document.
      if (aperto && !event.composedPath().includes(wrap)) chiudi();
    }
    /*
     * ⛔⛔⛔ 27/8, trovato provando `apriSubito` dal vivo: se questo
     * ascoltatore si registra SUBITO, e `creaModelPicker()` viene chiamata
     * dentro il gestore di click di UN ALTRO bottone (la pillola del
     * composer, che apre il foglio nello stesso click), lo stesso identico
     * evento click — ancora in fase di bubbling — raggiunge `document`
     * DOPO essersi registrato: `onDocumentClick` lo vede, `wrap` non
     * contiene quel bottone (è un elemento diverso), e chiude il pannello
     * un istante dopo averlo aperto. `setTimeout(...,0)` rimanda la
     * registrazione al giro di eventi successivo — lo stesso pattern
     * usato ovunque per "click fuori per chiudere".
     */
    window.setTimeout(() => document.addEventListener('click', onDocumentClick), 0);

    aggiornaTriggerLabel();
    /*
     * ⭐⭐⭐ 27/8, owner: "quando clicco la pillola del modello si deve
     * riaprire lo stesso componente della selezione del modello" — la
     * pillola apre un FOGLIO il cui unico scopo è scegliere un modello:
     * il trigger collassato (utile in "Nuova sessione", un campo fra
     * altri) sarebbe qui un secondo click ridondante. `apriSubito`
     * nasconde il trigger e tiene il pannello sempre aperto — stesso
     * componente, stessa lista vera, montaggio diverso.
     */
    if (apriSubito) { trigger.hidden = true; apri(); }
    return { elemento: wrap, getValore: () => valoreScelto };
  }

  /*
   * ⭐⭐⭐ 28/8, owner: "nella modale della nuova sessione e nella pill del
   * modello metti lo slider del selettore effort più ragionamento esteso
   * (usa lo stesso component usato sul mobile)" — porta
   * TalosMobileEffortPicker.vue/TalosThemedSegmentedSlider.vue (mobile,
   * `reka-ui`), adattato: qui non c'è un framework né una libreria di
   * slider, quindi lo slider è un `<input type="range">` NATIVO — stessa
   * filosofia del componente mobile ("il piattaforma possiede il drag, la
   * tastiera, il touch"), non uno hand-rolled. Sei livelli, quelli VERI
   * di OpenRouter già validati server-side (`config.mjs`,
   * `EFFORT_AMMESSI`) — non i sette del mobile (`off/minimal/low/medium/
   * high/xhigh/max`): niente 'max' (non esiste su OpenRouter), 'none' al
   * posto di 'off' (stesso significato, nome vero dell'API).
   *
   * ⛔ NIENTE toggle "ragionamento esteso" separato (il thinking booleano
   * del mobile, per Anthropic diretto): sul nostro harness `reasoning` è
   * SOLO `{effort, summary}` — `effort:'none'` È già "nessun
   * ragionamento", un secondo controllo duplicherebbe la stessa cosa con
   * un nome diverso. I livelli alti (high/xhigh) SONO il "ragionamento
   * esteso" richiesto.
   */
  const LIVELLI_RAGIONAMENTO = [
    { valore: 'none', etichetta: 'Off' },
    { valore: 'minimal', etichetta: 'Minimo' },
    { valore: 'low', etichetta: 'Basso' },
    { valore: 'medium', etichetta: 'Medio' },
    { valore: 'high', etichetta: 'Alto' },
    { valore: 'xhigh', etichetta: 'Massimo' },
  ];

  function creaEffortPicker({ valoreIniziale = null, alCambiato } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'effort-picker';

    const head = document.createElement('div');
    head.className = 'effort-picker-head';
    const label = textElement('span', 'effort-picker-label', 'Ragionamento');
    const selected = textElement('span', 'effort-picker-selected', '');
    head.append(label, selected);

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'effort-picker-range';
    range.min = '0';
    range.max = String(LIVELLI_RAGIONAMENTO.length - 1);
    range.step = '1';
    range.setAttribute('aria-label', 'Livello di ragionamento');

    const labelsRow = document.createElement('div');
    labelsRow.className = 'effort-picker-labels';
    const labelEls = LIVELLI_RAGIONAMENTO.map((l, i) => {
      const el = textElement('span', 'effort-picker-tick', l.etichetta);
      el.style.left = `${(i / (LIVELLI_RAGIONAMENTO.length - 1)) * 100}%`;
      labelsRow.appendChild(el);
      return el;
    });

    wrap.append(head, range, labelsRow);

    let indice = LIVELLI_RAGIONAMENTO.findIndex((l) => l.valore === valoreIniziale);
    // ⭐ nessuna scelta esplicita ancora: "toccato" resta false finché l'utente non muove lo slider — getValore() torna null, il corpo della richiesta non porta "reasoning" affatto, comportamento identico a prima di questo componente. La posizione VISIVA di partenza (Alto, come il mobile) è solo estetica.
    let toccato = indice >= 0;
    if (indice < 0) indice = LIVELLI_RAGIONAMENTO.findIndex((l) => l.valore === 'high');

    function aggiorna() {
      range.value = String(indice);
      selected.textContent = toccato ? LIVELLI_RAGIONAMENTO[indice].etichetta : 'Automatico';
      labelEls.forEach((el, i) => el.classList.toggle('effort-picker-tick-selected', i === indice));
    }
    aggiorna();

    range.addEventListener('input', () => {
      indice = Number(range.value);
      toccato = true;
      aggiorna();
      alCambiato?.(LIVELLI_RAGIONAMENTO[indice].valore);
    });

    return { elemento: wrap, getValore: () => (toccato ? LIVELLI_RAGIONAMENTO[indice].valore : null) };
  }

  async function refreshSessionsBoard() {
    const generation = state.board.generation += 1;
    if (refreshSessionsBoardButton) refreshSessionsBoardButton.disabled = true;
    try {
      const { items } = await apiGet('/api/v1/sessions');
      if (generation !== state.board.generation) return;
      state.board.sessioni = items;
      state.board.initialized = true;
      renderSessionsBoard(items);
      // ⭐ 26/8, riconciliazione desktop→mobile — trovato con una prova vera
      // (browser reale contro il server vero, non ipotizzato): il badge
      // "Demo UI" della Board restava visibile anche a dati reali caricati,
      // difetto preesistente. Stesso principio già applicato ad
      // aggiornaAlberoReale/aggiornaPannelloAmbiente: dati reali arrivati,
      // l'etichetta demo deve sparire.
      const demoBadgeBoard = $('.demo-surface-badge', $('[data-view="dashboard"]'));
      if (demoBadgeBoard) demoBadgeBoard.hidden = true;
    } catch (error) {
      if (generation !== state.board.generation) return;
      state.board.sessioni = [];
      sessionsBoardList.replaceChildren(textElement('p', 'board-empty', boardErrorMessage(error)));
    } finally {
      if (generation === state.board.generation && refreshSessionsBoardButton) refreshSessionsBoardButton.disabled = false;
    }
  }

  function renderEmbeddedSessionsBoardDemo(announce = false) {
    state.board.initialized = true;
    state.board.sessioni = [];
    boardEyebrow.textContent = 'Codice · Demo UI';
    boardTitle.textContent = 'Anteprima sessioni';
    boardDescription.textContent = 'Questa superficie mobile non ha un backend: nessuna sessione reale viene letta o simulata.';
    sessionsBoardList.replaceChildren(textElement('p', 'board-empty', 'Nessun dato mobile collegato.'));
    if (announce) toast('Board demo non collegata', 'Nessuna richiesta di rete è stata eseguita.');
  }

  function ensureSessionsBoard() {
    if (embeddedDemoOnly()) {
      renderEmbeddedSessionsBoardDemo();
      return Promise.resolve();
    }
    if (state.board.initialized || state.board.bootstrapPromise) return state.board.bootstrapPromise;
    state.board.bootstrapPromise = refreshSessionsBoard().finally(() => { state.board.bootstrapPromise = null; });
    return state.board.bootstrapPromise;
  }
  // REAL_DATA_RENDER_END

  async function copyText(text, success = 'Copiato negli appunti') {
    const value = String(text || '').trim();
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.className = 'clipboard-fallback';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      toast(success);
    } catch {
      toast('Copia non disponibile', 'Seleziona manualmente il contenuto.');
    }
  }

  /**
   * Menu unico per le sessioni reali, riusato da sidebar e Board come il
   * menu CRUD dell'albero Files. Le voci chiamano soltanto comportamenti gia'
   * supportati dal registro: apri, rinomina, fork, copia id, elimina.
   */
  /*
   * ⭐⭐⭐ 02/09 — NOTIFICHE REALI (prima: campanella con "2" scritto a mano e
   * un toast "Notifiche demo"). Una notifica è una sessione DIVERSA da quella
   * aperta che chiede attenzione: approvazione in attesa (sempre), oppure
   * conclusa/interrotta e non ancora rivista da quando ha cambiato stato.
   * "Vista" è locale al browser (localStorage): alla prima esecuzione si
   * segna tutto come già visto, così notificano solo i cambiamenti FUTURI —
   * mai un badge pieno di storia vecchia. La sessione aperta non notifica
   * mai se stessa: la sua approvazione è già una card in chat.
   */
  const NOTIFICHE_STORAGE_KEY = 'talos.harness.desktop.notifiche.v1';
  function leggiNotificheViste() {
    try { const raw = JSON.parse(window.localStorage.getItem(NOTIFICHE_STORAGE_KEY) || 'null'); return raw && typeof raw === 'object' ? raw : null; } catch { return null; }
  }
  function salvaNotificheViste(viste) {
    try { window.localStorage.setItem(NOTIFICHE_STORAGE_KEY, JSON.stringify(viste)); } catch { /* storage pieno o negato: il badge resta corretto per questa pagina */ }
  }
  function statoNotificaSessione(sessione) {
    if (sessione.inAttesaApprovazione) return 'approvazione';
    if (sessione.interrotta) return 'interrotta';
    if (sessione.conclusa) return 'conclusa';
    return 'in-corso';
  }
  function aggiornaNotifiche(elenco) {
    if (!Array.isArray(elenco)) return;
    let viste = leggiNotificheViste();
    const primaVolta = viste === null;
    if (primaVolta) viste = {};
    const attiva = state.realSession.id;
    const notifiche = [];
    for (const sessione of elenco) {
      const stato = statoNotificaSessione(sessione);
      if (sessione.sessionId === attiva) { viste[sessione.sessionId] = stato; continue; }
      if (stato === 'approvazione') { notifiche.push({ sessione, stato }); continue; } // un'approvazione in attesa notifica SEMPRE, anche alla prima esecuzione
      if (primaVolta) { viste[sessione.sessionId] = stato; continue; }
      if ((stato === 'conclusa' || stato === 'interrotta') && viste[sessione.sessionId] !== stato) notifiche.push({ sessione, stato });
    }
    for (const id of Object.keys(viste)) if (!elenco.some((s) => s.sessionId === id)) delete viste[id]; // sessioni eliminate
    salvaNotificheViste(viste);
    state.notifiche = notifiche;
    const badge = $('#notificationsBadge');
    if (badge) { badge.textContent = String(notifiche.length); badge.hidden = notifiche.length === 0; }
    const bottone = $('#notificationsBtn');
    if (bottone) bottone.setAttribute('aria-label', notifiche.length === 0 ? 'Notifiche: nessuna' : `Notifiche: ${notifiche.length}`);
  }
  function segnaNotificaVista(sessione) {
    const viste = leggiNotificheViste() || {};
    viste[sessione.sessionId] = statoNotificaSessione(sessione);
    salvaNotificheViste(viste);
  }
  function apriPopoverNotifiche(ancoraEl) {
    document.querySelector('.notifications-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'ft-actions-menu session-actions-menu notifications-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Notifiche');
    const notifiche = state.notifiche || [];
    const etichette = { approvazione: 'aspetta la tua approvazione', conclusa: 'ha finito', interrotta: 'si è interrotta' };
    const glifi = { approvazione: 'i-shield', conclusa: 'i-check', interrotta: 'i-stop' };
    if (notifiche.length === 0) {
      menu.appendChild(textElement('p', 'notifications-empty', 'Nessuna notifica: nessun\'altra sessione chiede attenzione.'));
    }
    for (const { sessione, stato } of notifiche) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ft-actions-menu-item notifications-item';
      button.setAttribute('role', 'menuitem');
      const testo = document.createElement('span');
      testo.append(textElement('strong', '', sessione.nome || sessione.taskId || 'Sessione'), textElement('small', '', `${etichette[stato]} · ${formattaOraSessione(sessione.avviataAlle)}`));
      button.append(iconaSvgAlbero(glifi[stato] || 'i-bell'), testo);
      button.addEventListener('click', () => {
        chiudi();
        segnaNotificaVista(sessione);
        passaASessione(sessione.sessionId, sessione.taskId || sessione.sessionId, sessione.nome || sessione.taskId, normalizzaModelloSessione(sessione), sessione);
      });
      menu.appendChild(button);
    }
    if (notifiche.length > 0) {
      const tutte = document.createElement('button');
      tutte.type = 'button';
      tutte.className = 'ft-actions-menu-item notifications-mark-all';
      tutte.setAttribute('role', 'menuitem');
      tutte.append(iconaSvgAlbero('i-check'), textElement('span', '', 'Segna tutte come viste'));
      tutte.addEventListener('click', () => { for (const { sessione } of notifiche) segnaNotificaVista(sessione); chiudi(); void aggiornaElencoSessioniReali(); });
      menu.appendChild(tutte);
    }
    document.body.appendChild(menu);
    const rect = ancoraEl.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.getBoundingClientRect().width - 8))}px`;
    ancoraEl.setAttribute('aria-expanded', 'true');
    function chiudi() {
      menu.remove();
      ancoraEl.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
    }
    function onClick(event) { if (!menu.contains(event.target) && event.target !== ancoraEl && !ancoraEl.contains(event.target)) chiudi(); }
    function onKey(event) { if (event.key === 'Escape') { chiudi(); ancoraEl.focus(); } }
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    (menu.querySelector('button') || menu).focus?.();
  }

  function apriMenuAzioniSessione(sessione, posizionamento) {
    document.querySelector('.session-actions-menu')?.remove();
    const target = {
      ...sessione,
      sessionId: sessione.sessionId,
      taskId: sessione.taskId || sessione.sessionId,
      nome: sessione.nome || sessione.taskId || 'Sessione',
      modello: normalizzaModelloSessione(sessione),
    };
    state.sessioneTarget = target;

    const menu = document.createElement('div');
    menu.className = 'ft-actions-menu session-actions-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Azioni per ${target.nome}`);
    const voci = [
      { etichetta: 'Apri', icona: 'i-eye', azione: () => passaASessione(target.sessionId, target.taskId, target.nome, target.modello, target) },
      { etichetta: 'Rinomina', icona: 'i-edit', azione: () => openSheet('rename') },
      { etichetta: 'Fork', icona: 'i-branch', azione: () => forkSession(target) },
      { etichetta: 'Copia identificativo', icona: 'i-link', azione: () => copyText(target.sessionId, 'Identificativo copiato') },
      { etichetta: 'Elimina', icona: 'i-trash', azione: () => openSheet('deleteSession'), pericoloso: true },
    ];
    for (const voce of voci) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ft-actions-menu-item${voce.pericoloso ? ' ft-actions-menu-item-danger' : ''}`;
      button.setAttribute('role', 'menuitem');
      button.append(iconaSvgAlbero(voce.icona), textElement('span', '', voce.etichetta));
      button.addEventListener('click', () => { chiudiMenu(); voce.azione(); });
      menu.appendChild(button);
    }
    document.body.appendChild(menu);
    const pos = posizionamento || {};
    if (pos.ancoraEl) {
      const rect = pos.ancoraEl.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.getBoundingClientRect().width - 8))}px`;
    } else {
      const misura = menu.getBoundingClientRect();
      const left = Math.min(Number(pos.x) || 8, window.innerWidth - misura.width - 8);
      const top = Math.min(Number(pos.y) || 8, window.innerHeight - misura.height - 8);
      menu.style.left = `${Math.max(8, left)}px`;
      menu.style.top = `${Math.max(8, top)}px`;
    }
    const focusElement = pos.focusElement || null;
    function chiudiMenu() {
      menu.remove();
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeydown);
    }
    function onDocumentClick(event) { if (!menu.contains(event.target)) chiudiMenu(); }
    function onKeydown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      chiudiMenu();
      focusElement?.focus?.();
    }
    window.setTimeout(() => {
      document.addEventListener('click', onDocumentClick);
      document.addEventListener('keydown', onKeydown);
    }, 0);
  }

  /*
   * ⛔⛔ 27/8, trovato nell'inventario "legare ogni componente visivo":
   * `sheetDialog` è CONDIVISO fra tredici tipi di foglio, e il suo unico
   * badge "Demo UI · non collegato" veniva nascosto solo dal flusso
   * "nuovo task" (openRealTaskSheet) — screenshottato aprendo il foglio
   * "control" appena reso onesto: il badge restava lì sopra un
   * contenuto ormai vero al 100%. Non tutti i fogli sono onesti allo
   * stesso modo, però — whitelist esplicita, non un "nascondi sempre":
   * solo i tipi verificati riga per riga.
   *
   * ⭐⭐⭐ FASE C (28/8) — trovato dallo screenshot dal vivo della
   * verifica di questa fase, non da un controllo automatico (la stessa
   * disciplina "l'ispezione visiva trova quello che il controllo
   * automatico non cerca" già più volte confermata in questo progetto):
   * `sessionTree` mostrava ancora "Demo UI · non collegato" sopra la
   * delega VERA appena conclusa — la nota del 27/8 qui sopra descriveva
   * le due righe fork/side-thread INVENTATE, ora rimosse e sostituite
   * da caricaAlberoSessione() (dati reali di GET .../children). Aggiunto.
   */
  const TIPI_FOGLIO_INTERAMENTE_ONESTI = new Set(['model', 'permissions', 'capabilities', 'control', 'fileViewer', 'renameFile', 'deleteFile', 'createFile', 'export', 'sessionTree', 'deleteSession']);
  function openSheet(type) {
    const content = sheetTemplates[type];
    if (!content) return;
    sheetDialog.classList.remove('sheet-dialog--new-session');
    sheetEyebrow.textContent = content.eyebrow;
    sheetTitle.textContent = content.title;
    sheetBody.innerHTML = content.html();
    prepareResizableDialog(sheetDialog, `sheet:${type}`);
    showEmbeddedDialog(sheetDialog);
    wireSheetActions(type);
    if (type === 'control') { refreshDoctorBadge(); caricaPannelloHooks(); }
    if (type === 'capabilities') { caricaPannelloMcp(); caricaPannelloSkill(); caricaPannelloPlugin(); caricaPannelloLibreria(); caricaPannelloNote(); caricaPannelloAttivita(); caricaPannelloMemoria(); caricaPannelloRicerca(); caricaPannelloForge(); }
    if (type === 'sessionTree') caricaAlberoSessione();
    /*
     * ⭐⭐⭐ 27/8, owner: "riaprire lo stesso componente della selezione del
     * modello" — montato qui (non in sheetTemplates.model.html, che è una
     * stringa) perché creaModelPicker torna un elemento DOM vero, non un
     * pezzo di markup. `apriSubito` tiene il pannello sempre aperto (il
     * foglio stesso è già "aperto", un trigger da ri-aprire sarebbe un
     * secondo click ridondante); `alSelezionato` chiude l'INTERO foglio
     * appena si sceglie, stesso comportamento di ogni altra scelta in
     * questi fogli (permessi, ambiente, ...).
     */
    if (type === 'model') {
      const mount = $('#modelPickerMount', sheetBody);
      if (mount) {
        const picker = creaModelPicker({
          valoreIniziale: state.model || '',
          apriSubito: true,
          sincronizzaSessione: true,
          alSelezionato: () => closeEmbeddedDialog(sheetDialog),
        });
        /*
         * ⭐⭐⭐ 28/8, owner: "nella pill del modello metti lo slider
         * dell'effort" — STESSO componente di "Nuova sessione"
         * (creaEffortPicker), montato qui sotto il picker modello. Cambia
         * `state.effort` dal vivo (non c'è un "submit" in questo foglio:
         * la sessione o è già avviata — la scelta vale dal PROSSIMO
         * resume/fork — o partirà con la prossima "Nuova"/primo
         * messaggio, che legge state.effort al momento dell'avvio).
         */
        const effortPicker = creaEffortPicker({
          valoreIniziale: state.effort,
          alCambiato: (valore) => {
            state.effort = valore;
            sincronizzaImpostazioniSessione({ reasoning: valore ? { effort: valore } : null });
          },
        });
        const reasoningRow = document.createElement('label');
        reasoningRow.className = 'sheet-toggle-row';
        const reasoningLabel = document.createElement('span');
        reasoningLabel.textContent = 'Mostra ragionamento';
        const reasoningToggle = document.createElement('input');
        reasoningToggle.type = 'checkbox';
        reasoningToggle.id = 'showReasoningToggle';
        reasoningToggle.checked = state.showReasoning;
        reasoningToggle.setAttribute('aria-label', 'Mostra ragionamento');
        reasoningToggle.addEventListener('change', () => {
          state.showReasoning = reasoningToggle.checked;
          salvaPreferenzeChatDesktop();
          aggiornaVisibilitaRagionamento();
        });
        reasoningRow.append(reasoningLabel, reasoningToggle);
        mount.replaceChildren(picker.elemento, effortPicker.elemento, reasoningRow);
        aggiornaVisibilitaRagionamento();
      }
    }
    /*
     * ⛔ Il badge è UN elemento condiviso da tredici tipi di foglio (vive
     * nel `sheetDialog`, non dentro `#sheetBody` che viene svuotato e
     * riscritto ogni apertura) — `.hidden` va impostato ESPLICITAMENTE
     * in entrambe le direzioni ad ogni apertura, altrimenti un foglio
     * onesto aperto prima lascerebbe il badge nascosto anche per un
     * foglio ancora demo aperto subito dopo.
     */
    const demoBadge = $('.demo-surface-badge', sheetDialog);
    if (demoBadge) demoBadge.hidden = TIPI_FOGLIO_INTERAMENTE_ONESTI.has(type);
  }

  const sheetTemplates = {
    model: {
      eyebrow: 'Runtime',
      title: 'Modello',
      /*
       * ⛔⛔⛔ 27/8, owner: "la stessa modale deve essere riprodotta nel chat
       * composer... si deve riaprire lo stesso componente della selezione
       * del modello" — questo foglio mostrava un campo di testo libero con
       * SETTE scorciatoie scritte a mano, un componente DIVERSO da
       * `creaModelPicker` (il catalogo vero di OpenRouter, ricerca,
       * raggruppato per provider, usato in "Nuova sessione"). Qui resta
       * solo un punto di montaggio: `openSheet()` ci monta lo STESSO
       * componente, non una sua copia — vedi lì per il perché.
       */
      html: () => '<div class="sheet-section" id="modelPickerMount"></div>',
    },
    permissions: {
      eyebrow: 'Safety lens',
      title: 'Permessi di esecuzione',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Policy sessione</span>
          ${[
            ['Read only', 'Legge progetto e comandi non mutanti.', 'Minimo rischio'],
            ['Workspace write', 'Scrive solo nel workspace/worktree corrente.', 'Consigliato'],
            ['On request', 'Chiede prima delle azioni sensibili.', 'Controllato'],
            ['Full access', 'Filesystem e rete senza gate ordinari.', 'Alto rischio'],
          ].map(([name, desc, note]) => `
            <button class="sheet-option ${name === state.permissions ? 'active' : ''}" data-permission-choice="${name}">
              <span class="sheet-icon">${icon('i-shield')}</span><span><strong>${name}</strong><small>${desc}</small></span><span>${note}</span>
            </button>`).join('')}
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Permesso per attrezzo · precede la policy sessione sopra</span>
          ${[
            ['scrivi', 'Scrive un file — passa dal cancello semantico'],
            ['prova', 'Esegue la suite di test del progetto'],
            ['shell', 'Comando di shell nella cartella progetto'],
            ['document_create', 'Genera un documento (PDF, foglio, slide, report)'],
          ].map(([tool, desc]) => `
            <div class="sheet-toggle-row">
              <span><strong>${tool}</strong><small>${desc}</small></span>
              <select data-tool-permission-select="${tool}" aria-label="Permesso per-attrezzo: ${tool}">
                <option value="" ${!state.permessiPerAttrezzo[tool] ? 'selected' : ''}>Come la sessione</option>
                <option value="sempre" ${state.permessiPerAttrezzo[tool] === 'sempre' ? 'selected' : ''}>Sempre consentito</option>
                <option value="chiedi" ${state.permessiPerAttrezzo[tool] === 'chiedi' ? 'selected' : ''}>Chiedi conferma</option>
                <option value="nega" ${state.permessiPerAttrezzo[tool] === 'nega' ? 'selected' : ''}>Nega sempre</option>
              </select>
            </div>`).join('')}
        </div>`,
    },
    environment: {
      eyebrow: 'Environment proof',
      title: 'Workspace e worktree',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Ambiente attivo</span>
          <button class="sheet-option active" data-environment-choice="active">
            <span class="sheet-icon">${icon('i-branch')}</span><span><strong>wt/auth-61c · feat/mobile-code</strong><small>~/dev/talos/.worktrees/auth-61c</small></span><span>Attivo</span>
          </button>
          <button class="sheet-option" data-environment-choice="local">
            <span class="sheet-icon">${icon('i-git')}</span><span><strong>Local · main</strong><small>~/dev/talos</small></span><span>pulito</span>
          </button>
          <button class="sheet-option" data-environment-choice="docker">
            <span class="sheet-icon">${icon('i-terminal')}</span><span><strong>Docker sandbox</strong><small>talos-dev:latest · isolated</small></span><span>pronto</span>
          </button>
          <button class="sheet-option" data-environment-choice="ssh">
            <span class="sheet-icon">${icon('i-link')}</span><span><strong>SSH remote</strong><small>devbox · /workspace/talos</small></span><span>offline</span>
          </button>
          <button class="sheet-option" data-environment-choice="cloud">
            <span class="sheet-icon">${icon('i-web')}</span><span><strong>Cloud sandbox</strong><small>ephemeral · hibernate when idle</small></span><span>+</span>
          </button>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Regole</span>
          <div class="sheet-toggle-row"><span>Mostra branch sempre</span><input type="checkbox" checked></div>
          <div class="sheet-toggle-row"><span>Crea worktree per task</span><input type="checkbox" checked></div>
          <div class="sheet-toggle-row"><span>Setup non bloccante</span><input type="checkbox" checked></div>
        </div>`,
    },
    capabilities: {
      eyebrow: 'Capability hub',
      title: 'Strumenti, skill e connettori',
      /*
       * ⛔⛔⛔ 27/8 — Questo foglio elencava 11 voci (Skills, MCP, Plugin
       * market, Toolsets, Web search, Browser, Computer use, Images, Voice,
       * Gateways, Profiles), tutte con conteggi e checkbox inventati — "3
       * server MCP" quando nessun client MCP esiste, un interruttore che
       * accende/spegne qualcosa che non fa niente. Corretto col principio
       * già in uso per `naviga`/`shell` (enforcement dichiarato, mai un
       * bluff): la prima sezione sono i SETTE attrezzi VERI dell'harness
       * (stessi nomi/descrizioni di ATTREZZI in talosHarness.mjs, non
       * riscritti), con la checkbox `disabled` — sono SEMPRE OFFERTI al
       * modello (questo asse non ha un interruttore, per design). ⛔ FASE B
       * (28/8): 4 di questi 7 (scrivi/prova/shell/document_create) hanno
       * ORA anche un cancello di permesso per-tool (sempre/chiedi/nega),
       * un asse DIVERSO — non "se il modello lo vede", ma "se una sua
       * chiamata passa" — configurabile dal foglio Permessi, non da qui.
       * La seconda
       * sezione è tutto il resto, onestamente "non ancora implementato":
       * quattro gateway di chat restano il blocco più grande dei
       * rimasti, non uno stralcio.
       *
       * ⭐⭐⭐ 29/8 — FASE E chiude "MCP": tolto dalla lista finta sotto,
       * ha ora la sua sezione dinamica vera (`#mcpListMount`, riempita
       * da `caricaPannelloMcp()` in `openSheet()`) — stesso identico
       * pattern di "Hooks" nel foglio Control-plane.
       *
       * ⭐⭐⭐ 29/8 — FASE G chiude "Plugin market": tolto dalla lista
       * finta sotto, ha ora la sua sezione dinamica vera
       * (`#pluginsListMount`, riempita da `caricaPannelloPlugin()` in
       * `openSheet()`) — stesso identico pattern di MCP appena sopra,
       * con lo stesso bottone "Fida" (un plugin ESEGUE, come MCP).
       */
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Attrezzi dell'harness · sempre offerti al modello · permesso per-tool nel foglio Permessi</span>
          ${[
            ['elenca', 'Elenca i file del workspace, con le dimensioni', 'i-list'],
            ['cerca', 'Trova file ovunque nel workspace, per testo o nome', 'i-search'],
            ['leggi', 'Legge un file del workspace', 'i-eye'],
            ['scrivi', 'Scrive un file, sostituendolo per intero — passa dal cancello semantico', 'i-code'],
            ['prova', 'Esegue la suite di test del progetto: è il giudice', 'i-check'],
            ['shell', 'Comando di shell nella cartella progetto — WSL2 se c’è, altrimenti dichiarato', 'i-terminal'],
            ['naviga', 'Legge una pagina web pubblica — DNS pinnato, solo http/https', 'i-web'],
          ].map(([name, desc, ico]) => `
            <div class="sheet-option" role="group">
              <span class="sheet-icon">${icon(ico)}</span><span><strong>${name}</strong><small>${desc}</small></span><span><input aria-label="${name}, sempre attivo" type="checkbox" checked disabled></span>
            </div>`).join('')}
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Skills · cartelle SKILL.md dichiarate in .harness-ui-skills/, per progetto</span>
          <div id="skillsListMount"></div>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">MCP · server dichiarati in .harness-ui-mcp.json, per progetto</span>
          <div id="mcpListMount"></div>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Plugin · manifesti dichiarati in .harness-ui-plugins/, per progetto</span>
          <div id="pluginsListMount"></div>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Libreria · file in .harness-ui-library/, per progetto</span>
          <div id="libraryListMount"></div>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Notes · promemoria in .notes-store/, GLOBALI — non del progetto</span>
          <div id="notesListMount"></div>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Tasks · attività in .tasks-store/, GLOBALI — non del progetto</span>
          <div id="tasksListMount"></div>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Memory · fatti in .memory-store/, GLOBALI — riletti in ogni conversazione</span>
          <div id="memoryListMount"></div>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Deep Research · rapporti in .harness-ui-research/, per progetto — salvati anche in Libreria</span>
          <div id="researchListMount"></div>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Tool Forge · tool creati dal modello in .tool-forge-store/, GLOBALI — disabilitati finché non li abiliti qui</span>
          <div id="forgeListMount"></div>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Non ancora implementato</span>
          ${[
            ['Toolsets', 'i-code'], ['Computer use', 'i-layout'],
            ['Gateways · Telegram, Discord, Slack, WhatsApp', 'i-link'],
            ['Profiles', 'i-robot'],
          ].map(([name, ico]) => `
            <div class="sheet-option" role="group">
              <span class="sheet-icon">${icon(ico)}</span><span><strong>${name}</strong><small>Non ancora implementato</small></span><span><input aria-label="${name}, non implementato" type="checkbox" disabled></span>
            </div>`).join('')}
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Input rapido</span>
          <button class="sheet-option" data-capability-action="file"><span class="sheet-icon">${icon('i-files')}</span><span><strong>Allega file</strong><small>Seleziona dal workspace o dispositivo</small></span><span>+</span></button>
          <button class="sheet-option" data-capability-action="image"><span class="sheet-icon">${icon('i-image')}</span><span><strong>Screenshot / immagine</strong><small>Contesto visivo per il task</small></span><span>+</span></button>
        </div>`,
    },
    control: {
      eyebrow: 'Control plane',
      title: 'Agents, hook e diagnostica',
      /*
       * ⛔⛔ 27/8, trovato nell'inventario "legare ogni componente
       * visivo": "Agents" e "Hooks" mostravano contatori inventati (2 e
       * 4) senza nessun sistema dietro — "Hooks" non aveva nemmeno un
       * gestore di click (bottone morto), "Agents" portava a una scheda
       * che dichiara essa stessa "Non ancora implementato". "Approval
       * policy" erano tre checkbox sempre `checked`, mai lette né
       * scritte da nessuna riga di JS — nessuna grammatica di permesso
       * per-tool esiste oggi (verificato: `dist/kernelPerIlBanco.js` non
       * ha un hook di permesso sui comandi). Stesso principio già
       * applicato al Capability hub (blocco 8): reale con un numero
       * vero, o onestamente "non ancora implementato" — mai un bluff.
       *
       * ⭐⭐⭐ 28/8 — FASE A CHIUDE QUESTO BUCO PER "Hooks": la sezione
       * sotto è ora un punto di montaggio reale (`#hooksListMount`,
       * riempito da `caricaPannelloHooks()` in `openSheet()`) — elenca
       * gli hook VERI dichiarati dal progetto e il loro stato di
       * fiducia VERO, con un bottone "Fida" che chiama davvero
       * `POST .../trust`.
       *
       * ⛔⛔⛔ 30/8, QA visiva (Task 0.3/9) — la sezione "Non ancora
       * implementato" qui sotto è stata RIMOSSA: mentiva su ENTRAMBE le
       * voci, dal vivo, nella stessa identica sessione che la mostrava.
       * "Agents" ("Subagent, deleghe, isolamento e limiti") è reale da
       * FASE C — `delega_sottotask` (10 concorrenti, profondità 2),
       * già mostrato correttamente 4 righe sopra dalla card "Session
       * topology" del tab Context ("Le deleghe a sotto-agenti isolati
       * (attrezzo delega_sottotask) appaiono nel foglio 'Albero
       * sessione'"). "Approval policy per-tool" è reale da FASE B —
       * `ATTREZZI_CON_PERMESSO_PER_ATTREZZO` in config.mjs,
       * `permessiPerAttrezzo` inviato a ogni sessione — e lo dice la
       * STESSA scheda "Attrezzi dell'harness" del Capability hub
       * ("PERMESSO PER-TOOL NEL FOGLIO PERMESSI"). Un pannello del
       * prodotto smentiva un altro: rimossa la sezione intera invece
       * di lasciare un elenco vuoto — quando qualcosa di nuovo resta
       * davvero da costruire, torna qui con lo stesso pattern onesto.
       */
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Agent runtime</span>
          <button class="sheet-option" data-control-action="doctor"><span class="sheet-icon">${icon('i-check')}</span><span><strong>Doctor</strong><small>Runtime, provider, shell, git e browser</small></span><span data-doctor-status>Verifica…</span></button>
          <button class="sheet-option" data-control-action="settings"><span class="sheet-icon">${icon('i-settings')}</span><span><strong>Impostazioni Codice</strong><small>Aspetto, interazione e preferenze</small></span><span>Apri</span></button>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Hooks</span>
          <div id="hooksListMount"></div>
        </div>`,
    },
    sessionTree: {
      eyebrow: 'Conversation graph',
      title: 'Albero sessione',
      html: () => `
        <div class="sheet-section session-tree-sheet">
          <span class="sheet-label">Sessione</span>
          <button class="sheet-option active" data-session-action="main"><span class="sheet-icon">${icon('i-list')}</span><span><strong data-current-session-title>${state.session.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}</strong><small data-usage-summary>Main · ${formattaUsageBreve(state.realSession.usage)}</small></span><span>●</span></button>
        </div>
        <div class="sheet-section">
          <!--
            ⭐⭐⭐ FASE C (28/8) — le due righe "Responsive audit"/"A11y
            review" erano FINTE (mai collegate a nulla). Sostituite da
            un mount point riempito da caricaAlberoSessione() in
            openSheet() — le deleghe VERE dell'attrezzo delega_sottotask,
            vedi LEDGER-FASE-C-SUBAGENTI.md.
          -->
          <span class="sheet-label">Deleghe · sotto-agenti isolati</span>
          <div id="subagentTreeMount"></div>
        </div>`,
    },
    rename: {
      eyebrow: 'Sessione',
      title: 'Rinomina sessione',
      html: () => `
        <form class="sheet-section rename-form" id="renameSessionForm">
          <label class="sheet-label" for="renameSessionInput">Nome sessione</label>
          <input class="sheet-input" id="renameSessionInput" value="${(state.sessioneTarget?.nome || state.session).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}" maxlength="80" autocomplete="off">
          <div class="sheet-actions">
            <button type="button" class="secondary-btn" data-rename-cancel>Annulla</button>
            <button type="submit" class="primary-btn">Salva</button>
          </div>
        </form>`,
    },
    references: {
      eyebrow: 'Context reference',
      title: 'Aggiungi file con @',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Suggerimenti workspace</span>
          ${suggerimentiRiferimentiReali().map((file) => `<button class="sheet-option reference-option" data-reference-file="${attributoSicuro(file)}"><span class="sheet-icon">${icon('i-files')}</span><span><strong>${attributoSicuro(file)}</strong><small>Aggiungi al contesto del messaggio</small></span><span>@</span></button>`).join('') || `<p class="board-empty">${state.realSession.id ? 'Apri una cartella nell’albero Files: i file caricati compaiono qui come suggerimenti.' : 'Avvia una sessione: qui compaiono i file del suo workspace.'}</p>`}
        </div>`,
    },
    /*
     * ⭐⭐⭐ 27/8, owner: "aprire i file" — sola lettura, un'anteprima non
     * un editor (workspace-files.mjs ha il suo tetto dichiarato, 512 KB).
     * Mount-point come `model`: il contenuto arriva da una fetch, non da
     * una stringa statica — `openSheet()` lo popola dopo l'apertura.
     */
    fileViewer: {
      eyebrow: 'Anteprima',
      title: 'File', // ⛔ sovrascritto dinamicamente in openSheet() col nome vero — sheetTemplates.title è una stringa ovunque altrove, non una funzione
      html: () => '<div class="sheet-section" id="fileViewerMount"><p class="board-empty">Carico…</p></div>',
    },
    renameFile: {
      eyebrow: 'Albero workspace',
      title: 'Rinomina file',
      html: () => `
        <form class="sheet-section rename-form" id="renameFileForm">
          <label class="sheet-label" for="renameFileInput">Nuovo nome</label>
          <input class="sheet-input" id="renameFileInput" value="${(state.alberoFileTarget?.nome ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}" maxlength="255" autocomplete="off" spellcheck="false">
          <div class="sheet-actions">
            <button type="button" class="secondary-btn" data-rename-file-cancel>Annulla</button>
            <button type="submit" class="primary-btn">Rinomina</button>
          </div>
        </form>`,
    },
    /** ⛔ Distruttiva — la conferma è QUESTO stesso foglio (un secondo passaggio esplicito, mai un click solo), stessa disciplina "hard to reverse actions get confirmed" del resto del prodotto. */
    deleteFile: {
      eyebrow: 'Albero workspace',
      title: 'Elimina file',
      html: () => `
        <div class="sheet-section">
          <p class="board-empty">Eliminare <strong>${(state.alberoFileTarget?.nome ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}</strong>? L'azione scrive DAVVERO sul disco e non si annulla da qui.</p>
          <div class="sheet-actions">
            <button type="button" class="secondary-btn" data-delete-file-cancel>Annulla</button>
            <button type="button" class="primary-btn danger" id="deleteFileConfirm">Elimina</button>
          </div>
        </div>`,
    },
    /**
     * ⭐⭐⭐ 30/8, QA visiva (Task 14) — stesso schema ESATTO di deleteFile
     * appena sopra (conferma come secondo passaggio esplicito, mai un
     * click solo): la sessione era l'unica cosa in tutto il prodotto
     * senza un modo di eliminarla, né qui né sul server.
     */
    deleteSession: {
      eyebrow: 'Sessioni',
      title: 'Elimina sessione',
      html: () => `
        <div class="sheet-section">
          <p class="board-empty">Eliminare <strong>${(state.sessioneTarget?.nome ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}</strong>? La trascrizione viene cancellata dal disco e non si annulla da qui.</p>
          <div class="sheet-actions">
            <button type="button" class="secondary-btn" data-delete-session-cancel>Annulla</button>
            <button type="button" class="primary-btn danger" id="deleteSessionConfirm">Elimina</button>
          </div>
        </div>`,
    },
    /**
     * ⭐⭐⭐ 28/8, owner: "e comandi crud in generale" — "Nuovo file"/"Nuova
     * cartella", stesso foglio per entrambi (`state.alberoFileTarget.tipo`
     * decide titolo/etichetta ed è preimpostato da chi apre il foglio,
     * mai scelto qui dentro — stesso principio di renameFile sopra: un
     * campo solo, un submit solo).
     */
    createFile: {
      eyebrow: 'Albero workspace',
      title: 'Nuovo', // ⛔ sovrascritto dinamicamente in avviaCreaVoce() col titolo vero — sheetTemplates.title è una stringa ovunque altrove, stesso pattern di fileViewer sopra
      html: () => `
        <form class="sheet-section rename-form" id="createFileForm">
          <label class="sheet-label" for="createFileInput">${state.alberoFileTarget?.tipo === 'cartella' ? 'Nome della cartella' : 'Nome del file'}</label>
          <input class="sheet-input" id="createFileInput" value="" maxlength="255" autocomplete="off" spellcheck="false">
          <div class="sheet-actions">
            <button type="button" class="secondary-btn" data-create-file-cancel>Annulla</button>
            <button type="submit" class="primary-btn">Crea</button>
          </div>
        </form>`,
    },
    /**
     * ⭐⭐⭐ 28/8, owner: "una modale di esportazione in diversi formati, in
     * modo che se c'è qualche errore io ti possa esportare interamente la
     * conversazione con errori e output tecnici" — vedi il commento su
     * costruisciTrascrizioneMarkdown per la ricerca fatta prima di
     * scrivere questo foglio. Aperto solo per una sessione REALE
     * (exportSession()) — TIPI_FOGLIO_INTERAMENTE_ONESTI lo riflette.
     */
    export: {
      eyebrow: 'Esporta',
      title: 'Esporta sessione',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Formato</span>
          <button class="sheet-option" data-export-choice="markdown">
            <span class="sheet-icon">${icon('i-list')}</span><span><strong>Trascrizione leggibile</strong><small>Ogni messaggio, ragionamento, chiamata attrezzo (argomenti ed esito completi, mai troncati) ed errore, in Markdown — pensata per essere incollata qui in chat quando qualcosa va storto.</small></span><span>.md</span>
          </button>
          <button class="sheet-option" data-export-choice="json">
            <span class="sheet-icon">${icon('i-file')}</span><span><strong>JSON completo</strong><small>Il log eventi grezzo, byte per byte — per un'analisi automatica o un secondo strumento.</small></span><span>.json</span>
          </button>
        </div>`,
    },
  };

  /*
   * ⭐⭐⭐ 02/09 — i suggerimenti del foglio "@" erano cinque nomi di file
   * inventati (TalosComposer.vue, talosThemes.ts…). Ora vengono dal
   * workspace VERO: prima i file scritti in questa sessione (reviewFiles),
   * poi i file dei livelli dell'albero già caricati (treeCache) — nessuna
   * fetch nuova, nessun nome inventato; senza sessione, un messaggio onesto.
   */
  function suggerimentiRiferimentiReali(massimo = 12) {
    const visti = new Set();
    const elenco = [];
    const aggiungi = (percorso) => { if (percorso && !visti.has(percorso) && elenco.length < massimo) { visti.add(percorso); elenco.push(percorso); } };
    for (const file of state.realSession.reviewFiles.values()) aggiungi(file.path);
    for (const [percorso, voci] of state.realSession.treeCache.entries()) {
      for (const voce of voci || []) { if (!voce.cartella) aggiungi(percorso ? `${percorso}/${voce.nome}` : voce.nome); }
    }
    return elenco;
  }
  function attributoSicuro(valore) {
    return String(valore).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Aggiorna la pillola del composer che apre il foglio Modello — selettore stabile (`data-open-sheet="model"`), non un confronto sul testo attuale come faceva il codice precedente. */
  function aggiornaPillolaModello() {
    const span = $('[data-open-sheet="model"] span');
    const label = state.model || 'Seleziona modello';
    if (span) span.textContent = label;
    const activeModel = $('#modelLabActiveModel');
    if (activeModel) activeModel.textContent = label;
  }

  function aggiornaPillolaAmbiente() {
    $$('[data-environment-label]').forEach((span) => {
      span.textContent = state.environment || 'Ambiente non osservato';
    });
  }

  function aggiornaComposerUsage(usage) {
    const usageNode = $('[data-runtime-usage]');
    if (usageNode) usageNode.textContent = formattaUsageBreve(usage, { live: true });
    const throughput = Number(usage?.tokens_per_second ?? usage?.tokensPerSecond);
    const throughputNode = $('[data-runtime-throughput]');
    if (throughputNode) throughputNode.textContent = Number.isFinite(throughput) && throughput > 0 ? `↑ ${Math.round(throughput)} tok/s` : 'Velocità non osservata';
    const cache = Number(usage?.cached_tokens ?? 0);
    const prompt = Number(usage?.prompt_tokens ?? 0);
    const cacheNode = $('[data-runtime-cache]');
    if (cacheNode) cacheNode.textContent = cache > 0 && prompt > 0 ? `cache ${Math.round((cache / prompt) * 100)}%` : 'Cache non osservata';
  }

  /**
   * ⭐⭐⭐ 28/8 — fattorizzata da dentro il click-handler della pillola
   * permessi: la STESSA propagazione (pillole in giro per la pagina, il
   * bridge nativo, lo stato) serve ANCHE a "Imposta come radice" (menu
   * dell'albero, sotto), che sceglie "Full access" per conto suo — un
   * solo posto che sa come cambiare permesso, mai due copie che
   * potrebbero divergere.
   */
  function aggiornaPillolaPermessi() {
    $$('.selector-pill span').filter((span) => ['Workspace write', 'Read only', 'On request', 'Full access'].includes(span.textContent)).forEach((span) => { span.textContent = state.permissions; });
    window.__talosHarnessHostPermissionChange?.(state.permissions);
  }

  function impostaPermesso(nuovoPermesso, messaggioToast = nuovoPermesso) {
    state.permissions = nuovoPermesso;
    aggiornaPillolaPermessi();
    sincronizzaImpostazioniSessione({ permessi: nuovoPermesso });
    toast('Policy aggiornata', messaggioToast);
  }

  function wireSheetActions(type) {
    $$('[data-permission-choice]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        impostaPermesso(button.dataset.permissionChoice);
        closeEmbeddedDialog(sheetDialog);
      });
    });
    /*
     * ⭐⭐⭐ FASE B (28/8) — a differenza della policy sessione sopra (un
     * bottone chiude il foglio), un `<select>` per riga NON lo chiude:
     * l'owner può regolare più attrezzi in una sola apertura. `''` toglie
     * l'override (torna al comportamento della sessione, mai una chiave
     * vuota mandata al server — config.mjs la rifiuterebbe comunque).
     */
    $$('[data-tool-permission-select]', sheetBody).forEach((select) => {
      select.addEventListener('change', () => {
        const tool = select.dataset.toolPermissionSelect;
        if (select.value) state.permessiPerAttrezzo[tool] = select.value;
        else delete state.permessiPerAttrezzo[tool];
        sincronizzaImpostazioniSessione({ permessiPerAttrezzo: Object.keys(state.permessiPerAttrezzo).length ? { ...state.permessiPerAttrezzo } : null });
        toast('Permesso per-attrezzo aggiornato', select.value ? `${tool}: ${select.options[select.selectedIndex].textContent}` : `${tool}: torna alla policy sessione`);
      });
    });
    $$('[data-capability-action]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        toast(button.dataset.capabilityAction === 'file' ? 'File picker simulato' : 'Cattura visiva pronta', 'Il mockup rappresenta il flusso senza backend.');
        closeEmbeddedDialog(sheetDialog);
      });
    });
    $$('[data-environment-choice]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        state.environment = button.querySelector('strong')?.textContent || null;
        aggiornaPillolaAmbiente();
        toast('Environment selezionato', state.environment);
        closeEmbeddedDialog(sheetDialog);
      });
    });
    $$('[data-control-action]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.controlAction;
        if (action === 'settings') { closeEmbeddedDialog(sheetDialog); setView('settings'); }
        else if (action === 'doctor') eseguiDoctor();
      });
    });
    $$('[data-session-action]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.sessionAction;
        toast(action === 'new-side' ? 'Side thread creato' : 'Thread selezionato', action === 'fork' ? 'Fork indipendente con contesto ereditato.' : 'Il contesto resta isolato ma collegato al task principale.');
        closeEmbeddedDialog(sheetDialog);
      });
    });
    $$('[data-reference-file]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        const file = button.dataset.referenceFile;
        composerInput.value = `${composerInput.value.replace(/@[^\s]*$/, '')}@${file} `;
        autoGrowTextarea();
        closeEmbeddedDialog(sheetDialog);
        composerInput.focus();
      });
    });
    /*
     * ⭐⭐⭐ 28/8 — export a scelta di formato. `disabled` durante il fetch
     * (l'unica azione del foglio con un giro di rete prima del download,
     * a differenza degli altri handler sopra che sono tutti sincroni) per
     * non permettere un doppio click che parte due volte. ⛔ Mai un
     * successo dichiarato su un file vuoto — la ricerca su /export di
     * Claude Code (vedi il commento su costruisciTrascrizioneMarkdown) ha
     * trovato esattamente quel bug in un tool affermato: qui si controlla
     * `testo.trim()` PRIMA del download, non dopo.
     */
    $$('[data-export-choice]', sheetBody).forEach((button) => {
      button.addEventListener('click', async () => {
        const formato = button.dataset.exportChoice;
        const eraDisabled = $$('[data-export-choice]', sheetBody);
        eraDisabled.forEach((b) => { b.disabled = true; });
        try {
          const esportato = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/export`);
          const isMarkdown = formato === 'markdown';
          const testo = isMarkdown ? costruisciTrascrizioneMarkdown(esportato) : JSON.stringify(esportato, null, 2);
          if (!testo || !testo.trim()) throw new Error('Esportazione vuota: nessun contenuto da scrivere.');
          scaricaTesto(testo, `talos-sessione-${state.realSession.id}.${isMarkdown ? 'md' : 'json'}`, isMarkdown ? 'text/markdown' : 'application/json');
          closeEmbeddedDialog(sheetDialog);
          toast('Sessione esportata', isMarkdown ? 'Trascrizione Markdown pronta.' : 'JSON pronto.');
        } catch (error) {
          toast('Esportazione non riuscita', error.message);
        } finally {
          eraDisabled.forEach((b) => { b.disabled = false; });
        }
      });
    });

    const renameForm = $('#renameSessionForm', sheetBody);
    if (renameForm) {
      const input = $('#renameSessionInput', renameForm);
      window.setTimeout(() => { input?.focus(); input?.select(); }, 30);
      $('[data-rename-cancel]', renameForm)?.addEventListener('click', () => closeEmbeddedDialog(sheetDialog));
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const next = input?.value.trim();
        if (!next) { input?.focus(); return; }
        /*
         * ⛔⛔⛔ Riconciliazione Fase 2 (piano procedi-col-generare-un-snoopy-neumann.md,
         * 27/8) — trovato dal vivo: questo foglio mutava solo lo stato
         * client, MAI l'endpoint reale (`POST .../rename`, già scritto e
         * già provato in `http-app.mjs`/`session-registry.rinomina()`) —
         * il nome tornava a quello vecchio a ogni ricostruzione della
         * sidebar/refresh. Senza sessione reale, resta lo stesso rename
         * solo-client di sempre (demo).
         */
        const targetSessionId = state.sessioneTarget?.sessionId || state.realSession.id;
        if (targetSessionId) {
          try {
            await apiPost(`/api/v1/sessions/${encodeURIComponent(targetSessionId)}/rename`, { nome: next });
          } catch (error) {
            toast('Rinomina non riuscita', messaggioErroreUtente(error));
            return;
          }
        }
        if (!state.sessioneTarget || targetSessionId === state.realSession.id) {
          state.session = next;
          sessionTitle.textContent = state.session;
          $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
          const activeSession = $('.session-item.active .session-main strong');
          if (activeSession) activeSession.textContent = state.session;
        }
        state.sessioneTarget = null;
        closeEmbeddedDialog(sheetDialog);
        toast('Sessione rinominata', next);
        if (targetSessionId && targetSessionId !== state.realSession.id) {
          await aggiornaElencoSessioniReali();
          if (state.board.initialized) await refreshSessionsBoard();
        }
      });
    }

    const renameFileForm = $('#renameFileForm', sheetBody);
    if (renameFileForm) {
      const input = $('#renameFileInput', renameFileForm);
      window.setTimeout(() => { input?.focus(); input?.select(); }, 30);
      $('[data-rename-file-cancel]', renameFileForm)?.addEventListener('click', () => closeEmbeddedDialog(sheetDialog));
      renameFileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nuovoNome = input?.value.trim();
        const bersaglio = state.alberoFileTarget;
        if (!nuovoNome || !bersaglio) { input?.focus(); return; }
        try {
          await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree/rename`, { percorso: bersaglio.percorso, nuovoNome });
          closeEmbeddedDialog(sheetDialog);
          toast('File rinominato', `${bersaglio.nome} → ${nuovoNome}`);
          await invalidaLivelloGenitoreAlbero(bersaglio.percorso);
        } catch (error) {
          toast('Rinomina non riuscita', error.message);
        }
      });
    }

    const deleteFileConfirm = $('#deleteFileConfirm', sheetBody);
    if (deleteFileConfirm) {
      $('[data-delete-file-cancel]', sheetBody)?.addEventListener('click', () => closeEmbeddedDialog(sheetDialog));
      deleteFileConfirm.addEventListener('click', async () => {
        const bersaglio = state.alberoFileTarget;
        if (!bersaglio) return;
        try {
          await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree/delete`, { percorso: bersaglio.percorso });
          closeEmbeddedDialog(sheetDialog);
          toast('File eliminato', bersaglio.nome);
          await invalidaLivelloGenitoreAlbero(bersaglio.percorso);
        } catch (error) {
          toast('Eliminazione non riuscita', error.message);
        }
      });
    }

    /*
     * ⭐⭐⭐ 30/8, QA visiva (Task 14) — stesso schema ESATTO di
     * deleteFileConfirm appena sopra, per la sessione invece del file.
     * Se la sessione eliminata è quella APERTA ora, un ricaricamento
     * della pagina (stesso F5 reale già verificato pulito in Task 5) è
     * il modo più semplice e sicuro di tornare a uno stato coerente —
     * evita di dover ricostruire a mano ogni angolo di stato che una
     * sessione attiva tocca (composer, Context Rail, Files, Terminale).
     */
    const deleteSessionConfirm = $('#deleteSessionConfirm', sheetBody);
    if (deleteSessionConfirm) {
      $('[data-delete-session-cancel]', sheetBody)?.addEventListener('click', () => closeEmbeddedDialog(sheetDialog));
      deleteSessionConfirm.addEventListener('click', async () => {
        const bersaglio = state.sessioneTarget;
        if (!bersaglio) return;
        try {
          await apiPost(`/api/v1/sessions/${encodeURIComponent(bersaglio.sessionId)}/delete`, {});
          closeEmbeddedDialog(sheetDialog);
          toast('Sessione eliminata', bersaglio.nome);
          if (state.realSession.id === bersaglio.sessionId) {
            window.location.reload();
            return;
          }
          await aggiornaElencoSessioniReali();
          if (state.board.initialized) await refreshSessionsBoard();
        } catch (error) {
          toast('Eliminazione non riuscita', error.message);
        }
      });
    }

    const createFileForm = $('#createFileForm', sheetBody);
    if (createFileForm) {
      const input = $('#createFileInput', createFileForm);
      window.setTimeout(() => { input?.focus(); }, 30);
      $('[data-create-file-cancel]', createFileForm)?.addEventListener('click', () => closeEmbeddedDialog(sheetDialog));
      createFileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nome = input?.value.trim();
        const bersaglio = state.alberoFileTarget;
        if (!nome || !bersaglio) { input?.focus(); return; }
        try {
          const esito = await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree/create`, { percorsoBase: bersaglio.percorso, nome, tipo: bersaglio.tipo });
          closeEmbeddedDialog(sheetDialog);
          toast(bersaglio.tipo === 'cartella' ? 'Cartella creata' : 'File creato', esito.percorso);
          await invalidaLivelloGenitoreAlbero(esito.percorso);
        } catch (error) {
          toast('Creazione non riuscita', error.message);
        }
      });
    }
  }

  function runRealeAttivo() {
    return Boolean(state.realSession.id && !state.realSession.eventoTerminaleVisto);
  }

  /** Un solo punto sincronizza semantica, icona e azioni del composer. */
  function syncRunComposerState() {
    const attivo = runRealeAttivo();
    const haTesto = composerInput.value.trim().length > 0;
    const redirectOccupato = state.realSession.redirectRequestInFlight || Boolean(state.realSession.redirectPendingId);
    const use = $('use', sendButton);
    sendButton.classList.toggle('is-stop', attivo);
    sendButton.setAttribute('aria-label', attivo ? 'Interrompi risposta' : 'Invia');
    sendButton.title = attivo ? 'Interrompi al prossimo punto sicuro' : 'Invia';
    if (use) use.setAttribute('href', attivo ? '#i-stop' : '#i-send');
    redirectRunButton.hidden = !(attivo && haTesto);
    redirectRunButton.disabled = redirectOccupato;
    redirectRunButton.setAttribute('aria-label', 'Reindirizza con il testo scritto');
    composerInput.placeholder = attivo ? 'Scrivi un follow-up…' : 'Scrivi a TALOS...';
  }

  function setQueueMode(enabled, announce = false) {
    /*
     * ⛔ 27/8 — stessa guardia di submitPrompt, estesa. ⭐⭐⭐ 28/8, FASE D:
     * il primo ramo è cambiato — un follow-up su una sessione IN CORSO
     * ORA arriva davvero (accodaMessaggioReale, POST .../queue), ma
     * AUTOMATICAMENTE per ogni messaggio scritto nel composer: questo
     * interruttore non ha un ruolo in più da aggiungere, il vecchio
     * "non ancora implementato" sarebbe oggi un bluff. Il secondo ramo
     * resta vero invariato: senza nessuna sessione non c'è nulla da
     * accodare, mai un toggle che si accende senza che nulla lo segua.
     */
    if (enabled && state.realSession.id) {
      toast('Il follow-up è già in coda', 'Scrivi normalmente nel composer: un messaggio durante un run in corso si accoda da solo, non serve questo interruttore.');
      return;
    }
    if (enabled && !state.realSession.id) {
      toast('Nessuna sessione attiva', 'Il follow-up si mette in coda solo durante una sessione in corso — apri prima «Nuova».');
      return;
    }
    state.queueMode = Boolean(enabled);
    runStateToggle?.setAttribute('aria-pressed', String(state.queueMode));
    if (announce) toast(state.queueMode ? 'Steering queue attiva' : 'Steering queue disattivata');
  }

  function setRunState(running) {
    state.running = Boolean(running);
    runStrip?.classList.toggle('is-stopped', !state.running);
    const label = $('strong', runStateToggle);
    const timer = runStateToggle?.querySelector('span:last-child');
    if (label) label.textContent = state.running ? 'In esecuzione' : 'Interrotto';
    if (timer) timer.textContent = state.running ? '01:42' : '—';
    const stopButton = $('.stop-run');
    if (stopButton) {
      stopButton.disabled = !state.running;
      stopButton.setAttribute('aria-label', state.running ? 'Interrompi esecuzione' : 'Esecuzione interrotta');
    }
  }

  let nativeKeyboardOpen = null;

  function applyKeyboardOpen(open) {
    document.body.classList.toggle('keyboard-open', Boolean(open));
  }

  function setKeyboardOpen(open) {
    nativeKeyboardOpen = Boolean(open);
    applyKeyboardOpen(nativeKeyboardOpen);
    if (!nativeKeyboardOpen && ROOT().activeElement === composerInput) composerInput.blur();
  }

  function syncVisualViewport() {
    const viewport = window.visualViewport;
    const rawOffset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    const keyboardOffset = rawOffset > 80 ? rawOffset : 0;
    // ROOT().activeElement, non document.activeElement: dentro uno shadow
    // root il focus reale si legge da lì (Document e ShadowRoot condividono
    // l'interfaccia DocumentOrShadowRoot) — document.activeElement da fuori
    // vedrebbe solo l'host, mai composerInput.
    const composerFocused = ROOT().activeElement === composerInput;
    const viewportKeyboardOpen = composerFocused && keyboardOffset > 0 && layoutCompatto();
    applyKeyboardOpen(nativeKeyboardOpen ?? viewportKeyboardOpen);
  }

  // ⭐ 02/09 — nessuna copy inventata per i dettagli tool: il markup demo che li usava non esiste più; resta il fallback onesto sotto.
  const toolDetails = {};

  function toggleToolDetail(button) {
    const key = button.dataset.toolDetail;
    const existing = button.nextElementSibling?.classList.contains('tool-inline-detail') ? button.nextElementSibling : null;
    $$('.tool-row[aria-expanded="true"]').forEach((row) => {
      if (row !== button) row.setAttribute('aria-expanded', 'false');
    });
    $$('.tool-inline-detail').forEach((detail) => {
      if (detail !== existing) animateExit(detail, { durationToken: '--talos-motion-duration-disclosure' }, () => detail.remove());
    });
    if (existing) {
      button.setAttribute('aria-expanded', 'false');
      animateExit(existing, { durationToken: '--talos-motion-duration-disclosure' }, () => existing.remove());
      return;
    }
    const [title, detail] = toolDetails[key] || ['Dettaglio tool', 'Nessun dettaglio aggiuntivo disponibile.'];
    const row = document.createElement('div');
    row.className = 'tool-inline-detail';
    row.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
    button.insertAdjacentElement('afterend', row);
    markMotionEnter(row);
    button.setAttribute('aria-expanded', 'true');
  }

  function renderReviewFile(key) {
    // ⭐ 26/8, riconciliazione desktop→mobile — le voci reali vivono in
    // state.realSession.reviewFiles (una per percorso scritto), non nel
    // fisso `reviewFiles` demo: chiave "real:<percorso>" le distingue,
    // stesso schema già in produzione su lane/harness-ui.
    // ⭐ 02/09 — solo voci REALI (state.realSession.reviewFiles): l'oggetto demo con TalosComposer.vue non esiste più.
    const file = key.startsWith('real:') ? state.realSession.reviewFiles.get(key.slice(5)) : null;
    if (!file || !diffPath || !diffCode) return;
    state.reviewFileCorrente = file.path;
    diffPath.textContent = file.path;
    $('#diffEmpty')?.setAttribute('hidden', '');
    $('#diffPre')?.removeAttribute('hidden');
    $$('[data-review-action]').forEach((b) => { b.disabled = false; });
    diffCode.replaceChildren(...file.code.map(([kind, text]) => {
      const span = document.createElement('span');
      span.className = kind;
      span.textContent = text;
      return span;
    }));
    markMotionEnter(diffCode);
    /*
     * ⛔⛔⛔ 30/8 — vedi il blocco di doc su REGEX_SIMBOLI_TOP_LEVEL/
     * simboliSpariti: qui il dettaglio COMPLETO (i nomi, non solo il
     * conteggio già mostrato sulla tab) — un elemento ricreato ogni
     * volta (mai lasciato per un file che non lo ha più).
     */
    $('#reviewSymbolWarning')?.remove();
    if (file.simboliPersi?.length > 0) {
      const avviso = textElement('p', 'review-symbol-warning-banner', `⚠ Questa riscrittura fa sparire ${file.simboliPersi.length === 1 ? 'una funzione/classe presente' : `${file.simboliPersi.length} funzioni/classi presenti`} prima e non più dopo: ${file.simboliPersi.join(', ')}. Controlla che non sia una perdita involontaria.`);
      avviso.id = 'reviewSymbolWarning';
      diffPath.closest('.diff-toolbar')?.after(avviso);
    }
  }

  function setInspectorTab(button) {
    $$('.inspector-tabs button').forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    $$('.inspector-section').forEach((section) => {
      const active = section.dataset.inspectorSection === button.dataset.inspectorTab;
      section.classList.toggle('active', active);
      section.hidden = !active;
      if (active) markMotionEnter(section);
    });
    /*
     * ⛔⛔⛔ 29/8, owner dal vivo: "in una sessione vuota la tab files ha
     * ancora la scritta demo UI non collegato". Causa: `renderizzaAlberoReale()`
     * parte SOLO su `RunStarted`/una scrittura — mai su "la sessione esiste"
     * da sola — e questa funzione faceva solo mostra/nascondi CSS, zero
     * fetch. Una sessione VERA ma ancora senza un giro restava quindi
     * indistinguibile da nessuna sessione.
     *
     * ⛔ Prima versione di questa cura chiamava `renderizzaAlberoReale()`
     * da `collegaEventiSessione()` (appena l'id è noto) — TROVATO DAL TEST
     * (non dal vivo): quando un `RunStarted` arriva a ridosso della
     * connessione (il caso normale, non quello vuoto), le due chiamate
     * si sovrappongono e il livello radice viene scaricato DUE volte
     * invece di una (FILE-TREE-07, `harnessUiRealSession.test.ts`).
     * ⇒ Qui invece: carica pigro, solo al click sulla tab, solo se la
     * radice non è già in cache — mai una doppia corsa con RunStarted,
     * e risolve esattamente lo scenario riportato (l'unico in cui la tab
     * viene aperta prima che un giro sia mai partito).
     */
    if (button.dataset.inspectorTab === 'files' && (state.realSession.id || state.realSession.previewProjectId)
      && !state.realSession.treeCache.has('')) {
      renderizzaAlberoReale();
    }
  }

  /*
   * ⭐⭐⭐ 26/8 — LA SESSIONE VERA, riconciliazione desktop→mobile (DEC-053).
   * Porta da `lane/harness-ui` (AVM-harness-ui/harness-ui/public/app.js) la
   * pipeline di CONSUMO eventi AG-UI: stessa API `/api/v1/sessions/*`, stesso
   * contratto envelope (apiGet/apiPost sopra), zero dipendenze nuove — solo
   * `$`/`$$` al posto di `document.querySelector` dov'era bare, il resto
   * (createElement/createElementNS/createTextNode/setTimeout) funziona già
   * identico dentro uno shadow root, quindi resta invariato.
   *
   * ⭐ 26/8, seconda metà dello stesso giorno: forkSession / resumeSession /
   * compactSession / passaASessione / contenitoreSessioniReali /
   * aggiornaElencoSessioniReali / openRealTaskSheet sono state portate
   * anche loro (vedi il blocco dopo stopRealSession, poco più sotto) — su
   * desktop pescano/scrivono #sessionList, lo stesso elemento che esiste
   * IDENTICO in questo bundle; il vincolo "serve un ponte verso la sidebar
   * nativa Vue" vale solo quando il bundle è EMBEDDED
   * (`:host(.talos-embedded)` in styles.css nasconde già #sessionList per
   * quel caso, stesso meccanismo della Board demo) — standalone (il caso
   * desktop) non c'è nessuna sidebar nativa da sostituire, quindi niente
   * ponte da costruire prima di portarle.
   *
   * ⛔ NON ANCORA fatto (dichiarato, non taciuto): nessuna di queste — né
   * startRealSession né le sette appena elencate — è agganciata a un
   * tocco. openRealTaskSheet userebbe showEmbeddedDialog(sheetDialog), mai
   * il metodo nativo bloccante dell'elemento <dialog> (vietato,
   * HARNESS-NATIVE-TOP-LAYER-HITTEST-01), ma manca ancora il bottone che la
   * apre: su mobile "dove va" resta la
   * stessa decisione UX già rimandata (superficie Codice iterata per otto
   * fasi, non mia da decidere sola); sul desktop standalone il vincolo
   * tecnico non c'è, ma la scelta di COSA far fare a "Nuova sessione" in
   * quel contesto è comunque un prodotto, non un'ovvietà.
   *
   * ⇒ Zero rischio di regressione sulla suite Pad-verificata di Codice: il
   * prossimo passo è la decisione UX del trigger, non altro porting.
   */

  const PERMESSI_SESSIONE_VALIDI = ['Read only', 'Workspace write', 'On request', 'Full access'];
  /**
   * ⛔⛔⛔ 02/09 — LEDGER-STREAMING-SCROLL-TERMINALE-2026-09-02.md, §6/§7:
   * la sessione dell'owner è stata messa in "Read only" e poi su un
   * modello inesistente da un ALTRO client (POST /sessions/:id/settings
   * da una sonda di un'altra sessione di lavoro, dump nel suo scratchpad),
   * mentre questa scheda diceva ancora "Full access": il rifiuto "sola
   * lettura" dell'attrezzo scrivi era VERO per il server e una bugia per
   * chi guardava lo schermo. Il permesso di ogni giro ora viaggia in
   * RunStarted.contesto (agent-service.mjs) e si scrive sotto la bolla
   * utente, come il modello sta già nell'intestazione della risposta:
   * chi rilegge la cronologia vede con quale permesso quel giro è stato
   * eseguito davvero, anche se le pillole nel frattempo dicono altro.
   */
  function etichettaPermessiGiro(contesto) {
    return PERMESSI_SESSIONE_VALIDI.includes(contesto?.permessi) ? ` · ${contesto.permessi}` : '';
  }

  /**
   * Giro VIVO avviato da questa scheda (follow-up): il server dichiara
   * modello e permesso che sta DAVVERO usando. Se differiscono dalle
   * pillole, qualcuno ha cambiato le impostazioni fuori da qui: si
   * allineano le pillole e lo si dice in chat, mai in silenzio. Solo dal
   * vivo — un replay dopo un reload riparte già dalle impostazioni
   * correnti del server (applicaImpostazioniSessione) e non deve
   * rigiocare la storia giro per giro.
   */
  function allineaPilloleAlGiroVivo(contesto) {
    if (!contesto || typeof contesto !== 'object') return;
    const cambi = [];
    const modello = typeof contesto.modello === 'string' ? contesto.modello.trim() : '';
    if (modello && state.model && modello !== state.model) {
      cambi.push(`modello ${state.model} → ${modello}`);
      state.model = modello;
      aggiornaPillolaModello();
    }
    if (PERMESSI_SESSIONE_VALIDI.includes(contesto.permessi) && contesto.permessi !== state.permissions) {
      cambi.push(`permesso ${state.permissions} → ${contesto.permessi}`);
      state.permissions = contesto.permessi;
      aggiornaPillolaPermessi();
    }
    const etichetta = etichettaPermessiGiro(contesto);
    const ultimaMeta = $$('#conversation .user-message .message-meta span').at(-1);
    if (etichetta && ultimaMeta && ultimaMeta.textContent === 'Follow-up') ultimaMeta.textContent += etichetta;
    if (cambi.length > 0) {
      salvaPreferenzeChatDesktop();
      appendStatusNote(`Impostazioni cambiate fuori da questa scheda. Questo giro usa: ${cambi.join(', ')}.`);
    }
  }

  function appendRealTaskStart(task, contesto = null) {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message user-message';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    /*
     * ⛔⛔ 27/8, trovato dalla pipeline QA visiva: per un comando diretto
     * (agent-service.mjs, eseguiComandoDiretto → runStarted({input:
     * {comandoDiretto: comando}})) questo `task` non ha né `.consegna` né
     * `.id` — mostrava "undefined" crudo in chat. Mai un valore inventato
     * o un undefined visibile: se non è un vero task, si dichiara cosa è.
     *
     * ⛔⛔⛔ 27/8, secondo giro, trovato ricaricando la pagina (F5): un
     * "compito libero" (custom-task.mjs, preparaEsecuzioneLibera) ha
     * `.consegna`/`.progetto` ma NESSUN `.id` — la stessa logica etichettava
     * "Comando diretto" anche una vera conversazione. Sul MOMENTO non si
     * vedeva mai (avviaSessionePendente mostra il suo bubble ottimista
     * PRIMA che l'evento vero arrivi, e taskBubbleMostrata blocca il
     * secondo) — solo un F5/resume, che riparte da zero e replica
     * l'evento VERO, lo rivelava. Tre forme distinte, tre etichette oneste.
     */
    bubble.textContent = task.consegna || task.consegnaCorta || task.comandoDiretto || (task.id ? task.id : 'Comando diretto');
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const span = document.createElement('span');
    span.textContent = task.id
      ? `Task reale · ${task.id}`
      : (task.consegna || task.consegnaCorta)
        ? `Compito libero${task.progetto ? ` · ${task.progetto}` : ''}`
        : 'Comando diretto';
    span.textContent += etichettaPermessiGiro(contesto);
    meta.appendChild(span);
    article.append(bubble, meta);
    conversation.appendChild(article);
    markMotionEnter(article);
    /* ⛔ 28/8, owner: "auto centramento dello scroll dei messaggi appena se ne invia uno nuovo (meta schermo)" — questa era l'UNICA delle sei chiamate scrollIntoView di questo file con block:'center' invece di 'end': ogni messaggio inviato veniva centrato a metà schermo invece di scorrere in fondo come ogni altro elemento appeso alla conversazione. */
    scorriAllaBollaAppesa(article);
    state.realSession.taskBubbleMostrata = true;
  }

  /**
   * ⛔⛔⛔ 27/8 — la bolla del SECONDO turno di una conversazione reale
   * (resumeSession con un testo): stesso stile di appendRealTaskStart, ma
   * "Follow-up" invece di "Task reale · <id>" — non è il compito che ha
   * aperto la sessione, è quello che la continua.
   */
  function appendUserFollowUp(text, contesto = null) {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message user-message';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.appendChild(textElement('span', '', `Follow-up${etichettaPermessiGiro(contesto)}`));
    article.append(bubble, meta);
    conversation.appendChild(article);
    markMotionEnter(article);
    scorriAllaBollaAppesa(article);
  }

  /**
   * ⭐⭐⭐ FASE D (28/8) — il banner "Follow-up in coda" mostra la coda
   * VERA (state.realSession.codaMessaggi, popolata SOLO da una POST
   * .../queue riuscita) invece del testo statico del mockup. Il primo
   * elemento è quello che il kernel consegnerà per PRIMO (FIFO) — un
   * secondo elemento in attesa si vede come "+N altri", mai perso
   * silenziosamente. Chiamata sia quando la coda cresce (submitPrompt)
   * sia quando si svuota (QueuedMessageDelivered, #cancelQueued,
   * nuovaGenerazioneSessione) — un solo punto che decide se il banner è
   * visibile, mai due stati da tenere sincronizzati a mano.
   */
  function renderizzaBannerCoda() {
    const coda = state.realSession.codaMessaggi;
    const testoEl = $('#queuedMessageText', queuedMessage);
    if (coda.length === 0) {
      if (queuedMessage.classList.contains('show')) {
        animateExit(queuedMessage, { durationToken: '--talos-motion-duration-composer-collapse' }, () => {
          queuedMessage.classList.remove('show');
        });
      }
      return;
    }
    if (testoEl) {
      const extra = coda.length > 1 ? ` (+${coda.length - 1} altr${coda.length - 1 === 1 ? 'o' : 'i'})` : '';
      testoEl.textContent = `${tronca(coda[0], 60)}${extra}`;
    }
    const demoBadge = $('.demo-surface-badge', queuedMessage);
    if (demoBadge) demoBadge.hidden = true;
    if (!queuedMessage.classList.contains('show')) {
      queuedMessage.classList.add('show');
      markMotionEnter(queuedMessage);
    }
  }

  /**
   * ⭐⭐⭐ 27/8, owner: "mettere il loading della risposta quando il modello
   * sta elaborando... usa lo stesso del mobile... fa sembrare che si sia
   * piantato". Porta di `TalosLineLoader.vue` (mobile/src/components/brand/):
   * stessa identica geometria SVG (traccia+sweep+3 nodi), stesse classi CSS
   * (`.talos-line-loader*`, portate in styles.css) — non un componente
   * nuovo inventato qui, lo stesso disegno del mobile con un `viewBox`
   * identico. Mostrata SOLO nella finestra "ho mandato, non è ancora
   * arrivato niente" (come `sending && !revealed && !haRagionamento &&
   * !runningTools.length` su mobile): il primo token di testo o il primo
   * tool-call la rimuovono (vedi TextMessageContent/ToolCallStart sotto).
   */
  /*
   * ⛔⛔⛔ 02/9 — owner: "il caricamento della risposta... con gemini flash
   * c'è un gap in cui non c'è niente". Ricerca web (regola zero):
   * redis.io/blog/streaming-llm-responses, tianpan.co/.../streaming-ttft-
   * latency-perception — quando il tempo-al-primo-token non si può
   * eliminare (qui il collo è il PROVIDER, già misurato da Fable:
   * "raffiche ogni 100-500ms, pause fino a 10s"), la cura è percepita, non
   * di velocità vera: "a status line sets a processing frame that makes
   * a [wait] feel like forward progress rather than silence". L'etichetta
   * fissa ("elaborando…") per 10 secondi filati È il silenzio che la
   * ricerca descrive — il contasecondi (`.run-activity-elapsed`) già
   * esiste ma è piccolo e muto. Qui l'etichetta principale avanza da
   * sola con l'attesa reale — MAI un dettaglio inventato tipo "sto
   * cercando nei tuoi file" (il progetto vieta i numeri/fatti finti):
   * solo il tempo trascorso, che è vero per costruzione.
   */
  const ETICHETTE_ATTESA_PER_TEMPO = [
    { dopoSecondi: 0, testo: 'TALOS sta elaborando la risposta…' },
    { dopoSecondi: 5, testo: 'Il modello ci sta ancora lavorando…' },
    { dopoSecondi: 12, testo: 'Ci sta mettendo più del solito — resta in attesa…' },
  ];
  function mostraAttesaRisposta(stato = 'attesa') {
    const etichette = {
      attesa: ETICHETTE_ATTESA_PER_TEMPO[0].testo,
      reasoning: 'Ragionamento in corso…',
      preparing: 'TALOS sta preparando la risposta…',
      redirect: 'Reindirizzamento al prossimo punto sicuro…',
    };
    const etichetta = etichette[stato] || etichette.attesa;
    if (state.realSession.attesaBubble) {
      state.realSession.attesaBubble.dataset.activity = stato;
      const label = $('.run-activity-label', state.realSession.attesaBubble);
      if (label) label.textContent = etichetta;
      return;
    }
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message real-waiting-note';
    article.setAttribute('role', 'status');
    article.setAttribute('aria-live', 'polite');
    article.setAttribute('aria-atomic', 'true');
    /*
     * ⛔⛔⛔ 02/9 — owner: "il logo non è animato come il mobile, ci deve
     * essere una linea che attraversa i dot, usa direttamente la stessa
     * identica immagine animata del mobile". Questa è ORA la porta esatta
     * di `mobile/src/components/brand/TalosLineLoader.vue` (F4-#24/F5-#30):
     * stesso viewBox 96×16, stessa traccia fioca, stesso sweep che disegna
     * da sinistra a destra, stessi tre nodi VUOTI a cx 16/48/80 r 4 che si
     * riempiono quando la linea li raggiunge. Il desktop aveva divergito su
     * tre soli pallini che pulsano (viewBox 48×18, nessuna linea): non era
     * la stessa immagine. ⛔ Il regolamento del progetto è
     * [[mobile-harness-ui-si-allinea-sempre-al-desktop]] per il
     * COMPORTAMENTO; qui l'owner ordina l'opposto per questa GRAFICA, ed è
     * un ordine esplicito e diretto — il mobile è la fonte. Stili in
     * styles.css, portati riga per riga da `mobile/src/style.css`.
     */
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'talos-line-loader');
    svg.setAttribute('viewBox', '0 0 96 16');
    // ⛔ 02/9 — owner: "troppo grande, fallo più piccolo e coerente". La
    // misura vera la decide il CSS (agganciata alla scala del testo, vedi
    // `.talos-line-loader` in styles.css); questi due attributi sono solo
    // il ripiego se il foglio non arriva, e ne rispettano il rapporto.
    svg.setAttribute('width', '48');
    svg.setAttribute('height', '8');
    svg.setAttribute('aria-hidden', 'true');
    for (const classe of ['talos-line-loader-track', 'talos-line-loader-sweep']) {
      const linea = document.createElementNS(svgNs, 'line');
      linea.setAttribute('class', classe);
      linea.setAttribute('x1', '4'); linea.setAttribute('y1', '8');
      linea.setAttribute('x2', '92'); linea.setAttribute('y2', '8');
      svg.append(linea);
    }
    for (const cx of [16, 48, 80]) {
      const nodo = document.createElementNS(svgNs, 'circle');
      nodo.setAttribute('class', 'talos-line-loader-node');
      nodo.setAttribute('cx', String(cx)); nodo.setAttribute('cy', '8'); nodo.setAttribute('r', '4');
      svg.append(nodo);
    }
    const elapsed = textElement('span', 'run-activity-elapsed', '0s');
    elapsed.setAttribute('aria-hidden', 'true');
    const labelEl = textElement('span', 'run-activity-label', etichetta);
    article.dataset.activity = stato;
    article.append(svg, labelEl, elapsed);
    conversation.appendChild(article);
    state.realSession.attesaBubble = article;
    state.realSession.attesaAvviataA = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    const aggiornaTempoAttesa = () => {
      if (!state.realSession.attesaBubble || state.realSession.attesaAvviataA === null) return;
      const ora = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      const secondiTrascorsi = Math.max(0, Math.floor((ora - state.realSession.attesaAvviataA) / 1000));
      elapsed.textContent = `${secondiTrascorsi}s`;
      /*
       * ⛔ Solo mentre lo stato resta 'attesa': 'reasoning'/'preparing'/
       * 'redirect' sono segnali VERI arrivati dal kernel (vedi
       * `mostraAttesaRisposta` sopra) e non vanno scavalcati da
       * un'etichetta a tempo — altrimenti si perde un'informazione reale
       * per una generica.
       */
      if (state.realSession.attesaBubble.dataset.activity === 'attesa') {
        let testoAdatto = ETICHETTE_ATTESA_PER_TEMPO[0].testo;
        for (const voce of ETICHETTE_ATTESA_PER_TEMPO) {
          if (secondiTrascorsi >= voce.dopoSecondi) testoAdatto = voce.testo;
        }
        if (labelEl.textContent !== testoAdatto) labelEl.textContent = testoAdatto;
      }
    };
    state.realSession.attesaTimer = window.setInterval(aggiornaTempoAttesa, 1000);
    markMotionEnter(article);
    scorriAllaBollaAppesa(article);
  }

  function nascondiAttesaRisposta() {
    if (state.realSession.attesaTimer !== null) {
      window.clearInterval(state.realSession.attesaTimer);
      state.realSession.attesaTimer = null;
    }
    state.realSession.attesaAvviataA = null;
    if (!state.realSession.attesaBubble) return;
    state.realSession.attesaBubble.remove();
    state.realSession.attesaBubble = null;
  }

  function ensureAssistantMessageElement(messageId) {
    const existing = state.realSession.messageElements.get(messageId);
    if (existing) return existing;
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message';
    const meta = document.createElement('div');
    meta.className = 'assistant-meta';
    const glyph = document.createElement('span');
    glyph.className = 'talos-glyph';
    glyph.appendChild(textElement('span', 'brand-glyph-mark', ''));
    meta.append(glyph, document.createTextNode(`TALOS · ${state.realSession.currentRunModel || 'sessione reale'}`));
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    article.append(meta, copy);
    /*
     * ⭐⭐⭐ 29/8 — FASE J, TTS: un bottone per bubble, aggiunto UNA sola
     * volta qui in `meta` (mai ricreato dagli aggiornamenti streaming,
     * che toccano solo `.assistant-copy` — vedi la doc sopra la
     * funzione). Costruito solo se `speechSynthesis` esiste — mai un
     * bottone che sembra funzionare e non fa niente.
     */
    if (sintesiVoceDisponibile) {
      const ascolta = document.createElement('button');
      ascolta.type = 'button';
      ascolta.className = 'icon-btn assistant-listen-btn';
      ascolta.setAttribute('aria-label', 'Ascolta la risposta');
      ascolta.setAttribute('aria-pressed', 'false');
      ascolta.innerHTML = `<svg><use href="#i-play"/></svg>`;
      ascolta.addEventListener('click', () => leggiVoceAlta(copy.textContent || '', ascolta));
      meta.appendChild(ascolta);
    }
    conversation.appendChild(article);
    markMotionEnter(article);
    state.realSession.messageElements.set(messageId, article);
    return article;
  }

  /*
   * ⛔⛔⛔ 27/8, owner: "formatta in ux e ui prod friendly tutte le tool
   * call" — prima di questa cura, gli argomenti di uno scrivi(...)
   * arrivavano come JSON grezzo (`{"percorso":"...","contenuto":"riga
   * 1\nriga 2"}`) dumpato con .textContent dentro un <div>: gli \n DENTRO
   * la stringa JSON restano lettera per lettera "\n" a schermo (non sono
   * newline veri finché non si fa JSON.parse), e un <div> comunque non
   * preserva gli spazi bianchi anche quando lo sono. L'esito di `prova`
   * (righe vere, ✓/✗ una per test) finiva schiacciato sulla stessa riga
   * per lo stesso motivo. Risultato: un muro di testo illeggibile — non
   * "niente fuffa", ma "vero e illeggibile", ugualmente lontano da
   * prod-ready.
   */
  /**
   * ⭐⭐⭐ 30/8, owner: "vorrei che i comandi venissero raggruppati in un
   * collapse come fa Claude, con diff totale accanto, se ci clicco deve
   * avere la lista completa (comportamento attuale) ma in ogni modifica
   * ci deve essere il diff specifico per ogni file" — riferimento:
   * Claude Code stesso (screenshot allegati, non Harness Desktop — vedi
   * LEDGER-RAGGRUPPAMENTO-TOOL-CALL-DIFF-2026-08-30.md per la spec UX
   * dedotta riga per riga). Un batch = una sequenza ININTERROTTA di
   * tool-call consecutive nello stesso turno: apriBatchSeServe() lo
   * crea/riusa, chiudiBatchTool() lo chiude per sempre (mai riaperto —
   * la prossima tool-call ne apre uno NUOVO) alla prima cosa che non è
   * una tool-call vista in handleRealEvent (testo, un nuovo blocco di
   * ragionamento, fine turno).
   *
   * ⛔ Le righe SINGOLE (comportamento attuale, invariato) vivono DENTRO
   * `contenitore`, nascosto finché non si clicca la riga di riepilogo —
   * `appendToolNote` prende un contenitore opzionale proprio per questo,
   * default `#conversation` per ogni altro chiamante (Ragionamento,
   * ecc.) che non deve raggrupparsi.
   */
  function apriBatchSeServe() {
    if (state.realSession.batchAttivo) return state.realSession.batchAttivo;
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message tool-batch';
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'tool-note-summary tool-batch-summary';
    summary.setAttribute('aria-expanded', 'false');
    const glyph = document.createElement('span');
    glyph.className = 'talos-glyph';
    glyph.textContent = '⚙';
    const summaryText = document.createElement('span');
    summaryText.className = 'tool-note-summary-text';
    summaryText.textContent = 'Attività…';
    const diffBadge = document.createElement('span');
    diffBadge.className = 'tool-note-diff';
    diffBadge.hidden = true;
    const chevron = document.createElement('span');
    chevron.className = 'tool-note-chevron';
    chevron.textContent = '›';
    chevron.setAttribute('aria-hidden', 'true');
    summary.append(glyph, summaryText, diffBadge, chevron);
    const contenitore = document.createElement('div');
    contenitore.className = 'tool-batch-items';
    contenitore.hidden = true;
    summary.addEventListener('click', () => {
      const aperto = summary.getAttribute('aria-expanded') === 'true';
      summary.setAttribute('aria-expanded', String(!aperto));
      contenitore.hidden = aperto;
    });
    article.append(summary, contenitore);
    conversation.appendChild(article);
    markMotionEnter(article);
    scorriAllaBollaAppesa(article);
    const batch = {
      contenitore,
      summaryText,
      diffBadge,
      contatori: { letti: 0, cercati: 0, comandi: 0, comandiErrore: 0, nuovi: 0, modificati: 0, altro: 0, falliti: 0, diffAgg: 0, diffRim: 0 },
      // Lo Start non è un successo. Questi contatori descrivono soltanto
      // ciò che è ancora vivo; i totali sopra avanzano al ToolCallResult.
      inCorso: { letto: 0, cercato: 0, comando: 0, scrittura: 0, altro: 0 },
      // ⭐ FIFO: la bubble {summaryText,detail} di ogni `scrivi` in attesa
      // del proprio StateDelta (che porta prima/dopo — vedi updateRealReview
      // più sotto). Il kernel esegue le tool-call in sequenza, mai in
      // parallelo dentro lo stesso turno (nessuna delega qui: quella ha
      // il proprio sotto-agente, un contesto separato) — un ordine di
      // arrivo FIFO per gli SateDelta di scrittura è quindi affidabile,
      // non un'ipotesi ottimistica.
      scrittureInAttesa: [],
    };
    state.realSession.batchAttivo = batch;
    return batch;
  }

  /**
   * Mai più riaperto: la prossima tool-call, se arriva, apre un batch
   * NUOVO — coerente con "una sequenza ININTERROTTA" della doc sopra.
   * ⭐ Tiene il riferimento in `ultimoBatchChiuso`: il caso NORMALE è
   * che lo StateDelta di una scrittura arrivi DOPO che il testo che la
   * segue ha già chiuso il batch — updateRealReview lo cerca lì.
   */
  function chiudiBatchTool() {
    if (state.realSession.batchAttivo) state.realSession.ultimoBatchChiuso = state.realSession.batchAttivo;
    state.realSession.batchAttivo = null;
  }

  function categoriaAttrezzoPerBatch(nome) {
    if (nome === 'leggi') return 'letto';
    if (nome === 'cerca' || nome === 'elenca') return 'cercato';
    if (nome === 'shell' || nome === 'prova') return 'comando';
    if (nome === 'scrivi') return 'scrittura'; // risolto in nuovo/modificato solo quando arriva lo StateDelta — vedi updateRealReview
    return 'altro';
  }

  function formattaConteggioAttivita(categoria, totale) {
    if (categoria === 'letto') return totale === 1 ? '1 file letto' : `${totale} file letti`;
    if (categoria === 'cercato') return totale === 1 ? '1 ricerca completata' : `${totale} ricerche completate`;
    if (categoria === 'modificato') return totale === 1 ? '1 file modificato' : `${totale} file modificati`;
    if (categoria === 'nuovo') return totale === 1 ? '1 file creato' : `${totale} file creati`;
    if (categoria === 'comando') return totale === 1 ? '1 comando eseguito' : `${totale} comandi eseguiti`;
    if (categoria === 'fallito') return totale === 1 ? '1 attività non riuscita' : `${totale} attività non riuscite`;
    return totale === 1 ? '1 altra azione' : `${totale} altre azioni`;
  }

  function formattaAttivitaInCorso(categoria, totale) {
    if (categoria === 'letto') return `lettura di ${totale} file…`;
    if (categoria === 'cercato') return totale === 1 ? '1 ricerca in corso…' : `${totale} ricerche in corso…`;
    if (categoria === 'comando') return `esecuzione di ${totale} comand${totale === 1 ? 'o' : 'i'}…`;
    if (categoria === 'scrittura') return `scrittura di ${totale} file…`;
    return totale === 1 ? '1 attività in corso…' : `${totale} attività in corso…`;
  }

  /**
   * Il riepilogo testuale a elenco run-on ("Letto 3 file, modificato 2
   * file, eseguito 20 comandi (2 errori)...") — RICALCOLATO per intero
   * a ogni chiamata (i contatori sono lo stato vero, mai un delta da
   * sommare in giro): più semplice da tenere corretto, il costo è
   * trascurabile (poche decine di tool-call per batch, non migliaia.
   */
  function aggiornaRiassuntoBatch(batch) {
    const c = batch.contatori;
    const parti = [];
    if (c.letti > 0) parti.push(formattaConteggioAttivita('letto', c.letti));
    if (c.cercati > 0) parti.push(formattaConteggioAttivita('cercato', c.cercati));
    if (c.modificati > 0) parti.push(formattaConteggioAttivita('modificato', c.modificati));
    if (c.nuovi > 0) parti.push(formattaConteggioAttivita('nuovo', c.nuovi));
    if (c.comandi > 0) {
      const erroreParte = c.comandiErrore > 0 ? ` (${c.comandiErrore} error${c.comandiErrore === 1 ? 'e' : 'i'})` : '';
      parti.push(`${formattaConteggioAttivita('comando', c.comandi)}${erroreParte}`);
    }
    if (c.altro > 0) parti.push(formattaConteggioAttivita('altro', c.altro));
    if (c.falliti > 0) parti.push(formattaConteggioAttivita('fallito', c.falliti));
    for (const categoria of ['letto', 'cercato', 'comando', 'scrittura', 'altro']) {
      if (batch.inCorso[categoria] > 0) parti.push(formattaAttivitaInCorso(categoria, batch.inCorso[categoria]));
    }
    batch.summaryText.textContent = parti.length > 0
      ? `${parti[0].charAt(0).toUpperCase()}${parti[0].slice(1)}${parti.slice(1).map((p) => `, ${p}`).join('')}`
      : 'Attività…';
    // ⛔ SOLO se il batch ha scritto qualcosa — un batch di sole letture/ricerche/comandi non mostra un diff totale (spec owner, screenshot 1).
    if (c.diffAgg > 0 || c.diffRim > 0) {
      batch.diffBadge.hidden = false;
      batch.diffBadge.replaceChildren(
        textElement('span', 'add', `+${c.diffAgg}`),
        document.createTextNode(' '),
        textElement('span', 'del', `-${c.diffRim}`),
      );
    }
  }

  /**
   * ⭐ 27/8, owner: "ogni comando al server... va messo come fa Claude e
   * ChatGPT" (screenshot allegati) — una riga COLLASSATA con un riassunto
   * leggibile ("Scritto src/formatatore.mjs"), un chevron per espandere,
   * il dettaglio grezzo formattato dentro, chiuso finché non lo apri tu.
   * Un solo bubble per tool-call (non più uno per lo start e uno per il
   * risultato): ToolCallStart lo crea, ToolCallArgs/Result lo aggiornano
   * IN PLACE — vedi handleRealEvent, che tiene il riferimento in
   * state.realSession.toolCallNomi.
   *
   * ⭐⭐⭐ 30/8 — `contenitore` opzionale (default `#conversation`, invariato
   * per ogni chiamante che non raggruppa: Ragionamento, ecc.): quando una
   * tool-call fa parte di un batch (apriBatchSeServe), la riga nasce
   * DENTRO il contenitore del batch invece che direttamente in
   * conversazione — la riga in sé resta IDENTICA, cambia solo dove vive.
   */
  function appendToolNote(riassuntoIniziale, { classeExtra = '', glifo = '⚙', contenitore } = {}) {
    const conversation = contenitore ?? $('#conversation');
    const article = document.createElement('article');
    article.className = `message assistant-message compact-message real-tool-note${classeExtra ? ` ${classeExtra}` : ''}`;
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'tool-note-summary';
    summary.setAttribute('aria-expanded', 'false');
    const glyph = document.createElement('span');
    glyph.className = 'talos-glyph';
    glyph.textContent = glifo;
    const summaryText = document.createElement('span');
    summaryText.className = 'tool-note-summary-text';
    summaryText.textContent = riassuntoIniziale;
    const chevron = document.createElement('span');
    chevron.className = 'tool-note-chevron';
    chevron.textContent = '›';
    chevron.setAttribute('aria-hidden', 'true');
    summary.append(glyph, summaryText, chevron);
    const detail = document.createElement('div');
    detail.className = 'assistant-copy tool-note-detail';
    detail.hidden = true;
    summary.addEventListener('click', () => {
      const aperto = summary.getAttribute('aria-expanded') === 'true';
      summary.setAttribute('aria-expanded', String(!aperto));
      detail.hidden = aperto;
    });
    article.append(summary, detail);
    conversation.appendChild(article);
    markMotionEnter(article);
    window.setTimeout(() => {
      if (article.hidden) return;
      if (!$('#conversation')?.classList.contains('is-restoring')) article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' });
    }, 40);
    return { article, summaryText, detail };
  }

  function aggiornaVisibilitaRagionamento() {
    $$('.real-reasoning-note').forEach((article) => {
      article.hidden = !state.showReasoning;
      article.setAttribute('aria-hidden', String(!state.showReasoning));
    });
    const toggle = $('#showReasoningToggle');
    if (toggle) toggle.checked = state.showReasoning;
  }

  /*
   * ⭐⭐⭐ 28/8 — owner: "l'harness desktop diventa l'unica chat, con tutti i
   * tool come la generazione di artefatti". Ricerca fatta prima di
   * scrivere (bloom.security, "Inside Claude Artifacts", 28/8): l'origine
   * isolata + CSP restrittiva sono la difesa reale, non una promessa nel
   * testo del tool.
   *
   * ⛔⛔⛔ NON `srcdoc` — cambiato dopo la prima versione, trovato dal vivo:
   * un `about:srcdoc` EREDITA la CSP della pagina che lo crea (regola
   * dello standard), e questa pagina manda `script-src 'self'`
   * (SECURITY_HEADERS, http-app.mjs) — un `<meta>` CSP permissivo scritto
   * dentro il srcdoc veniva IGNORATO: script del modello mai eseguito,
   * nessuno stile applicato. Verificato con una sonda cross-frame
   * (postMessage dall'interno), tre varianti, zero falsi positivi. La
   * cura: `frame.src` punta a `/api/v1/artifacts/:id`, una risposta HTTP
   * VERA con la SUA propria CSP (vedi artifact-store.mjs) — nessuna
   * eredità dalla pagina che la incorpora, stessa architettura di
   * Claude Artifacts (origine/risposta separata).
   *
   * `sandbox="allow-scripts"` SENZA `allow-same-origin`/
   * `allow-top-navigation`/`allow-popups`/`allow-forms` resta invariato:
   * script permessi, ogni via di fuga negata — il confine vero.
   */
  function appendArtifactCard(titolo, id) {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message real-artifact-card';
    const header = document.createElement('div');
    header.className = 'artifact-card-header';
    const glyph = document.createElement('span');
    glyph.className = 'talos-glyph';
    glyph.textContent = '🧩';
    header.append(glyph, textElement('span', 'artifact-card-title', titolo || 'Artefatto'));
    const frame = document.createElement('iframe');
    frame.className = 'artifact-card-frame';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', titolo || 'Artefatto');
    frame.src = API(`/api/v1/artifacts/${encodeURIComponent(id)}`);
    article.append(header, frame);
    conversation.appendChild(article);
    markMotionEnter(article);
    scorriAllaBollaAppesa(article);
    return { frame };
  }

  /** Riassunto umano di un tool-call — "Scritto x.mjs", non "scrivi(...)"·. Gli argomenti sono opzionali (non ancora arrivati al momento di ToolCallStart). */
  // ⭐⭐⭐ FASE C (28/8) — piccola utility pura, prima chiamante: delega_sottotask, per tenere il riassunto "in corso" leggibile su un task lungo.
  function tronca(testo, massimo) {
    const t = String(testo ?? '');
    return t.length > massimo ? `${t.slice(0, massimo)}…` : t;
  }

  function riassuntoAttrezzoInCorso(nome, argomenti) {
    const a = argomenti || {};
    switch (nome) {
      case 'scrivi': return a.percorso ? `Scrittura di ${a.percorso}…` : 'Scrittura file…';
      case 'leggi': return a.percorso ? `Lettura di ${a.percorso}…` : 'Lettura file…';
      case 'cerca': {
        const criteri = [a.nome, a.testo].filter(Boolean).map((v) => `"${v}"`).join(' · ');
        return criteri ? `Ricerca di ${criteri}…` : 'Ricerca nel progetto…';
      }
      case 'elenca': return 'Elenco dei file…';
      case 'prova': return 'Esecuzione dei test…';
      case 'shell': return a.descrizione ? `${tronca(a.descrizione, 92)}…` : a.comando ? `Esecuzione di ${tronca(a.comando, 80)}…` : 'Esecuzione comando…';
      case 'naviga': return a.url ? `Apertura di ${tronca(a.url, 90)}…` : 'Apertura pagina…';
      case 'delega_sottotask': return a.task ? `Sotto-attività: ${tronca(a.task, 84)}…` : 'Avvio sotto-attività…';
      case 'memory_write': return a.title ? `Salvataggio memoria: ${tronca(a.title, 60)}…` : 'Salvataggio in memoria…';
      case 'research_start': return a.question ? `Ricerca approfondita: ${tronca(a.question, 60)}…` : 'Avvio ricerca approfondita…';
      default: return `${nome}(…)`;
    }
  }

  function riassuntoAttrezzo(nome, argomenti) {
    const a = argomenti || {};
    switch (nome) {
      case 'scrivi': return a.percorso ? `Scritto ${a.percorso}` : 'Scrittura file…';
      case 'leggi': return a.percorso ? `Letto ${a.percorso}` : 'Lettura file…';
      case 'cerca': {
        const criteri = [a.nome, a.testo].filter(Boolean).map((v) => `"${v}"`).join(' · ');
        return criteri ? `Cercato ${criteri}` : 'Ricerca nel progetto…';
      }
      case 'elenca': return 'Elenco dei file del progetto';
      case 'prova': return 'Esecuzione dei test…';
      /*
       * ⭐⭐⭐ 29/8 — owner, riferimento diretto al proprio Bash tool di
       * Claude Code: `descrizione` (nuova, opzionale — vedi lo schema
       * in talosHarness.mjs) è la riga preferita quando il modello la
       * manda — "Show changed files" invece di "git diff --stat". Il
       * comando grezzo resta la SECONDA scelta (PARITÀ: un modello
       * che non manda descrizione si comporta esattamente come oggi),
       * mai perso del tutto — resta visibile per intero nel corpo
       * dell'output quando il tool-call conclude (stesso posto di
       * sempre, la vista Terminale).
       */
      case 'shell': return a.descrizione ? tronca(a.descrizione, 80) : (a.comando ? `Comando: ${a.comando}` : 'Comando shell…');
      case 'naviga': return a.url ? `Pagina web: ${a.url}` : 'Lettura pagina web…';
      case 'web_search': return a.query ? `Ricerca web: "${a.query}"` : 'Ricerca web…';
      case 'artifact_create': return a.titolo ? `Artefatto: ${a.titolo}` : 'Creazione artefatto…';
      case 'document_create': return a.title ? `Documento: ${a.title}.${a.format || '?'}` : 'Creazione documento…';
      // ⭐⭐⭐ 29/8 — FASE H: il prompt è la parte che l'owner vuole vedere subito, stessa tronca corta già usata per delega_sottotask.
      case 'generate_image': return a.prompt ? `Immagine: ${tronca(a.prompt, 60)}` : 'Generazione immagine…';
      case 'time_now': return 'Data e ora correnti'; // ⭐ 28/8 — zero argomenti, nessun placeholder "…" da mostrare
      // ⭐⭐⭐ FASE C (28/8) — sub-agenti: il task è la parte che l'owner vuole vedere subito, tronca corta come già fatto per gli altri riassunti "in corso".
      case 'delega_sottotask': return a.task ? `Delega: ${tronca(a.task, 60)}` : 'Delega a un sotto-agente…';
      /*
       * ⛔⛔ 30/8, QA visiva (Task 8/11) — due casi mancanti, trovati dal
       * vivo (mostravano il nome grezzo "memory_write(…)"/mai
       * verificato per research_start). Forma degli argomenti letta
       * dagli eventi VERI persistiti (`ToolCallArgs`/`tool_calls`),
       * non indovinata: memory_write → {kind,title,content};
       * research_start → {depth,question}.
       */
      case 'memory_write': return a.title ? `Memoria: ${tronca(a.title, 60)}` : 'Salvataggio in memoria…';
      case 'research_start': return a.question ? `Ricerca approfondita: ${tronca(a.question, 60)}` : 'Avvio ricerca approfondita…';
      default: return `${nome}(…)`;
    }
  }

  /*
   * ⭐ Raffina il riassunto quando arriva l'ESITO — solo `prova` porta un
   * numero che vale la pena mostrare in testa (pass/fail), letto dal
   * testo reale del test runner (`node --test`, stesso formato ovunque
   * in questo progetto: "ℹ pass N" / "ℹ fail N"), mai inventato.
   */
  function riassuntoEsitoAttrezzo(nome, riassuntoBase, testoEsito) {
    // ⭐⭐⭐ FASE C (28/8) — sub-agenti: il riassunto del FIGLIO (o il motivo del rifiuto) è già il contenuto ESATTO del ToolCallResult (stesso meccanismo standard di ogni altro attrezzo — nessun evento nuovo, vedi LEDGER-FASE-C-SUBAGENTI.md), qui solo reso leggibile in un'unica riga.
    if (nome === 'delega_sottotask') {
      if (/^REFUSED\./.test(testoEsito || '')) return '✗ Delega rifiutata';
      return `🧩 Sotto-agente: ${tronca(testoEsito, 100)}`;
    }
    if (nome !== 'prova') return riassuntoBase;
    const pass = /ℹ?\s*pass\s+(\d+)/i.exec(testoEsito)?.[1];
    const fail = /ℹ?\s*fail\s+(\d+)/i.exec(testoEsito)?.[1];
    if (pass === undefined || fail === undefined) return riassuntoBase;
    return fail === '0' ? `✓ Test verdi — ${pass}/${pass}` : `✗ Test falliti — ${fail} su ${Number(pass) + Number(fail)}`;
  }

  function esitoAttrezzoFallito(nome, testoEsito) {
    const testo = String(testoEsito ?? '');
    if (nome === 'prova') return /ℹ?\s*fail\s+([1-9]\d*)/i.test(testo);
    if (nome === 'shell') return /(?:^|\n)exit\s+([1-9]\d*)\b/i.test(testo);
    return /^(?:REFUSED\.|ERROR\b|ERRORE\b|FAILED\b|FALLITO\b|NON RIUSCITO\b)/i.test(testo.trim());
  }

  function riassuntoAttrezzoConcluso(nome, argomenti, testoEsito, fallito) {
    const descrizioneModello = typeof argomenti?.descrizione === 'string' ? argomenti.descrizione.trim() : '';
    if (nome === 'shell' && descrizioneModello) {
      const descrizione = tronca(descrizioneModello, 92);
      return fallito ? `${descrizione} — non riuscito` : descrizione;
    }
    if (nome === 'delega_sottotask' || nome === 'prova') {
      return riassuntoEsitoAttrezzo(nome, riassuntoAttrezzo(nome, argomenti), testoEsito);
    }
    if (fallito) {
      if (nome === 'leggi') return 'Lettura non riuscita';
      if (nome === 'cerca' || nome === 'elenca') return 'Ricerca non riuscita';
      if (nome === 'scrivi') return 'Scrittura non riuscita';
      if (nome === 'shell') return '1 comando fallito';
      if (nome === 'naviga') return 'Navigazione non riuscita';
      return 'Attività non riuscita';
    }
    if (nome === 'leggi') return '1 file letto';
    if (nome === 'cerca') return '1 ricerca completata';
    if (nome === 'elenca') return '1 elenco completato';
    if (nome === 'scrivi') return '1 file scritto';
    if (nome === 'shell') return '1 comando eseguito';
    if (nome === 'naviga') return 'Navigazione completata';
    return riassuntoEsitoAttrezzo(nome, riassuntoAttrezzo(nome, argomenti), testoEsito);
  }

  /**
   * Argomenti di un tool-call, formattati: se il JSON è valido (lo è
   * sempre a fine trasmissione — questo backend manda gli argomenti in
   * un unico delta, non a token), ogni campo diventa "chiave: valore";
   * un valore multi-riga o lungo va in un blocco <pre><code> — newline
   * VERI, decodificati dal JSON.parse, non l'escape letterale. Se il
   * parse fallisce (un delta ancora incompleto, raro con questo
   * backend ma non impossibile), il testo grezzo resta leggibile in un
   * <pre> invece di sparire — mai un crash per un problema di forma.
   */
  function renderizzaArgomentiAttrezzo(contenitore, jsonGrezzo) {
    contenitore.replaceChildren();
    let argomenti;
    try { argomenti = JSON.parse(jsonGrezzo); } catch { argomenti = null; }
    if (!argomenti || typeof argomenti !== 'object') {
      const pre = document.createElement('pre');
      pre.className = 'tool-result-block';
      pre.appendChild(textElement('code', '', jsonGrezzo));
      contenitore.appendChild(pre);
      return;
    }
    for (const [chiave, valore] of Object.entries(argomenti)) {
      // La descrizione è già la label primaria della riga. Ripeterla nel
      // dettaglio toglierebbe spazio proprio a comando ed esito, che sono
      // l'evidenza tecnica utile quando l'owner espande il singolo step.
      if (chiave === 'descrizione') continue;
      const riga = document.createElement('div');
      riga.className = 'tool-arg-row';
      const testoValore = typeof valore === 'string' ? valore : JSON.stringify(valore);
      riga.appendChild(textElement('span', 'tool-arg-key', `${chiave}:`));
      if (testoValore.includes('\n') || testoValore.length > 80) {
        const pre = document.createElement('pre');
        pre.className = 'tool-result-block';
        pre.appendChild(textElement('code', '', testoValore));
        riga.appendChild(pre);
      } else {
        riga.appendChild(document.createTextNode(` ${testoValore}`));
      }
      contenitore.appendChild(riga);
    }
  }

  function appendStatusNote(text, isError = false) {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = `message assistant-message compact-message real-session-status${isError ? ' real-session-error' : ''}`;
    const meta = document.createElement('div');
    meta.className = 'assistant-meta';
    const glyph = document.createElement('span');
    glyph.className = 'talos-glyph';
    glyph.textContent = isError ? '!' : '✓';
    meta.append(glyph, document.createTextNode(isError ? 'TALOS · errore' : 'TALOS · concluso'));
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    copy.textContent = text;
    article.append(meta, copy);
    conversation.appendChild(article);
    markMotionEnter(article);
    scorriAllaBollaAppesa(article);
  }

  /**
   * ⭐⭐⭐ 28/8 — permesso "On request": descrive l'azione che il kernel sta
   * per fare, così l'owner decide sapendo COSA sta approvando — stessa
   * forma {tipo,percorso?,comando?,formato?} di verificaPermessoScrittura
   * (talosHarness.mjs), mai un "azione sconosciuta" generico quando il
   * campo giusto è già lì.
   */
  function descriviAzioneApprovazione(azione) {
    if (azione?.tipo === 'scrivi') return `Vuole scrivere il file: ${azione.percorso}`;
    if (azione?.tipo === 'shell') return `Vuole eseguire il comando: ${azione.comando}`;
    if (azione?.tipo === 'document_create') return `Vuole creare un documento (formato ${azione.formato || '?'})`;
    // ⭐⭐⭐ FASE B (28/8) — `prova` è il quarto attrezzo gated da verificaPermessoScrittura (trovato leggendo talosHarness.mjs): senza questo ramo, un permesso per-attrezzo `prova:'chiedi'` mostrava la card col fallback generico invece del comando VERO.
    if (azione?.tipo === 'prova') return `Vuole eseguire la suite di test: ${azione.comando}`;
    /*
     * ⛔⛔⛔ 30/8, QA visiva (Task 11) — caso mancante trovato dal vivo,
     * con la prova nell'evento grezzo persistito
     * (`"azione":{"tipo":"research_start"}`): la card di approvazione
     * mostrava il fallback TOTALMENTE generico per una ricerca
     * approfondita reale — l'esatto difetto che questa funzione dice di
     * voler evitare (vedi doc sopra).
     * ⛔ `azione.question` è quasi certamente SEMPRE assente oggi: il
     * commento in agui-events.mjs documenta la forma reale inviata dal
     * kernel come `{tipo, percorso?, comando?, formato?}` — un elenco
     * chiuso, senza spazio per `question` — e l'evento persistito
     * verificato qui sopra lo conferma (solo `tipo`). Il ramo con
     * `azione.question` resta per compatibilità futura (innocuo, non
     * inventato); il miglioramento VERO e verificabile oggi è che la
     * card nomina almeno il TIPO di azione ("ricerca approfondita"
     * invece di "un'azione che modifica qualcosa") — il topic esatto
     * richiederebbe un cambio lato kernel, fuori da questo repo.
     */
    if (azione?.tipo === 'research_start') return azione.question ? `Vuole avviare una ricerca approfondita: ${azione.question}` : 'Vuole avviare una ricerca approfondita.';
    return 'Vuole eseguire un\'azione che modifica qualcosa.';
  }

  /**
   * ⭐⭐⭐ 28/8 — la card interattiva del permesso "On request". Diversa da
   * appendToolNote/appendStatusNote: quelle raccontano cosa È già
   * successo, questa CHIEDE una decisione — talosHarness.mjs è DAVVERO
   * in pausa dentro verificaPermessoScrittura (session-registry.mjs
   * tiene la Promise aperta), non una simulazione: se nessuno risponde
   * mai, il giro resta onestamente fermo lì — stesso principio "mai un
   * timeout che nega travestito da decisione" già scritto in
   * session-registry.richiediApprovazione.
   *
   * Ricerca fatta prima di scrivere (REGOLA ZERO): Hermes Agent, il
   * primo competitor (vedi memoria [[harness-da-battere-uno-a-uno]]),
   * NON ha affatto un'approvazione interattiva — "there is no approval
   * prompt and no way to override from the chat UI" (la loro stessa
   * doc security.md). Questa card è esattamente il pareggio-e-supera.
   */
  function appendApprovalCard(requestId, azione) {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message real-approval-card';
    article.dataset.requestId = requestId;
    const meta = document.createElement('div');
    meta.className = 'assistant-meta';
    const glyph = document.createElement('span');
    glyph.className = 'talos-glyph';
    glyph.textContent = '⏸';
    meta.append(glyph, document.createTextNode('TALOS · in attesa di approvazione'));
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    copy.textContent = descriviAzioneApprovazione(azione);
    const azioniRiga = document.createElement('div');
    azioniRiga.className = 'sheet-actions';
    const negaBtn = document.createElement('button');
    negaBtn.type = 'button';
    negaBtn.className = 'secondary-btn';
    negaBtn.textContent = 'Nega';
    const approvaBtn = document.createElement('button');
    approvaBtn.type = 'button';
    approvaBtn.className = 'primary-btn';
    approvaBtn.textContent = 'Approva';
    /*
     * ⛔⛔⛔ 28/8, trovato dal vivo (screenshot ispezionato, non solo la
     * corsa dello script): "Approvato (da un altro client). — Approvato."
     * — il testo raddoppiava. Causa: DUE canali riportavano lo STESSO
     * fatto senza coordinarsi — questo click locale scriveva il testo
     * SUBITO dopo la POST, e l'evento SSE ApprovalResolved (che il
     * server manda SEMPRE, anche per la risposta di QUESTA stessa
     * scheda) arrivava per un canale indipendente e lo scriveva DI
     * NUOVO, senza sapere che era "lui stesso" ad averlo già fatto —
     * stessa famiglia di difetto già vista stanotte per i bubble
     * duplicati via `_sequenza`. Cura: il click locale disabilita SOLO
     * i bottoni (reattività immediata) — il testo/la rimozione dei
     * bottoni li fa SEMPRE e SOLO il case 'ApprovalResolved' quando
     * l'evento arriva davvero, un SOLO punto che scrive, mai due.
     */
    let rispostaDataDaQuestaScheda = false;
    const rispondi = async (approvato) => {
      negaBtn.disabled = true;
      approvaBtn.disabled = true;
      rispostaDataDaQuestaScheda = true;
      try {
        await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/approve`, { requestId, approvato });
        // ⛔ NIENT'ALTRO qui apposta — vedi il commento sopra: il case ApprovalResolved finalizza la card, sempre e solo lui.
      } catch (error) {
        rispostaDataDaQuestaScheda = false;
        negaBtn.disabled = false;
        approvaBtn.disabled = false;
        toast('Risposta non riuscita', error.message);
      }
    };
    negaBtn.addEventListener('click', () => rispondi(false));
    approvaBtn.addEventListener('click', () => rispondi(true));
    azioniRiga.append(negaBtn, approvaBtn);
    article.append(meta, copy, azioniRiga);
    conversation.appendChild(article);
    // ⭐ letto dal case 'ApprovalResolved' per distinguere "ho risposto io da questa scheda" da "ha risposto un altro client" — mai un secondo testo duplicato, mai una wording sbagliata.
    article._rispostaDataQui = () => rispostaDataDaQuestaScheda;
    markMotionEnter(article);
    scorriAllaBollaAppesa(article);
    return article;
  }

  /*
   * ⛔⛔ 27/8, trovato dalla pipeline QA visiva: le viste dedicate (allora
   * Terminale/Browser) non venivano ripulite al cambio sessione, e
   * mostravano i dati di UN'ALTRA sessione — corretto qui per Browser,
   * invariato sotto. Per il Terminale la cura è cambiata natura il 28/8
   * (vedi `scollegaTerminaleReale()` più sotto): quella vista oggi è una
   * PTY VERA, non più un log — "ripulire" significa disconnettere la
   * WebSocket e, se il tab è aperto, riconnettersi subito alla shell
   * della sessione nuova (LEDGER-TERMINALE-REALE.md).
   */
  function resettaSuperficiRealiDedicate() {
    scollegaTerminaleReale();
    if (state.view === 'terminal') apriVistaTerminaleReale();
    const browserShell = $('[data-view="browser"] .browser-shell');
    if (browserShell) {
      mostraPaginaBrowser(state.realSession.browserIndice); // 02/09 — stessa funzione della cronologia: con browserPagine vuoto rende lo stato vuoto onesto
    }
    /*
     * ⛔⛔⛔ 30/8, owner dal vivo: "nella sidebar di destra ci sono ancora
     * dei componenti mockup... il file tree ha ancora la struttura
     * mockup" — STESSA famiglia di difetto di Browser/Review qui sopra/
     * sotto, mai applicata al tab Files. `renderizzaAlberoReale()`
     * sostituisce questo contenuto per intero appena una sessione REALE
     * ha una radice (`state.realSession.id` + un RunStarted) — ma fra
     * "Nuova sessione" e quel momento (nessun id ancora, o una sessione
     * pendente senza id) il markup demo di index.html restava a
     * schermo per sempre, indistinguibile da una sessione vera. Un
     * placeholder onesto qui, sempre sostituito integralmente da
     * renderizzaAlberoReale() quando arriva la radice vera — mai un
     * ibrido fra i due.
     */
    {
      const fileTreeBox = $('#inspector-files .file-tree');
      if (fileTreeBox) fileTreeBox.replaceChildren(textElement('p', 'board-empty', 'Nessuna cartella ancora scelta — i file appariranno qui appena inizi una sessione.'));
      const demoBadgeFiles = $('.demo-surface-badge', $('[data-inspector-section="files"]'));
      if (demoBadgeFiles) demoBadgeFiles.hidden = true;
      syncFileTreeToolbar(false);
    }
    /*
     * ⛔⛔⛔ 27/8, trovato nell'ispezione visiva finale: una sessione VERA
     * senza nessuna scrittura (una domanda semplice, "chi sei?") mostrava
     * ANCORA "3 file modificati" con un diff rosso/verde — il markup demo
     * di index.html, mai una volta sostituito, perché
     * renderRealReviewList()/aggiornaSommarioReviewReale() partono SOLO da
     * un vero StateDelta (una vera scrittura) — una sessione senza
     * scritture non li chiama mai. Chiamarli qui, con reviewFiles GIÀ
     * azzerato sopra (nuovaGenerazioneSessione), li fa mostrare uno stato
     * onesto e vero ("0 file modificati") invece del demo mai ripulito —
     * stessa famiglia del difetto già corretto per Terminale/Browser.
     */
    renderRealReviewList();
    aggiornaSommarioReviewReale();
  }

  /*
   * ⭐⭐⭐ 28/8 — Terminale REALE. Owner: "deve essere un terminale vero e
   * proprio bash [...] che non ha limiti [...] usabile dall'utente con
   * le sue dita umane". Ledger completo, ricerca (Hermes su Windows monta
   * Git Bash dentro una PTY vera) e verifica empirica su questa macchina:
   * `.claude/LEDGER-TERMINALE-REALE.md`. xterm.js vendorizzato
   * (`vendor/xterm/`) + una WebSocket verso `pty-terminal.mjs` sul
   * backend (framing binario: byte 0 = dati grezzi, byte 1 = controllo
   * JSON — `TIPO_FRAME_DATI`/`TIPO_FRAME_CONTROLLO` in pty-terminal.mjs,
   * duplicati qui lato client perché questo bundle non è un modulo ES e
   * non può `import`-arli).
   *
   * ⛔ Un id STABILE per terminale: la sessione corrente quando ce n'è
   * una (il terminale segue "questa sessione", come si aspettava
   * l'owner nel bug segnalato), altrimenti un id standalone generato UNA
   * volta e riusato finché la scheda del browser resta aperta — aprire
   * il tab Terminale prima ancora di avviare un task dà comunque una
   * shell vera, mai un pannello vuoto in attesa di una sessione.
   */
  const TIPO_FRAME_DATI_CLIENT = 0;
  const TIPO_FRAME_CONTROLLO_CLIENT = 1;

  function statoTerminale() {
    if (!state.terminal) {
      state.terminal = {
        ws: null, idConnesso: null, term: null, fit: null, montato: false, standaloneId: null, resizeObserver: null, enforcementColore: null,
      };
    }
    return state.terminal;
  }

  function idTerminaleCorrente() {
    if (state.realSession.id) return state.realSession.id;
    const t = statoTerminale();
    if (!t.standaloneId) {
      t.standaloneId = window.crypto?.randomUUID?.() ?? `standalone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return t.standaloneId;
  }

  /** Tema TALOS letto dai token CSS veri (mai colori scritti a mano due volte) — la scala ANSI a 16 colori è la sola parte senza un token dedicato, intonata a mano allo stesso accent/superficie. */
  function temaTerminaleReale() {
    const stile = getComputedStyle(document.documentElement);
    const leggi = (nome, rip) => stile.getPropertyValue(nome).trim() || rip;
    return {
      background: leggi('--bg-deep', '#17181b'),
      foreground: leggi('--text-2', '#d6d2ca'),
      cursor: leggi('--accent', '#c08b3c'),
      cursorAccent: leggi('--bg-deep', '#17181b'),
      selectionBackground: leggi('--accent-soft', 'rgba(192,139,60,.3)'),
      black: '#1c1d20', red: '#e2685f', green: '#8fbf7f', yellow: '#c9a35e',
      blue: '#7aa2d6', magenta: '#c08bd0', cyan: '#7fc1c9', white: leggi('--text-2', '#d6d2ca'),
      brightBlack: '#54565c', brightRed: '#ef8981', brightGreen: '#a9d99b', brightYellow: leggi('--accent-2', '#d7a554'),
      brightBlue: '#96b8e6', brightMagenta: '#d6a6e2', brightCyan: '#9ad6dd', brightWhite: '#f1efe9',
    };
  }

  function codificaFrameClient(tipo, testo) {
    const corpo = new TextEncoder().encode(testo);
    const frame = new Uint8Array(corpo.length + 1);
    frame[0] = tipo;
    frame.set(corpo, 1);
    return frame;
  }

  function impostaChipTerminale(testo, stato) {
    const chip = $('#terminalStatusChip');
    if (!chip) return;
    chip.textContent = testo;
    chip.classList.toggle('success', stato === 'ok'); // stessa classe già usata da .status-chip altrove, non una seconda convenzione
    chip.classList.toggle('error', stato === 'error');
  }

  function inviaResizeTerminale() {
    const t = statoTerminale();
    if (!t.term || t.ws?.readyState !== WebSocket.OPEN) return;
    t.ws.send(codificaFrameClient(TIPO_FRAME_CONTROLLO_CLIENT, JSON.stringify({ tipo: 'resize', cols: t.term.cols, rows: t.term.rows })));
  }

  /** @returns {boolean} true se una xterm.js viva esiste (appena montata o già presente) — mai aprire la WebSocket (collegaTerminaleWs) se questo torna false: nessun posto dove scrivere l'output, e nei test/negli ambienti senza vendor/xterm caricato sarebbe una connessione di rete a vuoto. */
  function montaTerminaleSeServe() {
    const t = statoTerminale();
    if (t.montato) return true;
    const contenitore = $('#realTerminalMount');
    if (!contenitore || !window.Terminal || !window.FitAddon) {
      impostaChipTerminale('xterm.js non caricato', 'error'); // onesto: mai un pannello silenziosamente inerte
      return false;
    }
    const term = new window.Terminal({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: temaTerminaleReale(),
    });
    const fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(contenitore);
    /*
     * ⛔⛔⛔ 28/8 — trovato dal vivo: xterm.js v6 (core) ha SOLO un renderer
     * DOM, niente più canvas incluso. Il renderer DOM colora il testo
     * iniettando un `<style>` dinamico con regole `.xterm-fg-N` — ma la
     * CSP di questo server è `style-src 'self'` (niente `'unsafe-inline'`,
     * deliberato, vedi http-app.mjs), quindi il browser scarta quello
     * stylesheet in silenzio: la classe giusta finiva sullo span
     * (verificato: `class="xterm-fg-2"`), ma ZERO regole CSS la
     * definivano da nessuna parte — ogni carattere nello stesso colore.
     * `@xterm/addon-webgl` dipinge pixel GPU veri, niente CSS coinvolto:
     * stesso renderer che usa VS Code, non un ripiego. Se il contesto
     * WebGL non è disponibile (GPU assente/bloccata), si ricade sul
     * renderer DOM — funzionante, solo senza colori ANSI, dichiarato
     * onestamente via `t.enforcementColore`, mai un fallimento silenzioso.
     */
    try {
      // preserveDrawingBuffer:true — altrimenti il buffer WebGL si pulisce dopo ogni presentazione: qualunque lettura successiva dei pixel (screenshot, verifica) vedrebbe un canvas vuoto anche col rendering perfettamente corretto.
      const webgl = new window.WebglAddon.WebglAddon(true);
      webgl.onContextLoss(() => { webgl.dispose(); t.enforcementColore = 'dom (contesto WebGL perso)'; });
      term.loadAddon(webgl);
      t.enforcementColore = 'webgl';
    } catch {
      t.enforcementColore = 'dom (WebGL non disponibile)';
    }
    fit.fit();
    term.onData((dati) => {
      if (t.ws?.readyState === WebSocket.OPEN) t.ws.send(codificaFrameClient(TIPO_FRAME_DATI_CLIENT, dati));
    });
    /*
     * ⛔⛔⛔ 28/8 — trovato dal vivo: xterm.js ridimensiona SE STESSO dentro
     * l'elemento osservato — un `fit()` incondizionato ad ogni tick del
     * ResizeObserver, con un contenitore la cui altezza potesse dipendere
     * dal contenuto (`min-height`, corretto sotto in styles.css), produceva
     * un loop di retroazione (ogni fit rendeva il box un filo più alto,
     * il ResizeObserver lo notava, un altro fit...). `height` fissa in CSS
     * rompe il loop alla radice; questo guard resta come SECONDA difesa,
     * indipendente dalla prima: invia il resize alla PTY SOLO se cols/rows
     * sono DAVVERO cambiati, mai ad ogni tick — un tick che ricalcola lo
     * stesso valore (rumore di misura, non un vero cambiamento) non deve
     * generare traffico né, tantomeno, poter alimentare un loop.
     */
    const osservatore = new ResizeObserver(() => {
      const primaCols = term.cols;
      const primaRows = term.rows;
      fit.fit();
      if (term.cols !== primaCols || term.rows !== primaRows) inviaResizeTerminale();
    });
    osservatore.observe(contenitore);
    t.term = term;
    t.fit = fit;
    t.resizeObserver = osservatore;
    t.montato = true;
    return true;
  }

  /** Chiude la WS corrente (se c'è) e pulisce lo schermo — chiamata SOLO al cambio di id (nuova/altra sessione), mai per un timeout arbitrario: la shell "non ha limiti" per richiesta esplicita dell'owner. */
  function scollegaTerminaleReale() {
    const t = statoTerminale();
    if (t.ws) { t.ws.onclose = null; t.ws.close(); t.ws = null; t.idConnesso = null; }
    t.term?.clear();
    impostaChipTerminale('in attesa', null);
  }

  function collegaTerminaleWs() {
    const t = statoTerminale();
    const id = idTerminaleCorrente();
    if (t.ws && t.idConnesso === id) return; // già connesso a questo stesso id — un F5/riapertura del tab riaggancia, non riapre
    t.ws?.close();
    impostaChipTerminale('connessione…', null);
    const protocollo = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocollo}://${window.location.host}/api/v1/terminal/ws?id=${encodeURIComponent(id)}`);
    ws.binaryType = 'arraybuffer';
    t.ws = ws;
    t.idConnesso = id;
    ws.onopen = () => { impostaChipTerminale('connesso', 'ok'); inviaResizeTerminale(); };
    ws.onmessage = (evento) => {
      const buf = new Uint8Array(evento.data);
      if (buf.length === 0) return;
      const tipo = buf[0];
      const corpo = new TextDecoder().decode(buf.subarray(1));
      if (tipo === TIPO_FRAME_DATI_CLIENT) {
        t.term?.write(corpo);
        return;
      }
      try {
        const messaggio = JSON.parse(corpo);
        if (messaggio.evento === 'uscita') {
          t.term?.writeln(`\r\n[processo terminato, codice ${messaggio.codice}]`);
          impostaChipTerminale('terminato', 'error');
        }
      } catch { /* messaggio di controllo malformato: ignorato, mai un crash della connessione */ }
    };
    ws.onclose = () => { if (t.idConnesso === id) impostaChipTerminale('disconnesso', 'error'); };
  }

  /** Punto d'ingresso unico, chiamato da setView('terminal') e da resettaSuperficiRealiDedicate() quando il tab è già aperto. */
  function apriVistaTerminaleReale() {
    if (!montaTerminaleSeServe()) return; // niente xterm.js disponibile: niente WS aperta a vuoto (vale nei test, e in un deploy rotto)
    collegaTerminaleWs();
    requestAnimationFrame(() => statoTerminale().fit?.fit());
  }

  /**
   * ⭐ Blocco 6 (Browser), stralcio onesto — 27/8. Stesso pattern già in uso
   * per il Terminale: `naviga` (7° attrezzo, chiuso) è già visibile nella
   * chat generica come qualunque tool-call, ma la superficie DEDICATA
   * (`data-view="browser"`) mostrava un "device preview" fisso e finto — un
   * telefono con `TalosComposer.vue +28 −19`, un URL `127.0.0.1:4173/chat`
   * mai raggiunto davvero. Non è un iframe che carica la pagina vera
   * (`naviga` legge testo, non produce un DOM renderizzabile in sicurezza
   * qui) — è l'esito REALE della lettura, stesso testo che il modello ha
   * ricevuto, al posto dell'anteprima inventata.
   */
  function appendBrowserEntry(url, testo) {
    const pagine = state.realSession.browserPagine;
    pagine.push({ url, testo, quando: new Date().toISOString() });
    mostraPaginaBrowser(pagine.length - 1);
  }

  /** ⭐⭐⭐ 02/09 — mostra la pagina letta all'indice dato e allinea i controlli (indietro/avanti/apri/annota/copia). Senza pagine: stato vuoto onesto. */
  function mostraPaginaBrowser(indice) {
    const shell = $('[data-view="browser"] .browser-shell');
    if (!shell) return;
    const pagine = state.realSession.browserPagine;
    const pagina = pagine[indice] || null;
    state.realSession.browserIndice = pagina ? indice : -1;
    if (pagina) shell.dataset.reale = '1'; else delete shell.dataset.reale;
    const barraUrl = $('[data-view="browser"] .browser-url');
    if (barraUrl) {
      barraUrl.replaceChildren();
      const pulse = document.createElement('span');
      pulse.className = 'status-pulse';
      barraUrl.append(pulse, document.createTextNode(pagina ? pagina.url : '—'));
      barraUrl.title = pagina ? `Letta alle ${formattaOraSessione(pagina.quando)} · ${pagina.testo.length} caratteri` : '';
    }
    const anteprima = $('[data-view="browser"] .device-preview');
    if (anteprima) {
      anteprima.replaceChildren();
      if (pagina) {
        const blocco = document.createElement('pre');
        blocco.className = 'browser-real-output';
        blocco.textContent = pagina.testo;
        anteprima.append(blocco);
      } else {
        anteprima.append(textElement('p', 'board-empty', 'Nessuna pagina letta in questa sessione. Quando TALOS legge una pagina web, il testo ricevuto compare qui.'));
      }
    }
    const contatore = pagine.length > 1 && pagina ? ` (${indice + 1} di ${pagine.length})` : '';
    const abilita = (azione, ok) => { const b = $(`[data-browser-action="${azione}"]`); if (b) b.disabled = !ok; };
    abilita('back', Boolean(pagina) && indice > 0);
    abilita('forward', Boolean(pagina) && indice < pagine.length - 1);
    abilita('open', Boolean(pagina) && /^https?:\/\//i.test(pagina.url));
    abilita('annotate', Boolean(pagina));
    abilita('copy', Boolean(pagina));
    const back = $('[data-browser-action="back"]');
    if (back) back.setAttribute('aria-label', `Pagina letta precedente${contatore}`);
  }

  /**
   * ⭐ Piano §1.3-BIS.T (seconda metà) — il comando diretto (`!comando` nel
   * composer): un endpoint dedicato (`POST .../shell`), FUORI dal ciclo del
   * modello — l'owner sceglie il comando, non un attrezzo che il modello
   * decide di chiamare. Riusa esattamente lo schema già in uso per
   * `resumeSession`: POST, poi una connessione SSE FRESCA (mai quella
   * vecchia — provato nel backend che una connessione già aperta da prima
   * non riceve questi eventi dal vivo).
   */
  async function runDirectShell(comando, silenzioso) {
    if (!state.realSession.id) {
      toast('Nessuna sessione reale attiva', 'Avvia un task dal corpus prima di usare un comando diretto.');
      return;
    }
    const sessionId = state.realSession.id;
    const taskId = state.realSession.taskId;
    try {
      await apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/shell`, { comando });
      const generation = nuovaGenerazioneSessione({ continua: true });
      state.realSession.taskId = taskId;
      collegaEventiSessione(sessionId, generation);
      aggiornaElencoSessioniReali();
      if (!silenzioso) toast('Comando inviato', comando);
    } catch (error) {
      toast('Comando non eseguito', error.message);
    }
  }

  /**
   * ⭐⭐⭐ 27/8, owner: "un vero formattatore diff, importantissimo".
   * LCS classico (programmazione dinamica) fra le righe di `prima` e
   * `dopo` — lo stesso significato di un diff unificato (`git diff`), non
   * inventato qui: righe uguali restano 'ctx', quelle solo in `prima`
   * diventano 'del' (rosse), quelle solo in `dopo` 'add' (verdi).
   *
   * ⛔ Guardia di taglia, non un dettaglio: la DP costa O(righePrima ×
   * righeDopo) in tempo E in spazio. `RIGHE_MASSIME_DIFF` è un punto di
   * partenza dichiarato come tale (stesso spirito di
   * `SOGLIA_SCRITTURE_SENZA_PROVA` in talosHarness.mjs — non una misura),
   * non ricalcolato su un caso reale. Sopra la soglia si torna al
   * comportamento onesto di prima di oggi (righe tutte 'add'/'ctx', mai
   * '-'): un tentativo di diff parziale che sembri completo e non lo sia
   * sarebbe la stessa fuffa già tolta ovunque in questo file.
   */
  const RIGHE_MASSIME_DIFF = 1500;

  function calcolaDiffRighe(prima, dopo) {
    const a = prima.split('\n');
    const b = dopo.split('\n');
    if (a.length > RIGHE_MASSIME_DIFF || b.length > RIGHE_MASSIME_DIFF) return null;
    const n = a.length;
    const m = b.length;
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const righe = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { righe.push(['ctx', a[i]]); i += 1; j += 1; }
      else if (lcs[i + 1][j] >= lcs[i][j + 1]) { righe.push(['del', a[i]]); i += 1; }
      else { righe.push(['add', b[j]]); j += 1; }
    }
    while (i < n) { righe.push(['del', a[i]]); i += 1; }
    while (j < m) { righe.push(['add', b[j]]); j += 1; }
    return righe;
  }

  /**
   * Numero di riga (del file DOPO la scrittura — 'ctx'/'add' lo hanno, una
   * riga 'del' no: non esiste più in quel file, non un numero inventato) +
   * un marcatore +/-/spazio, come prefisso testuale della riga stessa —
   * stesso pattern di `renderReviewFile` sotto (uno `<span>` per riga,
   * nessuna colonna CSS dedicata da costruire).
   */
  function formattaRigheConNumero(righe) {
    let numero = 0;
    return righe.map(([tipo, testo]) => {
      if (tipo !== 'del') numero += 1;
      const colNumero = tipo === 'del' ? ''.padStart(4) : String(numero).padStart(4);
      const marcatore = tipo === 'add' ? '+' : tipo === 'del' ? '-' : ' ';
      return [tipo, `${colNumero} ${marcatore} ${testo}`];
    });
  }

  /**
   * ⭐⭐⭐ 28/8, owner: "una modale di esportazione in diversi formati, in
   * modo che se c'è qualche errore io ti possa esportare interamente la
   * conversazione con errori e output tecnici". Ricerca fatta prima di
   * scrivere (REGOLA ZERO): `/export` di Claude Code stesso produce
   * Markdown per default (non JSON), e sono documentati bug reali dove
   * dichiara successo su un file VUOTO o una trascrizione TRONCATA a
   * metà (github.com/anthropics/claude-code#52733, #45996, #42290) —
   * cursor-session (strumento di terze parti per esportare sessioni
   * Cursor) esporta md/json/yaml proprio "per il debugging". Da qui le
   * due scelte sotto: Markdown come formato leggibile pensato per
   * essere incollato in chat, JSON come il payload grezzo già esistente
   * (byte per byte, mai alterato).
   *
   * ⛔ Walk sequenziale dello STESSO array `eventi` che `handleRealEvent`
   * consuma dal vivo (stessi nomi di campo, stesse forme — verificati
   * leggendo quel codice, non assunti). Differenza deliberata rispetto
   * alla UI dal vivo: qui l'ESITO di ogni tool-call non è mai troncato
   * (la UI tronca a 4000 caratteri per lo schermo — questo file esiste
   * apposta per i casi in cui quel troncamento nasconderebbe l'errore
   * vero), e ogni tipo di evento NON riconosciuto esplicitamente finisce
   * comunque nell'output come JSON grezzo (mai un evento silenziosamente
   * scartato — esattamente il tipo di perdita silenziosa che la ricerca
   * sopra ha trovato nell'export di Claude Code stesso).
   */
  function costruisciTrascrizioneMarkdown(esportato) {
    const righe = [];
    const testoBuffer = new Map();
    const ragionamentoBuffer = new Map();
    const toolBuffer = new Map();

    const recinto = (testo) => {
      const piuLunga = (String(testo).match(/`{3,}/g) || []).reduce((max, m) => Math.max(max, m.length), 3);
      return '`'.repeat(piuLunga + 1);
    };
    const blocco = (testo, linguaggio = '') => { const f = recinto(testo); return `${f}${linguaggio}\n${testo}\n${f}`; };
    const descriviTask = (input) => {
      if (!input) return '(nessun dettaglio)';
      if (input.comandoDiretto) return `Comando diretto: \`${input.comandoDiretto}\``;
      if (input.consegna) return `${input.seguito ? '**Follow-up:** ' : ''}${input.consegna}`;
      return blocco(JSON.stringify(input, null, 2), 'json');
    };

    righe.push(`# Trascrizione sessione TALOS Harness`, '');
    righe.push(`- **Sessione:** ${esportato.nome || esportato.taskId || esportato.sessionId}`);
    righe.push(`- **Id:** \`${esportato.sessionId}\``);
    righe.push(`- **Modello:** ${esportato.modello || '(default)'}`);
    righe.push(`- **Avviata:** ${esportato.avviataAlle || '?'}`);
    righe.push(`- **Conclusa:** ${esportato.conclusa ? 'sì' : 'no'}`);
    if (esportato.forkDa) righe.push(`- **Fork da:** \`${esportato.forkDa}\``);
    righe.push(`- **Eventi totali:** ${Array.isArray(esportato.eventi) ? esportato.eventi.length : 0}`, '');

    if (!Array.isArray(esportato.eventi) || esportato.eventi.length === 0) {
      righe.push('> ⛔ Nessun evento registrato per questa sessione.');
      return righe.join('\n');
    }

    let numeroGiro = 0;
    for (const evento of esportato.eventi) {
      switch (evento.type) {
        case 'RunStarted': {
          numeroGiro += 1;
          righe.push(`## Giro ${numeroGiro}`, '');
          if (evento.contesto?.modello) righe.push(`- **Modello del giro:** ${evento.contesto.modello}`);
          if (evento.contesto?.reasoning?.effort) righe.push(`- **Ragionamento:** ${evento.contesto.reasoning.effort}`);
          if (evento.contesto?.permessi) righe.push(`- **Permessi del giro:** ${evento.contesto.permessi}`);
          righe.push('', descriviTask(evento.input), '');
          break;
        }
        /*
         * ⛔ 28/8 — trovato SUBITO da una verifica dal vivo (una sessione
         * reale, non i miei fixture a mano): TextMessageStart/
         * ReasoningMessageStart cadevano nel `default` e comparivano come
         * "evento non riconosciuto" — non sbagliato (niente è perso), ma
         * rumore inutile: sono marcatori d'inizio senza contenuto proprio,
         * il testo vero arriva coi Content/End già gestiti sotto. Stessa
         * lezione di sempre: un fixture scritto a mano non copre quello che
         * un giro vero emette davvero.
         */
        case 'TextMessageStart':
        case 'ReasoningMessageStart': {
          break;
        }
        case 'TextMessageContent': {
          testoBuffer.set(evento.messageId, (testoBuffer.get(evento.messageId) || '') + evento.delta);
          break;
        }
        case 'TextMessageEnd': {
          const testo = testoBuffer.get(evento.messageId);
          if (testo !== undefined) { righe.push('**Assistente:**', '', testo, ''); testoBuffer.delete(evento.messageId); }
          break;
        }
        case 'ReasoningMessageContent': {
          ragionamentoBuffer.set(evento.messageId, (ragionamentoBuffer.get(evento.messageId) || '') + evento.delta);
          break;
        }
        case 'ReasoningMessageEnd': {
          const pensiero = ragionamentoBuffer.get(evento.messageId);
          if (pensiero !== undefined) { righe.push('<details><summary>💭 Ragionamento</summary>', '', pensiero, '', '</details>', ''); ragionamentoBuffer.delete(evento.messageId); }
          break;
        }
        case 'ToolCallStart': {
          toolBuffer.set(evento.toolCallId, { nome: evento.toolCallName, argomenti: '' });
          break;
        }
        case 'ToolCallArgs': {
          const info = toolBuffer.get(evento.toolCallId);
          if (info) info.argomenti += evento.delta;
          break;
        }
        case 'ToolCallResult': {
          const info = toolBuffer.get(evento.toolCallId) || { nome: '(sconosciuto)', argomenti: '' };
          let argFormattati = info.argomenti;
          try { argFormattati = JSON.stringify(JSON.parse(info.argomenti), null, 2); } catch { /* args non-JSON o incompleti: mostrati grezzi, mai persi */ }
          righe.push(`**🔧 ${info.nome}**`, '', 'Argomenti:', blocco(argFormattati || '(nessuno)', 'json'), '', 'Esito (completo, mai troncato):', blocco(String(evento.content ?? '')), '');
          toolBuffer.delete(evento.toolCallId);
          break;
        }
        case 'StateDelta': {
          const operazione = evento.delta?.[0];
          if (operazione?.path === '/usage') {
            righe.push(`_Utilizzo token aggiornato: ${blocco(JSON.stringify(operazione.value), 'json')}_`, '');
          } else if (operazione?.path?.startsWith('/file/')) {
            const percorso = operazione.path.replace(/^\/file\//, '');
            righe.push(`✏️ **File ${operazione.op === 'add' ? 'creato' : 'modificato'}:** \`${percorso}\` _(contenuto completo nel formato JSON)_`, '');
          } else {
            righe.push(`_StateDelta:_ ${blocco(JSON.stringify(evento.delta), 'json')}`, '');
          }
          break;
        }
        case 'ArtifactCreated': {
          righe.push(`📦 **Artefatto creato:** ${evento.titolo || '(senza titolo)'} (\`${evento.id}\`)`, '');
          break;
        }
        case 'WorkspaceChanged': {
          const elenco = Array.isArray(evento.percorsi) ? evento.percorsi.join(', ') : '(percorsi non specificati)';
          righe.push(`📁 _Cambiamento esterno nel workspace: ${elenco}_`, '');
          break;
        }
        case 'QueuedMessageDelivered': {
          righe.push(`⏭️ **Follow-up dalla coda:**`, '', evento.testo ?? '', '');
          break;
        }
        case 'ApprovalRequested': {
          righe.push(`⏸ **Approvazione richiesta:** ${descriviAzioneApprovazione(evento.azione)}`, '');
          break;
        }
        case 'ApprovalResolved': {
          righe.push(`_Approvazione ${evento.approvato ? 'CONCESSA' : 'NEGATA'}._`, '');
          break;
        }
        case 'RunFinished': {
          righe.push('— giro concluso —', '');
          break;
        }
        case 'RunError': {
          righe.push(`> ⛔ **ERRORE${evento.code ? ` [${evento.code}]` : ''}:** ${evento.message}`, '');
          break;
        }
        default: {
          // ⛔ mai un evento silenziosamente scartato — vedi il commento di testa
          righe.push(`_Evento non riconosciuto \`${evento.type}\`:_`, blocco(JSON.stringify(evento), 'json'), '');
        }
      }
    }
    return righe.join('\n');
  }

  function scaricaTesto(testo, nomeFile, mime) {
    const blob = new Blob([testo], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeFile; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  /*
   * ⛔⛔⛔ 30/8, QA visiva (Task 12, difetto B, "Alta" gravità) — trovato
   * dal vivo, con le prove: `calcola_sconto_scaglioni` (scritta da un
   * task il mattino) sparita in silenzio quando un task successivo ha
   * riscritto lo STESSO file per aggiungere un'altra funzione — "tutti
   * i test passano" non lo segnalava, perché il numero di test era
   * semplicemente più basso di prima, non rosso. `scrivi` sostituisce
   * il file per intero (Capability hub, Task 9) — il rischio è nella
   * FORMA del tool, non in un modello specifico.
   * ⛔ La cura NON può stare nel cancello semantico vero (talosHarness.mjs,
   * il KERNEL — fuori da questo repo, verificato con una ricerca
   * mirata prima di scrivere questo commento: zero riscontri qui). Può
   * stare QUI: `operazione.prima` è già il contenuto VERO del file
   * PRIMA della scrittura (vedi doc sotto) — lo stesso dato che serve
   * per un diff serve anche per accorgersi se una funzione/classe
   * dichiarata PRIMA non compare più DOPO. Un'euristica per riga,
   * multi-linguaggio ma conservativa (SOLO `def`/`class`/`function` a
   * colonna zero — non un parser, non un blocco, un AVVISO visibile:
   * un refactor legittimo che rinomina o consolida deve restare
   * possibile, l'owner decide guardando l'avviso, non il tool al posto
   * suo).
   */
  const REGEX_SIMBOLI_TOP_LEVEL = /^(?:export\s+)?(?:async\s+)?(?:def|class|function)\s+(\w+)/;
  function simboliDichiarati(testo) {
    const trovati = new Set();
    for (const riga of String(testo ?? '').split('\n')) {
      const m = REGEX_SIMBOLI_TOP_LEVEL.exec(riga);
      if (m) trovati.add(m[1]);
    }
    return trovati;
  }
  function simboliSpariti(prima, dopo) {
    const primaSet = simboliDichiarati(prima);
    const dopoSet = simboliDichiarati(dopo);
    return [...primaSet].filter((nome) => !dopoSet.has(nome));
  }

  /**
   * ⭐ Piano §1.3, riga Review — ogni scrittura reale aggiorna la scheda
   * Review già esistente, non solo la conversazione. Una voce PER
   * percorso, così un task che scrive più file resta tutto ispezionabile.
   *
   * ⭐⭐⭐ 27/8 — `operazione.prima` (quando presente: vedi agui-events.mjs,
   * campo non-standard aggiunto apposta) è il contenuto VERO del file
   * prima di questa scrittura. Un file nuovo ha `prima: null` — diff
   * contro stringa vuota, ogni riga naturalmente 'add', stesso identico
   * risultato di prima senza un caso speciale in più da mantenere.
   */
  function updateRealReview(delta) {
    const operazione = delta?.[0];
    if (!operazione || typeof operazione.path !== 'string') return;
    const percorso = operazione.path.replace(/^\/file\//, '');
    const dopo = String(operazione.value ?? '');
    const haPrima = 'prima' in operazione;
    const righeGrezze = haPrima ? calcolaDiffRighe(operazione.prima ?? '', dopo) : null;
    const righe = righeGrezze
      // ⛔ senza "prima" (chiamante vecchio, o file troppo grande per la DP): stesso
      // comportamento onesto di prima di oggi, MAI un diff che sembra vero e non lo è.
      ?? dopo.split('\n').map((riga) => [operazione.op === 'add' ? 'add' : 'ctx', riga]);
    // ⛔⛔⛔ 30/8 — vedi il blocco di doc sopra REGEX_SIMBOLI_TOP_LEVEL: solo su una riscrittura di un file ESISTENTE (haPrima), mai su un file nuovo (nulla può "sparire" da niente).
    const simboliPersi = haPrima ? simboliSpariti(operazione.prima ?? '', dopo) : [];
    state.realSession.reviewFiles.set(percorso, {
      path: percorso,
      nuovo: operazione.op === 'add',
      diffVero: righeGrezze !== null,
      code: formattaRigheConNumero(righe),
      simboliPersi,
    });
    renderRealReviewList();
    renderReviewFile(`real:${percorso}`);
    aggiornaSommarioReviewReale();
    /*
     * ⭐⭐⭐ 30/8, owner: "in ogni modifica ci deve essere il diff
     * specifico per ogni file (segni +n e -n)" — il diff PER-RIGA sulla
     * tool-call `scrivi` stessa, dentro il batch collassato (spec
     * screenshot 2: "Modificato app.js +16 -1"). FIFO: la bubble più
     * vecchia ancora in attesa — vedi la doc su apriBatchSeServe sul
     * perché l'ordine di arrivo è affidabile.
     * ⛔ Il caso NORMALE è che il batch sia già CHIUSO quando questo
     * StateDelta arriva (il testo che segue la scrittura lo chiude
     * prima) — `chiudiBatchTool()` tiene `ultimoBatchChiuso` proprio
     * per questo: la riga e il batch a cui apparteneva DAVVERO restano
     * raggiungibili, mai il batch (nuovo, sbagliato) che è aperto ORA.
     */
    if (righeGrezze !== null) {
      const agg = righe.filter(([tipo]) => tipo === 'add').length;
      const rim = righe.filter(([tipo]) => tipo === 'del').length;
      // ⛔ prima il batch ancora aperto (raro: lo StateDelta ha battuto il testo che lo chiude), poi l'ultimo appena chiuso (il caso normale) — mai perso, mai assegnato al batch sbagliato.
      const batch = [state.realSession.batchAttivo, state.realSession.ultimoBatchChiuso]
        .find((b) => b?.scrittureInAttesa.length > 0);
      const bubbleScrittura = batch?.scrittureInAttesa.shift();
      if (bubbleScrittura) {
        const diffSpan = document.createElement('span');
        diffSpan.className = 'tool-note-diff';
        diffSpan.append(textElement('span', 'add', `+${agg}`), document.createTextNode(' '), textElement('span', 'del', `-${rim}`));
        bubbleScrittura.summaryText.after(diffSpan);
        if (operazione.op === 'add') batch.contatori.nuovi += 1; else batch.contatori.modificati += 1;
        batch.contatori.diffAgg += agg;
        batch.contatori.diffRim += rim;
        aggiornaRiassuntoBatch(batch);
      }
    }
  }

  /**
   * ⭐ Le quattro cifre in testa alla Review erano demo fisse (+68/−31/6-6-
   * test/Basso) anche durante una sessione vera — la stessa disonestà
   * dell'etichetta "nuovo" già corretta sopra, un livello più in alto.
   * ⛔ "aggiunte"/"rimozioni" (righe di un diff vero) restano fuori: come
   * documentato sopra `updateRealReview`, `talosHarness.mjs` non passa il
   * "prima" a `onScrittura`, quindi non esiste un diff riga-per-riga da
   * contare — inventarlo sarebbe lo stesso bluff che questa riga corregge.
   * Ciò che è REALMENTE noto oggi è quanti file sono nuovi e quanti
   * modificati (lo stesso conteggio già dietro l'etichetta per-file).
   * ⛔ "test"/"rischio" restano onestamente "—": l'esito di `prova` è
   * testo libero, non ancora strutturato (piano §1.3, riga Review) — un
   * numero qui sarebbe inventato, non misurato.
   */
  function aggiornaSommarioReviewReale() {
    const voci = [...state.realSession.reviewFiles.values()];
    const nuovi = voci.filter((f) => f.nuovo).length;
    const modificati = voci.length - nuovi;
    const impostaTesto = (id, testo) => { const el = $(`#${id}`); if (el) el.textContent = testo; };
    impostaTesto('reviewSummaryNuovi', String(nuovi));
    impostaTesto('reviewSummaryModificati', String(modificati));
    impostaTesto('reviewSummaryTest', '—');
    impostaTesto('reviewSummaryRischio', '—');
    const copia = $('#copyAllDiffs');
    if (copia) copia.disabled = voci.length === 0;
    if (voci.length === 0) {
      state.reviewFileCorrente = null;
      if (diffPath) diffPath.textContent = '—';
      if (diffCode) diffCode.replaceChildren();
      $('#diffPre')?.setAttribute('hidden', '');
      $('#diffEmpty')?.removeAttribute('hidden');
      $('#reviewSymbolWarning')?.remove();
      $$('[data-review-action]').forEach((b) => { b.disabled = true; });
    }
  }

  /** ⭐ 02/09 — il diff di TUTTI i file scritti in questa sessione come testo unificato semplice (per incollarlo in una PR, un messaggio, una nota). */
  function testoDiffCompleto() {
    return [...state.realSession.reviewFiles.values()].map((file) => [
      `### ${file.path}${file.nuovo ? ' (nuovo)' : ''}`,
      ...file.code.map(([kind, text]) => text),
      '',
    ].join('\n')).join('\n');
  }

  /** ⭐ 02/09 — scrive nel composer (senza inviare) e porta il fuoco lì: è il gesto "Commenta"/"Annota" — la persona completa e decide se mandare. */
  function preparaCommentoNelComposer(testo) {
    if (!composerInput) return;
    const attuale = composerInput.value;
    composerInput.value = attuale.trim() ? `${attuale.replace(/\s+$/, '')}\n${testo}` : testo;
    composerInput.dispatchEvent(new Event('input', { bubbles: true }));
    setView('chat');
    closePanels();
    composerInput.focus();
    composerInput.setSelectionRange(composerInput.value.length, composerInput.value.length);
  }

  /**
   * ⭐ Ricostruisce `.file-review-list` con UNA voce per file reale scritto
   * finora in questa sessione, sostituendo le voci demo la prima volta che
   * esiste almeno una scrittura vera.
   */
  function renderRealReviewList() {
    const contenitore = $('[data-view="diff"] .file-review-list');
    if (!contenitore) return;
    const voci = [...state.realSession.reviewFiles.values()];
    const ultimoPercorso = voci.at(-1)?.path;
    contenitore.replaceChildren(...voci.map((file) => {
      const attiva = file.path === ultimoPercorso;
      const button = document.createElement('button');
      button.className = `file-review${attiva ? ' active' : ''}`;
      button.dataset.reviewFile = `real:${file.path}`;
      button.setAttribute('aria-pressed', String(attiva));
      const etichetta = document.createElement('span');
      const svgNs = 'http://www.w3.org/2000/svg';
      const icona = document.createElementNS(svgNs, 'svg');
      const uso = document.createElementNS(svgNs, 'use');
      uso.setAttribute('href', '#i-diff'); // ⛔ mai innerHTML: costruito nodo per nodo
      icona.append(uso);
      etichetta.append(icona, textElement('strong', '', file.path.split('/').pop()));
      button.append(etichetta, textElement('span', 'diff-stats', `${file.nuovo ? 'nuovo' : 'modificato'} · ${file.code.length} righe`));
      // ⛔⛔⛔ 30/8 — vedi il blocco di doc su REGEX_SIMBOLI_TOP_LEVEL/simboliSpariti: un avviso VISIBILE, non un blocco, quando la riscrittura fa sparire funzioni/classi che c'erano prima.
      if (file.simboliPersi?.length > 0) {
        button.append(textElement('span', 'diff-stats review-symbol-warning', `⚠ ${file.simboliPersi.length} simbol${file.simboliPersi.length === 1 ? 'o sparito' : 'i spariti'}`));
      }
      button.addEventListener('click', () => {
        $$('.file-review', contenitore).forEach((f) => { f.classList.remove('active'); f.setAttribute('aria-pressed', 'false'); });
        button.classList.add('active');
        button.setAttribute('aria-pressed', 'true');
        renderReviewFile(button.dataset.reviewFile);
      });
      return button;
    }));
    if (voci.length === 0) {
      const vuoto = textElement('p', 'board-empty review-empty', 'Nessun file scritto finora.');
      vuoto.id = 'reviewEmptyList';
      contenitore.appendChild(vuoto);
    }
    const titolo = $('[data-view="diff"] .view-heading h2');
    if (titolo) titolo.textContent = voci.length === 0 ? 'Nessuna modifica in questa sessione' : `${voci.length} file modificat${voci.length === 1 ? 'o' : 'i'}`;
  }

  /**
   * ⭐⭐⭐ 27/8, owner: "un componente allo stato dell'arte" per il pannello
   * Files, "legato al tema attuale" — sostituisce il vecchio "un livello
   * con su/giù" con un albero VERO: più cartelle aperte insieme, stato
   * git (nuovo/modificato, incrociato con reviewFiles — la stessa mappa
   * che la Review già usa), ricerca dal vivo. Approvato dall'owner su
   * mockup dopo ricerca web (ARIA APG treeview — role=tree/treeitem, UN
   * tabstop; GitHub Primer TreeView — chevron compatto, icone leading
   * coerenti, stato mai solo a colore; virtualizzazione per repo grandi —
   * react-arborist/headless-tree, non necessaria qui per il motivo sotto).
   *
   * ⛔ Il caricamento resta A RICHIESTA, un livello alla volta
   * (GET /api/v1/sessions/:id/tree?percorso=..., leggiAlberoWorkspace in
   * workspace-tree.mjs, INVARIATA) — la lezione già in memoria
   * (talos-non-vede-i-file-del-corpus-storia: un dump ricorsivo esplode
   * PRIMA di essere utile a guardare) non cambia con un componente più
   * bello. `treeCache` ricorda i livelli già scaricati in QUESTA sessione
   * (mai due fetch per la stessa cartella finché non cambia qualcosa
   * sotto), `treeOpen` ricorda quali sono aperti — così un redraw (dopo
   * una nuova scrittura) riapre da solo tutto quello che l'utente aveva
   * già aperto, senza richiedere niente di nuovo alla rete.
   *
   * ⛔ La RICERCA filtra SOLO ciò che è già stato caricato — dichiarato
   * onestamente nell'hint, mai un "cerca ovunque" che in realtà scarica
   * tutto il workspace pur di rispondere: sarebbe lo stesso dump
   * ricorsivo vietato sopra, solo nascosto dietro una barra di ricerca.
   */
  function statoFileAlbero(percorsoCompleto) {
    const voce = state.realSession.reviewFiles.get(percorsoCompleto);
    if (!voce) return null;
    return voce.nuovo ? 'new' : 'modified';
  }

  function alberoInAnteprima() {
    return !state.realSession.id && Boolean(state.realSession.previewProjectId);
  }

  function syncFileTreeToolbar(enabled = Boolean(state.realSession.id) && !alberoInAnteprima()) {
    for (const id of ['fileTreeNewFile', 'fileTreeNewFolder', 'fileTreeRefresh', 'fileTreeCollapse']) {
      const button = $(`#${id}`);
      if (button) button.disabled = !enabled;
    }
  }

  function cartellaSelezionataAlbero() {
    const selected = $('#inspector-files .ft-row.ft-selected');
    const node = selected?.closest('.ft-node');
    if (!node) return '';
    const path = node.dataset.percorso || '';
    if (node.hasAttribute('aria-expanded')) return path;
    return path.includes('/') ? path.split('/').slice(0, -1).join('/') : '';
  }

  async function refreshSessionFileTree() {
    if (!state.realSession.id || alberoInAnteprima()) return;
    state.realSession.treeCache.clear();
    await renderizzaAlberoReale();
    toast('File aggiornati', 'Il workspace è stato riletto.');
  }

  async function collapseSessionFileTree() {
    if (!state.realSession.id || alberoInAnteprima()) return;
    state.realSession.treeOpen.clear();
    salvaImpostazioniAlbero();
    await renderizzaAlberoReale();
  }

  // Stato di sola interfaccia, separato dai dati della sessione: come VS Code
  // ricorda espansioni e filtro per workspace, mai contenuti o percorsi nuovi.
  const DESKTOP_SETTINGS_KEY = 'talos.harness.desktop.settings.v1';
  const UI_FONT_SCALE_FACTORS = { xsmall: .8, small: .9, default: 1, large: 1.15, xlarge: 1.3 };
  const CHAT_FONT_SCALE_SIZES = { xcompact: '0.875rem', compact: '0.9375rem', balanced: '1.0625rem', expanded: '1.1875rem' };
  const TALOS_THEME_IDS = ['forge', 'paper', 'terminal', 'aurora', 'glacier', 'ember', 'atlas', 'noir', 'signal', 'violet', 'claudius', 'basicus', 'telemetry', 'calm'];
  const TALOS_SCENE_IDS = ['follow-theme', ...TALOS_THEME_IDS];
  const COLOR_MODE_IDS = ['system', 'dark', 'light'];
  const MOTION_MODE_IDS = ['off', 'static', 'simple', 'complex', 'adaptive'];
  const MOTION_QUALITY_IDS = ['low', 'balanced', 'high', 'adaptive'];
  const MOTION_PROFILE_IDS = ['preset', 'minimal', 'expressive', 'custom', 'off'];
  const MOTION_EASING_IDS = ['precise', 'soft', 'elastic-light', 'linear', 'cinematic'];
  const DESKTOP_APPEARANCE_DEFAULTS = {
    themePreset: 'calm', colorMode: 'system', sceneOverride: 'follow-theme',
    uiFontScale: 'default', chatFontScale: 'xcompact', composerShape: 'standard',
    composerPlus: 'drawer', messageStyle: 'sections', streamingAnimation: 'fade',
    windowPresentation: 'drawer', immersiveHeader: false, chatFullWidth: false, reducedMotion: false,
    backgroundMotion: true, interfaceMotion: true, motionMode: 'adaptive',
    motionQuality: 'balanced', motionSpeed: 100, motionIntensity: 20,
    motionGlow: 10, motionDensity: 100, motionDepth: 92, motionTrails: 50,
    motionContrast: 80, motionParallax: 20, pauseWhenHidden: true,
    respectDataSaver: true, motionProfile: 'preset', motionEasing: 'precise',
    motionDuration: 50, motionUiIntensity: 65, motionStagger: 40,
    motionWindows: true, motionSurfaces: true, motionNavigation: true,
    motionComposer: true, motionMessages: true, motionFeedback: true,
  };
  const DESKTOP_CHAT_DEFAULTS = {
    model: '', effort: null, showReasoning: false,
    permissions: 'Workspace write', permessiPerAttrezzo: {},
  };
  const TALOS_THEME_TOKENS = {
    forge: { bg: '#201d1a', panel: '#2b2621', accent: '#c08b3c', text: '#f5efe6', muted: '#b5a89a', border: '#4b3e31', radius: '14px', font: 'Instrument Sans' },
    paper: { bg: '#f5f1e8', panel: '#fffdf8', accent: '#9b5b2a', text: '#24211e', muted: '#756e65', border: '#d9d0c3', radius: '10px', font: 'Instrument Sans' },
    terminal: { bg: '#101714', panel: '#16231e', accent: '#67d391', text: '#e5f6ec', muted: '#8ba99a', border: '#2b4a3a', radius: '6px', font: 'JetBrains Mono' },
    aurora: { bg: '#171629', panel: '#24233e', accent: '#a995ff', text: '#f1efff', muted: '#aaa6c8', border: '#44416c', radius: '16px', font: 'Instrument Sans' },
    glacier: { bg: '#111c25', panel: '#1b2a37', accent: '#8fd8f3', text: '#eef9ff', muted: '#9eb7c4', border: '#345064', radius: '14px', font: 'Instrument Sans' },
    ember: { bg: '#211719', panel: '#302022', accent: '#ef8b57', text: '#fff1eb', muted: '#c6a39a', border: '#5b3534', radius: '14px', font: 'Instrument Sans' },
    atlas: { bg: '#151b29', panel: '#202c43', accent: '#74a8ff', text: '#edf4ff', muted: '#a4b2c9', border: '#3a4e75', radius: '12px', font: 'Instrument Sans' },
    noir: { bg: '#0e0e10', panel: '#19191c', accent: '#d4d4d8', text: '#f5f5f5', muted: '#929297', border: '#35353a', radius: '4px', font: 'Instrument Sans' },
    signal: { bg: '#101b1e', panel: '#17272b', accent: '#5ce1e6', text: '#e9ffff', muted: '#91b9bc', border: '#2f555a', radius: '10px', font: 'Instrument Sans' },
    violet: { bg: '#1c1625', panel: '#2a2038', accent: '#d3a6ff', text: '#fbf3ff', muted: '#b5a0c3', border: '#523c68', radius: '18px', font: 'Instrument Sans' },
    claudius: { bg: '#211e1a', panel: '#302b24', accent: '#d2a96d', text: '#f8f1e4', muted: '#b6aa98', border: '#514638', radius: '12px', font: 'Instrument Sans' },
    basicus: { bg: '#202124', panel: '#2b2c30', accent: '#aeb4c0', text: '#f1f3f5', muted: '#9ea4ad', border: '#45484f', radius: '8px', font: 'Instrument Sans' },
    telemetry: { bg: '#101b1d', panel: '#18292b', accent: '#75d0a4', text: '#e7fff2', muted: '#96b8a8', border: '#315448', radius: '10px', font: 'JetBrains Mono' },
    calm: { bg: '#1e1f22', panel: '#25262a', accent: '#c08b3c', text: '#f3f0e9', muted: '#9c9da2', border: '#36373b', radius: '12px', font: 'Instrument Sans' },
  };
  const MOTION_RANGE_DEFS = {
    motionSpeed: [25, 200], motionIntensity: [0, 100], motionGlow: [0, 100],
    motionDensity: [25, 150], motionDepth: [0, 100], motionTrails: [0, 100],
    motionContrast: [0, 100], motionParallax: [0, 100], motionDuration: [50, 150],
    motionUiIntensity: [0, 100], motionStagger: [0, 120],
  };
  function enumValue(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
  function numberValue(value, [min, max], fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
  }
  function boolValue(value, fallback) { return typeof value === 'boolean' ? value : fallback; }
  function normalizzaAspettoDesktop(value) {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const safe = { ...DESKTOP_APPEARANCE_DEFAULTS };
    safe.themePreset = enumValue(record.themePreset, TALOS_THEME_IDS, safe.themePreset);
    safe.colorMode = enumValue(record.colorMode, COLOR_MODE_IDS, safe.colorMode);
    safe.sceneOverride = enumValue(record.sceneOverride, TALOS_SCENE_IDS, safe.sceneOverride);
    safe.uiFontScale = enumValue(record.uiFontScale, Object.keys(UI_FONT_SCALE_FACTORS), safe.uiFontScale);
    safe.chatFontScale = enumValue(record.chatFontScale, Object.keys(CHAT_FONT_SCALE_SIZES), safe.chatFontScale);
    safe.composerShape = enumValue(record.composerShape, ['classic', 'standard', 'compact'], safe.composerShape);
    safe.composerPlus = enumValue(record.composerPlus, ['drawer', 'menu'], safe.composerPlus);
    safe.messageStyle = enumValue(record.messageStyle, ['sections', 'bubbles'], safe.messageStyle);
    safe.streamingAnimation = enumValue(record.streamingAnimation, ['typewriter', 'fade'], safe.streamingAnimation);
    safe.windowPresentation = enumValue(record.windowPresentation, ['drawer', 'fullscreen'], safe.windowPresentation);
    safe.motionMode = enumValue(record.motionMode, MOTION_MODE_IDS, safe.motionMode);
    safe.motionQuality = enumValue(record.motionQuality, MOTION_QUALITY_IDS, safe.motionQuality);
    safe.motionProfile = enumValue(record.motionProfile, MOTION_PROFILE_IDS, safe.motionProfile);
    safe.motionEasing = enumValue(record.motionEasing, MOTION_EASING_IDS, safe.motionEasing);
    for (const [key, range] of Object.entries(MOTION_RANGE_DEFS)) safe[key] = numberValue(record[key], range, safe[key]);
    for (const key of ['immersiveHeader', 'chatFullWidth', 'reducedMotion', 'backgroundMotion', 'interfaceMotion', 'pauseWhenHidden', 'respectDataSaver', 'motionWindows', 'motionSurfaces', 'motionNavigation', 'motionComposer', 'motionMessages', 'motionFeedback']) safe[key] = boolValue(record[key], safe[key]);
    return safe;
  }
  function normalizzaPreferenzeChatDesktop(value) {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const effortAmmessi = ['xhigh', 'high', 'medium', 'low', 'minimal', 'none'];
    const permessiAmmessi = ['Read only', 'Workspace write', 'On request', 'Full access'];
    const toolAmmessi = ['scrivi', 'prova', 'shell', 'document_create', 'generate_image'];
    const valoriTool = ['sempre', 'chiedi', 'nega'];
    const override = record.permessiPerAttrezzo && typeof record.permessiPerAttrezzo === 'object' && !Array.isArray(record.permessiPerAttrezzo)
      ? Object.fromEntries(Object.entries(record.permessiPerAttrezzo).filter(([tool, valore]) => toolAmmessi.includes(tool) && valoriTool.includes(valore)))
      : {};
    return {
      model: typeof record.model === 'string' && record.model.length <= 160 ? record.model : '',
      effort: effortAmmessi.includes(record.effort) ? record.effort : null,
      showReasoning: boolValue(record.showReasoning, false),
      permissions: permessiAmmessi.includes(record.permissions) ? record.permissions : DESKTOP_CHAT_DEFAULTS.permissions,
      permessiPerAttrezzo: override,
    };
  }
  function normalizzaWorkspaces(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([key, record]) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return [key, { expandedPaths: [], filter: '' }];
      const expandedPaths = Array.isArray(record.expandedPaths)
        ? record.expandedPaths.filter((path) => typeof path === 'string' && path.length <= 1024).slice(0, 200)
        : [];
      return [key, { expandedPaths, filter: typeof record.filter === 'string' ? record.filter.slice(0, 256) : '' }];
    }));
  }
  function leggiImpostazioniDesktop() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(DESKTOP_SETTINGS_KEY) || '{}');
      return {
        version: 1,
        appearance: normalizzaAspettoDesktop(raw?.appearance),
        chat: normalizzaPreferenzeChatDesktop(raw?.chat),
        workspaces: normalizzaWorkspaces(raw?.workspaces),
      };
    } catch {
      return { version: 1, appearance: { ...DESKTOP_APPEARANCE_DEFAULTS }, chat: { ...DESKTOP_CHAT_DEFAULTS }, workspaces: {} };
    }
  }
  function salvaImpostazioniDesktop(value) {
    try {
      const safe = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      const appearance = normalizzaAspettoDesktop(safe.appearance);
      const sparseAppearance = Object.fromEntries(Object.entries(appearance).filter(([key, value]) => value !== DESKTOP_APPEARANCE_DEFAULTS[key]));
      window.localStorage.setItem(DESKTOP_SETTINGS_KEY, JSON.stringify({
        version: 1,
        appearance: sparseAppearance,
        chat: normalizzaPreferenzeChatDesktop(safe.chat),
        workspaces: normalizzaWorkspaces(safe.workspaces),
      }));
    } catch {
      // Le preferenze perse non devono impedire la navigazione del workspace.
    }
  }
  function aggiornaAspettoDesktop(patch) {
    const documento = leggiImpostazioniDesktop();
    documento.appearance = normalizzaAspettoDesktop({ ...documento.appearance, ...patch });
    salvaImpostazioniDesktop(documento);
    applicaAspettoDesktop(documento.appearance);
  }
  function salvaPreferenzeChatDesktop() {
    const documento = leggiImpostazioniDesktop();
    documento.chat = normalizzaPreferenzeChatDesktop({
      model: state.model,
      effort: state.effort,
      showReasoning: state.showReasoning,
      permissions: state.permissions,
      permessiPerAttrezzo: state.permessiPerAttrezzo,
    });
    salvaImpostazioniDesktop(documento);
  }
  function inizializzaPreferenzeChatDesktop() {
    const preferenze = leggiImpostazioniDesktop().chat;
    state.model = preferenze.model;
    state.effort = preferenze.effort;
    state.showReasoning = preferenze.showReasoning;
    state.permissions = preferenze.permissions;
    state.permessiPerAttrezzo = { ...preferenze.permessiPerAttrezzo };
  }
  let backgroundAnimationRunning = false;
  const backgroundInteractionPauseReasons = new Set();
  let backgroundScrollResumeTimer = null;
  const BACKGROUND_SCROLL_RESUME_DELAY_MS = 220;
  let appearanceMediaQuery = null;
  let handleAppearanceMediaChange = null;
  let handleAppearanceVisibilityChange = null;
  function resolvedColorMode(mode) {
    if (mode !== 'system') return mode;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function applicaThemeDesktop(safe) {
    const host = HOST();
    const root = document.documentElement;
    const requestedTheme = safe.themePreset;
    const scene = safe.sceneOverride === 'follow-theme' ? requestedTheme : safe.sceneOverride;
    const mode = resolvedColorMode(safe.colorMode);
    const theme = TALOS_THEME_TOKENS[requestedTheme] || TALOS_THEME_TOKENS.calm;
    host.dataset.talosTheme = requestedTheme;
    host.dataset.talosColorMode = safe.colorMode;
    host.dataset.talosResolvedColorMode = mode;
    host.dataset.talosScene = scene;
    if (host !== root) {
      root.dataset.talosTheme = requestedTheme;
      root.dataset.talosColorMode = safe.colorMode;
      root.dataset.talosResolvedColorMode = mode;
      root.dataset.talosScene = scene;
    }
    const light = mode === 'light';
    const colors = light ? { bg: '#f5f3ee', panel: '#fffdf8', accent: theme.accent, text: '#24211e', muted: '#756e65', border: '#d9d0c3' } : theme;
    const mix = (primary, weight, secondary) => `color-mix(in srgb, ${primary} ${weight}%, ${secondary})`;
    const semantic = {
      codeBg: mix(colors.bg, light ? 94 : 78, '#000'),
      panelSoft: mix(colors.panel, light ? 92 : 88, colors.bg),
      card: mix(colors.panel, light ? 94 : 86, colors.text),
      windowBg: mix(colors.panel, light ? 97 : 82, colors.text),
      assistantText: mix(colors.text, 82, colors.muted),
      borderStrong: mix(colors.border, 72, colors.text),
      accentHover: mix(colors.accent, 84, light ? '#000' : '#fff'),
      accentSoft: mix(colors.accent, 14, 'transparent'),
      accentBorder: mix(colors.accent, 34, 'transparent'),
      accentText: '#151411',
      secondary: light ? '#426d64' : mix(colors.muted, 72, '#7cc7b4'),
      success: light ? '#3f7650' : '#77a884',
      successSoft: mix(light ? '#3f7650' : '#77a884', 13, 'transparent'),
      successBorder: mix(light ? '#3f7650' : '#77a884', 28, 'transparent'),
      danger: light ? '#a9463d' : '#d87d72',
      dangerSoft: mix(light ? '#a9463d' : '#d87d72', 13, 'transparent'),
      info: light ? '#41688f' : '#7f9fc4',
      ring: colors.accent,
      ringSoft: mix(colors.accent, 12, 'transparent'),
    };
    const style = host.style;
    style.setProperty('--talos-background', colors.bg);
    style.setProperty('--talos-code-bg', semantic.codeBg);
    style.setProperty('--talos-panel', colors.panel);
    style.setProperty('--talos-panel-soft', semantic.panelSoft);
    style.setProperty('--talos-card', semantic.card);
    style.setProperty('--talos-window-bg', semantic.windowBg);
    style.setProperty('--talos-accent', colors.accent);
    style.setProperty('--talos-accent-hover', semantic.accentHover);
    style.setProperty('--talos-accent-soft', semantic.accentSoft);
    style.setProperty('--talos-accent-border', semantic.accentBorder);
    style.setProperty('--talos-accent-text', semantic.accentText);
    style.setProperty('--talos-text', colors.text);
    style.setProperty('--talos-assistant-text', semantic.assistantText);
    style.setProperty('--talos-muted', colors.muted);
    style.setProperty('--talos-border', colors.border);
    style.setProperty('--talos-border-strong', semantic.borderStrong);
    style.setProperty('--talos-secondary', semantic.secondary);
    style.setProperty('--talos-success', semantic.success);
    style.setProperty('--talos-success-soft', semantic.successSoft);
    style.setProperty('--talos-success-border', semantic.successBorder);
    style.setProperty('--talos-danger', semantic.danger);
    style.setProperty('--talos-danger-soft', semantic.dangerSoft);
    style.setProperty('--talos-info', semantic.info);
    style.setProperty('--talos-ring', semantic.ring);
    style.setProperty('--talos-ring-soft', semantic.ringSoft);
    style.setProperty('--talos-radius-card', theme.radius);
    style.setProperty('--talos-radius-control', theme.radius);
    style.setProperty('--talos-font-ui', theme.font);
    root.style.setProperty('color-scheme', mode === 'light' ? 'light' : 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', colors.bg);
  }
  function aggiornaMotionDesktop(safe) {
    const host = HOST();
    const style = host.style;
    style.setProperty('--talos-motion-speed', String(safe.motionSpeed / 100));
    style.setProperty('--talos-motion-intensity', String(safe.motionIntensity / 100));
    style.setProperty('--talos-motion-glow', String(safe.motionGlow / 100));
    style.setProperty('--talos-motion-density', String(safe.motionDensity / 100));
    style.setProperty('--talos-motion-depth', String(safe.motionDepth / 100));
    style.setProperty('--talos-motion-trails', String(safe.motionTrails / 100));
    style.setProperty('--talos-motion-contrast', String(safe.motionContrast / 100));
    style.setProperty('--talos-motion-parallax', String(safe.motionParallax / 100));
    const velocitaSfondo = Math.max(0.1, safe.motionSpeed / 100);
    style.setProperty('--talos-background-cycle', `${Math.round(36_000 / velocitaSfondo)}ms`);
    style.setProperty('--talos-background-shift-x', `${Math.round(safe.motionParallax * 0.8)}px`);
    style.setProperty('--talos-background-shift-y', `${Math.round(safe.motionParallax * 0.5)}px`);
    style.setProperty('--talos-motion-duration-scale', String(safe.motionDuration / 100));
    style.setProperty('--talos-motion-ui-intensity', String(safe.motionUiIntensity / 100));
    style.setProperty('--talos-motion-stagger', `${safe.motionStagger}ms`);
    const profilo = { minimal: .72, expressive: 1.2, custom: 1, preset: 1, off: 0 }[safe.motionProfile] ?? 1;
    const scala = (safe.motionDuration / 100) * profilo;
    const durata = (base) => `${Math.max(1, Math.round(base * scala))}ms`;
    const easing = {
      precise: 'cubic-bezier(.2,.7,.2,1)', soft: 'cubic-bezier(.22,1,.36,1)',
      'elastic-light': 'cubic-bezier(.34,1.28,.64,1)', linear: 'linear', cinematic: 'cubic-bezier(.16,1,.3,1)',
    }[safe.motionEasing];
    style.setProperty('--talos-motion-duration-control', durata(160));
    style.setProperty('--talos-motion-duration-surface-enter', durata(180));
    style.setProperty('--talos-motion-duration-surface-exit', durata(150));
    style.setProperty('--talos-motion-duration-disclosure', durata(180));
    style.setProperty('--talos-motion-duration-popover', durata(180));
    style.setProperty('--talos-motion-duration-tab-change', durata(180));
    style.setProperty('--talos-motion-duration-composer-expand', durata(180));
    style.setProperty('--talos-motion-duration-composer-collapse', durata(150));
    style.setProperty('--talos-motion-duration-message-insert', durata(180));
    style.setProperty('--talos-motion-duration-response-progress', durata(1600));
    style.setProperty('--talos-motion-duration-success-confirm', durata(280));
    style.setProperty('--talos-motion-duration-theme-transition', durata(220));
    style.setProperty('--talos-motion-ease', easing);
    style.setProperty('--talos-motion-ease-exit', safe.motionEasing === 'linear' ? 'linear' : 'ease-in');
    host.dataset.talosMotionMode = safe.motionMode;
    host.dataset.talosMotionQuality = safe.motionQuality;
    host.dataset.talosMotionProfile = safe.motionProfile;
    host.dataset.talosMotionEasing = safe.motionEasing;
    const backgroundOff = !safe.backgroundMotion || safe.motionMode === 'off' || safe.reducedMotion;
    host.classList.toggle('background-motion-off', backgroundOff);
    document.body.classList.toggle('background-motion-off', backgroundOff);
    host.classList.toggle('interface-motion-off', !safe.interfaceMotion || safe.motionProfile === 'off' || safe.reducedMotion);
    host.classList.toggle('reduce-motion', safe.reducedMotion);
    document.body.classList.toggle('reduce-motion', safe.reducedMotion);
    for (const key of ['windows', 'surfaces', 'navigation', 'composer', 'messages', 'feedback']) host.classList.toggle(`motion-${key}-off`, !safe[`motion${key[0].toUpperCase()}${key.slice(1)}`]);
    for (const [key, range] of Object.entries(MOTION_RANGE_DEFS)) {
      const input = $(`#${key}Range`);
      const output = $(`#${key}Output`);
      if (input) input.value = String(safe[key]);
      if (output) output.textContent = String(safe[key]);
    }
    const ids = {
      backgroundMotion: 'backgroundMotionToggle', interfaceMotion: 'interfaceMotionToggle', pauseWhenHidden: 'pauseWhenHiddenToggle', respectDataSaver: 'respectDataSaverToggle', reducedMotion: 'reducedMotionToggle', motionWindows: 'motionWindowsToggle', motionSurfaces: 'motionSurfacesToggle', motionNavigation: 'motionNavigationToggle', motionComposer: 'motionComposerToggle', motionMessages: 'motionMessagesToggle', motionFeedback: 'motionFeedbackToggle',
    };
    for (const [key, id] of Object.entries(ids)) { const input = $(`#${id}`); if (input) input.checked = safe[key]; }
    for (const [key, id] of Object.entries({ motionMode: 'motionModeSelect', motionQuality: 'motionQualitySelect', motionProfile: 'motionProfileSelect', motionEasing: 'motionEasingSelect' })) { const input = $(`#${id}`); if (input) input.value = safe[key]; }
    const sceneEl = $('#sceneOverrideSelect'); if (sceneEl) sceneEl.value = safe.sceneOverride;
  }
  function fermaBackgroundDesktop() {
    backgroundAnimationRunning = false;
    HOST().classList.remove('background-motion-active');
    HOST().classList.add('background-motion-paused');
    document.body.classList.remove('background-motion-active');
    document.body.classList.add('background-motion-paused');
  }
  function setBackgroundInteractionPause(reason, paused) {
    const changed = paused
      ? !backgroundInteractionPauseReasons.has(reason)
      : backgroundInteractionPauseReasons.has(reason);
    if (!changed) return;
    if (paused) backgroundInteractionPauseReasons.add(reason);
    else backgroundInteractionPauseReasons.delete(reason);
    avviaBackgroundDesktop();
  }
  function syncBackgroundDialogPause() {
    setBackgroundInteractionPause('dialog', commandDialog.open || sheetDialog.open);
  }
  function queueBackgroundScrollPause() {
    setBackgroundInteractionPause('scroll', true);
    if (backgroundScrollResumeTimer !== null) window.clearTimeout(backgroundScrollResumeTimer);
    backgroundScrollResumeTimer = window.setTimeout(() => {
      backgroundScrollResumeTimer = null;
      setBackgroundInteractionPause('scroll', false);
    }, BACKGROUND_SCROLL_RESUME_DELAY_MS);
  }
  function avviaBackgroundDesktop() {
    const appearance = normalizzaAspettoDesktop(leggiImpostazioniDesktop().appearance);
    const animabile = appearance.backgroundMotion
      && appearance.motionMode !== 'off'
      && appearance.motionMode !== 'static'
      && !appearance.reducedMotion;
    const osservabile = !(appearance.pauseWhenHidden && document.visibilityState === 'hidden')
      && !(appearance.respectDataSaver && navigator.connection?.saveData);
    const attivo = animabile && osservabile && backgroundInteractionPauseReasons.size === 0;
    const host = HOST();
    host.classList.toggle('background-motion-active', animabile);
    host.classList.toggle('background-motion-paused', !attivo);
    document.body.classList.toggle('background-motion-active', animabile);
    document.body.classList.toggle('background-motion-paused', !attivo);
    backgroundAnimationRunning = attivo;
  }
  function aggiornaBackgroundDesktop() { fermaBackgroundDesktop(); avviaBackgroundDesktop(); }
  function applicaAspettoDesktop(appearance) {
    const safe = normalizzaAspettoDesktop(appearance);
    const host = HOST();
    applicaThemeDesktop(safe);
    host.style.setProperty('--talos-ui-font-scale', String(UI_FONT_SCALE_FACTORS[safe.uiFontScale]));
    host.style.setProperty('--talos-chat-font-size', CHAT_FONT_SCALE_SIZES[safe.chatFontScale]);
    host.dataset.talosComposerShape = safe.composerShape;
    host.dataset.talosComposerPlus = safe.composerPlus;
    host.dataset.talosMessageStyle = safe.messageStyle;
    host.dataset.talosStreamingAnimation = safe.streamingAnimation;
    host.dataset.talosWindowPresentation = safe.windowPresentation;
    host.classList.toggle('immersive-header', safe.immersiveHeader);
    host.classList.toggle('chat-full-width', safe.chatFullWidth);
    aggiornaMotionDesktop(safe);
    const ui = $('#uiFontScaleSelect');
    const chat = $('#chatFontScaleSelect');
    if (ui) ui.value = safe.uiFontScale;
    if (chat) chat.value = safe.chatFontScale;
    for (const [key, id] of Object.entries({ composerShape: 'composerShapeSelect', composerPlus: 'composerPlusSelect', messageStyle: 'messageStyleSelect', streamingAnimation: 'streamingAnimationSelect', windowPresentation: 'windowPresentationSelect' })) { const input = $(`#${id}`); if (input) input.value = safe[key]; }
    const immersive = $('#immersiveHeaderToggle'); if (immersive) immersive.checked = safe.immersiveHeader;
    const fullWidth = $('#chatFullWidthToggle'); if (fullWidth) fullWidth.checked = safe.chatFullWidth;
    aggiornaBackgroundDesktop();
  }
  function inizializzaAspettoDesktop() {
    appearanceMediaQuery = window.matchMedia?.('(prefers-color-scheme: light)') || null;
    handleAppearanceMediaChange = () => { if (leggiImpostazioniDesktop().appearance.colorMode === 'system') applicaAspettoDesktop(leggiImpostazioniDesktop().appearance); };
    appearanceMediaQuery?.addEventListener?.('change', handleAppearanceMediaChange);
    handleAppearanceVisibilityChange = () => { if (leggiImpostazioniDesktop().appearance.pauseWhenHidden) aggiornaBackgroundDesktop(); };
    document.addEventListener('visibilitychange', handleAppearanceVisibilityChange);
    document.addEventListener('wheel', queueBackgroundScrollPause, { capture: true, passive: true });
    document.addEventListener('scroll', queueBackgroundScrollPause, { capture: true, passive: true });
    applicaAspettoDesktop(leggiImpostazioniDesktop().appearance);
  }
  function resettaMotionDesktop() {
    const documento = leggiImpostazioniDesktop();
    documento.appearance = normalizzaAspettoDesktop({ ...documento.appearance, sceneOverride: DESKTOP_APPEARANCE_DEFAULTS.sceneOverride, ...Object.fromEntries(Object.keys(DESKTOP_APPEARANCE_DEFAULTS).filter((key) => key.startsWith('motion') || ['backgroundMotion', 'interfaceMotion', 'pauseWhenHidden', 'respectDataSaver', 'reducedMotion'].includes(key)).map((key) => [key, DESKTOP_APPEARANCE_DEFAULTS[key]])) });
    salvaImpostazioniDesktop(documento);
    applicaAspettoDesktop(documento.appearance);
  }
  function chiaveWorkspaceAlbero() {
    return state.realSession.treeWorkspaceKey
      || (state.realSession.previewProjectId ? `project:${state.realSession.previewProjectId}` : null)
      || (state.realSession.id ? `session:${state.realSession.id}` : null);
  }
  function leggiImpostazioniAlbero() {
    return leggiImpostazioniDesktop();
  }
  function salvaImpostazioniAlbero() {
    const chiave = chiaveWorkspaceAlbero();
    if (!chiave) return;
    const tutte = leggiImpostazioniAlbero();
    const percorsi = [...state.realSession.treeOpen]
      .filter((percorso) => typeof percorso === 'string' && percorso.length <= 1024)
      .slice(0, 200);
    const filtro = String($('#fileTreeFilter')?.value || '').slice(0, 256);
    tutte.version = 1;
    tutte.workspaces = tutte.workspaces && typeof tutte.workspaces === 'object' ? tutte.workspaces : {};
    tutte.workspaces[chiave] = { expandedPaths: percorsi, filter: filtro };
    salvaImpostazioniDesktop(tutte);
  }
  function ripristinaImpostazioniAlbero() {
    if (state.realSession.treeUiRestored) return;
    state.realSession.treeUiRestored = true;
    const chiave = chiaveWorkspaceAlbero();
    if (!chiave) return;
    const salvato = leggiImpostazioniAlbero().workspaces?.[chiave];
    if (!salvato || typeof salvato !== 'object') return;
    const percorsi = Array.isArray(salvato.expandedPaths) ? salvato.expandedPaths : [];
    state.realSession.treeOpen = new Set(percorsi.filter((percorso) => typeof percorso === 'string' && percorso.length <= 1024).slice(0, 200));
    const filtro = $('#fileTreeFilter');
    if (filtro && typeof salvato.filter === 'string') filtro.value = salvato.filter.slice(0, 256);
  }

  function iconaSvgAlbero(nomeSimbolo) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    const uso = document.createElementNS(svgNs, 'use');
    uso.setAttribute('href', `#${nomeSimbolo}`);
    svg.append(uso);
    return svg;
  }

  const ESTENSIONI_CODICE_ALBERO = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'py', 'java', 'kt', 'go', 'rs', 'c', 'cpp', 'h', 'rb', 'php', 'swift']);
  function categoriaFileAlbero(nome) {
    const m = /\.([a-z0-9]+)$/i.exec(nome);
    return m && ESTENSIONI_CODICE_ALBERO.has(m[1].toLowerCase()) ? 'code' : 'file';
  }

  async function caricaLivelloAlbero(percorso, forza = false) {
    const cache = state.realSession.treeCache;
    if (!forza && cache.has(percorso)) return cache.get(percorso);
    const base = state.realSession.id
      ? `/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree`
      : `/api/v1/projects/${encodeURIComponent(state.realSession.previewProjectId)}/tree`;
    const dati = await apiGet(`${base}?percorso=${encodeURIComponent(percorso)}`);
    cache.set(percorso, dati.voci);
    return dati.voci;
  }

  function righeVisibiliAlbero(ul) {
    return [...ul.querySelectorAll('.ft-row')].filter((r) => r.offsetParent !== null);
  }
  function impostaFocusRigaAlbero(ul, row) {
    righeVisibiliAlbero(ul).forEach((r) => { r.tabIndex = -1; });
    row.tabIndex = 0;
    row.focus();
  }

  async function apriCartellaAlbero(li, iconEl, childUl, percorsoCompleto, profondita) {
    state.realSession.treeOpen.add(percorsoCompleto);
    salvaImpostazioniAlbero();
    li.classList.add('ft-open');
    li.setAttribute('aria-expanded', 'true');
    iconEl.classList.add('ft-open');
    iconEl.replaceChildren(iconaSvgAlbero('i-folder-open'));
    if (childUl.childElementCount > 0) return; // già caricata in questa sessione
    childUl.appendChild(textElement('li', 'ft-loading', 'Carico…'));
    let voci;
    try {
      voci = await caricaLivelloAlbero(percorsoCompleto);
    } catch {
      childUl.replaceChildren(textElement('li', 'ft-loading', 'Non leggibile.'));
      return;
    }
    childUl.replaceChildren();
    for (const voce of voci) {
      const percorsoFiglio = percorsoCompleto ? `${percorsoCompleto}/${voce.nome}` : voce.nome;
      // eslint-disable-next-line no-await-in-loop -- ogni figlio può ricorrere in apriCartellaAlbero se già in treeOpen: l'ordine dei figli deve restare quello del filesystem, non quello di risposta delle fetch
      await costruisciNodoAlbero(voce.nome, percorsoFiglio, Boolean(voce.cartella), profondita + 1, childUl);
    }
  }

  function chiudiCartellaAlbero(li, iconEl) {
    li.classList.remove('ft-open');
    li.setAttribute('aria-expanded', 'false');
    iconEl.classList.remove('ft-open');
    iconEl.replaceChildren(iconaSvgAlbero('i-folder'));
    state.realSession.treeOpen.delete(li.dataset.percorso);
    salvaImpostazioniAlbero();
  }

  async function costruisciNodoAlbero(nome, percorsoCompleto, cartella, profondita, contenitoreUl) {
    const li = document.createElement('li');
    li.className = 'ft-node';
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-level', String(profondita));
    li.dataset.percorso = percorsoCompleto;
    if (cartella) li.setAttribute('aria-expanded', 'false');

    const row = document.createElement('div');
    row.className = `ft-row ${cartella ? 'ft-row-folder' : 'ft-row-leaf'}`;
    row.tabIndex = -1;

    const chev = document.createElement('span');
    chev.className = 'ft-chevron';
    chev.appendChild(iconaSvgAlbero('i-chevron-right'));
    row.appendChild(chev);

    const icon = document.createElement('span');
    const categoria = cartella ? 'folder' : categoriaFileAlbero(nome);
    icon.className = `ft-icon ft-icon-${categoria}`;
    icon.appendChild(iconaSvgAlbero(cartella ? 'i-folder' : categoria === 'code' ? 'i-code' : 'i-file'));
    row.appendChild(icon);

    row.appendChild(textElement('span', 'ft-name', nome));

    const stato = !cartella ? statoFileAlbero(percorsoCompleto) : null;
    if (stato) {
      const dot = document.createElement('span');
      dot.className = `ft-status-dot ft-${stato}`;
      dot.title = stato === 'new' ? 'Nuovo' : 'Modificato';
      row.appendChild(dot);
    }

    /*
     * ⭐⭐⭐ 27/8, owner: "non ha nessun'opzione per rinominare i file, per
     * aprire i file, per aprirli nel visualizza file explorer di Windows.
     * Non ha opzioni per eliminarlo, per allegarlo nella chat" — un
     * bottone "···" per file.
     *
     * ⭐⭐⭐ 28/8, owner, coda: "bisogna aggiungere una nuova funzione che
     * con tasto destro su una cartella ti permette di impostare come
     * directory principale quella cartella" — QUESTO blocco (bottone
     * "···" + tasto destro) ora vale anche per le cartelle: prima era
     * `if (!cartella)`, un file manager vero non nega il menu contestuale
     * alle cartelle. `apriMenuAzioniFile` riceve `cartella` e sceglie da
     * sola le voci giuste (vedi la sua doc).
     */
    if (!alberoInAnteprima()) {
      const azioniBtn = document.createElement('button');
      azioniBtn.type = 'button';
      azioniBtn.className = 'ft-actions-btn';
      azioniBtn.setAttribute('aria-label', `Azioni su ${nome}`);
      azioniBtn.appendChild(iconaSvgAlbero('i-more'));
      azioniBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // non selezionare/aprire la riga sotto
        apriMenuAzioniFile(percorsoCompleto, nome, { ancoraEl: azioniBtn }, cartella);
      });
      row.appendChild(azioniBtn);
    }
    /*
     * ⭐⭐⭐ 28/8, owner: "voglio abilitare il tasto destro del mouse a
     * livello globale dato che siamo nel desktop, per esempio tasto
     * destro nel albero file mostra le opzioni" — stesso menu del
     * bottone "···" (riusato, non duplicato), ancorato al PUNTO del
     * click invece che a un elemento: è la convenzione universale di
     * ogni file manager/editor desktop (Explorer, VS Code...), non
     * qualcosa da reinventare. `preventDefault` sopprime il menu
     * nativo del browser.
     */
    if (!alberoInAnteprima()) row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      row.closest('.ft-tree').querySelectorAll('.ft-row.ft-selected').forEach((r) => r.classList.remove('ft-selected'));
      row.classList.add('ft-selected');
      apriMenuAzioniFile(percorsoCompleto, nome, { x: event.clientX, y: event.clientY }, cartella);
    });

    /*
     * ⭐⭐⭐ 28/8, owner: "nella lista files devo poter draggare i file per
     * spostarli". Drag&drop HTML5 nativo (ricerca web fatta: è l'API
     * standard, "notoriamente scorbutica" ma senza alternativa più
     * semplice per questo caso — nessuna libreria aggiunta, coerente col
     * bundle a zero dipendenze). MIME custom (`text/x-talos-file-path`)
     * per non collidere con un drag&drop testuale/URL nativo del browser;
     * OGNI riga è trascinabile (file e cartelle), ma solo le CARTELLE
     * accettano il drop — un file non è mai una destinazione valida.
     */
    if (!alberoInAnteprima()) {
      row.draggable = true;
      row.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/x-talos-file-path', percorsoCompleto);
        event.dataTransfer.effectAllowed = 'move';
      });
    }
    if (cartella && !alberoInAnteprima()) {
      row.addEventListener('dragover', (event) => {
        if (!event.dataTransfer.types.includes('text/x-talos-file-path')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        row.classList.add('ft-row-drag-over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('ft-row-drag-over'));
      row.addEventListener('drop', async (event) => {
        event.preventDefault();
        row.classList.remove('ft-row-drag-over');
        const percorsoSorgente = event.dataTransfer.getData('text/x-talos-file-path');
        if (!percorsoSorgente || percorsoSorgente === percorsoCompleto) return;
        try {
          const esito = await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree/move`, { percorso: percorsoSorgente, cartellaDestinazione: percorsoCompleto });
          toast('Spostato', esito.nuovoPercorso);
          state.realSession.treeCache.delete(percorsoCompleto);
          await invalidaLivelloGenitoreAlbero(percorsoSorgente);
        } catch (error) {
          toast('Spostamento non riuscito', error.message);
        }
      });
    }

    li.appendChild(row);
    contenitoreUl.appendChild(li);

    if (!cartella) {
      row.addEventListener('click', () => {
        row.closest('.ft-tree').querySelectorAll('.ft-row.ft-selected').forEach((r) => r.classList.remove('ft-selected'));
        row.classList.add('ft-selected');
        impostaFocusRigaAlbero(row.closest('.ft-tree'), row);
      });
      return li;
    }

    const childUl = document.createElement('ul');
    childUl.setAttribute('role', 'group');
    li.appendChild(childUl);
    row.addEventListener('click', () => {
      if (li.classList.contains('ft-open')) chiudiCartellaAlbero(li, icon);
      else apriCartellaAlbero(li, icon, childUl, percorsoCompleto, profondita);
      impostaFocusRigaAlbero(row.closest('.ft-tree'), row);
    });
    if (state.realSession.treeOpen.has(percorsoCompleto)) {
      await apriCartellaAlbero(li, icon, childUl, percorsoCompleto, profondita);
    }
    return li;
  }

  /**
   * ⭐⭐⭐ 27/8, owner: le cinque azioni sul singolo file dell'albero. Un
   * menu fuori dal flusso normale del DOM (appeso a `document.body`, non
   * dentro `.file-tree`) — il pannello ha `overflow-y:auto`, un menu
   * figlio verrebbe tagliato dal proprio contenitore appena sfora.
   *
   * ⭐ 28/8 — `posizionamento` è `{ancoraEl}` (bottone "···", il menu
   * pende sotto di lui) OPPURE `{x,y}` (tasto destro, il menu nasce nel
   * punto del click) — stesso menu, due modi di ancorarlo, mai due
   * implementazioni.
   *
   * ⭐⭐⭐ 28/8 — `cartella` (nuovo, default false): le CARTELLE oggi non
   * avevano nessun menu (owner, coda: "imposta come directory
   * principale") — voci diverse da un file (niente "Apri"/"Allega alla
   * chat", che non hanno senso su una cartella; in più "Imposta come
   * radice"), non un secondo menu duplicato: stessa funzione, stesso
   * meccanismo di posizionamento/chiusura, solo l'elenco `voci` cambia.
   */
  function apriMenuAzioniFile(percorsoCompleto, nome, posizionamento, cartella = false, soloCreazione = false) {
    document.querySelector('.ft-actions-menu')?.remove();

    const menu = document.createElement('div');
    menu.className = 'ft-actions-menu';
    menu.setAttribute('role', 'menu');

    // ⭐ 28/8 — tasto destro sulla RADICE dell'albero: nessuna rinomina/copia/elimina ha senso lì, solo creare.
    const voci = soloCreazione ? [
      { etichetta: 'Nuovo file', icona: 'i-edit', azione: () => avviaCreaVoce(percorsoCompleto, 'file') },
      { etichetta: 'Nuova cartella', icona: 'i-folder', azione: () => avviaCreaVoce(percorsoCompleto, 'cartella') },
    ] : cartella ? [
      { etichetta: 'Nuovo file', icona: 'i-edit', azione: () => avviaCreaVoce(percorsoCompleto, 'file') },
      { etichetta: 'Nuova cartella', icona: 'i-folder', azione: () => avviaCreaVoce(percorsoCompleto, 'cartella') },
      { etichetta: 'Rinomina', icona: 'i-edit', azione: () => avviaRinominaFile(percorsoCompleto, nome) },
      { etichetta: 'Copia', icona: 'i-link', azione: () => avviaCopiaFile(percorsoCompleto) },
      { etichetta: 'Imposta come radice', icona: 'i-folder', azione: () => impostaComeRadice(percorsoCompleto, nome) },
      { etichetta: 'Rivela in Esplora File', icona: 'i-folder-open', azione: () => rivelaFileInEsploraFile(percorsoCompleto) },
      { etichetta: 'Elimina', icona: 'i-trash', azione: () => avviaEliminaFile(percorsoCompleto, nome), pericoloso: true },
    ] : [
      { etichetta: 'Apri', icona: 'i-eye', azione: () => apriFileAlbero(percorsoCompleto, nome) },
      { etichetta: 'Allega alla chat', icona: 'i-link', azione: () => allegaFileAllaChat(percorsoCompleto) },
      { etichetta: 'Rinomina', icona: 'i-edit', azione: () => avviaRinominaFile(percorsoCompleto, nome) },
      { etichetta: 'Copia', icona: 'i-link', azione: () => avviaCopiaFile(percorsoCompleto) },
      { etichetta: 'Rivela in Esplora File', icona: 'i-folder-open', azione: () => rivelaFileInEsploraFile(percorsoCompleto) },
      { etichetta: 'Elimina', icona: 'i-trash', azione: () => avviaEliminaFile(percorsoCompleto, nome), pericoloso: true },
    ];
    for (const voce of voci) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ft-actions-menu-item${voce.pericoloso ? ' ft-actions-menu-item-danger' : ''}`;
      btn.setAttribute('role', 'menuitem');
      btn.appendChild(iconaSvgAlbero(voce.icona));
      btn.appendChild(textElement('span', '', voce.etichetta));
      btn.addEventListener('click', () => { chiudiMenu(); voce.azione(); });
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);

    if (posizionamento.ancoraEl) {
      const rect = posizionamento.ancoraEl.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    } else {
      // ⭐ Tasto destro: il menu nasce nel punto del click, ma mai fuori dallo schermo — misurato DOPO l'append, quando le sue dimensioni vere esistono.
      const misura = menu.getBoundingClientRect();
      const left = Math.min(posizionamento.x, window.innerWidth - misura.width - 8);
      const top = Math.min(posizionamento.y, window.innerHeight - misura.height - 8);
      menu.style.left = `${Math.max(8, left)}px`;
      menu.style.top = `${Math.max(8, top)}px`;
    }

    function chiudiMenu() {
      menu.remove();
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeydown);
    }
    function onDocumentClick(event) { if (!menu.contains(event.target)) chiudiMenu(); }
    function onKeydown(event) {
      if (event.key !== 'Escape') return;
      chiudiMenu();
      // ⭐ Dal tasto destro non c'è un bottone "···" a cui tornare — la riga stessa (già selezionata all'apertura) riceve il focus.
      (posizionamento.ancoraEl ?? document.querySelector('.ft-tree .ft-row.ft-selected'))?.focus();
    }
    /* ⛔ setTimeout(...,0): STESSO difetto già trovato e corretto stanotte sul model-picker — il click che apre QUESTO menu è ancora in bubbling verso document quando la funzione ritorna; registrare subito chiuderebbe il menu nello stesso istante in cui si apre. */
    window.setTimeout(() => {
      document.addEventListener('click', onDocumentClick);
      document.addEventListener('keydown', onKeydown);
    }, 0);
  }

  /** Dopo rinomina/elimina: il livello GENITORE nell'albero non riflette più il disco — stesso invalidamento mirato di segnalaScritturaNellAlbero, non un ricaricamento cieco di tutto. */
  async function invalidaLivelloGenitoreAlbero(percorsoCompleto) {
    const genitore = percorsoCompleto.includes('/') ? percorsoCompleto.split('/').slice(0, -1).join('/') : '';
    state.realSession.treeCache.delete(genitore);
    await renderizzaAlberoReale();
  }

  async function apriFileAlbero(percorsoCompleto, nome) {
    await rivelaERivelaRigaAlbero(percorsoCompleto);
    state.alberoFileTarget = { percorso: percorsoCompleto, nome };
    openSheet('fileViewer');
    sheetTitle.textContent = nome; // sheetTemplates.title è una stringa statica ovunque altrove: il nome vero si scrive qui
    const mount = $('#fileViewerMount', sheetBody);
    try {
      const dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree/file?percorso=${encodeURIComponent(percorsoCompleto)}`);
      if (!mount.isConnected) return; // il foglio è già stato chiuso mentre la fetch era in volo
      const pre = document.createElement('pre');
      pre.className = 'tool-result-block';
      pre.appendChild(textElement('code', '', dati.contenuto));
      mount.replaceChildren(pre);
    } catch (error) {
      if (!mount.isConnected) return;
      mount.replaceChildren(textElement('p', 'board-empty', `Non leggibile: ${error.message}`));
    }
  }

  async function rivelaERivelaRigaAlbero(percorsoCompleto) {
    const trovaNodo = (percorso) => [...document.querySelectorAll('#inspector-files .ft-node')]
      .find((nodo) => nodo.dataset.percorso === percorso);
    const parti = String(percorsoCompleto || '').split('/').filter(Boolean);
    let percorsoPadre = '';
    for (let indice = 0; indice < Math.max(0, parti.length - 1); indice += 1) {
      percorsoPadre = percorsoPadre ? `${percorsoPadre}/${parti[indice]}` : parti[indice];
      const li = trovaNodo(percorsoPadre);
      if (!li || !li.hasAttribute('aria-expanded') || li.classList.contains('ft-open')) continue;
      const row = $(':scope > .ft-row', li);
      const iconEl = $(':scope > .ft-row > .ft-icon', li);
      const childUl = $(':scope > ul', li);
      if (row && iconEl && childUl) await apriCartellaAlbero(li, iconEl, childUl, percorsoPadre, Number(li.getAttribute('aria-level') || 1));
    }
    const li = trovaNodo(percorsoCompleto);
    const row = li && $(':scope > .ft-row', li);
    if (!row) return;
    const tree = row.closest('.ft-tree');
    tree?.querySelectorAll('.ft-row.ft-selected').forEach((riga) => riga.classList.remove('ft-selected'));
    row.classList.add('ft-selected');
    if (tree) impostaFocusRigaAlbero(tree, row);
    row.scrollIntoView?.({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'nearest' });
  }

  function allegaFileAllaChat(percorsoCompleto) {
    composerInput.value = `${composerInput.value.replace(/@[^\s]*$/, '')}@${percorsoCompleto} `;
    autoGrowTextarea();
    composerInput.focus();
    toast('Allegato alla chat', percorsoCompleto);
  }

  function avviaRinominaFile(percorsoCompleto, nome) {
    state.alberoFileTarget = { percorso: percorsoCompleto, nome };
    openSheet('renameFile');
  }

  function avviaEliminaFile(percorsoCompleto, nome) {
    state.alberoFileTarget = { percorso: percorsoCompleto, nome };
    openSheet('deleteFile');
  }

  /**
   * ⭐⭐⭐ 28/8, owner: "non esiste il comando copia" — non distruttiva,
   * zero conferma (a differenza di elimina): un click, l'endpoint sceglie
   * da solo "nome (copia).ext" (pattern Explorer/Finder, mai una
   * sovrascrittura). L'originale non si tocca — verificato in
   * workspace-files.test.mjs, non solo qui.
   */
  async function avviaCopiaFile(percorsoCompleto) {
    try {
      const esito = await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree/copy`, { percorso: percorsoCompleto });
      toast('Copiato', esito.nuovoPercorso);
      await invalidaLivelloGenitoreAlbero(percorsoCompleto);
    } catch (error) {
      toast('Copia non riuscita', error.message);
    }
  }

  /** ⭐⭐⭐ 28/8, owner: "comandi crud in generale" — "Nuovo file"/"Nuova cartella", dentro percorsoBase ('' = radice). */
  function avviaCreaVoce(percorsoBase, tipo) {
    state.alberoFileTarget = { percorso: percorsoBase, tipo };
    openSheet('createFile');
    sheetTitle.textContent = tipo === 'cartella' ? 'Nuova cartella' : 'Nuovo file';
  }

  /**
   * ⭐⭐⭐ 28/8 — owner, coda: "bisogna aggiungere una nuova funzione che
   * con tasto destro su una cartella ti permette di impostare come
   * directory principale quella cartella". Riusa INTERAMENTE il
   * percorso "Full access" costruito oggi stesso
   * (avviaSessionePendente → startCustomSession → cartellaLibera)
   * invece di inventare un secondo modo di cambiare radice:
   * session-registry.mjs non ha (e non avrà, per scelta) un modo di
   * mutare `voce.cartella` su una sessione GIÀ avviata — una nuova
   * radice è per costruzione una sessione NUOVA. La sessione corrente
   * resta intatta, ancora nella sidebar, mai toccata.
   *
   * ⛔ Passa SEMPRE per "Full access": il percorso scelto è ASSOLUTO
   * arbitrario per il meccanismo che lo riceve (anche se oggi è dentro
   * la radice corrente, `cartellaLibera` non lo sa e non deve saperlo —
   * un solo modo di dire "percorso a piacere", mai due). Il permesso
   * cambia di conseguenza, MAI in silenzio — `impostaPermesso` mostra
   * sempre il suo stesso toast "Policy aggiornata".
   */
  function impostaComeRadice(percorsoRelativo, nome) {
    const radice = state.realSession.cartellaAssoluta;
    if (!radice) {
      toast('Radice sconosciuta', 'Questa sessione non ha ancora dichiarato il proprio percorso — riprova appena parte il primo giro.');
      return;
    }
    const nuovaRadice = `${radice.replace(/[/\\]+$/, '')}/${percorsoRelativo}`;
    impostaPermesso('Full access', `Full access · nuova radice: ${nome}`);
    avviaSessionePendente({ cartellaLibera: nuovaRadice, nomeCartella: nome, modello: state.model, effort: state.effort, permessi: 'Full access', permessiPerAttrezzo: { ...state.permessiPerAttrezzo } });
  }

  async function rivelaFileInEsploraFile(percorsoCompleto) {
    try {
      await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree/reveal`, { percorso: percorsoCompleto });
      toast('Aperto in Esplora File', percorsoCompleto);
    } catch (error) {
      toast('Non riuscito', error.message);
    }
  }

  /**
   * Una sola ricostruzione del tree può essere in volo. Le invalidazioni che
   * arrivano durante la lettura non aprono fetch concorrenti: chiedono al
   * massimo un secondo passaggio con lo stato più recente.
   */
  async function renderizzaAlberoReale() {
    cancellaRenderAlberoDifferito();
    if (treeRenderInFlight) {
      treeRenderNeedsRerun = true;
      return treeRenderInFlight;
    }
    treeRenderInFlight = (async () => {
      do {
        treeRenderNeedsRerun = false;
        await renderizzaAlberoRealeUnaVolta();
      } while (treeRenderNeedsRerun);
    })().finally(() => {
      treeRenderInFlight = null;
    });
    return treeRenderInFlight;
  }

  /** Piano §1.3, riga "Contesto workspace" — l'albero file REALE, radice + tutto ciò che era già aperto (treeOpen), riscaricato dal vivo. */
  async function renderizzaAlberoRealeUnaVolta() {
    if (!state.realSession.id && !state.realSession.previewProjectId) return;
    syncFileTreeToolbar();
    ripristinaImpostazioniAlbero();
    const generation = state.realSession.generation;
    const contenitore = $('#inspector-files .file-tree');
    if (!contenitore) return;
    const demoBadge = $('.demo-surface-badge', $('[data-inspector-section="files"]'));
    if (demoBadge) demoBadge.hidden = true;

    const radice = document.createElement('div');
    radice.className = 'tree-root';
    radice.append(iconaSvgAlbero('i-files'), textElement('strong', '', state.realSession.taskId || state.realSession.previewWorkspaceName || 'workspace'));
    // ⭐⭐⭐ 28/8, owner: "comandi crud in generale" — creare un file/una cartella senza dover prima cliccare col destro su una cartella esistente: la radice stessa accetta lo stesso menu, ridotto alle due sole voci di creazione (percorsoBase '').
    if (!alberoInAnteprima()) radice.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      apriMenuAzioniFile('', state.realSession.taskId || 'workspace', { x: e.clientX, y: e.clientY }, true, true);
    });
    // ⭐ stesso drop-target delle cartelle, ma per "portare fuori" un elemento alla radice.
    if (!alberoInAnteprima()) radice.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/x-talos-file-path')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      radice.classList.add('ft-row-drag-over');
    });
    if (!alberoInAnteprima()) radice.addEventListener('dragleave', () => radice.classList.remove('ft-row-drag-over'));
    if (!alberoInAnteprima()) radice.addEventListener('drop', async (e) => {
      e.preventDefault();
      radice.classList.remove('ft-row-drag-over');
      const percorsoSorgente = e.dataTransfer.getData('text/x-talos-file-path');
      if (!percorsoSorgente) return;
      try {
        const esito = await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree/move`, { percorso: percorsoSorgente, cartellaDestinazione: '' });
        toast('Spostato', esito.nuovoPercorso);
        state.realSession.treeCache.delete('');
        await invalidaLivelloGenitoreAlbero(percorsoSorgente);
      } catch (error) {
        toast('Spostamento non riuscito', error.message);
      }
    });

    const ul = document.createElement('ul');
    ul.className = 'ft-tree';
    ul.setAttribute('role', 'tree');
    ul.setAttribute('aria-label', 'File del workspace');
    ul.addEventListener('keydown', (e) => {
      const righe = righeVisibiliAlbero(ul);
      const i = righe.indexOf(document.activeElement);
      if (i === -1) return;
      const row = righe[i];
      const li = row.closest('.ft-node');
      const eCartella = li.hasAttribute('aria-expanded');
      if (e.key === 'ArrowDown') { e.preventDefault(); if (righe[i + 1]) impostaFocusRigaAlbero(ul, righe[i + 1]); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (righe[i - 1]) impostaFocusRigaAlbero(ul, righe[i - 1]); }
      else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (eCartella && li.getAttribute('aria-expanded') === 'false') row.click();
        else if (righe[i + 1]) impostaFocusRigaAlbero(ul, righe[i + 1]);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (eCartella && li.getAttribute('aria-expanded') === 'true') row.click();
        else { const genitoreLi = li.parentElement.closest('.ft-node'); if (genitoreLi) impostaFocusRigaAlbero(ul, $(':scope > .ft-row', genitoreLi)); }
      } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
      else if (e.key === 'Home') { e.preventDefault(); if (righe[0]) impostaFocusRigaAlbero(ul, righe[0]); }
      else if (e.key === 'End') { e.preventDefault(); if (righe.length) impostaFocusRigaAlbero(ul, righe[righe.length - 1]); }
    });

    contenitore.replaceChildren(radice, ul);

    let voci;
    try {
      voci = await caricaLivelloAlbero('');
    } catch {
      ul.appendChild(textElement('li', 'ft-loading', 'Albero non disponibile.'));
      return;
    }
    if (generation !== state.realSession.generation) return;
    for (const voce of voci) {
      // eslint-disable-next-line no-await-in-loop -- vedi la nota gemella in apriCartellaAlbero
      await costruisciNodoAlbero(voce.nome, voce.nome, Boolean(voce.cartella), 1, ul);
    }
    const prima = ul.querySelector('.ft-row');
    if (prima) prima.tabIndex = 0;
    filtraAlberoReale($('#fileTreeFilter')?.value || '');
  }

  /** Aggiorna SOLO i pallini di stato dei file già a schermo — nessuna richiesta di rete, reviewFiles è già aggiornato. */
  function aggiornaPuntiniStatoAlbero() {
    const ul = $('#inspector-files .ft-tree');
    if (!ul) return;
    for (const li of ul.querySelectorAll('.ft-node')) {
      if (li.hasAttribute('aria-expanded')) continue; // solo file, mai cartelle
      const row = $(':scope > .ft-row', li);
      const stato = statoFileAlbero(li.dataset.percorso);
      let dot = $('.ft-status-dot', row);
      if (stato) {
        if (!dot) { dot = document.createElement('span'); row.appendChild(dot); }
        dot.className = `ft-status-dot ft-${stato}`;
        dot.title = stato === 'new' ? 'Nuovo' : 'Modificato';
      } else if (dot) {
        dot.remove();
      }
    }
  }

  /** Dopo una scrittura reale: i pallini si aggiornano subito (gratis); un file MAI visto prima in un livello già mostrato invalida solo quel livello e ridisegna. */
  async function segnalaScritturaNellAlbero(percorsoCompleto) {
    if (!state.realSession.id) return;
    aggiornaPuntiniStatoAlbero();
    const genitore = percorsoCompleto.includes('/') ? percorsoCompleto.split('/').slice(0, -1).join('/') : '';
    const cache = state.realSession.treeCache;
    if (!cache.has(genitore)) return; // livello mai aperto: corretto già la prima volta che l'utente ci arriva
    const nomeFile = percorsoCompleto.split('/').pop();
    if (cache.get(genitore).some((v) => v.nome === nomeFile)) return; // già presente, i pallini bastavano
    cache.delete(genitore);
    await renderizzaAlberoReale();
  }

  /** ⭐ Ricerca dal vivo — SOLO fra i nodi già caricati in questa sessione (vedi la doc sopra renderizzaAlberoReale sul perché). Apre gli antenati di ogni risultato, sottolinea la porzione trovata. */
  function filtraAlberoReale(query) {
    const ul = $('#inspector-files .ft-tree');
    const hint = $('#fileTreeFilterHint');
    if (!ul || !hint) return;
    const q = query.trim().toLowerCase();
    const nodi = [...ul.querySelectorAll('.ft-node')];
    if (!q) {
      nodi.forEach((li) => {
        const row = $(':scope > .ft-row', li);
        row.classList.remove('ft-dimmed', 'ft-match');
        const name = $('.ft-name', row);
        if (name.dataset.raw) name.textContent = name.dataset.raw;
      });
      hint.textContent = '';
      return;
    }
    let trovati = 0;
    nodi.forEach((li) => {
      const row = $(':scope > .ft-row', li);
      const name = $('.ft-name', row);
      if (!name.dataset.raw) name.dataset.raw = name.textContent;
      const raw = name.dataset.raw;
      const idx = raw.toLowerCase().indexOf(q);
      const combacia = idx !== -1;
      row.classList.toggle('ft-match', combacia);
      row.classList.toggle('ft-dimmed', !combacia);
      if (!combacia) { name.textContent = raw; return; }
      trovati += 1;
      name.replaceChildren(
        document.createTextNode(raw.slice(0, idx)),
        textElement('mark', '', raw.slice(idx, idx + q.length)),
        document.createTextNode(raw.slice(idx + q.length)),
      );
      let antenato = li.parentElement.closest('.ft-node');
      while (antenato) {
        if (!antenato.classList.contains('ft-open')) $(':scope > .ft-row', antenato).click();
        $(':scope > .ft-row', antenato).classList.remove('ft-dimmed');
        antenato = antenato.parentElement.closest('.ft-node');
      }
    });
    hint.replaceChildren();
    if (trovati > 0) {
      hint.appendChild(textElement('b', '', String(trovati)));
      hint.appendChild(document.createTextNode(` risultat${trovati === 1 ? 'o' : 'i'} fra i file già caricati`));
    } else {
      hint.textContent = 'Nessun file caricato corrisponde — apri altre cartelle per includerle.';
    }
  }

  /**
   * ⭐ Il pannello "Ambiente" del Context Rail — prima statico/demo.
   * `branch`/`worktree` mostrano "—" quando non applicabili — un trattino
   * onesto, MAI il valore demo lasciato al suo posto.
   */
  function aggiornaPannelloAmbiente(contesto) {
    const workspace = $('#envWorkspace');
    const branch = $('#envBranch');
    const worktree = $('#envWorktree');
    const root = $('#envRoot');
    if (workspace) workspace.textContent = contesto.progetto || '—';
    if (branch) branch.textContent = contesto.branch || '—';
    if (worktree) worktree.textContent = '—'; // mai un repository git nel corpus di oggi, vedi doc in workspace-context.mjs
    if (root) root.textContent = contesto.cartella;
    // ⭐⭐⭐ 28/8 — tenuta anche in stato, non solo nel DOM: serve a "Imposta come radice" (menu dell'albero) per calcolare il percorso assoluto di una sottocartella.
    state.realSession.cartellaAssoluta = contesto.cartella || null;
    const sezione = $('[data-inspector-section="context"]');
    const demoBadge = sezione && $('.demo-surface-badge', sezione);
    if (demoBadge) demoBadge.hidden = true;
  }

  function handleRealEvent(evento, generation) {
    if (generation !== state.realSession.generation) return; // sessione più vecchia: scartato, non renderizzato
    /*
     * ⛔⛔⛔ 27/8, owner: "ricevo risposte duplicate" — riprodotto: ogni
     * riconnessione SSE sulla stessa sessione (l'EventSource nativo dopo una
     * caduta di rete, o runDirectShell che ne apre una fresca apposta)
     * rimanda l'INTERO buffer della sessione da capo (iscriviti(), lato
     * server). appendToolNote/appendStatusNote non erano idempotenti: ogni
     * replay aggiungeva bubble duplicati; ensureAssistantMessageElement
     * TROVA lo stesso messageId ma `+= evento.delta` raddoppiava comunque il
     * TESTO dentro il bubble esistente. `_sequenza` (assegnato una sola
     * volta dal server, stabile su ogni replay dello stesso evento) è il
     * punto UNICO per riconoscerlo e scartarlo, invece di rincorrere ogni
     * handler sotto uno per uno.
     */
    if (typeof evento._sequenza === 'number') {
      if (state.realSession.sequenzeViste.has(evento._sequenza)) return;
      state.realSession.sequenzeViste.add(evento._sequenza);
    }
    switch (evento.type) {
      case 'RunStarted': {
        streamingAutoFollow = true; // un nuovo giro ri-arma il "segui il centro" — stesso principio di resetThreadScroll() in Hermes
        streamingLastTargetTop = null;
        state.realSession.currentRunModel = typeof evento.contesto?.modello === 'string' && evento.contesto.modello.trim()
          ? evento.contesto.modello.trim()
          : (state.model || null);
        state.realSession.redirectPendingId = null;
        state.realSession.eventoTerminaleVisto = false;
        syncRunComposerState();
        /*
         * ⛔⛔⛔ 27/8, owner: "'Nuovo giro iniziato sulla stessa
         * conversazione' ovviamente non deve comparire" — era rumore
         * interno lasciato visibile in una conversazione reale. runCount
         * resta tracciato (altri punti lo leggono).
         *
         * ⛔⛔⛔ 27/8, owner: "verifica che i messaggi... persistano dopo il
         * refresh" — riprodotto: un F5 perdeva ogni follow-up per sempre.
         * Dal vivo resumeSession() mostra il follow-up in modo OTTIMISTA
         * (appendUserFollowUp, prima ancora che la POST risponda) — ma
         * quel bubble non ha NESSUNA controparte lato server, quindi un
         * reload (che ricostruisce SOLO dal replay degli eventi) non
         * aveva niente da cui recuperarlo. session-registry.mjs resume()
         * ora annuncia il nuovo messaggio con `evento.input.seguito:true`
         * (mai più il task originale ripetuto): un secondo RunStarted così
         * marcato è un follow-up VERO da mostrare — ma SOLO al replay,
         * mai due volte dal vivo (`followUpBubbleInAttesa` lo consuma,
         * impostato da resumeSession subito prima della POST).
         */
        state.realSession.runCount = (state.realSession.runCount || 0) + 1;
        /*
         * ⛔⛔⛔ 02/9 — disarma il "sopprimi lo scroll" armato da
         * resumeSession() (vedi il commento lì): confronta col NUMERO di
         * giri, non con `evento.input?.seguito` — copre sia il resume CON
         * un nuovo messaggio sia quello SENZA (sessione interrotta, si
         * riprende lo stesso task, niente `seguito`), e non si disarma
         * troppo presto su una cronologia con più follow-up precedenti
         * (che il replay ripete anch'essi, ognuno con `seguito:true`).
         */
        /*
         * ⛔⛔⛔ 02/9 — QUI c'erano DUE tentativi di disarmare a contatore
         * il differimento acceso da `resumeSession`, sbagliati entrambi, e
         * a smentirli è stata la strumentazione, non una rilettura:
         *   1ª versione (`runCount > runCountPrimaDelResume`): `runCount`
         *      non si azzera con `continua:true`, quindi il PRIMO giro
         *      rigiocato superava già la soglia — il replay passava per
         *      turno nuovo.
         *   2ª versione (contatore dedicato da zero): il RunStarted del
         *      turno nuovo arriva sul VECCHIO stream e sul nuovo viene
         *      scartato dal dedup `_sequenza` — non arriva MAI, e il
         *      differimento restava acceso per sempre.
         * ⇒ Il differimento sul resume è stato tolto alla radice (vedi
         * `resumeSession`): il replay è già neutralizzato dal dedup qui
         * sopra, e non serve un secondo meccanismo che gli corra dietro.
         */
        segnaTappaLatenza('runStarted');
        if (!state.realSession.taskBubbleMostrata && evento.input) {
          appendRealTaskStart(evento.input, evento.contesto);
        } else if (state.realSession.taskBubbleMostrata && evento.input?.seguito) {
          if (state.realSession.followUpBubbleInAttesa) {
            state.realSession.followUpBubbleInAttesa = false; // già mostrato dal vivo, non duplicare
            allineaPilloleAlGiroVivo(evento.contesto);
          } else {
            appendUserFollowUp(evento.input.consegna, evento.contesto); // replay dopo un reload: nessun ottimismo l'ha già mostrato
          }
        }
        if (evento.contesto) aggiornaPannelloAmbiente(evento.contesto);
        programmaRenderAlberoReale();
        break;
      }
      case 'TextMessageContent': {
        // ⭐ 02/09 — arrivo del frammento dal server, PRIMA di qualunque render: nel log di streaming un buco fra due 'delta' è rete/provider, un buco fra 'delta' e 'render' è nostro. Misurato dal vivo il 02/09: render ≤1,1 ms, buchi fra delta di 2-12 s — il collo era a monte.
        logStreaming('delta', { messageId: evento.messageId, len: typeof evento.delta === 'string' ? evento.delta.length : 0 });
        segnaTappaLatenza('primoDelta');
        /*
         * ⛔⛔⛔ 02/9 — owner: "il logo di caricamento deve esistere fino a
         * quando la risposta viene STREAMMATA E STAMPATA". Qui c'era
         * `nascondiAttesaRisposta()` — "il primo token vero". Ma il primo
         * token ARRIVATO non è testo STAMPATO: il render è programmato su
         * `requestAnimationFrame` e, con un ritmo di rivelazione attivo,
         * i primi caratteri compaiono anche più in là. Nel mezzo lo
         * schermo restava senza loader E senza testo — il "gap in cui non
         * c'è niente" che l'owner vede. La ricerca lo dice esplicito
         * (getstream.io/chat typing-indicator, mui.com/x/react-chat):
         * l'indicatore si sostituisce al contenuto quando il contenuto
         * COMPARE, non quando arriva il primo pezzo sul filo. Ora la
         * chiude `renderizzaMessaggioStreamingOra`, al primo frame che ha
         * davvero scritto qualcosa (vedi lì).
         */
        chiudiBatchTool(); // 30/8 — testo vero dell'assistente: chiude il batch di tool-call corrente, se ce n'è uno aperto (vedi doc su apriBatchSeServe)
        const element = ensureAssistantMessageElement(evento.messageId);
        if (!element.classList.contains('is-streaming')) element.classList.add('is-streaming');
        // ⛔⛔⛔ 27/8 — testo GREZZO accumulato a parte (mai letto da
        // .textContent, che ora contiene il RENDER): renderizzaMarkdownSemplice()
        // rilavora sempre il markdown intero visto finora, un delta grezzo
        // in mezzo a un ```blocco di codice``` non basta da solo a capirlo.
        const testoGrezzo = (state.realSession.testoGrezzoMessaggi.get(evento.messageId) || '') + evento.delta;
        state.realSession.testoGrezzoMessaggi.set(evento.messageId, testoGrezzo);
        if (state.realSession.deferHistoricalRendering) contaEventoRigiocato(typeof evento.delta === 'string' ? evento.delta.length : 0);
        else programmaRenderMessaggioStreaming(evento.messageId);
        break;
      }
      case 'TextMessageEnd': {
        // ⭐ 02/09 — con un ritmo di rivelazione attivo il testo può essere ancora in coda: la fine si SEGNA qui e si applica (is-streaming tolta) quando lo schermo è in pari, dentro renderizzaMessaggioStreamingOra. Senza ritmo (Nessuna/ripristino) l'effetto è immediato come prima.
        let statoRender = state.realSession.renderIncrementale.get(evento.messageId);
        if (!statoRender) { statoRender = { prefisso: null, nodiCoda: [], mostrato: 0, ultimoTickMs: null, paroleRecenti: [], fineRicevuta: false }; state.realSession.renderIncrementale.set(evento.messageId, statoRender); }
        statoRender.fineRicevuta = true;
        if (!renderizzaMessaggioStreamingOra(evento.messageId)) state.realSession.messageElements.get(evento.messageId)?.classList.remove('is-streaming');
        break;
      }
      /*
       * ⛔ Nessun case per TextMessageStart/End: ensureAssistantMessageElement
       * crea il bubble pigramente al primo Content per quel messageId, e
       * TextMessageContent accumula per messageId — Start/End non portano
       * niente che il codice esistente non gestisca già. Non un buco, una
       * semplificazione onesta: verificata coi test di agent-service.mjs
       * (Start SEMPRE prima del primo Content, End SEMPRE dopo l'ultimo).
       */
      /*
       * ⭐⭐⭐ 27/8, R1 — il ragionamento è un canale SEPARATO dal testo
       * (piano, sezione "RICOGNIZIONE COMPETITIVA"): riusa appendToolNote,
       * la STESSA bolla collassabile già in uso per le tool-call — non un
       * componente nuovo, lo stesso idioma. Visibile per DEFAULT (a
       * differenza di Claude Code, che lo nasconde dietro Ctrl+O — la
       * ricerca del piano cita proprio questo come il difetto da non
       * ripetere), ma collassato: chi non è interessato scorre oltre senza
       * doverlo chiudere lui stesso.
       */
      case 'ReasoningMessageStart': {
        mostraAttesaRisposta('reasoning');
        // Un evento che l'utente ha scelto di nascondere non è un confine
        // visibile: il batch resta unico. Quando il ragionamento è mostrato,
        // invece, conserva la cronologia reale e chiude il gruppo precedente.
        if (state.showReasoning) chiudiBatchTool();
        const bubble = appendToolNote('Ragionamento', { classeExtra: 'real-reasoning-note', glifo: '💭' });
        bubble.article.hidden = !state.showReasoning;
        bubble.article.setAttribute('aria-hidden', String(!state.showReasoning));
        state.realSession.ragionamentoBubble.set(evento.messageId, { ...bubble, grezzo: '', renderStato: { prefisso: null, nodiCoda: [] } });
        break;
      }
      case 'ReasoningMessageContent': {
        const voce = state.realSession.ragionamentoBubble.get(evento.messageId);
        if (!voce) break; // difensivo: un Content senza il suo Start non deve far crashare la sessione
        voce.grezzo += evento.delta;
        if (!state.realSession.deferHistoricalRendering) {
          renderizzaMarkdownIncrementale(voce.detail, voce.renderStato, voce.grezzo);
          if (state.showReasoning) scrollStreamingOutput(voce.article);
        }
        break;
      }
      case 'ReasoningMessageEnd': {
        const voce = state.realSession.ragionamentoBubble.get(evento.messageId);
        if (voce && state.realSession.deferHistoricalRendering) {
          renderizzaMarkdownIncrementale(voce.detail, voce.renderStato, voce.grezzo);
        }
        state.realSession.ragionamentoBubble.delete(evento.messageId); // la bolla resta a schermo, solo non si aggiorna più
        mostraAttesaRisposta('preparing');
        break;
      }
      case 'ToolCallStart': {
        nascondiAttesaRisposta(); // il primo attrezzo chiamato: sappiamo già cosa sta facendo, la ruota non serve più
        // ⭐⭐⭐ 30/8 — raggruppamento (owner, "come fa Claude"): la riga nasce DENTRO il batch corrente, non più direttamente in conversazione. Vedi apriBatchSeServe.
        const batch = apriBatchSeServe();
        const bubble = appendToolNote(riassuntoAttrezzoInCorso(evento.toolCallName, null), { contenitore: batch.contenitore });
        bubble.article.dataset.toolState = 'running';
        bubble.article.setAttribute('aria-busy', 'true');
        bubble.summaryText.setAttribute('role', 'status');
        bubble.summaryText.setAttribute('aria-live', 'polite');
        bubble.summaryText.setAttribute('aria-atomic', 'true');
        /*
         * ⭐ nome + riferimenti DOM (summaryText/detail) tenuti per
         * toolCallId: ToolCallArgs e ToolCallResult aggiornano LO STESSO
         * bubble invece di crearne uno nuovo — un solo collassabile per
         * tool-call, come Claude Code (screenshot owner, 27/8). Il campo
         * `nome` serve ANCHE a riconoscere shell/naviga per specchiarli
         * nella vista Terminale/Browser, invariato.
         */
        const categoria = categoriaAttrezzoPerBatch(evento.toolCallName);
        state.realSession.toolCallNomi.set(evento.toolCallId, {
          nome: evento.toolCallName,
          argomenti: '',
          argomentiParsati: null,
          categoria,
          batch,
          stato: 'running',
          ...bubble,
        });
        batch.inCorso[categoria] += 1;
        if (categoria === 'scrittura') batch.scrittureInAttesa.push(bubble); // conteggiata (nuovo/modificato) solo quando arriva lo StateDelta — vedi updateRealReview
        aggiornaRiassuntoBatch(batch);
        break;
      }
      case 'ToolCallArgs': {
        const info = state.realSession.toolCallNomi.get(evento.toolCallId);
        if (info) {
          info.argomenti += evento.delta;
          let argomentiParsati = null;
          try { argomentiParsati = JSON.parse(info.argomenti); } catch { /* delta ancora incompleto: il riassunto resta quello generico finché non arriva tutto */ }
          if (argomentiParsati) info.argomentiParsati = argomentiParsati;
          if (argomentiParsati && info.summaryText) info.summaryText.textContent = riassuntoAttrezzoInCorso(info.nome, argomentiParsati);
          if (info.detail) renderizzaArgomentiAttrezzo(info.detail, info.argomenti);
        }
        break;
      }
      case 'ToolCallResult': {
        const info = state.realSession.toolCallNomi.get(evento.toolCallId);
        /*
         * ⛔ 28/8 — Terminale REALE (LEDGER-TERMINALE-REALE.md): il tool
         * `shell` dell'AGENTE non viene più specchiato nella vista
         * Terminale — quella vista oggi è una PTY vera, digitabile
         * dall'utente, e scrivervi automaticamente l'output dell'agente
         * creerebbe una gara con la tastiera umana. L'attività
         * dell'agente resta visibile qui, nel bubble collassabile della
         * chat (invariato) — solo lo specchio dedicato è stato tolto.
         */
        if (info?.nome === 'naviga') {
          let url = '(url)';
          try { url = JSON.parse(info.argomenti).url || url; } catch { /* args incompleti o non ancora arrivati: meglio un'etichetta onesta che un crash */ }
          appendBrowserEntry(url, String(evento.content));
        }
        const testoEsito = String(evento.content).slice(0, 4000);
        const fallito = info ? esitoAttrezzoFallito(info.nome, testoEsito) : false;
        if (info?.summaryText) info.summaryText.textContent = riassuntoAttrezzoConcluso(info.nome, info.argomentiParsati, testoEsito, fallito);
        if (info?.article) {
          info.article.dataset.toolState = fallito ? 'error' : 'complete';
          info.article.setAttribute('aria-busy', 'false');
          const glifo = info.summaryText?.previousElementSibling;
          if (glifo?.classList.contains('talos-glyph')) glifo.textContent = fallito ? '!' : '✓';
        }
        if (info?.detail) {
          const separatore = document.createElement('div');
          separatore.className = 'tool-arg-key';
          separatore.textContent = 'Esito:';
          info.detail.appendChild(separatore);
          const pre = document.createElement('pre');
          pre.className = 'tool-result-block';
          pre.appendChild(textElement('code', '', testoEsito));
          info.detail.appendChild(pre);
        }
        if (info?.batch && info.stato === 'running') {
          const { batch, categoria } = info;
          batch.inCorso[categoria] = Math.max(0, batch.inCorso[categoria] - 1);
          if (categoria === 'comando') {
            batch.contatori.comandi += 1;
            if (fallito) batch.contatori.comandiErrore += 1;
          } else if (fallito) {
            batch.contatori.falliti += 1;
            if (categoria === 'scrittura') {
              const indice = batch.scrittureInAttesa.findIndex((voce) => voce.article === info.article);
              if (indice >= 0) batch.scrittureInAttesa.splice(indice, 1);
            }
          } else if (categoria === 'letto') batch.contatori.letti += 1;
          else if (categoria === 'cercato') batch.contatori.cercati += 1;
          // Una scrittura riuscita è contata soltanto dal relativo
          // StateDelta add/replace: il testo del tool non prova il disco.
          else if (categoria === 'altro') batch.contatori.altro += 1;
          info.stato = fallito ? 'error' : 'complete';
          aggiornaRiassuntoBatch(batch);
        }
        state.realSession.toolCallNomi.delete(evento.toolCallId);
        break;
      }
      case 'StateDelta': {
        /*
         * ⛔⛔⛔ Riconciliazione Fase 3 (piano procedi-col-generare-un-snoopy-neumann.md,
         * 27/8) — prima di questo giro OGNI StateDelta veniva trattato
         * come una scrittura file, incondizionatamente: il path era
         * sempre `/file/*`, mai altro, quindi funzionava per caso. Ora
         * che esiste anche `/usage` (Fase 3), il path decide il ramo —
         * mai più il bottone "✏️ File scritto" su un aggiornamento di
         * token, e mai il contatore aggiornato su una scrittura vera.
         */
        const path = evento.delta?.[0]?.path;
        if (path === '/usage') {
          state.realSession.usage = evento.delta[0].value;
          aggiornaContatoreUsage();
          aggiornaComposerUsage(state.realSession.usage);
          break;
        }
        updateRealReview(evento.delta);
        const percorsoScritto = path?.replace(/^\/file\//, '');
        if (percorsoScritto) segnalaScritturaNellAlbero(percorsoScritto);
        // ⛔⛔⛔ 30/8 — rimossa la nota separata "✏️ File scritto — vedi la scheda Review": ridondante, confermata in Task 0.3 della QA visiva (la stessa scrittura era GIÀ mostrata nel bubble della tool-call, nella scheda Review, nell'albero file). Il raggruppamento tool-call (updateRealReview sopra) ora attacca il diff VERO direttamente alla riga `scrivi` — un segnale più ricco, non solo "qualcosa è stato scritto".
        break;
      }
      case 'ArtifactCreated': {
        nascondiAttesaRisposta();
        appendArtifactCard(evento.titolo, evento.id);
        break;
      }
      case 'WorkspaceChanged': {
        /*
         * ⭐⭐⭐ 28/8, owner 27/8: "se muovo i file il work tree non si
         * aggiorna automaticamente" — workspace-watcher.mjs (backend)
         * segnala un cambiamento FUORI dall'app (Explorer, un editor,
         * git...). A differenza di `segnalaScritturaNellAlbero`
         * (un percorso preciso, dal MODELLO) qui non sappiamo esattamente
         * cosa è cambiato — il watcher manda i percorsi ma possono essere
         * molti e ovunque nell'albero — quindi si invalida TUTTA la
         * cache e si ri-renderizza da capo, come un vero file manager
         * che si accorge di un `git checkout`: silenzioso, nessuna nota
         * in chat (non è un'azione dell'agente, non deve sembrarlo).
         */
        if (state.realSession.id) {
          state.realSession.treeCache.clear();
          programmaRenderAlberoReale();
        }
        break;
      }
      case 'QueuedMessageDelivered': {
        /*
         * ⭐⭐⭐ FASE D (28/8) — il kernel ha DAVVERO consumato un messaggio
         * dalla coda (session-registry.mjs, codaMessaggiFn) — il SOLO
         * momento onesto per mostrarlo come un turno utente vero (mai
         * ottimisticamente al POST, vedi accodaMessaggioReale). shift(),
         * non filter: FIFO, lo stesso ordine con cui il server li ha
         * accodati — un evento fuori ordine (mai dovrebbe capitare, ma
         * niente si assume) lascerebbe comunque la lista locale corretta
         * alla lunghezza, solo con l'etichetta sbagliata nel banner.
         */
        appendUserFollowUp(evento.testo);
        state.realSession.codaMessaggi.shift();
        renderizzaBannerCoda();
        mostraAttesaRisposta();
        break;
      }
      case 'RunRedirectRequested': {
        state.realSession.redirectInvalidatedIds.delete(evento.redirectId);
        state.realSession.redirectPendingId = evento.redirectId;
        state.realSession.eventoTerminaleVisto = false;
        mostraAttesaRisposta('redirect');
        syncRunComposerState();
        break;
      }
      case 'RunRedirectApplied': {
        state.realSession.redirectInvalidatedIds.delete(evento.redirectId);
        state.realSession.redirectPendingId = null;
        state.realSession.eventoTerminaleVisto = false;
        appendUserFollowUp(evento.testo);
        state.realSession.followUpBubbleInAttesa = true;
        mostraAttesaRisposta();
        syncRunComposerState();
        break;
      }
      case 'RunRedirectCancelled': {
        state.realSession.redirectInvalidatedIds.add(evento.redirectId);
        state.realSession.redirectPendingId = null;
        toast('Reindirizzamento annullato', 'La richiesta di stop resta attiva.');
        syncRunComposerState();
        break;
      }
      case 'RunRedirectFailed': {
        state.realSession.redirectInvalidatedIds.add(evento.redirectId);
        state.realSession.redirectPendingId = null;
        state.realSession.eventoTerminaleVisto = true;
        nascondiAttesaRisposta();
        appendStatusNote(`Reindirizzamento non riuscito: ${evento.message}`, true);
        toast('Reindirizzamento non riuscito', evento.message);
        syncRunComposerState();
        break;
      }
      case 'RunFinished': {
        /*
         * ⛔⛔⛔ 27/8, owner: "non riesco ad avere una conversazione base col
         * modello" — la causa PRINCIPALE della "risposta duplicata" non era
         * (solo) il replay SSE: `result.detto` qui è LO STESSO testo già
         * mostrato — la risposta finale del giro normale è già arrivata via
         * TextMessageContent/ensureAssistantMessageElement (agent-service.mjs,
         * onGiro→eventiPerRisposta), e per un comando diretto (`!comando`) è
         * la STESSA `content` già mostrata come esito dell'attrezzo
         * (eseguiComandoDiretto: `eventoPerEsitoTool({content})` poi
         * `runFinished({result:{detto: content}})`, stessa variabile). Un
         * secondo bubble che ripete l'intero testo non aggiunge niente — su
         * OGNI singolo giro concluso, non solo dopo una riconnessione. Tolto:
         * lo stato "concluso" resta segnato (sotto) senza ripetere il testo.
         */
        /*
         * ⛔⛔ 27/8, trovato verificando il comando diretto: QUI si chiudeva
         * l'EventSource lato browser (closeRealSession, rimossa) — giusto
         * quando una sessione aveva un giro solo, sbagliato ora che può
         * averne di più (un resume, un comando diretto): durante il REPLAY
         * di una cronologia con due giri, questo troncava la vista alla
         * fine del PRIMO RunFinished, esattamente come il gemello lato
         * server corretto poco fa in http-app.mjs (stessa famiglia di
         * difetto, due lati). Ora si aspetta che sia il SERVER a chiudere
         * lo stream (lo fa già, correttamente, solo a replay finito e
         * senza un giro dal vivo dietro) — si segna solo che l'ultimo
         * evento era terminale, per onerror.
         */
        if (state.realSession.redirectPendingId) mostraAttesaRisposta('redirect');
        else nascondiAttesaRisposta(); // rete di sicurezza: un giro che chiude senza aver mai prodotto testo/tool-call (raro, non impossibile) non deve lasciare la ruota a girare per sempre
        chiudiBatchTool(); // 30/8 — fine turno: un batch di tool-call aperto non resta orfano fino al prossimo giro
        state.realSession.eventoTerminaleVisto = !state.realSession.redirectPendingId;
        syncRunComposerState();
        programmaAggiornamentoElencoSessioniReali(); // il replay di più giri produce un solo refresh visibile della sidebar
        break;
      }
      case 'ApprovalRequested': {
        /*
         * ⭐⭐⭐ 28/8 — permesso "On request": talosHarness.mjs è DAVVERO in
         * pausa, aspettando questa risposta (session-registry.mjs tiene
         * la Promise aperta) — non un evento decorativo.
         */
        nascondiAttesaRisposta();
        const card = appendApprovalCard(evento.requestId, evento.azione);
        state.realSession.approvazioniPendenti.set(evento.requestId, card);
        break;
      }
      case 'ApprovalResolved': {
        /*
         * ⛔⛔⛔ 28/8, trovato dal vivo — l'UNICO punto che finalizza la
         * card (vedi il commento su appendApprovalCard: due canali che
         * scrivevano lo stesso testo raddoppiavano "Approvato"). Se
         * `card._rispostaDataQui()` è vero, il click È partito da
         * QUESTA card — wording pulita, "da un altro client" solo
         * quando è vero davvero.
         */
        const card = state.realSession.approvazioniPendenti.get(evento.requestId);
        if (card) {
          const daQuiStessa = card._rispostaDataQui?.() === true;
          const azioniRiga = card.querySelector('.sheet-actions');
          if (azioniRiga) azioniRiga.remove();
          const copy = card.querySelector('.assistant-copy');
          if (copy) {
            const esito = evento.approvato ? 'Approvato' : 'Negato';
            copy.textContent += daQuiStessa ? ` — ${esito}.` : ` — ${esito} (da un altro client).`;
          }
          state.realSession.approvazioniPendenti.delete(evento.requestId);
        }
        break;
      }
      case 'RunError': {
        if (state.realSession.redirectPendingId) mostraAttesaRisposta('redirect');
        else nascondiAttesaRisposta();
        chiudiBatchTool(); // 30/8 — vedi RunFinished sopra, stesso motivo
        const guida = evento.code === 'giri-esauriti'
          ? ' Il prossimo messaggio continuerà questo task nella stessa sessione. Premi «Nuova» per iniziare un task separato.'
          : '';
        appendStatusNote(`${evento.code ? `[${evento.code}] ` : ''}${evento.message}${guida}`, true);
        state.realSession.eventoTerminaleVisto = !state.realSession.redirectPendingId;
        syncRunComposerState();
        break;
      }
      /*
       * ⭐⭐⭐ 28/8 — FASE A (hook). Solo un hook FIDATO ed eseguito arriva
       * qui (mai per uno non fidato/una sessione senza hook — vedi
       * session-registry.mjs). Un toast basta per la prima fetta: un
       * blocco è già visibile da solo (il tool rifiutato appare come
       * REFUSED nel bubble della chat), questo è per rendere visibile
       * anche l'osservazione silenziosa (post_tool_call, session_start/end).
       */
      case 'HookInvoked': {
        if (evento.esito?.consentito === false) {
          toast(`Hook "${evento.hookId}" ha bloccato ${evento.azione ?? evento.tipo}`, evento.esito.motivo || '');
        }
        break;
      }
      default:
        break;
    }
  }

  /** Apre l'EventSource per una sessione GIÀ avviata sul server e collega gli eventi al rendering reale. */
  /*
   * ⛔ 27/8, buco trovato eseguendo la PRIMA sessione vera end-to-end
   * (piano §1.3-BIS, blocco 1): il badge "Demo UI · non collegato" della
   * chat restava visibile anche con una conversazione reale a schermo —
   * a differenza di Board/contesto/file-tree/foglio, la chat non aveva
   * MAI un punto che lo nascondesse. `collegaEventiSessione` è l'unico
   * luogo comune a `startRealSession` E `passaASessione` (la seconda non
   * passa da `handleRealEvent`/RunStarted se la sessione è già conclusa
   * e si sta solo rivedendo la sua cronologia) — un solo punto, non due.
   *
   * ⛔⛔ Prima versione cercava il PRIMO `.demo-surface-badge` sotto
   * `.chat-view` — sbagliato, scoperto da un test scritto apposta:
   * `nuovaGenerazioneSessione()` (chiamata da entrambi i chiamanti PRIMA
   * di questa funzione) svuota `#conversation` con `replaceChildren()`,
   * portando via CON SÉ sia il badge della chat sia quello di
   * `.approval-card` (entrambi vivono lì dentro) — il primo badge ancora
   * in piedi sotto `.chat-view` a quel punto è quello di `.queued-message`
   * (fuori da `#conversation`, dentro `.composer-wrap`), una superficie
   * SENZA relazione con "la chat è collegata". Il selettore ora risale
   * dal badge al suo `[data-demo-surface]` più vicino e lo accetta solo
   * se è ESATTAMENTE "chat" — mai un altro badge per coincidenza di
   * posizione. Nel caso comune (badge già svuotato dal wipe) trova
   * `undefined` e non fa niente: l'assenza del badge è già l'esito
   * corretto, cercare non serve più ma non deve nuocere.
   */
  function collegaEventiSessione(sessionId, generation) {
    state.realSession.id = sessionId;
    state.realSession.eventoTerminaleVisto = false;
    syncRunComposerState();
    const demoBadgeChat = $$('.demo-surface-badge', $('.chat-view'))
      .find((badge) => badge.closest('[data-demo-surface]')?.dataset.demoSurface === 'chat');
    if (demoBadgeChat) demoBadgeChat.hidden = true;
    const source = new EventSource(API(`/api/v1/sessions/${encodeURIComponent(sessionId)}/events`));
    segnaTappaLatenza('sseCollegato');
    state.realSession.eventSource = source;
    source.onmessage = (message) => {
      segnaTappaLatenza('primoEvento'); // ⭐ il canale è vivo: da qui in poi il ritardo è del modello, non della nostra connessione
      let evento;
      try { evento = JSON.parse(message.data); } catch { return; }
      handleRealEvent(evento, generation);
    };
    /*
     * ⛔⛔ 27/8 — riscritto insieme al fix gemello lato server (vedi
     * handleRealEvent, caso RunFinished): EventSource riprova DA SOLO ad
     * OGNI caduta di connessione, inclusa quella che il server fa apposta
     * quando lo stream è davvero finito — per spec non esiste un
     * "readyState CLOSED da solo", solo un client che chiama .close() lo
     * ottiene. Prima lo faceva closeRealSession (rimossa) appena vedeva UN
     * RunFinished — sbagliato con più giri nel buffer, chiudeva al primo.
     * Ora: se l'ULTIMO evento visto era terminale, questa caduta era attesa
     * (il server ha appena chiuso lo stream a posta fatta) — si chiude qui,
     * niente avviso. Altrimenti è una caduta vera: si lascia che
     * EventSource riprovi da solo, un avviso solo se ha già rinunciato.
     */
    source.onerror = () => {
      if (generation !== state.realSession.generation) return;
      if (state.realSession.eventoTerminaleVisto) {
        source.close();
        state.realSession.eventSource = null;
        return;
      }
      if (source.readyState === EventSource.CLOSED) {
        appendStatusNote('Connessione agli eventi interrotta.', true);
      }
    };
  }

  /** Chiude l'EventSource corrente (se c'è) e apre una nuova generazione. */
  function nuovaGenerazioneSessione({ continua = false } = {}) {
    nascondiAttesaRisposta();
    cancellaRenderMessaggiStreaming();
    cancellaRenderAlberoDifferito();
    // Ogni nuova generazione è live. Solo `passaASessione()` può
    // riabilitare il differimento usando il dato canonico `conclusa`.
    state.realSession.deferHistoricalRendering = false;
    /*
     * RUN-MODEL-RESUME-RACE-10 — durante la POST /resume il vecchio
     * EventSource può già ricevere il nuovo RunStarted e impostare il modello
     * corretto. Il replay successivo scarta quella stessa sequenza: azzerare
     * qui il valore appena osservato produceva "TALOS · sessione reale".
     * Una sessione davvero nuova continua invece a ripartire da null.
     */
    if (!continua) state.realSession.currentRunModel = null;
    if (state.realSession.eventSource) {
      state.realSession.eventSource.close();
      state.realSession.eventSource = null;
    }
    if (!continua) {
      $('#conversation').replaceChildren();
      $('#conversation').classList.remove('is-restoring'); // un ripristino interrotto da una nuova generazione non lascia la chat nascosta
      aggiornaSpazioCodaConversazione($('#conversation')); // conversazione vuota: niente spazio in coda, l'hero resta centrato
      state.realSession.messageElements = new Map();
      state.realSession.runCount = 0;
      state.realSession.taskBubbleMostrata = false;
      state.realSession.reviewFiles = new Map();
      state.realSession.treeCache = new Map();
      state.realSession.treeOpen = new Set();
      state.realSession.treeWorkspaceKey = null;
      state.realSession.treeUiRestored = false;
      state.realSession.previewProjectId = null;
      state.realSession.previewWorkspaceName = null;
      state.realSession.sequenzeViste = new Set();
      state.realSession.testoGrezzoMessaggi = new Map();
      state.realSession.renderIncrementale = new Map();
      state.realSession.browserPagine = [];
      state.realSession.browserIndice = -1;
      state.realSession.ragionamentoBubble = new Map();
      state.realSession.followUpBubbleInAttesa = false;
      state.realSession.redirectPendingId = null;
      state.realSession.redirectInvalidatedIds = new Set();
      state.realSession.redirectRequestInFlight = false;
      state.realSession.redirectRequestIntentId = null;
      state.realSession.attesaBubble = null; // il nodo è già sparito con replaceChildren() qui sopra
      state.realSession.usage = null; // Fase 3 — un resume (continua:true) TIENE il conto, una sessione nuova riparte da IGNOTO
      state.realSession.approvazioniPendenti = new Map(); // le card sono già sparite con replaceChildren() qui sopra, la mappa le segue
      state.realSession.cartellaAssoluta = null; // Fase 3 — una sessione nuova non conosce ancora la propria radice finché RunStarted non arriva
      state.realSession.codaMessaggi = []; // FASE D — una sessione nuova non eredita la coda di quella precedente
      state.realSession.batchAttivo = null; // 30/8 — una sessione nuova non eredita un batch di tool-call della precedente
      state.realSession.ultimoBatchChiuso = null;
      renderizzaBannerCoda();
      // ⛔ 27/8 — Terminale/Browser tengono il loro "già reale" nel DOM
      // (dataset), non in state.realSession: senza questo, restavano
      // mostrati per sempre, mescolati con la sessione successiva.
      resettaSuperficiRealiDedicate();
    }
    state.realSession.id = null;
    syncRunComposerState();
    return (state.realSession.generation += 1);
  }

  /**
   * ⛔ Nessun chiamante ancora: vedi la nota di testa del blocco "LA
   * SESSIONE VERA" — manca il punto d'ingresso UX su mobile. Pronta a
   * essere invocata non appena quella decisione arriva.
   */
  async function startRealSession(task) {
    const generation = nuovaGenerazioneSessione();
    state.realSession.taskId = task.id;
    state.realSession.treeWorkspaceKey = `task:${task.id}`;
    state.session = `Task reale · ${task.id}`;
    sessionTitle.textContent = state.session;
    /* ⛔ 27/8, trovato dalla pipeline QA visiva: solo sessionTitle veniva aggiornato — la card "Session topology" nel Context Rail e la voce "Main" nel foglio Albero sessione restavano al titolo demo ("Refactor auth flow") per sempre. Ogni elemento con lo stesso attributo resta sincronizzato. */
    $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
    setView('chat');
    closePanels();
    appendRealTaskStart(task);
    mostraAttesaRisposta();
    toast('Avvio in corso', `${task.id} · checkout del progetto sul PC che serve questa pagina.`);

    let sessionId;
    try {
      /*
       * ⭐ 27/8 — il modello scelto nel foglio "Modello" viaggia con l'avvio:
       * state.model vuoto = nessuna scelta esplicita, il server usa il suo
       * default.
       *
       * Piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3. Riusa lo
       * stesso segnale di `window.__talosHarnessApiBase` (Fase 1) invece di
       * un secondo flag: se questa pagina gira su mobile ha già una base
       * assoluta piantata, il client non deve dichiararlo due volte in modo
       * diverso. Assente/vuota su desktop → `'desktop'`, il valore di
       * sempre — nessun comportamento nuovo lì.
       */
      const client = window.__talosHarnessApiBase ? 'mobile' : 'desktop';
      const corpo = state.model ? { taskId: task.id, modello: state.model, client } : { taskId: task.id, client };
      const data = await apiPost('/api/v1/sessions', corpo);
      sessionId = data.sessionId;
    } catch (error) {
      if (generation !== state.realSession.generation) return;
      nascondiAttesaRisposta();
      appendStatusNote(`Avvio non riuscito: ${error.message}`, true);
      toast('Avvio non riuscito', error.message);
      /* ⛔ 27/8, trovato dalla pipeline QA visiva: il titolo restava "ottimista" (il nome della sessione appena tentata) anche quando la POST falliva — la sessione non è mai esistita lato server (state.realSession.id resta null). */
      state.session = 'Nessuna sessione';
      $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
      return;
    }
    if (generation !== state.realSession.generation) return;
    collegaEventiSessione(sessionId, generation);
    aggiornaElencoSessioniReali();
  }

  async function stopRealSession() {
    if (!state.realSession.id) { toast('Nessuna sessione reale attiva'); return; }
    const redirectId = state.realSession.redirectRequestIntentId || state.realSession.redirectPendingId;
    if (redirectId) state.realSession.redirectInvalidatedIds.add(redirectId);
    sendButton.disabled = true;
    sendButton.setAttribute('aria-busy', 'true');
    try {
      await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/stop`, redirectId ? { redirectId } : {});
      toast('Stop richiesto', 'La sessione si ferma al prossimo punto sicuro.');
    } catch (error) {
      toast('Stop non riuscito', error.message);
    } finally {
      sendButton.disabled = false;
      sendButton.removeAttribute('aria-busy');
      syncRunComposerState();
    }
  }

  async function reindirizzaSessioneReale(testo) {
    const sessionId = state.realSession.id;
    const pulito = String(testo || '').trim();
    if (!sessionId || state.realSession.eventoTerminaleVisto || !pulito || state.realSession.redirectRequestInFlight || state.realSession.redirectPendingId) return false;
    const redirectId = crypto.randomUUID();
    state.realSession.redirectRequestInFlight = true;
    state.realSession.redirectRequestIntentId = redirectId;
    redirectRunButton.disabled = true;
    redirectRunButton.setAttribute('aria-busy', 'true');
    try {
      const dati = await apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/redirect`, { messaggio: pulito, redirectId });
      if (sessionId !== state.realSession.id) return true;
      const idAccettato = dati?.redirectId || redirectId;
      if (state.realSession.redirectInvalidatedIds.has(redirectId) || state.realSession.redirectInvalidatedIds.has(idAccettato)) {
        state.realSession.redirectInvalidatedIds.delete(redirectId);
        state.realSession.redirectInvalidatedIds.delete(idAccettato);
        return false;
      }
      if (composerInput.value.trim() === pulito) composerInput.value = '';
      autoGrowTextarea();
      syncRunComposerState();
      toast('Reindirizzamento richiesto', 'La correzione verrà applicata al prossimo punto sicuro.');
      return true;
    } catch (error) {
      if (state.realSession.redirectInvalidatedIds.has(redirectId)) {
        state.realSession.redirectInvalidatedIds.delete(redirectId);
        return false;
      }
      toast('Reindirizzamento non riuscito', error.message);
      return false;
    } finally {
      state.realSession.redirectRequestInFlight = false;
      if (state.realSession.redirectRequestIntentId === redirectId) state.realSession.redirectRequestIntentId = null;
      redirectRunButton.disabled = false;
      redirectRunButton.removeAttribute('aria-busy');
      syncRunComposerState();
    }
  }

  /*
   * ⭐⭐⭐ 26/8 — seconda metà del porting desktop→mobile: fork/resume/compact/
   * l'elenco sessioni e l'avvio da corpus. Esclusi dal primo giro perché
   * pescano/scrivono su #sessionList — su mobile EMBEDDED quel pannello è
   * nascosto in favore della sidebar nativa Vue (:host(.talos-embedded) in
   * styles.css lo nasconde già, stesso meccanismo della Board demo). Fuori
   * da un mount embedded (bundle aperto standalone, il caso desktop) quel
   * limite non esiste: #sessionList è lo stesso identico elemento visibile
   * che aveva la copia desktop separata — nessuna duplicazione, nessun
   * secondo elenco da inventare.
   *
   * ⛔ Ancora NON agganciate a createNewSession: cambiare cosa fa "Nuova
   * sessione" è la stessa decisione UX già rimandata (vedi il blocco sopra),
   * solo posticipata al perimetro standalone invece che a quello embedded —
   * non è più ovvia solo perché il vincolo tecnico è diverso.
   */

  /**
   * ⭐ Fork reale quando c'è una sessione reale CONCLUSA attiva. Il server
   * rifiuta con SESSION_NOT_READY (409) su una sessione ancora in corso.
   */
  async function forkSession(targetOverride = null) {
    const origine = targetOverride || (state.realSession.id
      ? { sessionId: state.realSession.id, taskId: state.realSession.taskId, nome: state.session }
      : null);
    if (!origine?.sessionId) {
      toast('Fork creato', 'Nuovo ramo di conversazione da questo punto.');
      return;
    }
    const idOrigine = origine.sessionId;
    const taskIdOrigine = origine.taskId || state.realSession.taskId;
    try {
      const dati = await apiPost(`/api/v1/sessions/${encodeURIComponent(idOrigine)}/fork`, {});
      const generation = nuovaGenerazioneSessione();
      state.realSession.taskId = taskIdOrigine;
      state.session = `Task reale · ${taskIdOrigine} (fork)`;
      sessionTitle.textContent = state.session;
    /* ⛔ 27/8, trovato dalla pipeline QA visiva: solo sessionTitle veniva aggiornato — la card "Session topology" nel Context Rail e la voce "Main" nel foglio Albero sessione restavano al titolo demo ("Refactor auth flow") per sempre. Ogni elemento con lo stesso attributo resta sincronizzato. */
    $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
      appendStatusNote(`Fork avviato dalla sessione ${idOrigine.slice(0, 8)}… — stessa cartella, stessa storia.`);
      collegaEventiSessione(dati.sessionId, generation);
      aggiornaElencoSessioniReali();
      toast('Fork creato', 'Nuovo ramo di conversazione da questo punto.');
    } catch (error) {
      toast('Fork non riuscito', error.message);
    }
  }

  /**
   * ⭐ Resume reale quando c'è una sessione reale CONCLUSA attiva. A
   * differenza del fork, torna LO STESSO sessionId: riprende un giro in più
   * sulla stessa conversazione, non ne crea una nuova.
   */
  /**
   * @param {string} [messaggioFollowUp] — ⛔⛔⛔ 27/8, owner: "non riesco ad
   * avere una conversazione base col modello". Senza argomento: il resume
   * di sempre (riprende un giro interrotto). Con un testo: è un secondo
   * turno di chat reale — vedi submitPrompt(), unico chiamante di questo
   * secondo caso. Stesso endpoint, stessa funzione: nessuna duplicazione.
   */
  async function resumeSession(messaggioFollowUp) {
    if (!state.realSession.id) { toast('Nessuna sessione reale da riprendere'); return; }
    const sessionId = state.realSession.id;
    const taskId = state.realSession.taskId;
    iniziaMisuraLatenza(messaggioFollowUp ? 'follow-up' : 'resume senza messaggio');
    if (messaggioFollowUp) { appendUserFollowUp(messaggioFollowUp); state.realSession.followUpBubbleInAttesa = true; }
    mostraAttesaRisposta(); // sia il follow-up sia un resume senza messaggio riavviano un giro vero
    try {
      segnaTappaLatenza('postInviata');
      await apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/resume`, messaggioFollowUp ? { messaggio: messaggioFollowUp } : {});
      segnaTappaLatenza('postRisposta');
      // continua:true — STESSA vista: la conversazione resta a schermo, il
      // follow-up già mostrato (sopra) e la risposta che arriva bastano.
      const generation = nuovaGenerazioneSessione({ continua: true });
      /*
       * ⛔⛔⛔ 02/9 — riprodotto dal vivo con strumentazione (screenshot +
       * campionamento ogni 30ms): `nuovaGenerazioneSessione` chiama SEMPRE
       * `nascondiAttesaRisposta()` in testa (riga corrispondente più sopra
       * nel file) — anche con `continua:true`, dove serve solo per
       * cancellare i render pendenti del giro precedente. Il risultato:
       * la bolla creata da `mostraAttesaRisposta()` due righe sopra questo
       * blocco veniva distrutta un istante dopo, PRIMA che il nuovo
       * EventSource riproducesse la cronologia e arrivasse al giro vero —
       * un vuoto reale (misurato: 0 bolle su 50 campioni in 1,5s) fino al
       * primo `TextMessageContent`/segnale utile, che con provider lenti
       * (gemini-3.7-flash, gap fino a ~10s per misura di Fable) è
       * lunghissimo. `RunStarted` non richiama `mostraAttesaRisposta()`:
       * niente altro la rimette. Si ri-arma qui, subito dopo il wipe.
       */
      mostraAttesaRisposta();
      /*
       * ⛔⛔⛔ 02/9 — QUI c'era `deferHistoricalRendering = true` per il
       * replay del resume. TOLTO, ed è la correzione più importante di
       * questo giro: era la causa del "delay assurdo tra quando elabora e
       * quando stampa" segnalato dall'owner, non una cura.
       *
       * ⭐ La prova, tracciando OGNI messaggio SSE per singolo stream
       * (sonda con `EventSource` patchato, non una rilettura del codice):
       *
       *   t=9163 S2  RunStarted        seq=8  giaVista=false  ← il turno NUOVO
       *   t=9163 S2  CHIUSO   /  S3 APERTO
       *   t=9166 S3  RunStarted seq=1..8      giaVista=TRUE   ← replay, scartato
       *   t=10472 S3 TextMessageContent seq=9+ giaVista=false ← la risposta vera
       *
       * Il RunStarted del turno nuovo arriva sul VECCHIO stream (S2, ancora
       * aperto durante la POST /resume) e viene registrato in
       * `sequenzeViste`; quando il nuovo stream lo rigioca, il dedup per
       * `_sequenza` lo scarta — quindi NESSUN RunStarted "nuovo" arriva
       * mai sullo stream nuovo, il contatore non avanza e il
       * differimento resta acceso PER SEMPRE (misurato: `defer:true` a
       * fine giro). Con il differimento acceso `TextMessageContent` non
       * chiama `programmaRenderMessaggioStreaming`: la risposta non
       * scorre più parola per parola, compare in blocco alla fine — 9
       * secondi di attesa con zero caratteri, poi 2.070 tutti insieme.
       *
       * ⛔ E non serviva: il replay è GIÀ neutralizzato a monte dal dedup
       * `_sequenza` (vedi handleRealEvent), che scarta gli eventi
       * rigiocati prima di qualunque render o scroll. Il salto di scroll
       * che l'owner vedeva aveva un'altra causa, trovata e curata
       * separatamente in `scorriAllaBollaAppesa` (scrollIntoView non
       * muoveva un pixel — vedi il commento lì).
       * ⇒ `deferHistoricalRendering` torna a servire SOLO ciò per cui era
       * nato: aprire una sessione già CONCLUSA (`passaASessione`, con
       * `conclusa:true`), dove la cronologia si costruisce davvero da zero.
       */
      state.realSession.taskId = taskId;
      collegaEventiSessione(sessionId, generation);
      aggiornaElencoSessioniReali();
      if (!messaggioFollowUp) toast('Sessione ripresa', 'Un nuovo giro è iniziato sulla stessa conversazione.');
    } catch (error) {
      nascondiAttesaRisposta();
      if (messaggioFollowUp) appendStatusNote(`Invio non riuscito: ${error.message}`, true); // il bubble utente resta — l'ha scritto davvero, solo non e' arrivato
      toast(messaggioFollowUp ? 'Invio non riuscito' : 'Resume non riuscito', error.message);
    }
  }

  /**
   * ⭐⭐⭐ FASE D (28/8) — un messaggio scritto mentre la sessione reale
   * sta ANCORA girando. Niente bubble ottimistico qui: il messaggio è
   * solo IN CODA, non ancora visto dal modello — il bubble vero compare
   * al case QueuedMessageDelivered, quando il kernel lo consuma
   * davvero (vedi renderizzaBannerCoda). Fallita la POST, il testo
   * torna nel composer: non si perde mai in silenzio.
   */
  async function accodaMessaggioReale(testo) {
    const sessionId = state.realSession.id;
    try {
      const dati = await apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/queue`, { messaggio: testo });
      if (sessionId !== state.realSession.id) return; // la sessione a schermo è già un'altra, questo accodamento non la riguarda più
      state.realSession.codaMessaggi.push(testo);
      renderizzaBannerCoda();
      toast('Messaggio in coda', `Arriverà quando l'agente conclude il turno corrente (posizione ${dati.posizione}).`);
    } catch (error) {
      composerInput.value = testo;
      autoGrowTextarea();
      toast('Messaggio non accodato', error.message);
    }
  }

  /**
   * ⭐ "Compatta ora" reale quando c'è una sessione reale CONCLUSA attiva.
   * Non avvia nessun giro nuovo: sostituisce ciò che una PROSSIMA
   * resume/fork erediterebbe — la conversazione già mostrata non cambia.
   */
  async function compactSession() {
    if (!state.realSession.id) {
      toast('Contesto compattato', '18.7k -> 9.3k token equivalenti.');
      return;
    }
    if (compattazioneInCorso) return;
    const bottoneCompattazione = $('#compactSessionBtn');
    compattazioneInCorso = true;
    if (bottoneCompattazione) {
      bottoneCompattazione.disabled = true;
      bottoneCompattazione.setAttribute('aria-busy', 'true');
      bottoneCompattazione.setAttribute('aria-label', 'Compattazione in corso');
      bottoneCompattazione.title = 'Compattazione in corso…';
      bottoneCompattazione.classList.add('is-loading');
    }
    try {
      const dati = await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/compact`, {});
      toast(
        dati.compattato ? 'Contesto compattato' : 'Compattazione saltata',
        dati.compattato
          ? 'Il prossimo resume o fork riparte dal riassunto.'
          : 'Il modello non ha risposto: la conversazione resta quella intera.',
      );
    } catch (error) {
      toast('Compattazione non riuscita', error.message);
    } finally {
      compattazioneInCorso = false;
      if (bottoneCompattazione) {
        bottoneCompattazione.disabled = false;
        bottoneCompattazione.removeAttribute('aria-busy');
        bottoneCompattazione.setAttribute('aria-label', 'Comprimi il contesto');
        bottoneCompattazione.removeAttribute('title');
        bottoneCompattazione.classList.remove('is-loading');
      }
    }
  }

  /**
   * ⭐⭐⭐ "Cronologia": passa a una sessione GIÀ esistente (viva o conclusa)
   * invece di avviarne una nuova. Non serve leggere la sua storia a parte:
   * aprire l'EventSource la riproduce da sola (iscriviti() nel registro
   * rimanda TUTTI gli eventi già accaduti a chi si collega).
   */
  function normalizzaModelloSessione(sessioneOrModel) {
    if (typeof sessioneOrModel === 'string') return sessioneOrModel.trim();
    const valore = sessioneOrModel?.modello ?? sessioneOrModel?.modelId ?? sessioneOrModel?.model;
    return typeof valore === 'string' ? valore.trim() : '';
  }

  let catenaAggiornamentiSessione = Promise.resolve();
  function sincronizzaImpostazioniSessione(patch) {
    salvaPreferenzeChatDesktop();
    const sessionId = state.realSession.id;
    if (!sessionId || !patch || Object.keys(patch).length === 0) return Promise.resolve({ locale: true });
    const richiesta = catenaAggiornamentiSessione
      .catch(() => undefined)
      .then(() => apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/settings`, patch))
      .then((esito) => {
        const sessione = state.sessionSelection.available.get(sessionId);
        if (sessione) {
          Object.assign(sessione, patch);
          if (typeof patch.modello === 'string') sessione.modelId = patch.modello;
        }
        return esito;
      });
    catenaAggiornamentiSessione = richiesta.catch(() => undefined);
    richiesta.catch((error) => {
      toast('Preferenza non salvata', messaggioErroreUtente(error, 'La scelta non è stata salvata. Apri Doctor e riprova.'));
    });
    return richiesta;
  }

  function applicaImpostazioniSessione(sessione) {
    const reasoning = sessione?.reasoning && typeof sessione.reasoning === 'object' ? sessione.reasoning : null;
    state.model = normalizzaModelloSessione(sessione);
    state.effort = typeof reasoning?.effort === 'string' ? reasoning.effort : null;
    state.permissions = ['Read only', 'Workspace write', 'On request', 'Full access'].includes(sessione?.permessi)
      ? sessione.permessi
      : DESKTOP_CHAT_DEFAULTS.permissions;
    state.permessiPerAttrezzo = sessione?.permessiPerAttrezzo && typeof sessione.permessiPerAttrezzo === 'object'
      ? { ...sessione.permessiPerAttrezzo }
      : {};
    aggiornaPillolaModello();
    aggiornaPillolaPermessi();
    salvaPreferenzeChatDesktop();
  }

  function aggiornaToolbarSelezioneSessioni() {
    if (!sessionSelectionToolbar) return;
    const totale = state.sessionSelection.available.size;
    const selezionate = state.sessionSelection.selected.size;
    sessionSelectionToolbar.hidden = totale === 0;
    sessionSelectionToggle.hidden = totale === 0;
    sessionSelectionToggle.setAttribute('aria-pressed', String(state.sessionSelection.active));
    sessionSelectionToggle.textContent = state.sessionSelection.active ? 'Fine selezione' : 'Seleziona sessioni';
    sessionSelectionSelectAll.hidden = !state.sessionSelection.active;
    sessionSelectionSelectAll.disabled = totale === 0;
    const tutto = totale > 0 && selezionate === totale;
    sessionSelectionSelectAll.textContent = tutto ? 'Deseleziona tutto' : 'Seleziona tutto';
    sessionSelectionDelete.hidden = !state.sessionSelection.active;
    sessionSelectionDelete.disabled = selezionate === 0 || state.sessionSelection.deleting;
    sessionSelectionCount.textContent = selezionate === 0 ? 'Nessuna selezionata' : `${selezionate} selezionat${selezionate === 1 ? 'a' : 'e'}`;
  }

  function aggiornaStatoRigheSelezione() {
    for (const input of $$('[data-session-select]')) {
      const checked = state.sessionSelection.selected.has(input.dataset.sessionSelect);
      input.checked = checked;
      input.closest('.real-session-item')?.classList.toggle('is-selected', checked);
    }
    aggiornaToolbarSelezioneSessioni();
  }

  async function toggleSessionSelectionMode() {
    state.sessionSelection.active = !state.sessionSelection.active;
    state.sessionSelection.selected.clear();
    aggiornaToolbarSelezioneSessioni();
    await aggiornaElencoSessioniReali();
  }

  function toggleSessionSelection(sessionId, checked) {
    if (!sessionId) return;
    if (checked) state.sessionSelection.selected.add(sessionId);
    else state.sessionSelection.selected.delete(sessionId);
    aggiornaStatoRigheSelezione();
  }

  async function eliminaSessioniSelezionate() {
    const ids = [...state.sessionSelection.selected].filter((id) => state.sessionSelection.available.has(id));
    if (ids.length === 0 || state.sessionSelection.deleting) return;
    const conferma = window.confirm(`Eliminare ${ids.length} session${ids.length === 1 ? 'e' : 'i'} selezionat${ids.length === 1 ? 'a' : 'e'}? Le trascrizioni verranno cancellate dal disco.`);
    if (!conferma) return;
    state.sessionSelection.deleting = true;
    aggiornaToolbarSelezioneSessioni();
    const risultati = await Promise.allSettled(ids.map((id) => apiPost(`/api/v1/sessions/${encodeURIComponent(id)}/delete`, {})));
    const fallite = risultati.filter((result) => result.status === 'rejected');
    state.sessionSelection.deleting = false;
    state.sessionSelection.selected.clear();
    if (fallite.length > 0) {
      toast('Alcune sessioni non sono state eliminate', `${fallite.length} ${fallite.length === 1 ? 'operazione non riuscita' : 'operazioni non riuscite'}. Riprova.`);
    } else {
      toast('Sessioni eliminate', `${ids.length} session${ids.length === 1 ? 'e' : 'i'} rimosse.`);
      state.sessionSelection.active = false;
    }
    await aggiornaElencoSessioniReali();
    if (state.board.initialized) await refreshSessionsBoard();
  }

  /*
   * ⛔⛔⛔ 02/9 — owner dal vivo, dopo aver cliccato una riga: "adesso se
   * clicco una mi scrolla all'inizio non alla fine". Misurato con una
   * sonda CDP dedicata (non un'ipotesi): lo scroll ARRIVA al fondo giusto
   * (confermato per 9s filati), ma solo al TextMessageEnd dell'ULTIMO
   * messaggio — per una cronologia lunga (un solo messaggio da 11.257px
   * in questo caso) questo può volerci diversi secondi, durante i quali
   * la conversazione resta ferma in cima: sembra rotta, non lo è, è solo
   * in ritardo. Un MutationObserver segue il fondo VERO (scrollHeight,
   * non il centro — qui non si sta scrivendo nulla dal vivo, si sta solo
   * aprendo una cronologia già conclusa) ad ogni frammento che arriva
   * durante il ripristino, invece di aspettare l'ultimo evento soltanto.
   */
  function mantieniFondoDuranteRipristino(generation) {
    const conversation = $('#conversation');
    if (!conversation) return;
    const inFondo = () => { aggiornaSpazioCodaConversazione(conversation); conversation.scrollTop = conversation.scrollHeight; };
    // Scopre la conversazione SOLO quando è già in fondo: prima porta il fondo, poi toglie is-restoring, poi ribatte il fondo (togliere la classe non cambia il layout, ma costa zero essere sicuri).
    const scopri = () => { if (generation !== state.realSession.generation) return; inFondo(); conversation.classList.remove('is-restoring'); inFondo(); };
    const osservatore = new MutationObserver(inFondo);
    // ⛔ 02/09 — misurato dal vivo: 12320 su 12334, 14px sopra il fondo per 4s filati. L'ultima MUTAZIONE di figli non è l'ultimo cambio di altezza: markMotionEnter cambia una classe (attributo, non childList) un frame dopo l'inserimento e il layout cresce ancora. Si osservano anche gli attributi, e alla fine del ripristino si ribatte il fondo su due frame successivi.
    osservatore.observe(conversation, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
    const fermaSeFinito = window.setInterval(() => {
      if (generation !== state.realSession.generation || state.realSession.eventoTerminaleVisto) {
        osservatore.disconnect();
        window.clearInterval(fermaSeFinito);
        if (generation === state.realSession.generation) { scopri(); window.requestAnimationFrame(inFondo); window.setTimeout(inFondo, 250); }
      }
    }, 200);
    // Rete di sicurezza per la VISIBILITÀ: una sessione conclusa senza evento terminale nel replay (interrotta) non resta nascosta per sempre — 8s bastano a qualunque cronologia vista finora (1.235 righe in ~1s).
    window.setTimeout(scopri, 8_000);
    // Rete di sicurezza: mai un osservatore vivo per sempre se il segnale di fine non arriva (connessione caduta, sessione mai conclusa per davvero).
    window.setTimeout(() => { osservatore.disconnect(); window.clearInterval(fermaSeFinito); }, 30_000);
  }

  function passaASessione(sessionId, taskId, nome, modello, impostazioniSessione = null) {
    if (state.sessionSelection.active) {
      toggleSessionSelection(sessionId, !state.sessionSelection.selected.has(sessionId));
      return;
    }
    const contrattoSessione = impostazioniSessione || { modello };
    if (sessionId === state.realSession.id) {
      applicaImpostazioniSessione(contrattoSessione);
      setView('chat');
      closePanels();
      /* ⛔⛔⛔ 02/9 — owner dal vivo, dopo il fix di mantieniFondoDuranteRipristino:
       * questo ramo (si riclicca la riga della sessione GIÀ aperta — es.
       * dopo essere scrollati in su per rileggere qualcosa) non passa da
       * nuovaGenerazioneSessione/passaASessione per intero, quindi non
       * chiamava NESSUNO scroll — l'unico posto rimasto dove "clicco una
       * riga sessione" non portava mai in fondo. Qui il contenuto è già
       * tutto a schermo (nessun ripristino in corso): istantaneo, non
       * serve un MutationObserver. */
      const conversation = $('#conversation');
      aggiornaSpazioCodaConversazione(conversation);
      if (conversation) conversation.scrollTop = conversation.scrollHeight;
      return;
    }
    const generation = nuovaGenerazioneSessione();
    state.realSession.deferHistoricalRendering = impostazioniSessione?.conclusa === true;
    /* ⛔ 02/09, owner: "quando clicchi su una riga sessione la chat deve trovarsi già in fondo senza animazioni" — la cronologia si costruisce INVISIBILE (ma impaginata: lo scroll la porta in fondo a ogni frammento), e si scopre solo quando è tutta lì, già in fondo (mantieniFondoDuranteRipristino). */
    $('#conversation')?.classList.toggle('is-restoring', state.realSession.deferHistoricalRendering);
    state.realSession.taskId = taskId;
    state.realSession.treeWorkspaceKey = `session:${sessionId}`;
    state.session = nome || `Task reale · ${taskId}`; // ⭐ un nome scelto dall'owner vince sul taskId
    applicaImpostazioniSessione(contrattoSessione);
    sessionTitle.textContent = state.session;
    /* ⛔ 27/8, trovato dalla pipeline QA visiva: solo sessionTitle veniva aggiornato — la card "Session topology" nel Context Rail e la voce "Main" nel foglio Albero sessione restavano al titolo demo ("Refactor auth flow") per sempre. Ogni elemento con lo stesso attributo resta sincronizzato. */
    $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
    setView('chat');
    closePanels();
    collegaEventiSessione(sessionId, generation);
    if (state.realSession.deferHistoricalRendering) mantieniFondoDuranteRipristino(generation);
    aggiornaElencoSessioniReali();
  }

  function formattaOraSessione(iso) {
    try {
      return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function contenitoreSessioniReali() {
    let contenitore = $('#realSessionsBlock');
    if (!contenitore) {
      contenitore = document.createElement('div');
      contenitore.id = 'realSessionsBlock';
      $('#sessionList')?.prepend(contenitore);
    }
    return contenitore;
  }

  /**
   * ⭐⭐⭐ La "cronologia" reale della sidebar — sostituisce (in un blocco
   * suo, sopra le voci demo che restano invariate) un elenco vuoto con
   * quello vero appena almeno una sessione reale esiste. Su mobile
   * EMBEDDED #sessionList resta nascosto da styles.css: questa funzione
   * scrive comunque nel DOM (nessun guard qui, il guard è visivo/CSS,
   * stesso principio già in uso per renderSessionsBoard/Board), pronta a
   * comparire appena il ponte verso la sidebar nativa Vue esisterà.
   */
  /**
   * ⭐⭐⭐ 02/9 — i cinque stati veri di una sessione, tutti da campi che il
   * server manda già. Ricerca (vedi il dossier): Claude traccia
   * Working/Needs Approval/Waiting/Idle, Hermes mostra modello e conteggi,
   * Codex ha un buco documentato proprio sul MOTIVO del fallimento
   * (issue #30713) — che noi abbiamo in `ultimoEsito` e non mostravamo.
   *
   * ⛔ L'ordine dei controlli è la parte che conta: «in attesa di
   * approvazione» viene PRIMA di «in corso», perché è lo stato che chiede
   * qualcosa alla persona ed è quello che non deve annegare fra gli altri.
   * ⛔ E `interrotta` prima di `conclusa`: una sessione fermata a metà è
   * chiusa, ma non è finita — dirle uguali sarebbe la bugia che stiamo
   * togliendo.
   */
  function statoSessione(sessione) {
    if (sessione.inAttesaApprovazione) return { classe: 'attesa', testo: 'in attesa di approvazione' };
    if (!sessione.conclusa) return { classe: 'vivo', testo: 'in corso · live' };
    if (sessione.interrotta) return { classe: 'interrotto', testo: 'interrotta' };
    if (sessione.ultimoEsito === 'errore') return { classe: 'errore', testo: 'conclusa con errore' };
    if (sessione.ultimoEsito === 'successo') return { classe: 'successo', testo: 'conclusa' };
    // ⛔ Nessun esito registrato ≠ successo: le sessioni vecchie non lo
    // hanno, e chiamarle "riuscite" sarebbe inventare un fatto.
    return { classe: 'ignoto', testo: 'conclusa · esito non registrato' };
  }

  async function aggiornaElencoSessioniReali() {
    const contenitore = contenitoreSessioniReali();
    let elenco;
    try {
      elenco = (await apiGet('/api/v1/sessions')).items;
    } catch {
      return; // ⛔ un aggiornamento sidebar fallito non è un'azione richiesta, non merita un toast
    }
    aggiornaNotifiche(elenco);
    $('#noSessionsPlaceholder')?.toggleAttribute('hidden', Array.isArray(elenco) && elenco.length > 0); // 02/09 — il riquadro "Nessuna sessione ancora" stava sotto quattro sessioni reali
    /*
     * ⭐ 27/8, trovato analizzando quali badge non si spengono MAI: questa
     * funzione aggiungeva sessioni vere in un blocco separato senza mai
     * nascondere il badge del pannello INTERO (`data-demo-surface="sessions"`
     * su #sessionsPanel) — "Demo UI · non collegato" restava scritto sopra
     * sessioni realmente in corso. Le voci demo statiche restano sotto per
     * riferimento (non è quello il bug), ma l'etichetta in cima deve
     * smettere di mentire appena ne esiste almeno una vera.
     */
    if (elenco.length > 0) {
      const demoBadge = $('.demo-surface-badge', $('#sessionsPanel'));
      if (demoBadge) demoBadge.hidden = true;
    }
    elenco = Array.isArray(elenco) ? elenco.map((sessione) => ({ ...sessione, modello: normalizzaModelloSessione(sessione) })) : [];
    state.sessionSelection.available = new Map(elenco.map((sessione) => [sessione.sessionId, sessione]));
    for (const id of [...state.sessionSelection.selected]) {
      if (!state.sessionSelection.available.has(id)) state.sessionSelection.selected.delete(id);
    }
    if (elenco.length === 0) {
      state.sessionSelection.active = false;
      state.sessionSelection.selected.clear();
      contenitore.replaceChildren();
      aggiornaToolbarSelezioneSessioni();
      return;
    }

    const pezzi = [textElement('div', 'list-heading', 'Sessioni reali')];
    for (const sessione of elenco) {
      const button = document.createElement('div');
      button.className = `session-item real-session-item${sessione.sessionId === state.realSession.id ? ' active' : ''}${state.sessionSelection.active ? ' is-selection-mode' : ''}`;
      button.tabIndex = 0;
      button.setAttribute('role', 'button');
      button.dataset.realSessionId = sessione.sessionId;
      const main = document.createElement('span');
      main.className = 'session-main';
      const etichetta = sessione.nome || sessione.taskId; // ⭐ un nome scelto dall'owner vince sempre sul taskId
      /*
       * ⭐⭐⭐ 02/9 — la riga diceva solo «concluso» o «in corso»: una
       * sessione FALLITA e una RIUSCITA si leggevano identiche. Il server
       * mandava già tutto (`ultimoEsito`, `interrotta`,
       * `inAttesaApprovazione`, `modello`, `usage`) e la riga ne usava
       * due campi su otto — il divario con i concorrenti non era di dati,
       * era di resa (vedi DOSSIER-LISTA-SESSIONI-CONFRONTO-2026-09-02.md).
       * ⛔ Nessun dato inventato: ogni pezzo qui sotto esiste nella
       * risposta di `GET /api/v1/sessions`, e ciò che manca non si scrive.
       */
      const stato = statoSessione(sessione);
      const riga = document.createElement('small');
      riga.className = 'session-stato';
      riga.dataset.sessionState = stato.classe;
      riga.append(textElement('span', 'session-stato-punto', ''), textElement('span', '', stato.testo));
      // ⭐ Il modello, come fa Hermes: è la domanda più frequente su una
      // sessione vecchia («con quale modello l'avevo fatta?»).
      /*
       * ⛔ 02/9 — solo il NOME del modello, senza il prefisso del provider
       * (google/gemini-3.7-flash -> gemini-3.7-flash): misurato dal
       * vivo, con il prefisso il nome veniva TRONCATO e i giri finivano
       * fuori dalla riga. Il provider e' gia' nella scheda della sessione,
       * qui ruberebbe spazio a un dato che non si vede da nessun'altra
       * parte. Nessuna informazione persa, solo non ripetuta.
       */
      if (sessione.modello) riga.append(textElement('span', 'session-stato-extra', String(sessione.modello).split('/').pop()));
      /*
       * ⛔ Token e giri SOLO se il server li ha davvero contati: `usage`
       * è null per le sessioni registrate prima che il conteggio
       * esistesse, e lì non si scrive nulla invece di uno zero finto.
       */

      main.append(textElement('strong', '', sessione.forkDa ? `${etichetta} · fork` : etichetta), riga);
      const meta = document.createElement('span');
      meta.className = 'session-meta';
      /*
       * ⛔ 02/9 — i giri vanno QUI, nella colonna destra, non nella riga di
       * stato: misurato dal vivo, in una sidebar da 292px lo stato + il
       * modello + i giri si troncavano a «6 g». Un fatto troncato e' peggio
       * di un fatto assente — sembra un dato, ma non si legge. Questa
       * colonna ha gia' una riga libera sotto l'ora (grid-template-rows:
       * auto 1fr), ed e' il posto giusto per un conteggio.
       * ⛔ Solo se il server li ha davvero contati: `usage` è null sulle
       * sessioni registrate prima che il conteggio esistesse, e lì non si
       * scrive nulla invece di uno zero finto.
       */
      meta.append(textElement('span', '', formattaOraSessione(sessione.avviataAlle)));
      const giri = sessione.usage?.giri;
      if (Number.isFinite(giri) && giri > 0) meta.append(textElement('span', 'session-meta-giri', `${giri} gir${giri === 1 ? 'o' : 'i'}`));
      if (state.sessionSelection.active) {
        const checkLabel = document.createElement('label');
        checkLabel.className = 'session-selection-check';
        checkLabel.title = `Seleziona ${etichetta}`;
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.dataset.sessionSelect = sessione.sessionId;
        check.checked = state.sessionSelection.selected.has(sessione.sessionId);
        check.setAttribute('aria-label', `Seleziona ${etichetta}`);
        check.addEventListener('click', (event) => event.stopPropagation());
        check.addEventListener('change', () => toggleSessionSelection(sessione.sessionId, check.checked));
        checkLabel.appendChild(check);
        button.append(checkLabel);
      }
      button.append(main, meta);
      button.addEventListener('click', () => passaASessione(sessione.sessionId, sessione.taskId, sessione.nome, sessione.modello, sessione));
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        passaASessione(sessione.sessionId, sessione.taskId, sessione.nome, sessione.modello, sessione);
      });
      /* ⭐ 31/8 P0 — tasto destro apre il menu completo condiviso con la
       * Board e con il menu CRUD dei Files. */
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        apriMenuAzioniSessione({ ...sessione, nome: etichetta }, { x: event.clientX, y: event.clientY, focusElement: button });
      });
      pezzi.push(button);
    }
    contenitore.replaceChildren(...pezzi);
    aggiornaToolbarSelezioneSessioni();
  }

  /**
   * ⭐⭐⭐ 27/8 — blocco 7, la vera schedulazione. Owner: "hai il mio via
   * libera". Sostituisce la riga demo statica ("Weekly dependency audit",
   * "Lun 08:00" — mai esistita davvero) con l'elenco VERO da
   * GET /api/v1/automations, e nasconde il badge della vista appena ne
   * esiste almeno una — stesso principio già usato per #sessionsPanel.
   */
  /**
   * ⭐ 27/8, trovato nel sweep Fase B: la card "attention" della sidebar
   * diceva SEMPRE "2 automazioni · Prossima esecuzione 10:00" — testo
   * statico in index.html, mai toccato da una riga di JS, indipendente da
   * quante automazioni esistano davvero (la vista reale ne mostrava 1, non
   * 2). Stessa famiglia di bug già chiusa oggi per il Capability hub e il
   * badge Doctor: un mockup lasciato acceso invece di leggere lo stato
   * vero. Nessuna automazione -> la card sparisce (nessun invito a
   * un'azione che non c'è), non resta a dire "0".
   */
  function aggiornaWidgetAutomazioni(elenco) {
    const card = $('.attention-card');
    if (!card) return;
    if (!elenco || elenco.length === 0) { card.hidden = true; return; }
    card.hidden = false;
    const titolo = $('strong', card);
    const sottotitolo = $('span', card);
    if (titolo) titolo.textContent = `${elenco.length} automazion${elenco.length === 1 ? 'e' : 'i'}`;
    if (sottotitolo) {
      const prossime = elenco.filter((a) => a.attiva && a.prossimaEsecuzione).map((a) => a.prossimaEsecuzione).sort();
      sottotitolo.textContent = prossime.length > 0 ? `Prossima esecuzione ${formattaOraSessione(prossime[0])}` : 'Nessuna attiva';
    }
  }

  async function renderAutomationsReali() {
    const contenitore = $('#automationListReal');
    if (!contenitore) return;
    let elenco;
    try {
      elenco = (await apiGet('/api/v1/automations')).items;
    } catch {
      return; // ⛔ un refresh fallito non è un'azione richiesta, non merita un toast
    }
    aggiornaWidgetAutomazioni(elenco);
    if (elenco.length > 0) {
      const demoBadge = $('.demo-surface-badge', $('[data-view="automations"]'));
      if (demoBadge) demoBadge.hidden = true;
    }
    const pezzi = elenco.map((automazione) => {
      const article = document.createElement('article');
      article.className = 'automation-row';
      const iconWrap = document.createElement('div');
      iconWrap.className = 'automation-icon';
      iconWrap.innerHTML = icon(automazione.attiva ? 'i-clock' : 'i-history');
      const testo = document.createElement('div');
      const stato = automazione.attiva
        ? `attiva · ogni ${automazione.intervalloMinuti} min · max ${automazione.limiteAlGiorno}/giorno · prossima ${formattaOraSessione(automazione.prossimaEsecuzione)}`
        : `in pausa · ogni ${automazione.intervalloMinuti} min · max ${automazione.limiteAlGiorno}/giorno`;
      testo.append(textElement('strong', '', automazione.nome), textElement('small', '', stato));
      const chip = document.createElement('span');
      chip.className = `status-chip${automazione.attiva ? ' success' : ''}`;
      chip.textContent = automazione.attiva ? 'Attiva' : 'Pausa';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'secondary-btn compact';
      toggleBtn.textContent = automazione.attiva ? 'Pausa' : 'Attiva';
      toggleBtn.addEventListener('click', async () => {
        try {
          await apiPost(`/api/v1/automations/${encodeURIComponent(automazione.id)}/toggle`, { attiva: !automazione.attiva });
          toast(automazione.attiva ? 'Automazione in pausa' : 'Automazione attivata', automazione.nome);
          renderAutomationsReali();
        } catch (error) {
          toast('Operazione non riuscita', error.message);
        }
      });
      const eliminaBtn = document.createElement('button');
      eliminaBtn.className = 'secondary-btn compact';
      eliminaBtn.textContent = 'Elimina';
      eliminaBtn.addEventListener('click', async () => {
        try {
          await apiPost(`/api/v1/automations/${encodeURIComponent(automazione.id)}/elimina`, {});
          toast('Automazione eliminata', automazione.nome);
          renderAutomationsReali();
        } catch (error) {
          toast('Operazione non riuscita', error.message);
        }
      });
      article.append(iconWrap, testo, chip, toggleBtn, eliminaBtn);
      return article;
    });
    contenitore.replaceChildren(...pezzi);
  }

  /** Il foglio "Nuova automazione": task dal corpus + intervallo + limite giornaliero, gli stessi tetti duri validati anche lato server. */
  async function openNewAutomationSheet() {
    sheetEyebrow.textContent = 'Automazioni';
    sheetTitle.textContent = 'Nuova automazione';
    sheetBody.replaceChildren(textElement('p', 'board-empty', 'Carico l’elenco dal server…'));
    prepareResizableDialog(sheetDialog, 'sheet:new-automation');
    showEmbeddedDialog(sheetDialog);

    let tasks;
    try {
      tasks = (await apiGet('/api/v1/tasks')).items;
    } catch (error) {
      sheetBody.replaceChildren(textElement('p', 'board-empty', 'Non riesco a caricare le attività in questo momento. Apri Doctor per capire cosa manca e riprova.'));
      return;
    }
    if (!Array.isArray(tasks) || tasks.length === 0) {
      sheetBody.replaceChildren(textElement('p', 'board-empty', 'Non ci sono ancora attività pronte per creare un’automazione. Puoi preparare il catalogo nelle impostazioni oppure riprovare più tardi.'));
      return;
    }

    const form = document.createElement('form');
    form.className = 'sheet-section';
    form.appendChild(textElement('span', 'sheet-label', 'Task del corpus'));
    const selectTask = document.createElement('select');
    selectTask.className = 'sheet-input';
    for (const task of tasks) {
      const opzione = document.createElement('option');
      opzione.value = task.id;
      opzione.textContent = `${task.id} · difficoltà ${task.difficolta}`;
      selectTask.appendChild(opzione);
    }
    form.appendChild(selectTask);
    form.appendChild(textElement('span', 'sheet-label', 'Ogni quanti minuti'));
    const inputIntervallo = document.createElement('input');
    inputIntervallo.className = 'sheet-input';
    inputIntervallo.type = 'number';
    inputIntervallo.min = '5';
    inputIntervallo.value = '30';
    form.appendChild(inputIntervallo);
    form.appendChild(textElement('span', 'sheet-label', 'Massimo esecuzioni al giorno'));
    const inputLimite = document.createElement('input');
    inputLimite.className = 'sheet-input';
    inputLimite.type = 'number';
    inputLimite.min = '1';
    inputLimite.max = '10';
    inputLimite.value = '3';
    form.appendChild(inputLimite);
    form.appendChild(textElement('small', 'sheet-hint', 'Nasce sempre in pausa: la attivi tu dall\'elenco quando vuoi che parta da sola.'));
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary-btn compact full';
    submit.textContent = 'Crea automazione';
    form.appendChild(submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await apiPost('/api/v1/automations', {
          taskId: selectTask.value,
          intervalloMinuti: Number(inputIntervallo.value),
          limiteAlGiorno: Number(inputLimite.value),
        });
        closeEmbeddedDialog(sheetDialog);
        toast('Automazione creata', 'In pausa — attivala dall\'elenco quando vuoi.');
        renderAutomationsReali();
      } catch (error) {
        toast('Creazione non riuscita', error.message);
      }
    });
    sheetBody.replaceChildren(form);
  }

  /**
   * ⭐ Il foglio "Avvia un task dal corpus". Adattato dall'originale
   * desktop: il metodo nativo bloccante del dialog sostituito con
   * `showEmbeddedDialog`/`closeEmbeddedDialog` (già usati da openSheet),
   * l'unico modo ammesso di aprire #sheetDialog in questo bundle (guardia
   * HARNESS-NATIVE-TOP-LAYER-HITTEST-01) — funziona identico standalone e
   * in shadow root, dialog.show()/dialog.close() non hanno bisogno del
   * comportamento modale nativo qui.
   */
  /*
   * ⭐⭐⭐ 27/8 — owner, testuale: "il pulsante nuova deve aprire una nuova
   * sessione VUOTA, IL COMPITO LO DECIDO IO". Verificato con una ricerca
   * web vera, documentazione ufficiale, non ipotizzato: Claude Code
   * (`claude` -> composer vuoto, nessuna lista), Codex CLI (`codex` senza
   * argomenti -> TUI col composer vuoto, developers.openai.com/codex/cli),
   * Cline ("+"/`/newtask` -> "the composer becomes ready for free-form
   * input... no predefined task templates", docs.cline.bot), Aider
   * (prompt `>` vuoto, "no predefined task lists", aider.chat/docs),
   * Cursor Composer (nuova chat = sessione isolata, si scrive subito).
   * Devin e' l'unico che chiede un passo prima del testo libero, ma quel
   * passo e' "scegli il repository", MAI un elenco di compiti gia scritti
   * ("click New Session, select Agent, and choose your repository", poi
   * il compito resta testo libero). Nessun competitor mostra un elenco
   * di task predefiniti come primo schermo.
   *
   * ⛔⛔ 27/8, secondo giro — owner: "non ci siamo... devi levare tutte le
   * prove per banco". La sezione secondaria "Oppure prova un task del
   * banco" (aggiunta la mattina) era ancora un compromesso non richiesto:
   * l'elenco task del corpus (storia/progetti) resta uno strumento VERO,
   * ma è un concetto interno di TALOS-BANCO — non appartiene al punto
   * dove un owner avvia una sessione. Le automazioni (che DEVONO ripetere
   * sempre lo stesso compito misurabile) restano l'unico posto che lo
   * usa, col proprio foglio dedicato.
   */
  /*
   * ⭐⭐⭐ 27/8, secondo giro — owner: "nella modale nuova sessione non deve
   * esserci il campo text per cosa chiedere al agente, quello si fa
   * direttamente da interfaccia chat". Corretto: prima chiedeva cartella
   * + modello + compito tutti insieme; ora chiede SOLO cartella + modello
   * — il compito si scrive nel composer normale, come in OGNI competitor
   * verificato (Claude Code, Codex CLI, Cline, Aider, Cursor: il testo
   * libero è SEMPRE nella chat, mai in un modulo a parte prima di essa).
   */
  function creaWorkspaceChooser() {
    const form = document.createElement('form');
    form.className = 'workspace-chooser';
    form.id = 'workspaceChooser';
    form.noValidate = true;

    const local = {
      current: null,
      selected: null,
      permission: state.permissions,
      showReasoning: state.showReasoning,
      requestGeneration: 0,
      busy: false,
      focusedPath: null,
      typeahead: '',
      typeaheadTimer: null,
      collapsed: false,
      creatingFolder: false,
    };

    const shortcuts = document.createElement('div');
    shortcuts.className = 'workspace-chooser-shortcuts';
    shortcuts.setAttribute('aria-label', 'Cartelle consigliate');

    const left = document.createElement('section');
    left.className = 'workspace-chooser-browser';
    left.setAttribute('aria-labelledby', 'workspaceChooserBrowserTitle');
    const leftHead = document.createElement('div');
    leftHead.className = 'workspace-chooser-section-head';
    leftHead.append(
      textElement('span', 'eyebrow', 'Workspace'),
      textElement('h3', '', 'Scegli la cartella di lavoro'),
      textElement('p', '', 'TALOS lavorerà direttamente nella cartella scelta, senza creare copie.'),
    );
    leftHead.querySelector('h3').id = 'workspaceChooserBrowserTitle';

    const pathBar = document.createElement('div');
    pathBar.className = 'workspace-chooser-pathbar';
    const upButton = document.createElement('button');
    upButton.type = 'button';
    upButton.className = 'workspace-chooser-up';
    upButton.setAttribute('aria-label', 'Vai alla cartella superiore');
    upButton.innerHTML = icon('i-arrow-left');
    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.id = 'workspaceChooserPath';
    pathInput.className = 'workspace-chooser-path';
    pathInput.autocomplete = 'off';
    pathInput.spellcheck = false;
    pathInput.setAttribute('aria-label', 'Percorso cartella');
    const goButton = document.createElement('button');
    goButton.type = 'button';
    goButton.className = 'workspace-chooser-go';
    goButton.textContent = 'Apri';
    pathBar.append(upButton, pathInput, goButton);

    const treeTools = document.createElement('div');
    treeTools.className = 'workspace-chooser-tree-tools';
    treeTools.setAttribute('role', 'toolbar');
    treeTools.setAttribute('aria-label', 'Comandi cartelle');
    const newFolderButton = document.createElement('button');
    newFolderButton.type = 'button';
    newFolderButton.className = 'workspace-chooser-tree-tool';
    newFolderButton.setAttribute('aria-label', 'Nuova cartella');
    newFolderButton.title = 'Nuova cartella';
    newFolderButton.innerHTML = icon('i-folder');
    const refreshFoldersButton = document.createElement('button');
    refreshFoldersButton.type = 'button';
    refreshFoldersButton.className = 'workspace-chooser-tree-tool';
    refreshFoldersButton.setAttribute('aria-label', 'Aggiorna cartelle');
    refreshFoldersButton.title = 'Aggiorna';
    refreshFoldersButton.innerHTML = icon('i-history');
    const collapseFoldersButton = document.createElement('button');
    collapseFoldersButton.type = 'button';
    collapseFoldersButton.className = 'workspace-chooser-tree-tool';
    collapseFoldersButton.setAttribute('aria-label', 'Comprimi cartelle');
    collapseFoldersButton.title = 'Comprimi tutto';
    collapseFoldersButton.innerHTML = icon('i-chevron');
    const copyFolderPathButton = document.createElement('button');
    copyFolderPathButton.type = 'button';
    copyFolderPathButton.className = 'workspace-chooser-tree-tool';
    copyFolderPathButton.setAttribute('aria-label', 'Copia percorso cartella');
    copyFolderPathButton.title = 'Copia percorso';
    copyFolderPathButton.innerHTML = icon('i-copy');
    const treeToolsSpacer = document.createElement('span');
    treeToolsSpacer.className = 'workspace-chooser-tree-tools-spacer';
    treeTools.append(newFolderButton, treeToolsSpacer, refreshFoldersButton, collapseFoldersButton, copyFolderPathButton);

    const newFolderForm = document.createElement('form');
    newFolderForm.className = 'workspace-chooser-new-folder';
    newFolderForm.hidden = true;
    const newFolderInput = document.createElement('input');
    newFolderInput.type = 'text';
    newFolderInput.maxLength = 255;
    newFolderInput.autocomplete = 'off';
    newFolderInput.spellcheck = false;
    newFolderInput.setAttribute('aria-label', 'Nome nuova cartella');
    newFolderInput.placeholder = 'Nome cartella';
    const createFolderButton = document.createElement('button');
    createFolderButton.type = 'submit';
    createFolderButton.className = 'primary-btn compact';
    createFolderButton.textContent = 'Crea cartella';
    const cancelFolderButton = document.createElement('button');
    cancelFolderButton.type = 'button';
    cancelFolderButton.className = 'text-btn compact';
    cancelFolderButton.textContent = 'Annulla';
    const newFolderStatus = document.createElement('span');
    newFolderStatus.className = 'workspace-chooser-new-folder-status';
    newFolderStatus.setAttribute('role', 'status');
    newFolderForm.append(newFolderInput, createFolderButton, cancelFolderButton, newFolderStatus);

    const treeFrame = document.createElement('div');
    treeFrame.className = 'workspace-chooser-tree-frame';
    const tree = document.createElement('div');
    tree.id = 'workspaceChooserTree';
    tree.className = 'workspace-chooser-tree';
    tree.setAttribute('role', 'tree');
    tree.setAttribute('aria-label', 'Cartelle del computer');
    const treeState = document.createElement('div');
    treeState.className = 'workspace-chooser-tree-state';
    treeState.setAttribute('role', 'status');
    treeFrame.append(tree, treeState);

    const selectedCard = document.createElement('div');
    selectedCard.className = 'workspace-chooser-selection';
    selectedCard.innerHTML = `${icon('i-folder-open')}<span><small>Cartella scelta</small><strong data-workspace-selected-path>Nessuna cartella scelta</strong></span>`;
    left.append(leftHead, pathBar, treeTools, newFolderForm, treeFrame, selectedCard);

    const right = document.createElement('section');
    right.className = 'workspace-chooser-settings';
    right.setAttribute('aria-labelledby', 'workspaceChooserSettingsTitle');
    const rightHead = document.createElement('div');
    rightHead.className = 'workspace-chooser-section-head';
    rightHead.append(
      textElement('span', 'eyebrow', 'Sessione'),
      textElement('h3', '', 'Configura il lavoro'),
      textElement('p', '', 'Le scelte valgono per la nuova sessione e restano modificabili in chat.'),
    );
    rightHead.querySelector('h3').id = 'workspaceChooserSettingsTitle';

    const modelPicker = creaModelPicker({ valoreIniziale: state.model || '', aggiornaModelloPrincipale: false });
    const effortPicker = creaEffortPicker({ valoreIniziale: state.effort });
    const plannerPicker = creaModelPicker({ valoreIniziale: '', etichettaVuota: 'Nessuno', aggiornaModelloPrincipale: false });

    const modelSection = document.createElement('div');
    modelSection.className = 'workspace-chooser-setting-group';
    modelSection.append(textElement('span', 'sheet-label', 'Modello'), modelPicker.elemento);

    const reasoningSection = document.createElement('div');
    reasoningSection.className = 'workspace-chooser-setting-group';
    reasoningSection.append(effortPicker.elemento);
    const reasoningToggle = document.createElement('label');
    reasoningToggle.className = 'workspace-chooser-inline-toggle';
    reasoningToggle.innerHTML = '<span><strong>Mostra ragionamento</strong><small>Visualizza il processo solo quando ti serve.</small></span>';
    const reasoningInput = document.createElement('input');
    reasoningInput.type = 'checkbox';
    reasoningInput.checked = local.showReasoning;
    reasoningInput.setAttribute('aria-label', 'Mostra ragionamento');
    reasoningInput.addEventListener('change', () => { local.showReasoning = reasoningInput.checked; });
    reasoningToggle.appendChild(reasoningInput);
    reasoningSection.appendChild(reasoningToggle);

    const plannerSection = document.createElement('div');
    plannerSection.className = 'workspace-chooser-setting-group';
    plannerSection.append(
      textElement('span', 'sheet-label', 'Planner opzionale'),
      plannerPicker.elemento,
      textElement('small', 'workspace-chooser-help', 'Esplora in sola lettura e consegna il piano prima dell’esecuzione.'),
    );

    const permissionSection = document.createElement('div');
    permissionSection.className = 'workspace-chooser-setting-group';
    permissionSection.appendChild(textElement('span', 'sheet-label', 'Accesso al workspace'));
    const permissionGrid = document.createElement('div');
    permissionGrid.className = 'workspace-chooser-permissions';
    const permissionCopy = {
      'Read only': 'Solo lettura',
      'Workspace write': 'Scrive qui',
      'On request': 'Chiede prima',
      'Full access': 'Accesso completo',
    };
    const permissionButtons = [];
    for (const permission of ['Read only', 'Workspace write', 'On request', 'Full access']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.workspacePermission = permission;
      button.className = 'workspace-chooser-permission';
      button.setAttribute('aria-pressed', String(permission === local.permission));
      button.innerHTML = `${icon('i-shield')}<span><strong>${permission}</strong><small>${permissionCopy[permission]}</small></span>`;
      button.addEventListener('click', () => {
        local.permission = permission;
        permissionButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        aggiornaConfermaWorkspaceChooser();
      });
      permissionButtons.push(button);
      permissionGrid.appendChild(button);
    }
    const policyGate = document.createElement('p');
    policyGate.className = 'workspace-chooser-policy-gate';
    policyGate.dataset.workspacePolicyGate = 'true';
    permissionSection.append(permissionGrid, policyGate);
    right.append(rightHead, modelSection, reasoningSection, plannerSection, permissionSection);

    const columns = document.createElement('div');
    columns.className = 'workspace-chooser-columns';
    columns.append(left, right);

    const footer = document.createElement('footer');
    footer.className = 'workspace-chooser-footer';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary-btn';
    cancel.textContent = 'Annulla';
    cancel.addEventListener('click', () => closeEmbeddedDialog(sheetDialog));
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.id = 'workspaceChooserSubmit';
    submit.className = 'primary-btn compact';
    submit.textContent = 'Scegli una cartella';
    footer.append(cancel, submit);
    form.append(shortcuts, columns, footer);

    function pathKey(path) {
      return String(path || '').replace(/[\\/]+$/, '').toLocaleLowerCase('en-US');
    }

    function folderName(path) {
      return String(path || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;
    }

    function projectFor(path) {
      const target = pathKey(path);
      const direct = local.current?.items?.find((item) => pathKey(item.path) === target)?.projectId;
      if (direct) return direct;
      return local.current?.recommended?.find((item) => pathKey(item.path) === target)?.projectId ?? null;
    }

    function aggiornaConfermaWorkspaceChooser() {
      const selectedPath = $('[data-workspace-selected-path]', selectedCard);
      if (selectedPath) selectedPath.textContent = local.selected?.path || 'Nessuna cartella scelta';
      const allowlisted = Boolean(local.selected?.projectId);
      const ready = !local.busy && Boolean(local.selected) && (allowlisted || local.permission === 'Full access');
      submit.disabled = !ready;
      submit.textContent = local.busy ? 'Apro la cartella…' : ready ? `Continua nella chat — ${folderName(local.selected.path)}` : 'Scegli una cartella';
      if (local.busy) policyGate.textContent = 'Attendi che la cartella scelta sia pronta.';
      else if (!local.selected) policyGate.textContent = 'Scegli una cartella per continuare.';
      else if (allowlisted) policyGate.textContent = `${local.permission}: TALOS resterà nella cartella scelta.`;
      else if (local.permission === 'Full access') policyGate.textContent = 'Full access consente di usare questa cartella esterna. La scelta sarà verificata di nuovo all’avvio.';
      else policyGate.textContent = 'Questa cartella è esterna ai progetti già autorizzati. Se vuoi usarla, scegli Full access.';
      const toolsDisabled = local.busy || local.creatingFolder || !local.current;
      newFolderButton.disabled = toolsDisabled;
      refreshFoldersButton.disabled = toolsDisabled;
      collapseFoldersButton.disabled = toolsDisabled || local.collapsed || !(local.current?.items?.length);
      copyFolderPathButton.disabled = toolsDisabled || !local.current?.path;
      renderizzaScorciatoie();
    }

    function selezionaWorkspaceChooser(item, { focus = true } = {}) {
      if (!item?.path) return;
      local.selected = { path: item.path, projectId: item.projectId ?? projectFor(item.path) };
      local.focusedPath = item.path;
      renderizzaAlberoWorkspaceChooser({ restoreFocus: focus });
      aggiornaConfermaWorkspaceChooser();
    }

    function visibleRows() {
      if (!local.current) return [];
      const rootItem = {
        name: folderName(local.current.path),
        path: local.current.path,
        projectId: projectFor(local.current.path),
        current: true,
      };
      return local.collapsed ? [rootItem] : [rootItem, ...(local.current.items || [])];
    }

    function focusRow(path) {
      const row = [...tree.querySelectorAll('[role="treeitem"]')].find((item) => pathKey(item.dataset.workspacePath) === pathKey(path));
      row?.focus();
    }

    function gestisciTastieraWorkspaceChooser(event, item) {
      const rows = visibleRows();
      const index = rows.findIndex((row) => pathKey(row.path) === pathKey(item.path));
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selezionaWorkspaceChooser(item);
        return;
      }
      if (event.key === 'ArrowRight' && !item.current) {
        event.preventDefault();
        caricaWorkspaceChooser(item.path, { select: true, focusTree: true });
        return;
      }
      if (event.key === 'ArrowRight' && item.current) {
        if (local.collapsed) {
          local.collapsed = false;
          renderizzaAlberoWorkspaceChooser();
        }
        const firstChild = local.current?.items?.[0];
        if (firstChild) {
          event.preventDefault();
          local.focusedPath = firstChild.path;
          focusRow(firstChild.path);
        }
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (!item.current) {
          local.focusedPath = local.current.path;
          focusRow(local.current.path);
        } else if (!local.collapsed) {
          local.collapsed = true;
          renderizzaAlberoWorkspaceChooser({ restoreFocus: true });
        } else if (local.current?.parent) {
          caricaWorkspaceChooser(local.current.parent, { select: false, focusTree: true });
        }
        return;
      }
      let target = null;
      if (event.key === 'ArrowDown') target = rows[Math.min(rows.length - 1, index + 1)];
      if (event.key === 'ArrowUp') target = rows[Math.max(0, index - 1)];
      if (event.key === 'Home') target = rows[0];
      if (event.key === 'End') target = rows.at(-1);
      if (target) {
        event.preventDefault();
        local.focusedPath = target.path;
        focusRow(target.path);
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        window.clearTimeout(local.typeaheadTimer);
        local.typeahead += event.key.toLocaleLowerCase('it');
        local.typeaheadTimer = window.setTimeout(() => { local.typeahead = ''; }, 650);
        const match = rows.find((row, rowIndex) => rowIndex !== index && row.name.toLocaleLowerCase('it').startsWith(local.typeahead));
        if (match) {
          event.preventDefault();
          local.focusedPath = match.path;
          focusRow(match.path);
        }
      }
    }

    function renderizzaAlberoWorkspaceChooser({ restoreFocus = false } = {}) {
      if (!local.current) return;
      const rows = visibleRows();
      const elements = rows.map((item, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'workspace-chooser-tree-row';
        row.dataset.workspacePath = item.path;
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-level', item.current ? '1' : '2');
        row.setAttribute('aria-selected', String(pathKey(local.selected?.path) === pathKey(item.path)));
        row.setAttribute('aria-expanded', String(item.current ? !local.collapsed : false));
        row.tabIndex = pathKey(local.focusedPath) === pathKey(item.path) || (!local.focusedPath && index === 0) ? 0 : -1;
        row.innerHTML = `<span class="workspace-chooser-tree-toggle" aria-hidden="true">${icon(item.current && !local.collapsed ? 'i-chevron' : 'i-chevron-right')}</span>${icon(item.current && !local.collapsed ? 'i-folder-open' : 'i-folder')}<span>${item.name}</span>${item.projectId ? '<small>Progetto</small>' : ''}`;
        row.addEventListener('click', (event) => {
          if (event.target.closest('.workspace-chooser-tree-toggle')) {
            if (item.current) {
              local.collapsed = !local.collapsed;
              renderizzaAlberoWorkspaceChooser({ restoreFocus: true });
            } else {
              caricaWorkspaceChooser(item.path, { select: true, focusTree: true });
            }
            return;
          }
          selezionaWorkspaceChooser(item, { focus: false });
        });
        row.addEventListener('dblclick', () => { if (!item.current) caricaWorkspaceChooser(item.path, { select: true, focusTree: true }); });
        row.addEventListener('focus', () => {
          local.focusedPath = item.path;
          [...tree.querySelectorAll('[role="treeitem"]')].forEach((candidate) => { candidate.tabIndex = candidate === row ? 0 : -1; });
        });
        row.addEventListener('keydown', (event) => gestisciTastieraWorkspaceChooser(event, item));
        return row;
      });
      tree.replaceChildren(...elements);
      treeState.hidden = rows.length > 1;
      treeState.textContent = rows.length > 1 ? '' : 'Questa cartella non contiene altre cartelle.';
      if (restoreFocus) window.setTimeout(() => focusRow(local.focusedPath || local.current.path), 0);
    }

    function renderizzaScorciatoie() {
      const recommended = local.current?.recommended || [];
      shortcuts.replaceChildren(...recommended.map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'workspace-chooser-shortcut';
        button.classList.toggle('active', pathKey(local.selected?.path) === pathKey(item.path));
        button.setAttribute('aria-pressed', String(pathKey(local.selected?.path) === pathKey(item.path)));
        button.title = item.path;
        button.innerHTML = `${icon(item.kind === 'recent' ? 'i-clock' : 'i-folder')}<span><strong>${item.label}</strong><small>${item.kind === 'project' ? 'Progetto' : item.kind === 'recent' ? 'Usata di recente' : 'Scelta rapida'}</small></span>`;
        button.addEventListener('click', () => caricaWorkspaceChooser(item.path, { select: true, focusTree: true, projectId: item.projectId }));
        return button;
      }));
    }

    async function caricaWorkspaceChooser(path, { select = false, focusTree = false, projectId = null } = {}) {
      const generation = ++local.requestGeneration;
      local.busy = true;
      if (select) local.selected = null;
      form.setAttribute('aria-busy', 'true');
      tree.setAttribute('aria-busy', 'true');
      treeState.hidden = false;
      treeState.textContent = 'Apro la cartella…';
      aggiornaConfermaWorkspaceChooser();
      try {
        const suffix = path ? `?path=${encodeURIComponent(path)}` : '';
        const data = await apiGet(`/api/v1/workspace-browser${suffix}`);
        if (generation !== local.requestGeneration || !form.isConnected) return false;
        local.current = data;
        local.collapsed = false;
        pathInput.value = data.path;
        upButton.disabled = !data.parent;
        local.focusedPath = data.path;
        if (select) local.selected = { path: data.path, projectId: projectId ?? projectFor(data.path) };
        else if (!local.selected) {
          const defaultProject = data.recommended?.find((item) => item.kind === 'project' && item.projectId);
          local.selected = defaultProject ? { path: defaultProject.path, projectId: defaultProject.projectId } : null;
        }
        renderizzaScorciatoie();
        renderizzaAlberoWorkspaceChooser({ restoreFocus: focusTree });
        aggiornaConfermaWorkspaceChooser();
        return true;
      } catch (error) {
        if (generation !== local.requestGeneration || !form.isConnected) return false;
        tree.replaceChildren();
        treeState.hidden = false;
        treeState.replaceChildren(textElement('p', '', messaggioErroreUtente(error, 'Non riesco ad aprire questa cartella. Scegline un’altra oppure controlla Doctor.')));
        const actions = document.createElement('div');
        actions.className = 'workspace-chooser-error-actions';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'secondary-btn compact';
        retry.textContent = 'Riprova';
        retry.addEventListener('click', () => caricaWorkspaceChooser(path, { select, focusTree, projectId }));
        const doctor = document.createElement('button');
        doctor.type = 'button';
        doctor.className = 'text-btn';
        doctor.textContent = 'Apri Doctor';
        doctor.addEventListener('click', () => { closeEmbeddedDialog(sheetDialog); openSheet('control'); window.setTimeout(() => eseguiDoctor(), 0); });
        actions.append(retry, doctor);
        treeState.appendChild(actions);
        aggiornaConfermaWorkspaceChooser();
        return false;
      } finally {
        if (generation === local.requestGeneration) {
          local.busy = false;
          form.removeAttribute('aria-busy');
          tree.removeAttribute('aria-busy');
          aggiornaConfermaWorkspaceChooser();
        }
      }
    }

    upButton.addEventListener('click', () => {
      if (local.current?.parent) caricaWorkspaceChooser(local.current.parent, { focusTree: true });
    });
    const openTypedPath = () => caricaWorkspaceChooser(pathInput.value.trim(), { select: true, focusTree: true });
    goButton.addEventListener('click', openTypedPath);
    pathInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); openTypedPath(); }
    });
    function closeNewFolderForm() {
      newFolderForm.hidden = true;
      newFolderInput.value = '';
      newFolderStatus.textContent = '';
      newFolderButton.setAttribute('aria-expanded', 'false');
    }
    newFolderButton.setAttribute('aria-expanded', 'false');
    newFolderButton.addEventListener('click', () => {
      const opening = newFolderForm.hidden;
      if (!opening) {
        closeNewFolderForm();
        newFolderButton.focus();
        return;
      }
      newFolderForm.hidden = false;
      newFolderButton.setAttribute('aria-expanded', 'true');
      window.setTimeout(() => newFolderInput.focus(), 0);
    });
    cancelFolderButton.addEventListener('click', () => {
      closeNewFolderForm();
      newFolderButton.focus();
    });
    newFolderForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = newFolderInput.value;
      const parentPath = local.current?.path;
      if (!parentPath || !name || local.creatingFolder) { newFolderInput.focus(); return; }
      local.creatingFolder = true;
      createFolderButton.disabled = true;
      newFolderInput.disabled = true;
      newFolderStatus.textContent = 'Creo la cartella…';
      aggiornaConfermaWorkspaceChooser();
      try {
        const created = await apiPost('/api/v1/workspace-browser/folders', { parentPath, name });
        closeNewFolderForm();
        await caricaWorkspaceChooser(parentPath, { focusTree: true });
        selezionaWorkspaceChooser({ path: created.path, projectId: projectFor(created.path) });
        toast('Cartella creata', created.name);
      } catch (error) {
        newFolderStatus.textContent = messaggioErroreUtente(error, 'Non riesco a creare la cartella qui. Controlla il nome e riprova.');
        newFolderInput.focus();
      } finally {
        local.creatingFolder = false;
        createFolderButton.disabled = false;
        newFolderInput.disabled = false;
        aggiornaConfermaWorkspaceChooser();
      }
    });
    refreshFoldersButton.addEventListener('click', () => {
      if (local.current?.path) caricaWorkspaceChooser(local.current.path, { focusTree: true });
    });
    collapseFoldersButton.addEventListener('click', () => {
      local.collapsed = true;
      local.focusedPath = local.current?.path || null;
      renderizzaAlberoWorkspaceChooser({ restoreFocus: true });
      aggiornaConfermaWorkspaceChooser();
    });
    copyFolderPathButton.addEventListener('click', async () => {
      const path = local.selected?.path || local.current?.path;
      if (!path) return;
      try {
        await navigator.clipboard.writeText(path);
        toast('Percorso copiato', path);
      } catch {
        toast('Copia non disponibile', 'Seleziona il percorso nella barra e copialo da lì.');
        pathInput.focus();
        pathInput.select();
      }
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (local.busy) return;
      const allowlisted = Boolean(local.selected?.projectId);
      if (!local.selected || (!allowlisted && local.permission !== 'Full access')) {
        permissionSection.scrollIntoView({ block: 'nearest' });
        return;
      }
      const model = modelPicker.getValore();
      const effort = effortPicker.getValore();
      const planner = plannerPicker.getValore() || undefined;
      state.model = model;
      state.effort = effort;
      state.showReasoning = local.showReasoning;
      state.permissions = local.permission;
      aggiornaPillolaModello();
      aggiornaPillolaPermessi();
      salvaPreferenzeChatDesktop();
      const input = {
        nomeCartella: folderName(local.selected.path),
        modello: model,
        effort,
        modelloPlanner: planner,
        permessi: local.permission,
        permessiPerAttrezzo: { ...state.permessiPerAttrezzo },
      };
      if (allowlisted) input.cartellaId = local.selected.projectId;
      else input.cartellaLibera = local.selected.path;
      closeEmbeddedDialog(sheetDialog);
      avviaSessionePendente(input);
    });

    function attivaFocusTrapWorkspaceChooser() {
      const controller = new AbortController();
      const observer = new MutationObserver(() => {
        if (!form.isConnected) {
          controller.abort();
          observer.disconnect();
        }
      });
      const focusables = () => [...sheetDialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.closest('[hidden]') && element.getClientRects().length > 0);
      sheetDialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab' || !form.isConnected) return;
        const elements = focusables();
        const first = elements[0];
        const last = elements.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }, { signal: controller.signal });
      sheetDialog.addEventListener('close', () => {
        controller.abort();
        observer.disconnect();
      }, { once: true, signal: controller.signal });
      observer.observe(sheetBody, { childList: true });
    }

    return {
      elemento: form,
      async initialize() {
        attivaFocusTrapWorkspaceChooser();
        const loaded = await caricaWorkspaceChooser(undefined);
        if (loaded) window.setTimeout(() => focusRow(local.current?.path), 0);
      },
    };
  }

  async function openRealTaskSheet() {
    sheetDialog.classList.add('sheet-dialog--new-session');
    sheetEyebrow.textContent = 'Nuova sessione';
    sheetTitle.textContent = 'Su quale progetto lavora TALOS?';
    const demoBadge = $('.demo-surface-badge', sheetDialog);
    if (demoBadge) demoBadge.hidden = true;
    const chooser = creaWorkspaceChooser();
    sheetBody.replaceChildren(chooser.elemento);
    prepareResizableDialog(sheetDialog, 'sheet:new-session');
    showEmbeddedDialog(sheetDialog);
    await chooser.initialize();
  }

  /**
   * ⭐⭐⭐ 27/8, secondo giro — "Nuova sessione" sceglie SOLO cartella+
   * modello; questa funzione porta quella scelta fino al composer
   * normale, senza avviare nessuna vera sessione lato server (talosLavora
   * parte solo quando c'è un compito — il primo messaggio scritto nella
   * chat, intercettato da submitPrompt via state.pendingCustomSession).
   */
  function leggiWorkspaceLaunchId() {
    const parametri = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const id = parametri.get('open-workspace');
    return typeof id === 'string' && /^[A-Za-z0-9_-]{32}$/.test(id) ? id : null;
  }

  function rimuoviWorkspaceLaunchFragment() {
    if (!window.location.hash) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }

  /**
   * Riceve soltanto l'identificatore opaco creato dal launcher Windows. Il
   * percorso assoluto resta nel processo locale: né l'URL né il DOM possono
   * esporlo. La policy corrente viene conservata e non diventa mai
   * implicitamente Full access.
   */
  async function apriWorkspaceDaLauncher() {
    const workspaceLaunchId = leggiWorkspaceLaunchId();
    if (!workspaceLaunchId) return false;
    try {
      const launch = await apiGet(`/api/v1/workspace-launches/${encodeURIComponent(workspaceLaunchId)}`);
      rimuoviWorkspaceLaunchFragment();
      avviaSessionePendente({
        workspaceLaunchId,
        nomeCartella: launch.nome,
        modello: state.model,
        effort: state.effort,
        permessi: state.permissions,
        permessiPerAttrezzo: { ...state.permessiPerAttrezzo },
      });
      toast('Cartella pronta', `${launch.nome} è pronta per una nuova sessione.`);
      return true;
    } catch (error) {
      rimuoviWorkspaceLaunchFragment();
      toast('Cartella non aperta', messaggioErroreUtente(error, 'Apri di nuovo la cartella dal menu di Windows e riprova.'));
      return false;
    }
  }

  function renderizzaRadiceWorkspacePendente(nomeCartella) {
    const contenitore = $('#inspector-files .file-tree');
    if (!contenitore) return;
    const radice = document.createElement('div');
    radice.className = 'tree-root';
    radice.append(iconaSvgAlbero('i-files'), textElement('strong', '', nomeCartella));
    contenitore.replaceChildren(
      radice,
      textElement('p', 'board-empty', 'I file appariranno appena inizi la sessione.'),
    );
    const demoBadge = $('.demo-surface-badge', $('[data-inspector-section="files"]'));
    if (demoBadge) demoBadge.hidden = true;
  }

  function avviaSessionePendente({ cartellaId, cartellaLibera, workspaceLaunchId, nomeCartella, modello, effort, modelloPlanner, permessi, permessiPerAttrezzo }) {
    nuovaGenerazioneSessione();
    state.pendingCustomSession = { cartellaId, cartellaLibera, workspaceLaunchId, nomeCartella, modello, effort, modelloPlanner, permessi, permessiPerAttrezzo };
    state.realSession.previewProjectId = cartellaId || null;
    state.realSession.previewWorkspaceName = nomeCartella;
    state.realSession.treeWorkspaceKey = cartellaId
      ? `project:${cartellaId}`
      : workspaceLaunchId
        ? `launch:${workspaceLaunchId}`
        : `path:${cartellaLibera || nomeCartella}`;
    if (modello) { state.model = modello; aggiornaPillolaModello(); }
    if (effort) state.effort = effort;
    state.session = `Nuova · ${nomeCartella}`;
    sessionTitle.textContent = state.session;
    $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
    setView('chat');
    closePanels();
    const fileTab = $('#inspector-tab-files');
    if (fileTab) setInspectorTab(fileTab);
    // Un progetto allowlistato può già caricare la preview tramite projectId.
    // Un launch id o un percorso libero non devono invece esporre il percorso
    // al browser: mostrano la radice scelta e aspettano il primo messaggio,
    // quando la sessione vera abilita l'albero file ordinario.
    if (!cartellaId) renderizzaRadiceWorkspacePendente(nomeCartella);
    // ⛔ nuovaGenerazioneSessione() ha appena svuotato #conversation (replaceChildren) — l'empty-state originale non esiste più nel DOM, va ricreato, non cercato.
    $('#conversation').appendChild(costruisciConversationHero(`Sessione pronta su ${nomeCartella}.`, 'Scrivi qui sotto cosa deve fare TALOS per iniziare.'));
    // ⭐ 30/8 — stesso principio di sopra, sul tab Files: nuovaGenerazioneSessione() (dentro resettaSuperficiRealiDedicate) ha già scritto il placeholder GENERICO "nessuna cartella ancora scelta" — ma qui la cartella è già nota, prima ancora del primo messaggio. Nessuna nuova sorgente di verità: nomeCartella è lo stesso valore che finisce nel titolo sessione qui sopra.
    window.setTimeout(() => composerInput.focus(), 0);
  }

  /**
   * ⭐⭐⭐ 27/8 — la gemella di `startRealSession`, per un compito LIBERO
   * (Opzione B del piano, ora aperta con un'allowlist esplicita): stesso
   * schema (stato, appendRealTaskStart riusata con un task sintetico,
   * collegaEventiSessione), corpo POST diverso (/sessions/custom con
   * cartellaId+consegna invece di /sessions con taskId).
   */
  /**
   * ⭐⭐⭐ 28/8 — owner: "rinominare automaticamente il titolo della
   * sessione con il primo messaggio inviato (già fatto su mobile per la
   * chat, non bisogna inventare nulla)". Porting diretto di
   * `titleFromPrompt` (mobile/src/stores/chat.ts:419-421) — stessa
   * logica (spazi multipli collassati, poi trim), tetto ADATTATO: 80
   * caratteri, non 255. Non un refuso — è il tetto che
   * `session-registry.rinomina()` valida DAVVERO lato server (oltre
   * rifiuta con QUERY_INVALID, mai un troncamento silenzioso lì): un
   * numero diverso da mobile perché il vincolo reale è diverso, non
   * perché "quasi uguale basta".
   */
  function titoloDalPrimoMessaggio(testo) {
    return String(testo || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  async function startCustomSession({ cartellaId, cartellaLibera, workspaceLaunchId, nomeCartella, consegna, comandoProva, modello, effort, modelloPlanner, permessi, permessiPerAttrezzo }) {
    iniziaMisuraLatenza('primo messaggio della sessione');
    const generation = nuovaGenerazioneSessione();
    const taskSintetico = { id: `libero:${nomeCartella}`, consegna };
    state.realSession.taskId = taskSintetico.id;
    state.realSession.treeWorkspaceKey = cartellaId
      ? `project:${cartellaId}`
      : workspaceLaunchId
        ? `launch:${workspaceLaunchId}`
        : `path:${cartellaLibera || nomeCartella}`;
    state.session = `Compito libero · ${nomeCartella}`;
    sessionTitle.textContent = state.session;
    /* ⛔ 27/8, trovato dalla pipeline QA visiva: solo sessionTitle veniva aggiornato — la card "Session topology" nel Context Rail e la voce "Main" nel foglio Albero sessione restavano al titolo demo ("Refactor auth flow") per sempre. Ogni elemento con lo stesso attributo resta sincronizzato. */
    $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
    setView('chat');
    closePanels();
    appendRealTaskStart(taskSintetico);
    mostraAttesaRisposta();
    toast('Avvio in corso', `${nomeCartella} · esecuzione diretta sulla cartella vera, nessuna copia.`);

    let sessionId;
    try {
      /*
       * ⛔ Riconciliazione Fase 1 (branch merge, 27/8): trovato dal vivo, non
       * ipotizzato — un "compito libero" avviato dal tunnel mobile mandava
       * `!comando` sulla PC (`sandbox: none`) invece che sul telefono,
       * perché QUESTO corpo non portava mai `client`. Stesso segnale già
       * usato da `startRealSession` (Fase 3).
       */
      const client = window.__talosHarnessApiBase ? 'mobile' : 'desktop';
      // ⭐⭐⭐ 1/9 — tre selettori mutuamente esclusivi: il launcher passa
      // soltanto un id opaco; il percorso assoluto resta nel server locale.
      // `cartellaLibera` continua a essere l'unico ramo che richiede Full
      // access, mentre un launch id conserva la policy scelta dall'owner.
      const corpo = workspaceLaunchId
        ? { workspaceLaunchId, consegna, client }
        : cartellaLibera
          ? { cartellaLibera, consegna, client }
          : { cartellaId, consegna, client };
      if (comandoProva) corpo.comandoProva = comandoProva;
      const modelloEffettivo = modello || state.model; // ⭐ la scelta fatta nel picker della modale ha priorità
      if (modelloEffettivo) corpo.modello = modelloEffettivo;
      // ⭐ 28/8 — stesso principio del modello: la scelta esplicita dell'effort picker ha priorità, altrimenti quella già impostata sulla sessione (pillola/foglio); assente se l'owner non ha mai toccato lo slider.
      const effortEffettivo = effort || state.effort;
      if (effortEffettivo) corpo.reasoning = { effort: effortEffettivo };
      /*
       * ⭐⭐⭐ FASE K (29/8) — planner opzionale (R2). Nessuna ricaduta su
       * `state.modelloPlanner`/`state.model`, a differenza di modello/
       * effort sopra: "Configurabile, nessun default forzato" (owner) —
       * lo stesso principio già scelto lato server in
       * session-registry.mjs (`modelloPlannerRichiesta`, deliberatamente
       * senza un `|| modello` di ripiego). Assente dal corpo se l'owner
       * non ha scelto nulla nel picker — mai un `{}`/stringa vuota
       * spedita al server.
       */
      if (modelloPlanner) corpo.modelloPlanner = modelloPlanner;
      // ⭐⭐⭐ 28/8 — la pillola permessi: la scelta fatta nella modale ha priorità, altrimenti quella corrente del composer (state.permissions, sempre valorizzata — default "Workspace write").
      corpo.permessi = permessi || state.permissions;
      /*
       * ⭐⭐⭐ FASE B (28/8) — stesso principio di `corpo.permessi`, ma
       * MAI un oggetto vuoto: config.mjs lo rifiuterebbe ("{} esplicito
       * non ha senso"), e un `{}` non cambierebbe comunque nulla — si
       * omette il campo quando non c'è nessun override attivo.
       */
      const permessiPerAttrezzoEffettivi = permessiPerAttrezzo || state.permessiPerAttrezzo;
      if (permessiPerAttrezzoEffettivi && Object.keys(permessiPerAttrezzoEffettivi).length > 0) {
        corpo.permessiPerAttrezzo = permessiPerAttrezzoEffettivi;
      }
      segnaTappaLatenza('postInviata');
      const data = await apiPost('/api/v1/sessions/custom', corpo);
      segnaTappaLatenza('postRisposta');
      sessionId = data.sessionId;
    } catch (error) {
      if (generation !== state.realSession.generation) return;
      nascondiAttesaRisposta();
      appendStatusNote(`Avvio non riuscito: ${error.message}`, true);
      toast('Avvio non riuscito', error.message);
      /* ⛔ 27/8, trovato dalla pipeline QA visiva: il titolo restava "ottimista" (il nome della sessione appena tentata) anche quando la POST falliva — la sessione non è mai esistita lato server (state.realSession.id resta null). */
      state.session = 'Nessuna sessione';
      $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
      return;
    }
    if (generation !== state.realSession.generation) return;
    collegaEventiSessione(sessionId, generation);
    aggiornaElencoSessioniReali();

    /*
     * ⭐⭐⭐ 28/8 — l'auto-rinomina vera e propria. "Best effort" apposta:
     * la sessione è GIÀ avviata con successo a questo punto (sessionId
     * esiste, gli eventi stanno già arrivando) — un rename fallito (rete,
     * corsa persa contro un resume) non deve MAI diventare un secondo
     * canale di errore per un avvio già riuscito. Resta solo il titolo
     * "Compito libero · <cartella>" di sempre, mai un crash, mai un toast
     * per qualcosa che l'owner non ha nemmeno chiesto esplicitamente in
     * quel momento.
     */
    const titoloAutomatico = titoloDalPrimoMessaggio(consegna);
    apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/rename`, { nome: titoloAutomatico }).then(() => {
      // ⛔ la generazione può essere già cambiata (un'altra sessione avviata nel frattempo) — mai scrivere il titolo di una sessione che non è più quella a schermo.
      if (generation !== state.realSession.generation) return;
      state.session = titoloAutomatico;
      sessionTitle.textContent = state.session;
      $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
      aggiornaElencoSessioniReali();
    }).catch(() => { /* best effort, vedi sopra: resta il titolo di sempre */ });
  }

  function submitPrompt(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (value.startsWith('!')) {
      const hidden = value.startsWith('!!');
      const comando = value.replace(/^!!?/, '').trim();
      setView('terminal');
      if (!comando) { toast('Comando vuoto', 'Scrivi qualcosa dopo "!".'); return true; }
      runDirectShell(comando, hidden);
      return true;
    }
    /*
     * ⛔⛔⛔ 27/8, owner: "non riesco ad avere una conversazione base col
     * modello" — con una sessione REALE avviata (state.realSession.id) e
     * ANCORA IN CORSO, il composer non aveva modo di consegnarle un
     * messaggio: talosLavora non accettava un follow-up a metà
     * esecuzione. Quel rifiuto onesto era corretto ALLORA (nessuna coda
     * esisteva) — ⭐⭐⭐ FASE D (28/8) lo sostituisce: il messaggio entra
     * DAVVERO in coda (accodaMessaggioReale, POST .../queue), consegnato
     * dal kernel al punto giusto (LEDGER-FASE-D-CODA.md, D.1) invece di
     * essere rifiutato.
     * ⛔ Una sessione CONCLUSA è un'altra cosa: resumeSession(testo) fa
     * esattamente ciò che una conversazione normale richiede — appende il
     * messaggio a messaggiFinali e riparte, STESSO sessionId (vedi
     * session-registry.mjs resume(), esteso apposta). Prima di questo fix
     * ANCHE una sessione conclusa veniva rifiutata: il composer diventava
     * inutilizzabile dopo la primissima risposta, ogni volta.
     */
    if (state.realSession.id && !state.realSession.eventoTerminaleVisto) {
      accodaMessaggioReale(value);
      return true;
    }
    if (state.realSession.id && state.realSession.eventoTerminaleVisto) {
      resumeSession(value);
      return true;
    }
    /*
     * ⭐⭐⭐ 27/8, secondo giro — owner: "nella modale nuova sessione non
     * deve esserci il campo text per cosa chiedere, quello si fa
     * direttamente da interfaccia chat". "Nuova" ora sceglie SOLO
     * cartella+modello (avviaSessionePendente) e apre una chat vuota —
     * il primo messaggio scritto QUI è il compito vero, esattamente come
     * Claude Code/Codex/Cline/Aider (composer vuoto, non un modulo a
     * parte). Se una cartella è stata scelta e non c'è ancora nessuna
     * sessione reale, questo primo messaggio la avvia per davvero.
     */
    if (state.pendingCustomSession) {
      const { cartellaId, cartellaLibera, workspaceLaunchId, nomeCartella, modelloPlanner } = state.pendingCustomSession;
      /*
       * ⛔⛔⛔ 02/09 — riprodotto dal vivo (qa-visual-pipeline.mjs,
       * scenario `qa-modello-pillola-dopo-nuova`): la pillola mostrava
       * "google/gemini-3.7-flash", il POST /sessions/custom spediva
       * "z-ai/glm-4.7-flash". `pendingCustomSession` FOTOGRAFAVA modello,
       * effort e permessi al momento di "Nuova"; le pillole del composer
       * cambiate DOPO aggiornavano `state.*` e la scritta, ma qui vinceva
       * la foto (`modello || state.model` in startCustomSession). Le
       * pillole sono l'unica cosa che l'owner vede: al momento dell'invio
       * la fonte di verità è `state`, non la foto. `modelloPlanner` non ha
       * una pillola e resta quello della modale. Una cartella fuori
       * elenco richiede Full access (lo esige il server): se la pillola è
       * stata spostata altrove, il messaggio resta nel composer e si dice
       * cosa manca, invece di spedire un permesso che la pillola non mostra.
       */
      if (cartellaLibera && state.permissions !== 'Full access') {
        toast('Serve Full access', `${nomeCartella} è fuori dall'elenco delle cartelle: per avviarla serve Full access. Cambia il permesso dalla pillola e invia di nuovo.`);
        return false;
      }
      state.pendingCustomSession = null;
      startCustomSession({
        cartellaId, cartellaLibera, workspaceLaunchId, nomeCartella, consegna: value,
        modello: state.model, effort: state.effort, modelloPlanner,
        permessi: state.permissions, permessiPerAttrezzo: { ...state.permessiPerAttrezzo },
      });
      return true;
    }
    /*
     * ⛔⛔ 27/8 — owner: "cancella tutte le sessioni mockup". Non c'è più
     * una conversazione demo pre-caricata da riempire (era "Refactor auth
     * flow", rimossa da index.html): senza una sessione reale avviata,
     * questo campo non ha una cartella su cui agire, quindi non deve
     * fingere una risposta (appendUserMessage generava sempre lo stesso
     * "Ricevuto..." hardcoded). Stesso pattern confermato via ricerca su
     * ogni competitor (Claude Code/Codex/Cline/Aider/Cursor/Devin): si
     * scrive SOLO dentro una sessione già avviata — qui l'avvio passa da
     * "Nuova sessione", che sceglie la cartella prima del testo libero.
     */
    /*
     * ⭐⭐⭐ 28/8, owner: "la sessione non parte quando scrivo semplicemente
     * dal composer, devo per forza premere nuova sessione" — quando esiste
     * UNA SOLA cartella di progetto configurata (il caso comune oggi, vedi
     * TALOS_HARNESS_UI_PROJECT_DIRS), non c'è nessuna scelta reale da fare:
     * un vero terminale (claude/codex/aider lanciati da una cartella) non
     * chiede MAI "quale cartella?" quando ce n'è una sola — lo stesso
     * principio competitivo già citato sopra, applicato al caso non
     * ambiguo. Con PIÙ cartelle l'ambiguità resta vera: fallback identico
     * a prima, serve "Nuova". La ricerca è QUI (async, in risposta
     * all'azione dell'utente), non al boot — vedi la nota "provato e
     * SCARTATO" più sotto in questo file: due test pretendono ZERO
     * chiamate di rete al mount.
     */
    avviaSessioneImplicitaSeUnaSolaCartella(value);
    return true;
  }

  async function avviaSessioneImplicitaSeUnaSolaCartella(consegna) {
    let progetti;
    try {
      progetti = await apiGet('/api/v1/projects').then((r) => r.items);
    } catch {
      progetti = [];
    }
    if (progetti.length !== 1) {
      toast('Nessuna sessione attiva', 'Premi «Nuova» in alto per scegliere una cartella e iniziare.');
      return;
    }
    const [{ id: cartellaId, nome: nomeCartella }] = progetti;
    startCustomSession({ cartellaId, nomeCartella, consegna, modello: state.model, effort: state.effort });
  }

  function announceComposerAction(action) {
    if (action === 'references') {
      openSheet('references');
      return true;
    }
    if (action === 'permissions') {
      openSheet('permissions');
      return true;
    }
    if (action === 'new_session') {
      createNewSession();
      return true;
    }
    const copy = {
      attach: ['Allegato demo', 'Il selettore è UI locale e non carica file reali.'],
      photo: ['Fotocamera demo', 'Nessuna foto è stata acquisita.'],
      photos: ['Galleria demo', 'Nessuna immagine è stata importata.'],
      browse: ['Browse demo', 'Lo stato resta locale a questa sessione Codice.'],
      enhance: ['Miglioramento demo', 'Nessun modello è stato chiamato.'],
      'enhance-blocked': ['Miglioramento non collegato', 'Questa superficie resta locale.'],
      'refresh-models': ['Profili demo', 'Nessuna discovery di rete eseguita.'],
      'browser-url': ['Browser demo', 'Nessuna navigazione esterna eseguita.'],
      attach_file: ['Allegato demo', 'Il selettore è UI locale e non carica file reali.'],
      export_report: ['Export demo', 'Nessun rapporto reale è stato prodotto.'],
    };
    const feedback = copy[action] || ['Demo UI · non collegato', 'Azione locale registrata senza backend.'];
    toast(...feedback);
    return true;
  }

  function autoGrowTextarea() {
    const explicitLines = composerInput.value.split('\n').length;
    composerInput.rows = Math.min(5, Math.max(1, explicitLines));
  }

  /*
   * ⭐⭐⭐ 26/8 — il trigger su desktop standalone. Owner: "abbiamo già la
   * grammatica... va adattata", non una decisione UX da inventare da zero.
   * La grammatica è openRealTaskSheet() (26/8, mattina: porta i task veri
   * dal corpus, mai collegata a un tocco) — su mobile resta non collegata
   * perché la superficie "Codice" è negoziata in OTTO fasi (non è mia da
   * riaprire), ma su desktop standalone non c'è quel vincolo.
   *
   * ⛔ 27/8 — l'Opzione B (§1.5) che questo commento dichiarava "fuori
   * fase" è ora APERTA, con un'allowlist esplicita
   * (`TALOS_HARNESS_UI_PROJECT_DIRS`): `openRealTaskSheet()` mostra una
   * seconda sezione "Compito libero" quando il server ne ha almeno una
   * configurata. Il reset da chat vuota (sotto, ramo embedded) resta
   * comunque demo — non è quello il punto in cui l'Opzione B si aggancia.
   *
   * ⛔ Corretto in Fase 4 di `procedi-col-generare-un-snoopy-neumann.md`:
   * QUESTO commento diceva "su mobile resta non collegata... non è mia
   * da riaprire" — vero finché il mobile non aveva modo di raggiungere un
   * backend. Ora ce l'ha (Fase 1-3, `adb reverse` + API assoluta): il
   * cancello è `embeddedDemoOnly()` (embedded E SENZA
   * `window.__talosHarnessApiBase`), non più `talos-embedded` da solo —
   * col tunnel attivo il mobile apre lo stesso foglio vero del desktop.
   */
  function createNewSession() {
    if (!embeddedDemoOnly()) {
      openRealTaskSheet();
      return;
    }
    state.session = 'Nuova sessione';
    sessionTitle.textContent = state.session;
    /* ⛔ 27/8, trovato dalla pipeline QA visiva: solo sessionTitle veniva aggiornato — la card "Session topology" nel Context Rail e la voce "Main" nel foglio Albero sessione restavano al titolo demo ("Refactor auth flow") per sempre. Ogni elemento con lo stesso attributo resta sincronizzato. */
    $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
    $$('.session-item').forEach((item) => item.classList.remove('active'));
    setView('chat');
    closePanels();
    toast('Nuova sessione', 'La sessione verrà creata al primo invio.');
    composerInput.focus();
  }

  function selectSession(selection) {
    if (!selection || typeof selection.id !== 'string' || typeof selection.title !== 'string') return false;
    // ⛔ 27/8 — le sessioni demo statiche (dataset.sessionId) non esistono più: le uniche voci reali della sidebar hanno dataset.realSessionId (aggiornaElencoSessioniReali). Un router che chiama questa funzione deve trovarle comunque.
    const item = $$('.session-item').find((candidate) => candidate.dataset.sessionId === selection.id || candidate.dataset.realSessionId === selection.id);
    if (!item) return false;
    $$('.session-item').forEach((other) => other.classList.remove('active'));
    item.classList.add('active');
    state.session = selection.title;
    $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
    const itemTitle = $('.session-main strong', item);
    if (itemTitle) itemTitle.textContent = state.session;
    closePanels();
    setView('chat');
    return true;
  }

  /**
   * ⭐ Blocco 9, trovato verificando la palette comandi — 27/8. Esportava
   * SEMPRE dati inventati (`branch: 'feat/mobile-code'`, un `note` che
   * dichiara sé stesso "mockup export") anche con una sessione REALE
   * attiva, il cui export vero (`GET .../export`, già scritto e testato
   * in `session-registry.mjs`) non veniva mai chiamato da nessuna parte
   * del frontend. Ora: sessione reale attiva → il suo export vero;
   * altrimenti il comportamento demo, invariato.
   *
   * ⭐⭐⭐ 28/8, owner: "una modale di esportazione in diversi formati". Una
   * sessione REALE apre il foglio di scelta (Markdown leggibile / JSON
   * completo — vedi sheetTemplates.export e costruisciTrascrizioneMarkdown).
   * Il percorso demo resta un download diretto invariato: una modale con
   * scelta di formato per dati FINTI non avrebbe alcuno scopo — nessuno
   * userebbe l'export di un mockup per una diagnosi vera.
   */
  async function exportSession() {
    if (state.realSession.id) { openSheet('export'); return; }
    const payload = {
      schema: 'talos_mock_session_v1',
      exported_at: new Date().toISOString(),
      session: state.session,
      model: state.model,
      permissions: state.permissions,
      branch: 'feat/mobile-code',
      worktree: 'wt/auth-61c',
      note: 'Interactive TALOS frontend mockup export',
    };
    scaricaTesto(JSON.stringify(payload, null, 2), 'talos-session-export.json', 'application/json');
    toast('Sessione esportata', 'JSON pronto.');
  }

  async function shareSession() {
    const text = `TALOS · ${state.session} · feat/mobile-code`;
    try {
      if (navigator.share) await navigator.share({ title: state.session, text });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); toast('Snapshot copiato', 'Pronto da condividere.'); }
      else toast('Snapshot pronto', text);
    } catch (error) {
      if (error?.name !== 'AbortError') toast('Condivisione non disponibile', text);
    }
  }

  /*
   * ⭐⭐⭐ 29/8 — FASE J, piano `elegant-spinning-dongarra.md`, design
   * chiuso la stessa sera. Push-to-talk via Web Speech API
   * (`SpeechRecognition`) — motore di DEFAULT gratuito: nessuna
   * chiave, nessun backend, gira interamente nel browser. ⛔ Chrome
   * (il browser bersaglio dichiarato, owner-only/loopback) instrada
   * l'audio a un servizio Google per il riconoscimento — verificato
   * su MDN il 29/8: *"uses a server-based recognition engine... will
   * not work offline"* — non è on-device come il motore mobile
   * (Pocket TTS/wake-word "Hey TALOS"), un limite di PIATTAFORMA
   * dichiarato onestamente, non nostro (e non nuovo: la chat stessa
   * richiede già una rete per il modello).
   *
   * Pareggia Claude Code (push-to-talk: tieni un tasto, rilascia per
   * il testo) — MAI un ascolto always-on come Hermes (wake-word):
   * dichiarato limite di piattaforma nel piano madre (un tab senza
   * focus perde il microfono, comportamento di browser non nostro).
   *
   * ⛔⛔⛔ NON VERIFICATO dal vivo in questa sessione — a differenza di
   * ogni altra fase (E/F/G/H), qui manca ANCHE la verifica più debole
   * (un round-trip HTTP a unità): `SpeechRecognition`/`speechSynthesis`
   * non esistono in jsdom/Node, zero polyfill in questo progetto — un
   * mock qui proverebbe solo il MIO mock, non il comportamento reale
   * del browser. Nessun tool di automazione browser disponibile in
   * questa sessione (stesso limite già dichiarato per E/F/G/M).
   * Richiede un umano che tiene il tasto e parla — resta la verifica
   * dell'OWNER, non rimandabile a un test automatico.
   */
  function creaRiconoscimentoVocale() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;
    const recognition = new Ctor();
    recognition.continuous = true; // push-to-talk: resta in ascolto finché il tasto è premuto, non un singolo comando breve
    recognition.interimResults = true; // testo parziale VISIBILE mentre si parla — stessa disciplina "lo stato si vede" di ogni altra fase
    recognition.lang = 'it-IT';
    return recognition;
  }

  const riconoscimentoVocale = creaRiconoscimentoVocale();
  const statoVoce = { registrando: false, testoBase: '' };

  function avviaRegistrazioneVoce() {
    if (!riconoscimentoVocale || statoVoce.registrando) return;
    statoVoce.registrando = true;
    statoVoce.testoBase = composerInput.value;
    composerMic.classList.add('recording');
    composerMic.setAttribute('aria-pressed', 'true');
    try {
      riconoscimentoVocale.start();
    } catch {
      // ⛔ start() lancia se una registrazione è già in corso (doppio mousedown/touchstart) — stato già coerente, nessuna azione ulteriore.
    }
  }

  function fermaRegistrazioneVoce() {
    if (!statoVoce.registrando) return;
    statoVoce.registrando = false;
    composerMic.classList.remove('recording');
    composerMic.setAttribute('aria-pressed', 'false');
    try { riconoscimentoVocale.stop(); } catch { /* già ferma */ }
  }

  if (riconoscimentoVocale) {
    /*
     * ⭐ `event.results` accumula OGNI risultato della sessione di
     * ascolto corrente (finale e interim) — si ricostruisce il testo
     * intero da zero ad ogni evento invece di accodare in modo
     * incrementale: più semplice e senza il rischio di un doppio
     * conteggio quando un segmento interim diventa finale.
     */
    riconoscimentoVocale.onresult = (event) => {
      let finale = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const risultato = event.results[i];
        if (risultato.isFinal) finale += risultato[0].transcript;
        else interim += risultato[0].transcript;
      }
      const separatore = statoVoce.testoBase && !/\s$/.test(statoVoce.testoBase) ? ' ' : '';
      composerInput.value = statoVoce.testoBase + separatore + finale + interim;
      autoGrowTextarea();
    };
    riconoscimentoVocale.onerror = (event) => {
      fermaRegistrazioneVoce();
      // ⭐ un messaggio ONESTO per errore, mai un generico "qualcosa è andato storto" — gli errori VERI di SpeechRecognition, non inventati.
      const messaggi = {
        'not-allowed': 'Permesso microfono negato — abilitalo nelle impostazioni del browser per questo sito.',
        'no-speech': 'Nessuna voce rilevata.',
        network: 'Il servizio di riconoscimento vocale non è raggiungibile in questo momento.',
        'audio-capture': 'Nessun microfono trovato su questo dispositivo.',
      };
      toast('Voce non riconosciuta', messaggi[event.error] || `Errore: ${event.error}`);
    };
    // ⭐ il servizio può fermarsi da solo (silenzio prolungato) senza che il tasto sia stato rilasciato — lo stato visivo deve seguirlo, mai restare "in ascolto" quando non lo è più.
    riconoscimentoVocale.onend = () => { fermaRegistrazioneVoce(); };
  }

  /*
   * ⭐⭐⭐ 29/8 — FASE J, TTS: `window.speechSynthesis`, STESSA famiglia
   * di API di SpeechRecognition sopra (un solo namespace del browser
   * per entrambe le direzioni) ma supporto PIÙ AMPIO — gira
   * interamente in locale, offline, con le voci del sistema operativo
   * (verificato nel piano madre: Chrome/Edge/Safari/Firefox/Opera,
   * non solo Chromium). Un bottone per bubble assistente, come un
   * "copia" ma per l'orecchio — owner: "Sì, stessa fetta".
   */
  const sintesiVoceDisponibile = 'speechSynthesis' in window;
  let elementoInAscolto = null; // il bottone "ascolta" attivo in questo momento, per poterlo far tornare a stato "play" da onend/onerror

  function impostaStatoBottoneAscolto(bottone, inAscolto) {
    bottone.classList.toggle('speaking', inAscolto);
    bottone.setAttribute('aria-pressed', String(inAscolto));
    bottone.setAttribute('aria-label', inAscolto ? 'Ferma la lettura' : 'Ascolta la risposta');
    const uso = bottone.querySelector('use');
    if (uso) uso.setAttribute('href', inAscolto ? '#i-stop' : '#i-play');
  }

  function fermaLetturaVoceAlta() {
    if (!sintesiVoceDisponibile) return;
    window.speechSynthesis.cancel(); // ⭐ cancel() svuota anche la coda — mai due lettura sovrapposte
    if (elementoInAscolto) impostaStatoBottoneAscolto(elementoInAscolto, false);
    elementoInAscolto = null;
  }

  function leggiVoceAlta(testo, bottone) {
    if (!sintesiVoceDisponibile || !testo.trim()) return;
    const giàInAscoltoQui = elementoInAscolto === bottone;
    fermaLetturaVoceAlta(); // un secondo click sullo STESSO bottone, o un click su un bottone diverso, ferma sempre quella precedente prima — mai due letture insieme
    if (giàInAscoltoQui) return; // il click era per FERMARE, non per far ripartire da capo
    const utterance = new SpeechSynthesisUtterance(testo);
    utterance.lang = 'it-IT';
    utterance.onend = () => { if (elementoInAscolto === bottone) { impostaStatoBottoneAscolto(bottone, false); elementoInAscolto = null; } };
    utterance.onerror = utterance.onend;
    elementoInAscolto = bottone;
    impostaStatoBottoneAscolto(bottone, true);
    window.speechSynthesis.speak(utterance);
  }

  function visibleCommandButtons() {
    return $$('#commandResults button[data-command]').filter((button) => !button.hidden);
  }

  function setActiveCommand(button) {
    $$('#commandResults button[data-command]').forEach((item) => item.classList.toggle('command-active', item === button));
    button?.scrollIntoView({ block: 'nearest' });
  }

  function openCommandPalette() {
    prepareResizableDialog(commandDialog, 'command:palette');
    showEmbeddedDialog(commandDialog);
    commandSearch.value = '';
    filterCommands('');
    window.setTimeout(() => commandSearch.focus(), 20);
  }

  function filterCommands(query) {
    const q = query.trim().toLowerCase();
    $$('#commandResults button[data-command]').forEach((button) => {
      button.hidden = Boolean(q && !button.textContent.toLowerCase().includes(q));
    });
    const visible = visibleCommandButtons();
    if (commandEmpty) commandEmpty.hidden = visible.length > 0;
    setActiveCommand(visible[0] || null);
  }

  function moveActiveCommand(delta) {
    const visible = visibleCommandButtons();
    if (!visible.length) return;
    const current = visible.findIndex((button) => button.classList.contains('command-active'));
    const next = visible[(current + delta + visible.length) % visible.length];
    setActiveCommand(next);
  }

  function executeCommand(command) {
    closeEmbeddedDialog(commandDialog);
    switch (command) {
      case 'new': createNewSession(); break;
      case 'review': setView('diff'); break;
      case 'terminal': setView('terminal'); break;
      case 'browser': setView('browser'); break;
      case 'permissions': openSheet('permissions'); break;
      case 'dashboard': setView('dashboard'); break;
      /*
       * ⛔⛔⛔ Riconciliazione Fase 2 (piano procedi-col-generare-un-snoopy-neumann.md,
       * 27/8) — trovato dal vivo: fino a qui il palette mostrava sempre lo
       * stesso toast finto, ANCHE con una sessione reale in corso, invece
       * di chiamare le funzioni vere già scritte e già cablate altrove
       * (`forkSession()` sul bottone "Fork questa sessione", `compactSession()`
       * esposta su `window.__talosHarnessUiRuntime` per i test automatici).
       * Entrambe già ricadono da sole sullo stesso toast finto quando non
       * c'è una sessione reale — zero duplicazione necessaria qui.
       */
      case 'resume': resumeSession(); break;
      case 'fork': forkSession(); break;
      case 'compact': compactSession(); break;
      case 'tree': openSheet('sessionTree'); break;
      case 'skills': openSheet('capabilities'); break;
      case 'control': openSheet('control'); break;
      case 'rename': openSheet('rename'); break;
      case 'export': exportSession(); break;
      case 'share': shareSession(); break;
      default: break;
    }
  }

  $$('[data-open-panel]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.openPanel === 'sessions' && HOST().classList.contains('talos-embedded')) {
      window.__talosHarnessHostBack?.();
    } else if (button.classList.contains('desktop-context-toggle') && button.dataset.openPanel === 'inspector' && window.innerWidth > 1040) toggleDesktopInspector();
    else openPanel(button.dataset.openPanel);
  }));
  $$('[data-close-panel]').forEach((button) => button.addEventListener('click', closePanels));
  backdrop.addEventListener('click', closePanels);

  $$('[data-open-view]').forEach((button) => button.addEventListener('click', () => { setView(button.dataset.openView); closePanels(); }));
  mobileViewButtons.forEach((button) => button.addEventListener('click', () => setView(button.dataset.mobileView)));

  modeTabs.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.mode === 'chat') {
        setView('chat', { mode: 'chat' });
        if (window.innerWidth <= 1040) closePanels();
      } else if (button.dataset.mode === 'terminal') {
        setView('terminal');
      } else {
        setView('dashboard', { mode: 'dashboard' });
      }
    });
  });

  $$('[data-open-sheet]').forEach((button) => button.addEventListener('click', () => openSheet(button.dataset.openSheet)));
  $$('[data-session-action]').forEach((button) => button.addEventListener('click', () => {
    toast(button.dataset.sessionAction === 'fork' ? 'Fork creato' : 'Side thread creato', 'Contesto isolato, collegamento mantenuto nel grafo sessione.');
  }));
  /* ⭐ 27/8 — card "Session topology": il pulsante Fork chiama la VERA forkSession() (già reale per il blocco 1), non un toast finto — stesso attrezzo, un secondo punto d'accesso onesto. */
  $$('[data-action="fork-session"]').forEach((button) => button.addEventListener('click', () => forkSession()));
  $$('[data-control-action]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.controlAction === 'doctor') eseguiDoctor();
  }));
  $('#capabilityBtn').addEventListener('click', () => openSheet('capabilities'));
  $('#manageCapabilitiesBtn').addEventListener('click', () => openSheet('capabilities'));
  $('#closeSheet').addEventListener('click', () => closeEmbeddedDialog(sheetDialog));

  $$('.inspector-tabs button').forEach((button) => {
    button.addEventListener('click', () => setInspectorTab(button));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const tabs = $$('.inspector-tabs button');
      const index = tabs.indexOf(button);
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      setInspectorTab(next);
    });
  });

  $$('[data-collapse-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = ROOT().getElementById(button.dataset.collapseTarget);
      if (!target) return;
      const collapsed = target.classList.contains('collapsed');
      button.setAttribute('aria-expanded', String(collapsed));
      if (collapsed) {
        target.classList.remove('collapsed');
        markMotionEnter(target);
      } else {
        animateExit(target, { durationToken: '--talos-motion-duration-disclosure' }, () => target.classList.add('collapsed'));
      }
    });
  });

  $$('[data-tool-detail]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => toggleToolDetail(button));
  });

  /*
   * Owner 24/8: era `document.addEventListener` — su tutta la pagina andava
   * bene perché la pagina ERA il mockup. Montato nello shadow root, un
   * ascoltatore su `document` riceverebbe l'evento RIETICHETTATO (event.target
   * diventa l'host, non il bottone vero dentro — retargeting di spec) e
   * continuerebbe ad ascoltare anche quando l'utente è altrove nell'app.
   * Sullo shadow root invece l'evento porta il target vero, e l'ascoltatore
   * smette di ricevere nulla da solo quando lo shadow root muore col
   * componente Vue — nessuna pulizia esplicita necessaria per questi due.
   */
  ROOT().addEventListener('click', (event) => {
    const copyButton = event.target.closest('[data-copy-message]');
    if (copyButton) {
      const message = copyButton.closest('.message');
      copyText($('.message-bubble, .assistant-copy', message)?.textContent || '', 'Messaggio copiato');
      return;
    }
    const actionButton = event.target.closest('[data-message-action]');
    if (!actionButton) return;
    const message = actionButton.closest('.assistant-message');
    const action = actionButton.dataset.messageAction;
    if (action === 'copy') copyText($('.assistant-copy', message)?.textContent || '', 'Risposta copiata');
    if (action === 'retry') toast('Rigenerazione avviata', 'Il contesto e i permessi della sessione restano invariati.');
    if (action === 'like' || action === 'dislike') {
      const group = $$('.message-actions [data-message-action="like"], .message-actions [data-message-action="dislike"]', message);
      const wasPressed = actionButton.getAttribute('aria-pressed') === 'true';
      group.forEach((button) => button.setAttribute('aria-pressed', 'false'));
      actionButton.setAttribute('aria-pressed', String(!wasPressed));
      toast(!wasPressed ? 'Feedback registrato' : 'Feedback rimosso');
    }
  });

  /*
   * ⭐⭐⭐ 02/09 — azioni REALI sul Browser (prima: toast "Azione simulata nel
   * mockup locale"). Indietro/avanti scorrono la cronologia delle pagine
   * lette dall'attrezzo naviga in questa sessione; Apri porta l'URL nel
   * browser di sistema; Annota scrive nel composer un riferimento alla
   * pagina (Hermes Desktop: le annotazioni finiscono nel composer, mai
   * inviate da sole); Copia testo mette negli appunti ciò che il modello ha
   * letto.
   */
  $$('[data-browser-action]').forEach((button) => button.addEventListener('click', () => {
    const pagine = state.realSession.browserPagine;
    const indice = state.realSession.browserIndice;
    const pagina = pagine[indice] || null;
    switch (button.dataset.browserAction) {
      case 'back': if (indice > 0) mostraPaginaBrowser(indice - 1); break;
      case 'forward': if (indice < pagine.length - 1) mostraPaginaBrowser(indice + 1); break;
      case 'open': if (pagina && /^https?:\/\//i.test(pagina.url)) window.open(pagina.url, '_blank', 'noopener'); break;
      case 'annotate': if (pagina) preparaCommentoNelComposer(`Riguardo alla pagina ${pagina.url}: `); break;
      case 'copy': if (pagina) copyText(pagina.testo, 'Testo della pagina copiato'); break;
      default: break;
    }
  }));

  const demoActionCopy = {
    widget: ['Widget demo', 'L’aggiunta sarà disponibile quando questa Board avrà un backend.'],
    delegate: ['Delega demo', 'Nessun subagent è stato avviato da questa interfaccia.'],
  };
  $$('[data-demo-action]').forEach((button) => button.addEventListener('click', () => {
    toast(...(demoActionCopy[button.dataset.demoAction] || ['Demo UI · non collegato', 'Nessuna azione reale eseguita.']));
  }));

  // ⭐⭐⭐ 02/09 — campanella REALE (vedi aggiornaNotifiche). Il badge si allinea a ogni refresh dell'elenco sessioni; un refresh leggero ogni 15 s, solo a scheda visibile, coglie le sessioni che finiscono mentre se ne guarda un'altra (nessuna SSE le porta qui).
  // ⭐ 02/09 — azioni reali delle sezioni Settings: svuotare le preferenze locali (due clic, mai un dialogo nativo) e aprire il chooser per una nuova sessione altrove.
  $('#settingsSvuotaLocali')?.addEventListener('click', (event) => {
    const bottone = event.currentTarget;
    if (bottone.dataset.conferma !== '1') {
      bottone.dataset.conferma = '1';
      bottone.textContent = 'Confermi? Tocca di nuovo per svuotare';
      window.setTimeout(() => { bottone.dataset.conferma = ''; bottone.textContent = 'Svuota le preferenze di questo browser'; }, 4000);
      return;
    }
    try {
      const chiavi = [];
      for (let i = 0; i < window.localStorage.length; i += 1) { const k = window.localStorage.key(i); if (/^talos/i.test(k)) chiavi.push(k); }
      for (const k of chiavi) window.localStorage.removeItem(k);
      toast('Preferenze locali svuotate', `${chiavi.length} voci rimosse: la pagina si ricarica con i valori predefiniti.`);
      window.setTimeout(() => window.location.reload(), 600);
    } catch { toast('Non riesco a svuotare le preferenze', 'Il browser non consente di accedere allo storage locale.'); }
  });
  $('#settingsNuovaSessioneAltrove')?.addEventListener('click', () => createNewSession());

  $('#notificationsBtn')?.addEventListener('click', (event) => {
    const aperto = document.querySelector('.notifications-menu');
    if (aperto) { aperto.remove(); event.currentTarget.setAttribute('aria-expanded', 'false'); return; }
    apriPopoverNotifiche(event.currentTarget);
  });
  const notificheTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void aggiornaElencoSessioniReali(); }, 15_000);

  $$('[data-file-entry]').forEach((button) => button.addEventListener('click', () => {
    $$('[data-file-entry]').forEach((entry) => entry.classList.toggle('active', entry === button));
    toast('Elemento selezionato', button.textContent.trim());
  }));

  /*
   * ⭐ 27/8, piano §1.3-BIS, blocco Automazioni — riusa startRealSession
   * (già reale, già testata) invece di un toast: "Esegui ora" su una riga
   * con data-task-id avvia per davvero quel task del corpus, la stessa
   * strada di "Nuova sessione". La SCHEDULAZIONE vera (un cron che parte
   * da solo, senza un tocco) resta dichiaratamente fuori — spenderebbe
   * credito reale senza nessuno a guardare, una cosa diversa da un
   * bottone premuto apposta, e vuole la sua stessa persistenza che oggi
   * non c'è (session-registry.mjs, "solo in memoria, deliberato").
   */
  $$('[data-automation-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.automationAction;
    // ⛔ Stesso cancello di createNewSession(): un fetch reale solo se c'è
    // DAVVERO un backend da raggiungere (HARNESS-BOARD-MOBILE-HONESTY-01,
    // rivisto in Fase 4 di procedi-col-generare-un-snoopy-neumann.md —
    // "embedded" da solo non basta più a dire "niente da raggiungere").
    if (action === 'run' && button.dataset.taskId && !embeddedDemoOnly()) {
      startRealSession({ id: button.dataset.taskId });
      return;
    }
    // ⭐ 27/8 — "Nuova automazione" apre il vero form (blocco 7, via libera dell'owner), non più un toast che finge.
    if (action === 'new' && !HOST().classList.contains('talos-embedded')) {
      openNewAutomationSheet();
      return;
    }
    const labels = { new: ['Nuova automazione', 'Il mockup rappresenta il flusso senza backend.'], run: ['Run avviato', 'Il mockup rappresenta il flusso senza backend.'], edit: ['Automazione aperta', 'Il mockup rappresenta il flusso senza backend.'] };
    toast(...(labels[action] || ['Automazione', 'Il mockup rappresenta il flusso senza backend.']));
  }));

  $('.stop-run')?.addEventListener('click', () => {
    if (!state.running) return;
    setRunState(false);
    setQueueMode(false);
    toast('Esecuzione interrotta', 'Stato, diff e output restano disponibili per la review.');
  });

  runStateToggle?.addEventListener('click', () => setQueueMode(!state.queueMode, true));

  $('#sessionSearch').addEventListener('input', (event) => {
    const q = event.target.value.toLowerCase().trim();
    $$('.session-item').forEach((item) => item.hidden = q && !item.textContent.toLowerCase().includes(q));
  });

  $$('.session-item').forEach((item) => {
    item.addEventListener('click', () => {
      selectSession({
        id: item.dataset.sessionId || '',
        title: item.dataset.session || item.querySelector('.session-main strong')?.textContent || '',
      });
    });
  });

  $('#newSessionBtn').addEventListener('click', createNewSession);
  /*
   * ⭐ FASE M (29/8) — stesse funzioni reali già cablate su ⌘K
   * ('resume' non c'era nemmeno lì: solo scrivendo un messaggio;
   * 'compact' sì, ma senza un punto d'ingresso visibile). Nessuna
   * duplicazione: resumeSession()/compactSession() restano le uniche
   * implementazioni, qui solo un secondo modo di chiamarle.
   */
  $('#resumeSessionBtn').addEventListener('click', () => resumeSession());
  $('#compactSessionBtn').addEventListener('click', () => compactSession());
  $('#commandPaletteBtn').addEventListener('click', openCommandPalette);
  $('#closeCommand')?.addEventListener('click', () => closeEmbeddedDialog(commandDialog));
  harnessDialogBackdrop.addEventListener('click', dismissTransientLayers);
  commandSearch.addEventListener('input', () => filterCommands(commandSearch.value));
  commandSearch.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveActiveCommand(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveActiveCommand(-1); }
    else if (event.key === 'Enter') {
      const active = $('#commandResults .command-active[data-command]');
      if (active) { event.preventDefault(); executeCommand(active.dataset.command); }
    }
  });
  $$('#commandResults button[data-command]').forEach((button) => {
    button.addEventListener('mouseenter', () => setActiveCommand(button));
    button.addEventListener('click', () => executeCommand(button.dataset.command));
  });

  composerInput.addEventListener('input', () => {
    autoGrowTextarea();
    syncRunComposerState();
    const value = composerInput.value;
    if (value === '/') openCommandPalette();
    if (/@[^\s]*$/.test(value) && value.endsWith('@')) openSheet('references');
  });
  composerInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      composerForm.requestSubmit();
    }
  });

  sendButton.addEventListener('click', () => {
    if (runRealeAttivo()) {
      stopRealSession();
      return;
    }
    composerForm.requestSubmit();
  });
  redirectRunButton.addEventListener('click', () => {
    reindirizzaSessioneReale(composerInput.value);
  });
  /*
   * ⭐⭐⭐ 29/8 — FASE J: push-to-talk vero, non più un annuncio "non
   * collegato". `mousedown`/`touchstart` avvia, `mouseup`/`mouseleave`/
   * `touchend`/`touchcancel` ferma — `mouseleave` copre il caso di chi
   * trascina fuori dal bottone tenendo premuto, `touchcancel` il caso
   * (mobile/tablet) di un'interruzione di sistema a metà tocco.
   */
  if (composerMic) {
    if (riconoscimentoVocale) {
      composerMic.setAttribute('aria-pressed', 'false');
      composerMic.addEventListener('mousedown', avviaRegistrazioneVoce);
      composerMic.addEventListener('mouseup', fermaRegistrazioneVoce);
      composerMic.addEventListener('mouseleave', fermaRegistrazioneVoce);
      composerMic.addEventListener('touchstart', (event) => { event.preventDefault(); avviaRegistrazioneVoce(); }, { passive: false });
      composerMic.addEventListener('touchend', fermaRegistrazioneVoce);
      composerMic.addEventListener('touchcancel', fermaRegistrazioneVoce);
    } else {
      // ⭐ onesto: questo browser non espone SpeechRecognition affatto (fuori da Chromium) — mai un bottone che sembra funzionare e non fa niente.
      composerMic.addEventListener('click', () => toast('Voce non disponibile', 'Questo browser non supporta il riconoscimento vocale (SpeechRecognition).'));
    }
  }

  composerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = composerInput.value.trim();
    if (!submitPrompt(text)) return;
    composerInput.value = '';
    autoGrowTextarea();
    syncRunComposerState();
  });

  /*
   * ⭐⭐⭐ FASE D (28/8) — "Annulla" chiama DAVVERO POST .../queue/annulla
   * (svuotaCoda toglie l'ULTIMO messaggio accodato, mai il primo — vedi
   * la sua doc in session-registry.mjs) invece di limitarsi a nascondere
   * il banner: prima di questo fix il testo restava comunque in coda sul
   * server, e sarebbe arrivato al modello lo stesso nonostante "Annulla".
   */
  $('#cancelQueued').addEventListener('click', async () => {
    if (!state.realSession.id || state.realSession.codaMessaggi.length === 0) return;
    try {
      const dati = await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/queue/annulla`, {});
      if (dati.rimosso) {
        state.realSession.codaMessaggi.pop();
        renderizzaBannerCoda();
        toast('Follow-up annullato');
      }
    } catch (error) {
      toast('Annullamento non riuscito', error.message);
    }
  });

  $$('[data-approve], [data-allow-session], [data-deny]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.approval-card');
      animateExit(card, {}, () => card?.remove());
      if (button.hasAttribute('data-deny')) toast('Permesso negato', 'Il browser locale non verrà aperto.');
      else toast(button.hasAttribute('data-allow-session') ? 'Permesso per sessione' : 'Permesso concesso', 'Browser locale autorizzato.');
    });
  });

  /*
   * ⭐⭐⭐ 02/09 — "Approva tutto" era un toast con "3 file" scritti a mano.
   * Le scritture di TALOS sono già sul disco (come in Claude Code e Codex, la
   * review è a valle, non un cancello): l'azione vera e utile è portarsi via
   * il diff completo — per una PR, una nota, un messaggio.
   */
  $('#copyAllDiffs')?.addEventListener('click', () => {
    if (state.realSession.reviewFiles.size === 0) { toast('Nessuna modifica da copiare', 'In questa sessione TALOS non ha ancora scritto file.'); return; }
    copyText(testoDiffCompleto(), `Diff di ${state.realSession.reviewFiles.size} file copiato`);
  });

  $$('.file-review').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.file-review').forEach((file) => {
        const active = file === button;
        file.classList.toggle('active', active);
        file.setAttribute('aria-pressed', String(active));
      });
      renderReviewFile(button.dataset.reviewFile);
    });
  });

  /*
   * ⭐⭐⭐ 02/09 — azioni REALI sul file in review (prima: due toast).
   * Commenta: come Claude Code Desktop (commenti sul diff che tornano al
   * modello) — il riferimento al file, e all'ultima riga del diff sotto il
   * puntatore se c'è, finisce nel composer, la persona completa e invia.
   * Apri file: lo stesso visualizzatore dell'albero Files (apriFileAlbero).
   */
  $$('[data-review-action]').forEach((button) => button.addEventListener('click', () => {
    const percorso = state.reviewFileCorrente;
    if (!percorso) { toast('Nessun file selezionato', 'Scegli un file nella lista qui sopra.'); return; }
    if (button.dataset.reviewAction === 'comment') {
      const selezione = String(window.getSelection?.()?.toString() || '').trim().split('\n')[0]?.slice(0, 160);
      preparaCommentoNelComposer(selezione ? `Riguardo a \`${percorso}\`, alla riga «${selezione}»: ` : `Riguardo a \`${percorso}\`: `);
      return;
    }
    if (!state.realSession.id) { toast('Nessuna sessione aperta', 'Il file si apre dall\'albero della sessione che lo ha scritto.'); return; }
    void apriFileAlbero(percorso, percorso.split('/').pop());
  }));

  inizializzaPreferenzeChatDesktop();
  inizializzaAspettoDesktop();
  inizializzaSettingsNavigation();
  const appearanceControlMap = {
    themePresetSelect: 'themePreset', colorModeSelect: 'colorMode', sceneOverrideSelect: 'sceneOverride',
    uiFontScaleSelect: 'uiFontScale', chatFontScaleSelect: 'chatFontScale', composerShapeSelect: 'composerShape',
    composerPlusSelect: 'composerPlus', messageStyleSelect: 'messageStyle', streamingAnimationSelect: 'streamingAnimation',
    windowPresentationSelect: 'windowPresentation', backgroundMotionToggle: 'backgroundMotion', interfaceMotionToggle: 'interfaceMotion',
    reducedMotionToggle: 'reducedMotion', pauseWhenHiddenToggle: 'pauseWhenHidden', respectDataSaverToggle: 'respectDataSaver',
    motionModeSelect: 'motionMode', motionQualitySelect: 'motionQuality', motionProfileSelect: 'motionProfile', motionEasingSelect: 'motionEasing',
    motionSpeedRange: 'motionSpeed', motionIntensityRange: 'motionIntensity', motionGlowRange: 'motionGlow', motionDensityRange: 'motionDensity',
    motionDepthRange: 'motionDepth', motionTrailsRange: 'motionTrails', motionContrastRange: 'motionContrast', motionParallaxRange: 'motionParallax',
    motionDurationRange: 'motionDuration', motionUiIntensityRange: 'motionUiIntensity', motionStaggerRange: 'motionStagger',
    motionWindowsToggle: 'motionWindows', motionSurfacesToggle: 'motionSurfaces', motionNavigationToggle: 'motionNavigation',
    motionComposerToggle: 'motionComposer', motionMessagesToggle: 'motionMessages', motionFeedbackToggle: 'motionFeedback',
    immersiveHeaderToggle: 'immersiveHeader', chatFullWidthToggle: 'chatFullWidth',
  };
  for (const [id, key] of Object.entries(appearanceControlMap)) {
    const input = $(`#${id}`);
    if (!input) continue;
    const eventName = input.type === 'range' ? 'input' : 'change';
    input.addEventListener(eventName, () => {
      const value = input.type === 'checkbox' ? input.checked : input.value;
      aggiornaAspettoDesktop({ [key]: value });
    });
  }
  $('#resetMotionButton')?.addEventListener('click', resettaMotionDesktop);

  refreshSessionsBoardButton?.addEventListener('click', () => {
    if (embeddedDemoOnly()) renderEmbeddedSessionsBoardDemo(true);
    else if (state.board.initialized) refreshSessionsBoard();
    else ensureSessionsBoard();
  });

  ROOT().addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommandPalette();
    }
    if (mod && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      createNewSession();
    }
    if (event.key === 'Escape' && (commandDialog.open || sheetDialog.open)) dismissTransientLayers();
    else if (event.key === 'Escape' && (sessionsPanel.classList.contains('open') || inspectorPanel.classList.contains('open'))) closePanels();
  });

  /*
   * Owner 24/8: questi tre, a differenza dei due sopra, vivono su `window` —
   * escono dallo shadow root e NON muoiono col componente Vue. Prima (pagina
   * a sé, `window.location.assign`) lasciare la pagina uccideva l'intero
   * contesto JS, pulizia gratis. Ora no: se l'utente esce da Harness e resta
   * su questi tre, `onResize` continuerebbe a leggere/scrivere pannelli di
   * uno shadow root ormai smontato. `window.__talosHarnessDestroy()` li
   * rimuove — `HarnessSessionScreen.vue` la chiama nel suo `onBeforeUnmount`,
   * lo stesso contratto del "destroyer" che le app incorporate reali usano
   * (es. PagerDuty: https://www.pagerduty.com/eng/react-embedded-apps/).
   */
  let hostResizeObserver = null;

  function syncHostLayout() {
    const host = HOST();
    const rect = host.getBoundingClientRect();
    const wideShort = host.classList.contains('talos-embedded')
      && rect.width > 780
      && rect.width <= 900
      && rect.height <= 500;
    host.classList.toggle('talos-embedded-wide-short', wideShort);
  }

  function onResize() {
    if (window.innerWidth > 1040) {
      inspectorPanel.classList.remove('open');
      backdrop.classList.remove('show');
    } else {
      appShell.classList.remove('inspector-collapsed');
    }
    if (!layoutCompatto()) sessionsPanel.classList.remove('open');
    syncInspectorToggle();
    if (window.innerWidth > 1040) loadPanelWidths();
    clampOpenDialogsToViewport();
    syncHostLayout();
    syncVisualViewport();
  }
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('scroll', syncVisualViewport);
  if (HOST().classList.contains('talos-embedded')) {
    embeddedHeaderScrollers.forEach((scroller) => {
      embeddedHeaderScrollPositions.set(scroller, Math.max(0, scroller.scrollTop));
      scroller.addEventListener('scroll', handleEmbeddedContentScroll, { passive: true });
    });
  }
  if (typeof ResizeObserver === 'function') {
    hostResizeObserver = new ResizeObserver(syncHostLayout);
    hostResizeObserver.observe(HOST());
  }
  window.__talosHarnessUiRuntime = {
    selectSession,
    dismissTransientLayers,
    transientLayersActive,
    setKeyboardOpen,
    submitPrompt,
    announceComposerAction,
    // ⭐ 26/8, riconciliazione desktop→mobile — esposti per i test dedicati
    // (stesso schema di sopra: internals reali, non un secondo contratto).
    startRealSession,
    stopRealSession,
    reindirizzaSessioneReale,
    syncRunComposerState,
    handleRealEvent,
    forkSession,
    resumeSession,
    compactSession,
    passaASessione,
    openRealTaskSheet,
    aggiornaElencoSessioniReali,
    runDirectShell,
    // ⭐ Riconciliazione Fase 2, 27/8 — il command palette (⌘K) è dove il
    // bug fork/compatta-finti è stato trovato: esposto per provare la
    // dispatch reale, non solo le funzioni che chiama.
    executeCommand,
    // ⭐ 28/8 — modale export multi-formato: la funzione pura si espone
    // per provarla direttamente (ogni tipo di evento, un caso per volta),
    // separata da executeCommand('export') che prova solo il percorso
    // d'apertura del foglio.
    costruisciTrascrizioneMarkdown,
    setSettingsSection,
    // ⭐ 02/9 — funzione PURA dello stato riga: esposta per provare i cinque stati senza dover avere in casa una sessione per ciascuno.
    statoSessione,
    renderSettingsRiepiloghi,
    // ⭐ 02/9, Fase 5 punto 4 — la funzione PURA che traduce la risposta di
    // /fit nel verdetto mostrato: esposta per provarla su tutti gli stati
    // senza dover avere in casa un modello per ciascuno (stesso schema già
    // in uso qui sopra — internals reali, mai un secondo contratto).
    descriviFit,
    verificaCompatibilitaModello,
    // ⭐ 28/8 — auto-rinomina dal primo messaggio: la funzione pura si espone per provare la sua logica (spazi/trim/tetto) senza dover avviare una sessione vera.
    titoloDalPrimoMessaggio,
    // ⭐ 28/8 — Terminale REALE (LEDGER-TERMINALE-REALE.md): esposte per i test dedicati, stesso principio di sopra — internals reali, non un secondo contratto.
    apriVistaTerminaleReale,
    apriFileAlbero,
    scollegaTerminaleReale,
    statoTerminale,
    get backgroundAnimationRunning() { return backgroundAnimationRunning; },
    realSessionState: state.realSession,
  };
  window.__talosHarnessDestroy = () => {
    window.clearInterval(notificheTimer);
    document.querySelector('.notifications-menu')?.remove();
    cancelMotionAnimations();
    nascondiAttesaRisposta();
    cancellaRenderMessaggiStreaming();
    cancellaRenderAlberoDifferito();
    if (sessionListRefreshTimer !== null) window.clearTimeout(sessionListRefreshTimer);
    sessionListRefreshTimer = null;
    if (streamingScrollFrame !== null) window.cancelAnimationFrame?.(streamingScrollFrame);
    streamingScrollFrame = null;
    state.modelLab.runtimeEventSource?.close();
    state.modelLab.runtimeEventSource = null;
    delete window.__talosHarnessModelLabEventSource;
    fermaBackgroundDesktop();
    if (backgroundScrollResumeTimer !== null) window.clearTimeout(backgroundScrollResumeTimer);
    backgroundScrollResumeTimer = null;
    backgroundInteractionPauseReasons.clear();
    document.removeEventListener('wheel', queueBackgroundScrollPause, true);
    document.removeEventListener('scroll', queueBackgroundScrollPause, true);
    if (handleAppearanceVisibilityChange) document.removeEventListener('visibilitychange', handleAppearanceVisibilityChange);
    if (appearanceMediaQuery && handleAppearanceMediaChange) appearanceMediaQuery.removeEventListener?.('change', handleAppearanceMediaChange);
    handleAppearanceVisibilityChange = null;
    handleAppearanceMediaChange = null;
    appearanceMediaQuery = null;
    HOST().classList.remove('background-motion-active', 'background-motion-paused', 'background-motion-off', 'interface-motion-off', 'reduce-motion', 'motion-windows-off', 'motion-surfaces-off', 'motion-navigation-off', 'motion-composer-off', 'motion-messages-off', 'motion-feedback-off');
    document.body.classList.remove('background-motion-active', 'background-motion-paused', 'background-motion-off', 'reduce-motion');
    setEmbeddedTopbarHidden(false);
    embeddedHeaderScrollers.forEach((scroller) => {
      scroller.removeEventListener('scroll', handleEmbeddedContentScroll);
      embeddedHeaderScrollPositions.delete(scroller);
    });
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', syncVisualViewport);
    window.visualViewport?.removeEventListener('scroll', syncVisualViewport);
    hostResizeObserver?.disconnect();
    hostResizeObserver = null;
    HOST().classList.remove('talos-embedded-wide-short');
    nativeKeyboardOpen = null;
    applyKeyboardOpen(false);
    delete window.__talosHarnessUiRuntime;
    delete window.__talosHarnessDestroy;
  };
  composerInput.addEventListener('focus', () => window.setTimeout(syncVisualViewport, 30));
  composerInput.addEventListener('blur', () => window.setTimeout(syncVisualViewport, 60));
  $('#fileTreeFilter')?.addEventListener('input', (e) => {
    filtraAlberoReale(e.target.value);
    salvaImpostazioniAlbero();
  });
  $('#fileTreeNewFile')?.addEventListener('click', () => avviaCreaVoce(cartellaSelezionataAlbero(), 'file'));
  $('#fileTreeNewFolder')?.addEventListener('click', () => avviaCreaVoce(cartellaSelezionataAlbero(), 'cartella'));
  $('#fileTreeRefresh')?.addEventListener('click', refreshSessionFileTree);
  $('#fileTreeCollapse')?.addEventListener('click', collapseSessionFileTree);

  sessionsCollapseBtn?.addEventListener('click', toggleSessionsPanel);
  sessionSelectionToggle?.addEventListener('click', () => { toggleSessionSelectionMode(); });
  sessionSelectionSelectAll?.addEventListener('click', () => {
    const tutto = state.sessionSelection.available.size > 0
      && state.sessionSelection.selected.size === state.sessionSelection.available.size;
    state.sessionSelection.selected = tutto
      ? new Set()
      : new Set(state.sessionSelection.available.keys());
    aggiornaStatoRigheSelezione();
  });
  sessionSelectionDelete?.addEventListener('click', () => { eliminaSessioniSelezionate(); });

  // Ridimensionamento reale delle due sidebar, con limiti — owner 24/8.
  // Un trascinamento vero (pointer capture) e la stessa cosa da tastiera,
  // perché una maniglia raggiungibile solo dal dito non lo è da chi non
  // può trascinare. Persistito per-viewer in localStorage, come le altre
  // comodità di sola interfaccia di questo mockup (non è dato reale).
  const PANEL_RESIZE_LIMITS = { sessions: [220, 420], inspector: [280, 720] };
  const PANEL_RESIZE_STORAGE_KEY = 'talos-harness-panel-widths';
  const PANEL_RESIZE_VAR = { sessions: '--sidebar', inspector: '--inspector' };
  const PANEL_RESIZE_DEFAULT = { sessions: 292, inspector: 340 };

  function readSavedPanelWidths() {
    try {
      return JSON.parse(window.localStorage.getItem(PANEL_RESIZE_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function savePanelWidth(which, px) {
    try {
      const saved = readSavedPanelWidths();
      saved[which] = px;
      window.localStorage.setItem(PANEL_RESIZE_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Un mockup che perde una preferenza di comodo non deve rompersi per questo.
    }
  }

  function applyPanelWidth(which, px) {
    const [min, configuredMax] = PANEL_RESIZE_LIMITS[which];
    const sidebarWidth = parseInt(getComputedStyle(HOST()).getPropertyValue('--sidebar'), 10) || PANEL_RESIZE_DEFAULT.sessions;
    const viewportMax = which === 'inspector' && window.innerWidth > 1040
      ? Math.max(min, window.innerWidth - sidebarWidth - 520)
      : configuredMax;
    const max = Math.min(configuredMax, viewportMax);
    const clamped = Math.min(max, Math.max(min, Math.round(px)));
    HOST().style.setProperty(PANEL_RESIZE_VAR[which], `${clamped}px`);
    return clamped;
  }

  function loadPanelWidths() {
    const saved = readSavedPanelWidths();
    for (const which of Object.keys(PANEL_RESIZE_VAR)) {
      if (typeof saved[which] === 'number') applyPanelWidth(which, saved[which]);
    }
  }

  function setupPanelResize() {
    $$('.panel-resize-handle').forEach((handle) => {
      const which = handle.dataset.resize;
      if (!PANEL_RESIZE_LIMITS[which]) return;
      const panel = which === 'sessions' ? sessionsPanel : inspectorPanel;

      handle.addEventListener('pointerdown', (event) => {
        if (window.innerWidth <= 1040) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        handle.classList.add('dragging');
        const startX = event.clientX;
        const startWidth = panel.getBoundingClientRect().width;

        function onMove(moveEvent) {
          const delta = which === 'sessions' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
          applyPanelWidth(which, startWidth + delta);
        }
        function onUp() {
          handle.classList.remove('dragging');
          handle.releasePointerCapture(event.pointerId);
          savePanelWidth(which, panel.getBoundingClientRect().width);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      handle.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const growsOnArrowRight = which === 'sessions';
        const sign = (event.key === 'ArrowRight') === growsOnArrowRight ? 1 : -1;
        const current = parseInt(getComputedStyle(HOST()).getPropertyValue(PANEL_RESIZE_VAR[which]), 10)
          || PANEL_RESIZE_DEFAULT[which];
        const next = applyPanelWidth(which, current + sign * 12);
        savePanelWidth(which, next);
      });
    });
  }

  /*
   * Owner 24/8, RIVISTO dopo l'architettura a shadow DOM: qui c'era un
   * listener 'backButton' scritto apposta, perché la pagina viveva da sola
   * (`window.location.assign`) e il tasto Indietro non tornava alla SPA né
   * usciva dall'app — vedi [[tocchi-reali-adb-obbligatori]] per come è
   * stato trovato. Montato dentro `HarnessSessionScreen.vue` invece, la
   * pagina non cambia mai: è la STESSA cronologia Vue Router già verificata
   * su `/memoria` (Indietro → `/`), niente da reinventare qui.
   */

  $('#modelLabRunButton')?.setAttribute('data-disabled-reason', 'Seleziona un runtime osservato e un modello');
  ensureDemoLabels();
  /*
   * ⛔⛔⛔ 27/8, owner: "il caricamento della pagina non deve azzerare le
   * sessioni in corso... se aggiorno adesso le sessioni passate spariscono".
   * Prima di questo fix la sidebar restava vuota fino alla PRIMA azione di
   * sessione (era un design deliberato per un motivo diverso — vedi il
   * commento di `aggiornaElencoSessioniReali` — ma un F5 non è mai
   * un'azione di sessione: azzerava la vista senza che il server avesse
   * perso niente). `setTimeout(…, 0)` invece di una chiamata diretta: un
   * boot sincrono non deve bloccarsi su una fetch di rete, e i test che
   * montano il runtime con un fetch finto restano sincroni fino alla loro
   * ultima asserzione — questa chiamata parte DOPO, non li tocca.
   * ⛔ Solo standalone: embedded (mobile, dentro HarnessSessionScreen.vue)
   * non ha oggi NESSUN backend raggiungibile (nessun tunnel adb reverse) —
   * stessa guardia già in uso per la Board (HARNESS-BOARD-MOBILE-HONESTY-01),
   * qui applicata alla lista sessioni: zero fetch fantasma su un bridge che
   * per costruzione non risponderà mai.
   */
  window.setTimeout(() => {
    // ⛔ verificato al MOMENTO del fire, non alla schedulazione: un test (o
    // un embed reale) può marcare talos-embedded fra i due istanti.
    if (!HOST().classList.contains('talos-embedded')) {
      apriWorkspaceDaLauncher();
      aggiornaElencoSessioniReali();
      renderAutomationsReali(); // ⭐ 27/8 — la card automazioni della sidebar è live da subito, non solo dopo aver aperto la vista
    }
  }, 0);
  aggiornaPillolaModello(); // ⭐ 27/8 — sincronizza SUBITO la pillola con lo stato vero (state.model === ''), invece di lasciare "gpt-5.6-sol · high" scritto a mano nell'HTML statico
  aggiornaPillolaPermessi();
  aggiornaPillolaAmbiente();
  applyQaState();
  syncNavigationState();
  syncInspectorToggle();
  syncSessionsToggle();
  loadPanelWidths();
  setupPanelResize();
  setupDialogResize();
  syncHostLayout();
  ensureDownloadQueueBadge();
  setQueueMode(false);
  setRunState(true);
  syncRunComposerState();
  setInspectorTab($('.inspector-tabs button.active'));
  renderReviewFile('composer');
  autoGrowTextarea();
  syncVisualViewport();
  /*
   * ⛔ 26/8 — provato e SCARTATO: aggiungere qui una chiamata a
   * aggiornaElencoSessioniReali() per sincronizzare la sidebar all'avvio.
   * Sembrava un buco (le sette funzioni di sessione la richiamano dopo
   * ogni azione, ma nessuna all'avvio), ma DUE test lo smentiscono:
   * CODE-COMPOSER-DEMO-SEND-01 (mount standalone, senza `talos-embedded`)
   * e HARNESS-BOARD-MOBILE-HONESTY-01 (mount embedded) pretendono ENTRAMBI
   * zero fetch al mount — non solo in embedded. È lo stesso principio
   * della Board (ensureSessionsBoard/refreshSessionsBoard, mai chiamate al boot,
   * solo al cambio vista): il boot non fa MAI una chiamata di rete propria,
   * a prescindere da standalone/embedded. Non un buco: design deliberato.
   */
  function ensureDownloadQueueBadge() {
    $('.view-pane[data-view="chat"] .model-lab-enhanced-controls')?.remove();
    const host = $('.topbar-right'); if (!host || $('#modelLabDownloadQueueBadge')) return;
    const badge = document.createElement('button'); badge.type = 'button'; badge.id = 'modelLabDownloadQueueBadge'; badge.className = 'context-chip model-lab-queue-badge'; badge.hidden = true; badge.textContent = '↓ 0'; badge.setAttribute('aria-label', 'Apri coda download');
    badge.addEventListener('click', () => { setSettingsSection('models'); setModelLabSection('downloads'); });
    host.insertBefore(badge, host.firstElementChild);
  }

  function renderizzaDownloadModelLab() {
    const mount = $('#modelLabDownloadsList'); const badge = $('#modelLabDownloadQueueBadge'); if (!mount) return;
    const active = state.modelLab.downloads.filter((item) => ['queued', 'running', 'verifying', 'paused', 'failed'].includes(item.state));
    if (badge) { badge.hidden = active.length === 0; badge.textContent = active.length ? `↓ ${active.length}` : '↓ 0'; }
    if (!state.modelLab.downloads.length) { mount.replaceChildren(textElement('p', 'model-lab-empty', 'Nessun download attivo.')); return; }
    mount.replaceChildren(...state.modelLab.downloads.map((item) => {
      const row = document.createElement('article'); row.className = 'model-lab-installed-item'; row.append(textElement('strong', '', `${item.id} · ${item.state} · ${item.progress ?? 0}%`), textElement('span', '', `${formattaByteModelLab(item.bytes)} / ${formattaByteModelLab(item.totalBytes)}`));
      const progress = document.createElement('progress'); progress.max = 100; progress.value = item.progress ?? 0; progress.setAttribute('aria-label', `Avanzamento ${item.id}`); row.append(progress);
      const actions = document.createElement('div'); actions.className = 'model-lab-installed-actions';
      if (['running', 'queued'].includes(item.state)) { const pause = document.createElement('button'); pause.className = 'secondary-btn compact'; pause.textContent = 'Pausa'; pause.addEventListener('click', async () => { await apiPost(`/api/v1/huggingface/downloads/${encodeURIComponent(item.id)}/pause`, {}); caricaDownloadModelLab(); }); actions.append(pause); }
      if (['paused', 'failed'].includes(item.state)) { const resume = document.createElement('button'); resume.className = 'secondary-btn compact'; resume.textContent = 'Riprendi'; resume.addEventListener('click', async () => { await apiPost(`/api/v1/huggingface/downloads/${encodeURIComponent(item.id)}/resume`, {}); caricaDownloadModelLab(); }); actions.append(resume); }
      if (!['ready', 'cancelled'].includes(item.state)) { const cancel = document.createElement('button'); cancel.className = 'secondary-btn compact'; cancel.textContent = 'Annulla'; cancel.addEventListener('click', async () => { await apiPost(`/api/v1/huggingface/downloads/${encodeURIComponent(item.id)}/cancel`, {}); caricaDownloadModelLab(); }); actions.append(cancel); }
      row.append(actions); return row;
    }));
  }

  // P1: dettaglio HF con stato di download agganciato allo stesso pulsante.
  /* ⛔⛔⛔ 02/9 — QA visiva dal vivo ha trovato che QUESTA era la
   * definizione "vincente" (le dichiarazioni di funzione in JS non
   * fanno errore su un nome duplicato: l'ultima nello stesso scope
   * sovrascrive le precedenti) — la riscrittura del ridisegno, molto
   * più in alto nel file, non veniva mai eseguita per davvero. Rimossa:
   * la versione attiva ora è quella del ridisegno (card `.hf-repo-card`,
   * stessa logica di download/set-incompleto/hash-mancante inline). */

  /*
   * ⭐⭐⭐ 02/9 — owner dal vivo: "quando ricarico la pagina bisogna che si
   * apra automaticamente ultima sessione disponibile". Non una chiamata
   * sincrona al mount: il commento sopra ensureDownloadQueueBadge()
   * documenta un vincolo TESTATO ("il boot non fa MAI una chiamata di
   * rete propria" — CODE-COMPOSER-DEMO-SEND-01, HARNESS-BOARD-MOBILE-
   * HONESTY-01) e quei test controllano fetchMock in modo SINCRONO
   * (zero tick) subito dopo il mount — un setTimeout, anche a 0ms, non
   * ha ancora girato in quel momento preciso, quindi resta compatibile:
   * verificato leggendo entrambi i test riga per riga, non presunto.
   * Mai nell'embedded mobile demo (nessun backend reale lì — stesso
   * principio del vincolo che questo commento cita).
   */
  window.setTimeout(() => {
    if (HOST().classList.contains('talos-embedded')) return;
    if (state.realSession.id) return; // già una sessione attiva per altra via (es. deep-link)
    apriUltimaSessioneDisponibileAllAvvio();
  }, 0);

  async function apriUltimaSessioneDisponibileAllAvvio() {
    let elenco;
    try { elenco = (await apiGet('/api/v1/sessions')).items; } catch { return; } // ⛔ un fallimento qui non è un'azione richiesta dall'utente, non merita un toast — resta lo stato vuoto onesto
    if (state.realSession.id) return; // ri-controllo: potrebbe essere cambiata durante l'attesa della fetch
    if (!Array.isArray(elenco) || elenco.length === 0) return;
    const ultima = [...elenco].sort((a, b) => new Date(b.avviataAlle).getTime() - new Date(a.avviataAlle).getTime())[0];
    if (!ultima) return;
    passaASessione(ultima.sessionId, ultima.taskId, ultima.nome, ultima.modello, ultima);
  }
})();
