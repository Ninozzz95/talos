import { creaForgeRow, aggiornaPaginaOfficina } from '../components/officina.js'; // 05/9 Fase 2: Officina
import { creaReportRow, aggiornaPaginaRicerca } from '../components/ricerca.js'; // 05/9 Fase 2: Ricerca
import { creaLibraryRow, aggiornaPaginaLibreria } from '../components/libreria.js'; // 05/9 Fase 2: Libreria
import { creaTaskRow, aggiornaPaginaAttivita } from '../components/attivita.js'; // 05/9 Fase 2: Attività
import { creaMemoryRow, aggiornaPaginaMemoria } from '../components/memoria.js'; // 05/9 Fase 2: Memoria
import { aggiornaBoard, creaRigaBoard, cartellaDaExport } from '../components/board.js'; // 05/9 Fase 2: Board
import { aggiornaConteggiNav } from '../components/nav-item.js'; // 05/9 Fase 2: NavItem — i badge dei Luoghi sono dati veri
import { creaSessionItem, statoSessione } from '../components/session-item.js';
import { aggiungiGiroAllaSpine, creaApprovazione, creaArtefatto, creaAttesa, creaAttivita, creaAzioniMessaggio, creaMessaggioTalos, creaMessaggioUtente, creaNotaSistema, creaRigaAttrezzo, creaTurno, impostaDiffAttivita, impostaEsitoRiga, impostaTonoUltimoTick, oraMessaggio } from '../components/conversazione.js'; // 05/9 Fase 2: Conversazione — i blocchi della chat sono quelli del mockup
import { aggiornaPiedeChat, etichettaPermesso } from '../components/chat-foot.js'; // 05/9 Fase 2: ChatFooter — striscia del giro, chip e barra di stato dai dati
import { aggiornaDiffReview, creaRigaFileReview, nascondiAzioniFase3, riassuntoReview } from '../components/review.js'; // 05/9 Fase 2: Review — elenco dei file e diff nel disegno del mockup
import { creaStatoVuoto, suggerimentiDallaCartella } from '../components/stato-vuoto.js'; // 05/9 Fase 2: EmptyState — lo stato vuoto del mockup, dai fatti della cartella
import { aggiornaTopbar } from '../components/topbar.js'; // 05/9 Fase 2: Topbar — titolo, percorso e conteggi delle schede dai dati
import { aggiornaWorkspaceFooter, testiPiede as testiPiedeWorkspace } from '../components/workspace-footer.js'; // 05/9 Fase 2: WorkspaceFooter — il piede della sidebar dice cartella, tema e chi serve il modello // 05/9 Fase 2: SessionItem — la riga della sidebar è un componente del mockup

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
    // ⭐ 04/9, R-02 — la persona ha DECISO cosa TALOS può fare da solo (gesto sulla scheda, non valore: vedi intro). Persistito nelle preferenze chat.
    autonomiaScelta: false,
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
      metriche: {}, cartelle: {}, cartelleCaricate: false, cartelleRichieste: false,
      caricamento: false, metricheInCaricamento: false, cartelleInCaricamento: false, errore: null, avviso: null,
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
      /*
       * ⭐ 03/9 — le tre schede del dettaglio Hugging Face (come sul mobile),
       * il catalogo caricato all'apertura, e la stima per variante.
       * ⛔ `hfStima` è per-repository e va azzerata scegliendone un altro: un
       * verdetto rimasto da un modello diverso sarebbe la stessa attribuzione
       * sbagliata gia' curata oggi sull'n_ctx del runtime.
       */
      hfDetailTab: 'quantizzazioni', hfCatalogoIniziale: false, hfStima: null,
      /** ⭐ 03/9 — quali schede provider sono aperte, e l'esito della prova per ciascuno. */
      providerAperti: new Set(), provePr: new Map(),
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
      /**
       * ⭐⭐⭐ 03/9 — "risali fuori dalla sessione", owner: "a prescindere da
       * full access o meno". SEPARATA da treeCache/treeOpen apposta: quella
       * cache è per-livello dentro la cartella della sessione (leggiAlberoWorkspace,
       * legata al confine di scrittura del modello); questa è UN solo
       * livello alla volta di workspaceBrowser (sola lettura, radice disco
       * intero) — due fonti dati diverse, mai la stessa cache.
       */
      fuoriSessioneAperto: false,
      fuoriSessionePercorso: null,
      fuoriSessioneDati: null,
      /** Progetto allowlistato mostrato in sola lettura prima del primo messaggio. */
      previewProjectId: null,
      previewWorkspaceName: null,
      /** Piano §1.3-BIS.T — toolCallId -> nome attrezzo, SOLO per riconoscere quando un ToolCallResult appartiene a "shell" e specchiarlo nella vista Terminale. Non tocca il rendering generico della chat, già esistente. */
      toolCallNomi: new Map(),
      /**
       * ⭐⭐⭐ 3/9 — item 10 (fix UI, desktop): il bersaglio dell'ULTIMO
       * attrezzo del giro, per il suggerimento nel composer. Catturato al
       * ToolCallResult, PRIMA che `toolCallNomi.delete()` lo faccia
       * sparire — RunFinished arriva sempre dopo l'ultimo ToolCallResult,
       * quindi a quel punto la Map è già vuota per il giro appena
       * concluso. Stessa idea di `ultimoBatchChiuso` qui sopra: un
       * riferimento preso PRIMA della pulizia, non ricostruito dopo.
       */
      ultimoBersaglioAttrezzo: null,
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
      /**
       * ⭐⭐⭐ O-02 (04/9) — il registro degli eventi di attrezzo di QUESTA
       * sessione: `{type, toolCallId, toolCallName?, delta?}`, riempito in
       * un punto solo dentro handleRealEvent (dopo il dedup `_sequenza`, mai
       * due volte lo stesso evento su una riconnessione SSE). Serve alla
       * diagnosi di «giri esauriti» e al riepilogo per attrezzo del
       * Capability hub. ⛔ Del `ToolCallResult` si tiene SOLO l'id: il suo
       * `content` può essere enorme, e per contare non serve.
       */
      eventiAttrezzi: [],
      /**
       * ⭐⭐⭐ O-02 (04/9) — il tetto dei giri che il KERNEL ha dichiarato nel
       * suo messaggio d'errore («24 su 24»). `null` finché nessuno l'ha
       * detto: il client non lo sa e non lo inventa. Vedi tettoGiriDaMessaggio.
       */
      tettoGiriDichiarato: null,
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
  const introDialog = $('#introDialog'); // ⭐ 04/9, R-02 — intro al primo avvio (modale nativa, vedi costruisciIntroPrimoAvvio)
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
    /*
     * ⭐ 05/9, fase 1: il mockup segna il luogo corrente con `aria-current`
     * sui `[data-vaia]` della sidebar e con `aria-selected` sulle viste della
     * testata (`[data-vistetab] [role=tab]`). Stessa mappa vista→schermo di
     * `setView`, tenuta qui in un posto solo.
     */
    const schermoCorrente = document.documentElement.getAttribute('data-schermo');
    $$('.talos-sidebar [data-vaia]').forEach((voce) => {
      if (voce.dataset.vaia === schermoCorrente) voce.setAttribute('aria-current', 'page');
      else voce.removeAttribute('aria-current');
    });
    $$('[data-vistetab] [role="tab"]').forEach((tab) => {
      const attiva = tab.dataset.vaia === schermoCorrente;
      tab.setAttribute('aria-selected', String(attiva));
      tab.tabIndex = attiva ? 0 : -1;
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
    /*
     * ⭐⭐⭐ 05/9, fase 1 del piano «il mockup diventa la app»: le viste sono
     * le schermate del mockup, che si mostrano con `hidden` e con i due
     * attributi di radice che la regia del mockup scrive — `data-vista`
     * («sessione» per chat/vuota/terminale/review, «pagina» per il resto:
     * `:root[data-vista="pagina"]` nasconde la colonna dei dettagli e cambia
     * la griglia) e `data-schermo`. È ESATTAMENTE `mostra()` del mockup,
     * fatto qui perché `setView` è il solo posto da cui si naviga.
     */
    views.forEach((pane) => { pane.hidden = pane !== target; });
    const SCHERMO_PER_VISTA = { chat: 'chat', vuota: 'vuota', terminal: 'terminale', diff: 'review', capability: 'capability', dashboard: 'board', memoria: 'memoria', attivita: 'attivita', settings: 'impostazioni', doctor: 'doctor', libreria: 'libreria', ricerca: 'ricerca', officina: 'officina', automations: 'automazioni', browser: 'browser' };
    const schermo = SCHERMO_PER_VISTA[view] || view;
    document.documentElement.setAttribute('data-vista', ['chat', 'vuota', 'terminale', 'review', 'browser'].includes(schermo) ? 'sessione' : 'pagina');
    document.documentElement.setAttribute('data-schermo', schermo);
    syncNavigationState();
    target.scrollTop = 0;
    resetEmbeddedTopbarScroll(view === 'chat' ? chatConversation : target);
    window.__talosHarnessHostViewChange?.(view);
    if (view === 'settings') inizializzaModelLab();
    if (view === 'dashboard') ensureSessionsBoard();
    if (view === 'ricerca') caricaPannelloRicerca({ pagina: true }); // 05/9 Fase 2: attiva la sola pagina Ricerca
    if (view === 'officina') caricaPannelloForge({ pagina: true }); // 05/9 Fase 2: pagina Officina
    if (view === 'libreria') caricaPannelloLibreria({ pagina: true }); // 05/9 Fase 2: attiva la sola pagina Libreria
    if (view === 'attivita') caricaPannelloAttivita({ pagina: true }); // 05/9 Fase 2: attiva la sola pagina Attività
    if (view === 'memoria') caricaPannelloMemoria({ pagina: true }); // 05/9 Fase 2: attiva la sola pagina Memoria
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
    ricordaCollasso('inspectorCollapsed', appShell.classList.contains('inspector-collapsed')); // 05/9 Fase 2: si ricorda
    riclampaComposerUserSized(); // ⭐ 3/9 — item 10: la colonna del context rail è appena cambiata, il tetto del composer con lei
  }

  // Owner 24/8: la sidebar sessioni comprimibile quanto l'inspector — stesso
  // schema esatto, un solo pulsante desktop-only, nessuna scorciatoia nuova.
  function syncSessionsToggle() {
    const expanded = window.innerWidth <= 1040 || !appShell.classList.contains('sessions-collapsed');
    sessionsCollapseBtn?.setAttribute('aria-expanded', String(expanded));
    // 05/9 Fase 2 (owner: «le due sidebar devono essere collassabili»): la barra compressa e' la modalita' a icone del mockup
    if (expanded) document.documentElement.removeAttribute('data-sidebar'); else document.documentElement.setAttribute('data-sidebar', 'icone');
  }

  /** 05/9 Fase 2 — i collassi delle due colonne si ricordano nella chiave del contratto delle larghezze (talos-harness-panel-widths). */
  function ricordaCollasso(campo, valore) {
    try {
      const saved = readSavedPanelWidths();
      if (valore) saved[campo] = true; else delete saved[campo];
      window.localStorage.setItem(PANEL_RESIZE_STORAGE_KEY, JSON.stringify(saved));
    } catch { /* storage negato: si parte espansi la prossima volta, nessun crash */ }
  }

  function toggleSessionsPanel() {
    if (window.innerWidth <= 1040) {
      openPanel('sessions');
      return;
    }
    appShell.classList.toggle('sessions-collapsed');
    syncSessionsToggle();
    ricordaCollasso('sessionsCollapsed', appShell.classList.contains('sessions-collapsed')); // 05/9 Fase 2: si ricorda (solo su gesto della persona)
    riclampaComposerUserSized(); // ⭐ 3/9 — item 10: stesso motivo del gemello per l'inspector — la colonna della lista sessioni è appena cambiata
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
  /**
   * ⛔⛔ 04/9 — O-02: `tettoGiri` è il tetto DICHIARATO dal kernel nel suo
   * stesso messaggio d'errore (vedi tettoGiriDaMessaggio), mai una costante
   * scritta qui: `GIRI_MASSIMI` vive in talosHarness.mjs e non è esportato,
   * quindi finché nessuno lo dichiara si mostrano i giri usati e basta —
   * un «12 su 24» inventato sarebbe uno stato inventato come un altro.
   */
  function formattaUsageBreve(usage, { live = false, finita = false, tettoGiri = null } = {}) {
    if (!usage) return finita ? 'consumo non registrato' : 'contesto ignoto · in attesa del primo giro'; // 02/09 — una sessione finita non "aspetta" niente
    const prompt = Number(usage.prompt_tokens ?? 0) || 0;
    const completion = Number(usage.completion_tokens ?? 0) || 0;
    const cache = Number(usage.cached_tokens ?? 0) || 0;
    const totale = prompt + completion;
    const kilo = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    const cacheParte = cache > 0 ? ` · cache ${kilo(cache)}` : '';
    const tetto = Number.isFinite(tettoGiri) && tettoGiri > 0 ? ` su ${tettoGiri}` : '';
    return `${kilo(totale)} token · ${usage.giri} gir${usage.giri === 1 ? 'o' : 'i'}${tetto}${cacheParte}${live ? ' · live' : ''}`;
  }

  /*
   * ═══════════ O-02 (04/9) — «giri esauriti» deve dire CHI li ha consumati ═══
   *
   * Owner: «vedi perché mi spunta spesso `TALOS · errore [giri-esauriti] ⛔
   * giri esauriti: 24 su 24 usati senza chiudere il task` con modello locale
   * e probabilmente su modelli a chiave».
   *
   * Misurato sui file VERI di `.sessions-store` (71 sessioni con conteggio
   * giri, 742 chiamate ad attrezzi ricostruite per `toolCallId`): le 7 che
   * hanno toccato il tetto fanno 37,9 chiamate in media contro 7,5 delle
   * altre; `shell` è il 51% delle chiamate, poi `cerca` 20%, `leggi` 15%,
   * `elenca` 11%; e 71 su 742 (9,6%) sono IDENTICHE a una precedente della
   * stessa sessione — `elenca` il 35%, `leggi` 14%, `cerca` 12%. In una
   * sessione con modello LOCALE (unsloth-gpt-oss-20b) sono 18 su 69: il
   * modello rifaceva lo stesso `unzip -Z1 ...` giro dopo giro.
   *
   * ⇒ La bolla di oggi dice solo «tetto raggiunto»: vero e inutilizzabile.
   * Qui si costruisce la diagnosi dagli eventi che il client ha GIÀ
   * (ToolCallStart/Args/Result passano tutti da handleRealEvent).
   *
   * ⭐ Lo scalino in più sullo stato dell'arte: Hermes Agent porta il suo
   * budget a 500 iterazioni (v0.20, default oggi) e sa fermarsi con un
   * riassunto, ma né la deduplica delle chiamate identiche (issue #18076)
   * né l'avviso prima del tetto (#414) sono implementati — restano aperti.
   * Claude Code, allo stesso limite, dice solo «reached its tool-use limit
   * for this turn». Nessuno dei due dice QUALI attrezzi hanno consumato il
   * budget né quante chiamate erano ripetizioni: è questo il +1 misurabile.
   *
   * ⛔ Misura sbagliata da non ripetere: contare i frammenti `ToolCallArgs`
   * (lo streaming li spezza; nello store persistito arrivano perfino PRIMA
   * del loro `ToolCallStart`). Gli argomenti si ricostruiscono per
   * `toolCallId` accumulando i delta — è esattamente quello che fa
   * riassuntoAttrezziDaEventi, e un test lo prova con l'ordine invertito.
   */

  /**
   * ⛔⛔⛔ owner 04/9, vincolante: «nella UI non compaiono nomi tecnici degli
   * attrezzi». Questa è LA mappa nome-tecnico → nome-umano, in un posto solo
   * — mai una seconda copia sparsa in un template o in una stringa.
   * ⛔ Ripiego ONESTO: un attrezzo che non conosciamo (ne nascono, vedi
   * `tool_create`) mostra il suo nome grezzo, mai un'etichetta inventata.
   * ⛔ I nomi che il MODELLO riceve non cambiano di una lettera: quelli sono
   * il contratto col kernel (ATTREZZI_OPENAI in talosHarness.mjs) e la loro
   * unica fonte resta il server. Qui si traduce solo ciò che si SCRIVE a
   * schermo; il nome tecnico resta come dettaglio secondario nel title.
   */
  function nomeUmanoAttrezzo(nome) {
    const UMANI = {
      elenca: 'elenco della cartella',
      cerca: 'ricerca nei file',
      leggi: 'lettura di un file',
      scrivi: 'scrittura di un file',
      prova: 'esecuzione dei test',
      shell: 'comando nel terminale',
      naviga: 'apertura di una pagina web',
      web_search: 'ricerca sul web',
      artifact_create: 'creazione di un artefatto',
      document_create: 'creazione di un documento',
      generate_image: 'generazione di un’immagine',
      delega_sottotask: 'delega a un sotto-agente',
      time_now: 'data e ora',
      tool_create: 'creazione di un attrezzo nuovo',
      library_list: 'elenco della Libreria',
      library_search: 'ricerca in Libreria',
      library_read: 'lettura di un file di Libreria',
      library_file_origin: 'origine di un file di Libreria',
      library_rename: 'rinomina di un file di Libreria',
      library_delete: 'eliminazione di un file di Libreria',
      library_export: 'copia di un file di Libreria nel workspace',
      library_context_policy_update: 'regole d’uso della Libreria',
      notes_list: 'elenco delle note',
      notes_create: 'scrittura di una nota',
      notes_update: 'modifica di una nota',
      notes_delete: 'eliminazione di una nota',
      tasks_list: 'elenco delle attività',
      tasks_create: 'creazione di un’attività',
      tasks_complete: 'chiusura di un’attività',
      tasks_update: 'modifica di un’attività',
      tasks_delete: 'eliminazione di un’attività',
      memory_search: 'ricerca nella memoria',
      memory_write: 'scrittura in memoria',
      memory_update: 'correzione di una memoria',
      memory_delete: 'eliminazione di una memoria',
      research_list: 'elenco delle ricerche',
      research_start: 'avvio di una ricerca approfondita',
      research_read: 'lettura del rapporto di ricerca',
      research_rename: 'rinomina di una ricerca',
      research_pause: 'pausa di una ricerca',
      research_resume: 'ripresa di una ricerca',
      research_cancel: 'annullamento di una ricerca',
      research_delete: 'eliminazione di una ricerca',
    };
    return UMANI[nome] || String(nome ?? '');
  }

  /** Serializzazione stabile (chiavi ordinate, ricorsiva): due argomenti equivalenti scritti diversi devono dare la STESSA chiave. */
  function chiaveStabile(valore) {
    if (Array.isArray(valore)) return `[${valore.map((v) => chiaveStabile(v)).join(',')}]`;
    if (valore && typeof valore === 'object') return `{${Object.keys(valore).sort().map((k) => `${JSON.stringify(k)}:${chiaveStabile(valore[k])}`).join(',')}}`;
    return JSON.stringify(valore) ?? 'null';
  }

  /** L'identità di una chiamata: attrezzo + argomenti normalizzati. ⛔ Argomenti non-JSON (troncati) valgono per la loro stringa grezza, mai un errore. */
  function chiaveChiamataAttrezzo(nome, argomentiGrezzi) {
    const grezzo = String(argomentiGrezzi ?? '').trim();
    let normalizzato = grezzo;
    try { normalizzato = chiaveStabile(JSON.parse(grezzo)); } catch { /* delta incompleto o argomenti malformati: la stringa grezza è comunque un'identità onesta */ }
    return `${nome}\u0000${normalizzato}`;
  }

  /**
   * Quante chiamate ad attrezzi ha fatto questa sessione, per attrezzo, e
   * quante erano identiche a una precedente.
   * ⛔ `registrato:false` quando non c'è NESSUN evento di attrezzo (sessione
   * vecchia, interrotta, o cronologia senza tool-call): «non registrato» non
   * è «zero», e chi legge il testo non deve poterli confondere.
   * @param {Array<object>|null|undefined} eventi
   * @returns {{registrato:boolean, chiamate:number, ripetute:number, perAttrezzo:Array<{nome:string,chiamate:number,ripetute:number}>}}
   */
  function riassuntoAttrezziDaEventi(eventi) {
    const perId = new Map();
    const ordine = [];
    for (const evento of eventi || []) {
      const tipo = evento?.type;
      if (tipo !== 'ToolCallStart' && tipo !== 'ToolCallArgs' && tipo !== 'ToolCallResult') continue;
      const id = evento.toolCallId;
      if (typeof id !== 'string' || id === '') continue;
      if (!perId.has(id)) { perId.set(id, { nome: null, argomenti: '' }); ordine.push(id); }
      const voce = perId.get(id);
      // ⛔ Lo Start NON azzera gli argomenti: nello store persistito un delta può precederlo, e azzerare qui perderebbe il primo `{`.
      if (tipo === 'ToolCallStart') voce.nome = typeof evento.toolCallName === 'string' ? evento.toolCallName : voce.nome;
      else if (tipo === 'ToolCallArgs' && typeof evento.delta === 'string') voce.argomenti += evento.delta;
    }
    const perAttrezzo = new Map();
    const viste = new Set();
    let chiamate = 0;
    let ripetute = 0;
    for (const id of ordine) {
      const voce = perId.get(id);
      if (!voce.nome) continue; // args/result orfani: nessuno Start, nessun nome — mai un attrezzo inventato
      chiamate += 1;
      const conto = perAttrezzo.get(voce.nome) || { nome: voce.nome, chiamate: 0, ripetute: 0 };
      conto.chiamate += 1;
      const chiave = chiaveChiamataAttrezzo(voce.nome, voce.argomenti);
      if (viste.has(chiave)) { ripetute += 1; conto.ripetute += 1; } else viste.add(chiave);
      perAttrezzo.set(voce.nome, conto);
    }
    return {
      registrato: chiamate > 0,
      chiamate,
      ripetute,
      perAttrezzo: [...perAttrezzo.values()].sort((a, b) => b.chiamate - a.chiamate || a.nome.localeCompare(b.nome)),
    };
  }

  /** La diagnosi in una riga: i primi tre attrezzi col conteggio, e quante chiamate erano ripetizioni. */
  function testoDiagnosiGiri(riassunto) {
    if (!riassunto || !riassunto.registrato) return 'Attrezzi non registrati per questa sessione: la sua cronologia non porta nessun evento di attrezzo.';
    // ⛔ owner 04/9: a schermo l'attrezzo si chiama col suo nome UMANO, mai `web_search`/`time_now` — vedi nomeUmanoAttrezzo, unica mappa.
    const primi = riassunto.perAttrezzo.slice(0, 3).map((a) => `${nomeUmanoAttrezzo(a.nome)} ${a.chiamate}`).join(', ');
    // ⛔ 04/9, letto nello screenshot della corsa `qa-giri-esauriti-diagnosi`: «, altri 2» si legge come «altre 2 CHIAMATE». Sono altri ATTREZZI, e va detto.
    const coda = riassunto.perAttrezzo.length > 3 ? `, e altri ${riassunto.perAttrezzo.length - 3} attrezzi` : '';
    const conRipetizioni = riassunto.perAttrezzo.filter((a) => a.ripetute > 0).sort((a, b) => b.ripetute - a.ripetute || a.nome.localeCompare(b.nome));
    const ripetizioni = riassunto.ripetute > 0
      ? `${riassunto.ripetute} identiche a una precedente (${conRipetizioni.slice(0, 3).map((a) => `${nomeUmanoAttrezzo(a.nome)} ${a.ripetute}`).join(', ')})`
      : 'nessuna identica a una precedente';
    return `${riassunto.chiamate} chiamate ad attrezzi: ${primi}${coda} · ${ripetizioni}`;
  }

  /** Cosa può fare la persona ADESSO — dedotto dai numeri misurati, mai una frase fissa. */
  function consiglioDaRiassunto(riassunto) {
    if (!riassunto || !riassunto.registrato) return 'Nel prossimo messaggio chiedi un passo solo: il tetto vale per giro, non per sessione.';
    const quotaRipetute = riassunto.chiamate > 0 ? riassunto.ripetute / riassunto.chiamate : 0;
    const primo = riassunto.perAttrezzo[0];
    if (quotaRipetute >= 0.15) return `${riassunto.ripetute} chiamate erano già state fatte identiche: indica tu i percorsi da guardare, così i giri non tornano sugli stessi file.`;
    if (primo && primo.chiamate / riassunto.chiamate >= 0.4) return `${primo.chiamate} chiamate su ${riassunto.chiamate} sono andate a «${nomeUmanoAttrezzo(primo.nome)}»: chiedi un passo più stretto, o dai tu il comando o il percorso giusto.`;
    return 'Nel prossimo messaggio chiedi un passo solo: il tetto vale per giro, non per sessione.';
  }

  /**
   * Il tetto dei giri, letto dalle parole del kernel («giri esauriti: 24 su
   * 24 …», comeSonoFinitiIGiri in talosHarness.mjs).
   * ⛔ È l'UNICA fonte del tetto lato client: `GIRI_MASSIMI` (24) e
   * `GIRI_MASSIMI_PLANNER` (8) sono `const` NON esportate del kernel, e
   * `/usage` non le porta — vedi la richiesta al kernel nel resoconto O-02.
   */
  function tettoGiriDaMessaggio(messaggio) {
    const trovato = /giri esauriti:\s*(\d+)\s+su\s+(\d+)/i.exec(String(messaggio ?? ''));
    if (!trovato) return null;
    const tetto = Number(trovato[2]);
    return Number.isFinite(tetto) && tetto > 0 ? tetto : null;
  }

  /** Ripatcha la riga "Main" del foglio Albero sessione SE è già aperto — non riapre né forza un redraw di tutto il foglio, stesso principio di aggiornaPillolaModello(). */
  function aggiornaContatoreUsage() {
    const nodo = $('[data-usage-summary]');
    if (nodo) nodo.textContent = `Main · ${formattaUsageBreve(state.realSession.usage, { live: true, tettoGiri: state.realSession.tettoGiriDichiarato })}`;
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

  // 05/9 Fase 2: Board — righe e comandi nel DataTable approvato.
  function creaRigaSessioneBoard(sessione) {
    return creaRigaBoard(sessione, {
      metriche: state.board.metriche[sessione.sessionId],
      onApri: s => passaASessione(s.sessionId, s.taskId, s.nome, s.modello, s),
      onMenu: (s, punto) => apriMenuAzioniSessione(s, punto),
    });
  }

  function renderSessionsBoard(sessioni) {
    const schermo = $('#schermoBoard');
    if (!schermo) return;
    aggiornaBoard(schermo, sessioni, {
      metriche: state.board.metriche, cartelle: state.board.cartelle,
      cartelleCaricate: state.board.cartelleCaricate,
      caricamento: state.board.caricamento,
      metricheInCaricamento: state.board.metricheInCaricamento,
      cartelleInCaricamento: state.board.cartelleInCaricamento,
      errore: state.board.errore, avviso: state.board.avviso,
      onApri: s => passaASessione(s.sessionId, s.taskId, s.nome, s.modello, s),
      onMenu: (s, punto) => apriMenuAzioniSessione(s, punto),
      onAggiorna: refreshSessionsBoard,
      onCartelle: caricaCartelleSessioniBoard,
    });
    const badge = sessionsBoardList.closest('[data-demo-surface="board"]')?.querySelector('.demo-surface-badge');
    if (badge) badge.hidden = true;
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

  /**
   * ⭐⭐⭐ 03/9 — la scheda Provider, ridisegnata. Owner: «è bruttissima, i
   * collabs si aprono in una maniera orrenda».
   *
   * ## I nove difetti annotati guardandola, e come muoiono qui
   *
   * 1. Griglia a DUE COLONNE che si spezzava aprendo una card: quella aperta
   *    prendeva tutta la larghezza e la vicina restava a metà, con un salto
   *    violento. ⇒ UNA colonna sola, come fa il mobile
   *    (`TalosMobileProviderRuntimePanel.vue`): aprire non può rompere una
   *    griglia che non c'è.
   * 2. Il badge «Motore provider in preparazione» andava a capo tre volte e
   *    si sovrapponeva alla nota di sicurezza. ⇒ Via: al suo posto un'azione
   *    vera, «Prova tutti».
   * 3. «in preparazione» in fondo alla card, minuscolo e senza spiegazione.
   *    ⇒ Lo stato ora è MISURATO, non dichiarato a mano.
   * 4. Etichette a sinistra e campi a destra, con duecento pixel di vuoto in
   *    mezzo da attraversare con l'occhio. ⇒ Etichetta SOPRA il campo.
   * 5. «Salva chiave» e «Rimuovi» con lo stesso peso visivo, e sono azioni
   *    opposte. ⇒ Una primaria, una silenziosa in fondo.
   * 6. «Salva collegamento» come terzo livello di gerarchia. ⇒ Un solo
   *    gruppo di azioni.
   * 7. ⛔ NESSUNA prova che la chiave funzionasse: «chiave presente» dice che
   *    una stringa è stata salvata, non che il provider la accetti. Sono due
   *    cose diverse e la seconda è l'unica che interessa. ⇒ La prova esiste
   *    ed è reale (`POST /providers/:id/test`).
   * 8. Sette card identiche da scandire leggendo. ⇒ Una tessera col
   *    monogramma. ⛔ Non i loghi altrui: nessun marchio vendorizzato.
   * 9. «Chiave presente» in AMBRA: l'accento speso per uno stato neutro
   *    smette di significare «azione». ⇒ L'ambra resta ai bottoni, e il verde
   *    appare SOLO quando il provider ha risposto davvero.
   *
   * ## L'elemento per cui questa schermata esiste
   *
   * Lo stato in TRE SEGMENTI — chiave · indirizzo · prova — leggibile nella
   * riga CHIUSA. La domanda vera non è «quali provider ho configurato», è
   * «quali possono far girare un modello adesso, e agli altri cosa manca».
   * Con tre segmenti la risposta si legge senza aprire niente, e senza
   * dipendere dal colore: ogni segmento porta anche la parola.
   */
  const SEGNI_PROVIDER = Object.freeze({ ok: '\u25CF', mancante: '\u25CB', rotto: '\u2715' });
  /** Il monogramma: due lettere dal nome del provider, non un logo. */
  function monogrammaProvider(row) {
    const parole = String(row.label || row.id).split(/[^A-Za-z0-9]+/u).filter(Boolean);
    return (parole.length > 1 ? parole[0][0] + parole[1][0] : String(row.label || row.id).slice(0, 2)).toUpperCase();
  }
  function segmentoProvider(stato, testo) {
    const nodo = textElement('span', 'provider-seg', SEGNI_PROVIDER[stato] + ' ' + testo);
    nodo.dataset.seg = stato;
    return nodo;
  }
  function renderizzaProviderModelLab() {
    const rows = Array.isArray(state.modelLab.providers) ? state.modelLab.providers : [];
    const status = $('#modelLabProviderStatus');
    if (status) {
      if (state.modelLab.providerError) status.textContent = 'Stato provider non disponibile';
      else if (state.modelLab.loadingProviders) status.textContent = 'Stato provider in lettura…';
      else {
        /*
         * ⛔ Il conto che conta è quello dei provider PROVATI e collegati, non
         * di quelli con una stringa salvata: è esattamente la differenza che
         * questa schermata esiste per mostrare.
         */
        const provati = rows.filter((row) => state.modelLab.provePr?.get(row.id)?.esito === 'collegato').length;
        const conChiave = rows.filter((row) => row.keyConfigured).length;
        status.textContent = provati > 0
          ? `${provati} provider collegat${provati === 1 ? 'o' : 'i'} · ${conChiave} con chiave`
          : (conChiave > 0 ? `${conChiave} con chiave · nessuno ancora provato` : 'Nessun accesso configurato');
      }
    }
    const lista = $('#providerList');
    if (!lista) return;
    if (state.modelLab.providerError) { lista.replaceChildren(textElement('p', 'model-lab-empty', state.modelLab.providerError.message)); return; }
    if (rows.length === 0) { lista.replaceChildren(textElement('p', 'model-lab-empty', state.modelLab.loadingProviders ? 'Leggo gli accessi…' : 'Nessun provider dichiarato dal server.')); return; }

    lista.replaceChildren(...rows.map((row) => {
      const prova = state.modelLab.provePr?.get(row.id) || null;
      const aperta = state.modelLab.providerAperti?.has(row.id);
      const card = document.createElement('article');
      card.className = 'provider-row';
      card.dataset.providerId = row.id;
      if (prova) card.dataset.provaEsito = prova.esito;

      const testa = document.createElement('button');
      testa.type = 'button';
      testa.className = 'provider-row-head';
      testa.setAttribute('aria-expanded', String(Boolean(aperta)));
      testa.dataset.providerToggle = row.id;
      const tessera = textElement('span', 'provider-mark', monogrammaProvider(row));
      tessera.setAttribute('aria-hidden', 'true');
      const centro = document.createElement('span');
      centro.className = 'provider-row-main';
      centro.append(textElement('strong', 'provider-row-name', row.label || row.id));
      const segmenti = document.createElement('span');
      segmenti.className = 'provider-segments';
      // 1 — la chiave. Chi non la richiede non ha un segmento vuoto: ha «non serve».
      if (!row.requiresKey) segmenti.append(segmentoProvider('ok', 'chiave non serve'));
      else segmenti.append(segmentoProvider(row.keyConfigured ? 'ok' : 'mancante', row.keyConfigured ? 'chiave' : 'chiave mancante'));
      // 2 — l'indirizzo, solo per chi lo espone: mostrarlo agli altri sarebbe una casella non riempibile.
      if (row.supportsEndpoint) segmenti.append(segmentoProvider(row.endpoint ? 'ok' : 'mancante', row.endpointConfigured ? 'indirizzo tuo' : (row.endpoint ? 'indirizzo predefinito' : 'indirizzo mancante')));
      // 3 — la prova: l'unico segmento che parla del PROVIDER e non di noi.
      if (!prova) segmenti.append(segmentoProvider('mancante', 'mai provato'));
      else if (prova.esito === 'in-corso') segmenti.append(segmentoProvider('mancante', 'sto chiedendo…'));
      else if (prova.esito === 'collegato') segmenti.append(segmentoProvider('ok', prova.modelli === null ? 'collegato' : `${prova.modelli} modelli`));
      else segmenti.append(segmentoProvider('rotto', prova.esito === 'non-autorizzato' ? 'credenziale rifiutata' : prova.esito === 'irraggiungibile' ? 'non raggiungibile' : prova.esito));
      centro.append(segmenti);
      const freccia = document.createElement('span');
      freccia.className = 'provider-row-chevron';
      freccia.innerHTML = icon('i-chevron');
      testa.append(tessera, centro, freccia);
      card.append(testa);

      if (!aperta) return card;

      const corpo = document.createElement('div');
      corpo.className = 'provider-row-body';
      if (row.requiresKey || row.keyConfigured) {
        const campo = document.createElement('label');
        campo.className = 'provider-field';
        campo.append(textElement('span', 'provider-field-label', row.keyConfigured ? 'Sostituisci la chiave' : 'Chiave API'));
        const input = document.createElement('input');
        input.type = 'password';
        input.className = 'sheet-input';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = row.keyConfigured ? 'Incolla una chiave nuova per sostituirla' : 'Incolla la chiave';
        input.dataset.providerKey = row.id;
        campo.append(input);
        corpo.append(campo);
      }
      if (row.supportsEndpoint) {
        const campo = document.createElement('label');
        campo.className = 'provider-field';
        campo.append(textElement('span', 'provider-field-label', 'Indirizzo del servizio'));
        const input = document.createElement('input');
        input.type = 'url';
        input.className = 'sheet-input provider-endpoint-input';
        input.value = row.endpoint || '';
        input.dataset.providerEndpoint = row.id;
        campo.append(input);
        corpo.append(campo);
      }
      const campoTempo = document.createElement('label');
      campoTempo.className = 'provider-field provider-field-narrow';
      campoTempo.append(textElement('span', 'provider-field-label', 'Tempo massimo (secondi)'));
      const tempo = document.createElement('input');
      tempo.type = 'number'; tempo.min = '5'; tempo.max = '300';
      tempo.className = 'sheet-input';
      tempo.value = String(row.timeoutSeconds || 60);
      tempo.dataset.providerTimeout = row.id;
      campoTempo.append(tempo);
      corpo.append(campoTempo);

      const azioni = document.createElement('div');
      azioni.className = 'provider-actions';
      const salva = document.createElement('button');
      salva.type = 'button'; salva.className = 'primary-btn compact'; salva.dataset.providerAction = 'save-key'; salva.textContent = 'Salva chiave';
      const provaBtn = document.createElement('button');
      provaBtn.type = 'button'; provaBtn.className = 'secondary-btn compact'; provaBtn.dataset.providerAction = 'test'; provaBtn.textContent = 'Prova collegamento';
      azioni.append(salva, provaBtn);
      if (row.supportsEndpoint) {
        const salvaLink = document.createElement('button');
        salvaLink.type = 'button'; salvaLink.className = 'secondary-btn compact'; salvaLink.dataset.providerAction = 'save-runtime'; salvaLink.textContent = 'Salva indirizzo';
        azioni.append(salvaLink);
      }
      /* ⛔ «Rimuovi» è silenzioso e sta in fondo: cancella una credenziale, e
         non può avere lo stesso invito di «Salva». */
      if (row.keyConfigured) {
        const rimuovi = document.createElement('button');
        rimuovi.type = 'button'; rimuovi.className = 'text-btn provider-remove'; rimuovi.dataset.providerAction = 'remove-key'; rimuovi.textContent = 'Rimuovi la chiave';
        azioni.append(rimuovi);
      }
      corpo.append(azioni);

      if (prova && prova.esito !== 'in-corso') {
        const esito = textElement('p', 'provider-prova', prova.motivo + (Number.isFinite(prova.millisecondi) ? ` · ${prova.millisecondi} ms` : ''));
        esito.dataset.provaEsito = prova.esito;
        corpo.append(esito);
      }
      const feedback = textElement('p', 'provider-feedback', '');
      feedback.dataset.providerFeedback = row.id;
      feedback.hidden = true;
      corpo.append(feedback);
      card.append(corpo);
      return card;
    }));
  }

  /**
   * Chiede al provider se accetta la credenziale.
   * ⛔ Esce una richiesta VERA verso un servizio esterno con la chiave
   * dell'owner: parte solo su gesto, mai a ogni ridisegno.
   */
  async function provaProviderModelLab(providerId) {
    state.modelLab.provePr ??= new Map();
    state.modelLab.provePr.set(providerId, { esito: 'in-corso', motivo: 'Chiedo al provider…', modelli: null, millisecondi: null });
    renderizzaProviderModelLab();
    try {
      state.modelLab.provePr.set(providerId, await apiPost(`/api/v1/providers/${encodeURIComponent(providerId)}/test`, {}));
    } catch (error) {
      state.modelLab.provePr.set(providerId, { esito: 'errore', motivo: error.message || 'Prova non riuscita', modelli: null, millisecondi: null });
    }
    renderizzaProviderModelLab();
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
      if (action === 'test') {
        // ⛔ La prova ridisegna la lista: il bottone che stiamo tenendo per
        // mano sparisce. Si esce subito, senza toccarlo dopo.
        await provaProviderModelLab(provider);
        return;
      }
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
    /*
     * ⛔⛔ 02/9 — «non è stato possibile osservare le capacità» è vero ma
     * muto: non dice COSA fare. Da quando il probe attribuisce `/props` al
     * modello che l'ha prodotto, la causa quasi sempre è una sola e si toglie
     * con un gesto — c'è un ALTRO modello caricato, e finché c'è lui il
     * runtime non può dire niente di questo. Il pulsante che lo scarica sta
     * nel pannello qui accanto, quindi la frase indica il gesto invece di
     * lasciare la persona davanti a un «non lo so».
     */
    const runtimeDi = esito?.inspection?.runtime;
    const perColpaDiUnAltro = esito.reason === 'capabilities'
      && runtimeDi?.reachable === true
      && runtimeDi?.servingThisModel === false
      && typeof runtimeDi?.servingModelId === 'string' && runtimeDi.servingModelId !== ''
      ? ` — è caricato «${runtimeDi.servingModelId}», e finché c'è lui il runtime non può osservare questo modello: scaricalo per verificarlo`
      : '';
    const motivo = verdetto === 'tight'
      ? `entra, ma sopra il ${Math.round(SOGLIA_TIGHT * 100)}% di ciò che è libero: sotto carico può non bastare`
      : (MOTIVI_FIT[esito.reason] || esito.reason || 'motivo non dichiarato')
        + (esito.reason === 'memory' ? scarto(esito.memory) : esito.reason === 'storage' ? scarto(esito.storage) : perColpaDiUnAltro);
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
    /*
     * ⛔⛔ 03/9 — «non come agente» AFFERMA una cosa che a volte non sappiamo.
     *
     * Trovato guardando lo screenshot della verifica precedente, non nel
     * codice: con il verdetto agente `unknown` (le capacità non sono
     * osservabili perché il runtime serve un altro modello) la riga diceva
     * «Va bene per la chat, NON COME AGENTE» — cioè trasformava un «non l'ho
     * potuto controllare» in un «no». È la stessa distinzione su cui è
     * costruito tutto il resto di questo pannello: `unknown` non è `blocked`.
     * ⇒ Il ripiego dice cosa SI SA («va bene per la chat») e poi il vero
     * stato dell'altra domanda, senza rispondere al posto suo.
     */
    const prefissoRipiego = voce.ripiegoChat
      ? (voce.esito?.state === 'unknown' ? 'Va bene per la chat; come agente non verificabile ora' : 'Va bene per la chat, non come agente')
      : '';
    nodo.textContent = voce.ripiegoChat ? `${prefissoRipiego} — ${testo.replace(/^[^—]*— /, '')}` : testo;
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
      /*
       * ⛔ 02/9 — un aggancio stabile per la QA visiva, che finora non
       * premeva MAI questo pulsante: senza, il selettore sarebbe la stringa
       * dell'etichetta, cioè una prova che si rompe alla prima riscrittura
       * del testo — e il testo è la cosa che più spesso si riscrive.
       */
      verifica.dataset.verifyFit = model.id;
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

  /* ⛔⛔⛔ 03/9 — QUI stavano DUE funzioni MORTE, rimosse: una seconda
   * `renderizzaDownloadModelLab()` e una seconda `cercaHuggingFaceModelLab()`.
   * Le dichiarazioni di funzione sono sollevate e l'ULTIMA vince, quindi
   * comandavano le versioni piu' avanti nel file (righe ~2830 e ~11600) e
   * queste non venivano mai eseguite. Trovate cercando dove intervenire sul
   * catalogo Hugging Face: una modifica scritta qui non avrebbe fatto NIENTE,
   * e sarebbe sembrata una cura che non funziona.
   * ⛔ E' la TERZA volta che questa classe di difetto morde in questo file. */
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
  /**
   * ⭐⭐⭐ 03/9 — «entra e gira su QUESTO pc», per una variante che sul disco
   * non c'è ancora. Owner: «mancano scritte e badge e pulsanti per misurare
   * in tempo reale se quel modello e quantizzazione entrano e girano nel pc».
   *
   * ⛔ Il verdetto NON si calcola qui: si chiede a `/fit-estimate`, che vive
   * accanto a `/fit` e usa la stessa `measureMachine()` e le stesse parole.
   * Due verdetti sulla stessa schermata scritti con due vocabolari diversi
   * insegnano a non fidarsi di nessuno dei due.
   *
   * ⛔ E si misura SU RICHIESTA, non a ogni ridisegno: la memoria libera
   * cambia mentre si lavora (basta caricare un modello), quindi un numero
   * dipinto una volta e lasciato lì mentirebbe dopo trenta secondi. Il
   * bottone dice l'ora della misura, e si può rifare.
   */
  const VERDETTI_STIMA = {
    compatible: { etichetta: 'I pesi ci stanno', classe: 'ok' },
    tight: { etichetta: 'Al limite', classe: 'warn' },
    blocked: { etichetta: 'Non ci sta', classe: 'bad' },
    unknown: { etichetta: 'Non misurabile', classe: 'unknown' },
  };
  function descriviStimaHf(stima) {
    const voce = VERDETTI_STIMA[stima?.state] || VERDETTI_STIMA.unknown;
    const libera = Number.isFinite(stima?.memory?.availableBytes) ? formattaByteModelLab(stima.memory.availableBytes) : null;
    let motivo;
    if (stima?.reason === 'storage') motivo = `non c'è abbastanza spazio su disco${Number.isFinite(stima?.storage?.availableBytes) ? ` — liberi ${formattaByteModelLab(stima.storage.availableBytes)}` : ''}`;
    else if (stima?.reason === 'memory' && stima.state === 'blocked') motivo = `i pesi superano la memoria libera${libera ? ` (${libera})` : ''}`;
    else if (stima?.reason === 'memory') motivo = `restano pochi margini sulla memoria libera${libera ? ` (${libera})` : ''}`;
    else if (stima?.reason === 'measurement') motivo = 'la macchina non è stata misurata';
    else motivo = `entrano nella memoria libera${libera ? ` (${libera})` : ''}`;
    return { classe: voce.classe, testo: `${voce.etichetta} — ${motivo}` };
  }
  /**
   * La nota che accompagna ogni stima, e che non si può togliere.
   *
   * ⛔ La stima copre i PESI e basta: senza il file non si legge l'header,
   * quindi la cache del contesto non è calcolabile. È una soglia inferiore,
   * e va detto in chiaro — LM Studio e Ollama mostrano una stima e non
   * dichiarano di cosa è fatta, ed è esattamente il punto in cui una persona
   * scarica 15 GB per scoprire dopo che non parte.
   */
  function nodoBaseStimaHfModelLab() {
    return textElement('p', 'hf-variant-basis', 'La misura pesa i file del modello contro memoria e disco liberi adesso. La cache del contesto si somma sopra e si può calcolare solo dopo lo scaricamento: se già i pesi non ci stanno, non ci sta.');
  }
  /** La scheda «File»: i percorsi VERI già presenti in `detail.files`, non un secondo endpoint. */
  function nodoFileHfModelLab(detail) {
    const lista = document.createElement('div');
    lista.className = 'hf-file-list';
    const files = Array.isArray(detail.files) ? detail.files : [];
    if (files.length === 0) { lista.append(textElement('p', 'model-lab-empty', 'Nessun file osservato in questo repository.')); return lista; }
    for (const file of files) {
      const riga = document.createElement('div');
      riga.className = 'hf-file-row';
      riga.append(textElement('span', 'hf-file-path', file.path));
      riga.append(textElement('span', 'hf-file-bytes', formattaByteModelLab(Number(file.sizeBytes || 0))));
      // ⛔ L'impronta si dice presente o assente, mai finta: un set senza sha256 non si scarica.
      riga.append(textElement('span', `hf-file-hash ${file.sha256 ? 'is-present' : 'is-missing'}`, file.sha256 ? 'sha256 ✓' : 'sha256 assente'));
      lista.append(riga);
    }
    return lista;
  }
  /** Misura TUTTE le varianti in un colpo: la macchina è la stessa per tutte, in questo istante. */
  async function misuraVariantiHfModelLab(gruppi) {
    state.modelLab.hfStima = { inCorso: true, misurataAlle: null, perVariante: new Map() };
    renderizzaHfDetailModelLab();
    const perVariante = new Map();
    await Promise.all(gruppi.map(async ({ chiave, bytes }) => {
      try {
        perVariante.set(chiave, await apiGet(`/api/v1/local-models/fit-estimate?bytes=${encodeURIComponent(String(bytes))}`));
      } catch (error) {
        perVariante.set(chiave, { state: 'unknown', reason: 'measurement', errore: error.message });
      }
    }));
    state.modelLab.hfStima = { inCorso: false, misurataAlle: new Date(), perVariante };
    renderizzaHfDetailModelLab();
  }

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
    // ⛔ Niente titolo «Varianti GGUF · N»: ora lo dice la scheda con il suo
    // conto, e ripeterlo due volte a 40 pixel di distanza è rumore.
    const stima = state.modelLab.hfStima;
    const gruppiPerMisura = groups.map((files) => ({
      chiave: files[0].path,
      bytes: files.reduce((somma, file) => somma + Number(file.sizeBytes || 0), 0),
    }));
    const barraMisura = document.createElement('div');
    barraMisura.className = 'hf-variant-measure';
    const bottoneMisura = document.createElement('button');
    bottoneMisura.type = 'button';
    bottoneMisura.className = 'secondary-btn compact';
    bottoneMisura.disabled = stima?.inCorso === true || gruppiPerMisura.length === 0;
    bottoneMisura.textContent = stima?.inCorso ? 'Misuro…' : (stima?.misurataAlle ? 'Rimisura su questo PC' : 'Misura su questo PC');
    bottoneMisura.addEventListener('click', () => { void misuraVariantiHfModelLab(gruppiPerMisura); });
    barraMisura.append(bottoneMisura);
    /*
     * ⛔ L'ORA della misura, non solo il verdetto: la memoria libera cambia
     * mentre si lavora — basta caricare un modello — e un badge senza data
     * diventa una bugia silenziosa dopo un minuto.
     */
    if (stima?.misurataAlle) barraMisura.append(textElement('span', 'hf-variant-measured-at', `misurato alle ${stima.misurataAlle.toLocaleTimeString('it-IT')}`));
    variants.append(barraMisura, nodoBaseStimaHfModelLab());
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
      /*
       * ⛔ Il verdetto sta SOTTO la riga e non dentro, per non spingere via
       * il bottone «Scarica» quando la frase è lunga: su 1024px di larghezza
       * il nome di una quantizzazione più un motivo per esteso non stanno
       * sulla stessa riga, e la cosa che si spezzerebbe sarebbe l'azione.
       */
      const voceStima = stima?.perVariante?.get(files[0].path);
      if (stima?.inCorso) {
        row.append(textElement('p', 'hf-variant-fit is-loading', 'Misuro su questo PC…'));
      } else if (voceStima) {
        const descritta = descriviStimaHf(voceStima);
        const nodoStima = textElement('p', 'hf-variant-fit', descritta.testo);
        nodoStima.dataset.fitState = descritta.classe;
        row.append(nodoStima);
      }
      variants.append(row);
    }

    /*
     * ⭐⭐⭐ 03/9 — owner: «se clicco su un modello hugging face, come su
     * mobile si devono aprire delle tab, con per prima la lista delle
     * quantizzazioni del modello».
     *
     * ⛔ Il mobile ce l'ha già, e il desktop deve allinearsi a chi ha
     * risolto per primo: `TalosMobileLocalRepoDetail.vue` ha esattamente
     * queste tre — Quantizzazioni · Scheda · File — con «quantizzazioni»
     * come predefinita. Non invento un ordine mio: quello è l'ordine
     * giusto perché la domanda che porta qui è «quale versione scarico?»,
     * e la scheda del modello è contesto, non decisione.
     *
     * ⛔ Prima le tre cose erano IMPILATE, con la scheda README davanti
     * alle varianti: per arrivare alla decisione bisognava scorrere oltre
     * un testo lungo quanto un articolo.
     *
     * ⭐ La terza scheda («File») esiste perché i percorsi veri sono già
     * qui, in `detail.files`: non è un endpoint nuovo né un elenco
     * inventato — è un dato che avevamo e non mostravamo.
     */
    const schede = [
      { id: 'quantizzazioni', etichetta: 'Quantizzazioni', conto: groups.length, nodo: variants },
      { id: 'scheda', etichetta: 'Scheda modello', conto: null, nodo: renderizzaModelCardReadme(detail) },
      { id: 'file', etichetta: 'File', conto: Array.isArray(detail.files) ? detail.files.length : 0, nodo: nodoFileHfModelLab(detail) },
    ];
    const barra = document.createElement('div');
    barra.className = 'hf-detail-tabs';
    barra.setAttribute('role', 'tablist');
    const corpo = document.createElement('div');
    corpo.className = 'hf-detail-body';
    const attiva = schede.some((s) => s.id === state.modelLab.hfDetailTab) ? state.modelLab.hfDetailTab : 'quantizzazioni';
    for (const scheda of schede) {
      const bottone = document.createElement('button');
      bottone.type = 'button';
      bottone.className = 'hf-detail-tab';
      bottone.dataset.hfDetailTab = scheda.id;
      bottone.setAttribute('role', 'tab');
      const selezionata = scheda.id === attiva;
      bottone.setAttribute('aria-selected', String(selezionata));
      bottone.classList.toggle('active', selezionata);
      bottone.append(textElement('span', '', scheda.etichetta));
      // ⛔ Il conto solo dove è un fatto: «Scheda modello» non è una lista.
      if (Number.isFinite(scheda.conto)) bottone.append(textElement('span', 'hf-detail-tab-count', String(scheda.conto)));
      bottone.addEventListener('click', () => { state.modelLab.hfDetailTab = scheda.id; renderizzaHfDetailModelLab(); });
      barra.append(bottone);
      if (selezionata) corpo.append(scheda.nodo);
    }

    card.append(heading, tags, stats, barra, corpo);
    mount.replaceChildren(card);
  }
  function renderizzaHfRisultatiModelLab() { const mount = $('#modelLabHfResults'); if (!mount) return; if (state.modelLab.hfError) { mount.replaceChildren(textElement('p', 'model-lab-empty', state.modelLab.hfError.message)); return; } if (!state.modelLab.hfResults.length) { mount.replaceChildren(textElement('p', 'model-lab-empty', 'Nessun repository GGUF trovato.')); return; } mount.replaceChildren(...state.modelLab.hfResults.map((item) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'model-lab-list-item'; button.append(textElement('strong', '', item.repo), textElement('small', '', `${item.downloads ?? '—'} download · ${item.gated ? 'gated' : 'pubblico'}`)); button.addEventListener('click', async () => { state.modelLab.hfDetail = null; /* ⛔ la stima appartiene al repository che l'ha prodotta: cambiando modello va via, altrimenti si attribuisce a uno il verdetto di un altro */ state.modelLab.hfStima = null; state.modelLab.hfDetailTab = 'quantizzazioni'; renderizzaHfDetailModelLab(); try { state.modelLab.hfDetail = await apiGet(`/api/v1/huggingface/repo?repo=${encodeURIComponent(item.repo)}&revision=${encodeURIComponent(item.revision || '')}`); } catch (error) { state.modelLab.hfError = error; } renderizzaHfDetailModelLab(); }); return button; })); }

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
    /*
     * ⭐⭐⭐ 03/9 — owner: «nella tab huggingface i modelli non spuntano
     * subito, ma devo prima cercare qualcosa per far sì che vedo la lista».
     *
     * ⛔ E non mancava niente lato server: `/api/v1/huggingface/search` con
     * query VUOTA risponde già col catalogo ordinato per download (misurato:
     * 5 repository su 5, il primo con 12,7 milioni di scaricamenti). Era di
     * nuovo «il codice giusto che nessuno chiama» — la lista restava sullo
     * stato vuoto «Cerca un modello per iniziare» finché non si digitava.
     *
     * ⇒ Aprire la scheda È la richiesta. Una schermata vuota che aspetta un
     * gesto per mostrare quello che sa già è un invito a indovinare cosa
     * scrivere; i più scaricati sono la risposta giusta a «cosa c'è qui».
     * ⛔ Una volta sola per sessione: se la persona ha poi cercato altro, la
     * sua ricerca non viene sostituita dal catalogo alle sue spalle.
     */
    if (section === 'huggingface' && !state.modelLab.hfCatalogoIniziale) {
      state.modelLab.hfCatalogoIniziale = true;
      if (state.modelLab.hfResults.length === 0 && !state.modelLab.hfError) void cercaHuggingFaceModelLab();
    }
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
    if (selected === 'tools') void caricaPannelloRicercaWeb(); // ⭐ 04/9, R-03 — stato vero dal server a ogni apertura della scheda
  }

  /*
   * ⭐⭐⭐ 04/9 — R-03, ORIGINE DELLA RICERCA WEB nelle Impostazioni.
   *
   * Owner: «nel desktop mancano posti nelle impostazioni per settare chiavi per
   * la ricerca web mentre sul mobile sì: sistema e rendi coerente al massimo;
   * se è possibile dare al modello modi per fare una ricerca web anche se una
   * chiave non è impostata, fallo». Stessa scheda del telefono
   * (`TalosMobileSearchSourcePanel.vue`: una fonte fra più, radiogroup;
   * chiave/indirizzo solo per la fonte scelta; «Disattiva» e «Dimentica la
   * chiave» separati perché costano cose diverse; una riga di prontezza che
   * dice la verità), più la fonte SENZA chiave che il mobile non ha.
   *
   * Tutto lo stato viene dal server (`/api/v1/search-source`): la chiave si
   * manda una volta e il campo si svuota; in lettura non torna mai.
   */
  const RICERCA_LINK = { tavily: 'https://app.tavily.com', brave: 'https://api-dashboard.search.brave.com' };
  async function caricaPannelloRicercaWeb() {
    const mount = $('#searchSourceMount');
    if (!mount) return;
    let stato;
    try { stato = await apiGet('/api/v1/search-source'); }
    catch (error) { mount.replaceChildren(textElement('p', 'muted-copy', messaggioErroreUtente(error, 'Il server locale non risponde: riprova fra un momento.'))); return; }
    disegnaPannelloRicercaWeb(mount, stato);
  }
  function disegnaPannelloRicercaWeb(mount, stato, feedback = null) {
    const fonteScelta = stato.fonti.find((f) => f.id === stato.source) || null;
    const gruppo = document.createElement('div');
    gruppo.className = 'search-source-list';
    gruppo.setAttribute('role', 'radiogroup');
    gruppo.setAttribute('aria-label', 'Origine della ricerca web');
    for (const fonte of stato.fonti) {
      const scelta = document.createElement('button');
      scelta.type = 'button';
      scelta.className = `intro-choice search-source-choice${stato.source === fonte.id ? ' active' : ''}`;
      scelta.setAttribute('role', 'radio');
      scelta.setAttribute('aria-checked', String(stato.source === fonte.id));
      scelta.dataset.searchSource = fonte.id;
      const mark = document.createElement('span'); mark.className = 'intro-mark'; mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = stato.source === fonte.id ? icon('i-check') : icon('i-web');
      const centro = document.createElement('span');
      centro.append(textElement('strong', '', fonte.label), textElement('small', '', fonte.nota));
      const statoTesto = fonte.keyless ? 'senza chiave' : fonte.needsKey ? (fonte.keyConfigured ? 'chiave presente' : 'chiave mancante') : 'indirizzo tuo';
      scelta.append(mark, centro, textElement('span', 'intro-state', statoTesto));
      scelta.addEventListener('click', () => azioneRicercaWeb(mount, () => apiPost('/api/v1/search-source', { source: fonte.id }), `Fonte: ${fonte.label}.`));
      gruppo.append(scelta);
    }
    const spenta = document.createElement('button');
    spenta.type = 'button';
    spenta.className = `intro-choice search-source-choice${stato.source === 'off' ? ' active' : ''}`;
    spenta.setAttribute('role', 'radio'); spenta.setAttribute('aria-checked', String(stato.source === 'off')); spenta.dataset.searchSource = 'off';
    const markOff = document.createElement('span'); markOff.className = 'intro-mark'; markOff.setAttribute('aria-hidden', 'true'); markOff.innerHTML = stato.source === 'off' ? icon('i-check') : icon('i-x');
    const centroOff = document.createElement('span');
    centroOff.append(textElement('strong', '', 'Nessuna ricerca web'), textElement('small', '', 'Il modello non proporrà la ricerca: l\'attrezzo web_search dichiarerà «non configurato».'));
    spenta.append(markOff, centroOff, textElement('span', 'intro-state', 'spenta'));
    spenta.addEventListener('click', () => azioneRicercaWeb(mount, () => apiPost('/api/v1/search-source', { source: 'off' }), 'Ricerca web disattivata.'));
    gruppo.append(spenta);

    const dettagli = document.createElement('div');
    dettagli.className = 'search-source-details';
    if (fonteScelta && (fonteScelta.needsKey || fonteScelta.keyConfigured)) {
      const campo = document.createElement('label'); campo.className = 'provider-field';
      const testo = document.createElement('span');
      testo.append(textElement('span', '', 'Chiave API'), fonteScelta.keyConfigured ? textElement('small', 'muted-copy', ' · una chiave è già salvata') : '');
      const input = document.createElement('input'); input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false; input.dataset.searchKeyInput = fonteScelta.id;
      input.placeholder = fonteScelta.keyConfigured ? 'Sostituisci la chiave salvata' : 'Incolla la chiave';
      input.setAttribute('aria-label', `Chiave API ${fonteScelta.label}`);
      const riga = document.createElement('div'); riga.className = 'provider-actions';
      const salva = document.createElement('button'); salva.type = 'button'; salva.className = 'primary-btn compact'; salva.textContent = 'Salva chiave'; salva.dataset.searchAction = 'save-key';
      salva.addEventListener('click', () => {
        const valore = input.value;
        azioneRicercaWeb(mount, async () => { const esito = await apiPost('/api/v1/search-source/key', { source: fonteScelta.id, key: valore }); input.value = ''; return esito; }, 'Chiave salvata nel portachiavi di questo computer.');
      });
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); salva.click(); } });
      riga.append(salva);
      if (RICERCA_LINK[fonteScelta.id]) {
        const link = document.createElement('a'); link.className = 'secondary-btn compact'; link.href = RICERCA_LINK[fonteScelta.id]; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `Ottieni una chiave ${fonteScelta.label}`;
        riga.append(link);
      }
      if (fonteScelta.keyConfigured) {
        const dimentica = document.createElement('button'); dimentica.type = 'button'; dimentica.className = 'secondary-btn compact danger'; dimentica.textContent = 'Dimentica la chiave'; dimentica.dataset.searchAction = 'forget-key';
        dimentica.addEventListener('click', () => azioneRicercaWeb(mount, () => apiPost('/api/v1/search-source/key/remove', { source: fonteScelta.id }), 'Chiave rimossa dal portachiavi. Per riaccendere la ricerca ne serve una nuova.'));
        riga.append(dimentica);
      }
      campo.append(testo, input);
      dettagli.append(campo, riga);
    }
    if (fonteScelta && fonteScelta.needsEndpoint) {
      const campo = document.createElement('label'); campo.className = 'provider-field';
      const input = document.createElement('input'); input.type = 'url'; input.autocomplete = 'off'; input.spellcheck = false; input.value = stato.endpoint || ''; input.placeholder = 'https://searx.example.org'; input.dataset.searchEndpointInput = fonteScelta.id;
      input.setAttribute('aria-label', 'Indirizzo istanza');
      const riga = document.createElement('div'); riga.className = 'provider-actions';
      const salva = document.createElement('button'); salva.type = 'button'; salva.className = 'secondary-btn compact'; salva.textContent = 'Salva indirizzo'; salva.dataset.searchAction = 'save-endpoint';
      salva.addEventListener('click', () => azioneRicercaWeb(mount, () => apiPost('/api/v1/search-source', { source: fonteScelta.id, endpoint: input.value }), 'Indirizzo salvato.'));
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); salva.click(); } });
      riga.append(salva);
      campo.append(textElement('span', '', 'Indirizzo istanza'), input);
      dettagli.append(campo, riga);
    }
    const azioni = document.createElement('div'); azioni.className = 'provider-actions';
    const prova = document.createElement('button'); prova.type = 'button'; prova.className = 'secondary-btn compact'; prova.textContent = 'Prova la ricerca'; prova.dataset.searchAction = 'test';
    prova.disabled = stato.readiness !== 'pronta';
    prova.addEventListener('click', () => azioneRicercaWeb(mount, async () => {
      const esito = await apiPost('/api/v1/search-source/test', { query: 'TALOS local-first coding agent' });
      return { ...stato, __prova: esito };
    }, null));
    azioni.append(prova);
    const prontezza = textElement('p', 'search-source-readiness', ({
      pronta: fonteScelta?.keyless ? 'Pronto, senza chiave: il modello può cercare sul web con DuckDuckGo. Sotto uso intenso DuckDuckGo può rifiutare, e l\'esito lo dirà.' : 'Pronto: il modello può cercare sul web e soltanto la query lascia questo computer.',
      'chiave-mancante': 'Serve ancora una chiave. La ricerca web resta disattivata finché non viene impostata.',
      'indirizzo-mancante': 'Serve ancora l\'indirizzo dell\'istanza. La ricerca web resta disattivata finché non viene impostato.',
      spenta: 'Nessuna fonte scelta: TALOS non proporrà la ricerca web al modello.',
    })[stato.readiness] || stato.readiness);
    prontezza.dataset.searchReadiness = stato.readiness;
    const esitoProva = stato.__prova ? textElement('p', 'search-source-feedback', `Prova riuscita con ${stato.__prova.fonte}: ${stato.__prova.risultati} risultati${stato.__prova.titoli?.length ? ` — ${stato.__prova.titoli.join(' · ')}` : ''}.`) : null;
    if (esitoProva) esitoProva.setAttribute('role', 'status');
    const messaggio = feedback ? textElement('p', 'search-source-feedback', feedback) : null;
    if (messaggio) messaggio.setAttribute('role', 'status');
    mount.replaceChildren(gruppo, dettagli, azioni, prontezza, ...(esitoProva ? [esitoProva] : []), ...(messaggio ? [messaggio] : []));
  }
  async function azioneRicercaWeb(mount, esegui, feedbackOk) {
    mount.setAttribute('aria-busy', 'true');
    try {
      const stato = await esegui();
      disegnaPannelloRicercaWeb(mount, stato, feedbackOk);
      queueMicrotask(() => { void renderSettingsRiepiloghi(); });
    } catch (error) {
      let stato = null;
      try { stato = await apiGet('/api/v1/search-source'); } catch { /* lo stato resta quello a schermo */ }
      if (stato) disegnaPannelloRicercaWeb(mount, stato, messaggioErroreUtente(error, 'L\'operazione non è riuscita.'));
      else toast('Ricerca web', messaggioErroreUtente(error, 'L\'operazione non è riuscita.'));
    } finally {
      mount.removeAttribute('aria-busy');
    }
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
    /*
     * ⛔ 03/9 — DELEGA, non aggancio per nodo: le schede provider ora nascono
     * dal JS e si ridisegnano a ogni prova. Legare gli ascoltatori ai nodi
     * come prima li avrebbe persi al primo ridisegno — e il pannello sarebbe
     * sembrato "morto" dopo il primo clic, senza un errore da nessuna parte.
     */
    $('#providerList')?.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-provider-toggle]');
      if (toggle) {
        state.modelLab.providerAperti ??= new Set();
        const id = toggle.dataset.providerToggle;
        if (state.modelLab.providerAperti.has(id)) state.modelLab.providerAperti.delete(id);
        else state.modelLab.providerAperti.add(id);
        renderizzaProviderModelLab();
        return;
      }
      const azione = event.target.closest('[data-provider-action]');
      if (azione) gestisciAzioneProvider(azione);
    });
    /* «Prova tutti»: una richiesta per provider, in parallelo — la macchina e
       la rete sono le stesse per tutti in questo istante. */
    $('#providerTestAll')?.addEventListener('click', async (event) => {
      const bottone = event.currentTarget;
      bottone.disabled = true;
      const prima = bottone.textContent;
      bottone.textContent = 'Provo tutti…';
      try {
        await Promise.all((state.modelLab.providers || []).map((row) => provaProviderModelLab(row.id)));
      } finally {
        bottone.disabled = false;
        bottone.textContent = prima;
      }
    });
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
    // ⭐ 04/9, W0-01 — gli scarti non corrotti (vuota, senza intestazione, lettura fallita) prima sparivano: ora contano, col motivo dal server.
    const scartateNonCorrotte = (risultato.sessioniPersistenza?.scartate || []).filter((s) => s.motivo !== 'corrotta').length;
    if (scartateNonCorrotte > 0) problemi.push(`${scartateNonCorrotte} sessione scartata al ripristino (${risultato.sessioniPersistenza.dettaglio || 'vedi Doctor'})`);
    // ⭐ 04/9, R-03 — «spenta» è una scelta, non un problema; chiave/indirizzo mancanti sì.
    if (risultato.ricercaWeb && !risultato.ricercaWeb.pronta && risultato.ricercaWeb.fonte !== 'off') problemi.push('ricerca web non pronta');
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
   * ⭐⭐⭐⭐ O-01 (04/9), owner: «ogni riga della modale che si apre deve
   * essere funzionante al 100% e non avere funzionalità o ui mock».
   *
   * ⛔ La sezione «Attrezzi dell'harness · sempre offerti al modello» era
   * SETTE nomi scritti dentro la stringa di template (`elenca`, `cerca`,
   * `leggi`, `scrivi`, `prova`, `shell`, `naviga`) con una casella
   * `checked disabled` accanto. Il kernel ne offre 43: quei sette più i 36
   * di `strumentiEstesi` (session-registry.mjs) — `web_search`,
   * `document_create`, `generate_image`, `delega_sottotask`, Libreria,
   * Notes, Tasks, Memory, Deep Research, Tool Forge. Trentasei attrezzi
   * VERI, che il modello riceve a ogni giro, invisibili nel pannello che
   * dichiarava di elencarli tutti: un inventario incompleto presentato come
   * completo è uno stato inventato quanto un contatore inventato.
   *
   * Stesso identico pattern degli altri nove pannelli di questo foglio
   * (MCP, skill, plugin, Libreria, Note, Attività, Memoria, Ricerche,
   * Forge): un mount point riempito da una rotta vera.
   *
   * ⛔ UNICA differenza dagli altri nove, e voluta: senza sessione attiva
   * NON si ferma. Gli altri parlano di cose che appartengono a una
   * sessione o al suo progetto; gli attrezzi appartengono al kernel e alla
   * configurazione del server, e l'owner apre questo foglio soprattutto
   * PRIMA di aver avviato qualcosa. Si chiede `/api/v1/tools` (nessuna
   * sessione, nessun permesso per-attrezzo scelto da nessuno) e lo si
   * DICHIARA nell'intestazione — mai spacciato per lo stato di una
   * sessione che non esiste.
   */
  async function caricaPannelloAttrezzi() {
    const mount = $('#toolsListMount', sheetBody);
    if (!mount) return; // il foglio "capabilities" non è (più) quello aperto
    const conSessione = Boolean(state.realSession.id);
    mount.replaceChildren(textElement('p', 'board-empty', 'Carico gli attrezzi…'));
    let dati;
    try {
      dati = await apiGet(conSessione ? `/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tools` : '/api/v1/tools');
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Attrezzi non osservabili: ${error.message}`));
      return;
    }
    if (mount !== $('#toolsListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (!dati.attrezzi) {
      mount.replaceChildren(textElement('p', 'board-empty', dati.errore || 'Attrezzi non osservati.'));
      return;
    }
    if (dati.attrezzi.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'Nessun attrezzo offerto al modello in questa configurazione.'));
      return;
    }
    /*
     * ⭐ Il +1 misurabile: quanto COSTA avere questi attrezzi offerti a ogni
     * giro. Hermes Agent v0.21 mostra la stima di token dello schema per
     * server MCP; qui è per OGNI attrezzo e in totale. ⛔ Dichiarata
     * «stima» perché lo è (caratteri del JSON / 4, l'euristica affermata):
     * un numero misurato su ciò che va sul filo, mai un numero inventato.
     */
    const token = dati.attrezzi.reduce((somma, a) => somma + (a.tokenSchemaStimati || 0), 0);
    const intestazione = textElement('p', 'tools-panel-summary', conSessione
      ? `${dati.attrezzi.length} attrezzi offerti a questa sessione · ~${token.toLocaleString('it-IT')} token di schema a ogni giro (stima)`
      : `${dati.attrezzi.length} attrezzi che riceverà la prossima sessione · ~${token.toLocaleString('it-IT')} token di schema a ogni giro (stima) · nessuna sessione aperta: i permessi per-attrezzo non sono ancora scelti da nessuno`);
    /*
     * ⭐⭐⭐ O-02 (04/9) — «perché questa sessione è costata tanto?». Sopra
     * c'è quanto COSTA avere gli attrezzi offerti; qui quanto sono stati
     * USATI davvero, per attrezzo, con le chiamate identiche a una
     * precedente evidenziate: sono le due metà della stessa domanda, e
     * questo è il posto dove l'elenco degli attrezzi già vive.
     * ⛔ Senza sessione aperta non si scrive niente (non c'è un uso di cui
     * parlare); con una sessione senza eventi di attrezzo si dice «non
     * registrato», mai «0 chiamate».
     */
    const uso = conSessione ? riassuntoAttrezziDaEventi(state.realSession.eventiAttrezzi) : null;
    const usoPerNome = new Map((uso?.perAttrezzo ?? []).map((a) => [a.nome, a]));
    const rigaUso = conSessione
      ? textElement('p', 'tools-panel-uso', uso.registrato
        ? `Usati in questa sessione: ${uso.chiamate} chiamate · ${uso.ripetute > 0 ? `${uso.ripetute} identiche a una precedente` : 'nessuna identica a una precedente'} · ${uso.perAttrezzo.length} attrezzi su ${dati.attrezzi.length}`
        : 'Uso in questa sessione: non registrato — la cronologia caricata non porta nessun evento di attrezzo (sessione vecchia, o nessun attrezzo chiamato).')
      : null;
    // ⛔ L'ORDINE resta quello del kernel (base, poi estesi): è l'ordine in cui il modello li riceve, e riordinarlo per uso renderebbe l'elenco diverso a ogni apertura.
    mount.replaceChildren(intestazione, ...(rigaUso ? [rigaUso] : []), ...dati.attrezzi.map((a) => rigaAttrezzo(a, usoPerNome.get(a.nome) ?? null)));
  }

  /**
   * ⭐⭐⭐ O-01 (04/9) — una riga per attrezzo. TRE fatti diversi, mai
   * confusi in una sola etichetta: è offerto (essere in questa lista), la
   * sua dipendenza esterna è pronta (`web_search` senza fonte configurata
   * è offerto ma non funziona), e una sua chiamata passa o no dal cancello
   * per-attrezzo del foglio Permessi.
   * ⛔ Nessuna casella `disabled`: mimare un interruttore che non esiste è
   * la finta che questa riga del piano doveva togliere.
   */
  function rigaAttrezzo(attrezzo, uso = null) {
    const riga = document.createElement('div');
    riga.className = 'sheet-option';
    riga.setAttribute('role', 'group');
    riga.dataset.toolName = attrezzo.nome;
    const iconEl = document.createElement('span');
    iconEl.className = 'sheet-icon';
    iconEl.innerHTML = icon(ICONA_ATTREZZO[attrezzo.nome] || (attrezzo.categoria === 'base' ? 'i-code' : 'i-bolt'));
    const testo = document.createElement('span');
    /*
     * ⛔⛔⛔ owner 04/9: «nella UI non compaiono nomi tecnici degli attrezzi».
     * L'etichetta principale è il nome umano (nomeUmanoAttrezzo, unica mappa);
     * il nome tecnico resta come dettaglio secondario nel `title` qui sotto e
     * in `data-tool-name` (dato, non testo a schermo) — e soprattutto resta
     * INTATTO nel contratto col kernel, che questa riga non tocca.
     */
    testo.append(
      textElement('strong', null, nomeUmanoAttrezzo(attrezzo.nome)),
      textElement('small', null, attrezzo.descrizione.length > 150 ? `${attrezzo.descrizione.slice(0, 150)}…` : attrezzo.descrizione),
    );
    const chip = document.createElement('span');
    chip.className = 'tool-chips';
    if (attrezzo.dipendenza) {
      chip.append(textElement('span', `status-chip ${attrezzo.dipendenza.stato === 'pronta' ? 'success' : 'error'}`, attrezzo.dipendenza.dettaglio));
    }
    if (attrezzo.permessoConfigurabile) {
      chip.append(textElement('span', 'status-chip', attrezzo.permesso ? `permesso: ${attrezzo.permesso}` : 'permesso: come la sessione'));
    }
    chip.append(textElement('span', 'status-chip success', 'offerto'));
    /*
     * ⭐⭐⭐ O-02 (04/9) — quante volte QUESTA sessione lo ha chiamato, e
     * quante di quelle chiamate erano identiche a una precedente. ⛔ Un
     * attrezzo offerto e mai chiamato non riceve «usato 0 volte»: la sua
     * assenza dal riepilogo è già il fatto, e uno zero in una riga e un
     * «non registrato» nell'intestazione si leggerebbero uguali.
     */
    if (uso && uso.chiamate > 0) {
      riga.dataset.toolChiamate = String(uso.chiamate);
      chip.append(textElement('span', 'status-chip', `usato ${uso.chiamate} volt${uso.chiamate === 1 ? 'a' : 'e'}`));
      if (uso.ripetute > 0) {
        riga.dataset.toolRipetute = String(uso.ripetute);
        chip.append(textElement('span', 'status-chip avviso', `${uso.ripetute} identich${uso.ripetute === 1 ? 'a' : 'e'}`));
      }
    }
    riga.append(iconEl, testo, chip);
    /* ⛔ QA visiva di O-01: la descrizione a schermo è tagliata a 150 caratteri — quella INTERA (la stessa che riceve il modello) deve restare leggibile, non sparire nel taglio. */
    const usoTitle = uso && uso.chiamate > 0
      ? `\nIn questa sessione: ${uso.chiamate} chiamate, di cui ${uso.ripetute} identiche a una precedente.`
      : '';
    riga.title = `${attrezzo.descrizione}\n\nNome tecnico (quello che riceve il modello): ${attrezzo.nome}\n~${attrezzo.tokenSchemaStimati} token di schema (stima) · attrezzo ${attrezzo.categoria}${usoTitle}`;
    return riga;
  }

  /** ⭐ O-01 — solo estetica: un nome senza icona nota ricade su quella della sua categoria, mai su una sbagliata. */
  const ICONA_ATTREZZO = {
    elenca: 'i-list', cerca: 'i-search', leggi: 'i-eye', scrivi: 'i-code', prova: 'i-check',
    shell: 'i-terminal', naviga: 'i-web', web_search: 'i-search', artifact_create: 'i-layout',
    document_create: 'i-files', time_now: 'i-history', delega_sottotask: 'i-branch',
    generate_image: 'i-image', tool_create: 'i-settings',
  };

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
  // 05/9 Fase 2: Libreria — metadati del progetto, stesso endpoint e canale di navigazione.
  const generazioniLibreria = new WeakMap();
  async function caricaPannelloLibreria({ pagina = false } = {}) {
    const mount = pagina ? $('#schermoLibreria') : $('#libraryListMount', sheetBody);
    if (!mount) return;
    const sessionId = state.realSession.id;
    const generation = (generazioniLibreria.get(mount) || 0) + 1;
    generazioniLibreria.set(mount, generation);
    const attuale = () => generazioniLibreria.get(mount) === generation && state.realSession.id === sessionId && (pagina ? state.view === 'libreria' && !mount.hidden : mount === $('#libraryListMount', sheetBody));
    function mostra(voci, { errore = null, caricamento = false } = {}) {
      if (pagina) {
        aggiornaPaginaLibreria(mount, voci, { errore, caricamento, onAggiorna: () => caricaPannelloLibreria({ pagina: true }) });
      } else {
        mount.setAttribute('role', voci.length ? 'list' : 'group');
        mount.replaceChildren(...voci.map(rigaVoceLibreria));
        if (!voci.length) mount.append(textElement('p', 'board-empty', errore || (caricamento ? 'Caricamento Libreria…' : 'Nessun file in Libreria per questo progetto.')));
      }
    }
    if (embeddedDemoOnly()) { mostra([], { errore: 'Nessun backend collegato.' }); return; }
    if (!sessionId) { mostra([], { errore: 'Apri una sessione per leggere la Libreria del progetto.' }); return; }
    mostra([], { caricamento: true });
    try {
      const dati = await apiGet('/api/v1/sessions/' + encodeURIComponent(sessionId) + '/library');
      if (!attuale()) return;
      if (dati.errore) { mostra([], { errore: 'Libreria non disponibile: ' + dati.errore }); return; }
      if (!Array.isArray(dati.voci) || dati.voci.some(v => !v || typeof v !== 'object' || Array.isArray(v))) throw new Error('Elenco della Libreria non valido');
      mostra(dati.voci);
    } catch (error) {
      if (attuale()) mostra([], { errore: 'Libreria non disponibile: ' + error.message });
    }
  }

  function rigaVoceLibreria(voce) {
    return creaLibraryRow(voce);
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
  // 05/9 Fase 2: Attività — stesso endpoint, pagina e vecchio foglio isolati.
  const generazioniAttivita = new WeakMap();
  async function caricaPannelloAttivita({ pagina = false } = {}) {
    const mount = pagina ? $('#schermoAttivita') : $('#tasksListMount', sheetBody);
    if (!mount) return;
    const sessionId = state.realSession.id;
    const generation = (generazioniAttivita.get(mount) || 0) + 1;
    generazioniAttivita.set(mount, generation);
    const attuale = () => generazioniAttivita.get(mount) === generation && state.realSession.id === sessionId && (pagina ? state.view === 'attivita' && !mount.hidden : mount === $('#tasksListMount', sheetBody));
    function mostra(attivita, { errore = null, caricamento = false } = {}) {
      if (pagina) {
        aggiornaPaginaAttivita(mount, attivita, { errore, caricamento, onAggiorna: () => caricaPannelloAttivita({ pagina: true }) });
      } else {
        mount.setAttribute('role', attivita.length ? 'list' : 'group');
        mount.replaceChildren(...attivita.map(rigaAttivita));
        if (!attivita.length) mount.append(textElement('p', 'board-empty', errore || (caricamento ? 'Caricamento attività…' : 'Nessuna attività salvata. Le attività sono globali, disponibili alle tue conversazioni.')));
      }
    }
    if (embeddedDemoOnly()) { mostra([], { errore: 'Nessun backend collegato.' }); return; }
    if (!sessionId) { mostra([], { errore: 'Apri una sessione per leggere le attività salvate.' }); return; }
    mostra([], { caricamento: true });
    try {
      const dati = await apiGet('/api/v1/sessions/' + encodeURIComponent(sessionId) + '/tasks');
      if (!attuale()) return;
      if (dati.errore) { mostra([], { errore: 'Attività non disponibili: ' + dati.errore }); return; }
      if (!Array.isArray(dati.attivita) || dati.attivita.some(m => !m || typeof m !== 'object' || Array.isArray(m))) throw new Error('Elenco delle attività non valido');
      mostra(dati.attivita);
    } catch (error) {
      if (attuale()) mostra([], { errore: 'Attività non disponibili: ' + error.message });
    }
  }

  function rigaAttivita(attivita) {
    return creaTaskRow(attivita);
  }

  /**
   * ⭐⭐⭐ FASE N, sesto sistema (30/8) — stesso identico pattern di
   * caricaPannelloAttivita() sopra.
   */
  // 05/9 Fase 2: Memoria — stesso endpoint, pagina e vecchio foglio isolati.
  const generazioniMemoria = new WeakMap();
  async function caricaPannelloMemoria({ pagina = false } = {}) {
    const mount = pagina ? $('#schermoMemoria') : $('#memoryListMount', sheetBody);
    if (!mount) return;
    const sessionId = state.realSession.id;
    const generation = (generazioniMemoria.get(mount) || 0) + 1;
    generazioniMemoria.set(mount, generation);
    const attuale = () => generazioniMemoria.get(mount) === generation && state.realSession.id === sessionId && (pagina ? state.view === 'memoria' && !mount.hidden : mount === $('#memoryListMount', sheetBody));
    function mostra(memorie, { errore = null, caricamento = false } = {}) {
      if (pagina) {
        aggiornaPaginaMemoria(mount, memorie, { errore, caricamento, onAggiorna: () => caricaPannelloMemoria({ pagina: true }) });
      } else {
        mount.setAttribute('role', memorie.length ? 'list' : 'group');
        mount.replaceChildren(...memorie.map(rigaMemoria));
        if (!memorie.length) mount.append(textElement('p', 'board-empty', errore || (caricamento ? 'Caricamento ricordi…' : 'Nessun ricordo salvato. I ricordi sono globali, disponibili alle tue conversazioni.')));
      }
    }
    if (embeddedDemoOnly()) { mostra([], { errore: 'Nessun backend collegato.' }); return; }
    if (!sessionId) { mostra([], { errore: 'Apri una sessione per leggere i ricordi salvati.' }); return; }
    mostra([], { caricamento: true });
    try {
      const dati = await apiGet('/api/v1/sessions/' + encodeURIComponent(sessionId) + '/memory');
      if (!attuale()) return;
      if (dati.errore) { mostra([], { errore: 'Ricordi non disponibili: ' + dati.errore }); return; }
      if (!Array.isArray(dati.memorie) || dati.memorie.some(m => !m || typeof m !== 'object' || Array.isArray(m))) throw new Error('Elenco dei ricordi non valido');
      mostra(dati.memorie);
    } catch (error) {
      if (attuale()) mostra([], { errore: 'Ricordi non disponibili: ' + error.message });
    }
  }

  function rigaMemoria(memoria) {
    return creaMemoryRow(memoria);
  }

  /**
   * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research. Stesso pattern
   * ESATTO di caricaPannelloMemoria appena sopra — a DIFFERENZA di
   * Notes/Tasks/Memory (GLOBALI), Research è PER-PROGETTO come
   * Libreria: il messaggio "vuoto" lo dice, mai la frase "globale" già
   * usata per gli altri tre.
   */
  // 05/9 Fase 2: ReportRow — ricerche del progetto, stesso endpoint e canale di navigazione.
  const generazioniRicerca = new WeakMap();
  async function caricaPannelloRicerca({ pagina = false } = {}) {
    const mount = pagina ? $('#schermoRicerca') : $('#researchListMount', sheetBody);
    if (!mount) return;
    const sessionId = state.realSession.id;
    const generation = (generazioniRicerca.get(mount) || 0) + 1;
    generazioniRicerca.set(mount, generation);
    const attuale = () => generazioniRicerca.get(mount) === generation && state.realSession.id === sessionId && (pagina ? state.view === 'ricerca' && !mount.hidden : mount === $('#researchListMount', sheetBody));
    function mostra(ricerche, { errore = null, caricamento = false } = {}) {
      if (pagina) {
        aggiornaPaginaRicerca(mount, ricerche, { errore, caricamento, onAggiorna: () => caricaPannelloRicerca({ pagina: true }) });
      } else {
        mount.setAttribute('role', ricerche.length ? 'list' : 'group');
        mount.replaceChildren(...ricerche.map(rigaRicerca));
        if (!ricerche.length) mount.append(textElement('p', 'board-empty', errore || (caricamento ? 'Caricamento ricerche…' : 'Nessuna ricerca avviata in questo progetto.')));
      }
    }
    if (embeddedDemoOnly()) { mostra([], { errore: 'Nessun backend collegato.' }); return; }
    if (!sessionId) { mostra([], { errore: 'Apri una sessione per leggere le ricerche del progetto.' }); return; }
    mostra([], { caricamento: true });
    try {
      const dati = await apiGet('/api/v1/sessions/' + encodeURIComponent(sessionId) + '/research');
      if (!attuale()) return;
      if (dati.errore) { mostra([], { errore: 'Ricerche non disponibili: ' + dati.errore }); return; }
      if (!Array.isArray(dati.ricerche) || dati.ricerche.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('Elenco delle ricerche non valido');
      mostra(dati.ricerche);
    } catch (error) {
      if (attuale()) mostra([], { errore: 'Ricerche non disponibili: ' + error.message });
    }
  }

  function rigaRicerca(ricerca) {
    return creaReportRow(ricerca);
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
  // 05/9 Fase 2: dati globali Officina e mutazione owner esplicita.
  const generazioniForge = new WeakMap();
  const pannelliForge = new Set();
  let scritturaForge = null;
  function pannelliForgeAttuali() {
    for (const pannello of pannelliForge) if (!pannello.attuale()) pannelliForge.delete(pannello);
    return [...pannelliForge];
  }
  async function caricaPannelloForge({ pagina = false } = {}) {
    const mount = pagina ? $('#schermoOfficina') : $('#forgeListMount', sheetBody);
    if (!mount) return;
    const sessionId = state.realSession.id;
    const generation = (generazioniForge.get(mount) || 0) + 1;
    generazioniForge.set(mount, generation);
    const attuale = () => generazioniForge.get(mount) === generation && state.realSession.id === sessionId && (pagina ? state.view === 'officina' && !mount.hidden : mount === $('#forgeListMount', sheetBody));
    let strumenti = [], vista = { errore: null, caricamento: false, erroreAzione: null };
    function mostra(nuovi = strumenti, opzioni = vista) {
      strumenti = nuovi; vista = opzioni;
      const azioni = { ...vista, salvataggio: Boolean(scritturaForge), salvataggioId: scritturaForge?.id || null, onAggiorna: () => caricaPannelloForge({ pagina }), onAbilita: abilita };
      if (pagina) aggiornaPaginaOfficina(mount, strumenti, azioni);
      else {
        mount.setAttribute('role', 'group');
        mount.replaceChildren(...strumenti.map(s => rigaToolForgiato(s, azioni)));
        if (!strumenti.length) mount.append(textElement('p', 'board-empty', vista.errore || (vista.caricamento ? 'Caricamento Officina…' : 'Nessun attrezzo creato dal modello. Gli attrezzi sono condivisi tra tutti i progetti.')));
        if (vista.erroreAzione) { const errore = textElement('p', 'board-empty', vista.erroreAzione); errore.setAttribute('role', 'alert'); mount.prepend(errore); }
      }
    }
    async function abilita(strumento, abilitato) {
      if (!attuale() || scritturaForge || typeof abilitato !== 'boolean' || !strumenti.some(s => s.id === strumento.id && typeof s.abilitato === 'boolean')) return;
      const id = strumento.id;
      scritturaForge = { id };
      for (const p of pannelliForgeAttuali()) p.mostraAzione(null);
      try {
        await apiPost('/api/v1/sessions/' + encodeURIComponent(sessionId) + '/tool-forge/' + encodeURIComponent(id) + '/enable', { abilitato });
        scritturaForge = null;
        await Promise.all(pannelliForgeAttuali().map(p => p.ricarica()));
      } catch (error) {
        scritturaForge = null;
        for (const p of pannelliForgeAttuali()) p.mostraAzione('Modifica di «' + strumento.titolo + '» non salvata: ' + error.message);
      }
    }
    pannelliForgeAttuali();
    pannelliForge.add({ attuale, ricarica: () => caricaPannelloForge({ pagina }), mostraAzione: erroreAzione => mostra(strumenti, { ...vista, erroreAzione }) });
    if (embeddedDemoOnly()) { mostra([], { errore: 'Nessun backend collegato.' }); return; }
    if (!sessionId) { mostra([], { errore: 'Apri una sessione per leggere gli attrezzi.' }); return; }
    mostra([], { caricamento: true, errore: null, erroreAzione: null });
    try {
      const dati = await apiGet('/api/v1/sessions/' + encodeURIComponent(sessionId) + '/tool-forge');
      if (!attuale()) return;
      if (dati.errore) { mostra([], { errore: 'Officina non disponibile: ' + dati.errore, caricamento: false }); return; }
      if (!Array.isArray(dati.strumenti) || dati.strumenti.some(s => !s || typeof s !== 'object' || Array.isArray(s) || typeof s.id !== 'string' || !s.id)) throw new Error('Elenco degli attrezzi non valido');
      mostra(dati.strumenti, { errore: null, caricamento: false, erroreAzione: null });
    } catch (error) {
      if (attuale()) mostra([], { errore: 'Officina non disponibile: ' + error.message, caricamento: false, erroreAzione: null });
    }
  }

  function rigaToolForgiato(strumento, opzioni = {}) {
    return creaForgeRow(strumento, { ...opzioni, selezionabile: false });
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

    /*
     * ⭐⭐⭐ 03/9 — owner: «nel model selector i modelli non sono raggruppati
     * per provider (openrouter, openai, locali etc), consiglio delle tab per
     * switchare».
     *
     * ## Cosa ho MISURATO prima di costruire, e come cambia il progetto
     *
     * Il raggruppamento c'era già — ma sull'asse sbagliato. Il campo
     * `provider` di questo catalogo è l'AUTORE del modello, non la via
     * d'accesso: 424 modelli in **51 gruppi** (openai 91, qwen 53, google 45,
     * anthropic 31…), e tutti e 424 passano da OpenRouter. Quindi «OpenRouter
     * contro OpenAI» oggi non è una scelta: i modelli OpenAI di questa lista
     * SONO via OpenRouter.
     *
     * ⭐ Ricerca 03/9 (Apple HIG via eleken.co/blog-posts/tabs-ux): oltre sei
     * schede l'utente si perde — 51 famiglie non sono schede, e restano
     * gruppi richiudibili. Le FONTI sì: sono due.
     * ⭐ E il concorrente da battere non ce l'ha nemmeno per famiglia: Hermes
     * Agent ha l'issue #15902 aperta, «/model should group models by provider».
     *
     * ## Perché la scheda «Locali» non fa scegliere niente
     *
     * ⛔ `config.mjs` dice che il kernel della chat chiama SEMPRE
     * `openrouter.ai/api/v1/chat/completions`. Un modello locale messo qui
     * come selezionabile sarebbe un pulsante che non fa quello che promette —
     * lo stesso difetto di «APERTA non è FATTA». La scheda quindi esiste,
     * risponde alla domanda vera («dove sono i miei modelli locali?») e
     * dichiara il limite invece di nasconderlo.
     */
    const fonti = document.createElement('div');
    fonti.className = 'model-picker-sources';
    fonti.setAttribute('role', 'tablist');
    panel.append(fonti, searchLabel, listEl, footer);
    wrap.append(trigger, panel);

    let modelliCache = null;
    let modelliLocali = null;
    let fonteScelta = 'openrouter';
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

    /** Ridisegna la striscia delle fonti: conti veri, mai un numero fisso. */
    function renderFonti() {
      const voci = [
        { id: 'openrouter', etichetta: 'OpenRouter', conto: modelliCache ? modelliCache.length : null },
        { id: 'locali', etichetta: 'Locali', conto: modelliLocali ? modelliLocali.length : null },
      ];
      fonti.replaceChildren(...voci.map((voce) => {
        const bottone = document.createElement('button');
        bottone.type = 'button';
        bottone.className = 'model-picker-source';
        bottone.dataset.pickerSource = voce.id;
        bottone.setAttribute('role', 'tab');
        const attiva = voce.id === fonteScelta;
        bottone.setAttribute('aria-selected', String(attiva));
        bottone.classList.toggle('active', attiva);
        bottone.append(textElement('span', '', voce.etichetta));
        if (Number.isFinite(voce.conto)) bottone.append(textElement('span', 'model-picker-source-count', String(voce.conto)));
        bottone.addEventListener('click', () => { fonteScelta = voce.id; renderFonti(); renderLista(); });
        return bottone;
      }));
    }

    /**
     * La scheda «Locali»: cosa c'è sul disco, e perché non si può ancora
     * sceglierlo qui. ⛔ Nessuna riga cliccabile: un elenco che sembra
     * selezionabile e non lo è mente col gesto, non con le parole.
     */
    /**
     * ⭐⭐⭐ 03/9, SECONDA STESURA — ora i modelli locali SI SCELGONO.
     *
     * ⛔ La prima versione, scritta stamattina, li mostrava come righe morte
     * con la nota «la chat parla solo con OpenRouter, non ancora qui». Era
     * vero quando l'ho scritta ed è diventato FALSO nel giro di un'ora, con
     * l'instradamento multi-provider: una spiegazione corretta che invecchia
     * è peggio di nessuna spiegazione, perché convince a non riprovare.
     *
     * ⇒ La riga è un bottone come le altre e vale `local:<id>`, il prefisso
     * di fonte concordato. L'unica differenza vera resta detta: senza il
     * motore acceso la generazione non parte, e QUELLO si dice qui invece di
     * lasciarlo scoprire a metà di una risposta.
     */
    function renderListaLocali() {
      const pezzi = [];
      pezzi.push(textElement('p', 'model-picker-source-note', 'Girano su questo computer, senza rete e senza costo. Si accendono da soli alla prima richiesta.'));
      if (!modelliLocali) {
        pezzi.push(textElement('p', 'board-empty', 'Leggo i modelli installati…'));
      } else if (modelliLocali.length === 0) {
        pezzi.push(textElement('p', 'board-empty', 'Nessun modello installato. Si aggiungono dal Laboratorio modelli.'));
      } else {
        for (const modello of modelliLocali) {
          const valore = `local:${modello.id}`;
          const opt = document.createElement('button');
          opt.type = 'button';
          opt.className = 'sheet-option model-picker-option';
          opt.setAttribute('role', 'option');
          opt.setAttribute('aria-selected', String(valore === valoreScelto));
          if (valore === valoreScelto) opt.classList.add('active');
          opt.dataset.modelPickerLocal = valore;
          const iconWrap = document.createElement('span');
          iconWrap.className = 'sheet-icon';
          iconWrap.innerHTML = icon('i-brain');
          const textWrap = document.createElement('span');
          textWrap.append(textElement('strong', '', modello.name || modello.id));
          textWrap.append(textElement('small', '', `su questo computer · ${formattaByteModelLab(Number(modello.bytes || 0))}${modello.state === 'ready' ? '' : ` · ${modello.state}`}`));
          opt.append(iconWrap, textWrap);
          /*
           * ⛔⛔⛔ 03/9 — trovato dal vivo verificando l'avvio automatico a
           * metà chat (owner: "verifica... anche a metà strada in una chat
           * già iniziata"): questo handler NON chiamava mai
           * sincronizzaImpostazioniSessione come fa invece il ramo remoto
           * (renderLista, poco sopra). Risultato misurato: click sul
           * modello locale, la pillola del composer restava su quello
           * remoto, e al Send il server eseguiva ANCORA col modello
           * vecchio (RunStarted.contesto.modello confermava deepseek, non
           * il locale scelto) — corretto solo a posteriori dalla nota
           * "Impostazioni cambiate fuori da questa scheda", che è onesta
           * ma fuorviante: non era un'altra scheda, era questo stesso
           * click mai arrivato al server. Stessa disciplina del ramo
           * remoto: il server è la fonte di verità, la pillola non
           * promette un modello che il registro non ha ancora accettato.
           */
          opt.addEventListener('click', async () => {
            const applicaScelta = () => {
              valoreScelto = valore;
              if (aggiornaModelloPrincipale) { state.model = valore; aggiornaPiedeSidebar(); } // 05/9 Fase 2: WorkspaceFooter
              aggiornaTriggerLabel();
              if (aggiornaModelloPrincipale) {
                aggiornaPillolaModello();
                salvaPreferenzeChatDesktop();
              }
              chiudi();
              if (typeof alSelezionato === 'function') alSelezionato(valore);
            };

            if (aggiornaModelloPrincipale && sincronizzaSessione && state.realSession.id) {
              if (panel.getAttribute('aria-busy') === 'true') return;
              panel.setAttribute('aria-busy', 'true');
              opt.disabled = true;
              try {
                await sincronizzaImpostazioniSessione({ modello: valore });
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

    function renderLista() {
      if (fonteScelta === 'locali') { renderListaLocali(); return; }
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
                state.model = modello.id; aggiornaPiedeSidebar(); // 05/9 Fase 2: WorkspaceFooter
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
        /*
         * ⛔ I locali si chiedono a parte e NON bloccano il catalogo: se la
         * lettura del disco fallisce, la scheda «Locali» resta vuota e lo
         * dice — ma il selettore continua a funzionare. Una lista che si
         * spegne per un pannello secondario sarebbe un danno più grande.
         */
        apiGet('/api/v1/local-models')
          .then((locali) => { modelliLocali = Array.isArray(locali?.items) ? locali.items : []; renderFonti(); if (fonteScelta === 'locali') renderListaLocali(); })
          .catch(() => { modelliLocali = []; renderFonti(); if (fonteScelta === 'locali') renderListaLocali(); });
        metaSpan.textContent = `${dati.modelli.length} modelli${dati.daCache ? ' · da cache' : ''}`;
        renderFonti();
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

  // 05/9 Fase 2: Board — letture reali limitate, risultati obsoleti ignorati.
  async function leggiDettagliBoard(sessioni, generation, leggi, ricevi) {
    let prossimo = 0, errori = 0;
    async function worker() {
      while (generation === state.board.generation && prossimo < sessioni.length) {
        const sessione = sessioni[prossimo++];
        try {
          const dato = await leggi(sessione);
          if (generation === state.board.generation) ricevi(sessione, dato);
        } catch { errori += 1; }
      }
    }
    await Promise.all(Array.from({length:Math.min(4, sessioni.length)}, worker));
    return errori;
  }

  async function caricaCartelleSessioniBoard() {
    if (embeddedDemoOnly()) return;
    state.board.cartelleRichieste = true;
    if (state.board.caricamento || state.board.cartelleInCaricamento || state.board.cartelleCaricate) return;
    const generation = state.board.generation;
    state.board.cartelleInCaricamento = true;
    renderSessionsBoard(state.board.sessioni);
    const errori = await leggiDettagliBoard(state.board.sessioni, generation,
      s => apiGet('/api/v1/sessions/' + encodeURIComponent(s.sessionId) + '/export'),
      (s, esportazione) => { state.board.cartelle[s.sessionId] = cartellaDaExport(esportazione); });
    if (generation !== state.board.generation) return;
    state.board.cartelleInCaricamento = false;
    state.board.cartelleCaricate = errori === 0;
    if (errori) state.board.avviso = 'Cartelle non disponibili per ' + errori + ' sessioni. Premi Aggiorna per riprovare.';
    renderSessionsBoard(state.board.sessioni);
  }

  async function refreshSessionsBoard() {
    if (embeddedDemoOnly()) { renderEmbeddedSessionsBoardDemo(true); return; }
    const generation = state.board.generation += 1;
    Object.assign(state.board, {caricamento:true,metricheInCaricamento:false,cartelleInCaricamento:false,errore:null,avviso:null,metriche:{},cartelle:{},cartelleCaricate:false});
    if (refreshSessionsBoardButton) refreshSessionsBoardButton.disabled = true;
    renderSessionsBoard(state.board.sessioni);
    try {
      const { items } = await apiGet('/api/v1/sessions');
      if (generation !== state.board.generation) return;
      if (!Array.isArray(items)) throw new Error('Elenco sessioni non valido');
      state.board.sessioni = items;
      state.board.initialized = true;
      state.board.metricheInCaricamento = true;
      renderSessionsBoard(items);
      const errori = await leggiDettagliBoard(items, generation,
        s => apiGet('/api/v1/sessions/' + encodeURIComponent(s.sessionId) + '/metrics'),
        (s, metriche) => { state.board.metriche[s.sessionId] = metriche; });
      if (generation !== state.board.generation) return;
      if (errori) state.board.avviso = 'Metriche non disponibili per ' + errori + ' sessioni. Premi Aggiorna per riprovare.';
    } catch (error) {
      if (generation !== state.board.generation) return;
      state.board.sessioni = [];
      state.board.errore = boardErrorMessage(error);
    } finally {
      if (generation === state.board.generation) {
        state.board.caricamento = false;
        state.board.metricheInCaricamento = false;
        if (refreshSessionsBoardButton) refreshSessionsBoardButton.disabled = false;
        renderSessionsBoard(state.board.sessioni);
        if (state.board.cartelleRichieste && !state.board.errore) await caricaCartelleSessioniBoard();
      }
    }
  }

  function renderEmbeddedSessionsBoardDemo(announce = false) {
    state.board.initialized = true;
    state.board.sessioni = [];
    state.board.errore = 'Nessun dato mobile collegato.';
    renderSessionsBoard([]);
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
  /**
   * ⭐⭐⭐ O-01 (04/9) — `ancoraAlComposer`: «Apertura del pulsante +»
   * (Impostazioni → Interazione) offriva «Cassetto» e «Menu», e le due voci
   * facevano ESATTAMENTE la stessa cosa: `applicaAspettoDesktop` scriveva
   * `data-talos-composer-plus` sull'host e nessuna riga di CSS o di JS lo
   * leggeva — un'impostazione inerte è UI finta quanto un contatore
   * inventato. Il marcatore lo mette SOLO chi apre dal «+» del composer
   * (`#capabilityBtn`): la stessa modale aperta dal Context rail o dalla
   * palette resta centrata, perché lì non c'è nessun «+» a cui ancorarsi.
   */
  function openSheet(type, { ancoraAlComposer = false } = {}) {
    const content = sheetTemplates[type];
    if (!content) return;
    sheetDialog.classList.remove('sheet-dialog--new-session');
    sheetDialog.classList.toggle('sheet-dialog--dal-composer', ancoraAlComposer);
    /*
     * ⛔ Trovato nella QA visiva di O-01 (screenshot 06): con «Menu» il
     * foglio si ancorava al bordo SINISTRO della finestra, cioè sopra la
     * sidebar delle sessioni — un menu ancorato a niente. La posizione si
     * MISURA sul bottone che l'ha aperto, mai su un valore scritto nel CSS:
     * la sidebar si può stringere, chiudere e ridimensionare.
     */
    if (ancoraAlComposer) {
      const rettangolo = $('#capabilityBtn')?.getBoundingClientRect();
      /*
       * ⛔⛔ Trovato dalla QA visiva di O-01, secondo giro (store VUOTO,
       * viewport desktop): il foglio finiva a `y = -676`, cioè FUORI dallo
       * schermo. Con la vista Board davanti, il composer è in un pannello
       * nascosto e `getBoundingClientRect()` torna tutti zeri — e
       * `innerHeight - 0` spingeva il foglio sopra il bordo alto. Una misura
       * presa da un elemento non disposto non è una misura: senza rettangolo
       * VERO si tolgono le proprietà e comanda il default del CSS. Il clamp
       * copre il caso limite di un composer altissimo su una finestra bassa.
       */
      if (rettangolo && rettangolo.width > 0 && rettangolo.height > 0) {
        const bordoBasso = Math.round(window.innerHeight - rettangolo.top + 10);
        sheetDialog.style.setProperty('--talos-sheet-anchor-left', `${Math.max(8, Math.round(rettangolo.left))}px`);
        sheetDialog.style.setProperty('--talos-sheet-anchor-bottom', `${Math.max(8, Math.min(bordoBasso, window.innerHeight - 120))}px`);
      } else {
        sheetDialog.style.removeProperty('--talos-sheet-anchor-left');
        sheetDialog.style.removeProperty('--talos-sheet-anchor-bottom');
      }
    } else {
      sheetDialog.style.removeProperty('--talos-sheet-anchor-left');
      sheetDialog.style.removeProperty('--talos-sheet-anchor-bottom');
    }
    sheetEyebrow.textContent = content.eyebrow;
    sheetTitle.textContent = content.title;
    sheetBody.innerHTML = content.html();
    prepareResizableDialog(sheetDialog, `sheet:${type}`);
    showEmbeddedDialog(sheetDialog);
    wireSheetActions(type);
    if (type === 'control') { refreshDoctorBadge(); caricaPannelloHooks(); }
    if (type === 'capabilities') { caricaPannelloAttrezzi(); caricaPannelloMcp(); caricaPannelloSkill(); caricaPannelloPlugin(); caricaPannelloLibreria(); caricaPannelloNote(); caricaPannelloAttivita(); caricaPannelloMemoria(); caricaPannelloRicerca(); caricaPannelloForge(); }
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
            /* ⛔ O-01 (04/9) — MANCAVA: `generate_image` è il quinto in ATTREZZI_CON_PERMESSO_PER_ATTREZZO (config.mjs) dal 29/8, e questo foglio ne mostrava quattro. Il Capability hub dichiara «permesso per-attrezzo nel foglio Permessi»: su questo attrezzo era una promessa vuota. */
            ['generate_image', 'Genera un’immagine — passa dal cancello per-attrezzo come gli altri quattro'],
          ].map(([tool, desc]) => `
            <div class="sheet-toggle-row">
              <span><strong title="${tool}">${nomeUmanoAttrezzo(tool)}</strong><small>${desc}</small></span>
              <select data-tool-permission-select="${tool}" aria-label="Permesso per l'attrezzo ${nomeUmanoAttrezzo(tool)}">
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
          <span class="sheet-label">Attrezzi · quelli che il kernel offre DAVVERO al modello · il permesso per-attrezzo si sceglie nel foglio Permessi</span>
          <div id="toolsListMount"></div>
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
            ['Toolsets', 'Raggruppare gli attrezzi in insiemi accendibili per sessione', 'i-code'],
            ['Computer use', 'Pilotare schermo, mouse e tastiera — oggi TALOS legge solo il testo delle pagine, con naviga', 'i-layout'],
            ['Immagini in ingresso', 'Allegare uno screenshot al messaggio — nessun canale immagine verso il modello: il kernel non manda nessun image_url', 'i-image'],
            ['Gateways · Telegram, Discord, Slack, WhatsApp', 'Parlare con TALOS da un’app di messaggistica', 'i-link'],
            ['Profiles', 'Insiemi di preferenze salvate e richiamabili per tipo di lavoro', 'i-robot'],
          ].map(([name, desc, ico]) => `
            <div class="sheet-option" role="group">
              <span class="sheet-icon">${icon(ico)}</span><span><strong>${name}</strong><small>${desc}</small></span><span class="status-chip">non implementato</span>
            </div>`).join('')}
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Aggiungi contesto al messaggio</span>
          <button class="sheet-option" data-capability-action="file"><span class="sheet-icon">${icon('i-files')}</span><span><strong>Allega un file del workspace</strong><small>Lo aggiunge al messaggio come riferimento @, dai file veri della sessione</small></span><span>@</span></button>
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
  function piedeDelMockup() { return Boolean($('#schermoChat .talos-chat-foot')); }

  function aggiornaPillolaModello() {
    const span = $('[data-open-sheet="model"] span');
    const label = piedeDelMockup() ? (nomeModelloBreve(state.model) || 'Scegli il modello') : (state.model || 'Seleziona modello'); // 05/9 Fase 2: il chip mostra il nome breve
    if (span) span.textContent = label;
    const activeModel = $('#modelLabActiveModel');
    if (activeModel) activeModel.textContent = label;
  }

  function aggiornaPillolaAmbiente() {
    $$('[data-environment-label]').forEach((span) => {
      span.textContent = state.environment || 'Ambiente non osservato';
    });
  }

  /**
   * ⭐⭐⭐ O-02 (04/9) — il contatore ONESTO durante il giro: la persona deve
   * poter vedere quanti giri sta consumando PRIMA di sbatterci nel tetto.
   * ⛔ Il tetto non si scrive qui: `GIRI_MASSIMI` è una `const` non esportata
   * del kernel. Si mostra il numero di giri usati sempre, il «su N» solo
   * quando il kernel l'ha DICHIARATO (nel messaggio di un giri-esauriti già
   * visto in questa sessione), e solo allora si può dire «vicino al tetto».
   * ⭐ Ha senso perché il tetto vale PER GIRO: nello store, una sessione con
   * modello locale ha esaurito i 24 giri due volte di fila (run 2 e run 3) —
   * dopo la prima, la seconda si vede arrivare.
   */
  function aggiornaComposerUsage(usage) {
    aggiornaPiedeChatDaStato(); // 05/9 Fase 2: ChatFooter — token · giri · cache · primo token dai dati
    if (piedeDelMockup()) return; // i nodi [data-runtime-*] li scrive il componente, non questo ramo legacy
    const usageNode = $('[data-runtime-usage]');
    const tetto = state.realSession.tettoGiriDichiarato;
    if (usageNode) {
      usageNode.textContent = formattaUsageBreve(usage, { live: true, tettoGiri: tetto });
      const giri = Number(usage?.giri);
      const vicino = Number.isFinite(tetto) && tetto > 0 && Number.isFinite(giri) && giri >= Math.ceil(tetto * 0.75);
      if (vicino) usageNode.dataset.giriStato = 'vicino-al-tetto';
      else delete usageNode.dataset.giriStato;
      usageNode.title = Number.isFinite(tetto) && tetto > 0
        ? `Il kernel ha dichiarato un tetto di ${tetto} giri per questo giro di lavoro (dal messaggio «giri esauriti» di questa sessione).`
        : 'Giri usati in questo giro di lavoro. Il tetto non è dichiarato dal server: non viene mostrato.';
    }
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
    aggiornaPiedeChatDaStato(); // 05/9 Fase 2: il chip del permesso col nome umano (H22)
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
        // ⭐ 04/9, R-02 — scegliere qui è decidere: stesso gesto dell'intro, stesso flag (mai marcato «scelto» un valore che nessuno ha toccato).
        state.autonomiaScelta = true;
        salvaPreferenzeChatDesktop();
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
    /*
     * ⭐⭐⭐ O-01 (04/9) — era l'unica azione DICHIARATAMENTE finta rimasta
     * nel foglio: «File picker simulato · Il mockup rappresenta il flusso
     * senza backend», su entrambe le righe. «Allega file» ora apre il foglio
     * dei riferimenti @, che elenca i file VERI del workspace della sessione
     * (`suggerimentiRiferimentiReali`) e li scrive nel composer — e senza
     * sessione dice onestamente che non ce ne sono, invece di fingere un
     * picker. ⛔ «Screenshot / immagine» non esiste più come azione: non
     * c'è nessun canale immagine verso il modello (zero `image_url` nel
     * kernel), quindi è sceso fra le voci «Non ancora implementato» invece
     * di restare un bottone che promette qualcosa di impossibile.
     */
    $$('[data-capability-action]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.capabilityAction === 'file') openSheet('references');
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
        // ⭐ 04/9, W1-12 — due sessioni vive non portano lo stesso nome: suffisso -2, -3… e lo si dice.
        const { nome: nomeUnico, cambiato: doppioneEvitato } = nomeUnicoSessione(next, targetSessionId);
        if (targetSessionId) {
          try {
            await apiPost(`/api/v1/sessions/${encodeURIComponent(targetSessionId)}/rename`, { nome: nomeUnico });
          } catch (error) {
            toast('Rinomina non riuscita', messaggioErroreUtente(error));
            return;
          }
        }
        if (!state.sessioneTarget || targetSessionId === state.realSession.id) {
          state.session = nomeUnico;
          sessionTitle.textContent = state.session; aggiornaTestataSessione(); // 05/9 Fase 2: Topbar
          $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
          const activeSession = $('.talos-session-item[aria-current="true"] .talos-session-item__title'); // 05/9 Fase 2: SessionItem
          if (activeSession) activeSession.textContent = state.session;
        }
        state.sessioneTarget = null;
        closeEmbeddedDialog(sheetDialog);
        toast('Sessione rinominata', doppioneEvitato ? `${nomeUnico} · rinominata per evitare un doppione con una sessione viva` : nomeUnico);
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

  /**
   * ⭐⭐⭐ 3/9 — item 10: il placeholder-suggerimento è un TERZO stato del
   * composer, non uno nuovo scollegato dagli altri due (attivo/non attivo)
   * che `syncRunComposerState` già gestisce — se lo scrivessi altrove,
   * la prossima chiamata a QUESTA funzione (16 punti diversi nel file) lo
   * sovrascriverebbe con "Scrivi a TALOS..." al primo evento qualunque.
   */
  let suggerimentoComposerAttivo = null;
  /*
   * ⛔ NON chiama syncRunComposerState() da qui dentro: se questa funzione
   * è invocata DA syncRunComposerState stessa (il caso normale, vedi
   * sotto), richiamarla di nuovo sarebbe una funzione che si richiama —
   * la stessa famiglia di difetto di stamattina sul mobile (ricorsione
   * da un self-reference non notato). Chi chiama questa funzione da FUORI
   * (l'input listener, RunStarted) chiama syncRunComposerState() da sé,
   * subito dopo — mai qui dentro.
   */
  function svuotaSuggerimentoComposer() {
    if (suggerimentoComposerAttivo === null) return;
    suggerimentoComposerAttivo = null;
    composerInput.classList.remove('composer-has-suggestion');
  }

  /** Un solo punto sincronizza semantica, icona e azioni del composer. */
  /*
   * 05/9 Fase 2: ChatFooter. La striscia del giro in corso (cosa sta facendo
   * TALOS, giro, secondi, Ferma), i chip (modello · permesso · giri · costo) e
   * la barra di stato (tema · token e giri · cache · primo token) sono DATI
   * dello stato: si riscrivono qui, da syncRunComposerState (ogni transizione
   * del giro), dal timer dell'attesa (ogni secondo), da aggiornaRiassuntoBatch
   * (ogni attrezzo) e da aggiornaComposerUsage (ogni StateDelta /usage).
   * ⛔ Il costo non si stima da soli: senza un dato dal server il chip non c'e'.
   */
  let giroAvviatoA = null;
  function latenzaPrimoTokenMs() {
    const misure = [misuraLatenzaCorrente, ...[...misureLatenzaPassate].reverse()].filter(Boolean);
    for (const m of misure) {
      const inizio = m.tappe.get('invio') ?? m.tappe.get('runStarted');
      const primo = m.tappe.get('primoDelta');
      if (Number.isFinite(inizio) && Number.isFinite(primo) && primo > inizio) return primo - inizio;
    }
    return null;
  }
  function cosaStaFacendo() {
    const batch = state.realSession.batchAttivo;
    const riga = batch?.contenitore?.querySelector('[data-tool-state="running"]');
    if (riga) return { cosa: riga.querySelector('.talos-tool-row__name')?.textContent || 'Attrezzo in corso', dettaglio: riga.querySelector('.talos-tool-row__detail')?.textContent || '' };
    const attesa = state.realSession.attesaBubble?.querySelector('.run-activity-label')?.textContent;
    if (attesa) return { cosa: attesa, dettaglio: '' };
    if (state.realSession.messageElements.size > 0) return { cosa: 'TALOS sta scrivendo', dettaglio: '' };
    return { cosa: 'TALOS sta lavorando', dettaglio: '' };
  }
  function aggiornaPiedeChatDaStato() {
    const piede = $('#schermoChat .talos-chat-foot');
    if (!piede) return;
    const attivo = runRealeAttivo();
    if (attivo && giroAvviatoA === null) giroAvviatoA = performance.now();
    if (!attivo) giroAvviatoA = null;
    const { cosa, dettaglio } = attivo ? cosaStaFacendo() : { cosa: '', dettaglio: '' };
    const usage = state.realSession.usage;
    const testiTema = aggiornaPiedeChatDaStato.tema?.() || '';
    aggiornaPiedeChat(piede, {
      attivo,
      cosa,
      dettaglio,
      giro: Number.isFinite(Number(usage?.giri)) ? Number(usage.giri) : null,
      secondi: attivo && giroAvviatoA !== null ? (performance.now() - giroAvviatoA) / 1000 : null,
      usage,
      tettoGiri: state.realSession.tettoGiriDichiarato,
      latenzaMs: latenzaPrimoTokenMs(),
      costo: null,
      modello: nomeModelloBreve(state.model || state.realSession.currentRunModel), // il modello del giro se non ne e' scelto uno
      permesso: state.permissions,
      tema: testiTema,
    });
  }

  function syncRunComposerState() {
    aggiornaPiedeChatDaStato(); // 05/9 Fase 2: ChatFooter
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
    // ⭐ 3/9 — item 10: un suggerimento vale solo a riposo, campo vuoto, niente in coda.
    if (suggerimentoComposerAttivo && (attivo || haTesto)) svuotaSuggerimentoComposer();
    composerInput.placeholder = attivo ? 'Scrivi un follow-up…' : (suggerimentoComposerAttivo || (state.pendingCustomSession && !state.realSession.id ? 'Scrivi il primo messaggio…' : 'Scrivi… Invio indirizza il giro in corso, Ctrl+Invio accoda')); // 05/9 Fase 2: le parole del mockup
  }

  function mostraSuggerimentoComposer(testo) {
    if (!testo || runRealeAttivo() || composerInput.value.trim() !== '') return;
    suggerimentoComposerAttivo = testo;
    composerInput.classList.add('composer-has-suggestion');
    syncRunComposerState();
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
    // 05/9 Fase 2: Review — il DiffView del mockup (testa, righe col numero e il segno, avviso sui simboli spariti)
    const file = key.startsWith('real:') ? state.realSession.reviewFiles.get(key.slice(5)) : null;
    const schermo = $('#schermoReview');
    if (!file || !schermo) return;
    state.reviewFileCorrente = file.path;
    for (const scheda of schermo.querySelectorAll('.talos-review__scheda[role="tab"]')) { const attiva = scheda.dataset.reviewFile === key; scheda.setAttribute('aria-selected', String(attiva)); scheda.tabIndex = attiva ? 0 : -1; }
    aggiornaDiffReview(schermo.querySelector('.talos-review__diff'), file);
    $$('[data-review-action]').forEach((b) => { b.disabled = false; });
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
    return PERMESSI_SESSIONE_VALIDI.includes(contesto?.permessi) ? ` · ${etichettaPermesso(contesto.permessi)}` : ''; // 05/9 Fase 2: nome umano (H22), mai «On request» a schermo
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
      state.model = modello; aggiornaPiedeSidebar(); // 05/9 Fase 2: WorkspaceFooter
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
      // ⭐ 04/9, W1-12 — etichetta del giro corrente, non «concluso»: il giro è appena partito.
      appendStatusNote(`Impostazioni cambiate fuori da questa scheda. Questo giro usa: ${cambi.join(', ')}.`, false, { meta: `TALOS · giro ${state.realSession.runCount || 1}` });
    }
  }

  /*
   * 05/9 Fase 2: Conversazione. Il mockup raggruppa la chat in TURNI
   * (`.talos-turn`): a sinistra la spine con il numero del giro e un tick per
   * ogni giro, a destra il messaggio. Un messaggio della persona apre un turno
   * suo; tutto cio' che TALOS produce fino al messaggio successivo della
   * persona (testo, attrezzi, note, approvazioni, artefatti, attesa) sta in
   * UN turno di TALOS, e ogni nuovo giro (RunStarted) aggiunge un numero alla
   * spine. Chi monta nella chat chiama `nellaChat(elemento, tipo)`.
   */
  function turnoTalosCorrente() {
    const conversation = $('#conversation');
    const ultimo = conversation?.lastElementChild;
    if (ultimo?.classList.contains('talos-turn') && ultimo.dataset.turno === 'talos') return ultimo;
    const precedente = [...(conversation?.querySelectorAll('.talos-turn-spine__n') || [])].pop();
    const base = precedente ? Number(precedente.textContent) + 1 : 1;
    const turno = creaTurno({ numeri: [{ n: base, tick: 1, tono: 'current' }] });
    turno.dataset.turno = 'talos';
    turno.dataset.spineBase = String(base);
    turno.append(creaMessaggioTalos({ modello: nomeModelloBreve(state.realSession.currentRunModel), ora: state.realSession.deferHistoricalRendering ? '' : oraMessaggio() }));
    conversation?.appendChild(turno);
    markMotionEnter(turno);
    return turno;
  }
  function nomeModelloBreve(modello) {
    if (typeof modello !== 'string' || !modello.trim()) return '';
    return modello.replace(/^~/u, '').split('/').pop();
  }
  /** Monta un blocco nella chat: 'utente' apre un turno; tutto il resto entra nel messaggio TALOS del turno corrente. */
  function nellaChat(elemento, tipo = 'talos') {
    const conversation = $('#conversation');
    if (!conversation) return elemento;
    if (tipo === 'utente') {
      const precedente = [...conversation.querySelectorAll('.talos-turn-spine__n')].pop();
      const turno = creaTurno({ numeri: [{ n: precedente ? Number(precedente.textContent) + 1 : 1, tick: 1 }] });
      turno.dataset.turno = 'utente';
      turno.append(elemento);
      conversation.appendChild(turno);
      return turno;
    }
    const turno = turnoTalosCorrente();
    const messaggio = turno.querySelector(':scope > .talos-message');
    /*
     * I numeri della spine sono i GIRI del modello: ogni volta che TALOS riparte
     * a scrivere o a usare attrezzi dopo un blocco precedente, la spine guadagna
     * un numero (nel mockup: 2, 3, 4 nello stesso turno). Il primo blocco usa il
     * numero con cui il turno e' nato.
     */
    const eBloccoDiGiro = elemento.getAttribute('data-c') === 'ActivityBundle' && !elemento.classList.contains('real-reasoning-note');
    if (eBloccoDiGiro && messaggio.querySelector(':scope > [data-c="ActivityBundle"]:not(.real-reasoning-note)')) {
      const spine = turno.querySelector('.talos-turn-spine');
      const n = spine.querySelectorAll('.talos-turn-spine__n').length + Number(turno.dataset.spineBase || 1);
      impostaTonoUltimoTick(spine, null);
      aggiungiGiroAllaSpine(spine, { n, tick: 1, tono: 'current' });
    }
    // l'attesa resta sempre in fondo al messaggio
    const attesa = messaggio.querySelector(':scope > .talos-waiting');
    if (attesa && elemento !== attesa) messaggio.insertBefore(elemento, attesa); else messaggio.append(elemento);
    return elemento;
  }
  /** A ogni nuovo giro dentro lo stesso turno TALOS la spine guadagna un numero. */
  function segnaGiroNellaSpine() {
    const conversation = $('#conversation');
    const ultimo = conversation?.lastElementChild;
    if (!ultimo?.classList.contains('talos-turn') || ultimo.dataset.turno !== 'talos') return;
    const spine = ultimo.querySelector('.talos-turn-spine');
    impostaTonoUltimoTick(spine, null);
    const n = spine.querySelectorAll('.talos-turn-spine__n').length + Number(ultimo.dataset.spineBase || 1);
    aggiungiGiroAllaSpine(spine, { n, tick: 1, tono: 'current' });
  }
  /** Il tick del giro corrente cresce con gli attrezzi usati (fino a 5) e prende il tono dell'esito. */
  function aggiornaTickGiro({ attrezzi = null, tono } = {}) {
    const conversation = $('#conversation');
    const ultimo = conversation?.lastElementChild;
    if (!ultimo?.classList.contains('talos-turn')) return;
    const tick = ultimo.querySelector('.talos-turn-spine__tick:last-of-type');
    if (!tick) return;
    if (Number.isFinite(attrezzi)) tick.dataset.tick = String(Math.min(5, Math.max(1, attrezzi)));
    if (tono !== undefined) impostaTonoUltimoTick(ultimo.querySelector('.talos-turn-spine'), tono);
  }

  function appendRealTaskStart(task, contesto = null) {
    const conversation = $('#conversation');
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
    const testoBolla = task.consegna || task.consegnaCorta || task.comandoDiretto || (task.id ? task.id : 'Comando diretto');
    const etichettaMeta = (task.id
      ? `Task reale · ${task.id}`
      : (task.consegna || task.consegnaCorta)
        ? `Compito libero${task.progetto ? ` · ${task.progetto}` : ''}`
        : 'Comando diretto') + etichettaPermessiGiro(contesto);
    // 05/9 Fase 2: Conversazione — il messaggio della persona nel blocco del mockup (ora · etichetta del giro)
    const article = nellaChat(creaMessaggioUtente({ testo: testoBolla, ora: state.realSession.deferHistoricalRendering ? '' : oraMessaggio(), meta: etichettaMeta }), 'utente');
    void conversation;
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
    /*
     * ⛔ 03/9 — si ricorda QUI, dove il testo passa per davvero, e non
     * rileggendolo dal DOM: una bolla può essere ridisegnata, tradotta o
     * troncata, e «chiedi di nuovo» manderebbe una domanda diversa da
     * quella che la persona vede.
     */
    if (typeof text === 'string' && text.trim() !== '') state.realSession.ultimaDomanda = text;
    // 05/9 Fase 2: Conversazione — il follow-up e' un messaggio della persona nel blocco del mockup
    const article = nellaChat(creaMessaggioUtente({ testo: text, ora: state.realSession.deferHistoricalRendering ? '' : oraMessaggio(), meta: `Follow-up${etichettaPermessiGiro(contesto)}` }), 'utente');
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
    // 05/9 Fase 2: Conversazione — l'attesa e' lo scheletro del mockup con la riga animata del marchio (stessa immagine del mobile)
    const { blocco: article, label: labelEl, elapsed } = creaAttesa({ etichetta });
    article.dataset.activity = stato;
    nellaChat(article);
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
      aggiornaPiedeChatDaStato(); // 05/9 Fase 2: ChatFooter — i secondi della striscia
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
    /*
     * 05/9 Fase 2: Conversazione. Il testo di TALOS scorre nel messaggio del
     * turno corrente: `article` e' il contenitore del testo (`.assistant-copy`,
     * il gancio del render incrementale) e le azioni (copia · ascolta · chiedi
     * di nuovo) sono il blocco del mockup, visibile al passaggio del mouse.
     * Il turno porta gia' la testata (avatar · TALOS · modello · ora).
     */
    const turno = turnoTalosCorrente();
    const messaggio = turno.querySelector(':scope > .talos-message');
    const testataMeta = messaggio.querySelector('.talos-message__meta');
    if (testataMeta && state.realSession.currentRunModel) testataMeta.textContent = [nomeModelloBreve(state.realSession.currentRunModel), state.realSession.deferHistoricalRendering ? '' : oraMessaggio()].filter(Boolean).join(' · ');
    const article = document.createElement('div');
    article.className = 'talos-message__copy';
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    article.append(copy);
    nellaChat(article);
    const azioni = creaAzioniMessaggio({ ascolta: sintesiVoceDisponibile });
    azioni.querySelector('[data-message-action="copy"]').addEventListener('click', () => copyText(copy.textContent || '', 'Risposta copiata'));
    const ascolta = azioni.querySelector('[data-message-action="listen"]');
    if (ascolta) ascolta.addEventListener('click', () => leggiVoceAlta(copy.textContent || '', ascolta));
    azioni.querySelector('[data-message-action="ask-again"]').addEventListener('click', () => {
      const domanda = state.realSession.ultimaDomanda;
      if (!domanda) { toast('Nessuna domanda da rimandare', 'Questa risposta non ha una domanda registrata in questa sessione.'); return; }
      void resumeSession(domanda);
    });
    const vecchieAzioni = messaggio.querySelector(':scope > .talos-message__actions');
    if (vecchieAzioni) vecchieAzioni.remove();
    nellaChat(azioni);
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
    // 05/9 Fase 2: Conversazione — il batch e' l'ActivityBundle del mockup (testa richiudibile, righe dentro)
    const attivita = creaAttivita({ riassunto: 'Attivita\u2026' });
    const article = attivita.card;
    const { contenitore, summaryText } = attivita;
    const diffBadge = { hidden: true, replaceChildren() {} }; // il badge del diff vive nella testa: vedi aggiornaRiassuntoBatch
    nellaChat(article);
    markMotionEnter(article);
    scorriAllaBollaAppesa(article);
    const batch = {
      contenitore,
      summaryText,
      diffBadge,
      testa: attivita.testa,
      attrezzi: 0,
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
    aggiornaPiedeChatDaStato(); // 05/9 Fase 2: ChatFooter
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
    if (c.diffAgg > 0 || c.diffRim > 0) impostaDiffAttivita(batch.testa, c.diffAgg, c.diffRim); // 05/9 Fase 2: «+18 −2» nella testa del bundle
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
  function appendToolNote(riassuntoIniziale, { classeExtra = '', glifo = '⚙', contenitore, attrezzo = '' } = {}) {
    /*
     * 05/9 Fase 2: Conversazione — ogni attrezzo e' una ToolRow del mockup:
     * icona per attrezzo, nome umano, dettaglio (percorso/comando) e pallino
     * dell'esito; il corpo espandibile (`detail`) tiene argomenti ed esito.
     * Il ragionamento (`real-reasoning-note`) usa la stessa riga con l'icona
     * del cervello, in un suo bundle.
     */
    void glifo;
    const nomeAttrezzo = attrezzo || (classeExtra.includes('reasoning') ? 'memory_write' : ''); // l'icona della riga segue l'attrezzo
    const riga = creaRigaAttrezzo({ attrezzo: nomeAttrezzo, nome: riassuntoIniziale, dettaglio: '', esito: null, conDettaglio: true });
    let article = riga.riga;
    const summaryText = riga.summaryText;
    const detail = riga.corpo;
    detail.classList.add('assistant-copy');
    if (contenitore) {
      if (classeExtra) article.classList.add(...classeExtra.split(' ').filter(Boolean));
      contenitore.append(article, detail);
    } else {
      const bundle = creaAttivita({ riassunto: riassuntoIniziale, aperto: false });
      bundle.contenitore.append(riga.riga, detail);
      if (classeExtra) bundle.card.classList.add(...classeExtra.split(' ').filter(Boolean));
      article = bundle.card; // e' il bundle che si nasconde/mostra (aggiornaVisibilitaRagionamento)
      nellaChat(article);
    }
    markMotionEnter(article);
    window.setTimeout(() => {
      if (article.hidden) return;
      if (!$('#conversation')?.classList.contains('is-restoring')) article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' });
    }, 40);
    return { article, summaryText, detail, dettaglio: riga.dettaglio }; // 05/9 Fase 2: anche il dettaglio mono della riga
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
    // 05/9 Fase 2: Conversazione — la scheda dell'artefatto del mockup; «Apri» lo apre in una scheda del browser
    const src = API(`/api/v1/artifacts/${encodeURIComponent(id)}`);
    const { card: article, frame } = creaArtefatto({ titolo: titolo || 'Artefatto', src, onApri: () => window.open(src, '_blank', 'noopener') });
    article.classList.add('real-artifact-card');
    nellaChat(article);
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

  /**
   * ⭐⭐⭐ 3/9 — item 10, owner: "un po' come fa Claude di dare al modello
   * una risposta come suggerimento… nel composer spunta come placeholder…
   * premo tab e diventa testo". Il BERSAGLIO nudo (nome file, comando…),
   * non una frase — il verbo lo mette la frase-suggerimento più sotto, e
   * ripeterlo qui sarebbe come `bersaglioAttrezzo` nel bundle mobile
   * (stessa idea, adattata ai nomi-campo di QUESTO codebase: `descrizione`
   * prima di `comando` per shell, come fa già `riassuntoAttrezzo`).
   */
  function bersaglioAttrezzoNudo(nome, argomenti) {
    const a = argomenti || {};
    switch (nome) {
      case 'leggi': case 'scrivi': return a.percorso || '';
      case 'cerca': return [a.nome, a.testo].filter(Boolean).map((v) => `"${v}"`).join(' · ');
      case 'shell': return a.descrizione ? tronca(a.descrizione, 60) : (a.comando ? tronca(a.comando, 60) : '');
      case 'naviga': return a.url || '';
      case 'web_search': return a.query ? `"${tronca(a.query, 60)}"` : '';
      case 'delega_sottotask': return a.task ? tronca(a.task, 60) : '';
      default: return ''; // elenca/prova/altri: nessun bersaglio singolo pulito, meglio niente che un suggerimento goffo
    }
  }

  /** Da dove viene il testo del suggerimento: il bersaglio dell'ultimo attrezzo del giro appena concluso, non una chiamata al modello inventata apposta (costerebbe un giro intero per un extra facoltativo). */
  function suggerimentoDaUltimoAttrezzo() {
    const ultimo = state.realSession.ultimoBersaglioAttrezzo;
    if (!ultimo || !ultimo.nome) return null;
    const bersaglio = bersaglioAttrezzoNudo(ultimo.nome, ultimo.argomenti);
    if (!bersaglio) return null;
    switch (ultimo.nome) {
      case 'leggi': return `Dimmi di più su ${bersaglio}`;
      case 'scrivi': return `Rivediamo le modifiche in ${bersaglio}`;
      case 'cerca': return `Approfondisci ${bersaglio}`;
      case 'shell': return `Spiega cosa ha fatto: ${bersaglio}`;
      case 'naviga': return `Cosa dice ${bersaglio}?`;
      case 'web_search': return `Trova di più su ${bersaglio}`;
      case 'delega_sottotask': return `Com'è andata: ${bersaglio}`;
      default: return null;
    }
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
      // ⛔ owner 04/9: qui finivano `web_search(…)`, `time_now(…)`, `document_create(…)` — nomi TECNICI a schermo. Il ripiego ora è il nome umano (nomeUmanoAttrezzo, unica mappa), e resta il nome grezzo solo per un attrezzo che nessuno ha ancora etichettato.
      default: return `${nomeUmanoAttrezzo(nome)}…`;
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
      // ⛔ owner 04/9: qui finivano `web_search(…)`, `time_now(…)`, `document_create(…)` — nomi TECNICI a schermo. Il ripiego ora è il nome umano (nomeUmanoAttrezzo, unica mappa), e resta il nome grezzo solo per un attrezzo che nessuno ha ancora etichettato.
      default: return `${nomeUmanoAttrezzo(nome)}…`;
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

  function appendStatusNote(text, isError = false, { meta: etichettaMeta = null } = {}) {
    // 05/9 Fase 2: Conversazione — la nota di sistema del mockup (badge Nota/Errore, titolo = l'etichetta di prima)
    const article = creaNotaSistema({ tipo: isError ? 'danger' : 'info', badge: isError ? 'Errore' : 'Nota', titolo: etichettaMeta || (isError ? 'TALOS · errore' : 'TALOS · concluso'), testo: text });
    article.classList.add('real-session-status');
    if (isError) article.classList.add('real-session-error');
    nellaChat(article);
    if (isError) aggiornaTickGiro({ tono: 'danger' });
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
    /*
     * ⭐⭐⭐ 04/9 — W1-13: il cancello sui file di controllo (session-registry.mjs,
     * costruisciCancelloFileDiControllo) manda `fileDiControllo:true` sulla
     * STESSA forma {tipo:'scrivi', percorso} — la card deve dirlo: non è
     * "scrivi un file", è "riscrivi una regola dell'agente" (hook, MCP,
     * istruzioni, memoria), anche quando la sessione è in Full access.
     */
    if (azione?.tipo === 'scrivi' && azione.fileDiControllo) return `Vuole scrivere un file di controllo di TALOS (regole dell'agente, non un file del progetto): ${azione.percorso}`;
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
    /*
     * 05/9 Fase 2: Conversazione — la scheda di approvazione del mockup: cosa
     * chiede (badge), il bersaglio, il perche', e tre risposte. «Per questa
     * sessione» approva E ricorda «sempre» per quell'attrezzo nelle
     * impostazioni della sessione (permessiPerAttrezzo), cosi' la prossima
     * volta non chiede. Il piede porta `sheet-actions` e il perche'
     * `assistant-copy`: ApprovalResolved li trova come prima.
     */
    const bersaglio = azione?.percorso || azione?.comando || azione?.question || azione?.title || '';
    const badge = azione?.tipo === 'scrivi' ? 'Chiede di scrivere' : (azione?.tipo === 'shell' || azione?.tipo === 'prova') ? 'Chiede di eseguire' : azione?.tipo === 'research_start' ? 'Chiede di cercare' : 'Chiede il permesso';
    const scheda = creaApprovazione({ badge, bersaglio, perche: descriviAzioneApprovazione(azione), nota: 'Vale solo per questa richiesta' });
    const article = scheda.scheda;
    article.classList.add('real-approval-card');
    article.dataset.requestId = requestId;
    const negaBtn = scheda.pulsanti.nega;
    const approvaBtn = scheda.pulsanti.unaVolta;
    const sessioneBtn = scheda.pulsanti.sessione;
    let rispostaDataDaQuestaScheda = false;
    const rispondi = async (approvato, perSessione = false) => {
      negaBtn.disabled = true;
      approvaBtn.disabled = true;
      sessioneBtn.disabled = true;
      rispostaDataDaQuestaScheda = true;
      if (approvato && perSessione && azione?.tipo) {
        try { await sincronizzaImpostazioniSessione({ permessiPerAttrezzo: { ...(state.permessiPerAttrezzo || {}), [azione.tipo]: 'sempre' } }); } catch { /* il permesso resta «chiedi»: la risposta alla richiesta parte comunque */ }
      }
      try {
        await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/approve`, { requestId, approvato });
        // ⛔ NIENT'ALTRO qui apposta — vedi il commento sopra: il case ApprovalResolved finalizza la card, sempre e solo lui.
      } catch (error) {
        rispostaDataDaQuestaScheda = false;
        negaBtn.disabled = false;
        approvaBtn.disabled = false;
        sessioneBtn.disabled = false;
        toast('Risposta non riuscita', error.message);
      }
    };
    negaBtn.addEventListener('click', () => rispondi(false));
    approvaBtn.addEventListener('click', () => rispondi(true));
    sessioneBtn.addEventListener('click', () => rispondi(true, true));
    nellaChat(article);
    aggiornaTickGiro({ tono: 'warning' });
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
    aggiornaRigaBrowserCapability(); // O-01 — la scheda Capability conta le pagine vere, non un «Non osservato» fisso
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
          // ⛔ 04/9, owner: niente nomi tecnici come etichetta. Nome umano primario, identificativo come dettaglio — la forma raccomandata dall'Agent Client Protocol («title» in evidenza, «name» secondario).
          righe.push(`**🔧 ${nomeUmanoAttrezzo(info.nome)}** · \`${info.nome}\``, '', 'Argomenti:', blocco(argFormattati || '(nessuno)', 'json'), '', 'Esito (completo, mai troncato):', blocco(String(evento.content ?? '')), '');
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
      giro: state.realSession.runCount || null, // 05/9 Fase 2: Review — «giro N» nella riga
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
    aggiornaTestataSessione(); // 05/9 Fase 2: Topbar — il badge della Review segue i file toccati
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
    /*
     * 05/9 Fase 2: Review. Le righe sono `talos-list-row` del mockup
     * (percorso, «giro N · nuovo file/file modificato», +A −R); il sommario va
     * nella testata della schermata («3 file modificati · +112 −2»); i pulsanti
     * che aspettano una rotta (Accetta/Scarta/Apri nell'editor) restano nascosti.
     */
    const schermo = $('#schermoReview');
    const contenitore = schermo?.querySelector('.talos-review__schede .talos-tabs__list'); // owner 05/09: schede in alto, diff sotto
    if (!contenitore) return;
    const voci = [...state.realSession.reviewFiles.values()];
    aggiornaTestataSessione(); // 05/9 Fase 2: Topbar — il badge della Review segue i file toccati
    const ultimoPercorso = state.reviewFileCorrente && state.realSession.reviewFiles.has(state.reviewFileCorrente) ? state.reviewFileCorrente : voci.at(-1)?.path;
    contenitore.replaceChildren(...voci.map((file) => creaRigaFileReview(file, {
      attiva: file.path === ultimoPercorso,
      onApri: () => renderReviewFile(`real:${file.path}`),
    })));
    if (voci.length === 0) {
      const vuoto = textElement('span', 'talos-tabs__tab talos-review__scheda talos-muted review-empty', 'Nessun file scritto finora.');
      vuoto.id = 'reviewEmptyList';
      contenitore.appendChild(vuoto);
      aggiornaDiffReview(schermo.querySelector('.talos-review__diff'), null);
    }
    const percorsoTestata = schermo.querySelector('.talos-topbar__path');
    if (percorsoTestata) percorsoTestata.textContent = riassuntoReview(voci);
    const titoloTestata = schermo.querySelector('.talos-topbar__title h1');
    if (titoloTestata && state.session) titoloTestata.textContent = state.session;
    nascondiAzioniFase3(schermo);
    // tastiera sulle schede dei file (WAI-ARIA tabs, attivazione automatica: il diff e' gia' nel DOM)
    if (!contenitore.dataset.tastiera) {
      contenitore.dataset.tastiera = 'si';
      contenitore.addEventListener('keydown', (event) => {
        const schede = [...contenitore.querySelectorAll('[role="tab"]')];
        const i = schede.indexOf(document.activeElement);
        if (i < 0 || schede.length === 0) return;
        let j = i;
        if (event.key === 'ArrowRight') j = (i + 1) % schede.length;
        else if (event.key === 'ArrowLeft') j = (i - 1 + schede.length) % schede.length;
        else if (event.key === 'Home') j = 0;
        else if (event.key === 'End') j = schede.length - 1;
        else return;
        event.preventDefault();
        schede[j].focus();
        schede[j].click();
      });
    }
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
    // ⭐ 03/9 — "risali": abilitato quanto gli altri comandi (una sessione reale, non l'anteprima), ma NON legato a Full access — sola lettura, sempre disponibile.
    const bottoneUp = $('#fileTreeUp');
    if (bottoneUp) {
      bottoneUp.disabled = !enabled || !fuoriSessioneDisponibile();
      const aperto = state.realSession.fuoriSessioneAperto;
      bottoneUp.setAttribute('aria-pressed', String(aperto));
      bottoneUp.title = aperto ? 'Chiudi, torna alla sessione' : 'Risali fuori dalla sessione';
      bottoneUp.setAttribute('aria-label', aperto ? 'Chiudi, torna alla sola cartella della sessione' : 'Risali fuori dalla sessione (sola lettura)');
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

  /**
   * ⭐⭐⭐ 03/9, owner: "il file tree deve esplorare tutto TUTTO a
   * prescindere da full access o meno... ho bisogno di risalire a
   * directory sopra o diverse". SOLA LETTURA per costruzione — workspaceBrowser
   * (server.mjs, radice = disco intero, già usato dal selettore cartelle
   * di "Nuova sessione") espone solo browse+createFolder, mai
   * leggi/scrivi/rinomina/elimina: la persona vede più di quanto il
   * modello possa toccare, mai il contrario. Il confine di scrittura vero
   * resta `voce.cartella` (si allarga solo con Full access, lavoro
   * separato) — questa funzione non lo cambia e non lo può cambiare.
   */
  function fuoriSessioneDisponibile() {
    const radice = state.realSession.cartellaAssoluta;
    return typeof radice === 'string' && radice.length > 0;
  }

  async function caricaFuoriSessione(percorso) {
    const suffix = percorso ? `?path=${encodeURIComponent(percorso)}` : '';
    const dati = await apiGet(`/api/v1/workspace-browser${suffix}`);
    state.realSession.fuoriSessionePercorso = dati.path;
    state.realSession.fuoriSessioneDati = dati;
    return dati;
  }

  async function apriFuoriSessione() {
    if (!fuoriSessioneDisponibile()) return;
    const button = $('#fileTreeUp');
    try {
      if (button) button.disabled = true;
      // Primo click: parte dal genitore della cartella della sessione — "risali", non "riparti da zero".
      await caricaFuoriSessione(state.realSession.cartellaAssoluta);
      if (state.realSession.fuoriSessioneDati?.parent) {
        await caricaFuoriSessione(state.realSession.fuoriSessioneDati.parent);
      }
      state.realSession.fuoriSessioneAperto = true;
      await renderizzaAlberoReale();
    } catch (error) {
      toast('Non riesco a risalire', messaggioErroreUtente(error, 'Riprova, o apri Doctor se persiste.'));
    } finally {
      if (button) button.disabled = false;
    }
  }

  function chiudiFuoriSessione() {
    state.realSession.fuoriSessioneAperto = false;
    state.realSession.fuoriSessionePercorso = null;
    state.realSession.fuoriSessioneDati = null;
    renderizzaAlberoReale();
  }

  async function navigaFuoriSessione(percorso) {
    try {
      await caricaFuoriSessione(percorso);
      await renderizzaAlberoReale();
    } catch (error) {
      toast('Cartella non disponibile', messaggioErroreUtente(error, 'Scegline un’altra.'));
    }
  }

  /** Il pannello tratteggiato "fuori dalla sessione": un livello, sola lettura, mai unito alla cache dell'albero vero. */
  /** Ultimo pezzo di un percorso, come nome mostrabile — 'C:\\' non ha un ultimo pezzo, resta il percorso intero (è già il nome più chiaro possibile per una radice di disco). */
  function nomeDaPercorso(percorso) {
    const pulito = String(percorso || '').replace(/[/\\]+$/, '');
    const ultimo = pulito.split(/[/\\]/u).pop();
    return ultimo || percorso;
  }

  /**
   * ⭐⭐⭐ 03/9 — owner, dal vivo: "se risalgo... faccio tasto destro e uso
   * come radice, dovrebbe abilitarmi a cambiare il workspace o no? se no
   * sarebbe una funzione inutile". Aveva ragione — mancava del tutto.
   * Bottone "usa come radice" su OGNI riga (icona i-check, sempre
   * visibile — non nascosto dietro un hover: è una capacità nuova, deve
   * trovarsi da sola) PIÙ sulla cartella corrente in testata, così non
   * serve entrarci prima solo per poterla scegliere. Ogni riga è un <div>
   * con DUE bottoni separati (navighiamo/adottiamo), mai un bottone
   * annidato in un altro — invalido in HTML.
   */
  function costruisciRigaAdottaFuoriSessione(percorsoAssoluto, nome) {
    const bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'ft-outside-row-adopt';
    bottone.setAttribute('aria-label', `Usa "${nome}" come radice — apre una sessione nuova con Full access`);
    bottone.title = 'Usa come radice (sessione nuova, Full access)';
    bottone.append(iconaSvgAlbero('i-check'));
    bottone.addEventListener('click', (evento) => {
      evento.stopPropagation();
      usaCartellaFuoriSessioneComeRadice(percorsoAssoluto, nome);
    });
    return bottone;
  }

  function costruisciZonaFuoriSessione() {
    const dati = state.realSession.fuoriSessioneDati;
    const zona = document.createElement('div');
    zona.className = 'ft-outside-zone';

    const testata = document.createElement('div');
    testata.className = 'ft-outside-zone-head';
    testata.append(iconaSvgAlbero('i-eye'));
    const etichetta = textElement('span', '', dati ? `Fuori dalla sessione · sola lettura · ${dati.path}` : 'Fuori dalla sessione · sola lettura');
    etichetta.title = dati?.path || '';
    testata.append(etichetta);
    if (dati) testata.append(costruisciRigaAdottaFuoriSessione(dati.path, nomeDaPercorso(dati.path)));
    const chiudi = document.createElement('button');
    chiudi.type = 'button';
    chiudi.className = 'ft-outside-zone-close';
    chiudi.setAttribute('aria-label', 'Chiudi, torna alla sola cartella della sessione');
    chiudi.title = 'Chiudi';
    chiudi.append(iconaSvgAlbero('i-x'));
    chiudi.addEventListener('click', chiudiFuoriSessione);
    testata.append(chiudi);
    zona.append(testata);

    if (!dati) {
      zona.append(textElement('p', 'ft-outside-empty', 'Carico…'));
      return zona;
    }
    if (dati.parent) {
      const su = document.createElement('button');
      su.type = 'button';
      su.className = 'ft-outside-row ft-outside-row-up';
      su.append(iconaSvgAlbero('i-arrow-left'), textElement('span', '', '..'));
      su.addEventListener('click', () => navigaFuoriSessione(dati.parent));
      zona.append(su);
    }
    if (dati.items.length === 0) {
      zona.append(textElement('p', 'ft-outside-empty', 'Questa cartella non contiene altre cartelle.'));
    }
    for (const voce of dati.items) {
      const riga = document.createElement('div');
      riga.className = 'ft-outside-row-wrap';
      const naviga = document.createElement('button');
      naviga.type = 'button';
      naviga.className = 'ft-outside-row';
      naviga.append(iconaSvgAlbero('i-folder'), textElement('span', '', voce.name));
      naviga.addEventListener('click', () => navigaFuoriSessione(voce.path));
      riga.append(naviga, costruisciRigaAdottaFuoriSessione(voce.path, voce.name));
      zona.append(riga);
    }
    return zona;
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
    permissions: 'Workspace write', permessiPerAttrezzo: {}, autonomiaScelta: false,
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
      autonomiaScelta: boolValue(record.autonomiaScelta, false),
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
      autonomiaScelta: state.autonomiaScelta,
    });
    salvaImpostazioniDesktop(documento);
  }
  function inizializzaPreferenzeChatDesktop() {
    const preferenze = leggiImpostazioniDesktop().chat;
    state.model = preferenze.model;
    state.effort = preferenze.effort;
    state.autonomiaScelta = preferenze.autonomiaScelta;
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
    /*
     * ⭐⭐⭐ 05/9, fase 1 del piano «il mockup diventa la app»: i colori NON si
     * scrivono più come stili in linea sulla radice. Il foglio è quello del
     * mockup e i suoi token sono la sola fonte; il chiaro/scuro è
     * `:root[data-theme="light"]`, come nel mockup. Senza questo innesto la
     * app partiva con la palette CHIARA del vecchio CSS sopra il tema Calm
     * scuro (`colorMode: system` su una macchina senza preferenza scura), e
     * ogni pixel divergeva dal mockup. I preset di tema del vecchio pannello
     * Aspetto tornano quando la Fase 2 ridisegna quel pannello.
     */
    const light = mode === 'light';
    if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    root.style.setProperty('color-scheme', light ? 'light' : 'dark');
    const colors = { bg: getComputedStyle(root).getPropertyValue('--talos-background').trim() || (light ? '#f5f3ee' : '#1e1f22') };
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
    aggiornaPiedeSidebar(); // 05/9 Fase 2: WorkspaceFooter segue il tema
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
   * invece di inventare un secondo modo di cambiare radice: una nuova
   * radice/progetto resta per costruzione una sessione NUOVA. La
   * sessione corrente resta intatta, ancora nella sidebar, mai toccata.
   *
   * ⛔⛔ 03/9 — CORRETTO: questo commento diceva "session-registry.mjs
   * non ha, e non avrà per scelta, un modo di mutare voce.cartella su
   * una sessione già avviata". Non è più vero: `aggiornaImpostazioni`
   * ORA lo fa (session-registry.mjs, cartellaEffettivaPerPermessi) —
   * owner, 03/9: "anche dopo aver abilitato full access... il modello
   * deve potere accedere a qualunque cartella", nella STESSA sessione,
   * mai una sessione nuova. Le due cose restano DIVERSE per scopo, non
   * per capacità tecnica: `impostaComeRadice` cambia PROGETTO (nuovo
   * file tree, nuova conversazione) — accendere "Full access" dalla
   * pillola permessi allarga il raggio SENZA perdere la sessione, la
   * conversazione, il contesto. Questa funzione resta la via giusta
   * per un vero cambio di progetto; non la via per un allargamento
   * temporaneo.
   *
   * ⛔ Passa SEMPRE per "Full access": il percorso scelto è ASSOLUTO
   * arbitrario per il meccanismo che lo riceve (anche se oggi è dentro
   * la radice corrente, `cartellaLibera` non lo sa e non deve saperlo —
   * un solo modo di dire "percorso a piacere", mai due). Il permesso
   * cambia di conseguenza, MAI in silenzio — `impostaPermesso` mostra
   * sempre il suo stesso toast "Policy aggiornata".
   */
  /** Il nucleo comune: apre una sessione NUOVA su un percorso ASSOLUTO, sempre Full access. Condiviso da impostaComeRadice (dentro l'albero) e usaCartellaFuoriSessioneComeRadice (fuori). */
  function avviaComeNuovaRadice(percorsoAssoluto, nome) {
    impostaPermesso('Full access', `Full access · nuova radice: ${nome}`);
    avviaSessionePendente({ cartellaLibera: percorsoAssoluto, nomeCartella: nome, modello: state.model, effort: state.effort, permessi: 'Full access', permessiPerAttrezzo: { ...state.permessiPerAttrezzo } });
  }

  function impostaComeRadice(percorsoRelativo, nome) {
    const radice = state.realSession.cartellaAssoluta;
    if (!radice) {
      toast('Radice sconosciuta', 'Questa sessione non ha ancora dichiarato il proprio percorso — riprova appena parte il primo giro.');
      return;
    }
    avviaComeNuovaRadice(`${radice.replace(/[/\\]+$/, '')}/${percorsoRelativo}`, nome);
  }

  /**
   * ⭐⭐⭐ 03/9 — owner, dal vivo: "se risalgo... faccio tasto destro e uso
   * come radice, quello dovrebbe abilitarmi a cambiare il workspace o no?
   * se no sarebbe una funzione inutile". Aveva ragione: `impostaComeRadice`
   * costruisce SEMPRE `radiceSessione + '/' + percorso` — per una cartella
   * FUORI dalla sessione (percorso già ASSOLUTO, mai relativo alla radice
   * corrente) quella concatenazione produce un percorso rotto. Questa è la
   * via SEPARATA per la zona fuori sessione: percorso assoluto diretto,
   * nessuna concatenazione — stesso nucleo (avviaComeNuovaRadice), stesso
   * risultato di impostaComeRadice (sessione nuova, Full access).
   */
  function usaCartellaFuoriSessioneComeRadice(percorsoAssoluto, nome) {
    avviaComeNuovaRadice(percorsoAssoluto, nome);
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

  /**
   * ⭐⭐⭐ O-03 — owner 04/9: la radice dell'albero mostrava `libero:default`
   * invece del nome della cartella vera. `state.realSession.taskId` NON è
   * mai il nome di una cartella: per un task del catalogo è l'id del
   * corpus, per una sessione libera è un id SINTETICO — lato client
   * `libero:${nomeCartella}` (startCustomSession) o lato server
   * `libero:workspace-launch` / `libero:full-access` / `libero:${cartellaId}`
   * (session-registry.mjs, avviaLibero) — ed è quasi sempre valorizzato,
   * quindi un `||` che lo controlla per primo non arriva mai al dato onesto.
   * Ordine corretto: la cartella VERA (RunStarted→contesto.cartella,
   * cartellaAssoluta — via aggiornaPannelloAmbiente, l'unica fonte di
   * verità), poi il nome scelto nel foglio "Nuova sessione" prima che
   * RunStarted arrivi (previewWorkspaceName, avviaSessionePendente), mai
   * il taskId. Se nessuno dei due è ancora noto: un placeholder generico
   * onesto, mai un identificativo interno.
   */
  function nomeRadiceAlberoReale() {
    return nomeDaPercorso(state.realSession.cartellaAssoluta) || state.realSession.previewWorkspaceName || 'workspace';
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
    radice.append(iconaSvgAlbero('i-files'), textElement('strong', '', nomeRadiceAlberoReale()));
    // ⭐⭐⭐ 28/8, owner: "comandi crud in generale" — creare un file/una cartella senza dover prima cliccare col destro su una cartella esistente: la radice stessa accetta lo stesso menu, ridotto alle due sole voci di creazione (percorsoBase '').
    if (!alberoInAnteprima()) radice.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // ⛔ O-03, verificato: soloCreazione=true qui sotto ⇒ apriMenuAzioniFile mostra SOLO "Nuovo file"/"Nuova cartella" (avviaCreaVoce), che non legge mai `nome` — questo parametro è inerte in questo punto di chiamata, ma resta onesto invece di un `libero:*` morto lì dentro.
      apriMenuAzioniFile('', nomeRadiceAlberoReale(), { x: e.clientX, y: e.clientY }, true, true);
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

    /*
     * ⭐⭐⭐ 03/9 — "risali fuori dalla sessione": la zona tratteggiata (sola
     * lettura, workspaceBrowser) sta SOPRA, l'albero vero (radice+ul,
     * struttura invariata) si racchiude in una "vault card" — il confine di
     * scrittura del modello reso letteralmente visibile — SOLO mentre la
     * zona è aperta. Zona chiusa (lo stato di sempre): zero elementi in
     * più, stessa identica struttura di prima di oggi.
     */
    if (state.realSession.fuoriSessioneAperto) {
      /*
       * ⛔ 03/9, trovato dal vivo: bordo/fondo d'accento da soli (34%/14% di
       * opacità) sono troppo deboli su un tema chiaro già caldo — non
       * bastano a "mai confondere le due cose a schermo". Un'etichetta
       * esplicita, simmetrica a quella della zona esterna, è il segnale
       * vero: le parole, non solo il colore.
       */
      const vaultLabel = document.createElement('div');
      vaultLabel.className = 'ft-session-boundary-head';
      vaultLabel.append(iconaSvgAlbero('i-shield'), textElement('span', '', 'Qui il modello può scrivere'));
      const vault = document.createElement('div');
      vault.className = 'ft-session-boundary';
      vault.append(vaultLabel, radice, ul);
      contenitore.replaceChildren(costruisciZonaFuoriSessione(), vault);
    } else {
      contenitore.replaceChildren(radice, ul);
    }

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
    const repoAnnidati = $('#envRepoAnnidati');
    if (workspace) workspace.textContent = contesto.progetto || '—';
    if (branch) branch.textContent = contesto.branch || '—';
    if (worktree) worktree.textContent = '—'; // mai un repository git nel corpus di oggi, vedi doc in workspace-context.mjs
    if (root) root.textContent = contesto.cartella;
    /*
     * ⭐⭐⭐ 04/9 — W1-13: `contesto.repoAnnidati` arriva già da
     * workspace-context.mjs (repoAnnidati()), inoltrato senza modifiche da
     * RunStarted.contesto — niente qui lo calcola di nuovo. Onesto come
     * `worktree` sopra: "—" quando l'elenco è vuoto, MAI un elenco
     * inventato. La dicitura dichiara esplicitamente la fiducia separata
     * (Claude Code 2.1.232: un repo annidato non eredita CLAUDE.md/hook
     * del workspace) — non solo "ce ne sono N".
     */
    if (repoAnnidati) {
      const elenco = Array.isArray(contesto.repoAnnidati) ? contesto.repoAnnidati : [];
      if (elenco.length === 0) {
        repoAnnidati.textContent = '—';
        repoAnnidati.title = '';
      } else {
        repoAnnidati.textContent = `${elenco.length} (fiducia separata)`;
        repoAnnidati.title = `Hanno una fiducia separata dal workspace: ${elenco.join(', ')}`;
      }
    }
    // ⭐⭐⭐ 28/8 — tenuta anche in stato, non solo nel DOM: serve a "Imposta come radice" (menu dell'albero) per calcolare il percorso assoluto di una sottocartella.
    state.realSession.cartellaAssoluta = contesto.cartella || null;
    aggiornaTestataSessione(); aggiornaPiedeSidebar(); // 05/9 Fase 2: la cartella è arrivata (RunStarted)
    const sezione = $('[data-inspector-section="context"]');
    const demoBadge = sezione && $('.demo-surface-badge', sezione);
    if (demoBadge) demoBadge.hidden = true;
  }

  /**
   * ⭐⭐⭐ O-01 (04/9) — la scheda «Capability» del Context rail, sorella
   * del foglio del pulsante «+» (lo stesso bottone «Gestisci capability»
   * apre quel foglio).
   *
   * ⛔ Le sue quattro righe erano TESTO STATICO in index.html, mai toccato
   * da una riga di JS: «Attrezzi —», «MCP —», «Web search: Non
   * osservato», «Browser: Non osservato». I due trattini erano il caso
   * peggiore: né un numero vero né la dichiarazione onesta che gli altri
   * due avevano.
   *
   * ⭐ Il +1 sui concorrenti: la riga «Web search» dice la FONTE REALE
   * configurata adesso (letta dalla stessa `ricercaWebFn` che il kernel
   * riceve a ogni giro), non un «configurato/non configurato» dedotto
   * dall'esistenza di una chiave. È esattamente il difetto aperto su Hermes
   * Agent (issue #13301, agosto 2026): il suo setup dichiara «not
   * configured» per gli attrezzi gestiti dal gateway — web search compresa —
   * perché guarda le chiavi nel .env invece della configurazione con cui
   * l'attrezzo gira davvero.
   */
  async function aggiornaSchedaCapability() {
    const scrivi = (chiave, testo, titolo = '') => {
      const el = $(`[data-capability-row="${chiave}"]`);
      if (!el) return;
      el.textContent = testo;
      el.title = titolo;
    };
    aggiornaRigaBrowserCapability();
    const sessione = state.realSession.id;
    try {
      const dati = await apiGet(sessione ? `/api/v1/sessions/${encodeURIComponent(sessione)}/tools` : '/api/v1/tools');
      if (!dati.attrezzi) {
        scrivi('attrezzi', 'Non osservato', dati.errore || '');
        scrivi('ricerca', 'Non osservato', dati.errore || '');
      } else {
        const token = dati.attrezzi.reduce((somma, a) => somma + (a.tokenSchemaStimati || 0), 0);
        scrivi('attrezzi', String(dati.attrezzi.length), `~${token} token di schema a ogni giro (stima)${sessione ? '' : ' · nessuna sessione aperta: sono quelli che riceverà la prossima'}`);
        const ricerca = dati.attrezzi.find((a) => a.nome === 'web_search');
        if (!ricerca) scrivi('ricerca', 'non offerta', 'L\'attrezzo web_search non è fra quelli offerti in questa configurazione.');
        else if (ricerca.dipendenza?.stato === 'pronta') scrivi('ricerca', ricerca.dipendenza.dettaglio.replace(/^Fonte: /, ''), ricerca.dipendenza.dettaglio);
        else scrivi('ricerca', 'senza fonte', ricerca.dipendenza?.dettaglio || '');
      }
    } catch (errore) {
      scrivi('attrezzi', 'Non osservato', errore.message);
      scrivi('ricerca', 'Non osservato', errore.message);
    }
    if (!sessione) {
      scrivi('mcp', 'Non osservato', 'I server MCP sono dichiarati dal progetto della sessione: senza una sessione aperta non c\'è un progetto da leggere.');
      return;
    }
    try {
      const dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(sessione)}/mcp`);
      if (dati.errore) scrivi('mcp', 'dichiarazione non valida', dati.errore);
      else if (!dati.server || dati.server.length === 0) scrivi('mcp', '0', 'Nessun server MCP dichiarato in questo progetto (.harness-ui-mcp.json).');
      else scrivi('mcp', `${dati.server.length} (${dati.server.filter((x) => x.fidato).length} fidati)`, dati.server.map((x) => x.id).join(', '));
    } catch (errore) {
      scrivi('mcp', 'Non osservato', errore.message);
    }
  }

  /** ⭐ O-01 — la sola riga della scheda che si legge da uno stato già in memoria: nessuna fetch, quindi si può chiamare a ogni pagina letta. */
  function aggiornaRigaBrowserCapability() {
    const el = $('[data-capability-row="browser"]');
    if (!el) return;
    const pagine = state.realSession.browserPagine?.length ?? 0;
    if (!state.realSession.id) {
      el.textContent = 'Non osservato';
      el.title = 'Nessuna sessione aperta: le pagine lette appartengono a una sessione.';
      return;
    }
    el.textContent = pagine === 0 ? 'nessuna pagina letta' : `${pagine} pagin${pagine === 1 ? 'a letta' : 'e lette'}`;
    el.title = 'TALOS legge il testo delle pagine con l\'attrezzo naviga; compaiono nella vista Browser.';
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
    /*
     * ⭐⭐⭐ O-02 (04/9) — il registro degli attrezzi si riempie QUI, in un
     * punto solo e DOPO il dedup `_sequenza`: sotto, i tre `case` hanno già
     * il loro lavoro (bubble, batch, terminale) e uno di essi — ToolCallArgs
     * — SCARTA in silenzio ogni evento il cui Start non è ancora passato,
     * cosa che nello store persistito succede davvero. Contare lì
     * riprodurrebbe quel buco; contare qui no.
     * ⛔ Del ToolCallResult si copia solo l'id: il `content` può essere
     * enorme e per contare le chiamate non serve.
     */
    if (evento.type === 'ToolCallStart' || evento.type === 'ToolCallArgs') state.realSession.eventiAttrezzi.push(evento);
    else if (evento.type === 'ToolCallResult') state.realSession.eventiAttrezzi.push({ type: 'ToolCallResult', toolCallId: evento.toolCallId });
    switch (evento.type) {
      case 'RunStarted': {
        streamingAutoFollow = true; // un nuovo giro ri-arma il "segui il centro" — stesso principio di resetThreadScroll() in Hermes
        streamingLastTargetTop = null;
        state.realSession.currentRunModel = typeof evento.contesto?.modello === 'string' && evento.contesto.modello.trim()
          ? evento.contesto.modello.trim()
          : (state.model || null);
        state.realSession.redirectPendingId = null;
        state.realSession.eventoTerminaleVisto = false;
        svuotaSuggerimentoComposer(); // ⭐ 3/9 — item 10: un suggerimento del giro FINITO non ha senso su uno appena iniziato
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
        segnaGiroNellaSpine(); // 05/9 Fase 2: Conversazione - un numero in piu' nella spine del turno
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
        const bubble = appendToolNote(riassuntoAttrezzoInCorso(evento.toolCallName, null), { contenitore: batch.contenitore, attrezzo: evento.toolCallName });
        impostaEsitoRiga(bubble.article, 'running'); // 05/9 Fase 2: pallino «in corso»
        bubble.article.setAttribute('aria-busy', 'true');
        batch.attrezzi = (batch.attrezzi || 0) + 1;
        aggiornaTickGiro({ attrezzi: batch.attrezzi });
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
          if (argomentiParsati && info.dettaglio) info.dettaglio.textContent = bersaglioAttrezzoNudo(info.nome, argomentiParsati); // 05/9 Fase 2: il dettaglio mono della ToolRow
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
          impostaEsitoRiga(info.article, fallito ? 'error' : 'success'); // 05/9 Fase 2: il pallino della ToolRow
          info.article.setAttribute('aria-busy', 'false');
          if (info.dettaglio && info.argomentiParsati) info.dettaglio.textContent = bersaglioAttrezzoNudo(info.nome, info.argomentiParsati);
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
        // ⭐ 3/9 — item 10: preso ORA, non dopo — fra un attimo l'entry sparisce.
        if (info?.nome) state.realSession.ultimoBersaglioAttrezzo = { nome: info.nome, argomenti: info.argomentiParsati };
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
        aggiornaTickGiro({ tono: null }); // 05/9 Fase 2: il giro non e' piu' current
        state.realSession.eventoTerminaleVisto = !state.realSession.redirectPendingId;
        syncRunComposerState();
        mostraSuggerimentoComposer(suggerimentoDaUltimoAttrezzo()); // ⭐ 3/9 — item 10: dopo syncRunComposerState, cosi' se c'e' un redirect pendente runRealeAttivo() lo vede ancora attivo e non propone niente
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
        /*
         * ⛔ 04/9, trovato guardando gli screenshot della corsa `qa-file-di-controllo`:
         * la riga della sessione nella sidebar restava «in corso · live» mentre a
         * schermo c'era una card di approvazione in attesa. Lo stato esisteva già
         * (`inAttesaApprovazione` in `GET /sessions`, reso da `statoSessione`), ma
         * NESSUNO ridisegnava l'elenco quando la richiesta arrivava: un badge che
         * esiste e non si aggiorna è un badge che mente. Vale in entrambi i versi,
         * vedi `ApprovalResolved` qui sotto.
         */
        aggiornaElencoSessioniReali();
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
        aggiornaElencoSessioniReali(); // ⛔ 04/9 — l'altro verso: risolta l'approvazione, la riga deve smettere di dire «in attesa»
        break;
      }
      case 'RunError': {
        if (state.realSession.redirectPendingId) mostraAttesaRisposta('redirect');
        else nascondiAttesaRisposta();
        chiudiBatchTool(); // 30/8 — vedi RunFinished sopra, stesso motivo
        /*
         * ⭐⭐⭐ O-02 (04/9), owner: «vedi perché mi spunta spesso [giri-esauriti]».
         * La frase del kernel («24 su 24 usati senza chiudere il task») è vera
         * e non azionabile: non dice CHI ha consumato i giri. La diagnosi si
         * costruisce dagli eventi di attrezzo di questa stessa sessione, che
         * il client ha già in `eventiAttrezzi` — nessuna rotta nuova, nessun
         * numero che non venga da un evento vero. E il TETTO si impara dalle
         * parole del server (mai una costante scritta qui: vedi
         * tettoGiriDaMessaggio), così il contatore del composer può mostrare
         * «N su 24» per i giri successivi di questa sessione.
         */
        let guida = '';
        if (evento.code === 'giri-esauriti') {
          const tetto = tettoGiriDaMessaggio(evento.message);
          if (tetto) {
            state.realSession.tettoGiriDichiarato = tetto;
            /*
             * ⛔ 04/9, trovato dalla corsa `qa-giri-esauriti-diagnosi` (non
             * dedotto): il contatore mostrava «24 giri» senza il «su 24»
             * appena imparato. Lo `/usage` con giri=24 arriva PRIMA di
             * questo RunError, quindi l'ultimo redraw del contatore è già
             * passato — chi impara un fatto nuovo ridisegna chi lo mostra,
             * stessa lezione di ApprovalRequested/aggiornaElencoSessioniReali.
             */
            aggiornaContatoreUsage();
            aggiornaComposerUsage(state.realSession.usage);
          }
          const riassunto = riassuntoAttrezziDaEventi(state.realSession.eventiAttrezzi);
          guida = ` — ${testoDiagnosiGiri(riassunto)}. ${consiglioDaRiassunto(riassunto)}`
            + ' Il prossimo messaggio continuerà questo task nella stessa sessione. Premi «Nuova» per iniziare un task separato.';
        }
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
      smontaStatoVuoto(); // 05/9 Fase 2: EmptyState
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
      state.realSession.eventiAttrezzi = []; // O-02 — la diagnosi dei giri parla della sessione che si sta guardando, mai di quella prima
      state.realSession.tettoGiriDichiarato = null; // O-02 — il tetto lo dichiara il kernel di QUESTA sessione (il planner ne ha uno diverso), mai ereditato
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
    sessionTitle.textContent = state.session; aggiornaTestataSessione(); // 05/9 Fase 2: Topbar
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
      sessionTitle.textContent = state.session; aggiornaTestataSessione(); // 05/9 Fase 2: Topbar
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
    /*
     * ⭐ 04/9, W1-12 (Claude Code 2.1.251) — PRIMA di chiamare la rotta si
     * dice cosa si sta riprendendo: quanto è vecchia la sessione e quanto
     * contesto il modello rileggerà. Solo dati che l'elenco ha davvero
     * (`avviataAlle`, ultimo `usage`); l'età è dall'AVVIO, non dall'ultimo
     * evento, che l'elenco non espone — e lo si scrive così.
     */
    const voceElenco = state.sessionSelection.available.get(sessionId);
    if (voceElenco?.conclusa) {
      const eta = formattaEta(voceElenco.avviataAlle);
      toast('Ripresa della sessione', `${eta ? `avviata ${eta} fa` : 'età non registrata'} · riprendere costa ${stimaTokenRipresa(voceElenco.usage)}`);
    }
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
    sessionTitle.textContent = state.session; aggiornaTestataSessione(); // 05/9 Fase 2: Topbar
    /* ⛔ 27/8, trovato dalla pipeline QA visiva: solo sessionTitle veniva aggiornato — la card "Session topology" nel Context Rail e la voce "Main" nel foglio Albero sessione restavano al titolo demo ("Refactor auth flow") per sempre. Ogni elemento con lo stesso attributo resta sincronizzato. */
    $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
    setView('chat');
    closePanels();
    collegaEventiSessione(sessionId, generation);
    if (state.realSession.deferHistoricalRendering) mantieniFondoDuranteRipristino(generation);
    aggiornaSottotitoloSessione(); // W1-12 — con una sessione aperta il sottotitolo non dice «premi Nuova»
    aggiornaElencoSessioniReali();
    void aggiornaSchedaCapability(); // O-01 — attrezzi/MCP/ricerca/browser sono per-sessione: la scheda segue, non resta al valore di prima
  }

  /**
   * ⭐ 04/9, W1-12 — il sottotitolo sotto il nome della sessione diceva
   * «premi «Nuova» per iniziare» ANCHE con una sessione aperta (testo
   * statico in index.html, mai toccato). Tre stati, uno solo vero alla
   * volta: nessuna sessione → l'invito; sessione pendente (cartella scelta,
   * nessun messaggio) → «in attesa del primo messaggio»; sessione reale
   * aperta → nascosto.
   */
  /*
   * 05/9 Fase 2: WorkspaceFooter. «Workspace locale · Tema Calm · locale» nel
   * mockup era testo: qui è la cartella della sessione aperta (o il nome scelto
   * in «Nuova» prima del primo giro), il preset del tema delle impostazioni
   * desktop e chi serve il modello (locale / fornitore). Chiamata da
   * aggiornaSottotitoloSessione (ogni ridisegno della sidebar), da
   * applicaThemeDesktop e dopo ogni cambio di state.model.
   */
  function testiPiedeSidebar() {
    return testiPiedeWorkspace({ cartella: state.realSession.cartellaAssoluta, nomeAnteprima: state.realSession.previewWorkspaceName, tema: document.documentElement.dataset.talosTheme, modello: state.model || state.realSession.currentRunModel });
  }
  function aggiornaPiedeSidebar() {
    aggiornaPiedeChatDaStato.tema = () => testiPiedeSidebar().sotto; // 05/9 Fase 2: la barra di stato della chat ripete «Tema … · locale»
    aggiornaPiedeChatDaStato();
    aggiornaWorkspaceFooter($('#sessionsPanel .talos-sidebar__foot'), {
      cartella: state.realSession.cartellaAssoluta,
      nomeAnteprima: state.realSession.previewWorkspaceName,
      tema: document.documentElement.dataset.talosTheme, // il preset applicato (applicaThemeDesktop lo scrive sulla radice)
      modello: state.model,
    });
  }

  /*
   * 05/9 Fase 2: Topbar. Titolo = state.session (la parola della sidebar);
   * percorso = la cartella della sessione, intero (la app non conosce la home:
   * un «~» sarebbe inventato), assente senza cartella; Review = i file toccati
   * (`reviewFiles`); Terminale = le schede aperte — le schede (W1-01) non hanno
   * ancora una UI (B1, Astra): finché non c'è, il badge non si scrive.
   */
  function aggiornaTestataSessione() {
    const dati = {
      titolo: state.session,
      percorso: state.realSession.cartellaAssoluta,
      schedeTerminale: null,
      fileReview: state.realSession.reviewFiles instanceof Map ? state.realSession.reviewFiles.size : 0,
    };
    aggiornaTopbar($('#schermoChat .talos-topbar'), dati);
    aggiornaTopbar($('#schermoTerminale .talos-topbar'), dati);
    // la Review ha nella testata il sommario dei file, non il percorso: solo titolo e schede
    aggiornaTopbar($('#schermoReview .talos-topbar'), { titolo: dati.titolo, schedeTerminale: dati.schedeTerminale, fileReview: dati.fileReview });
  }

  function aggiornaSottotitoloSessione() {
    aggiornaPiedeSidebar(); // 05/9 Fase 2: WorkspaceFooter
    aggiornaTestataSessione(); // 05/9 Fase 2: Topbar
    const small = sessionTitle?.parentElement?.querySelector('small');
    if (!small) return;
    if (state.realSession.id) { small.hidden = true; return; }
    small.hidden = false;
    small.textContent = state.pendingCustomSession ? 'in attesa del primo messaggio' : 'premi «Nuova» per iniziare';
  }

  /** ⭐ 04/9, W1-12 — la riga della sessione PENDENTE nella sidebar (prima non esisteva: la cartella era scelta ma l'elenco non la mostrava, e nessuna riga era evidenziata). */
  function rigaSessionePendente() {
    if (!state.pendingCustomSession || state.realSession.id) return [];
    // 05/9 Fase 2: SessionItem — la riga pendente è lo stesso blocco del mockup
    const riga = creaSessionItem({ nomeCartella: state.pendingCustomSession.nomeCartella }, { pendente: true, corrente: true });
    riga.classList.add('real-session-item', 'is-pending');
    return [riga];
  }

  /**
   * ⭐ 04/9, W1-12 (Claude Code 2.1.232 fa lo stesso) — due sessioni VIVE
   * non portano lo stesso nome: chi rinomina, o il titolo automatico dal
   * primo messaggio, riceve il suffisso `-2`, `-3`… e lo si dice. Le
   * sessioni concluse non contano: un nome può tornare.
   */
  function nomeUnicoSessione(nome, sessionId) {
    const base = String(nome || '').trim();
    if (!base) return { nome: base, cambiato: false };
    const nomiVivi = new Set([...state.sessionSelection.available.values()]
      .filter((s) => s.sessionId !== sessionId && !s.conclusa && s.nome)
      .map((s) => s.nome));
    let candidato = base;
    for (let n = 2; nomiVivi.has(candidato); n += 1) candidato = `${base}-${n}`;
    return { nome: candidato, cambiato: candidato !== base };
  }

  /** ⭐ 04/9, W1-12 — età leggibile di un istante ISO («3 min», «2 h», «5 g»); mai un numero inventato: senza data torna null. */
  function formattaEta(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    const secondi = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (secondi < 60) return `${secondi} s`;
    if (secondi < 3600) return `${Math.round(secondi / 60)} min`;
    if (secondi < 86400) return `${Math.round(secondi / 3600)} h`;
    return `${Math.round(secondi / 86400)} g`;
  }

  /** ⭐ 04/9, W1-12 (Claude Code 2.1.251) — quanto costa riprendere: l'ultimo `usage` della sessione è il contesto che il modello rilegge al prossimo giro. Etichettato «stima», mai «costo». */
  function stimaTokenRipresa(usage) {
    if (!usage) return 'consumo non registrato';
    const totale = (Number(usage.prompt_tokens ?? 0) || 0) + (Number(usage.completion_tokens ?? 0) || 0);
    if (totale <= 0) return 'consumo non registrato';
    return `circa ${totale >= 1000 ? `${(totale / 1000).toFixed(1)}k` : totale} token (stima)`;
  }

  function formattaOraSessione(iso) {
    try {
      return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  /*
   * 05/9 Fase 2: NavItem. I badge dei Luoghi nella sidebar del mockup erano
   * numeri d'esempio (43 · 69 · 18 · 7 · 4 · 11 · 6 · 2 · 3): qui diventano
   * dati. Board = le sessioni appena lette; Capability = gli attrezzi del
   * kernel (`/api/v1/tools`, non dipende da una sessione); Automazioni =
   * `/api/v1/automations`; Libreria · Memoria · Attività · Note · Ricerca ·
   * Officina = le liste della sessione APERTA — senza sessione il badge non
   * c'è (null), perché non c'è un numero vero da scrivere.
   * ⛔ Una rotta che fallisce lascia il badge com'era o assente: mai uno zero
   * finto. Le liste per sessione si rileggono solo se la sessione è cambiata
   * o sono passati 15 s: la sidebar si ridisegna spesso, sei fetch a giro no.
   */
  const contatoriLuoghi = { sessione: undefined, quando: 0 };
  async function aggiornaContatoriLuoghi(numeroSessioni) {
    const radice = $('#sessionsPanel');
    if (!radice) return;
    aggiornaConteggiNav(radice, { board: numeroSessioni });
    const conta = async (percorso, campo) => {
      try {
        const dati = await apiGet(percorso);
        return Array.isArray(dati?.[campo]) ? dati[campo].length : undefined;
      } catch {
        return undefined; // il badge resta com'era: un dato non arrivato non è uno zero
      }
    };
    const id = state.realSession.id || null;
    const stessa = id === contatoriLuoghi.sessione && Date.now() - contatoriLuoghi.quando < 15_000;
    if (stessa) return;
    contatoriLuoghi.sessione = id;
    contatoriLuoghi.quando = Date.now();
    const [capability, automazioni] = await Promise.all([conta('/api/v1/tools', 'attrezzi'), conta('/api/v1/automations', 'items')]);
    aggiornaConteggiNav(radice, { capability, automazioni });
    if (!id) {
      aggiornaConteggiNav(radice, { libreria: null, memoria: null, attivita: null, note: null, ricerca: null, officina: null });
      return;
    }
    const liste = [['libreria', 'library', 'voci'], ['memoria', 'memory', 'memorie'], ['attivita', 'tasks', 'attivita'], ['note', 'notes', 'note'], ['ricerca', 'research', 'ricerche'], ['officina', 'tool-forge', 'strumenti']];
    const valori = await Promise.all(liste.map(([, rotta, campo]) => conta(`/api/v1/sessions/${encodeURIComponent(id)}/${rotta}`, campo)));
    if (state.realSession.id !== id) return; // la sessione è cambiata mentre le fetch erano in volo
    const conteggi = {};
    liste.forEach(([chiave], i) => { conteggi[chiave] = valori[i]; });
    aggiornaConteggiNav(radice, conteggi);
  }

  function contenitoreSessioniReali() {
    let contenitore = $('#realSessionsBlock');
    if (!contenitore) {
      contenitore = document.createElement('div');
      contenitore.id = 'realSessionsBlock';
      $('#sessionList')?.append(contenitore); // 05/9 Fase 2: dopo la testata «Sessioni · N» del mockup, non prima
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
  // 05/9 Fase 2: statoSessione vive in components/session-item.js (stesso ordine degli stati, parole del mockup)

  async function aggiornaElencoSessioniReali() {
    const contenitore = contenitoreSessioniReali();
    let elenco;
    try {
      elenco = (await apiGet('/api/v1/sessions')).items;
    } catch {
      return; // ⛔ un aggiornamento sidebar fallito non è un'azione richiesta, non merita un toast
    }
    aggiornaNotifiche(elenco);
    const pendente = rigaSessionePendente(); // W1-12
    $('#noSessionsPlaceholder')?.toggleAttribute('hidden', (Array.isArray(elenco) && elenco.length > 0) || pendente.length > 0); // 02/09 — il riquadro "Nessuna sessione ancora" stava sotto quattro sessioni reali
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
    void aggiornaContatoriLuoghi(elenco.length); // 05/9 Fase 2: NavItem
    for (const id of [...state.sessionSelection.selected]) {
      if (!state.sessionSelection.available.has(id)) state.sessionSelection.selected.delete(id);
    }
    if (elenco.length === 0) {
      state.sessionSelection.active = false;
      state.sessionSelection.selected.clear();
      const conteggioVuoto = $('#sessionList .talos-sidebar__block-head .talos-nav-item__count');
      if (conteggioVuoto) conteggioVuoto.textContent = '0'; // 05/9 Fase 2
      contenitore.replaceChildren(...pendente);
      aggiornaToolbarSelezioneSessioni();
      aggiornaSottotitoloSessione();
      return;
    }

    /*
     * 05/9 Fase 2: SessionItem. Ogni riga è il blocco `data-c="SessionItem"` del
     * mockup, emesso da components/session-item.js dai dati VERI di
     * GET /api/v1/sessions. Restano del monolite: l'apertura (passaASessione),
     * la selezione multipla, il menu con il tasto destro. Il titolo «Sessioni
     * reali» non c'è più: la testata del mockup («Sessioni · N») dice il conteggio.
     */
    const conteggio = $('#sessionList .talos-sidebar__block-head .talos-nav-item__count');
    if (conteggio) conteggio.textContent = String(elenco.length);
    const pezzi = [...pendente];
    for (const sessione of elenco) {
      const etichetta = sessione.nome || sessione.taskId; // ⭐ un nome scelto dall'owner vince sempre sul taskId
      const button = creaSessionItem(sessione, {
        corrente: sessione.sessionId === state.realSession.id,
        selezione: state.sessionSelection.active
          ? { attiva: true, selezionata: state.sessionSelection.selected.has(sessione.sessionId), onToggle: (checked) => toggleSessionSelection(sessione.sessionId, checked) }
          : null,
        onApri: () => passaASessione(sessione.sessionId, sessione.taskId, sessione.nome, sessione.modello, sessione),
        /* ⭐ 31/8 P0 — tasto destro apre il menu completo condiviso con la Board e con il menu CRUD dei Files. */
        onMenu: (event) => apriMenuAzioniSessione({ ...sessione, nome: etichetta }, { x: event.clientX, y: event.clientY, focusElement: button }),
      });
      button.classList.add('real-session-item'); // il vocabolario del monolite (selezione multipla, is-selected)
      pezzi.push(button);
    }
    /*
     * 05/9 Fase 2 (H27-H30, tastiera come cancello): 74 righe = 74 fermate di Tab
     * era il difetto trovato camminando la pagina. Roving tabindex: una sola
     * fermata (la sessione aperta, o la prima), frecce su/giu' e Home/End
     * per muoversi, Invio/Spazio aprono (e' un <button>).
     */
    const righe = pezzi.filter((el) => el.classList.contains('talos-session-item'));
    const fermata = righe.find((el) => el.getAttribute('aria-current') === 'true') || righe[0];
    for (const riga of righe) riga.tabIndex = riga === fermata ? 0 : -1;
    if (!contenitore.dataset.tastiera) {
      contenitore.dataset.tastiera = 'si';
      contenitore.addEventListener('keydown', (event) => {
        const tutte = [...contenitore.querySelectorAll('.talos-session-item')];
        const i = tutte.indexOf(document.activeElement);
        if (i < 0 || tutte.length === 0) return;
        let j = i;
        if (event.key === 'ArrowDown') j = Math.min(tutte.length - 1, i + 1);
        else if (event.key === 'ArrowUp') j = Math.max(0, i - 1);
        else if (event.key === 'Home') j = 0;
        else if (event.key === 'End') j = tutte.length - 1;
        else return;
        event.preventDefault();
        tutte[i].tabIndex = -1;
        tutte[j].tabIndex = 0;
        tutte[j].focus();
      });
    }
    contenitore.replaceChildren(...pezzi);
    aggiornaToolbarSelezioneSessioni();
    aggiornaSottotitoloSessione(); // W1-12 — l'elenco si ridisegna a ogni transizione: il sottotitolo lo segue
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

  /*
   * ⭐⭐⭐ 04/9, R-02 — INTRO AL PRIMO AVVIO, stile mobile.
   *
   * Owner 03/09: «abbia un intro stile mobile». Il telefono
   * (`TalosMobileSetupIntro.vue`, `setupProgress.ts`) ha già deciso come si
   * fa, e qui si copia il METODO, non solo l'aspetto:
   *
   * 1. Un passo è «fatto» quando la cosa che chiede ESISTE — letto dalla
   *    realtà (portachiavi via `/api/v1/setup/stato`, preferenze chat), mai
   *    da un cursore salvato che può invecchiare e rimandare qualcuno su un
   *    passo già finito.
   * 2. Una decisione per schermata, con accanto la conseguenza.
   * 3. NIENTE seconda casa per la stessa impostazione: la chiave si salva con
   *    la STESSA rotta del Laboratorio modelli (`POST /providers/:id/key`),
   *    il modello con lo STESSO `creaModelPicker`, l'autonomia con lo STESSO
   *    `impostaPermesso` del foglio Permessi. L'intro presenta, non duplica.
   * 4. «Scelto» è un GESTO, non un valore (lezione mobile `haDecisoAutonomia`):
   *    `state.autonomiaScelta` diventa true solo toccando una scheda, mai
   *    passando oltre con «Avanti» — altrimenti il default del giorno
   *    dell'installazione resterebbe congelato per sempre come «scelta».
   *
   * Passi desktop ↔ mobile: accesso (identity+model) · modello · autonomia
   * (autonomy) · cartella (al posto di pin/background, che sul desktop non
   * hanno senso: l'ultimo passo apre il foglio «Nuova sessione» vero).
   *
   * ⛔ La chiave non passa MAI da qui a un log, al JSONL o a una risposta
   * HTTP: viene mandata una volta alla rotta e il campo si svuota.
   * ⛔ Non si ripresenta: `INTRO_STORAGE_KEY` ricorda «completata» o
   * «saltata» finché esiste lo store del browser. `TALOS_INTRO=0` sul server
   * la spegne del tutto (rollback del ledger).
   */
  const INTRO_STORAGE_KEY = 'talos.harness.desktop.intro.v1';
  const INTRO_PASSI = Object.freeze([
    { id: 'provider', etichetta: 'Accesso' },
    { id: 'modello', etichetta: 'Modello' },
    { id: 'autonomia', etichetta: 'Autonomia' },
    { id: 'cartella', etichetta: 'Cartella' },
  ]);
  const INTRO_POLICY = Object.freeze([
    ['Read only', 'Solo lettura', 'Legge il progetto e lancia comandi che non cambiano niente. Ogni scrittura viene rifiutata.', 'Minimo rischio'],
    ['Workspace write', 'Scrive nel progetto', 'Scrive solo dentro la cartella della sessione. Shell e test passano dal cancello.', 'Consigliato'],
    ['On request', 'Chiede prima', 'Ti chiede conferma prima di ogni azione che lascia traccia: scritture, comandi, rete.', 'Controllato'],
    ['Full access', 'Accesso pieno', 'Filesystem e rete senza i cancelli ordinari. Solo se sai già cosa sta per fare.', 'Alto rischio'],
  ]);

  function leggiIntroLocale() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(INTRO_STORAGE_KEY) || 'null');
      return raw && typeof raw === 'object' && typeof raw.esito === 'string' ? raw : null;
    } catch { return null; }
  }
  function salvaIntroLocale(esito) {
    try { window.localStorage.setItem(INTRO_STORAGE_KEY, JSON.stringify({ esito, quando: new Date().toISOString() })); } catch { /* senza storage l'intro tornerà: meglio che sparire per sempre */ }
  }

  /** Come `talosSetupProgress` sul telefono: i passi fatti, il primo non fatto, se è tutto a posto. */
  function progressoIntro(stato) {
    const fatti = {
      provider: Boolean(stato?.provider?.pronto),
      modello: typeof state.model === 'string' && state.model !== '',
      autonomia: state.autonomiaScelta === true,
      cartella: false, // si «fa» aprendo il foglio Nuova sessione: non è un fatto persistito
    };
    const passi = INTRO_PASSI.map((passo) => ({ ...passo, fatto: fatti[passo.id] }));
    const primo = passi.findIndex((passo) => !passo.fatto);
    return { passi, indiceIniziale: primo === -1 ? passi.length - 1 : primo, tuttoPronto: passi.slice(0, 3).every((passo) => passo.fatto) };
  }

  /**
   * Chiamata all'avvio (solo standalone). Apre l'intro SOLO se manca una
   * delle tre cose senza cui TALOS non parte, e solo se non è già stata
   * completata o saltata in questo browser. Un server che non espone lo
   * stato (versione vecchia, non raggiungibile) non produce un intro
   * fantasma: si tace.
   */
  async function apriIntroSeServe() {
    if (!introDialog || leggiIntroLocale()) return false;
    let stato;
    try { stato = await apiGet('/api/v1/setup/stato'); } catch { return false; }
    if (!stato || stato.introDisattivato) return false;
    const progresso = progressoIntro(stato);
    if (progresso.tuttoPronto) return false;
    apriIntroPrimoAvvio(stato, progresso.indiceIniziale);
    return true;
  }

  function apriIntroPrimoAvvio(statoIniziale, indiceIniziale = 0) {
    if (!introDialog) return;
    const intro = { stato: statoIniziale, indice: Math.max(0, Math.min(INTRO_PASSI.length - 1, indiceIniziale)), provider: null, chiaveEsiti: new Map() };
    const rail = $('#introRail', introDialog);
    const body = $('#introBody', introDialog);
    const back = $('#introBack', introDialog);
    const next = $('#introNext', introDialog);
    const skip = $('#introSkip', introDialog);

    function chiudi(esito) {
      salvaIntroLocale(esito);
      if (introDialog.open) introDialog.close();
    }
    async function ricaricaStato() {
      try { intro.stato = await apiGet('/api/v1/setup/stato'); } catch { /* lo stato resta quello che avevamo: mai inventarne uno */ }
    }
    function disegnaRail() {
      const { passi } = progressoIntro(intro.stato);
      rail.replaceChildren(...passi.map((passo, posizione) => {
        const li = document.createElement('li');
        li.dataset.fatto = String(passo.fatto);
        if (posizione === intro.indice) li.setAttribute('aria-current', 'step');
        const linea = document.createElement('span'); linea.className = 'intro-rail-line'; linea.setAttribute('aria-hidden', 'true');
        li.append(linea, textElement('span', 'intro-rail-label', passo.etichetta));
        return li;
      }));
    }
    function titolo(testo, sottotitolo) {
      const h = document.createElement('h2'); h.className = 'intro-title'; h.id = 'introTitle'; h.textContent = testo;
      const p = document.createElement('p'); p.className = 'intro-copy'; p.textContent = sottotitolo;
      return [h, p];
    }
    function segnaEsito(nodo, esito, testo) { nodo.dataset.esito = esito; nodo.textContent = testo; }

    // ---- passo 1: accesso (provider con chiave, o motore locale) ----
    async function disegnaProvider() {
      body.replaceChildren(...titolo('Da dove pensa TALOS', 'Serve un accesso a un modello: la chiave di un provider, salvata nel portachiavi di questo computer e mai nel browser, oppure un motore locale sul disco.'));
      const lista = document.createElement('ul'); lista.className = 'intro-list';
      lista.append(textElement('li', 'muted-copy', 'Leggo i provider…'));
      body.append(lista);
      let righe = [];
      try { righe = (await apiGet('/api/v1/providers'))?.items ?? []; } catch (error) { lista.replaceChildren(textElement('li', 'muted-copy', messaggioErroreUtente(error, 'Il server locale non risponde: riprova fra un momento.'))); return; }
      const locale = intro.stato?.provider?.localeConfigurato === true;
      lista.replaceChildren(...righe.map((riga) => {
        const li = document.createElement('li');
        const scelta = document.createElement('button'); scelta.type = 'button'; scelta.className = 'intro-choice'; scelta.dataset.introProvider = riga.id;
        const prova = intro.chiaveEsiti.get(riga.id);
        const statoRiga = prova?.esito ?? (riga.requiresKey ? (riga.keyConfigured ? 'ok' : 'mancante') : 'ok');
        scelta.dataset.stato = statoRiga === 'collegato' ? 'ok' : statoRiga === 'ok' || statoRiga === 'mancante' ? statoRiga : 'rotto';
        const mark = textElement('span', 'intro-mark', (riga.label || riga.id).slice(0, 2).toUpperCase()); mark.setAttribute('aria-hidden', 'true');
        const centro = document.createElement('span');
        centro.append(textElement('strong', '', riga.label || riga.id), textElement('small', '', riga.requiresKey ? (riga.keyConfigured ? 'Chiave nel portachiavi' : 'Serve una chiave') : 'Nessuna chiave richiesta'));
        const statoTesto = prova ? (prova.esito === 'collegato' ? (prova.modelli === null ? 'collegato' : `${prova.modelli} modelli`) : prova.esito === 'in-corso' ? 'sto chiedendo…' : prova.esito === 'non-autorizzato' ? 'chiave rifiutata' : 'non raggiungibile')
          : riga.requiresKey ? (riga.keyConfigured ? 'chiave presente' : 'chiave mancante') : 'pronto';
        scelta.append(mark, centro, textElement('span', 'intro-state', statoTesto));
        scelta.addEventListener('click', () => { intro.provider = intro.provider === riga.id ? null : riga.id; disegnaProvider(); });
        if (intro.provider === riga.id) scelta.classList.add('active');
        li.append(scelta);
        if (intro.provider === riga.id && riga.requiresKey) li.append(campoChiave(riga));
        return li;
      }));
      const liLocale = document.createElement('li');
      const localeBtn = document.createElement('button'); localeBtn.type = 'button'; localeBtn.className = 'intro-choice'; localeBtn.dataset.introProvider = 'local'; localeBtn.dataset.stato = locale ? 'ok' : 'mancante';
      const markL = textElement('span', 'intro-mark', 'GP'); markL.setAttribute('aria-hidden', 'true');
      const centroL = document.createElement('span');
      centroL.append(textElement('strong', '', 'Motore locale (llama.cpp)'), textElement('small', '', locale ? 'Configurato su questo computer: i modelli sul disco si scelgono al passo successivo.' : 'Non configurato: si imposta dal Laboratorio modelli, dopo. Puoi continuare con un provider.'));
      localeBtn.append(markL, centroL, textElement('span', 'intro-state', locale ? 'pronto' : 'assente'));
      localeBtn.disabled = true;
      liLocale.append(localeBtn);
      lista.append(liLocale);
      body.append(textElement('p', 'intro-note', 'Tutte le chiavi si possono cambiare dopo, da Impostazioni → Laboratorio modelli → Provider e accessi.'));
    }
    function campoChiave(riga) {
      const wrap = document.createElement('div'); wrap.className = 'intro-key';
      const label = document.createElement('label'); label.className = 'sheet-label'; label.textContent = `Chiave ${riga.label || riga.id}`; label.htmlFor = `introKey-${riga.id}`;
      const input = document.createElement('input'); input.type = 'password'; input.id = `introKey-${riga.id}`; input.autocomplete = 'off'; input.spellcheck = false; input.placeholder = riga.keyConfigured ? 'Chiave già salvata: incollane una nuova per sostituirla' : 'Incolla la chiave'; input.dataset.introKeyInput = riga.id;
      const rowBtn = document.createElement('div'); rowBtn.className = 'intro-key-row';
      const salva = document.createElement('button'); salva.type = 'button'; salva.className = 'primary-btn'; salva.textContent = 'Salva e prova'; salva.dataset.introKeySave = riga.id;
      const esito = textElement('span', 'intro-key-esito', riga.keyConfigured ? 'La chiave salvata resta finché non ne incolli un\'altra.' : 'Resta sul server locale, nel portachiavi del sistema.');
      rowBtn.append(salva, esito);
      wrap.append(label, input, rowBtn);
      salva.addEventListener('click', async () => {
        const valore = input.value;
        if (!valore.trim()) { segnaEsito(esito, 'rotto', 'Incolla prima una chiave.'); input.focus(); return; }
        salva.disabled = true; segnaEsito(esito, '', 'Salvo nel portachiavi…');
        try {
          await apiPost(`/api/v1/providers/${encodeURIComponent(riga.id)}/key`, { key: valore });
          input.value = ''; // ⛔ il campo si svuota subito: la chiave è già dove deve stare, non resta nel DOM
          segnaEsito(esito, '', 'Salvata. Chiedo al provider se la accetta…');
          intro.chiaveEsiti.set(riga.id, { esito: 'in-corso' });
          const prova = await apiPost(`/api/v1/providers/${encodeURIComponent(riga.id)}/test`, {});
          intro.chiaveEsiti.set(riga.id, prova);
          await ricaricaStato();
          disegnaRail();
          disegnaProvider();
          if (prova?.esito === 'collegato') toast('Accesso pronto', `${riga.label || riga.id} accetta la chiave.`);
        } catch (error) {
          segnaEsito(esito, 'rotto', messaggioErroreUtente(error, 'Non sono riuscito a salvare la chiave.'));
          salva.disabled = false;
        }
      });
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); salva.click(); } });
      queueMicrotask(() => input.focus());
      return wrap;
    }

    // ---- passo 2: modello di default ----
    function disegnaModello() {
      body.replaceChildren(...titolo('Con quale modello, di solito', 'È il modello con cui parte una sessione nuova. Lo cambi quando vuoi dalla pillola sopra alla chat, anche a metà lavoro.'));
      const mount = document.createElement('div'); mount.className = 'intro-picker';
      const picker = creaModelPicker({
        valoreIniziale: state.model || '',
        aggiornaModelloPrincipale: true,
        sincronizzaSessione: false,
        alSelezionato: () => { salvaPreferenzeChatDesktop(); aggiornaPillolaModello(); disegnaRail(); },
      });
      mount.append(picker.elemento);
      body.append(mount, textElement('p', 'intro-note', state.model ? `Oggi: ${state.model}.` : 'Nessun modello scelto ancora: senza, la prima sessione te lo chiede.'));
    }

    // ---- passo 3: autonomia (una decisione, la stessa del foglio Permessi) ----
    function disegnaAutonomia() {
      body.replaceChildren(...titolo('Cosa può fare da solo', 'Una scelta sola, che vale per ogni sessione nuova. Il permesso per singolo attrezzo si regola dopo, dal foglio Permessi.'));
      const lista = document.createElement('ul'); lista.className = 'intro-list';
      lista.append(...INTRO_POLICY.map(([valore, nome, descrizione, nota]) => {
        const li = document.createElement('li');
        const scelta = document.createElement('button'); scelta.type = 'button'; scelta.className = 'intro-choice'; scelta.dataset.introPolicy = valore;
        if (state.permissions === valore && state.autonomiaScelta) scelta.classList.add('active');
        const mark = document.createElement('span'); mark.className = 'intro-mark'; mark.innerHTML = icon('i-shield'); mark.setAttribute('aria-hidden', 'true');
        const centro = document.createElement('span'); centro.append(textElement('strong', '', nome), textElement('small', '', descrizione));
        scelta.append(mark, centro, textElement('span', 'intro-state', nota));
        scelta.addEventListener('click', () => {
          impostaPermesso(valore, nome);
          state.autonomiaScelta = true; // il gesto sulla scheda è la decisione
          salvaPreferenzeChatDesktop();
          disegnaRail();
          disegnaAutonomia();
        });
        li.append(scelta);
        return li;
      }));
      const nomeScelto = INTRO_POLICY.find(([valore]) => valore === state.permissions)?.[1] ?? state.permissions;
      body.append(lista, textElement('p', 'intro-note', state.autonomiaScelta ? `Scelto: ${nomeScelto}. «Chiedi prima» resta una risposta legittima.` : 'Finché non tocchi una scheda vale il valore predefinito di oggi, che può cambiare con gli aggiornamenti: toccarla lo rende una tua scelta.'));
    }

    // ---- passo 4: la prima cartella (apre il foglio Nuova sessione vero) ----
    function disegnaCartella() {
      body.replaceChildren(...titolo('La prima cartella', 'TALOS lavora dentro una cartella per volta: la scegli a ogni sessione nuova, e i permessi di sopra valgono lì dentro. Nient\'altro viene toccato.'));
      body.append(textElement('p', 'intro-note', 'Puoi anche aprire una cartella con il tasto destro in Esplora file, «Apri cartella con TALOS».'));
    }

    function disegnaPasso() {
      const passo = INTRO_PASSI[intro.indice];
      disegnaRail();
      back.hidden = intro.indice === 0;
      const ultimo = intro.indice === INTRO_PASSI.length - 1;
      next.textContent = ultimo ? 'Scegli la cartella e inizia' : 'Avanti';
      if (passo.id === 'provider') disegnaProvider();
      else if (passo.id === 'modello') disegnaModello();
      else if (passo.id === 'autonomia') disegnaAutonomia();
      else disegnaCartella();
      queueMicrotask(() => next.focus());
    }

    back.onclick = () => { if (intro.indice > 0) { intro.indice -= 1; disegnaPasso(); } };
    next.onclick = () => {
      if (intro.indice < INTRO_PASSI.length - 1) { intro.indice += 1; disegnaPasso(); return; }
      chiudi('completata');
      openRealTaskSheet();
    };
    skip.onclick = () => chiudi('saltata');
    introDialog.oncancel = (event) => { event.preventDefault(); chiudi('saltata'); }; // Escape = salta, registrato come tale

    disegnaPasso();
    if (!introDialog.open) introDialog.showModal();
  }

  /*
   * ⭐ 03/9, R-01 — `scripts/avvia-talos.mjs` aggiunge `#avvia-doctor=1`
   * all'URL quando OPENROUTER_API_KEY non è impostata: la prima schermata
   * dopo il doppio clic deve dire perché, non aprire una chat che fallirà
   * al primo messaggio. Stesso pattern hash-e-consuma di
   * `leggiWorkspaceLaunchId`/`apriWorkspaceDaLauncher` sopra; riusa
   * `rimuoviWorkspaceLaunchFragment` per ripulire l'URL — il nome viene
   * dal primo uso, il comportamento (svuota l'intero hash, niente voce
   * nella cronologia) è esattamente quello che serve anche qui.
   */
  function apriDoctorDaLauncher() {
    const parametri = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (parametri.get('avvia-doctor') !== '1') return false;
    rimuoviWorkspaceLaunchFragment();
    setView('settings');
    setSettingsSection('account');
    eseguiDoctor();
    return true;
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

  /*
   * 05/9 Fase 2: EmptyState. La colonna della chat diventa lo stato vuoto del
   * mockup: titolo con la cartella, riga guida, fino a tre suggerimenti letti
   * dai FATTI della cartella (il browser del workspace elenca le cartelle alla
   * radice: .claude → ledger, src → mappa, tests → test) che riempiono il
   * composer senza inviare, e «Riapri l'ultima sessione» se ne esiste una.
   * Il primo messaggio (nuovaGenerazioneSessione) lo toglie.
   */
  async function montaStatoVuoto({ nomeCartella, cartellaLibera }) {
    const conversation = $('#conversation');
    if (!conversation) return;
    conversation.classList.add('talos-empty');
    conversation.closest('.talos-conversation')?.classList.add('talos-conversation--empty');
    let voci = [];
    if (cartellaLibera) {
      try { voci = (await apiGet(`/api/v1/workspace-browser?path=${encodeURIComponent(cartellaLibera)}`)).items || []; } catch { voci = []; }
    }
    if (!state.pendingCustomSession || state.realSession.id) return; // nel frattempo la sessione e' partita: niente da montare
    const suggerimenti = suggerimentiDallaCartella({ voci });
    const ultima = [...state.sessionSelection.available.values()].sort((a, b) => new Date(b.avviataAlle).getTime() - new Date(a.avviataAlle).getTime())[0] || null;
    const colonna = creaStatoVuoto({ progetto: nomeCartella, suggerimenti, ultimaSessione: ultima ? { nome: ultima.nome || ultima.taskId } : null }, {
      onSuggerimento: (s) => { composerInput.value = s.testo || s.titolo; composerInput.dispatchEvent(new Event('input', { bubbles: true })); composerInput.focus(); },
      onRiapri: () => { if (ultima) passaASessione(ultima.sessionId, ultima.taskId, ultima.nome, ultima.modello, ultima); },
    });
    conversation.replaceChildren(...colonna.childNodes);
  }
  function smontaStatoVuoto() {
    const conversation = $('#conversation');
    if (!conversation) return;
    conversation.classList.remove('talos-empty');
    conversation.closest('.talos-conversation')?.classList.remove('talos-conversation--empty');
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
    sessionTitle.textContent = state.session; aggiornaTestataSessione(); // 05/9 Fase 2: Topbar
    $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
    aggiornaSottotitoloSessione(); // W1-12 — «in attesa del primo messaggio»
    aggiornaElencoSessioniReali(); // W1-12 — la riga pendente compare, evidenziata
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
    svuotaSuggerimentoComposer(); // 05/9 Fase 2: un suggerimento della sessione PRECEDENTE non ha senso su una nuova
    syncRunComposerState();
    void montaStatoVuoto({ nomeCartella, cartellaLibera }); // 05/9 Fase 2: EmptyState al posto dell'hero
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
    sessionTitle.textContent = state.session; aggiornaTestataSessione(); // 05/9 Fase 2: Topbar
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
    // ⭐ 04/9, W1-12 — anche il titolo automatico evita il doppione con una sessione viva (suffisso -2, -3…).
    const { nome: titoloAutomatico, cambiato: titoloDisambiguato } = nomeUnicoSessione(titoloDalPrimoMessaggio(consegna), sessionId);
    apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/rename`, { nome: titoloAutomatico }).then(() => {
      // ⛔ la generazione può essere già cambiata (un'altra sessione avviata nel frattempo) — mai scrivere il titolo di una sessione che non è più quella a schermo.
      if (generation !== state.realSession.generation) return;
      state.session = titoloAutomatico;
      sessionTitle.textContent = state.session; aggiornaTestataSessione(); // 05/9 Fase 2: Topbar
      $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
      if (titoloDisambiguato) toast('Titolo della sessione', `«${titoloAutomatico}» · rinominata per evitare un doppione con una sessione viva`);
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

  /**
   * ⭐⭐⭐ 3/9 — item 10, owner: "modificare altezza e larghezza del chat
   * composer a piacimento e memorizzarlo, un po' come si fa con le
   * modali… bisogna dare comunque un'altezza massima e larghezza massima
   * altrimenti l'utente può allargare e alzare all'infinito".
   *
   * ⛔ Non un sistema nuovo: QUESTO stesso file ha già `setupDialogResize`/
   * `applyDialogSize`/`clampDialogSize` per command/sheet dialog — la
   * stessa disciplina (chiave localStorage dedicata, clamp min/max,
   * `layoutCompatto()` disattiva il resize su schermo piccolo, resize
   * anche da tastiera con le frecce) va tenuta qui, non reinventata più
   * povera. Non è lo STESSO codice perché il composer non è un
   * `<dialog>` — è ancorato al fondo dello schermo (`.composer-wrap`:
   * `bottom:0`, mai un `top`), quindi crescere in altezza lo deve
   * estendere verso l'ALTO, mai verso il basso: un dialog centrato non
   * ha questo vincolo, un composer ancorato sì.
   */
  const COMPOSER_RESIZE_STORAGE_KEY = 'talos-harness-composer-size-v1';
  const COMPOSER_RESIZE_MIN = Object.freeze({ width: 380, height: 80 });
  const COMPOSER_RESIZE_MAX = Object.freeze({ width: 1400, height: 420 });

  function readSavedComposerSize() {
    try {
      const value = JSON.parse(window.localStorage.getItem(COMPOSER_RESIZE_STORAGE_KEY) || 'null');
      return value && Number.isFinite(value.width) && Number.isFinite(value.height) ? value : null;
    } catch { return null; } // storage negato o valore corrotto: si riparte dalla taglia di default, mai un crash
  }

  /**
   * ⭐⭐⭐ 3/9 — owner, dal vivo, tre difetti sulla PRIMA versione:
   * "la chat composer si estende all'infinito dal lato destro resta
   * bloccata [sul sinistro]... se le sidebar sono aperte il chat composer
   * non deve andare dietro, si deve fermare prima delle sidebar".
   *
   * ⛔ La causa vera, misurata (Playwright, non ipotizzata): il tetto era
   * `window.innerWidth`, che IGNORA le sidebar. `.composer` non ha una
   * `left` propria — sta in flusso normale con `margin-inline:auto`, che
   * ricentra SOLO finché la larghezza sta dentro il contenitore; appena
   * la supera, i margini auto collassano a 0 e il riquadro cresce dal
   * bordo sinistro del contenitore verso destra, sempre — indipendente da
   * quale maniglia si trascina. Misurato: bordo sinistro fermo a 320,
   * bordo destro da 1072 a 1272 (+200, la stessa distanza trascinata).
   *
   * ⇒ La cura non è raddrizzare la direzione a mano: è non lasciare MAI
   * che la larghezza superi lo spazio vero fra le sidebar
   * (`.composer-wrap`, che le esclude già per costruzione — misurato:
   * 792px disponibili su 1440 di finestra con entrambe le sidebar aperte).
   * Dentro quel limite, `margin-inline:auto` ricentra correttamente da
   * solo: il difetto spariva insieme alla causa, non richiedeva una
   * seconda cura sulla direzione.
   */
  function spazioDisponibileComposer() {
    const wrap = $('.composer-wrap');
    const rect = wrap?.getBoundingClientRect();
    return rect && rect.width > 0 ? rect.width : window.innerWidth;
  }

  function clampComposerSize(width, height) {
    const margine = 24; // stesso respiro che aveva prima verso i bordi, ora verso le sidebar
    const maxWidth = Math.min(COMPOSER_RESIZE_MAX.width, Math.max(COMPOSER_RESIZE_MIN.width, spazioDisponibileComposer() - margine));
    const maxHeight = Math.min(COMPOSER_RESIZE_MAX.height, Math.max(160, window.innerHeight - 160));
    return {
      width: Math.min(maxWidth, Math.max(COMPOSER_RESIZE_MIN.width, Math.round(Number(width) || COMPOSER_RESIZE_MIN.width))),
      height: Math.min(maxHeight, Math.max(COMPOSER_RESIZE_MIN.height, Math.round(Number(height) || COMPOSER_RESIZE_MIN.height))),
    };
  }

  function applyComposerSize(width, height) {
    const size = clampComposerSize(width, height);
    // ⭐ Due variabili, un solo comando: --composer-canonical-h guida il min-height del riquadro (già usata dal sistema "forma del composer"), --composer-textarea-max-h il tetto della textarea — restano proporzionate come lo erano nei valori di default (120 contro 116, +4).
    document.documentElement.style.setProperty('--composer-canonical-h', `${size.height}px`);
    document.documentElement.style.setProperty('--composer-textarea-max-h', `${size.height + 4}px`);
    document.documentElement.style.setProperty('--composer-max-w', `${size.width}px`);
    /*
     * ⭐⭐⭐ 3/9 — owner: "resta bloccata [sul sinistro]... si estende
     * all'infinito dal lato destro". `margin-inline:auto` centra SOLO
     * finché la larghezza sta dentro il CONTENT-box del genitore
     * (`.composer-wrap` meno il SUO proprio padding, 752px in questa
     * finestra) — non dentro il suo bordo esterno (792px). Appena la
     * supera, per specifica CSS gli auto-margin collassano a 0 e il
     * riquadro cresce ancorato a sinistra: MISURATO, non presunto (lo
     * stesso comportamento restava identico anche dopo aver corretto
     * SOLO il tetto). La cura vera: centrare col margine calcolato a
     * mano, non affidarsi a `auto` oltre il punto in cui smette di
     * funzionare per definizione.
     */
    const wrap = $('.composer-wrap');
    if (wrap) {
      /*
       * ⛔ Il primo tentativo calcolava il margine sul bordo ESTERNO del
       * wrap, ma un `margin-left` su `.composer` è relativo al CONTENT-BOX
       * del suo genitore (cioè il wrap MENO il suo stesso padding, ~20px
       * per lato in questa finestra) — misurato: il composer finiva 12px
       * più a destra di dove doveva. Si legge il padding vero del wrap,
       * non lo si assume.
       */
      const wrapRect = wrap.getBoundingClientRect();
      const wrapStyle = getComputedStyle(wrap);
      const wrapPaddingLeft = parseFloat(wrapStyle.paddingLeft) || 0;
      const wrapContentLeft = wrapRect.x + wrapPaddingLeft;
      const targetLeft = wrapRect.x + (wrapRect.width - size.width) / 2; // centrato sul bordo ESTERNO del wrap, non sul suo content-box: e' quello lo spazio "quasi al massimo" che puo' usare
      // ⛔ Un margine NEGATIVO è corretto qui, non un errore da bloccare: è
      // così che il composer invade il padding del wrap invece di restare
      // confinato al suo content-box — esattamente "estendersi quasi al
      // massimo della sezione". Un Math.max(0,…) qui annullava la metà
      // sinistra della crescita, la stessa causa del difetto originale.
      const marginLeft = Math.round(targetLeft - wrapContentLeft);
      composerForm.style.marginLeft = `${marginLeft}px`;
      composerForm.style.marginRight = '0px'; // la larghezza esplicita + il margine sinistro bastano a posizionare il riquadro: un margine destro fisso lotterebbe con `width` per lo spazio residuo
    }
    composerForm.classList.add('composer-user-sized');
    return size;
  }

  function resetComposerSize() {
    document.documentElement.style.removeProperty('--composer-canonical-h');
    document.documentElement.style.removeProperty('--composer-textarea-max-h');
    document.documentElement.style.removeProperty('--composer-max-w');
    composerForm.style.removeProperty('margin-left'); // ⭐ 3/9 — la centratura calcolata a mano va tolta insieme al resto, o resterebbe un residuo asimmetrico
    composerForm.style.removeProperty('margin-right');
    composerForm.classList.remove('composer-user-sized');
    try { window.localStorage.removeItem(COMPOSER_RESIZE_STORAGE_KEY); } catch { /* niente da pulire se lo storage non risponde */ }
  }

  /**
   * ⭐⭐⭐ 3/9 — owner: "se le sidebar sono aperte il chat composer non deve
   * andare dietro, si deve fermare prima delle sidebar". Una sidebar che
   * si apre/chiude è un cambio di LAYOUT (colonna della grid che
   * compare/sparisce), non necessariamente un resize della FINESTRA — va
   * ri-agganciata anche ai due toggle delle sidebar, non solo a un
   * eventuale ridimensionamento della finestra. `spazioDisponibileComposer()`
   * rimisura `.composer-wrap` dal vivo ad ogni chiamata: qui basta
   * richiamare `applyComposerSize` con la taglia attuale perché il nuovo
   * tetto (più stretto, se una sidebar si è appena aperta) la corregga da solo.
   */
  function riclampaComposerUserSized() {
    if (!composerForm.classList.contains('composer-user-sized')) return;
    if (layoutCompatto()) { resetComposerSize(); return; }
    const rect = composerForm.getBoundingClientRect();
    applyComposerSize(rect.width, rect.height);
  }

  function saveComposerSize(size) {
    try { window.localStorage.setItem(COMPOSER_RESIZE_STORAGE_KEY, JSON.stringify(size)); }
    catch { /* preferenza visuale non bloccante: il composer resta usabile */ }
  }

  function setupComposerResize() {
    const saved = readSavedComposerSize();
    if (saved && !layoutCompatto()) applyComposerSize(saved.width, saved.height);
    const handle = $('#composerResizeHandle');
    if (!handle) return; // markup non presente — niente da agganciare, non un errore

    handle.addEventListener('pointerdown', (event) => {
      if (layoutCompatto() || event.button !== 0) return;
      event.preventDefault();
      const start = composerForm.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      composerForm.classList.add('composer-resizing');
      handle.setPointerCapture(event.pointerId);

      // ⛔ La maniglia è in ALTO A SINISTRA: trascinare verso l'ALTO o verso SINISTRA (fuori dal riquadro) deve INGRANDIRE in entrambi gli assi — il contrario sembrerebbe al rovescio di quello che si vede muoversi sotto il dito/il cursore.
      const onMove = (moveEvent) => {
        const width = start.width + (startX - moveEvent.clientX);
        const height = start.height + (startY - moveEvent.clientY);
        applyComposerSize(width, height);
      };
      const onEnd = () => {
        composerForm.classList.remove('composer-resizing');
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        const rect = composerForm.getBoundingClientRect();
        saveComposerSize(clampComposerSize(rect.width, rect.height));
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onEnd);
        handle.removeEventListener('pointercancel', onEnd);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onEnd);
      handle.addEventListener('pointercancel', onEnd);
    });

    // ⭐ Stessa accessibilità già data ai dialog: ridimensionabile anche da tastiera.
    handle.addEventListener('keydown', (event) => {
      if (layoutCompatto()) return;
      const orizzontale = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const verticale = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      if (!orizzontale && !verticale) return;
      event.preventDefault();
      const rect = composerForm.getBoundingClientRect();
      // Stessa convenzione del trascinamento: Sinistra/Su ingrandiscono.
      const width = orizzontale ? rect.width + (event.key === 'ArrowLeft' ? 16 : -16) : rect.width;
      const height = verticale ? rect.height + (event.key === 'ArrowUp' ? 16 : -16) : rect.height;
      const size = applyComposerSize(width, height);
      saveComposerSize(size);
    });

    handle.addEventListener('dblclick', resetComposerSize);
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
    sessionTitle.textContent = state.session; aggiornaTestataSessione(); // 05/9 Fase 2: Topbar
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
  $('#capabilityBtn').addEventListener('click', () => openSheet('capabilities', { ancoraAlComposer: true }));
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
    /*
     * ⛔⛔⛔ 03/9 — QUI stava un gestore RESIDUO DEL MOCKUP, rimosso.
     *
     * Rispondeva a `retry` con il toast «Rigenerazione avviata» senza
     * rigenerare niente, e a like/dislike accendendo un pulsante e dicendo
     * «Feedback registrato» senza salvarlo da nessuna parte. Non si era mai
     * visto perché NESSUNA riga creava quei bottoni — ma dal momento in cui
     * la barra `.message-actions` viene disegnata davvero (vedi
     * `ensureAssistantMessageElement`), sarebbe tornato vivo e avrebbe
     * mentito a ogni clic.
     *
     * ⇒ Ogni azione ora ha il suo `addEventListener` accanto al bottone che
     * la esegue, e nessuna di esse dichiara un esito che non è avvenuto.
     */
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

  /*
   * ⛔⛔ Trovato dalla QA visiva di O-01, secondo giro: con lo store VUOTO le
   * quattro righe della scheda «Capability» restavano tutte «Non osservato»
   * — perché l'unico chiamante era `passaASessione`, che senza sessioni non
   * viene MAI eseguito. Gli attrezzi però sono osservabili anche allora
   * (`/api/v1/tools`): all'avvio si chiede, e la scheda dice il vero fin dal
   * primo secondo, non solo dopo il primo click su una sessione.
   */
  void aggiornaSchedaCapability();

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
    /*
     * ⭐⭐⭐ 3/9 — item 10: Tab promuove il suggerimento a testo vero. Solo a
     * campo vuoto e con un suggerimento attivo — altrimenti Tab fa il suo
     * mestiere normale (sposta il focus), niente sorprese per chi naviga
     * la pagina da tastiera senza mai aver visto un suggerimento.
     */
    if (event.key === 'Tab' && suggerimentoComposerAttivo && composerInput.value === '') {
      event.preventDefault();
      const testo = suggerimentoComposerAttivo;
      svuotaSuggerimentoComposer();
      composerInput.value = testo;
      autoGrowTextarea();
      syncRunComposerState();
      composerInput.setSelectionRange(composerInput.value.length, composerInput.value.length);
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
    riclampaComposerUserSized();
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
  $('#fileTreeUp')?.addEventListener('click', () => {
    if (state.realSession.fuoriSessioneAperto) chiudiFuoriSessione();
    else apriFuoriSessione();
  });

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
  const PANEL_RESIZE_VAR = { sessions: '--talos-sidebar-w', inspector: '--talos-inspector-w' }; // ⭐ 05/9, fase 1: i token del mockup, non quelli del vecchio CSS
  const PANEL_RESIZE_DEFAULT = { sessions: 276, inspector: 340 }; // ⭐ 05/9: le larghezze base del mockup (--talos-sidebar-w: 276px)

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
    const sidebarWidth = parseInt(getComputedStyle(HOST()).getPropertyValue('--talos-sidebar-w'), 10) || PANEL_RESIZE_DEFAULT.sessions;
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
    if (saved.sessionsCollapsed && window.innerWidth > 1040) appShell.classList.add('sessions-collapsed'); // 05/9 Fase 2: collassi ricordati
    if (saved.inspectorCollapsed && window.innerWidth > 1040) appShell.classList.add('inspector-collapsed');
    syncSessionsToggle();
    syncInspectorToggle();
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
      const doctorDalLauncher = apriDoctorDaLauncher();
      const cartellaDalLauncher = Boolean(leggiWorkspaceLaunchId());
      apriWorkspaceDaLauncher();
      // ⭐ 04/9, R-02 — l'intro cede il passo ai flussi del lanciatore (Doctor, «Apri cartella con TALOS»): chi arriva con un'intenzione precisa non deve trovare un modale davanti.
      if (!doctorDalLauncher && !cartellaDalLauncher) apriIntroSeServe();
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
  setupComposerResize(); // ⭐ 3/9 — item 10: stessa famiglia dei due sopra, per il composer
  syncHostLayout();
  ensureDownloadQueueBadge();
  setQueueMode(false);
  setRunState(true);
  syncRunComposerState();
  /*
   * ⭐⭐⭐ 05/9, fase 1 del piano «il mockup diventa la app» — la REGIA del
   * mockup portata dentro app.js, tale e quale: i luoghi della sidebar e le
   * viste della testata (`[data-vaia]`) navigano con `setView`; i pulsanti
   * `[data-apre-velo]`/`[data-chiudi]` aprono e chiudono i veli del mockup
   * con `hidden`, portando il fuoco dentro e riportandolo indietro; Esc e il
   * clic fuori chiudono; i `[aria-expanded][aria-controls]` sono disclosure.
   * Nessuna logica di prodotto: solo il comportamento che il mockup già ha.
   */
  const VISTA_PER_VAIA = { chat: 'chat', vuota: 'vuota', terminale: 'terminal', review: 'diff', capability: 'capability', board: 'dashboard', memoria: 'memoria', attivita: 'attivita', impostazioni: 'settings', doctor: 'doctor', libreria: 'libreria', ricerca: 'ricerca', officina: 'officina', automazioni: 'automations', browser: 'browser' };
  ROOT().addEventListener('click', (event) => {
    const vaia = event.target.closest?.('[data-vaia]');
    if (vaia && VISTA_PER_VAIA[vaia.dataset.vaia]) { setView(VISTA_PER_VAIA[vaia.dataset.vaia]); return; }
    const apre = event.target.closest?.('[data-apre-velo]');
    if (apre) { apriVeloMockup(apre.dataset.apreVelo); return; }
    const chiude = event.target.closest?.('[data-chiudi]');
    if (chiude) { chiudiVeloMockup(chiude.dataset.chiudi); return; }
    const velo = event.target.closest?.('.overlay-layer');
    if (velo && event.target === velo) { chiudiVeloMockup(velo.id); return; }
    const disclosure = event.target.closest?.('[aria-expanded][aria-controls]');
    if (disclosure && !disclosure.matches('[role="tab"]')) {
      const c = $(`#${disclosure.getAttribute('aria-controls')}`);
      if (c) { const aperto = disclosure.getAttribute('aria-expanded') === 'true'; disclosure.setAttribute('aria-expanded', String(!aperto)); c.hidden = aperto; }
    }
  });
  let ultimoFuocoVelo = null;
  function apriVeloMockup(id) {
    const v = $(`#${id}`); if (!v) return;
    ultimoFuocoVelo = ROOT().activeElement;
    v.hidden = false;
    const corpo = v.querySelector('.talos-dialog__body');
    const scelto = corpo && corpo.querySelector('[role="radio"][aria-checked="true"]');
    const primo = scelto || (corpo && corpo.querySelector('input, button, select')) || v.querySelector('input, button, select');
    primo?.focus();
  }
  function chiudiVeloMockup(id) {
    const v = $(`#${id}`); if (!v || v.hidden) return;
    v.hidden = true;
    if (ultimoFuocoVelo?.focus) ultimoFuocoVelo.focus();
  }
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') $$('.overlay-layer').forEach((v) => chiudiVeloMockup(v.id)); });
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
