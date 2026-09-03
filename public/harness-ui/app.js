(() => {
  'use strict';

  /*
   * Owner 24/8: montato dentro uno shadow root da `HarnessSessionScreen.vue`
   * (non più un documento a sé tramite `window.location.assign` — la stessa
   * pagina resta la SPA, la cronologia resta condivisa, il tasto Back
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
    queueMode: false,
    permissions: 'Workspace write',
    /*
     * ⭐ 29/8 — owner: "fai in modo che i modelli... funzionino bene".
     * Era `'gpt-5.6-sol · high'` — un residuo del vecchio mockup, non
     * un id modello valido per nessun provider (spazio, "· high"
     * incollato, nessun `/`). Se mai raggiunge il server come fallback
     * di `submitPrompt(text)` senza `modello` esplicito (riga ~3400,
     * il composer interno di questo bundle), il regex-check server-side
     * lo respinge con "Modello non valido" — un fallimento GARANTITO,
     * non un rischio. `null` fa sì che `startCustomSession`/`avvia()`
     * OMETTANO del tutto il campo `modello` (stesso `if (modelloEffettivo)`
     * già in uso), lasciando che il server usi il SUO default reale
     * (`config.mjs`, verificato: `z-ai/glm-4.7-flash`, valido e
     * funzionante) invece di un fallimento certo.
     */
    model: null,
    // ⭐ 28/8 — stesso principio di `model`: null = nessuna scelta esplicita, "reasoning" resta assente dal corpo della richiesta (comportamento di sempre). Un valore fra quelli di LIVELLI_RAGIONAMENTO appena l'owner tocca lo slider dell'effort picker.
    effort: null,
    environment: 'wt/auth-61c · feat/mobile-code',
    session: 'Refactor auth flow',
    running: true,
    /** ⭐ 27/8 — {percorso, nome} del file bersaglio quando si apre il foglio Open/Rinomina/Elimina dall'albero, null altrimenti. I fogli sono statici (sheetTemplates), questo li parametrizza. */
    alberoFileTarget: null,
    /*
     * ⭐⭐⭐ 27/8, owner: "nella modale nuova sessione non deve esserci il
     * campo text... quello si fa direttamente da interfaccia chat". "Nuova"
     * sceglie cartella+modello e basta; questo campo porta quella scelta
     * fino al primo messaggio scritto nel composer normale, che avvia la
     * sessione vera — {cartellaId, nomeCartella, modello} oppure null
     * quando non c'è nulla in attesa. Scritto da avviaSessionePendente()
     * (sotto); il call site che la invoca non è ancora in questo cherry-pick
     * (fa20bb11) — orfana per ora, si aggancia da un commit successivo,
     * verificato con `grep -c avviaSessionePendente` prima di inventare un
     * collegamento non documentato da nessun commit.
     */
    pendingCustomSession: null,
    board: {
      initialized: false,
      bootstrapPromise: null,
      campaign: null,
      campaigns: [],
      runs: [],
      nextCursor: null,
      totalMatched: 0,
      generation: 0,
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
      generation: 0,
      /*
       * ⭐⭐⭐ 2/9 — owner dal vivo: "c'è troppo caricamento se clicco su
       * una, clicco su un'altra e ritorno su quelle precedenti... deve
       * essere veloce". Ricerca fatta (owner: "ad ogni passo"): ogni
       * app di chat seria tiene una cache client dei messaggi già
       * visti — GetStream.io, la guida stessa di offline-chat —
       * apertura ISTANTANEA per una conversazione già caricata in
       * questa sessione, mai un giro di rete per rivederla. sessionId
       * -> array di eventi grezzi, popolato da collegaEventiSessione
       * man mano che arrivano; su un secondo click sullo stesso id, si
       * rigioca dalla cache invece di rifare fetch+EventSource da capo.
       */
      cronologiaCache: new Map(),
      eventSource: null,
      messageElements: new Map(),
      runCount: 0,
      taskBubbleMostrata: false,
      /** Piano §1.3, riga Review — percorso -> {path, code, nuovo}, UNA voce per file scritto, non solo l'ultima. */
      reviewFiles: new Map(),
      /** Piano §1.3, riga "Contesto workspace" — la cartella corrente sfogliata nell'albero file reale, '' = radice. */
      treePercorso: '',
      /** ⭐ 29/8, porting dal bundle desktop — percorso -> voci[], una fetch per livello mai ripetuta finché non invalidata. */
      treeCache: new Map(),
      /** ⭐ 29/8, porting dal bundle desktop — l'insieme dei percorsi cartella aperti, per ricostruire l'albero espanso dopo un ridisegno. */
      treeOpen: new Set(),
      /** Piano §1.3-BIS.T — toolCallId -> {nome, argomenti, gruppo, item}, SOLO per riconoscere quando un ToolCallResult appartiene a "shell"/"naviga"/"prova" e specchiarlo nella vista Terminale/Browser/Review, e per aggiornare l'item giusto dentro il gruppo tool-call (vedi nuovoGruppoTool). */
      toolCallNomi: new Map(),
      /** ⭐⭐⭐ 30/8, owner (due screenshot di Claude Code stesso come riferimento — ledger, sezione "IN CODA" del 30/8): "i comandi vengano raggruppati in un collapse... con diff totale accanto". Il gruppo di tool-call CONSECUTIVI (nessun messaggio di testo/altro evento in mezzo) attualmente in costruzione, o null fra un gruppo e il prossimo — vedi nuovoGruppoTool()/chiudiGruppoToolCorrente(). */
      toolGroupCorrente: null,
      /** ⛔ 27/8 — vero se l'ULTIMO evento visto su questa connessione era RunFinished/RunError: dice a onerror se la chiusura che sta per arrivare è attesa (niente da segnalare) o una vera interruzione. Vedi collegaEventiSessione. */
      eventoTerminaleVisto: false,
      /**
       * ⭐ Ledger FASE-1-REVIEW-TEST-RISCHIO §2.B, 28/8 — l'exit code
       * dell'ULTIMA chiamata reale a `prova` in questa sessione, `null`
       * finché nessuna è ancora arrivata (terzo stato onesto: "non
       * ancora testato" non è "rischioso", è ignoto). Popolato in
       * ToolCallResult, letto da classificaRischioReview.
       */
      ultimoEsitoProva: null,
      /** ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — l'ultimo
       * StateDelta path /usage visto (forma OpenRouter: prompt_tokens,
       * completion_tokens, prompt_tokens_details.cached_tokens, giri),
       * null finché nessun giro ha mai riportato consumo — mai un
       * contatore finto, la stessa onestà di IGNOTO-vs-GRATIS già in uso
       * lato kernel. Vedi il case 'StateDelta' e la riga "Main" nel
       * foglio Session tree. */
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
      /** ⭐⭐⭐ 27/8, owner: "non esiste nessun loading quando il modello elabora... fa sembrare che si sia piantato" — l'elemento DOM della bolla di attesa (porta di TalosLineLoader.vue, mobile), o null quando non ce n'è una a schermo. Vedi mostraAttesaRisposta()/nascondiAttesaRisposta(). */
      attesaBubble: null,
      /** ⭐⭐⭐ 2/9 — Stadio A (talosHarness.mjs) chiude il giro di compattazione a costo di un turno che sembra un normale turno "senza risposta" — l'elemento DOM della bolla "sto riassumendo" (o null quando non ce n'è una a schermo). Vedi mostraCompattazioneInCorso()/nascondiCompattazioneInCorso() e il case CompactionStart/CompactionEnd. */
      compattazioneBubble: null,
      /** ⛔⛔⛔ 27/8, owner: "le risposte non sono formattate" — testo GREZZO
       * accumulato per messageId, così renderizzaMarkdownSemplice() lavora
       * sempre sul markdown intero visto finora, non su un singolo delta:
       * `.assistant-copy` mostra il RENDER, non è più la fonte del testo. */
      testoGrezzoMessaggi: new Map(),
      /** ⭐⭐⭐ 2/9 — stato del render INCREMENTALE per messageId (prefisso
       * già stabile + nodi della coda ancora aperta): vedi
       * renderizzaMarkdownIncrementale(). Un Map separato da
       * testoGrezzoMessaggi perché quello è il testo (la fonte), questo
       * è "quanto ne ho già disegnato e come" (la cache di rendering). */
      renderIncrementale: new Map(),
      /** ⛔⛔⛔ 27/8, owner: "ricevo risposte duplicate" — ogni evento.`_sequenza` (assegnato dal server, vedi session-registry.mjs broadcast()) entra qui la PRIMA volta che passa da handleRealEvent; una riconnessione (EventSource nativo dopo una caduta, o runDirectShell che ne apre una fresca) rimanda l'intero buffer da capo, e questo Set lo riconosce e lo scarta invece di duplicare bubble/testo. Sopravvive a un `continua:true` (stessa sessione, nuovo giro) — si azzera SOLO per una sessione davvero diversa. */
      sequenzeViste: new Set(),
      /** ⛔⛔⛔ 27/8, owner: "verifica che i messaggi... persistano dopo il refresh" — vero SOLO fra l'appendUserFollowUp ottimista di resumeSession() e il RunStarted (seguito:true) che arriva davvero: consumato una volta, evita che handleRealEvent mostri lo stesso follow-up due volte dal vivo. Vedi il case RunStarted per il perché non è sempre così. */
      followUpBubbleInAttesa: false,
      /**
       * ⭐⭐⭐ 3/9 — la striscia "Running" (run-strip) mostrava SEMPRE
       * "— step — ctx — errors" e un cronometro fermo sulla stringa
       * letterale '01:42' (trovato leggendo setRunState: nessun contatore
       * vero dietro, un placeholder di demo mai sostituito). `erroriStrumento`
       * conta i ToolCallResult di QUESTO giro con `problema:true` (stesso
       * verdetto di `pareFallito`, già calcolato per il gruppo tool-call —
       * qui solo sommato); si azzera a ogni RunStarted, mai cumulativo fra
       * giri diversi della stessa sessione (onesto: "errori di questo giro",
       * non "errori mai visti"). Vedi aggiornaRunKpis().
       */
      erroriStrumento: 0,
      /** ⭐⭐⭐ 3/9 — istante reale (Date.now()) in cui il giro CORRENTE è
       * iniziato, null a riposo; azzerato a ogni RunStarted come sopra. Il
       * cronometro del run-strip lo rilegge ogni secondo — vedi
       * avviaCronometroRun()/fermaCronometroRun(). */
      runIniziatoAlle: null,
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
  const queueToggle = $('#queueToggle');
  const queuedMessage = $('#queuedMessage');
  const sessionTitle = $('#sessionTitle');
  const sessionSubtitle = $('#sessionSubtitle');
  /*
   * ⛔ 03/9 — Il sottotitolo era una stringa FISSA nell'HTML: «press "New" to
   * start» restava sotto il titolo anche con una sessione aperta e in corso,
   * cioe' istruiva a fare una cosa gia' fatta. Sette punti aggiornavano il
   * titolo e nessuno lui: e' il difetto tipico di un'etichetta scritta una
   * volta accanto a un valore che cambia. Ora i due si muovono insieme.
   */
  function mostraTitoloSessione(nome) {
    sessionTitle.textContent = nome;
    if (sessionSubtitle) sessionSubtitle.textContent = nome && nome !== 'No sessions' ? '' : 'press “New” to start';
  }
  /*
   * ⛔ Due funzioni, non una. Il primo tentativo ne aveva UNA che aggiornava
   * anche ogni `[data-current-session-title]`, e ha fatto scrivere «No
   * sessions» dentro "Session topology" su una sessione che aveva un nome: i
   * label sparsi vanno toccati SOLO dove il codice lo faceva prima, perche'
   * qualcuno di essi viene costruito con un valore piu' fresco di quello che
   * l'intestazione conosce in quel momento.
   * ⇒ Unificare due scritture non e' unificare i loro MOMENTI.
   */
  function mostraTitoloOvunque(nome) {
    mostraTitoloSessione(nome);
    $$('[data-current-session-title]').forEach((label) => { label.textContent = nome; });
  }
  const toastRegion = $('#toastRegion');
  const runStrip = $('.run-strip');
  const runStateToggle = $('#runStateToggle');
  const desktopInspectorToggle = $('.desktop-context-toggle');
  const sessionsCollapseBtn = $('#sessionsCollapseBtn');
  const commandEmpty = $('#commandEmpty');
  const diffPath = $('#diffPath');
  const diffCode = $('#diffCode');
  const campaignSelect = $('#campaignSelect');
  const harnessFilter = $('#harnessFilter');
  const outcomeFilter = $('#outcomeFilter');
  const connectionState = $('[data-connection-state]');
  const campaignReadMeta = $('#campaignReadMeta');
  const campaignRunList = $('#campaignRunList');
  const campaignRunCount = $('#campaignRunCount');
  const campaignReportText = $('#campaignReportText');
  const campaignReportState = $('#campaignReportState');
  const loadMoreRunsButton = $('[data-action="load-more-runs"]');
  const refreshCampaignButton = $('[data-action="refresh-campaign"]');
  const boardEyebrow = $('#boardEyebrow');
  const boardTitle = $('#boardTitle');
  const boardDescription = $('#boardDescription');
  const composerMic = $('.composer-mic');
  const embeddedSessionBack = $('[data-open-panel="sessions"]');
  const topbar = $('.topbar');
  const embeddedHeaderScrollers = [...new Set([...views, chatConversation].filter(Boolean))];
  const embeddedHeaderScrollPositions = new WeakMap();

  if (HOST().classList.contains('talos-embedded')) {
    embeddedSessionBack?.setAttribute('aria-label', 'Back to Code sessions');
  }

  const motionAnimations = new Set();

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
    element.classList.remove('motion-exit');
    element.classList.add('motion-enter');
    element.addEventListener('animationend', () => element.classList.remove('motion-enter'), { once: true });
  }

  function icon(id) {
    return `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  }

  function ensureDemoLabels() {
    $$('[data-demo-surface]').forEach((surface) => {
      if (surface.querySelector('.demo-surface-badge')) return;
      const badge = document.createElement('span');
      badge.className = 'demo-surface-badge';
      badge.textContent = 'Demo UI · not connected';
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
      animateExit(previous, { durationToken: '--talos-motion-duration-tab-change', transform: 'translateX(-8px)' }, () => {
        previous.classList.remove('active');
      });
    }
    target.classList.add('active');
    if (previous !== target) markMotionEnter(target);
    syncNavigationState();
    target.scrollTop = 0;
    resetEmbeddedTopbarScroll(view === 'chat' ? chatConversation : target);
    window.__talosHarnessHostViewChange?.(view);
    if (view === 'dashboard') ensureCampaignBoard();
    // ⭐ porting dal bundle desktop — stessa guardia del resto del file (HARNESS-BOARD-MOBILE-HONESTY-01): zero fetch fantasma se non c'è un backend da raggiungere.
    if (view === 'automations' && !embeddedDemoOnly()) renderAutomationsReali();
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

  function showEmbeddedDialog(dialog) {
    cancelMotionAnimationsFor(dialog);
    prossimaGenerazione(dialog);
    if (!dialog.open) dialog.show();
    markMotionEnter(dialog);
    syncEmbeddedDialogBackdrop();
  }

  function closeEmbeddedDialog(dialog) {
    if (!dialog.open || dialog.classList.contains('motion-exit')) return;
    const generazioneAllaChiusura = motionGenerazione.get(dialog) || 0;
    animateExit(dialog, { durationToken: '--talos-motion-duration-popover' }, () => {
      // guardia: se nel frattempo il dialog è stato riaperto per un
      // contenuto nuovo (una prossimaGenerazione() più recente), questa
      // callback tardiva non deve richiuderlo — vedi cancelMotionAnimationsFor
      // sopra per l'altra metà della cura (ferma anche l'animazione visiva).
      if (dialog.open && motionGenerazione.get(dialog) === generazioneAllaChiusura) dialog.close();
      syncEmbeddedDialogBackdrop();
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
   * ⭐⭐⭐ 2/9 — owner dal vivo: "quando clicco su una sessione i messaggi
   * inviati non compaiono... spunta solo icona TALOS e il nome della
   * sessione... devono esserci i messaggi DELLA SESSIONE anche se e'
   * necessario uno spinner loading". Causa: selectSession() (sotto)
   * viene chiamata SINCRONA dal bridge nativo (HarnessSessionScreen.vue,
   * subito dopo il mount di questo stesso script) PRIMA che
   * riprendiSessioneDalHost() — già in volo, asincrono — sappia se il
   * server ha ancora questa sessione. Mostrava SEMPRE l'invito "Scrivi
   * qui sotto per continuare questa sessione" — il messaggio giusto per
   * una sessione VUOTA (mai avviata), sbagliato e indistinguibile per
   * una che sta ancora CARICANDO la sua vera cronologia. Se il fetch la
   * trova, passaASessione() sostituisce questo hero con lo stream reale
   * (SSE, verificato dal vivo oggi — ledger §51 usa lo stesso
   * meccanismo). Se non la trova (il processo Node del server è
   * effimero: non sopravvive a un force-stop/riavvio, anche con la
   * cronologia persistita su disco — vedi mostraCronologiaNonDisponibile
   * sotto), prima restava un silenzio totale: questo stesso hero
   * "scrivi qui sotto" restava per sempre, uguale in tutto e per tutto a
   * una sessione davvero vuota.
   */
  function costruisciConversationHeroCaricamento(titolo) {
    /*
     * ⭐ 2/9 — owner dal vivo, subito dopo aver visto il primo giro di
     * questa cura: "quando il loader e' visibile devi nascondere il
     * logo e la scritta talos". A differenza di costruisciConversationHero
     * (logo+wordmark+titolo — l'apertura di una sessione VUOTA, un
     * momento "di marca"), qui NON è un momento di marca: è un'attesa,
     * e il logo/wordmark distraevano da quello che conta (il titolo
     * della sessione + lo spinner). Niente hero.append(logo, wordmark).
     */
    const hero = document.createElement('div');
    hero.className = 'conversation-hero conversation-hero-loading';
    hero.id = 'conversationEmptyState';
    hero.appendChild(textElement('p', 'hero-welcome-title', titolo));
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'talos-line-loader');
    svg.setAttribute('viewBox', '0 0 96 16');
    svg.setAttribute('width', '44');
    svg.setAttribute('height', '7');
    svg.setAttribute('aria-hidden', 'true');
    const traccia = document.createElementNS(svgNs, 'line');
    traccia.setAttribute('class', 'talos-line-loader-track');
    traccia.setAttribute('x1', '4'); traccia.setAttribute('y1', '8'); traccia.setAttribute('x2', '92'); traccia.setAttribute('y2', '8');
    const sweep = document.createElementNS(svgNs, 'line');
    sweep.setAttribute('class', 'talos-line-loader-sweep');
    sweep.setAttribute('x1', '4'); sweep.setAttribute('y1', '8'); sweep.setAttribute('x2', '92'); sweep.setAttribute('y2', '8');
    svg.append(traccia, sweep);
    for (const cx of [16, 48, 80]) {
      const nodo = document.createElementNS(svgNs, 'circle');
      nodo.setAttribute('class', 'talos-line-loader-node');
      nodo.setAttribute('cx', String(cx)); nodo.setAttribute('cy', '8'); nodo.setAttribute('r', '4');
      svg.append(nodo);
    }
    hero.append(svg, textElement('p', 'hero-subtitle', 'Fetching the history…'));
    return hero;
  }

  /*
   * Terzo stato onesto (oltre "sta caricando" sopra e "trovata, replay
   * reale" di passaASessione): il server non ha (ancora, o più) questa
   * sessione. Due situazioni distinte arrivano qui e non si possono
   * separare da questo punto (il client non sa se questo id ha MAI
   * avuto un turno reale): una sessione VERA che il server ha perso
   * (il suo processo Node è effimero, non sopravvive a un force-stop,
   * anche con la persistenza di FASE L/R1 attiva) — quella comune di
   * "clicco su una sessione e non vedo i messaggi" — e il breve
   * istante fra la creazione lato nativo e l'invio del primissimo
   * messaggio (`pendingFirstPrompt` in HarnessSessionScreen.vue), dove
   * il server non ha ancora saputo nulla per costruzione. Il testo
   * sotto resta vero in ENTRAMBI i casi, non solo nel primo: scrivere
   * ora funziona sempre, sia che riprenda un vuoto legittimo sia che
   * apra una sessione nuova al posto di quella persa.
   *
   * Tocca #conversation SOLO se il nostro stesso hero di caricamento è
   * ancora lì — se qualcos'altro l'ha già sostituito (una passaASessione
   * vera, un invio del pendingFirstPrompt) non lo sovrascrive.
   */
  function mostraCronologiaNonDisponibile(titolo) {
    if (state.realSession.id) return;
    const conversation = $('#conversation');
    if (!conversation?.querySelector('.conversation-hero-loading')) return;
    conversation.replaceChildren(costruisciConversationHero(
      titolo || state.session || 'Session',
      'No history found for this session right now. Write below to continue: if the server was restarted, your message opens a new session from here.',
    ));
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
        const righeCodice = [];
        i += 1;
        while (i < righe.length && !/^```/.test(righe[i].trim())) { righeCodice.push(righe[i]); i += 1; }
        const pre = document.createElement('pre');
        pre.appendChild(textElement('code', '', righeCodice.join('\n')));
        frammento.appendChild(pre);
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
   * ⭐⭐⭐ 2/9 — rendering INCREMENTALE dello streaming, portato dal
   * desktop (review Fable R4: `copia.replaceChildren(renderizzaMarkdownSemplice(testoGrezzo))`
   * ad OGNI delta, O(n²) — costo che cresce col testo). Il desktop l'ha
   * misurato e curato lo stesso giorno (`harness-ui/public/app.js`,
   * commit `7a35dcb7`): 13.068 caratteri in 162 delta, 1,28s di main
   * thread → 0,35s, zero frame sopra 16,7ms. Stesse fonti citate lì
   * (Hermes PR #67236/#67154, Vercel Streamdown) — non una nuova
   * ricerca, lo stesso algoritmo portato, non reinventato.
   *
   * Un blocco si chiude su una riga vuota FUORI da un ```fence``` (il
   * fence è l'unico costrutto che attraversa righe vuote): tagliare il
   * testo all'ultima riga vuota fuori fence e renderizzare i due pezzi
   * separatamente produce ESATTAMENTE lo stesso DOM del tutto-insieme —
   * i nodi stabili non si ritoccano più, solo la coda (ancora aperta)
   * si distrugge e ricrea a ogni frame.
   *
   * ⛔ NON portato: il sistema di ritmo/dissolvenza parola-per-parola
   * del desktop (`avanzaRitmoStreaming`/`modalitaAnimazioneStreaming`/
   * `avvolgiParoleRecenti`, la classe `stream-settle`) — è una feature
   * UX separata dal fix di prestazioni che R4 chiedeva, e mobile non ha
   * mai avuto un ritmo di rivelazione: rivela il testo COMPLETO
   * ricevuto finora, come ha sempre fatto. Questa funzione riceve
   * quel testo intero (mai una porzione "quanto rivelare ora") — la
   * differenza col desktop sta solo in COSA le viene passato, non
   * nell'algoritmo di rendering incrementale in sé.
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
      // Il testo non è più un prefisso di ciò che era (o è la prima
      // chiamata): si riparte da zero, mai un DOM incoerente.
      contenitore.replaceChildren(renderizzaMarkdownSemplice(stabile));
      statoRender.prefisso = stabile;
      statoRender.nodiCoda = [];
    } else {
      for (const nodo of statoRender.nodiCoda) nodo.remove();
      statoRender.nodiCoda = [];
      if (stabile.length > statoRender.prefisso.length) {
        contenitore.appendChild(renderizzaMarkdownSemplice(stabile.slice(statoRender.prefisso.length)));
        statoRender.prefisso = stabile;
      }
    }
    const coda = renderizzaMarkdownSemplice(testo.slice(confine));
    statoRender.nodiCoda = [...coda.childNodes];
    contenitore.appendChild(coda);
  }

  /*
   * ⭐⭐⭐ 2/9 — coalescenza: più delta arrivati nello stesso frame
   * producono UN SOLO render, non uno a delta (stesso principio del
   * desktop, `programmaRenderMessaggioStreaming`). Il testo grezzo resta
   * comunque accumulato SUBITO in `testoGrezzoMessaggi` (sincrono, come
   * sempre) — solo il render DOM è differito, mai l'accumulo dei dati.
   * `cancellaRenderMessaggiStreaming()` si chiama da
   * `nuovaGenerazioneSessione()`: un render già schedulato per la
   * sessione VECCHIA non deve toccare il DOM della sessione nuova.
   */
  let streamingRenderPending = new Set();
  let streamingRenderFrame = null;

  function renderizzaMessaggioStreamingOra(messageId) {
    streamingRenderPending.delete(messageId);
    const element = state.realSession.messageElements.get(messageId);
    const testoGrezzo = state.realSession.testoGrezzoMessaggi.get(messageId);
    if (!element || typeof testoGrezzo !== 'string') return;
    const copia = $('.assistant-copy', element);
    if (!copia) return;
    let statoRender = state.realSession.renderIncrementale.get(messageId);
    if (!statoRender) {
      statoRender = { prefisso: null, nodiCoda: [] };
      state.realSession.renderIncrementale.set(messageId, statoRender);
    }
    renderizzaMarkdownIncrementale(copia, statoRender, testoGrezzo);
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

  function setConnectionState(value, label, detail) {
    connectionState.dataset.connectionState = value;
    connectionState.textContent = label;
    if (detail !== undefined) campaignReadMeta.textContent = detail;
  }

  function boardErrorMessage(error) {
    if (error?.code && typeof error.message === 'string' && error.message) return error.message;
    return 'The local server is not responding. Open Codice on the PC and try again.';
  }

  function formatCost(value, estimated = false) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const amount = value.toFixed(9).replace(/\.?0+$/, '');
    return `${estimated ? '~' : ''}$${amount}`;
  }

  /**
   * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — il
   * contatore costo/token per una sessione VIVA (oggi esiste solo per le
   * righe storiche della Board campagne). Solo token, MAI un costo in
   * dollari: calcolarlo richiederebbe sapere con certezza quale modello
   * ha girato QUESTO giro (il server può ricadere sul suo default senza
   * dirlo al client) — mostrare un numero solo perché "probabilmente"
   * giusto sarebbe un bluff, lo stesso principio che vieta un
   * `enforcement` finto altrove in questo progetto. Token contati sono
   * sempre veri, indipendentemente dal prezzo.
   */
  /** ⭐ 3/9 — sollevato da dentro formattaUsageBreve: lo riusa anche aggiornaRunKpis() per il kpi "ctx" del run-strip, invece di duplicare la stessa formula in due posti. */
  function formattaKilo(n) {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }

  function formattaUsageBreve(usage) {
    if (!usage) return 'contesto ignoto · in attesa del primo giro';
    const prompt = Number(usage.prompt_tokens ?? 0) || 0;
    const completion = Number(usage.completion_tokens ?? 0) || 0;
    const cache = Number(usage.prompt_tokens_details?.cached_tokens ?? 0) || 0;
    const totale = prompt + completion;
    const cacheParte = cache > 0 ? ` · cache ${formattaKilo(cache)}` : '';
    return `${formattaKilo(totale)} token · ${usage.giri} gir${usage.giri === 1 ? 'o' : 'i'}${cacheParte} · live`;
  }

  /**
   * ⭐⭐⭐ 3/9 — le tre metriche del run-strip («— step — ctx — errors»)
   * restavano SEMPRE a trattino: nessun codice le aggiornava mai (trovato
   * leggendo, non ipotizzato — setRunState toccava solo label e timer).
   * "step" = giri veri riportati dal kernel (usage.giri, la stessa fonte
   * di formattaUsageBreve — mai un conteggio client separato che
   * potrebbe disallinearsi); "ctx" = token del giro corrente (prompt +
   * completion, stessa formula di formattaUsageBreve); "errors" = quanti
   * ToolCallResult di QUESTO giro hanno avuto pareFallito()===true (vedi
   * erroriStrumento, incrementato nel case ToolCallResult). Usage
   * assente (nessun giro ancora riportato) ⇒ trattino onesto, mai uno 0
   * che direbbe "zero token" quando in realtà è "non ancora saputo".
   */
  function aggiornaRunKpis() {
    const usage = state.realSession.usage;
    const stepEl = $('[data-run-kpi="step"] b');
    const ctxEl = $('[data-run-kpi="ctx"] b');
    const errorsEl = $('[data-run-kpi="errors"] b');
    if (stepEl) stepEl.textContent = usage && typeof usage.giri === 'number' ? String(usage.giri) : '—';
    if (ctxEl) {
      const totale = usage ? (Number(usage.prompt_tokens ?? 0) || 0) + (Number(usage.completion_tokens ?? 0) || 0) : 0;
      ctxEl.textContent = usage ? formattaKilo(totale) : '—';
    }
    if (errorsEl) errorsEl.textContent = String(state.realSession.erroriStrumento || 0);
  }

  /** ⭐ 3/9 — MM:SS su una durata in ms, mai negativo (Date.now() fra due eventi non è mai garantito monotono di un microsecondo, meglio un 00:00 onesto che un "-00:01"). */
  function formattaDurataRun(ms) {
    const totale = Math.max(0, Math.floor(ms / 1000));
    const minuti = Math.floor(totale / 60);
    const secondi = totale % 60;
    return `${String(minuti).padStart(2, '0')}:${String(secondi).padStart(2, '0')}`;
  }

  let cronometroRunId = null;

  /** ⭐ 3/9 — ricalcola dal VERO Date.now() ogni volta, mai un contatore incrementato a mano: sopravvive a un tab in background che salta dei tick di setInterval senza sfasarsi. */
  function aggiornaCronometroRun() {
    const timer = runStateToggle?.querySelector('span:last-child');
    if (!timer || !state.realSession.runIniziatoAlle) return;
    timer.textContent = formattaDurataRun(Date.now() - state.realSession.runIniziatoAlle);
  }

  /** Ripatcha la riga "Main" del foglio Session tree SE è già aperto — non riapre né forza un redraw di tutto il foglio, stesso principio di aggiornaPillolaModello(). */
  function aggiornaContatoreUsage() {
    const nodo = $('[data-usage-summary]');
    if (nodo) nodo.textContent = `Main · ${formattaUsageBreve(state.realSession.usage)}`;
    aggiornaRunKpis(); // ⭐ 3/9 — stessa fonte (state.realSession.usage), stesso momento di aggiornamento: mai due punti che potrebbero disallinearsi
  }

  function formatPassRate(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
  }

  function replaceSelectOptions(select, values, allLabel, selectedValue = '') {
    select.replaceChildren();
    if (allLabel !== null) {
      const all = document.createElement('option');
      all.value = '';
      all.textContent = allLabel;
      select.appendChild(all);
    }
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = values.includes(selectedValue) ? selectedValue : '';
  }

  function renderCampaignOptions(campaigns) {
    campaignSelect.replaceChildren();
    for (const campaign of campaigns) {
      const option = document.createElement('option');
      option.value = campaign.name;
      option.textContent = campaign.available ? campaign.name : `${campaign.name} · non disponibile`;
      option.disabled = !campaign.available;
      campaignSelect.appendChild(option);
    }
    campaignSelect.disabled = campaigns.every((campaign) => !campaign.available);
    if (state.board.campaign) campaignSelect.value = state.board.campaign;
  }

  function renderCampaignFilters(summary) {
    const harnesses = (summary?.harnesses || []).map((entry) => entry.harness);
    const outcomes = Object.keys(summary?.outcomeCounts || {});
    replaceSelectOptions(harnessFilter, harnesses, 'Tutti', harnessFilter.value);
    replaceSelectOptions(outcomeFilter, outcomes, 'Tutti', outcomeFilter.value);
  }

  function renderCampaignSummary(summary) {
    $('#summaryTotal').textContent = summary ? String(summary.totalRows) : '—';
    $('#summaryMeasured').textContent = summary ? String(summary.measuredRows) : '—';
    $('#summaryPassRate').textContent = summary ? formatPassRate(summary.passRate) : '—';
    $('#summaryCost').textContent = summary
      ? formatCost(summary.canonicalCostUsd, summary.costEstimated)
      : '—';
    $('#summaryDiagnostics').textContent = summary ? String(summary.diagnosticCount) : '—';
    $('#summaryCostSource').textContent = !summary || summary.canonicalCostUsd === null
      ? 'non disponibile'
      : (summary.costEstimated ? '~ somma righe' : 'file corsa');
    renderCampaignFilters(summary);
  }

  function appendRunDetail(detail, label, value) {
    const item = document.createElement('div');
    const term = textElement('dt', '', label);
    const description = textElement('dd', '', value);
    item.append(term, description);
    detail.appendChild(item);
  }

  let runDetailSequence = 0;
  function createCampaignRun(row) {
    const article = document.createElement('article');
    article.className = 'campaign-run';
    const toggle = document.createElement('button');
    toggle.className = 'campaign-run-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');

    const identity = document.createElement('span');
    identity.append(
      textElement('strong', '', `${row.harness} · ${row.id}`),
      textElement('small', '', `${row.source.file}:${row.source.line} · ${row.modello || 'modello non dichiarato'}`),
    );
    const outcome = textElement('span', 'status-chip campaign-run-outcome', row.esito);
    toggle.append(identity, outcome);

    const detail = document.createElement('div');
    detail.className = 'campaign-run-detail';
    detail.hidden = true;
    detail.id = `campaign-run-detail-${runDetailSequence += 1}`;
    toggle.setAttribute('aria-controls', detail.id);
    const facts = document.createElement('dl');
    appendRunDetail(facts, 'Difficoltà', row.difficolta);
    appendRunDetail(facts, 'Durata', typeof row.ms === 'number' ? `${row.ms} ms` : '—');
    appendRunDetail(facts, 'Costo riga', formatCost(row.costoUsd));
    appendRunDetail(facts, 'Corpus', row.corpus);
    appendRunDetail(facts, 'Quando', row.quando);
    appendRunDetail(facts, 'Cambiamenti', row.cambiamenti?.quanti ?? '—');
    detail.appendChild(facts);

    toggle.addEventListener('click', () => {
      const opening = detail.hidden;
      toggle.setAttribute('aria-expanded', String(opening));
      if (!opening) {
        animateExit(detail, { durationToken: '--talos-motion-duration-disclosure' }, () => { detail.hidden = true; });
        return;
      }
      detail.hidden = false;
      markMotionEnter(detail);
      if (!detail.querySelector('.run-evidence')) {
        const evidence = textElement(
          row.detto === null || row.detto === undefined ? 'p' : 'pre',
          'run-evidence',
          row.detto === null || row.detto === undefined ? 'Evidenza svuotata dalla memoria della pagina.' : row.detto,
        );
        detail.appendChild(evidence);
      }
    });

    article.append(toggle, detail);
    return article;
  }

  function renderCampaignRuns(items, { append = false } = {}) {
    if (!append) campaignRunList.replaceChildren();
    for (const row of items) campaignRunList.appendChild(createCampaignRun(row));
    if (!append && items.length === 0) {
      campaignRunList.appendChild(textElement('p', 'board-empty', 'No row matches the selected filters.'));
    }
    campaignRunCount.textContent = `${state.board.runs.length} di ${state.board.totalMatched} righe`;
    loadMoreRunsButton.hidden = !state.board.nextCursor;
  }

  function renderCampaignReport(report, errorCode = null) {
    campaignReportState.classList.toggle('success', Boolean(report));
    if (report) {
      campaignReportState.textContent = 'Disponibile';
      campaignReportText.textContent = report.text;
      return;
    }
    campaignReportState.textContent = errorCode === 'REPORT_UNAVAILABLE' ? 'Non prodotto' : 'Not available';
    campaignReportText.textContent = errorCode === 'REPORT_UNAVAILABLE'
      ? 'Report not produced yet'
      : 'Rapporto non disponibile';
  }

  /*
   * ⭐⭐⭐ 2/9 — owner: "non si accettano compromessi... un utente reale
   * non deve perdere la cronologia chat oppure attendere all'infinito
   * una cronologia che non arriva". Ricerca fatta (pattern di sync
   * offline-first/chat: getstream.io, alldaystech.com) — ogni fonte
   * concorda: mai una chiamata di rete senza un tetto di tempo, uno
   * stato locale mostrato SUBITO mentre la rete lavora in sottofondo.
   * `apiGet` non aveva NESSUN timeout — un fetch che resta appeso
   * (rete morta, server che non risponde più) prima poteva bloccare
   * `caricaCronologiaSessione` per sempre, esattamente il sintomo
   * temuto. 12s: generoso per un server che si sta ancora avviando su
   * un telefono, ma un tetto vero, non "mai".
   */
  async function apiGet(pathname, { timeoutMs = 12000 } = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(API(pathname), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`No answer from the server within ${Math.round(timeoutMs / 1000)}s`);
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      const error = new Error('Invalid local response');
      error.code = 'INTERNAL_ERROR';
      throw error;
    }
    if (!response.ok || !envelope?.ok) {
      const error = new Error(envelope?.error?.message || 'Local request failed');
      error.code = envelope?.error?.code || 'INTERNAL_ERROR';
      throw error;
    }
    return envelope.data;
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
      const error = new Error('Invalid local response');
      error.code = 'INTERNAL_ERROR';
      throw error;
    }
    if (!response.ok || !envelope?.ok) {
      const error = new Error(envelope?.error?.message || 'Local request failed');
      error.code = envelope?.error?.code || 'INTERNAL_ERROR';
      throw error;
    }
    return envelope.data;
  }

  /**
   * ⛔ 29/8 — il porting di FASE C (sub-agenti, lane/harness-desktop
   * 89829429) portava anche una copia di riassuntoDoctor/
   * refreshDoctorBadge/eseguiDoctor/caricaPannelloHooks/rigaHook/
   * caricaAlberoSessione/rigaFiglio — IDENTICA byte per byte (diffata a
   * mano contro la copia più sotto in questo file) a quella già
   * presente qui da una porta precedente, stessa sessione (§13/§18/§19
   * del ledger). Rimossa la duplicazione qui: le uniche due funzioni
   * REALMENTE nuove di questo commit (creaModelPicker/creaEffortPicker)
   * restano, subito sotto.
   *
   * ⛔⛔ 29/8 — nota per dopo, NON risolta da questo commit: il
   * commento originale (rimosso sopra) diceva che questa cura era per
   * "il foglio Session tree" (`.sheet-option`, aperto dalla Command
   * Palette) — e lo È, verificato: quella sheet chiama già `/children`
   * per davvero. MA la scheda "Agents" del Context Rail (verificata
   * dal vivo, screenshot: "A1 Responsive auditor"/"A2 A11y reviewer")
   * è un markup COMPLETAMENTE DIVERSO (`.agent-card`, statico in
   * index.html:420-421, mai una riga di JS) — una terza superficie,
   * non toccata da nessuno di questi cherry-pick. Resta un mockup:
   * lavoro mobile-specifico separato, non qui.
   */

  /**
   * ⭐⭐⭐ 28/8 — FASE A (hook), piano `elegant-spinning-dongarra.md`.
   * Riempie `#hooksListMount` nel foglio "control" con gli hook VERI
   * del progetto della sessione attiva — mai un contatore inventato.
   * No session attiva → stato onesto, ZERO richiesta di rete
   * (stessa disciplina "niente fetch fantasma" di ogni altra superficie
   * di questo bundle). Ri-chiamata dopo ogni "Fida" riuscita, cosi' il
   * bottone sparisce subito — non serve richiudere/riaprire il foglio.
   */
  async function caricaPannelloHooks() {
    const mount = $('#hooksListMount', sheetBody);
    if (!mount) return; // il foglio "control" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'No active session — open or start a task to see the project hooks.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Loading hooks…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/hooks`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Hooks not available: ${error.message}`));
      return;
    }
    if (mount !== $('#hooksListMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (dati.errore) {
      mount.replaceChildren(textElement('p', 'board-empty', `.harness-ui-hooks.json is not valid: ${dati.errore}`));
      return;
    }
    if (!dati.hooks || dati.hooks.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'No hooks declared in this project (.harness-ui-hooks.json).'));
      return;
    }
    mount.replaceChildren(...dati.hooks.map((hook) => rigaHook(hook)));
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
          toast('Failed', error.message);
        }
      });
      statoEl = bottone;
    }
    riga.append(iconEl, testo, statoEl);
    return riga;
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
  function creaModelPicker({ valoreIniziale = '', apriSubito = false, alSelezionato } = {}) {
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
    searchInput.placeholder = 'Search a model or provider…';
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
    refreshBtn.append(refreshIconSpan, document.createTextNode('Refresh'));
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
      triggerLabel.textContent = valoreScelto || 'Predefinito del server';
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
        listEl.replaceChildren(textElement('p', 'board-empty', 'Loading the catalogue from OpenRouter…'));
        return;
      }
      const filtrati = filtraModelli(query);
      if (filtrati.length === 0) {
        listEl.replaceChildren(textElement('p', 'board-empty', query.trim() ? `No model matches "${query.trim()}".` : 'No model available.'));
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
          opt.addEventListener('click', () => {
            valoreScelto = modello.id;
            state.model = modello.id; // ⭐ un'unica fonte di verità: la pillola del composer e il foglio "Model" restano sincronizzati
            aggiornaTriggerLabel();
            aggiornaPillolaModello();
            chiudi();
            alSelezionato?.(modello.id);
          });
          pezzi.push(opt);
        }
      }
      listEl.replaceChildren(...pezzi);
    }

    async function carica({ forza = false } = {}) {
      listEl.replaceChildren(textElement('p', 'board-empty', 'Loading the catalogue from OpenRouter…'));
      try {
        const dati = await apiGet(`/api/v1/models${forza ? '?forza=1' : ''}`);
        modelliCache = dati.modelli;
        caricato = true;
        metaSpan.textContent = `${dati.modelli.length} modelli${dati.daCache ? ' · da cache' : ''}`;
        renderLista();
      } catch (error) {
        listEl.replaceChildren(textElement('p', 'board-empty', `Catalogue not available: ${error.message}`));
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
      if (event.key === 'Escape') { event.preventDefault(); chiudi(); trigger.focus(); }
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
     * il trigger collassato (utile in "New session", un campo fra
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
      selected.textContent = toccato ? LIVELLI_RAGIONAMENTO[indice].etichetta : 'Predefinito del server';
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

  function runsPath(cursor = null) {
    const params = new URLSearchParams({ limit: '40' });
    if (harnessFilter.value) params.set('harness', harnessFilter.value);
    if (outcomeFilter.value) params.set('esito', outcomeFilter.value);
    if (cursor) params.set('cursor', cursor);
    return `/api/v1/campaigns/${encodeURIComponent(state.board.campaign)}/runs?${params}`;
  }

  async function loadCampaignRuns({ append = false, generation = state.board.generation } = {}) {
    const page = await apiGet(runsPath(append ? state.board.nextCursor : null));
    if (generation !== state.board.generation) return;
    state.board.runs = append ? state.board.runs.concat(page.items) : page.items;
    state.board.nextCursor = page.nextCursor;
    state.board.totalMatched = page.totalMatched;
    renderCampaignRuns(page.items, { append });
  }

  async function loadCampaignReport(generation) {
    try {
      const report = await apiGet(`/api/v1/campaigns/${encodeURIComponent(state.board.campaign)}/report`);
      if (generation === state.board.generation) renderCampaignReport(report);
    } catch (error) {
      if (generation !== state.board.generation) return;
      if (error.code === 'REPORT_UNAVAILABLE') {
        renderCampaignReport(null, error.code);
        return;
      }
      throw error;
    }
  }

  async function refreshCampaign() {
    if (!state.board.campaign) return;
    const generation = state.board.generation += 1;
    refreshCampaignButton.disabled = true;
    setConnectionState('loading', 'Reading', 'Rileggo i file locali autorizzati.');
    campaignReportState.textContent = 'Reading…';
    try {
      const snapshot = await apiGet(`/api/v1/campaigns/${encodeURIComponent(state.board.campaign)}/snapshot`);
      if (generation !== state.board.generation) return;
      renderCampaignSummary(snapshot.summary);
      campaignReadMeta.textContent = `Read ${snapshot.readAt} · SHA-256 ${snapshot.sourceHash}`;
      await Promise.all([
        loadCampaignRuns({ append: false, generation }),
        loadCampaignReport(generation),
      ]);
      if (generation !== state.board.generation) return;
      setConnectionState('ready', 'Real data · read-only');
      // ⭐ 26/8, riconciliazione desktop→mobile — trovato con una prova vera
      // (browser reale contro il server vero, non ipotizzato): il badge
      // "Demo UI" della Board restava visibile anche a dati reali caricati,
      // difetto preesistente MAI notato perché su mobile embedded questo
      // ramo non veniva mai raggiunto. Stesso principio già applicato ad
      // aggiornaAlberoReale/aggiornaPannelloAmbiente: dati reali arrivati,
      // l'etichetta demo deve sparire.
      const demoBadgeBoard = $('.demo-surface-badge', $('[data-view="dashboard"]'));
      if (demoBadgeBoard) demoBadgeBoard.hidden = true;
    } catch (error) {
      if (generation !== state.board.generation) return;
      state.board.runs = [];
      state.board.nextCursor = null;
      state.board.totalMatched = 0;
      renderCampaignSummary(null);
      renderCampaignRuns([]);
      renderCampaignReport(null, error.code);
      setConnectionState('error', 'Collegamento non disponibile', boardErrorMessage(error));
    } finally {
      if (generation === state.board.generation) refreshCampaignButton.disabled = false;
    }
  }

  async function loadCampaigns() {
    setConnectionState('loading', 'Connessione locale', 'Leggo la allowlist dal server Codice.');
    const campaigns = await apiGet('/api/v1/campaigns');
    state.board.campaigns = campaigns;
    const available = campaigns.filter((campaign) => campaign.available);
    if (available.length === 0) throw new Error('No authorised campaign available');
    if (!available.some((campaign) => campaign.name === state.board.campaign)) {
      state.board.campaign = available[0].name;
    }
    renderCampaignOptions(campaigns);
    campaignSelect.value = state.board.campaign;
    state.board.initialized = true;
    await refreshCampaign();
  }

  function renderEmbeddedBoardDemo(announce = false) {
    state.board.initialized = true;
    state.board.campaign = null;
    state.board.campaigns = [];
    state.board.runs = [];
    state.board.nextCursor = null;
    state.board.totalMatched = 0;
    boardEyebrow.textContent = 'Board Codice · Demo UI';
    boardTitle.textContent = 'Run preview';
    boardDescription.textContent = 'This mobile surface has no backend: no benchmark data is read or simulated.';
    campaignSelect.replaceChildren(new Option('Demo non collegata', ''));
    campaignSelect.disabled = true;
    harnessFilter.replaceChildren(new Option('Tutti', ''));
    harnessFilter.disabled = true;
    outcomeFilter.replaceChildren(new Option('Tutti', ''));
    outcomeFilter.disabled = true;
    renderCampaignSummary(null);
    renderCampaignRuns([]);
    renderCampaignReport(null, 'REPORT_UNAVAILABLE');
    $('.board-empty', campaignRunList).textContent = 'No mobile data connected.';
    campaignReportState.textContent = 'Demo';
    campaignReportText.textContent = 'No mobile report connected';
    setConnectionState('demo', 'Demo UI · not connected', 'No mobile backend is configured for Code.'); // ⭐ 3/9 — "Codice" → "Code": combacia col resto del brand inglese (title, en.ts), non un'eccezione isolata
    if (announce) toast('Demo board not connected', 'No network request was made.');
  }

  function ensureCampaignBoard() {
    if (embeddedDemoOnly()) {
      renderEmbeddedBoardDemo();
      return Promise.resolve();
    }
    if (state.board.initialized || state.board.bootstrapPromise) return state.board.bootstrapPromise;
    state.board.bootstrapPromise = loadCampaigns()
      .catch((error) => {
        state.board.initialized = false;
        setConnectionState('error', 'Server locale non disponibile', boardErrorMessage(error));
        renderCampaignSummary(null);
        renderCampaignRuns([]);
        renderCampaignReport(null, error.code);
      })
      .finally(() => { state.board.bootstrapPromise = null; });
    return state.board.bootstrapPromise;
  }

  async function reloadRunsFromFilters() {
    if (!state.board.initialized) return;
    const generation = state.board.generation;
    loadMoreRunsButton.disabled = true;
    try {
      await loadCampaignRuns({ append: false, generation });
      setConnectionState('ready', 'Real data · read-only');
    } catch (error) {
      setConnectionState('error', 'Filtro non disponibile', boardErrorMessage(error));
    } finally {
      loadMoreRunsButton.disabled = false;
    }
  }

  function clearCampaignEvidence() {
    if (embeddedDemoOnly()) {
      toast('No evidence attached', 'La Board mobile è una Demo UI senza backend.');
      return;
    }
    for (const row of state.board.runs) row.detto = null;
    $$('.run-evidence', campaignRunList).forEach((element) => element.remove());
    $$('.campaign-run-detail', campaignRunList).forEach((detail) => { detail.hidden = true; });
    $$('.campaign-run-toggle', campaignRunList).forEach((button) => button.setAttribute('aria-expanded', 'false'));
    toast('Evidenze svuotate', 'I testi detto sono stati rimossi solo dalla memoria e dal DOM della pagina.');
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
      toast('Copy not available', 'Select the content manually.');
    }
  }

  /** Accorcia un testo a `max` caratteri, con ellissi — portato dal bundle desktop (nessuna variazione). */
  function tronca(testo, max) {
    return testo.length > max ? `${testo.slice(0, max - 1)}…` : testo;
  }

  /*
   * ⭐⭐⭐ 29/8 — porting dal bundle desktop (FASE A/C del ledger basso
   * livello, chiuse 28/8 su desktop). Sul mio bundle il foglio "control"
   * mostrava ESATTAMENTE lo stesso bluff che desktop aveva prima della
   * FASE A: "Agents" e "Hooks" con contatori inventati (2 e 4, mai letti
   * da nessuna riga di JS), "Doctor" con `<span>Healthy</span>` statico
   * MAI verificato, tre checkbox "Approval policy" sempre `checked` senza
   * un solo listener. Backend già esiste e già serve desktop
   * (`/api/v1/doctor`, `/api/v1/sessions/:id/hooks(/:id/trust)`,
   * `/api/v1/sessions/:id/children` — stesso protocollo AG-UI, stesso
   * `server.mjs` raggiunto via `API()`/adb-reverse già cablato su questo
   * bundle): questo porting collega SOLO il frontend, zero righe nuove
   * lato server. Le due voci genuinamente non ancora costruite (un
   * pannello "Agents" di configurazione, "Approval policy" per-tool)
   * restano dichiarate "Non ancora implementato" nel template sotto —
   * mai un bluff sostituito con un altro.
   */
  function riassuntoDoctor(risultato) {
    const problemi = [];
    if (!risultato.chiaveApi) problemi.push('chiave API assente');
    if (risultato.shell !== 'wsl2') problemi.push(`shell ${risultato.shell === 'none' ? 'not sandboxed' : risultato.shell}`);
    if (!risultato.git) problemi.push('git non trovato');
    if (!risultato.naviga) problemi.push('browser non disponibile');
    return problemi.length === 0
      ? { badge: 'Healthy', dettaglio: `API key ok · shell ${risultato.shell} · git ok · browser ok.` }
      : { badge: `${problemi.length} da rivedere`, dettaglio: `${problemi.join(' · ')}.` };
  }

  /** Refresh lo stato accanto al bottone Doctor dentro il foglio "control", se è aperto. */
  async function refreshDoctorBadge() {
    const badgeEl = $('[data-doctor-status]', sheetBody);
    if (!badgeEl) return;
    try {
      badgeEl.textContent = riassuntoDoctor(await apiGet('/api/v1/doctor')).badge;
    } catch {
      badgeEl.textContent = 'Not available';
    }
  }

  async function eseguiDoctor() {
    let risultato;
    try {
      risultato = await apiGet('/api/v1/doctor');
    } catch (error) {
      toast('Doctor not available', error.message);
      return;
    }
    const { badge, dettaglio } = riassuntoDoctor(risultato);
    toast(`Doctor: ${badge}`, dettaglio);
    const badgeEl = $('[data-doctor-status]', sheetBody);
    if (badgeEl) badgeEl.textContent = badge;
  }

  /*
   * ⭐⭐⭐ porting FASE C (sub-agenti) dal bundle desktop — il foglio
   * "Session tree" mostrava due righe INVENTATE ("Responsive audit"/
   * "A11y review", mai collegate a nulla, con un bottone "+ Nuovo side
   * thread" che chiamava solo un toast). Stesso pattern di
   * caricaPannelloHooks() sopra: fetch reale, guardia anti-gara se il
   * foglio cambia mentre la fetch è in volo.
   */
  async function caricaAlberoSessione() {
    const mount = $('#subagentTreeMount', sheetBody);
    if (!mount) return; // il foglio "sessionTree" non è (più) quello aperto
    if (!state.realSession.id) {
      mount.replaceChildren(textElement('p', 'board-empty', 'No active session.'));
      return;
    }
    mount.replaceChildren(textElement('p', 'board-empty', 'Loading delegations…'));
    let dati;
    try {
      dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/children`);
    } catch (error) {
      mount.replaceChildren(textElement('p', 'board-empty', `Delegations not available: ${error.message}`));
      return;
    }
    if (mount !== $('#subagentTreeMount', sheetBody)) return; // il foglio è cambiato mentre la fetch era in volo
    if (!dati.figli || dati.figli.length === 0) {
      mount.replaceChildren(textElement('p', 'board-empty', 'No delegation yet — TALOS starts one itself, with the delega_sottotask tool, when a sub-task is genuinely separable.'));
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
    testo.append(
      textElement('strong', null, tronca(figlio.task || '(compito non registrato)', 60)),
      textElement('small', null, figlio.conclusa ? `Delega · ${figlio.esitoDelega || 'conclusa'}` : 'Delega · in corso'),
    );
    const statoEl = textElement('span', figlio.conclusa ? 'status-chip success' : 'status-chip', figlio.conclusa ? '✓' : '●');
    riga.append(iconEl, testo, statoEl);
    riga.addEventListener('click', () => {
      passaASessione(figlio.sessionId, figlio.sessionId, figlio.task);
      closeEmbeddedDialog(sheetDialog);
    });
    return riga;
  }

  /*
   * ⭐⭐⭐ 29/8 — porting dal bundle desktop (piano `elegant-spinning-dongarra.md`
   * §1.3-BIS, blocco Automazioni, commit desktop `582dffcf`/27/8). La card
   * `.attention-card` nella sidebar mostrava sempre "2 automazioni ·
   * Prossima esecuzione 10:00" scritto a mano nell'HTML — mai letto da
   * nessuna riga di JS. La vista "Automazioni" aveva UNA riga reale
   * (avvio task dal corpus, già cablata 27/8) e una FINTA ("Weekly
   * dependency audit", bottone "Modifica" → solo un toast). Backend già
   * esiste e già serve desktop (`/api/v1/automations` + `/:id/toggle` +
   * `/:id/elimina`, POST per crearne una nuova): porting solo frontend.
   * Stesso `embeddedDemoOnly()` già in uso per 'run' — mai il check grezzo
   * `talos-embedded` che desktop usa in un paio di punti (mai vero su
   * desktop stesso, quindi mai stato provato lì; su mobile spegnerebbe la
   * funzione per sempre anche col tunnel attivo — verificato leggendo il
   * codice, non assunto, prima di portarlo).
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
      sottotitolo.textContent = prossime.length > 0 ? `Next run ${formattaOraSessione(prossime[0])}` : 'None active';
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
        ? `on · every ${automazione.intervalloMinuti} min · max ${automazione.limiteAlGiorno}/day · next ${formattaOraSessione(automazione.prossimaEsecuzione)}`
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
          toast('That did not work', error.message);
        }
      });
      const eliminaBtn = document.createElement('button');
      eliminaBtn.className = 'secondary-btn compact';
      eliminaBtn.textContent = 'Delete';
      eliminaBtn.addEventListener('click', async () => {
        try {
          await apiPost(`/api/v1/automations/${encodeURIComponent(automazione.id)}/elimina`, {});
          toast('Automation deleted', automazione.nome);
          renderAutomationsReali();
        } catch (error) {
          toast('That did not work', error.message);
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
    showEmbeddedDialog(sheetDialog);

    let tasks;
    try {
      tasks = (await apiGet('/api/v1/tasks')).items;
    } catch (error) {
      sheetBody.replaceChildren(textElement('p', 'board-empty', `List not available: ${error.message}`));
      return;
    }

    const form = document.createElement('form');
    form.className = 'sheet-section';
    form.appendChild(textElement('span', 'sheet-label', 'Corpus task'));
    const selectTask = document.createElement('select');
    selectTask.className = 'sheet-input';
    for (const task of tasks) {
      const opzione = document.createElement('option');
      opzione.value = task.id;
      opzione.textContent = `${task.id} · difficulty ${task.difficolta}`;
      selectTask.appendChild(opzione);
    }
    form.appendChild(selectTask);
    form.appendChild(textElement('span', 'sheet-label', 'Every how many minutes'));
    const inputIntervallo = document.createElement('input');
    inputIntervallo.className = 'sheet-input';
    inputIntervallo.type = 'number';
    inputIntervallo.min = '5';
    inputIntervallo.value = '30';
    form.appendChild(inputIntervallo);
    form.appendChild(textElement('span', 'sheet-label', 'Maximum runs per day'));
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
        toast('Automation created', 'In pausa — attivala dall\'elenco quando vuoi.');
        renderAutomationsReali();
      } catch (error) {
        toast('Create failed', error.message);
      }
    });
    sheetBody.replaceChildren(form);
  }

  /**
   * ⭐⭐⭐ 27/8 (porta 29/8, ledger §21) — il badge "Demo UI" restava
   * acceso anche sopra un foglio ormai reale al 100%. Whitelist
   * esplicita, non un "nascondi sempre": solo i tipi verificati riga
   * per riga. ⛔ 'sessionTree' aggiunto qui rispetto al canonico di
   * origine: sul canonico, al momento di questo commit, mostrava
   * ancora righe fork/side-thread inventate — su QUESTA copia
   * `caricaAlberoSessione`/rigaFiglio chiamano già GET .../children
   * per davvero (porta precedente, stessa sessione), quindi il badge
   * demo lì sarebbe un falso allarme.
   */
  const TIPI_FOGLIO_INTERAMENTE_ONESTI = new Set(['model', 'capabilities', 'control', 'fileViewer', 'renameFile', 'deleteFile', 'createFile', 'export', 'sessionTree']);
  function openSheet(type) {
    const content = sheetTemplates[type];
    if (!content) return;
    sheetEyebrow.textContent = content.eyebrow;
    sheetTitle.textContent = content.title;
    sheetBody.innerHTML = content.html();
    showEmbeddedDialog(sheetDialog);
    wireSheetActions(type);
    // ⭐ porting dal bundle desktop: i due mount point sotto si riempiono con una fetch reale, mai al momento del template() (che non è async).
    if (type === 'control') { refreshDoctorBadge(); caricaPannelloHooks(); }
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
          // ⭐⭐⭐ 2/9 — R2/R3: prima d'ora la scelta restava solo in state.model, mai inviata a una sessione già avviata (nessuna rete, nessun submit).
          alSelezionato: (modelloId) => { sincronizzaImpostazioniSessione({ modello: modelloId }); closeEmbeddedDialog(sheetDialog); },
        });
        /*
         * ⭐⭐⭐ 28/8, owner: "nella pill del modello metti lo slider
         * dell'effort" — STESSO componente di "New session"
         * (creaEffortPicker), montato qui sotto il picker modello.
         * ⭐⭐⭐ 2/9 — R2/R3: oltre a `state.effort` (che resta la fonte
         * per una sessione NUOVA), ora sincronizza anche una sessione
         * GIÀ avviata — vale dal PROSSIMO resume/fork, mai sul giro in
         * corso (talosLavora legge `reasoning` una volta sola all'avvio,
         * non si interrompe a metà).
         */
        const effortPicker = creaEffortPicker({
          valoreIniziale: state.effort,
          alCambiato: (valore) => { state.effort = valore; sincronizzaImpostazioniSessione({ reasoning: valore ? { effort: valore } : null }); },
        });
        mount.replaceChildren(picker.elemento, effortPicker.elemento);
      }
    }
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
          // ⭐⭐⭐ 2/9 — R2/R3: prima d'ora la scelta restava solo in state.model, mai inviata a una sessione già avviata (nessuna rete, nessun submit).
          alSelezionato: (modelloId) => { sincronizzaImpostazioniSessione({ modello: modelloId }); closeEmbeddedDialog(sheetDialog); },
        });
        /*
         * ⭐⭐⭐ 28/8, owner: "nella pill del modello metti lo slider
         * dell'effort" — STESSO componente di "New session"
         * (creaEffortPicker), montato qui sotto il picker modello.
         * ⭐⭐⭐ 2/9 — R2/R3: oltre a `state.effort` (che resta la fonte
         * per una sessione NUOVA), ora sincronizza anche una sessione
         * GIÀ avviata — vale dal PROSSIMO resume/fork, mai sul giro in
         * corso (talosLavora legge `reasoning` una volta sola all'avvio,
         * non si interrompe a metà).
         */
        const effortPicker = creaEffortPicker({
          valoreIniziale: state.effort,
          alCambiato: (valore) => { state.effort = valore; sincronizzaImpostazioniSessione({ reasoning: valore ? { effort: valore } : null }); },
        });
        mount.replaceChildren(picker.elemento, effortPicker.elemento);
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
      title: 'Model',
      /*
       * ⛔⛔⛔ 27/8, owner: "la stessa modale deve essere riprodotta nel chat
       * composer... si deve riaprire lo stesso componente della selezione
       * del modello" — questo foglio mostrava un campo di testo libero con
       * SETTE scorciatoie scritte a mano (gpt-5.6-sol, claude-opus-4.6...,
       * tutti nomi finti), un componente DIVERSO da `creaModelPicker` (il
       * catalogo vero di OpenRouter, ricerca, raggruppato per provider,
       * usato in "New session"). Qui resta solo un punto di montaggio:
       * `openSheet()` ci monta lo STESSO componente, non una sua copia —
       * vedi lì per il perché.
       */
      html: () => '<div class="sheet-section" id="modelPickerMount"></div>',
    },
    permissions: {
      eyebrow: 'Safety lens',
      title: 'Run permissions',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Policy sessione</span>
          ${[
            ['Read only', 'Reads the project and runs non-mutating commands.', 'Minimo rischio'],
            ['Workspace write', 'Scrive solo nel workspace/worktree corrente.', 'Consigliato'],
            ['On request', 'Chiede prima delle azioni sensibili.', 'Controllato'],
            ['Full access', 'Filesystem e rete senza gate ordinari.', 'Alto rischio'],
          ].map(([name, desc, note]) => `
            <button class="sheet-option ${name === state.permissions ? 'active' : ''}" data-permission-choice="${name}">
              <span class="sheet-icon">${icon('i-shield')}</span><span><strong>${name}</strong><small>${desc}</small></span><span>${note}</span>
            </button>`).join('')}
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Scope corrente</span>
          <div class="sheet-toggle-row"><span>Rete esterna</span><input type="checkbox"></div>
          <div class="sheet-toggle-row"><span>Browser locale 127.0.0.1</span><input type="checkbox" checked></div>
          <div class="sheet-toggle-row"><span>Git push</span><input type="checkbox"></div>
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
       * riscritti), con la checkbox `disabled` — sono sempre attivi perché
       * non esiste ancora un cancello di permesso per-tool lato harness,
       * non perché la UI finga una scelta che non ha effetto. La seconda
       * sezione è tutto il resto, onestamente "non ancora implementato":
       * costruirlo per intero (client MCP, sistema plugin, quattro gateway
       * di chat) è il blocco più grande dei rimasti, non uno stralcio.
       */
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Attrezzi dell'harness · sempre attivi, nessun permesso per-tool ancora</span>
          ${[
            ['elenca', 'Elenca i file del workspace, con le dimensioni', 'i-list'],
            ['cerca', 'Trova file ovunque nel workspace, per testo o nome', 'i-search'],
            ['leggi', 'Legge un file del workspace', 'i-eye'],
            ['scrivi', 'Scrive un file, sostituendolo per intero — passa dal cancello semantico', 'i-code'],
            ['prova', 'Esegue la suite di test del progetto: è il giudice', 'i-check'],
            ['shell', 'Shell command in the project folder — WSL2 if present, otherwise declared', 'i-terminal'],
            ['naviga', 'Legge una pagina web pubblica — DNS pinnato, solo http/https', 'i-web'],
          ].map(([name, desc, ico]) => `
            <div class="sheet-option" role="group">
              <span class="sheet-icon">${icon(ico)}</span><span><strong>${name}</strong><small>${desc}</small></span><span><input aria-label="${name}, sempre attivo" type="checkbox" checked disabled></span>
            </div>`).join('')}
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Non ancora implementato</span>
          ${[
            ['Skills', 'i-bolt'], ['MCP', 'i-link'], ['Plugin market', 'i-grid'],
            ['Toolsets', 'i-code'], ['Web search', 'i-search'], ['Computer use', 'i-layout'],
            ['Images', 'i-image'], ['Voice', 'i-mic'],
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
       * ⭐⭐⭐ 29/8 — porting dal bundle desktop (FASE A, ledger basso
       * livello, chiusa 28/8): "Hooks" era un bottone con un contatore
       * inventato (4), zero listener. Ora è un mount point reale
       * (`#hooksListMount`, riempito da caricaPannelloHooks() in
       * openSheet()) con gli hook VERI del progetto e un bottone "Fida"
       * che chiama davvero POST .../trust. "Doctor" passa da
       * `<span>Healthy</span>` statico MAI verificato a un placeholder
       * "Verifica…" che refreshDoctorBadge() sostituisce col risultato
       * reale di GET /api/v1/doctor. "Agents" (pannello di
       * configurazione/isolamento) e "Approval policy" per-tool restano
       * onestamente "Non ancora implementato" — nessuna di queste due
       * fasi è aperta oggi, né su desktop né qui.
       */
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Agent runtime</span>
          <button class="sheet-option" data-control-action="doctor"><span class="sheet-icon">${icon('i-check')}</span><span><strong>Doctor</strong><small>Runtime, provider, shell, git e browser</small></span><span data-doctor-status>Verifica…</span></button>
          <button class="sheet-option" data-control-action="settings"><span class="sheet-icon">${icon('i-settings')}</span><span><strong>Impostazioni Codice</strong><small>Aspetto, interazione e preferenze</small></span><span>Open</span></button>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Hooks</span>
          <div id="hooksListMount"></div>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Non ancora implementato</span>
          ${[
            ['Agents', 'Sub-agents, delegation, isolation and limits', 'i-robot'],
            ['Approval policy per-tool', 'No per-tool permission grammar today — the semantic gate on writes is always on, and not optional', 'i-shield'],
          ].map(([name, desc, ico]) => `
            <div class="sheet-option" role="group">
              <span class="sheet-icon">${icon(ico)}</span><span><strong>${name}</strong><small>${desc}</small></span><span><input aria-label="${name}, non implementato" type="checkbox" disabled></span>
            </div>`).join('')}
        </div>`,
    },
    sessionTree: {
      eyebrow: 'Conversation graph',
      title: 'Session tree',
      /*
       * ⭐⭐⭐ 29/8 — porting dal bundle desktop (FASE C, ledger basso
       * livello, chiusa 28/8): le due righe "Responsive audit"/"A11y
       * review" erano FINTE (mai collegate a nulla), col bottone
       * "+ Nuovo side thread" che chiamava solo un toast. Sostituite da
       * un mount point reale (`#subagentTreeMount`, riempito da
       * caricaAlberoSessione() in openSheet()) con le deleghe VERE
       * dell'attrezzo delega_sottotask. La riga "Main" perde il numero
       * di contesto inventato ("18.7k"): nessun contatore di utilizzo
       * reale esiste ancora su questo bundle (vedi LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md) — dichiarare "sessione attiva" è onesto, un numero a caso no.
       */
      html: () => `
        <div class="sheet-section session-tree-sheet">
          <span class="sheet-label">Sessione</span>
          <!--
            29/8 — le due righe fork/side-thread inventate del canonico
            (Responsive audit/A11y review) NON portate: caricaAlberoSessione()
            (sotto, #subagentTreeMount) mostra le deleghe VERE in una
            sezione a parte — righe finte qui accanto sarebbero un
            regresso, non un porting (già rimosse su questa copia da un
            commit precedente). formattaUsageBreve() ora esiste (portata
            da un commit successivo, verificato prima di usarla).
          -->
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
      eyebrow: 'Session',
      title: 'Rename session',
      html: () => `
        <form class="sheet-section rename-form" id="renameSessionForm">
          <label class="sheet-label" for="renameSessionInput">Nome sessione</label>
          <input class="sheet-input" id="renameSessionInput" value="${state.session.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}" maxlength="80" autocomplete="off">
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
          ${['src/components/chat/TalosComposer.vue','src/style.css','src/lib/talosThemes.ts','tests/unit/chat/composer.spec.ts','AGENTS.md'].map((file) => `<button class="sheet-option reference-option" data-reference-file="${file}"><span class="sheet-icon">${icon('i-files')}</span><span><strong>${file}</strong><small>Aggiungi al contesto del messaggio</small></span><span>@</span></button>`).join('')}
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
      eyebrow: 'Workspace tree',
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
      eyebrow: 'Workspace tree',
      title: 'Delete file',
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
     * ⭐⭐⭐ 28/8, owner: "e comandi crud in generale" — "Nuovo file"/"Nuova
     * cartella", stesso foglio per entrambi (`state.alberoFileTarget.tipo`
     * decide titolo/etichetta ed è preimpostato da chi apre il foglio,
     * mai scelto qui dentro — stesso principio di renameFile sopra: un
     * campo solo, un submit solo).
     */
    createFile: {
      eyebrow: 'Workspace tree',
      title: 'Nuovo', // ⛔ sovrascritto dinamicamente in avviaCreaVoce() col titolo vero — sheetTemplates.title è una stringa ovunque altrove, stesso pattern di fileViewer sopra
      html: () => `
        <form class="sheet-section rename-form" id="createFileForm">
          <label class="sheet-label" for="createFileInput">${state.alberoFileTarget?.tipo === 'cartella' ? 'Folder name' : 'Nome del file'}</label>
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
      title: 'Export session',
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

  /**
   * ⭐ 29/8, porta canonico (ledger §22, cherry-pick 582dffcf) — mancava:
   * chiamata già presente altrove (il boot-time init appena portato) ma
   * mai definita, ReferenceError immediato a ogni eval del bundle (trovato
   * dai 80/80 test falliti in blocco, non da un'ipotesi). Refresh la
   * pillola del composer che apre il foglio Modello — selettore stabile
   * (`data-open-sheet="model"`), non un confronto sul testo attuale.
   */
  function aggiornaPillolaModello() {
    const span = $('[data-open-sheet="model"] span');
    if (span) span.textContent = state.model || 'Predefinito del server';
  }

  /*
   * ⭐⭐⭐ 2/9 — R2/R3 dalla review Fable: porta canonico (desktop, app.js
   * `sincronizzaImpostazioniSessione`) del pattern "impostazioni di
   * sessione". Prima d'oggi impostaPermesso() cambiava SOLO lo stato
   * locale e mostrava sempre "Policy updated" — anche su una sessione
   * già avviata, dove il kernel non lo avrebbe mai saputo (piano
   * §14.2.2, "cosmetico": il messaggio era falso per qualunque sessione
   * già in corso). Una coda seriale evita che due cambi ravvicinati
   * (permesso poi modello) si scavalchino in rete. No session
   * attiva → no-op locale onesto, non un errore: la scelta vale
   * comunque dal PROSSIMO avvio (state.permissions/state.model restano
   * la fonte per una sessione nuova).
   */
  let catenaRefreshmentiSessione = Promise.resolve();
  function sincronizzaImpostazioniSessione(patch) {
    const sessionId = state.realSession.id;
    if (!sessionId || !patch || Object.keys(patch).length === 0) return Promise.resolve({ locale: true });
    const richiesta = catenaRefreshmentiSessione
      .catch(() => undefined)
      .then(() => apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/settings`, patch));
    catenaRefreshmentiSessione = richiesta.catch(() => undefined);
    richiesta.catch((error) => {
      toast('Preference not saved', error?.message || 'The choice did not reach the session: try again.');
    });
    return richiesta;
  }

  /**
   * ⭐⭐⭐ 28/8 — fattorizzata da dentro il click-handler della pillola
   * permessi: la STESSA propagazione (pillole in giro per la pagina, il
   * bridge nativo, lo stato) serve ANCHE a "Imposta come radice" (menu
   * dell'albero, sotto), che sceglie "Full access" per conto suo — un
   * solo posto che sa come cambiare permesso, mai due copie che
   * potrebbero divergere.
   */
  function impostaPermesso(nuovoPermesso, messaggioToast = nuovoPermesso) {
    state.permissions = nuovoPermesso;
    $$('.selector-pill span').filter((span) => ['Workspace write', 'Read only', 'On request', 'Full access'].includes(span.textContent)).forEach((span) => { span.textContent = state.permissions; });
    window.__talosHarnessHostPermissionChange?.(state.permissions);
    // ⭐⭐⭐ 2/9 — R2/R3: prima d'ora nessuna rete, il toast sotto mentiva su una sessione già avviata.
    sincronizzaImpostazioniSessione({ permessi: nuovoPermesso });
    toast('Policy updated', messaggioToast);
  }

  function wireSheetActions(type) {
    $$('[data-permission-choice]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        impostaPermesso(button.dataset.permissionChoice);
        closeEmbeddedDialog(sheetDialog);
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
        state.environment = button.querySelector('strong')?.textContent || 'Runtime updated';
        const chip = $('.environment-chip span');
        if (chip) chip.textContent = state.environment;
        toast('Environment selected', state.environment);
        closeEmbeddedDialog(sheetDialog);
      });
    });
    $$('[data-control-action]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.controlAction;
        if (action === 'settings') { closeEmbeddedDialog(sheetDialog); setView('settings'); }
        // ⭐ porting dal bundle desktop: 'agents'/'hooks' come toast finto sono spariti — Hooks è ora #hooksListMount (rigaHook porta i suoi listener), "Agents" resta onestamente "Non ancora implementato" nel template.
        else if (action === 'doctor') eseguiDoctor();
      });
    });
    $$('[data-session-action]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.sessionAction;
        // ⭐ porting dal bundle desktop: 'side'/'fork'/'new-side' erano righe finte, sparite dal template — 'main' resta l'unica azione reale rimasta (chiude il foglio sulla sessione già attiva).
        if (action === 'main') closeEmbeddedDialog(sheetDialog);
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
          if (!testo || !testo.trim()) throw new Error('Nothing to export: no content to write.');
          scaricaTesto(testo, `talos-session-${state.realSession.id}.${isMarkdown ? 'md' : 'json'}`, isMarkdown ? 'text/markdown' : 'application/json');
          closeEmbeddedDialog(sheetDialog);
          toast('Session exported', isMarkdown ? 'Trascrizione Markdown pronta.' : 'JSON pronto.');
        } catch (error) {
          toast('Export failed', error.message);
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
        if (state.realSession.id) {
          try {
            await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/rename`, { nome: next });
          } catch (error) {
            toast('Rename failed', error.message);
            return;
          }
        }
        state.session = next;
        mostraTitoloSessione(state.session);
        const activeSession = $('.session-item.active .session-main strong');
        if (activeSession) activeSession.textContent = state.session;
        closeEmbeddedDialog(sheetDialog);
        toast('Session renamed', state.session);
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
          toast('Rename failed', error.message);
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
          toast('File deleted', bersaglio.nome);
          await invalidaLivelloGenitoreAlbero(bersaglio.percorso);
        } catch (error) {
          toast('Delete failed', error.message);
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
          toast(bersaglio.tipo === 'cartella' ? 'Folder created' : 'File created', esito.percorso);
          await invalidaLivelloGenitoreAlbero(esito.percorso);
        } catch (error) {
          toast('Create failed', error.message);
        }
      });
    }
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
      toast('That follow-up is already queued', 'Just write in the composer: a message sent during a running turn queues itself — this switch is not needed.');
      return;
    }
    if (enabled && !state.realSession.id) {
      toast('No active session', 'A follow-up only queues during a running session — open "New" first.');
      return;
    }
    if (enabled && !state.realSession.id) {
      toast('No active session', 'A follow-up only queues during a running session — open "New" first.');
      return;
    }
    state.queueMode = Boolean(enabled);
    queueToggle.classList.toggle('active', state.queueMode);
    queueToggle.setAttribute('aria-pressed', String(state.queueMode));
    queueToggle.textContent = state.queueMode ? 'In coda' : 'Follow-up';
    runStateToggle?.setAttribute('aria-pressed', String(state.queueMode));
    if (announce) toast(state.queueMode ? 'Steering queue attiva' : 'Steering queue disattivata');
  }

  function setRunState(running) {
    state.running = Boolean(running);
    runStrip?.classList.toggle('is-stopped', !state.running);
    const label = $('strong', runStateToggle);
    const timer = runStateToggle?.querySelector('span:last-child');
    if (label) label.textContent = state.running ? 'Running' : 'Stopped';
    /*
     * ⭐⭐⭐ 3/9 — era `timer.textContent = state.running ? '01:42' : '—'`:
     * una STRINGA LETTERALE, mai un tempo vero (trovato leggendo il
     * codice — non un'ipotesi). Il case RunStarted azzera
     * runIniziatoAlle a ogni giro NUOVO (mai qui: setRunState(true)
     * parte anche dal boot demo prima di qualunque RunStarted reale —
     * `|| Date.now()` sotto è solo il ripiego per quel caso, non il
     * percorso normale). Un giro reale aggiorna ogni secondo finché
     * `state.running` resta vero; fermo → l'intervallo si ferma con lui,
     * mai un timer che continua a girare a schermo spento.
     */
    if (state.running) {
      if (!state.realSession.runIniziatoAlle) state.realSession.runIniziatoAlle = Date.now();
      aggiornaCronometroRun();
      if (!cronometroRunId) cronometroRunId = window.setInterval(aggiornaCronometroRun, 1000);
    } else {
      if (cronometroRunId) { window.clearInterval(cronometroRunId); cronometroRunId = null; }
      if (timer) timer.textContent = '—';
    }
    const stopButton = $('.stop-run');
    if (stopButton) {
      stopButton.disabled = !state.running;
      stopButton.setAttribute('aria-label', state.running ? 'Stop run' : 'Run stopped');
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
    const viewportKeyboardOpen = composerFocused && keyboardOffset > 0 && window.innerWidth <= 780;
    applyKeyboardOpen(nativeKeyboardOpen ?? viewportKeyboardOpen);
  }

  const toolDetails = {
    read: ['File read', 'TalosComposer.vue · 214 lines · no conflict found.'],
    search: ['Search done', 'Found breakpoints 360/430/780, safe-area and 11 interactive targets to refine.'],
    edit: ['Patch applicata', '+28 −19 · layout composer convertito a container-aware responsive surface.'],
    bash: ['Test completati', '6/6 tests passed in 8.4s · touch targets, safe-area and command palette verified.'],
    browser: ['Browser check live', '390×844 · viewport dinamico, composer, drawer e bottom navigation sotto osservazione.'],
  };

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
    const [title, detail] = toolDetails[key] || ['Dettaglio tool', 'No further detail available.'];
    const row = document.createElement('div');
    row.className = 'tool-inline-detail';
    row.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
    button.insertAdjacentElement('afterend', row);
    markMotionEnter(row);
    button.setAttribute('aria-expanded', 'true');
  }

  const reviewFiles = {
    composer: {
      path: 'src/components/chat/TalosComposer.vue',
      code: [
        ['ctx', '@@ composer layout @@'],
        ['del', '- .composer { grid-template-columns: 48px 1fr auto auto; }'],
        ['add', '+ .composer { container-type: inline-size; }'],
        ['add', '+ .composer-toolbar { grid-template-columns: 48px minmax(0, 1fr) 48px; }'],
        ['add', '+ @container (max-width: 560px) {'],
        ['add', '+   .secondary-context { display: none; }'],
        ['add', '+ }'],
        ['ctx', ' '],
        ['ctx', '@@ safe area @@'],
        ['add', '+ padding-bottom: max(12px, env(safe-area-inset-bottom));'],
      ],
    },
    layout: {
      path: 'src/styles/chat-layout.css',
      code: [
        ['ctx', '@@ mobile interaction density @@'],
        ['del', '- .message-actions button { width: 34px; height: 32px; }'],
        ['add', '+ .message-actions button { width: 44px; height: 44px; }'],
        ['add', '+ .view-pane { overscroll-behavior: contain; }'],
        ['add', '+ .mobile-nav { padding-bottom: env(safe-area-inset-bottom); }'],
      ],
    },
    tests: {
      path: 'tests/unit/chat/composer.spec.ts',
      code: [
        ['ctx', '@@ responsive guardrails @@'],
        ['add', '+ expect(target.height).toBeGreaterThanOrEqual(44)'],
        ['add', '+ expect(document.documentElement.scrollWidth).toBe(innerWidth)'],
        ['add', '+ expect(dialog.getAttribute("aria-labelledby")).toBeTruthy()'],
        ['add', '+ expect(queueButton.getAttribute("aria-pressed")).toBe("true")'],
      ],
    },
  };

  function renderReviewFile(key) {
    // ⭐ 26/8, riconciliazione desktop→mobile — le voci reali vivono in
    // state.realSession.reviewFiles (una per percorso scritto), non nel
    // fisso `reviewFiles` demo: chiave "real:<percorso>" le distingue,
    // stesso schema già in produzione su lane/harness-ui.
    const file = key.startsWith('real:') ? state.realSession.reviewFiles.get(key.slice(5)) : reviewFiles[key];
    if (!file || !diffPath || !diffCode) return;
    diffPath.textContent = file.path;
    diffCode.replaceChildren(...file.code.map(([kind, text]) => {
      const span = document.createElement('span');
      span.className = kind;
      span.textContent = text;
      return span;
    }));
    markMotionEnter(diffCode);
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
    if (button.dataset.inspectorTab === 'files' && state.realSession.id
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
   * tecnico non c'è, ma la scelta di COSA far fare a "New session" in
   * quel contesto è comunque un prodotto, non un'ovvietà.
   *
   * ⇒ Zero rischio di regressione sulla suite Pad-verificata di Codice: il
   * prossimo passo è la decisione UX del trigger, non altro porting.
   */

  /**
   * ⭐⭐⭐ 28/8, "procedi in ordine" punto 3 — generalizzata: `RunStarted.input`
   * (agui-events.mjs, `runStarted({input: task})`) arriva in TRE forme
   * diverse dallo stesso server, lette alla fonte (`agent-service.mjs`) non
   * indovinate: un task del corpus (`{id, consegna, consegnaCorta}`), un
   * messaggio libero (`avviaReale` → `{consegna}`, senza `id`), un comando
   * diretto (`{comandoDiretto}`). Prima di questa modifica il meta-testo
   * leggeva SEMPRE `task.id` — corretto qui perché un messaggio libero
   * l'avrebbe mostrato come "Real task · undefined" (trovato leggendo il
   * corpo di `avviaReale`, mai da uno screenshot: non ancora provato dal
   * vivo quando è stato scritto questo commento). Un `id` presente resta
   * "Real task · <id>" — comportamento invariato per il corpus; senza,
   * l'etichetta onesta è quella di un messaggio normale.
   */
  function appendRealTaskStart(task) {
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
     * "Direct command" anche una vera conversazione. Sul MOMENTO non si
     * vedeva mai (avviaSessionePendente mostra il suo bubble ottimista
     * PRIMA che l'evento vero arrivi, e taskBubbleMostrata blocca il
     * secondo) — solo un F5/resume, che riparte da zero e replica
     * l'evento VERO, lo rivelava. Tre forme distinte, tre etichette oneste.
     */
    bubble.textContent = task.consegna || task.consegnaCorta || task.comandoDiretto || (task.id ? task.id : 'Direct command');
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const span = document.createElement('span');
    span.textContent = task.id
      ? `Real task · ${task.id}`
      : (task.consegna || task.consegnaCorta)
        ? `Free task${task.progetto ? ` · ${task.progetto}` : ''}`
        : 'Direct command';
    meta.appendChild(span);
    article.append(bubble, meta);
    conversation.appendChild(article);
    markMotionEnter(article);
    /* ⛔ 28/8, owner: "auto centramento dello scroll dei messaggi appena se ne invia uno nuovo (meta schermo)" — questa era l'UNICA delle sei chiamate scrollIntoView di questo file con block:'center' invece di 'end': ogni messaggio inviato veniva centrato a metà schermo invece di scorrere in fondo come ogni altro elemento appeso alla conversazione. */
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' }), 40);
    state.realSession.taskBubbleMostrata = true;
  }

  /**
   * ⛔⛔⛔ 27/8 — la bolla del SECONDO turno di una conversazione reale
   * (resumeSession con un testo): stesso stile di appendRealTaskStart, ma
   * "Follow-up" invece di "Real task · <id>" — non è il compito che ha
   * aperto la sessione, è quello che la continua.
   */
  function appendUserFollowUp(text) {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message user-message';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.appendChild(textElement('span', '', 'Follow-up'));
    article.append(bubble, meta);
    conversation.appendChild(article);
    markMotionEnter(article);
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' }), 40);
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
  function mostraAttesaRisposta() {
    if (state.realSession.attesaBubble) return; // già a schermo, non raddoppiare
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message real-waiting-note';
    article.setAttribute('role', 'status');
    article.setAttribute('aria-live', 'polite');
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'talos-line-loader');
    svg.setAttribute('viewBox', '0 0 96 16');
    svg.setAttribute('width', '44');
    svg.setAttribute('height', '7');
    svg.setAttribute('aria-hidden', 'true');
    const traccia = document.createElementNS(svgNs, 'line');
    traccia.setAttribute('class', 'talos-line-loader-track');
    traccia.setAttribute('x1', '4'); traccia.setAttribute('y1', '8'); traccia.setAttribute('x2', '92'); traccia.setAttribute('y2', '8');
    const sweep = document.createElementNS(svgNs, 'line');
    sweep.setAttribute('class', 'talos-line-loader-sweep');
    sweep.setAttribute('x1', '4'); sweep.setAttribute('y1', '8'); sweep.setAttribute('x2', '92'); sweep.setAttribute('y2', '8');
    svg.append(traccia, sweep);
    for (const cx of [16, 48, 80]) {
      const nodo = document.createElementNS(svgNs, 'circle');
      nodo.setAttribute('class', 'talos-line-loader-node');
      nodo.setAttribute('cx', String(cx)); nodo.setAttribute('cy', '8'); nodo.setAttribute('r', '4');
      svg.append(nodo);
    }
    article.append(svg, textElement('span', 'sr-only', 'TALOS is working on the answer…'));
    conversation.appendChild(article);
    state.realSession.attesaBubble = article;
    markMotionEnter(article);
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' }), 40);
  }

  function nascondiAttesaRisposta() {
    if (!state.realSession.attesaBubble) return;
    state.realSession.attesaBubble.remove();
    state.realSession.attesaBubble = null;
  }

  /**
   * ⭐⭐⭐ 2/9 — Stadio A (talosHarness.mjs, 23/8) compatta la conversazione
   * ogni GIRI_PRIMA_DI_COMPATTARE giri, ma finora il giro di compattazione
   * non emetteva NESSUN evento: sullo schermo sembrava un turno normale
   * senza risposta, indistinguibile da un modello bloccato. Bolla
   * dedicata, non un riuso di mostraAttesaRisposta() — quella tace apposta
   * (uno screen-reader-only label), questa deve DIRE cosa sta succedendo,
   * altrimenti il problema che questa mossa risolve (buco silenzioso)
   * resterebbe silenzioso lo stesso, solo con un nome diverso.
   */
  function mostraCompattazioneInCorso() {
    if (state.realSession.compattazioneBubble) return; // già a schermo, non raddoppiare
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message real-compaction-note';
    article.setAttribute('role', 'status');
    article.setAttribute('aria-live', 'polite');
    article.textContent = 'Summarising the conversation so far…';
    conversation.appendChild(article);
    state.realSession.compattazioneBubble = article;
    markMotionEnter(article);
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' }), 40);
  }

  function nascondiCompattazioneInCorso() {
    if (!state.realSession.compattazioneBubble) return;
    state.realSession.compattazioneBubble.remove();
    state.realSession.compattazioneBubble = null;
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
    meta.append(glyph, document.createTextNode('TALOS · real session'));
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    article.append(meta, copy);
    conversation.appendChild(article);
    markMotionEnter(article);
    state.realSession.messageElements.set(messageId, article);
    return article;
  }

  /*
   * ⭐⭐⭐ 30/8, owner (due screenshot di Claude Code stesso come
   * riferimento, registrati nel ledger il 30/8 come "IN CODA", ora
   * richiesti per davvero): "i comandi vengano raggruppati in un
   * collapse come fa Claude, con diff totale accanto, se ci clicco deve
   * avere la lista completa (comportamento attuale) ma in ogni modifica
   * ci deve essere il diff specifico per ogni file (segni +n e -n)".
   *
   * Sostituisce `appendToolNote` (29/8, commit `09bcd0cb`-porting: UN
   * bubble PER tool-call, mai raggruppato — unico chiamante, verificato
   * con una grep prima di toglierlo, nessun terzo da conciliare). Ora:
   * i tool-call CONSECUTIVI (nessun messaggio di testo/altro evento in
   * mezzo — vedi chiudiGruppoToolCorrente e i suoi chiamanti) diventano
   * UNA riga sola nella chat, con un riassunto aggregato ("Modificati 3
   * file, eseguiti 6 comandi, letti 2 file") e il totale +n/-n dei file
   * scritti; un tocco apre un foglio (stesso #sheetDialog di ogni altro
   * foglio dell'app) con l'elenco COMPLETO — ogni riga porta la SUA
   * icona per categoria e, per una modifica, il SUO +n/-n.
   */

  /** Le tre categorie della riga aggregata — icona/etichetta in ICONA_PER_CATEGORIA/ETICHETTA_CATEGORIA sotto. Qualunque nome futuro non censito qui cade in 'eseguito' (mai un quarto bucket silenzioso, mai un crash su un attrezzo nuovo). */
  function categoriaAttrezzo(nome) {
    if ([
      'scrivi', 'generate_image',
      'notes_create', 'notes_update', 'notes_delete',
      'tasks_create', 'tasks_update', 'tasks_complete', 'tasks_delete',
      'memory_write', 'memory_update', 'memory_delete',
      'library_rename', 'library_delete',
    ].includes(nome)) return 'modificato';
    if ([
      'leggi', 'elenca', 'cerca', 'naviga',
      'notes_list', 'tasks_list', 'memory_search',
      'library_list', 'library_read', 'research_list', 'research_read',
    ].includes(nome)) return 'letto';
    return 'eseguito'; // shell, prova, web_search, artifact_create, document_create, time_now, delega_sottotask, e ogni nome futuro
  }

  const ICONA_PER_CATEGORIA = Object.freeze({ modificato: 'i-edit', letto: 'i-eye', eseguito: 'i-bolt' });
  const ETICHETTA_CATEGORIA = Object.freeze({ modificato: 'Modified', letto: 'Read', eseguito: 'Ran' });

  /** Il "bersaglio" di un tool-call per la riga espansa del gruppo — solo l'oggetto (nome file, comando, query…): il verbo lo porta già l'etichetta di categoria accanto (icona+ETICHETTA_CATEGORIA), ripeterlo qui sarebbe ridondante. */
  function bersaglioAttrezzo(nome, argomenti) {
    const a = argomenti || {};
    switch (nome) {
      case 'scrivi': case 'leggi': return a.percorso || '';
      case 'cerca': return [a.nome, a.testo].filter(Boolean).map((v) => `"${v}"`).join(' · ') || 'nel progetto';
      case 'elenca': return 'file del progetto';
      case 'prova': return 'test del progetto';
      case 'shell': return a.comando ? tronca(a.comando, 60) : '';
      case 'naviga': return a.url || '';
      case 'web_search': return a.query ? `"${tronca(a.query, 60)}"` : '';
      case 'artifact_create': return a.titolo || '';
      case 'document_create': return a.title ? `${a.title}.${a.format || '?'}` : '';
      case 'time_now': return 'data e ora';
      case 'delega_sottotask': return a.task ? tronca(a.task, 60) : 'sotto-agente';
      case 'generate_image': return a.prompt ? tronca(a.prompt, 60) : '';
      default: {
        // ⭐ le famiglie Note/Attività/Memoria/Libreria/Ricerca non hanno tutte lo stesso nome-campo (titolo/title/nome/query/id…): un fallback generico invece di 20 righe quasi identiche.
        const campo = a.titolo ?? a.title ?? a.nome ?? a.newTitle ?? a.query ?? a.percorso ?? a.task ?? a.id ?? '';
        return campo ? tronca(String(campo), 60) : nome.replace(/_/g, ' ');
      }
    }
  }

  /**
   * ⭐ Porta client-side dello STESSO vocabolario che `talosHarness.mjs`
   * dichiara ED ESPORTA col nome identico (`pareFallito`, kernel, ~riga
   * 2067): `REFUSED.`/`blocked:`/`error:`/`unknown tool:`/`search
   * failed:`/`document creation failed:`/`exit N` con N≠0 — i prefissi
   * che il kernel stesso scrive per distinguere un esito riuscito da uno
   * che non lo è (verificato leggendo il sorgente, non indovinato), non
   * un'euristica nuova inventata qui. Non importabile (runtime diversi,
   * Node vs browser, come `calcolaDiffRighe`/il resto di questo file):
   * se il vocabolario del kernel cambia, va cambiato anche qui.
   */
  function pareFallito(esito) {
    const testo = String(esito ?? '');
    if (testo.startsWith('REFUSED.')) return true;
    if (testo.startsWith('blocked:')) return true;
    if (testo.startsWith('error:')) return true;
    if (testo.startsWith('unknown tool:')) return true;
    if (testo.startsWith('search failed:')) return true;
    if (testo.startsWith('document creation failed:')) return true;
    const uscita = /^exit (-?\d+)/.exec(testo);
    if (uscita && Number(uscita[1]) !== 0) return true;
    return false;
  }

  /**
   * ⭐⭐⭐ 3/9 — avm-03, dal vivo (item 9): «Un ⚠️ giallo accompagna "Read
   * 9 files, ran a command" senza dire cosa è andato storto — probabilmente
   * uno shell fallito, ma la riga non lo dichiara». Il motivo ESISTE già
   * (`item.esitoRaw`), ma solo la riga ESPANSA lo mostra — questo riassunto
   * breve va invece sulla riga CHIUSA, accanto all'icona. Stessi prefissi
   * di pareFallito(), mai un secondo elenco che potrebbe disallinearsi da
   * quello: se pareFallito riconosce un caso, questa funzione deve saperlo
   * spiegare, non solo confermarlo.
   */
  function estraiMotivoFallimento(esito) {
    const testo = String(esito ?? '').trim();
    const prefissiConEtichetta = [
      [/^REFUSED\.\s*/, ''],
      [/^blocked:\s*/, 'blocked: '],
      [/^error:\s*/, ''],
      [/^unknown tool:\s*/, 'unknown tool: '],
      [/^search failed:\s*/, 'search failed: '],
      [/^document creation failed:\s*/, 'document creation failed: '],
    ];
    for (const [pattern, etichetta] of prefissiConEtichetta) {
      if (pattern.test(testo)) return tronca(`${etichetta}${testo.replace(pattern, '')}`, 60) || etichetta.trim() || 'Failed';
    }
    const uscita = /^exit (-?\d+)/.exec(testo);
    if (uscita && Number(uscita[1]) !== 0) {
      const dopoUscita = testo.slice(uscita[0].length).replace(/^[:\s]*\n?/, '').trim();
      return dopoUscita ? tronca(`exit ${uscita[1]} · ${dopoUscita}`, 60) : `exit ${uscita[1]}`;
    }
    return tronca(testo, 60) || 'Failed';
  }

  /** Chiude il gruppo tool-call corrente (se c'è): il prossimo ToolCallStart ne apre uno NUOVO invece di aggiungersi a questo. Un gruppo è "i tool-call fra due altre cose" (testo, follow-up dalla coda, un'approvazione, un artefatto, un nuovo giro) — non un contenitore che dura per sempre. Vedi i chiamanti in handleRealEvent. */
  function chiudiGruppoToolCorrente() {
    state.realSession.toolGroupCorrente = null;
  }

  function nuovaIconaSvg(iconId) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const uso = document.createElementNS(svgNs, 'use');
    uso.setAttribute('href', `#${iconId}`);
    svg.append(uso);
    return svg;
  }

  function nuovoGruppoTool() {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message real-tool-group';
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'tool-note-summary tool-group-summary';
    const warn = document.createElement('span');
    warn.className = 'tool-group-warn';
    warn.textContent = '⚠️';
    warn.hidden = true;
    warn.setAttribute('aria-hidden', 'true');
    const summaryText = document.createElement('span');
    summaryText.className = 'tool-note-summary-text';
    const counts = document.createElement('span');
    counts.className = 'tool-group-counts';
    const add = document.createElement('span');
    add.className = 'diff-add';
    const del = document.createElement('span');
    del.className = 'diff-del';
    counts.append(add, del);
    const chevron = document.createElement('span');
    chevron.className = 'tool-note-chevron';
    chevron.textContent = '›';
    chevron.setAttribute('aria-hidden', 'true');
    summary.append(warn, summaryText, counts, chevron);
    article.append(summary);
    const gruppo = { article, warn, summaryText, addEl: add, delEl: del, items: [], aggiunte: 0, rimozioni: 0, haProblema: false };
    summary.addEventListener('click', () => apriFoglioGruppoTool(gruppo));
    conversation.appendChild(article);
    markMotionEnter(article);
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' }), 40);
    state.realSession.toolGroupCorrente = gruppo;
    return gruppo;
  }

  /**
   * Riassunto aggregato — le categorie nell'ORDINE in cui sono comparse
   * la prima volta nel gruppo, non un ordine fisso: "Eseguiti 3 comandi,
   * created a file" e "Creato un file, eseguiti 7 comandi" sono ENTRAMBE
   * forme viste negli screenshot di riferimento, a seconda di quale
   * categoria arriva per prima in quel gruppo specifico. Un singolo file
   * scritto dice "creato" (mai esistito prima) o "modificato" (esisteva
   * già) — `un file`, non `1 file`, come nel riferimento.
   */
  function aggiornaRiassuntoGruppoTool(gruppo) {
    const conteggi = new Map();
    const ordine = [];
    for (const item of gruppo.items) {
      if (!conteggi.has(item.categoria)) { conteggi.set(item.categoria, 0); ordine.push(item.categoria); }
      conteggi.set(item.categoria, conteggi.get(item.categoria) + 1);
    }
    const VERBI = {
      modificato: (n) => {
        if (n !== 1) return `modified ${n} files`;
        const unico = gruppo.items.find((i) => i.categoria === 'modificato');
        return unico?.nuovo ? 'created a file' : 'modified a file';
      },
      eseguito: (n) => (n === 1 ? 'ran a command' : `ran ${n} commands`),
      letto: (n) => (n === 1 ? 'read a file' : `read ${n} files`),
    };
    const testo = ordine.map((cat) => VERBI[cat](conteggi.get(cat))).join(', ');
    const base = testo ? testo.charAt(0).toUpperCase() + testo.slice(1) : 'Working…';
    /*
     * ⭐⭐⭐ 3/9 — avm-03, dal vivo: «Un ⚠️ giallo accompagna "Read 9
     * files, ran a command" senza dire cosa è andato storto». L'icona da
     * sola non bastava (aria-hidden, nessun testo accanto sulla riga
     * CHIUSA — solo espandendo si vedeva l'esito completo). Qui il
     * riassunto della riga chiusa include GIÀ il motivo breve
     * (estraiMotivoFallimento, calcolato una volta per item nel case
     * ToolCallResult) — l'icona resta aria-hidden apposta: il testo
     * visibile ora porta l'informazione, non serve più descriverla due
     * volte.
     */
    const problemi = gruppo.items.filter((item) => item.problema);
    if (problemi.length > 0) {
      const ultimo = problemi[problemi.length - 1];
      const motivo = ultimo.motivoFallimento || 'see details';
      gruppo.summaryText.textContent = problemi.length === 1
        ? `${base} — failed: ${motivo}`
        : `${base} — ${problemi.length} failed, last: ${motivo}`;
    } else {
      gruppo.summaryText.textContent = base;
    }
    gruppo.addEl.textContent = gruppo.aggiunte > 0 ? `+${gruppo.aggiunte}` : '';
    gruppo.delEl.textContent = gruppo.rimozioni > 0 ? `-${gruppo.rimozioni}` : '';
    gruppo.warn.hidden = !gruppo.haProblema;
  }

  /**
   * ⭐ Il foglio (drawer) con l'elenco COMPLETO del gruppo — riusa lo
   * STESSO #sheetDialog/#sheetBody di ogni altro foglio dell'app
   * (permessi, ambiente, fileViewer…), stesso pattern di
   * `openNewAutomationSheet` (DOM costruito a mano, non `sheetTemplates`
   * — questo foglio non ha un `type` statico): mai innerHTML su dati
   * dinamici (nome file/comando/query possono contenere `<`/`&`).
   * Un tocco su una riga apre/chiude il SUO dettaglio (argomenti +
   * esito, stessa resa di `renderizzaArgomentiAttrezzo` già in uso per
   * il vecchio bubble singolo) — "la lista completa (comportamento
   * attuale)" della richiesta: niente va perso rispetto a prima, si
   * aggiunge solo il livello di raggruppamento+diff.
   */
  function apriFoglioGruppoTool(gruppo) {
    sheetEyebrow.textContent = `${gruppo.items.length} ${gruppo.items.length === 1 ? 'azione' : 'azioni'}`;
    sheetTitle.textContent = gruppo.summaryText.textContent;
    const lista = document.createElement('div');
    lista.className = 'tool-group-sheet-list';
    for (const item of gruppo.items) {
      const riga = document.createElement('button');
      riga.type = 'button';
      riga.className = 'tool-group-sheet-row';
      riga.setAttribute('aria-expanded', 'false');
      riga.append(nuovaIconaSvg(ICONA_PER_CATEGORIA[item.categoria]));
      riga.append(textElement('strong', '', ETICHETTA_CATEGORIA[item.categoria]));
      riga.append(textElement('span', 'tool-group-sheet-target', item.bersaglio || ''));
      if (item.diffDisponibile && (item.diffAggiunte > 0 || item.diffRimozioni > 0)) {
        const diff = document.createElement('span');
        diff.className = 'tool-group-counts';
        if (item.diffAggiunte > 0) diff.append(textElement('span', 'diff-add', `+${item.diffAggiunte}`));
        if (item.diffRimozioni > 0) diff.append(textElement('span', 'diff-del', `-${item.diffRimozioni}`));
        riga.append(diff);
      }
      if (item.problema) {
        // ⭐ 3/9 — stessa correzione di aggiornaRiassuntoGruppoTool: qui la riga NON ha un secondo testo visibile pronto ad accogliere il motivo (a differenza del riassunto di gruppo), quindi un'icona significativa vera (role="img" + aria-label, non aria-hidden) invece di una decorativa muta — più il title per chi tocca da desktop con un mouse.
        const warn = textElement('span', 'tool-group-warn', '⚠️');
        const motivo = item.motivoFallimento || 'Failed';
        warn.setAttribute('role', 'img');
        warn.setAttribute('aria-label', motivo);
        warn.title = motivo;
        riga.append(warn);
      }
      const dettaglio = document.createElement('div');
      dettaglio.className = 'assistant-copy tool-group-sheet-detail';
      dettaglio.hidden = true;
      riga.addEventListener('click', () => {
        const aperto = riga.getAttribute('aria-expanded') === 'true';
        riga.setAttribute('aria-expanded', String(!aperto));
        dettaglio.hidden = aperto;
        if (!aperto && !dettaglio.dataset.riempito) {
          renderizzaArgomentiAttrezzo(dettaglio, item.argomentiRaw || '{}');
          if (item.esitoRaw !== undefined) {
            dettaglio.appendChild(textElement('div', 'tool-arg-key', 'Esito:'));
            const pre = document.createElement('pre');
            pre.className = 'tool-result-block';
            pre.appendChild(textElement('code', '', item.esitoRaw));
            dettaglio.appendChild(pre);
          }
          dettaglio.dataset.riempito = '1';
        }
      });
      lista.append(riga, dettaglio);
    }
    sheetBody.replaceChildren(lista);
    showEmbeddedDialog(sheetDialog);
    // ⭐ dati reali (eventi SSE veri di questa sessione), mai demo — questo foglio non passa da openSheet()/sheetTemplates quindi non è (e non deve essere) nella whitelist TIPI_FOGLIO_INTERAMENTE_ONESTI, si spegne il badge esplicitamente qui.
    const demoBadge = $('.demo-surface-badge', sheetDialog);
    if (demoBadge) demoBadge.hidden = true;
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
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' }), 40);
    return { frame };
  }

  /*
   * ⭐ Raffina il bersaglio quando arriva l'ESITO — solo `prova` porta un
   * numero che vale la pena mostrare in testa (pass/fail), letto dal
   * testo reale del test runner (`node --test`, stesso formato ovunque
   * in questo progetto: "ℹ pass N" / "ℹ fail N"), mai inventato. Porting
   * dal bundle desktop, invariato.
   */
  function riassuntoEsitoAttrezzo(nome, bersaglioBase, testoEsito) {
    // ⭐⭐⭐ FASE C (28/8) — sub-agenti: il riassunto del FIGLIO (o il motivo del rifiuto) è già il contenuto ESATTO del ToolCallResult (stesso meccanismo standard di ogni altro attrezzo — nessun evento nuovo, vedi LEDGER-FASE-C-SUBAGENTI.md), qui solo reso leggibile in un'unica riga.
    if (nome === 'delega_sottotask') {
      if (/^REFUSED\./.test(testoEsito || '')) return '✗ Delega rifiutata';
      return `🧩 Sotto-agente: ${tronca(testoEsito, 100)}`;
    }
    if (nome !== 'prova') return bersaglioBase;
    const pass = /ℹ?\s*pass\s+(\d+)/i.exec(testoEsito)?.[1];
    const fail = /ℹ?\s*fail\s+(\d+)/i.exec(testoEsito)?.[1];
    if (pass === undefined || fail === undefined) return bersaglioBase;
    return fail === '0' ? `✓ Test verdi — ${pass}/${pass}` : `✗ Test falliti — ${fail} su ${Number(pass) + Number(fail)}`;
  }

  /**
   * Argomenti di un tool-call, formattati: se il JSON è valido (lo è
   * sempre a fine trasmissione — questo backend manda gli argomenti in
   * un unico delta, non a token), ogni campo diventa "chiave: valore";
   * un valore multi-riga o lungo va in un blocco <pre><code> — newline
   * VERI, decodificati dal JSON.parse, non l'escape letterale. Se il
   * parse fallisce (un delta ancora incompleto), il testo grezzo resta
   * leggibile in un <pre> invece di sparire. Porting dal bundle
   * desktop, invariato.
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
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' }), 40);
  }

  /**
   * ⭐⭐⭐ 28/8 — permesso "On request": descrive l'azione che il kernel sta
   * per fare, così l'owner decide sapendo COSA sta approvando — stessa
   * forma {tipo,percorso?,comando?,formato?} di verificaPermessoScrittura
   * (talosHarness.mjs), mai un "azione sconosciuta" generico quando il
   * campo giusto è già lì.
   */
  function descriviAzioneApprovazione(azione) {
    if (azione?.tipo === 'scrivi') return `Wants to write the file: ${azione.percorso}`;
    if (azione?.tipo === 'shell') return `Wants to run the command: ${azione.comando}`;
    if (azione?.tipo === 'document_create') return `Vuole creare un documento (formato ${azione.formato || '?'})`;
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
        toast('Reply failed', error.message);
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
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' }), 40);
    return article;
  }

  /*
   * ⛔⛔ 27/8, trovato dalla pipeline QA visiva (zero costo, iniettando un
   * ToolCallResult finto via window.__talosHarnessUiRuntime.handleRealEvent
   * per non pagare una chiamata vera): `code.dataset.reale`/`shell.dataset.reale`
   * qui sotto diventano "1" alla PRIMA volta e non tornano MAI indietro —
   * nuovaGenerazioneSessione() resetta la chat/reviewFiles/albero, ma non
   * queste due viste dedicate, perché il loro stato "già reale" vive nel DOM
   * (dataset), non in `state.realSession`. Risultato misurato: passando dalla
   * sessione A (con un comando shell finto, marcatore incluso) alla sessione
   * B, il Terminale della sessione B mostrava ANCORA il marcatore di A,
   * concatenato con l'output vero di B — una sessione che mostra la storia
   * di un'altra, non solo "niente fuffa" ma dati sbagliati.
   *
   * ⛔⛔⛔ 27/8, seconda passata (ispezione visiva IMPORTANTISSIMA): la prima
   * cura restituiva il markup DEMO originale (composer.spec.ts, un
   * "device preview" con TalosComposer.vue +28-19) — stesso "pty demo"/
   * badge visibile, ma pur sempre DATI INVENTATI a schermo per una
   * sessione VERA che semplicemente non ha ancora usato quell'attrezzo.
   * Confrontato con la cura poco sotto per il Review (che mostra
   * onestamente "0 file modificati", mai un demo) — stessa famiglia di
   * difetto, incoerente fra le due. Ora entrambe le viste, al reset,
   * mostrano uno stato onesto E VUOTO — non il demo, non i dati di
   * un'altra sessione — esattamente come il Review.
   */
  function resettaSuperficiRealiDedicate() {
    const terminalWindow = $('[data-view="terminal"] .terminal-window');
    if (terminalWindow) {
      const code = document.createElement('code');
      code.textContent = 'No command run in this session.';
      terminalWindow.replaceChildren(code);
      const demoBadge = $('.demo-surface-badge', $('[data-view="terminal"]'));
      if (demoBadge) demoBadge.hidden = true; // onesto e vuoto, non "demo": non è un dato finto da segnalare
    }
    const browserShell = $('[data-view="browser"] .browser-shell');
    if (browserShell) {
      delete browserShell.dataset.reale;
      const barraUrl = $('[data-view="browser"] .browser-url');
      if (barraUrl) barraUrl.replaceChildren(document.createTextNode('—'));
      const anteprima = $('[data-view="browser"] .device-preview');
      if (anteprima) anteprima.replaceChildren(textElement('p', 'board-empty', 'No page read in this session.'));
      const demoBadge = $('.demo-surface-badge', $('[data-view="browser"]'));
      if (demoBadge) demoBadge.hidden = true;
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

  /**
   * ⭐ Piano §1.3-BIS.T (seconda metà) — la vista Terminale dedicata smette
   * di essere demo la prima volta che un comando VERO gira. Non un vero
   * emulatore (niente cursore che si muove, niente ANSI): un prompt riga
   * per riga, stesso stile visivo del mockup (span .prompt/.path/.cursor),
   * ma con l'output reale.
   *
   * ⛔ Non tocca il rendering generico della chat (appendToolNote già
   * mostra lo stesso tool-call lì) — questa è un'AGGIUNTA, non una
   * sostituzione: lo stesso comando compare in entrambe le viste, come nel
   * mockup originale (Terminale è una vista dedicata, non l'unica prova
   * che qualcosa è girato).
   */
  function appendTerminalEntry(comando, testo) {
    const code = $('[data-view="terminal"] .terminal-window code');
    if (!code) return;
    if (!code.dataset.reale) {
      code.replaceChildren();
      code.dataset.reale = '1';
      const demoBadge = $('.demo-surface-badge', $('[data-view="terminal"]'));
      if (demoBadge) demoBadge.hidden = true;
    }
    const workspace = $('#envWorkspace')?.textContent || 'talos';
    const rigaPrompt = document.createElement('span');
    rigaPrompt.append(
      textElement('span', 'prompt', 'talos'),
      document.createTextNode(' '),
      textElement('span', 'path', `~/${workspace}`),
    );
    code.append(rigaPrompt, document.createTextNode(`\n$ ${comando}\n\n${testo}\n\n`));
    const contenitore = code.closest('.terminal-window');
    if (contenitore) contenitore.scrollTop = contenitore.scrollHeight;
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
    const shell = $('[data-view="browser"] .browser-shell');
    if (!shell) return;
    if (!shell.dataset.reale) {
      shell.dataset.reale = '1';
      const demoBadge = $('.demo-surface-badge', $('[data-view="browser"]'));
      if (demoBadge) demoBadge.hidden = true;
    }
    const barraUrl = $('[data-view="browser"] .browser-url');
    if (barraUrl) {
      barraUrl.replaceChildren();
      const pulse = document.createElement('span');
      pulse.className = 'status-pulse';
      barraUrl.append(pulse, document.createTextNode(url));
    }
    const anteprima = $('[data-view="browser"] .device-preview');
    if (anteprima) {
      anteprima.replaceChildren();
      const blocco = document.createElement('pre');
      blocco.className = 'browser-real-output';
      blocco.textContent = testo;
      anteprima.append(blocco);
    }
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
      toast('No real session running', 'Start a task from the corpus before using a direct command.');
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
      if (!silenzioso) toast('Command sent', comando);
    } catch (error) {
      toast('Command not run', error.message);
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
      if (!input) return '(no detail)';
      if (input.comandoDiretto) return `Direct command: \`${input.comandoDiretto}\``;
      if (input.consegna) return `${input.seguito ? '**Follow-up:** ' : ''}${input.consegna}`;
      return blocco(JSON.stringify(input, null, 2), 'json');
    };

    righe.push(`# TALOS Harness session transcript`, '');
    righe.push(`- **Session:** ${esportato.nome || esportato.taskId || esportato.sessionId}`);
    righe.push(`- **Id:** \`${esportato.sessionId}\``);
    righe.push(`- **Modello:** ${esportato.modello || '(default)'}`);
    righe.push(`- **Started:** ${esportato.avviataAlle || '?'}`);
    righe.push(`- **Conclusa:** ${esportato.conclusa ? 'sì' : 'no'}`);
    if (esportato.forkDa) righe.push(`- **Fork da:** \`${esportato.forkDa}\``);
    righe.push(`- **Eventi totali:** ${Array.isArray(esportato.eventi) ? esportato.eventi.length : 0}`, '');

    if (!Array.isArray(esportato.eventi) || esportato.eventi.length === 0) {
      righe.push('> ⛔ No event recorded for this session.');
      return righe.join('\n');
    }

    let numeroGiro = 0;
    for (const evento of esportato.eventi) {
      switch (evento.type) {
        case 'RunStarted': {
          numeroGiro += 1;
          righe.push(`## Giro ${numeroGiro}`, '', descriviTask(evento.input), '');
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
          righe.push(`**🔧 ${info.nome}**`, '', 'Argomenti:', blocco(argFormattati || '(none)', 'json'), '', 'Esito (completo, mai troncato):', blocco(String(evento.content ?? '')), '');
          toolBuffer.delete(evento.toolCallId);
          break;
        }
        case 'StateDelta': {
          const operazione = evento.delta?.[0];
          if (operazione?.path === '/usage') {
            righe.push(`_Token usage updated: ${blocco(JSON.stringify(operazione.value), 'json')}_`, '');
          } else if (operazione?.path?.startsWith('/file/')) {
            const percorso = operazione.path.replace(/^\/file\//, '');
            righe.push(`✏️ **File ${operazione.op === 'add' ? 'created' : 'changed'}:** \`${percorso}\` _(full content in the JSON format)_`, '');
          } else {
            righe.push(`_StateDelta:_ ${blocco(JSON.stringify(evento.delta), 'json')}`, '');
          }
          break;
        }
        case 'ArtifactCreated': {
          righe.push(`📦 **Artifact created:** ${evento.titolo || '(untitled)'} (\`${evento.id}\`)`, '');
          break;
        }
        case 'WorkspaceChanged': {
          const elenco = Array.isArray(evento.percorsi) ? evento.percorsi.join(', ') : '(paths not specified)';
          righe.push(`📁 _Cambiamento esterno nel workspace: ${elenco}_`, '');
          break;
        }
        case 'QueuedMessageDelivered': {
          righe.push(`⏭️ **Follow-up dalla coda:**`, '', evento.testo ?? '', '');
          break;
        }
        case 'ApprovalRequested': {
          righe.push(`⏸ **Approval required:** ${descriviAzioneApprovazione(evento.azione)}`, '');
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

  /**
   * ⭐ Piano §1.3, riga Review — ogni scrittura reale aggiorna la scheda
   * Review già esistente, non solo la conversazione. Una voce PER
   * percorso, così un task che scrive più file resta tutto ispezionabile.
   *
   * ⛔ `value` è il contenuto INTERO del file, mai un vero diff riga per
   * riga — 'add' mostra righe verdi (file nuovo), 'replace' righe neutre
   * (file toccato, contenuto attuale) invece di inventare +/- che non ha.
   *
   * ⛔⛔ 28/8, corretto: QUESTO commento diceva "talosHarness.mjs non
   * passa il prima a onScrittura oggi" — era vero quando scritto, non
   * più dal 27/8 (`contenutoPrima`/`operazione.previous` arrivano già
   * qui, commit b2d64f1b). Il diff riga-per-riga resta comunque non
   * costruito: non per mancanza del dato, per SCELTA (ledger
   * FASE-1-REVIEW-TEST-RISCHIO, 2.A fatta/2.B fatta oggi con questa
   * riga — l'algoritmo di diff vero è un pezzo di lavoro a sé, non
   * incluso in nessuna delle due).
   */
  function updateRealReview(delta) {
    const operazione = delta?.[0];
    if (!operazione || typeof operazione.path !== 'string') return;
    const percorso = operazione.path.replace(/^\/file\//, '');
    state.realSession.reviewFiles.set(percorso, {
      path: percorso,
      nuovo: operazione.op === 'add',
      code: String(operazione.value ?? '').split('\n').map((riga) => [operazione.op === 'add' ? 'add' : 'ctx', riga]),
    });
    renderRealReviewList();
    renderReviewFile(`real:${percorso}`);
    aggiornaSommarioReviewReale();
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
   * ⛔ "test"/"rischio" NON sono più impostati qui (29/8, risolvendo il
   * cherry-pick di questo commit contro FASE H): questa copia mobile ha
   * già `renderRischioReview` (sotto, chiamata da `renderRealReviewList`
   * PRIMA di questa funzione nello stesso `updateRealReview`) — un
   * meccanismo PIÙ avanzato del canonico di origine, che calcola un
   * verdetto vero da `state.realSession.ultimoEsitoProva` invece di un
   * "—" fisso. Se questa funzione azzerasse `reviewSummaryTest`/
   * `reviewSummaryRischio` DOPO, cancellerebbe ogni volta il verdetto
   * vero appena scritto — un regresso, non un merge neutro.
   */
  function aggiornaSommarioReviewReale() {
    const voci = [...state.realSession.reviewFiles.values()];
    const nuovi = voci.filter((f) => f.nuovo).length;
    const modificati = voci.length - nuovi;
    const impostaTesto = (id, testo) => { const el = $(`#${id}`); if (el) el.textContent = testo; };
    impostaTesto('reviewSummaryNuovi', String(nuovi));
    impostaTesto('reviewSummaryModificati', String(modificati));
    const demoBadge = $('.demo-surface-badge', $('[data-view="diff"]'));
    if (demoBadge) demoBadge.hidden = true;
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
      button.append(etichetta, textElement('span', 'diff-stats', `${file.nuovo ? 'new' : 'changed'} · ${file.code.length} lines`));
      button.addEventListener('click', () => {
        $$('.file-review', contenitore).forEach((f) => { f.classList.remove('active'); f.setAttribute('aria-pressed', 'false'); });
        button.classList.add('active');
        button.setAttribute('aria-pressed', 'true');
        renderReviewFile(button.dataset.reviewFile);
      });
      return button;
    }));
    const titolo = $('[data-view="diff"] .view-heading h2');
    if (titolo) titolo.textContent = `${voci.length} file${voci.length === 1 ? '' : 's'} changed`;
    if (voci.length > 0) renderRischioReview(voci);
  }

  /**
   * ⭐ Ledger FASE-1-REVIEW-TEST-RISCHIO §2.B, 28/8 — criteri
   * dichiarati, un AND fra condizioni binarie (pattern industriale più
   * semplice della ricerca 28/8: "low-risk solo se soddisfa TUTTI i
   * criteri"), non un punteggio continuo — coerente col resto del
   * progetto (cancelli deterministici, mai un giudizio dove basta una
   * regola). Pura: nessun accesso a `state`, testabile da sola.
   *
   * ⛔ Adattata ai dati REALMENTE disponibili oggi: senza un algoritmo
   * di diff riga-per-riga (esplicitamente FUORI da questa proposta —
   * vedi il commento su `updateRealReview` sopra) non esistono "righe
   * aggiunte/rimosse" vere, solo il totale di righe nei file toccati.
   * Il criterio si chiama per quello che è, `dimensioneContenuta`, non
   * "poche righe cambiate".
   */
  function classificaRischioReview({ exitCode, righeToccateTotali, percorsiToccati }) {
    const criteri = {
      testVerde: exitCode === 0,
      // Soglia dichiarata, da ricalibrare — stesso principio già in uso
      // altrove nel progetto per soglie nuove mai ancora misurate.
      dimensioneContenuta: righeToccateTotali < 200,
      nessunFileSensibile: !percorsiToccati.some((p) => /\.env|config\.ya?ml|\.ssh\//.test(p)),
    };
    return { bassoRischio: Object.values(criteri).every(Boolean), criteri };
  }

  /**
   * ⭐ Sostituisce i due badge demo (§2.B) con lo stato vero, SOLO
   * quando c'è almeno un file reale scritto — stesso principio già in
   * uso per `renderRealReviewList` (demo→reale solo quando il dato
   * esiste davvero, mai un valore inventato per riempire lo spazio).
   * `exitCode:null` (nessuna `prova` ancora arrivata in sessione) resta
   * un terzo stato onesto — "—", non un verde o un rosso finti.
   */
  function renderRischioReview(voci) {
    const badgeTest = $('[data-view="diff"] [data-review-stat="test"] span');
    const badgeRischio = $('[data-view="diff"] [data-review-stat="risk"] span');
    if (!badgeTest || !badgeRischio) return;
    const exitCode = state.realSession.ultimoEsitoProva;
    if (exitCode === null) {
      badgeTest.textContent = '—';
      badgeRischio.textContent = '—';
      return;
    }
    const righeToccateTotali = voci.reduce((somma, file) => somma + file.code.length, 0);
    const percorsiToccati = voci.map((file) => file.path);
    const { bassoRischio, criteri } = classificaRischioReview({ exitCode, righeToccateTotali, percorsiToccati });
    badgeTest.textContent = criteri.testVerde ? 'Verdi' : 'Rossi';
    badgeRischio.textContent = bassoRischio ? 'Basso' : 'Alto';
  }

  /**
   * ⭐ Piano §1.3, riga "Contesto workspace" — l'albero file REALE, un
   * livello alla volta (GET /api/v1/sessions/:id/tree?percorso=...): le
   * cartelle sono bottoni che scendono di un livello, ".. (su)" risale.
   */
  /*
   * ⭐⭐⭐ 29/8 — porting dal bundle desktop, albero file VERO ed espandibile
   * (piano madre §1.3, "Contesto workspace"; commit desktop di riferimento:
   * la fase che ha introdotto `costruisciNodoAlbero`/`apriCartellaAlbero`).
   * Prima: `aggiornaAlberoReale(percorso)` mostrava UN SOLO livello piatto
   * — "dentro" una cartella sostituiva l'intera vista, "su" tornava
   * indietro: mai più di una cartella visibile insieme, mai annidamento
   * vero. Ora: un albero reale, cartelle multiple aperte insieme,
   * navigazione da tastiera (frecce/Home/End), pallini di stato (nuovo/
   * modificato) dalla stessa `reviewFiles` già usata dalla Review.
   *
   * ⛔ Scoping deliberato di questo porting: SENZA il menu azioni per file
   * (rinomina/copia/elimina/imposta-radice/rivela-in-esplora — bottone
   * "···" + tasto destro) e SENZA il drag&drop per spostare — desktop li
   * ha, sono un sottosistema CRUD a sé (apriMenuAzioniFile + 5 funzioni di
   * supporto), non ancora portato: vedi LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md.
   * Qui solo la navigazione: espandi/comprimi/seleziona/apri-per-nome.
   */
  function statoFileAlbero(percorsoCompleto) {
    const voce = state.realSession.reviewFiles.get(percorsoCompleto);
    if (!voce) return null;
    return voce.nuovo ? 'new' : 'modified';
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
    const dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree?percorso=${encodeURIComponent(percorso)}`);
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
      childUl.replaceChildren(textElement('li', 'ft-loading', 'Not readable.'));
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
      dot.title = stato === 'new' ? 'Nuovo' : 'Changed';
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
    row.addEventListener('contextmenu', (event) => {
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
    row.draggable = true;
    row.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/x-talos-file-path', percorsoCompleto);
      event.dataTransfer.effectAllowed = 'move';
    });
    if (cartella) {
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
          toast('Moved', esito.nuovoPercorso); // ⭐ 3/9 — stessa pulizia di apriMenuAzioniFile qui sopra, stesso giro
          state.realSession.treeCache.delete(percorsoCompleto);
          await invalidaLivelloGenitoreAlbero(percorsoSorgente);
        } catch (error) {
          toast('Move failed', error.message);
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
   * principale") — voci diverse da un file (niente "Open"/"Allega alla
   * chat", che non hanno senso su una cartella; in più "Imposta come
   * radice"), non un secondo menu duplicato: stessa funzione, stesso
   * meccanismo di posizionamento/chiusura, solo l'elenco `voci` cambia.
   */
  function apriMenuAzioniFile(percorsoCompleto, nome, posizionamento, cartella = false, soloCreazione = false) {
    document.querySelector('.ft-actions-menu')?.remove();

    const menu = document.createElement('div');
    menu.className = 'ft-actions-menu';
    menu.setAttribute('role', 'menu');

    /*
     * ⭐ 28/8 — tasto destro sulla RADICE dell'albero: nessuna rinomina/copia/elimina ha senso lì, solo creare.
     * ⭐⭐⭐ 3/9 — trovato mentre aggiornavo un test rosso (item 6 di avm-03,
     * il pulsante «‹»/«☰» — indagine diversa, stesso giro): questo menu
     * era un mix di due lingue, "New folder"/"Open"/"Delete" in inglese
     * accanto a "Nuovo file"/"Rinomina"/"Copia"/"Imposta come
     * radice"/"Rivela in Esplora File"/"Allega alla chat" ancora in
     * italiano — la stessa classe di difetto che il censimento di
     * avm-03 (commit 8398f860, 182 stringhe) intendeva chiudere, sfuggita
     * qui perché queste sono dentro un array costruito a runtime, non un
     * letterale isolato facile da trovare a colpo d'occhio. Tradotto per
     * intero, non solo le due voci che un test toccava.
     */
    const voci = soloCreazione ? [
      { etichetta: 'New file', icona: 'i-edit', azione: () => avviaCreaVoce(percorsoCompleto, 'file') },
      { etichetta: 'New folder', icona: 'i-folder', azione: () => avviaCreaVoce(percorsoCompleto, 'cartella') },
    ] : cartella ? [
      { etichetta: 'New file', icona: 'i-edit', azione: () => avviaCreaVoce(percorsoCompleto, 'file') },
      { etichetta: 'New folder', icona: 'i-folder', azione: () => avviaCreaVoce(percorsoCompleto, 'cartella') },
      { etichetta: 'Rename', icona: 'i-edit', azione: () => avviaRinominaFile(percorsoCompleto, nome) },
      { etichetta: 'Copy', icona: 'i-link', azione: () => avviaCopiaFile(percorsoCompleto) },
      { etichetta: 'Set as root', icona: 'i-folder', azione: () => impostaComeRadice(percorsoCompleto, nome) },
      { etichetta: 'Show in Files', icona: 'i-folder-open', azione: () => rivelaFileInEsploraFile(percorsoCompleto) },
      { etichetta: 'Delete', icona: 'i-trash', azione: () => avviaEliminaFile(percorsoCompleto, nome), pericoloso: true },
    ] : [
      { etichetta: 'Open', icona: 'i-eye', azione: () => apriFileAlbero(percorsoCompleto, nome) },
      { etichetta: 'Attach to chat', icona: 'i-link', azione: () => allegaFileAllaChat(percorsoCompleto) },
      { etichetta: 'Rename', icona: 'i-edit', azione: () => avviaRinominaFile(percorsoCompleto, nome) },
      { etichetta: 'Copy', icona: 'i-link', azione: () => avviaCopiaFile(percorsoCompleto) },
      { etichetta: 'Show in Files', icona: 'i-folder-open', azione: () => rivelaFileInEsploraFile(percorsoCompleto) },
      { etichetta: 'Delete', icona: 'i-trash', azione: () => avviaEliminaFile(percorsoCompleto, nome), pericoloso: true },
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
      mount.replaceChildren(textElement('p', 'board-empty', `Not readable: ${error.message}`));
    }
  }

  function allegaFileAllaChat(percorsoCompleto) {
    composerInput.value = `${composerInput.value.replace(/@[^\s]*$/, '')}@${percorsoCompleto} `;
    autoGrowTextarea();
    composerInput.focus();
    toast('Attached to chat', percorsoCompleto); // ⭐ 3/9 — stessa pulizia di apriMenuAzioniFile, stesso giro
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
      toast('Copied', esito.nuovoPercorso); // ⭐ 3/9 — stessa pulizia, stesso giro
      await invalidaLivelloGenitoreAlbero(percorsoCompleto);
    } catch (error) {
      toast('Copy failed', error.message);
    }
  }

  /** ⭐⭐⭐ 28/8, owner: "comandi crud in generale" — "Nuovo file"/"New folder", dentro percorsoBase ('' = radice). */
  function avviaCreaVoce(percorsoBase, tipo) {
    state.alberoFileTarget = { percorso: percorsoBase, tipo };
    openSheet('createFile');
    sheetTitle.textContent = tipo === 'cartella' ? 'New folder' : 'New file'; // ⭐ 3/9 — stessa pulizia, stesso giro
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
   * sempre il suo stesso toast "Policy updated".
   */
  function impostaComeRadice(percorsoRelativo, nome) {
    const radice = state.realSession.cartellaAssoluta;
    if (!radice) {
      toast('Unknown root', 'This session has not declared its path yet — try again once the first turn starts.'); // ⭐ 3/9 — stessa pulizia, stesso giro
      return;
    }
    const nuovaRadice = `${radice.replace(/[/\\]+$/, '')}/${percorsoRelativo}`;
    impostaPermesso('Full access', `Full access · new root: ${nome}`);
    avviaSessionePendente({ cartellaLibera: nuovaRadice, nomeCartella: nome, modello: state.model, effort: state.effort, permessi: 'Full access' });
  }

  async function rivelaFileInEsploraFile(percorsoCompleto) {
    try {
      await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree/reveal`, { percorso: percorsoCompleto });
      toast('Shown in Files', percorsoCompleto); // ⭐ 3/9 — stessa pulizia, stesso giro — combacia con l'etichetta "Show in Files" del menu
    } catch (error) {
      toast('Failed', error.message);
    }
  }

  /** Piano §1.3, riga "Contesto workspace" — l'albero file REALE, radice + tutto ciò che era già aperto (treeOpen), riscaricato dal vivo. */
  async function renderizzaAlberoReale() {
    if (!state.realSession.id) return;
    const contenitore = $('#inspector-files .file-tree');
    if (!contenitore) return;
    const demoBadge = $('.demo-surface-badge', $('[data-inspector-section="files"]'));
    if (demoBadge) demoBadge.hidden = true;

    const radice = document.createElement('div');
    radice.className = 'tree-root';
    radice.append(iconaSvgAlbero('i-files'), textElement('strong', '', state.realSession.taskId || 'workspace'));
    // ⭐⭐⭐ 28/8, owner: "comandi crud in generale" — creare un file/una cartella senza dover prima cliccare col destro su una cartella esistente: la radice stessa accetta lo stesso menu, ridotto alle due sole voci di creazione (percorsoBase '').
    radice.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      apriMenuAzioniFile('', state.realSession.taskId || 'workspace', { x: e.clientX, y: e.clientY }, true, true);
    });
    // ⭐ stesso drop-target delle cartelle, ma per "portare fuori" un elemento alla radice.
    radice.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/x-talos-file-path')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      radice.classList.add('ft-row-drag-over');
    });
    radice.addEventListener('dragleave', () => radice.classList.remove('ft-row-drag-over'));
    radice.addEventListener('drop', async (e) => {
      e.preventDefault();
      radice.classList.remove('ft-row-drag-over');
      const percorsoSorgente = e.dataTransfer.getData('text/x-talos-file-path');
      if (!percorsoSorgente) return;
      try {
        const esito = await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree/move`, { percorso: percorsoSorgente, cartellaDestinazione: '' });
        toast('Moved', esito.nuovoPercorso); // ⭐ 3/9 — stessa pulizia di apriMenuAzioniFile qui sopra, stesso giro
        state.realSession.treeCache.delete('');
        await invalidaLivelloGenitoreAlbero(percorsoSorgente);
      } catch (error) {
        toast('Move failed', error.message);
      }
    });

    const ul = document.createElement('ul');
    ul.className = 'ft-tree';
    ul.setAttribute('role', 'tree');
    ul.setAttribute('aria-label', 'Workspace files');
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
      ul.appendChild(textElement('li', 'ft-loading', 'Tree not available.'));
      return;
    }
    for (const voce of voci) {
      // eslint-disable-next-line no-await-in-loop -- vedi la nota gemella in apriCartellaAlbero
      await costruisciNodoAlbero(voce.nome, voce.nome, Boolean(voce.cartella), 1, ul);
    }
    const prima = ul.querySelector('.ft-row');
    if (prima) prima.tabIndex = 0;
    filtraAlberoReale($('#fileTreeFilter')?.value || '');
  }

  /** Refresh SOLO i pallini di stato dei file già a schermo — nessuna richiesta di rete, reviewFiles è già aggiornato. Porting dal bundle desktop, invariato. */
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
        dot.title = stato === 'new' ? 'Nuovo' : 'Changed';
      } else if (dot) {
        dot.remove();
      }
    }
  }

  /** Dopo una scrittura reale: i pallini si aggiornano subito (gratis); un file MAI visto prima in un livello già mostrato invalida solo quel livello e ridisegna. Porting dal bundle desktop, invariato. */
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

  /** ⭐ Ricerca dal vivo — SOLO fra i nodi già caricati in questa sessione (vedi la doc sopra renderizzaAlberoReale sul perché). Apre gli antenati di ogni risultato, sottolinea la porzione trovata. Porting dal bundle desktop, invariato. */
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
      hint.appendChild(document.createTextNode(` result${trovati === 1 ? '' : 's'} in the files already loaded`));
    } else {
      hint.textContent = 'No loaded file matches — open more folders to include them.';
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
        // ⭐ 29/8 — ledger §10: la striscia "Running" era scollegata dagli eventi VERI, mai un solo case la chiamava.
        /*
         * ⭐⭐⭐ 3/9 — un giro NUOVO (anche un follow-up sulla stessa
         * sessione) riparte da zero: mai un cronometro che continua a
         * contare dal primo giro della sessione, mai un contatore errori
         * che somma i giri precedenti — vedi erroriStrumento/
         * runIniziatoAlle in state.realSession. `usage` torna a `null`
         * apposta (non 0): "non ancora saputo" resta distinto da "zero
         * token", stessa onestà già in formattaUsageBreve. aggiornaRunKpis()
         * subito dopo mostra l'azzeramento a schermo, non solo in stato —
         * altrimenti il run-strip terrebbe i NUMERI DEL GIRO PRECEDENTE
         * finché il primo /usage del nuovo giro non arriva.
         */
        state.realSession.erroriStrumento = 0;
        state.realSession.runIniziatoAlle = Date.now();
        state.realSession.usage = null;
        setRunState(true);
        aggiornaRunKpis();
        chiudiGruppoToolCorrente(); // ⭐ 30/8 — un giro nuovo (anche un resume/continua) non eredita il gruppo tool-call del giro precedente

        /*
         * ⭐ 29/8, porta canonico (ledger §21): 143172fa (27/8) toglie il
         * rumore interno "Nuovo giro iniziato sulla stessa conversazione"
         * (owner: "ovviamente non deve comparire") — applicato qui come
         * prerequisito minimo, senza il secondo hunk di quel commit
         * (resumeSession(messaggio), fuori scope: quella firma non è
         * ancora estesa su questa copia). f28cf4a1 (28/8) lo sostituisce
         * con un follow-up VERO quando il RunStarted è un replay marcato
         * `seguito:true` — `followUpBubbleInAttesa` evita il doppione
         * quando resumeSession lo ha già mostrato in modo ottimista dal
         * vivo (meccanismo che questa copia non ha ancora: il flag parte
         * sempre `false`, quindi qui il ramo "già mostrato" non scatta
         * mai — appendUserFollowUp mostra sempre il replay, corretto
         * finché resumeSession(messaggio) non è portato).
         *
         * ⛔⛔⛔ 29/8, porta canonico (0d312192) — CONFERMA che quel giorno
         * era già il caso reale: session-registry.mjs resume() annuncia il
         * nuovo messaggio con `evento.input.seguito:true` (mai più il task
         * originale ripetuto), e questo `else if` lo consuma correttamente
         * SOLO al replay (mai due volte dal vivo, `followUpBubbleInAttesa`
         * fa da guardia). Senza questo fix un F5 dopo N follow-up mostrava
         * SOLO il primo messaggio, ripetuto N volte — il replay non aveva
         * nessun evento da cui recuperare gli altri.
         */
        state.realSession.runCount = (state.realSession.runCount || 0) + 1;
        if (!state.realSession.taskBubbleMostrata && evento.input) {
          appendRealTaskStart(evento.input);
        } else if (state.realSession.taskBubbleMostrata && evento.input?.seguito) {
          if (state.realSession.followUpBubbleInAttesa) {
            state.realSession.followUpBubbleInAttesa = false; // già mostrato dal vivo, non duplicare
          } else {
            appendUserFollowUp(evento.input.consegna); // replay dopo un reload: nessun ottimismo l'ha già mostrato
          }
        }
        if (evento.contesto) aggiornaPannelloAmbiente(evento.contesto);
        renderizzaAlberoReale();
        break;
      }
      /*
       * ⭐⭐⭐ 2/9 — Stadio A (talosHarness.mjs, 23/8): il giro di
       * compattazione consuma un turno vero ma non produce mai testo per
       * la persona — senza questi due casi sembrava un turno normale
       * rimasto senza risposta, indistinguibile da un modello bloccato.
       */
      case 'CompactionStart': {
        mostraCompattazioneInCorso();
        break;
      }
      case 'CompactionEnd': {
        nascondiCompattazioneInCorso();
        break;
      }
      case 'TextMessageContent': {
        nascondiAttesaRisposta(); // il primo token vero: la ruota di attesa ha fatto il suo lavoro
        // ⭐⭐⭐ 30/8 — un messaggio di testo NUOVO chiude il gruppo tool-call corrente (un gruppo è "i tool-call FRA due messaggi", vedi chiudiGruppoToolCorrente): un delta successivo dello STESSO messaggio (messageId già visto) non deve richiudere niente, il gruppo è già chiuso o non esisteva.
        if (!state.realSession.messageElements.has(evento.messageId)) chiudiGruppoToolCorrente();
        // ⭐ 2/9 — il valore di ritorno non serve più qui: il render
        // (sotto) rilegge l'elemento da messageElements da solo. Questa
        // chiamata resta per il SUO effetto collaterale — crea/aggancia
        // la bolla al DOM al primo delta, ensureAssistantMessageElement().
        ensureAssistantMessageElement(evento.messageId);
        // ⛔⛔⛔ 27/8 — testo GREZZO accumulato a parte (mai letto da
        // .textContent, che ora contiene il RENDER): renderizzaMarkdownSemplice()
        // rilavora sempre il markdown intero visto finora, un delta grezzo
        // in mezzo a un ```blocco di codice``` non basta da solo a capirlo.
        const testoGrezzo = (state.realSession.testoGrezzoMessaggi.get(evento.messageId) || '') + evento.delta;
        state.realSession.testoGrezzoMessaggi.set(evento.messageId, testoGrezzo);
        // ⭐⭐⭐ 2/9 — il testo grezzo si accumula SEMPRE subito (sopra,
        // sincrono, come sempre): solo il render DOM è differito e
        // coalescente, vedi programmaRenderMessaggioStreaming() — più
        // delta nello stesso frame producono un solo render incrementale
        // invece di rilavorare tutto il markdown a ognuno (era
        // `copia.replaceChildren(renderizzaMarkdownSemplice(testoGrezzo))`
        // qui, O(n²) sul testo — review Fable R4).
        programmaRenderMessaggioStreaming(evento.messageId);
        break;
      }
      case 'ToolCallStart': {
        nascondiAttesaRisposta(); // il primo attrezzo chiamato: sappiamo già cosa sta facendo, la ruota non serve più
        /*
         * ⭐⭐⭐ 30/8, owner (due screenshot di Claude Code come
         * riferimento) — non più un bubble per tool-call: si aggiunge un
         * ITEM al gruppo CORRENTE (o se ne apre uno nuovo se non c'è
         * ancora — vedi chiudiGruppoToolCorrente e i suoi chiamanti per
         * quando un gruppo finisce). `info` resta tenuto per toolCallId
         * (ToolCallArgs/ToolCallResult aggiornano LO STESSO item, mai
         * "l'ultimo del gruppo" — stessa correzione anti-fragilità del
         * 29/8, ora provata anche fra DUE gruppi diversi in corsa).
         */
        const nome = evento.toolCallName;
        const gruppo = state.realSession.toolGroupCorrente || nuovoGruppoTool();
        const item = {
          toolCallId: evento.toolCallId, nome, categoria: categoriaAttrezzo(nome),
          bersaglio: bersaglioAttrezzo(nome, null), argomentiRaw: '', esitoRaw: undefined,
          nuovo: null, diffDisponibile: false, diffAggiunte: 0, diffRimozioni: 0, problema: false,
        };
        gruppo.items.push(item);
        state.realSession.toolCallNomi.set(evento.toolCallId, { nome, argomenti: '', gruppo, item });
        aggiornaRiassuntoGruppoTool(gruppo);
        break;
      }
      case 'ToolCallArgs': {
        const info = state.realSession.toolCallNomi.get(evento.toolCallId);
        if (info) {
          info.argomenti += evento.delta;
          info.item.argomentiRaw = info.argomenti; // sempre aggiornato, anche a JSON incompleto — resta leggibile grezzo nel foglio (renderizzaArgomentiAttrezzo già gestisce il parse fallito)
          let argomentiParsati = null;
          try { argomentiParsati = JSON.parse(info.argomenti); } catch { /* delta ancora incompleto: il bersaglio resta quello generico finché non arriva tutto */ }
          if (argomentiParsati) info.item.bersaglio = bersaglioAttrezzo(info.nome, argomentiParsati);
        }
        break;
      }
      case 'ToolCallResult': {
        const info = state.realSession.toolCallNomi.get(evento.toolCallId);
        if (info?.nome === 'shell') {
          let comando = '(command)';
          try { comando = JSON.parse(info.argomenti).comando || comando; } catch { /* args incompleti o non ancora arrivati: meglio un'etichetta onesta che un crash */ }
          appendTerminalEntry(comando, String(evento.content));
        } else if (info?.nome === 'naviga') {
          let url = '(url)';
          try { url = JSON.parse(info.argomenti).url || url; } catch { /* args incompleti o non ancora arrivati: meglio un'etichetta onesta che un crash */ }
          appendBrowserEntry(url, String(evento.content));
        }
        if (info?.nome === 'prova') {
          /*
           * ⭐ Ledger FASE-1-REVIEW-TEST-RISCHIO §2.B — `talosHarness.mjs`
           * scrive sempre `exit ${codice}\n...` in testa all'esito di
           * `prova` (verificato alla fonte, non assunto). Un contenuto
           * che non inizia così resta `null` — ignoto, mai un 0 finto.
           */
          const m = String(evento.content).match(/^exit (-?\d+)/);
          state.realSession.ultimoEsitoProva = m ? Number(m[1]) : null;
          renderRealReviewList();
        }
        /*
         * ⭐⭐⭐ 30/8 — l'item nel gruppo guadagna il verdetto (pass/fail di
         * `prova`, l'esito di una delega — stessa `riassuntoEsitoAttrezzo`
         * di sempre, per ogni altro attrezzo torna il bersaglio invariato)
         * e l'esito grezzo per il foglio; `pareFallito` (sopra) accende
         * l'avviso ⚠️ sia sulla riga del gruppo sia su questa riga precisa.
         */
        const testoEsito = String(evento.content).slice(0, 4000);
        if (info) {
          info.item.bersaglio = riassuntoEsitoAttrezzo(info.nome, info.item.bersaglio, testoEsito);
          info.item.esitoRaw = testoEsito;
          info.item.problema = pareFallito(testoEsito);
          if (info.item.problema) {
            info.gruppo.haProblema = true;
            /*
             * ⭐⭐⭐ 3/9 — avm-03, dal vivo: un ⚠️ compariva senza dire cosa
             * fosse andato storto. `estraiMotivoFallimento` mette qui il
             * riassunto che la riga CHIUSA mostrerà (vedi nuovoGruppoTool);
             * `erroriStrumento` è il kpi "errors" del run-strip, azzerato a
             * ogni RunStarted — vedi quel case per il perché.
             */
            info.item.motivoFallimento = estraiMotivoFallimento(testoEsito);
            state.realSession.erroriStrumento += 1;
            aggiornaRunKpis();
          }
          aggiornaRiassuntoGruppoTool(info.gruppo);
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
          break;
        }
        /*
         * ⭐⭐⭐ 30/8 — il diff riga-per-riga per il gruppo tool-call
         * (`calcolaDiffRighe`, esisteva già dal 27/8 ma non era MAI
         * chiamato — vedi la sua doc: "l'algoritmo di diff vero è un
         * pezzo di lavoro a sé", mai ancora incluso in nessuna proposta).
         * Attribuito all'ULTIMO item 'modificato' del gruppo APERTO
         * ancora senza diff: `talosHarness.mjs` esegue un attrezzo alla
         * volta (seriale per costruzione, vedi il piano), quindi è
         * sempre e solo quello appena scritto — mai un percorso da
         * abbinare (necessario: `generate_image` non conosce lato
         * client il nome file, deciso sul server da `talosSafeFileStem`).
         * File nuovo (`op:'add'`, stessa firma già letta da
         * `updateRealReview` per "nuovo"/"modificato") ⇒ ogni riga è
         * un'aggiunta, 0 rimozioni — coerente con un vero `git diff` su
         * un file mai esistito. File esistente ⇒ diff vero; se supera
         * `RIGHE_MASSIME_DIFF` (calcolaDiffRighe torna null) il numero
         * resta ONESTAMENTE assente (diffDisponibile:false), mai un
         * "+0 -0" inventato che dichiarerebbe zero cambi su un file che
         * magari ne ha migliaia.
         */
        const operazioneScrittura = evento.delta?.[0];
        const gruppoInCorsoPerDiff = state.realSession.toolGroupCorrente;
        if (gruppoInCorsoPerDiff && typeof operazioneScrittura?.path === 'string' && operazioneScrittura.path.startsWith('/file/')) {
          let itemDaRefreshre = null;
          for (let idx = gruppoInCorsoPerDiff.items.length - 1; idx >= 0; idx -= 1) {
            const candidato = gruppoInCorsoPerDiff.items[idx];
            if (candidato.categoria === 'modificato' && !candidato.diffDisponibile) { itemDaRefreshre = candidato; break; }
          }
          if (itemDaRefreshre) {
            const nuovo = operazioneScrittura.op === 'add';
            const valoreDopo = String(operazioneScrittura.value ?? '');
            let aggiunte = 0;
            let rimozioni = 0;
            let diffDisponibile = true;
            if (nuovo) {
              aggiunte = valoreDopo === '' ? 0 : valoreDopo.split('\n').length;
            } else {
              const righe = calcolaDiffRighe(String(operazioneScrittura.previous ?? ''), valoreDopo);
              if (righe) {
                aggiunte = righe.filter(([tipo]) => tipo === 'add').length;
                rimozioni = righe.filter(([tipo]) => tipo === 'del').length;
              } else {
                diffDisponibile = false; // file troppo grande per il diff — onesto: nessun numero, non "+0 -0"
              }
            }
            itemDaRefreshre.nuovo = nuovo;
            itemDaRefreshre.diffDisponibile = diffDisponibile;
            if (diffDisponibile) {
              itemDaRefreshre.diffAggiunte = aggiunte;
              itemDaRefreshre.diffRimozioni = rimozioni;
              gruppoInCorsoPerDiff.aggiunte += aggiunte;
              gruppoInCorsoPerDiff.rimozioni += rimozioni;
            }
            aggiornaRiassuntoGruppoTool(gruppoInCorsoPerDiff);
          }
        }
        updateRealReview(evento.delta);
        // ⭐ 29/8, porting dal bundle desktop — invalidazione MIRATA (solo il livello genitore del file scritto, se già mostrato) invece di un ricaricamento cieco dell'intero albero a ogni scrittura: percorso ricavato dallo stesso `path` già estratto sopra.
        const percorsoScritto = path?.replace(/^\/file\//, '');
        if (percorsoScritto) segnalaScritturaNellAlbero(percorsoScritto);
        /*
         * ⛔⛔⛔ 30/8 — owner dal vivo: "non so perché dopo ogni attività mi
         * dice... non ha senso e non ha proprio senso farlo vedere."
         * RIMOSSA la nota `appendStatusNote('✏️ File scritto...')` che
         * stava qui: era pura ridondanza, non un'informazione in più — la
         * STESSA scrittura è già mostrata tre volte nello stesso istante:
         * (1) il bubble della tool-call `scrivi` guadagna un blocco
         * "Esito:" col contenuto (poco sopra, case 'ToolCallResult'),
         * (2) `updateRealReview` appena chiamata popola la scheda Review,
         * (3) `segnalaScritturaNellAlbero` appena chiamata evidenzia il
         * file nell'albero. Verificato che il desktop (lane
         * `lane/harness-desktop`, `mobile/public/harness-ui/app.js`)
         * mostra la STESSA nota — non un caso da "consultare come fa il
         * desktop", perché il desktop non l'ha mai risolto: qui è una
         * decisione di prodotto nuova, non una copia.
         */
        break;
      }
      /*
       * ⭐ 29/8, porta canonico (ledger §21, cherry-pick 89829429):
       * l'attrezzo artifact_create manda questo evento col titolo/id, la
       * card apre un iframe isolato su /api/v1/artifacts/:id.
       * ⛔ GAP dichiarato: la rotta server che SERVE quell'id
       * (artifact-store.mjs esiste già, §17/G.2, ma http-app.mjs non ha
       * ancora la rotta GET /api/v1/artifacts/:id su questa copia) non è
       * stata ancora portata — fuori scope di questo cherry-pick
       * (sub-agenti). La card si apre, l'iframe mostrerà 404 finché
       * quella rotta non viene aggiunta separatamente.
       */
      case 'ArtifactCreated': {
        nascondiAttesaRisposta();
        chiudiGruppoToolCorrente(); // ⭐ 30/8 — una card artefatto è "un'altra cosa" nella chat, come un messaggio di testo: chiude il gruppo tool-call corrente
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
          renderizzaAlberoReale();
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
        chiudiGruppoToolCorrente(); // ⭐ 30/8 — un follow-up dalla coda è un turno nuovo nella chat: chiude il gruppo tool-call corrente
        appendUserFollowUp(evento.testo);
        state.realSession.codaMessaggi.shift();
        renderizzaBannerCoda();
        mostraAttesaRisposta();
        break;
      }
      case 'RunFinished': {
        setRunState(false); // ⭐ 29/8 — ledger §10, stesso motivo di RunStarted sopra
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
         * OGNI singolo giro concluso, non solo dopo una riconnessione. Tolto
         * l'`appendStatusNote(evento.result?.detto ...)` che stava qui: lo
         * stato "concluso" resta segnato (sotto, eventoTerminaleVisto) senza
         * ripetere il testo. La `nascondiAttesaRisposta()` di rete-sicurezza
         * resta una sola volta, poco più sotto — era duplicata qui.
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
        nascondiAttesaRisposta(); // rete di sicurezza: un giro che chiude senza aver mai prodotto testo/tool-call (raro, non impossibile) non deve lasciare la ruota a girare per sempre
        chiudiGruppoToolCorrente(); // ⭐ 30/8 — il giro è concluso: un eventuale prossimo giro (follow-up, resume) apre un gruppo tutto suo
        state.realSession.eventoTerminaleVisto = true;
        aggiornaElencoSessioniReali(); // lo stato in #sessionList passa da "in corso" a "concluso" (visibile solo standalone, vedi nota di testa)
        break;
      }
      case 'ApprovalRequested': {
        /*
         * ⭐⭐⭐ 28/8 — permesso "On request": talosHarness.mjs è DAVVERO in
         * pausa, aspettando questa risposta (session-registry.mjs tiene
         * la Promise aperta) — non un evento decorativo.
         */
        nascondiAttesaRisposta();
        chiudiGruppoToolCorrente(); // ⭐ 30/8 — una card di approvazione interrompe visivamente la sequenza di tool-call: chiude il gruppo corrente
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
      case 'DataRequested': {
        /*
         * ⭐⭐⭐ 30/8 — il ponte verso Note/Attività/Memoria/Libreria.
         * Owner, correggendo un errore: quei sistemi esistono già,
         * maturi e testati sul lato mobile — il kernel (talosHarness.mjs,
         * un processo Node separato, mai lo stesso UID dell'app) non
         * poteva raggiungerli. `window.__talosHarnessRichiediDato`
         * (piantato da HarnessSessionScreen.vue, stesso schema di
         * `__talosHarnessApiBase`) vive nello STESSO realm JS di questo
         * script — nessuna UI, nessun tocco della persona: risponde e
         * basta, appena arriva l'evento.
         *
         * ⛔ Nessuna scheda visibile apposta: a differenza
         * dell'approvazione (una decisione della persona), qui non c'è
         * niente da decidere — solo un dato da recuperare. Un fallimento
         * (bridge assente, es. app.js aperto fuori dall'app) torna un
         * `errore` onesto al kernel, mai un `dati:[]` silenzioso che si
         * legge come "non c'è niente".
         */
        (async () => {
          const bridge = window.__talosHarnessRichiediDato;
          let corpo;
          if (typeof bridge !== 'function') {
            corpo = { requestId: evento.requestId, errore: `no bridge to "${evento.tipo}" on this client` };
          } else {
            try {
              const dati = await bridge(evento.tipo, evento.args ?? null);
              corpo = { requestId: evento.requestId, dati };
            } catch (error) {
              corpo = { requestId: evento.requestId, errore: error instanceof Error ? error.message : String(error) };
            }
          }
          try {
            await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/data`, corpo);
          } catch {
            // ⛔ Un fallimento nel RISPONDERE (rete/sessione già conclusa) non ha una seconda strada: il kernel resta in attesa finché `ferma()` chiude il giro, stesso confine onesto di ogni Promise pendente su un client sparito.
          }
        })();
        break;
      }
      case 'RunError': {
        setRunState(false); // ⭐ 29/8 — ledger §10, stesso motivo di RunStarted sopra
        nascondiAttesaRisposta();
        appendStatusNote(`${evento.code ? `[${evento.code}] ` : ''}${evento.message}`, true);
        state.realSession.eventoTerminaleVisto = true;
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
   * (piano §1.3-BIS, blocco 1): il badge "Demo UI · not connected" della
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
    const demoBadgeChat = $$('.demo-surface-badge', $('.chat-view'))
      .find((badge) => badge.closest('[data-demo-surface]')?.dataset.demoSurface === 'chat');
    if (demoBadgeChat) demoBadgeChat.hidden = true;
    const source = new EventSource(API(`/api/v1/sessions/${encodeURIComponent(sessionId)}/events`));
    state.realSession.eventSource = source;
    source.onmessage = (message) => {
      let evento;
      try { evento = JSON.parse(message.data); } catch { return; }
      /*
       * ⭐⭐⭐ 2/9 — popola la cache man mano che gli eventi arrivano
       * (vedi il commento su cronologiaCache in testa al file): un
       * secondo click sullo STESSO id, più avanti in questa sessione
       * dell'app, rigioca da qui invece di riaprire una EventSource e
       * riattendere il replay intero dal server. Dedup per `_sequenza`
       * (stesso principio di sequenzeViste, ma per-sessione invece che
       * per-generazione): un replay SSE dopo una riconnessione non deve
       * raddoppiare le voci già in cache.
       */
      const cache = state.realSession.cronologiaCache.get(sessionId) ?? [];
      if (typeof evento._sequenza !== 'number' || !cache.some((e) => e._sequenza === evento._sequenza)) {
        cache.push(evento);
        state.realSession.cronologiaCache.set(sessionId, cache);
      }
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
        appendStatusNote('Event connection lost.', true);
      }
    };
  }

  /** Chiude l'EventSource corrente (se c'è) e apre una nuova generazione. */
  function nuovaGenerazioneSessione({ continua = false } = {}) {
    if (state.realSession.eventSource) {
      state.realSession.eventSource.close();
      state.realSession.eventSource = null;
    }
    // ⭐⭐⭐ 2/9 — SEMPRE, anche con continua:true: un render già
    // schedulato (rAF in coda) per l'EventSource appena chiuso non deve
    // arrivare a toccare il DOM dopo che la generazione è cambiata — la
    // stessa disciplina già applicata a ogni altro stato per-generazione
    // qui sotto, solo che questo va cancellato PRIMA di sapere se è un
    // resume o una sessione nuova (un resume APRE comunque un nuovo
    // EventSource, il vecchio frame schedulato appartiene a quello vecchio).
    cancellaRenderMessaggiStreaming();
    if (!continua) {
      $('#conversation').replaceChildren();
      state.realSession.messageElements = new Map();
      state.realSession.runCount = 0;
      state.realSession.taskBubbleMostrata = false;
      state.realSession.reviewFiles = new Map();
      state.realSession.treeCache = new Map();
      state.realSession.treeOpen = new Set();
      state.realSession.treePercorso = ''; // ⛔ 27/8 (d2428712) — mancava qui: la radice dell'albero di UNA sessione non deve sopravvivere a quella successiva
      state.realSession.sequenzeViste = new Set();
      state.realSession.testoGrezzoMessaggi = new Map();
      state.realSession.renderIncrementale = new Map(); // ⭐ 2/9 — sorella di testoGrezzoMessaggi qui sopra, stesso motivo: una sessione nuova non eredita la cache di rendering di quella precedente
      state.realSession.ragionamentoBubble = new Map();
      state.realSession.followUpBubbleInAttesa = false;
      state.realSession.attesaBubble = null; // il nodo è già sparito con replaceChildren() qui sopra
      state.realSession.compattazioneBubble = null; // ⭐ 2/9 — stesso motivo di attesaBubble qui sopra
      state.realSession.usage = null; // Fase 3 — un resume (continua:true) TIENE il conto, una sessione nuova riparte da IGNOTO
      state.realSession.approvazioniPendenti = new Map(); // le card sono già sparite con replaceChildren() qui sopra, la mappa le segue
      state.realSession.toolGroupCorrente = null; // ⭐ 30/8 — il bubble era già sparito con replaceChildren() qui sopra, il riferimento lo segue (mai un gruppo "fantasma" che aggiunge righe a un nodo staccato dal DOM)
      state.realSession.cartellaAssoluta = null; // Fase 3 — una sessione nuova non conosce ancora la propria radice finché RunStarted non arriva
      state.realSession.codaMessaggi = []; // FASE D — una sessione nuova non eredita la coda di quella precedente
      renderizzaBannerCoda();
      // ⛔ 27/8 — Terminale/Browser tengono il loro "già reale" nel DOM
      // (dataset), non in state.realSession: senza questo, restavano
      // mostrati per sempre, mescolati con la sessione successiva.
      resettaSuperficiRealiDedicate();
    }
    state.realSession.id = null;
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
    state.session = `Real task · ${task.id}`;
    mostraTitoloSessione(state.session);
    setView('chat');
    closePanels();
    appendRealTaskStart(task);
    mostraAttesaRisposta();
    toast('Avvio in corso', `${task.id} · project checkout on the PC serving this page.`);

    let sessionId;
    try {
      /*
       * Piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3. Riusa lo
       * stesso segnale di `window.__talosHarnessApiBase` (Fase 1) invece di
       * un secondo flag: se questa pagina gira su mobile ha già una base
       * assoluta piantata, il client non deve dichiararlo due volte in modo
       * diverso. Assente/vuota su desktop → `'desktop'`, il valore di
       * sempre — nessun comportamento nuovo lì.
       */
      const client = window.__talosHarnessApiBase ? 'mobile' : 'desktop';
      const data = await apiPost('/api/v1/sessions', { taskId: task.id, client });
      sessionId = data.sessionId;
    } catch (error) {
      if (generation !== state.realSession.generation) return;
      nascondiAttesaRisposta();
      appendStatusNote(`Avvio non riuscito: ${error.message}`, true);
      toast('Start failed', error.message);
      return;
    }
    if (generation !== state.realSession.generation) return;
    collegaEventiSessione(sessionId, generation);
    aggiornaElencoSessioniReali();
  }

  async function stopRealSession() {
    if (!state.realSession.id) { toast('No real session running'); return; }
    try {
      await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/stop`, {});
      toast('Stop requested', 'The session stops at the next turn.');
    } catch (error) {
      toast('Stop failed', error.message);
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
  async function forkSession() {
    if (!state.realSession.id) {
      toast('Fork created', 'A new branch of the conversation from this point.');
      return;
    }
    const idOrigine = state.realSession.id;
    const taskIdOrigine = state.realSession.taskId;
    try {
      const dati = await apiPost(`/api/v1/sessions/${encodeURIComponent(idOrigine)}/fork`, {});
      const generation = nuovaGenerazioneSessione();
      state.realSession.taskId = taskIdOrigine;
      state.session = `Real task · ${taskIdOrigine} (fork)`;
      mostraTitoloSessione(state.session);
      appendStatusNote(`Fork started from session ${idOrigine.slice(0, 8)}… — same folder, same history.`);
      collegaEventiSessione(dati.sessionId, generation);
      aggiornaElencoSessioniReali();
      toast('Fork created', 'A new branch of the conversation from this point.');
    } catch (error) {
      toast('Fork failed', error.message);
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
    if (!state.realSession.id) { toast('No real session to resume'); return; }
    const sessionId = state.realSession.id;
    const taskId = state.realSession.taskId;
    if (messaggioFollowUp) { appendUserFollowUp(messaggioFollowUp); state.realSession.followUpBubbleInAttesa = true; }
    try {
      await apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/resume`, messaggioFollowUp ? { messaggio: messaggioFollowUp } : {});
      // continua:true — STESSA vista: la conversazione resta a schermo, il
      // follow-up già mostrato (sopra) e la risposta che arriva bastano.
      const generation = nuovaGenerazioneSessione({ continua: true });
      state.realSession.taskId = taskId;
      mostraAttesaRisposta();
      collegaEventiSessione(sessionId, generation);
      aggiornaElencoSessioniReali();
      if (!messaggioFollowUp) toast('Session resumed', 'Un nuovo giro è iniziato sulla stessa conversazione.');
    } catch (error) {
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
      toast('Message not queued', error.message);
    }
  }

  /**
   * ⭐ "Compatta ora" reale quando c'è una sessione reale CONCLUSA attiva.
   * Non avvia nessun giro nuovo: sostituisce ciò che una PROSSIMA
   * resume/fork erediterebbe — la conversazione già mostrata non cambia.
   */
  async function compactSession() {
    if (!state.realSession.id) {
      toast('Context compacted', '18.7k -> 9.3k token equivalenti.');
      return;
    }
    try {
      const dati = await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/compact`, {});
      toast(
        dati.compattato ? 'Context compacted' : 'Compattazione saltata',
        dati.compattato
          ? 'The next resume or fork restarts from the summary.'
          : 'Il modello non ha risposto: la conversazione resta quella intera.',
      );
    } catch (error) {
      toast('Compaction failed', error.message);
    }
  }

  /**
   * ⭐⭐⭐ "Cronologia": passa a una sessione GIÀ esistente (viva o conclusa)
   * invece di avviarne una nuova. Non serve leggere la sua storia a parte:
   * aprire l'EventSource la riproduce da sola (iscriviti() nel registro
   * rimanda TUTTI gli eventi già accaduti a chi si collega).
   */
  function passaASessione(sessionId, taskId, nome) {
    /*
     * ⛔⛔⛔ 30/8, owner: "non riesco a vedere i messaggi di una sessione
     * già iniziata... estremamente macchinoso" — riprodotto due volte,
     * indipendentemente (owner e questa sessione), su una sessione che
     * il server conferma intatta. Il corto-circuito "stesso id, non fare
     * nulla" presumeva che un id già corrente implicasse contenuto già
     * a schermo — falso quando quell'id è rimasto "corrente" da un
     * tentativo PRECEDENTE che non ha mai renderizzato nulla di reale
     * (una connessione caduta prima del replay, o una generazione
     * superata da un secondo tentativo rapido, vedi generation-guard in
     * handleRealEvent): `#conversation` restava vuoto per sempre,
     * perché nessun nuovo tentativo di collegamento partiva più — lo
     * stesso id "già corrente" bloccava ogni riprova. La guardia ora
     * controlla anche COSA è realmente a schermo (almeno un figlio
     * renderizzato in `#conversation` — task/testo/gruppo tool-call,
     * qualunque cosa sia arrivata per prima), non solo l'id: se
     * `#conversation` è ancora vuoto, si ritenta il collegamento anche
     * a id invariato, invece di arrendersi in silenzio. Vedi ledger
     * §43, piano procedi-col-generare-un-snoopy-
     * neumann.md §14.2.1.
     */
    const contenutoGiaVisibile = sessionId === state.realSession.id && $('#conversation').children.length > 0;
    if (contenutoGiaVisibile) { setView('chat'); closePanels(); return; }
    const generation = nuovaGenerazioneSessione();
    state.realSession.taskId = taskId;
    state.session = nome || `Real task · ${taskId}`; // ⭐ un nome scelto dall'owner vince sul taskId
    mostraTitoloSessione(state.session);
    setView('chat');
    closePanels();
    collegaEventiSessione(sessionId, generation);
    aggiornaElencoSessioniReali();
  }

  /**
   * ⛔⛔⛔ 30/8, ledger §25/§31 — la causa profonda del secondo bug
   * dell'owner ("riapro una sessione storica e Files/Ambiente restano
   * sui dati mock"), riverificata dal vivo oggi (CDP, sessione
   * `933d97f7…`): il pannello Context mostrava ANCORA `talos` /
   * `feat/mobile-code` / `~/dev/talos` — lo stesso markup statico di
   * `index.html`, mai sostituito.
   *
   * La causa NON è `selectSession`/il click sulla sidebar interna
   * (`#sessionList` resta nascosto da CSS su mobile embedded, quel
   * percorso è morto qui) — è che riaprire una sessione dalla lista
   * NATIVA Vue (`HarnessSessionScreen.vue`, navigazione a
   * `/harness/<id>`) monta un `app.js` COMPLETAMENTE fresco, che non
   * ha mai saputo di quell'id: `passaASessione`/`collegaEventiSessione`
   * esistevano già, corretti, ma nessuno li chiamava per il caso
   * "questa pagina è nata già per una sessione esistente".
   *
   * `HarnessSessionScreen.vue` PIANTA l'id vero come
   * `data-harness-session-id` su `TalosMobileScreen` (un antenato di
   * `HOST()`, mai lo stesso nodo — verificato, `closest()` sale i
   * livelli intermedi normali del DOM chiaro, non attraversa uno shadow
   * boundary in salita perché non ce n'è uno fra i due). Un id assente
   * o `'new'` (sessione mai avviata, `isDraft` lato Vue) non fa niente
   * — resta lo stato onesto e vuoto di sempre.
   *
   * ⛔ NON una chiamata di rete incondizionata al boot — quella è stata
   * provata e SCARTATA il 26/8 (vedi il commento in fondo al file, i
   * due test `CODE-COMPOSER-DEMO-SEND-01`/`HARNESS-BOARD-MOBILE-
   * HONESTY-01` pretendono zero fetch per un mount SENZA questo
   * attributo — `mountStaticRuntime()` non lo pianta mai, quindi questa
   * funzione non li tocca). Qui il fetch parte SOLO quando il DOM
   * stesso dice "questa pagina è per una sessione precisa" — un segnale
   * reale, non un'abitudine.
   *
   * Se l'id non risulta fra le sessioni vere del server (una sessione
   * creata lato nativo ma mai avviata: nessun primo messaggio ancora
   * inviato), non fa niente di suo: è lo stesso caso già gestito da
   * `submitPrompt`/`state.pendingCustomSession`, non un errore.
   *
   * ⛔⛔⛔ 2/9 — SECONDO bug trovato riproducendo dal vivo il primo:
   * questa funzione partiva SOLO una volta, al boot (`riprendiSessioneDalHost()`
   * sotto, invariata — un test dedicato la chiama per nome, vedi
   * harnessUiRealSession.test.ts) — corretto per "l'app si apre già su
   * questa sessione", ma NON per "sono già dentro app.js e clicco
   * un'ALTRA riga della sidebar nativa" (HarnessSessionScreen.vue,
   * watch(sessionId)): quella chiama selectTalosHarnessUiSession di
   * nuovo, che rimonta SOLO l'hero di CARICAMENTO (via selectSession
   * sotto) — nessuno lo risolveva mai più, restava a girare per sempre.
   * Estratta qui perché ORA ha DUE chiamanti — il boot
   * (riprendiSessioneDalHost) e selectSession stessa — che per la
   * STESSA sessione (il caso boot: HarnessSessionScreen.vue chiama
   * SEMPRE selectTalosHarnessUiSession subito dopo aver montato lo
   * script) partirebbero in corsa, due fetch e potenzialmente due
   * EventSource per la stessa sessione. `caricaCronologiaInCorsoPer`
   * de-duplica per sessionId: il secondo chiamante con lo STESSO id si
   * unisce al primo invece di ripartire da capo; un id DIVERSO (il vero
   * caso "ho cliccato un'altra sessione") parte comunque.
   */
  /*
   * ⭐⭐⭐ 2/9 — owner dal vivo: "c'è troppo caricamento se clicco su
   * una, clicco su un'altra e ritorno su quelle precedenti... deve
   * essere veloce, rimane bloccato". Ricerca fatta (owner: "ad ogni
   * passo"): ogni chat seria tiene una cache client dei messaggi già
   * visti per un'apertura ISTANTANEA (GetStream.io, guide su offline
   * chat — fonti nel ledger). Prima d'ora, OGNI click — anche sulla
   * STESSA sessione già vista pochi secondi prima — rifaceva sia il
   * giro `GET /api/v1/sessions` sia una EventSource NUOVA che
   * rigiocava l'INTERO storico dal server: la parte lenta non era il
   * lookup, era riaprire e riascoltare tutto lo stream da capo.
   * `ripristinaDaCache` rigioca dagli eventi già ricevuti in questo
   * stesso avvio (accumulati da collegaEventiSessione man mano che
   * arrivano) attraverso lo STESSO handleRealEvent di sempre —
   * nessuna rete, nessuno spinner, la stessa identica resa.
   */
  function ripristinaDaCache(sessionId, taskIdFallback, nomeFallback) {
    const eventi = state.realSession.cronologiaCache.get(sessionId);
    if (!eventi || eventi.length === 0) return false;
    const generation = nuovaGenerazioneSessione();
    state.realSession.taskId = taskIdFallback;
    state.session = nomeFallback || `Real task · ${taskIdFallback}`;
    mostraTitoloSessione(state.session);
    setView('chat');
    closePanels();
    state.realSession.id = sessionId;
    for (const evento of eventi) handleRealEvent(evento, generation);
    // ⭐ 2/9 — NIENTE aggiornaElencoSessioniReali() qui (a differenza di passaASessione): è un'altra fetch di rete, e questo percorso esiste apposta per essere a ZERO fetch — l'elenco è già quello giusto, era già stato popolato la prima volta che questa sessione è stata caricata.
    return true;
  }

  async function caricaCronologiaSessione(sessionId, taskIdFallback, nomeFallback) {
    if (state.realSession.caricamentoInCorsoPer === sessionId) return;
    if (ripristinaDaCache(sessionId, taskIdFallback, nomeFallback)) return;
    state.realSession.caricamentoInCorsoPer = sessionId;
    try {
      /*
       * ⭐⭐⭐ 2/9 — owner: "non si accettano compromessi", ricerca fatta
       * (pattern chat offline-first: retry con backoff prima di
       * arrendersi — un fallimento appena dopo un riavvio del server
       * embedded è spesso solo "il processo Node non ha ancora finito
       * di avviarsi", non un guasto vero: misurato oggi, `ripristina()`
       * legge da disco OGNI sessione persistita prima che il server
       * inizi ad ascoltare, e con più sessioni può richiedere qualche
       * secondo). TRE tentativi (1s/2s/3s di attesa, ~6s di budget
       * retry) prima di arrendersi — non dieci: apiGet ha già il suo
       * tetto di tempo (12s per tentativo) — un retry senza limite
       * trasformerebbe "non disponibile subito" in "non disponibile
       * MAI, muto".
       */
      let elenco;
      let ultimoErrore;
      for (let tentativo = 1; tentativo <= 3; tentativo += 1) {
        if (state.realSession.caricamentoInCorsoPer !== sessionId) return; // superato nel frattempo, non vale nemmeno il prossimo tentativo
        try {
          elenco = (await apiGet('/api/v1/sessions')).items;
          ultimoErrore = null;
          break;
        } catch (errore) {
          ultimoErrore = errore;
          if (tentativo < 3) await new Promise((resolve) => window.setTimeout(resolve, tentativo * 1000));
        }
      }
      if (ultimoErrore) {
        // ⛔ stesso principio di aggiornaElencoSessioniReali: un fallimento qui non è un'azione richiesta, mai un toast — ma l'hero di CARICAMENTO lasciato da selectSession() non può restare lì per sempre, si aggiorna a "non disponibile".
        if (state.realSession.caricamentoInCorsoPer === sessionId) mostraCronologiaNonDisponibile(nomeFallback);
        return;
      }
      /*
       * ⭐⭐⭐ 2/9 — TERZA corsa, trovata dal vivo (owner): click su A,
       * poi su B PRIMA che il fetch di A sia tornato — de-dup sopra non
       * la vede (id DIVERSI, non blocca), ma se il fetch di A risponde
       * DOPO quello di B, il suo esito (magari "non trovata", per una
       * sessione vecchia) sovrascriveva il body appena riempito da B col
       * titolo/contenuto SBAGLIATO — riprodotto dal vivo: header
       * corretto (B), corpo di A. Il controllo qui e sotto (prima di
       * OGNI scrittura su #conversation) chiede "sono ancora io la
       * richiesta più recente?" — se un'altra è partita nel frattempo,
       * mi fermo senza toccare niente: ci pensa lei.
       */
      if (state.realSession.caricamentoInCorsoPer !== sessionId) return;
      const sessione = elenco.find((candidata) => candidata.sessionId === sessionId);
      /*
       * ⭐⭐⭐ 2/9 — prima: "non fare niente", lasciando l'hero di
       * CARICAMENTO (mostrato da selectSession poco sopra nella catena di
       * chiamate) bloccato per sempre, indistinguibile da "sta ancora
       * arrivando". Vedi il commento di mostraCronologiaNonDisponibile per
       * i due casi che questo ramo copre e perché il messaggio resta vero
       * per entrambi.
       */
      if (!sessione) { mostraCronologiaNonDisponibile(nomeFallback); return; }
      passaASessione(sessione.sessionId, sessione.taskId ?? taskIdFallback, sessione.nome ?? nomeFallback);
    } finally {
      if (state.realSession.caricamentoInCorsoPer === sessionId) state.realSession.caricamentoInCorsoPer = null;
    }
  }

  /** Boot: legge l'id piantato da HarnessSessionScreen.vue su un antenato di HOST() e, se c'è, avvia caricaCronologiaSessione. Vedi il commento sopra per perché resta un chiamante distinto da selectSession(), non solo un alias. */
  async function riprendiSessioneDalHost() {
    const antenato = HOST().closest?.('[data-harness-session-id]');
    const idDalHost = antenato?.dataset.harnessSessionId;
    if (!idDalHost || idDalHost === 'new') return;
    /*
     * ⭐⭐⭐ 2/9 — owner dal vivo, provando ESATTAMENTE "chiudi l'app e
     * riapri": il contenuto tornava (§53/§54 verificato), il TITOLO no
     * — l'header cadeva su "Real task · libero:0" (il segnaposto
     * interno di passaASessione). Causa: il server non traccia MAI un
     * `nome` per una sessione mai rinominata esplicitamente (torna
     * sempre `null` da GET /api/v1/sessions, comportamento corretto,
     * non un bug di persistenza) — il titolo vero vive SOLO lato
     * client, nel database locale nativo. selectSession() (il percorso
     * "clicco una sessione") lo riceve da HarnessSessionScreen.vue
     * tramite `selection.title`; QUESTA funzione (il percorso "l'app
     * si apre già su questa sessione") leggeva SOLO l'id dal DOM, mai
     * un titolo — passava sempre `null` come nomeFallback. Stesso
     * pattern già in uso per l'id: un secondo attributo sullo stesso
     * antenato (vedi HarnessSessionScreen.vue, data-harness-session-title).
     */
    const titoloDalHost = antenato?.dataset.harnessSessionTitle || null;
    await caricaCronologiaSessione(idDalHost, null, titoloDalHost);
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
   * stesso principio già in uso per renderCampaignRuns/Board), pronta a
   * comparire appena il ponte verso la sidebar nativa Vue esisterà.
   */
  async function aggiornaElencoSessioniReali() {
    const contenitore = contenitoreSessioniReali();
    let elenco;
    try {
      elenco = (await apiGet('/api/v1/sessions')).items;
    } catch {
      return; // ⛔ un aggiornamento sidebar fallito non è un'azione richiesta, non merita un toast
    }
    /*
     * ⭐ 27/8, trovato analizzando quali badge non si spengono MAI: questa
     * funzione aggiungeva sessioni vere in un blocco separato senza mai
     * nascondere il badge del pannello INTERO (`data-demo-surface="sessions"`
     * su #sessionsPanel) — "Demo UI · not connected" restava scritto sopra
     * sessioni realmente in corso. Le voci demo statiche restano sotto per
     * riferimento (non è quello il bug), ma l'etichetta in cima deve
     * smettere di mentire appena ne esiste almeno una vera.
     */
    if (elenco.length > 0) {
      const demoBadge = $('.demo-surface-badge', $('#sessionsPanel'));
      if (demoBadge) demoBadge.hidden = true;
    }
    if (elenco.length === 0) { contenitore.replaceChildren(); return; }

    const pezzi = [textElement('div', 'list-heading', 'Real sessions')];
    for (const sessione of elenco) {
      const button = document.createElement('button');
      button.className = `session-item real-session-item${sessione.sessionId === state.realSession.id ? ' active' : ''}`;
      button.dataset.realSessionId = sessione.sessionId;
      const main = document.createElement('span');
      main.className = 'session-main';
      const etichetta = sessione.nome || sessione.taskId; // ⭐ un nome scelto dall'owner vince sempre sul taskId
      main.append(
        textElement('strong', '', sessione.forkDa ? `${etichetta} · fork` : etichetta),
        textElement('small', '', sessione.conclusa ? 'concluso' : 'in corso · live'),
      );
      const meta = document.createElement('span');
      meta.className = 'session-meta';
      meta.textContent = formattaOraSessione(sessione.avviataAlle);
      button.append(main, meta);
      button.addEventListener('click', () => passaASessione(sessione.sessionId, sessione.taskId, sessione.nome));
      pezzi.push(button);
    }
    contenitore.replaceChildren(...pezzi);
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
   * di task predefiniti come primo schermo. L'elenco task del corpus
   * (storia/progetti) e' un concetto interno del banco interno (misurare
   * sempre lo stesso compito, per confrontare harness): resta uno
   * strumento reale, ma secondario, sotto il compito libero, mai il default.
   */
  async function openRealTaskSheet() {
    sheetEyebrow.textContent = 'New session';
    sheetTitle.textContent = 'Cosa deve fare TALOS?';
    sheetBody.replaceChildren(textElement('p', 'board-empty', 'Carico l’elenco dal server…'));
    const demoBadge = $('.demo-surface-badge', sheetDialog);
    if (demoBadge) demoBadge.hidden = true;
    showEmbeddedDialog(sheetDialog);

    /*
     * ⭐⭐⭐ 28/8 — permesso "Full access" (pillola del composer, foglio
     * "Permessi"): un percorso ASSOLUTO A PIACERE, mai l'allowlist —
     * l'elenco progetti non serve nemmeno, si salta la chiamata
     * (stessa disciplina "mai una richiesta che non serve" già in uso
     * altrove in questo file). Il server valida DAVVERO il percorso
     * (esiste? è una cartella? leggibile/scrivibile? — custom-task.mjs,
     * niente denylist, vedi la sua doc su REGOLA ZERO/Hermes): un
     * percorso inventato qui torna un errore onesto dalla POST, non un
     * crash silenzioso.
     *
     * ⭐ 29/8 — `tasks` (il corpus del banco interno, sezione SECONDARIA sotto)
     * si scarica SEMPRE, in entrambe le modalità: la scelta Full access
     * riguarda solo come si sceglie la cartella per il compito libero,
     * non se il corpus resta disponibile — vedi la sua doc più sotto.
     */
    const accessoCompleto = state.permissions === 'Full access';
    let tasks;
    let progetti = [];
    let cartelleFrequenti = [];
    if (!accessoCompleto) {
      try {
        [tasks, progetti] = await Promise.all([
          apiGet('/api/v1/tasks').then((r) => r.items),
          apiGet('/api/v1/projects').then((r) => r.items).catch(() => []), // ⛔ un elenco vuoto/non raggiungibile non deve bloccare i task del corpus
        ]);
      } catch (error) {
        sheetBody.replaceChildren(textElement('p', 'board-empty', `List not available: ${error.message}`));
        return;
      }
    } else {
      /*
       * ⭐⭐⭐ 28/8 — owner, coda: "directory più usate (tipo desktop
       * downloads)". Solo SUGGERIMENTI per il campo percorso — un
       * fallimento qui non deve MAI bloccare "New session" (a
       * differenza di /projects sopra, che è l'unico modo di scegliere
       * una cartella quando NON si è in Full access): resta solo il
       * campo di testo vuoto, come oggi.
       */
      try {
        [tasks, cartelleFrequenti] = await Promise.all([
          apiGet('/api/v1/tasks').then((r) => r.items),
          apiGet('/api/v1/frequent-dirs').then((r) => r.items).catch(() => []), // best effort, vedi sopra
        ]);
      } catch (error) {
        sheetBody.replaceChildren(textElement('p', 'board-empty', `List not available: ${error.message}`));
        return;
      }
    }

    const corpoFoglio = [];

    // --- PRIMARIA: cartella+modello, come Claude Code/Codex/Cline/Aider/Devin — il compito si scrive DOPO, nel composer normale. ---
    const customSection = document.createElement('form');
    customSection.className = 'sheet-section';
    customSection.id = 'customTaskForm';
    // ⭐ 29/8 — unione, non scelta: il redesign 'Full access' del canonico
    // (percorso libero + scorciatoie cartelle frequenti) rimpiazzava per
    // intero il vecchio select+allowlist — su questa copia il select resta
    // per la modalità normale, il percorso libero si aggiunge SOLO in
    // Full access, mai l'uno al posto dell'altro.
    let selectCartella = null;
    let inputCartellaLibera = null;
    if (accessoCompleto) {
      customSection.appendChild(textElement('span', 'sheet-label', 'Folder — any absolute path ("Full access")'));
      inputCartellaLibera = document.createElement('input');
      inputCartellaLibera.type = 'text';
      inputCartellaLibera.className = 'sheet-input';
      inputCartellaLibera.id = 'customTaskCartellaLibera';
      inputCartellaLibera.placeholder = 'es. C:\\Users\\...\\progetto';
      inputCartellaLibera.autocomplete = 'off';
      inputCartellaLibera.spellcheck = false;
      customSection.appendChild(inputCartellaLibera);
      /*
       * ⭐⭐⭐ 28/8 — le scorciatoie vere e proprie: un bottone per cartella
       * frequente TROVATA sul disco (mai una candidata a occhio, vedi
       * frequent-dirs.mjs), che riempie il campo — non lo sottomette da
       * solo, l'owner resta libero di modificarlo prima di continuare.
       */
      if (cartelleFrequenti.length > 0) {
        const scorciatoie = document.createElement('div');
        scorciatoie.className = 'sheet-shortcuts';
        for (const { etichetta, percorso } of cartelleFrequenti) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'sheet-shortcut-chip';
          chip.textContent = etichetta;
          chip.title = percorso;
          chip.addEventListener('click', () => { inputCartellaLibera.value = percorso; inputCartellaLibera.focus(); });
          scorciatoie.appendChild(chip);
        }
        customSection.appendChild(scorciatoie);
      }
    } else {
      customSection.appendChild(textElement('span', 'sheet-label', 'Folder — TALOS writes THERE directly, no copies'));
      if (progetti.length === 0) {
        customSection.appendChild(textElement('p', 'board-empty', 'No project folder is configured on the server. Set TALOS_HARNESS_UI_PROJECT_DIRS to the allowed absolute paths and restart the server to use a free task.'));
      } else {
        selectCartella = document.createElement('select');
        selectCartella.className = 'sheet-input';
        selectCartella.id = 'customTaskCartella';
        for (const progetto of progetti) {
          const opzione = document.createElement('option');
          opzione.value = progetto.id;
          opzione.textContent = progetto.nome;
          selectCartella.appendChild(opzione);
        }
      }
    }
    if (selectCartella || inputCartellaLibera) {
      const modelPicker = creaModelPicker({ valoreIniziale: state.model || '' });
      const effortPicker = creaEffortPicker({ valoreIniziale: state.effort });
      customSection.append(
        ...(selectCartella ? [selectCartella] : []),
        textElement('span', 'sheet-label', 'Model'),
        modelPicker.elemento,
        effortPicker.elemento,
      );
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'primary-btn compact full';
      submit.textContent = 'Continue in the chat';
      customSection.appendChild(submit);
      customSection.addEventListener('submit', (event) => {
        event.preventDefault();
        const modello = modelPicker.getValore();
        const effort = effortPicker.getValore();
        if (inputCartellaLibera) {
          const percorso = inputCartellaLibera.value.trim();
          if (!percorso) { inputCartellaLibera.focus(); return; }
          closeEmbeddedDialog(sheetDialog);
          avviaSessionePendente({ cartellaLibera: percorso, nomeCartella: percorso, modello, effort, permessi: state.permissions });
          return;
        }
        const cartellaId = selectCartella.value;
        const nomeCartella = progetti.find((p) => p.id === cartellaId)?.nome ?? cartellaId;
        closeEmbeddedDialog(sheetDialog);
        avviaSessionePendente({ cartellaId, nomeCartella, modello, effort, permessi: state.permissions });
      });
    }
    corpoFoglio.push(customSection);

    // --- SECONDARIA: i task del corpus del banco interno, per confrontare l'harness a parità di compito. ---
    const section = document.createElement('div');
    section.className = 'sheet-section';
    section.appendChild(textElement('span', 'sheet-label', `Or try a benchmark task (${tasks.length}, real checkout and run)`));
    for (const task of tasks) {
      const button = document.createElement('button');
      button.className = 'sheet-option';
      button.dataset.startTask = task.id;
      const iconWrap = document.createElement('span');
      iconWrap.className = 'sheet-icon';
      iconWrap.innerHTML = icon('i-play');
      const textWrap = document.createElement('span');
      textWrap.append(textElement('strong', '', task.id), textElement('small', '', task.consegnaCorta));
      button.append(iconWrap, textWrap, textElement('span', '', `difficulty ${task.difficolta}`));
      button.addEventListener('click', () => { closeEmbeddedDialog(sheetDialog); startRealSession(task); });
      section.appendChild(button);
    }
    corpoFoglio.push(section);

    sheetBody.replaceChildren(...corpoFoglio);
    /*
     * ⛔ 27/8, trovato dalla pipeline QA visiva: l'attributo HTML `autofocus`
     * non scatta da solo perché il <dialog> è già aperto quando il form
     * viene inserito (showEmbeddedDialog gira PRIMA del fetch) — il
     * browser aveva già messo il focus sul bottone di chiusura, il primo
     * elemento focusable nel markup del foglio. Un focus esplicito dopo
     * l'inserimento nel DOM è l'unico modo affidabile.
     */
    ($('#customTaskCartellaLibera') ?? $('#customTaskCartella'))?.focus();
  }

  /*
   * ⛔⛔⛔ 29/8 — BUG REALE trovato SUL DISPOSITIVO (owner: "non provare e
   * verificare visivamente è una violazione delle regole vincolanti"),
   * non ipotizzato: il messaggio semplice falliva SEMPRE con "Avvio non
   * riuscito: Query non valida", riprodotto due volte identico. Causa
   * risalita alla fonte (`http-app.mjs`, non presunta): `POST
   * /api/v1/sessions` valida oggi con `requireTaskIdBody` (allowlist
   * `taskId, modello, reasoning, client, permessi, permessiPerAttrezzo`,
   * `taskId` OBBLIGATORIO) — `requireMessaggioBody`, il contratto che
   * QUESTA funzione presupponeva (commit `261008f4`, 28/8, "procedi in
   * ordine" punto 3, verificato allora sul Pad), **non esiste più
   * nel sorgente server, in nessun punto** (grep su tutto `http-app.mjs`,
   * zero corrispondenze). Il backend è di AVM-harness-desktop — non è
   * mia ownership rimetterlo indietro, è mia ownership far parlare il
   * client il contratto che il server ha DAVVERO oggi.
   *
   * Il rimpiazzo NON è inventato: `avviaSessioneImplicitaSeUnaSolaCartella`
   * (bundle desktop, mai portato su mobile prima d'ora) risolve esattamente
   * questo — "un messaggio senza aver scelto una cartella" — chiedendo al
   * server quali cartelle progetto sono configurate (`/api/v1/projects`,
   * l'allowlist server-side) e, se ce n'è esattamente UNA, avviando lì un
   * compito libero via `/api/v1/sessions/custom` ({cartellaId, consegna},
   * il contratto vero e tuttora esistente — verificato alla fonte, stesso
   * file). Con zero o più di una cartella configurata: stato onesto,
   * mai un tentativo destinato a fallire con lo stesso errore.
   */
  function titoloDalPrimoMessaggio(testo) {
    return String(testo || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function avviaSessionePendente({ cartellaId, cartellaLibera, nomeCartella, modello, effort, permessi }) {
    nuovaGenerazioneSessione();
    state.pendingCustomSession = { cartellaId, cartellaLibera, nomeCartella, modello, effort, permessi };
    if (modello) { state.model = modello; aggiornaPillolaModello(); }
    if (effort) state.effort = effort;
    state.session = `New · ${nomeCartella}`;
    mostraTitoloOvunque(state.session);
    setView('chat');
    closePanels();
    // ⛔ nuovaGenerazioneSessione() ha appena svuotato #conversation (replaceChildren) — l'empty-state originale non esiste più nel DOM, va ricreato, non cercato.
    $('#conversation').appendChild(costruisciConversationHero(`Session ready on ${nomeCartella}.`, 'Scrivi qui sotto cosa deve fare TALOS per iniziare.'));
    window.setTimeout(() => composerInput.focus(), 0);
  }

  /**
   * ⭐⭐⭐ 27/8 — la gemella di `startRealSession`, per un compito LIBERO
   * (Opzione B del piano, ora aperta con un'allowlist esplicita): stesso
   * schema (stato, appendRealTaskStart riusata con un task sintetico,
   * collegaEventiSessione), corpo POST diverso (/sessions/custom con
   * cartellaId+consegna invece di /sessions con taskId).
   */
  async function startCustomSession({ cartellaId, cartellaLibera, nomeCartella, consegna, comandoProva, modello, effort, permessi, modelloEsecutore }) {
    const generation = nuovaGenerazioneSessione();
    const taskSintetico = { id: `libero:${nomeCartella}`, consegna };
    state.realSession.taskId = taskSintetico.id;
    state.session = `Free task · ${nomeCartella}`;
    mostraTitoloOvunque(state.session);
    setView('chat');
    closePanels();
    appendRealTaskStart(taskSintetico);
    mostraAttesaRisposta();
    toast('Avvio in corso', `${nomeCartella} · runs directly on the real folder, no copy.`);

    let sessionId;
    try {
      const client = window.__talosHarnessApiBase ? 'mobile' : 'desktop';
      // ⭐⭐⭐ 28/8 — cartellaId XOR cartellaLibera (permesso "Full access"): mai entrambi, il server li rifiuterebbe insieme (custom-task.mjs, mutua esclusività).
      const corpo = cartellaLibera ? { cartellaLibera, consegna, client } : { cartellaId, consegna, client };
      if (comandoProva) corpo.comandoProva = comandoProva;
      const modelloEffettivo = modello || state.model;
      if (modelloEffettivo) corpo.modello = modelloEffettivo;
      /*
       * ⭐⭐⭐ 2/9 — picker Planner (piano §15.6, K): l'esecutore economico
       * dei giri di routine, `talosLavora` è già pronto a riceverlo
       * (6.1, `modelloEsecutore`) — mancava solo questo filo. Nessun
       * fallback su `state.*`: a differenza di modello/effort/permessi
       * non esiste una preferenza di sessione già impostata altrove;
       * assente vuol dire "Automatico", esattamente come il kernel già
       * intende `modelloEsecutore` non impostato (vedi
       * session-registry.mjs, avviaESegui).
       */
      if (modelloEsecutore) corpo.modelloEsecutore = modelloEsecutore;
      // ⭐ 28/8 — stesso principio del modello: la scelta esplicita dell'effort picker ha priorità, altrimenti quella già impostata sulla sessione (pillola/foglio); assente se l'owner non ha mai toccato lo slider.
      const effortEffettivo = effort || state.effort;
      if (effortEffettivo) corpo.reasoning = { effort: effortEffettivo };
      // ⭐⭐⭐ 28/8 — la pillola permessi: la scelta fatta nella modale ha priorità, altrimenti quella corrente del composer (state.permissions, sempre valorizzata — default "Workspace write").
      corpo.permessi = permessi || state.permissions;
      /*
       * ⭐⭐⭐ 2/9 — owner dal vivo: "clicco su una sessione appena creata
       * e i messaggi non ci sono". Causa: HarnessSessionScreen.vue
       * assegna un id NATIVO (newTalosMobileId()) a una sessione nuova
       * PRIMA di questo POST — mai mandato al server finora, che ne
       * generava uno tutto suo (randomUUID). Un rimontaggio futuro
       * rilegge `data-harness-session-id` (quello nativo) e non trova
       * mai la conversazione (che il server conosce sotto l'ALTRO id).
       * Se il DOM lo espone (mai 'new': quello è il draft senza id
       * ancora, gestito altrove), lo mandiamo — il server lo userà come
       * sessionId vero invece di generarne uno indipendente (vedi
       * requireCustomTaskBody/avviaLibero, stesso principio del pattern
       * "client-supplied resource id" — ricerca fatta prima di questa
       * riga). Sicuro anche se questa sessione non è nuova per davvero:
       * si arriva qui SOLO quando state.realSession.id è ancora nullo
       * (submitPrompt lo intercetta prima altrimenti), quindi non è mai
       * l'id di una sessione già in corso.
       */
      const idNativoInAttesa = HOST().closest?.('[data-harness-session-id]')?.dataset.harnessSessionId;
      if (idNativoInAttesa && idNativoInAttesa !== 'new') corpo.sessionId = idNativoInAttesa;
      const data = await apiPost('/api/v1/sessions/custom', corpo);
      sessionId = data.sessionId;
    } catch (error) {
      if (generation !== state.realSession.generation) return;
      nascondiAttesaRisposta();
      appendStatusNote(`Avvio non riuscito: ${error.message}`, true);
      toast('Start failed', error.message);
      state.session = 'No session';
      mostraTitoloOvunque(state.session);
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
     * "Free task · <cartella>" di sempre, mai un crash, mai un toast
     * per qualcosa che l'owner non ha nemmeno chiesto esplicitamente in
     * quel momento.
     */
    const titoloAutomatico = titoloDalPrimoMessaggio(consegna);
    apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/rename`, { nome: titoloAutomatico }).then(() => {
      // ⛔ la generazione può essere già cambiata (un'altra sessione avviata nel frattempo) — mai scrivere il titolo di una sessione che non è più quella a schermo.
      if (generation !== state.realSession.generation) return;
      state.session = titoloAutomatico;
      mostraTitoloOvunque(state.session);
      aggiornaElencoSessioniReali();
    }).catch(() => { /* best effort, vedi sopra: resta il titolo di sempre */ });
  }

  async function startRealSessionFromMessage(text, modello, modelloEsecutore) {
    let progetti;
    try {
      progetti = await apiGet('/api/v1/projects').then((r) => r.items);
    } catch {
      progetti = [];
    }
    if (progetti.length !== 1) {
      // ⛔ nessun tentativo su /api/v1/sessions/custom: senza esattamente una cartella non c'è un cartellaId da mandare, il server lo rifiuterebbe comunque — stato onesto SUBITO, non un secondo giro per lo stesso esito.
      appendStatusNote(progetti.length === 0
        ? 'No project folder configured on the server — set TALOS_HARNESS_UI_PROJECT_DIRS and restart.'
        : `${progetti.length} project folders configured: I cannot guess which one to use for a message with no explicit folder.`, true);
      toast('No session started', 'The server does not have a single project folder.');
      return;
    }
    const [{ id: cartellaId, nome: nomeCartella }] = progetti;
    await startCustomSession({ cartellaId, nomeCartella, consegna: text, modello, modelloEsecutore });
  }

  /**
   * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — `modello` (opzionale): passato
   * fin qui da `HarnessSessionScreen.vue` via `harnessUiBridge.ts`. Mai
   * usato dal ramo `!`/coda — solo `startRealSessionFromMessage` lo
   * legge, l'unico punto che parla col server.
   *
   * ⭐⭐⭐ 2/9 — `modelloEsecutore` (opzionale, terzo argomento): stessa
   * provenienza e stessa unica lettura di `modello`, un giro più in là
   * (picker Planner, piano §15.6 K). Assente in ogni altro ramo
   * (coda/resume/modale "Nuova") per lo stesso motivo di `modello`
   * prima di oggi — quei rami non passano da qui.
   */
  function submitPrompt(text, modello, modelloEsecutore) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (value.startsWith('!')) {
      const hidden = value.startsWith('!!');
      const comando = value.replace(/^!!?/, '').trim();
      setView('terminal');
      if (!comando) { toast('Empty command', 'Scrivi qualcosa dopo "!".'); return true; }
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
     * essere rifiutato. Sostituisce anche il vecchio interruttore
     * `queueMode` (7321a662, 27/8): quel toggle fingeva un accodamento
     * SOLO lato client, mai consegnato — ora ogni messaggio scritto
     * durante un run si accoda DAVVERO da solo, senza bisogno di
     * attivare niente (vedi setQueueMode più sopra).
     */
    if (state.realSession.id && !state.realSession.eventoTerminaleVisto) {
      accodaMessaggioReale(value);
      return true;
    }
    /*
     * ⛔ 29/8 (3626c9bd) — una sessione CONCLUSA è un'altra cosa dalla coda
     * sopra: resumeSession(testo) fa esattamente ciò che una conversazione
     * normale richiede — appende il messaggio a messaggiFinali e riparte,
     * STESSO sessionId (session-registry.mjs resume(), esteso apposta).
     * Prima di questo fix ANCHE una sessione conclusa veniva rifiutata: il
     * composer diventava inutilizzabile dopo la primissima risposta, ogni
     * volta.
     */
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
      const { cartellaId, cartellaLibera, nomeCartella, modello, effort, permessi } = state.pendingCustomSession;
      state.pendingCustomSession = null;
      startCustomSession({ cartellaId, cartellaLibera, nomeCartella, consegna: value, modello, effort, permessi });
      return true;
    }
    /*
     * ⭐⭐⭐ 28/8, owner: "la sessione non parte quando scrivo semplicemente
     * dal composer, devo per forza premere nuova sessione" — quando esiste
     * UNA SOLA cartella di progetto configurata (il caso comune oggi, vedi
     * TALOS_HARNESS_UI_PROJECT_DIRS), non c'è nessuna scelta reale da fare:
     * un vero terminale (claude/codex/aider lanciati da una cartella) non
     * chiede MAI "quale cartella?" quando ce n'è una sola — lo stesso
     * principio competitivo già citato sopra, applicato al caso non
     * ambiguo. Con PIÙ cartelle l'ambiguità resta vera: fallback identico
     * a prima, serve "Nuova". `startRealSessionFromMessage` (sotto, non
     * rimossa: 5+ test la chiamano DIRETTAMENTE via runtime()) resta
     * l'implementazione — stesso comportamento di
     * avviaSessioneImplicitaSeUnaSolaCartella del canonico, messaggi di
     * stato più dettagliati (0 vs più cartelle), zero chiamate di rete al
     * mount (async, in risposta all'azione dell'utente).
     */
    startRealSessionFromMessage(value, modello, modelloEsecutore);
    return true;
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
    /*
     * ⭐⭐⭐ 2/9 — export_report (piano §14.3/§15.6, R5): il comando
     * slash `/export` (mobileSlashCommands.ts: export_report → '/export')
     * ricadeva qui sotto sul toast 'Export demo' — ma exportSession()
     * ESISTE già, poche righe sotto in questo stesso file, ed è già
     * onesta (sessione reale → apre il foglio 'export' vero; bozza →
     * un fallback dichiaratamente demo). Stessa forma delle tre
     * eccezioni sopra: un'azione con una funzione vera dietro non deve
     * passare dalla tabella dei toast fissi.
     */
    if (action === 'export_report') {
      void exportSession();
      return true;
    }
    const copy = {
      attach: ['Allegato demo', 'The picker is local UI and does not load real files.'],
      photo: ['Fotocamera demo', 'No photo was captured.'],
      photos: ['Galleria demo', 'No image was imported.'],
      browse: ['Browse demo', 'The state stays local to this Codice session.'],
      enhance: ['Miglioramento demo', 'No model was called.'],
      'enhance-blocked': ['Miglioramento non collegato', 'This surface stays local.'],
      /*
       * ⭐⭐⭐ 2/9 — chiude una riga della tabella mockup (piano §14.3):
       * HarnessSessionScreen.vue chiama DAVVERO caricaModelliCodice()
       * (il catalogo vero, per provider configurato) PRIMA di annunciare
       * questa azione — il toast ora descrive un fatto avvenuto, non
       * un'intenzione. Vedi refreshCodeModels() nel file Vue.
       * ⛔ 'refresh-models-failed' è il gemello onesto: senza di lui, un
       * fallimento di rete avrebbe comunque mostrato "Models refreshed"
       * (caricaModelliCodice() inghiotte l'errore per non rompere la
       * sessione) — lo stesso difetto di fondo che questa riga chiude,
       * spostato di un livello invece di sparire.
       */
      'refresh-models': ['Models refreshed', 'List reloaded from the configured providers.'],
      'refresh-models-failed': ['Refresh failed', 'Provider non raggiungibile: elenco invariato.'],
      'browser-url': ['Browser demo', 'No external navigation happened.'],
      attach_file: ['Allegato demo', 'The picker is local UI and does not load real files.'],
      // ⭐ 2/9 — export_report ora è una delle eccezioni sopra
      // (exportSession() vera), rimossa da qui: una voce che non può
      // più essere raggiunta è confusione, non documentazione.
    };
    const feedback = copy[action] || ['Demo UI · not connected', 'Azione locale registrata senza backend.'];
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
   * dal corpus). Il backend sa far partire SOLO un task del corpus
   * (talosLavora vuole una `cartella` e una `consegna` note, non un
   * prompt libero — piano `elegant-spinning-dongarra.md` §1.5, Opzione B
   * esplicitamente fuori fase), quindi mostrare qui il reset da chat
   * vuota sarebbe demo, non realtà.
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
    state.session = 'New session';
    mostraTitoloSessione(state.session);
    $$('.session-item').forEach((item) => item.classList.remove('active'));
    setView('chat');
    closePanels();
    toast('New session', 'The session is created on the first message.');
    composerInput.focus();
  }

  /*
   * ⛔⛔⛔ 29/8 — BUG REALE trovato SUL DISPOSITIVO (owner: "nella schermata
   * principale c'è ancora tutto il component mockup"), non da una grep.
   * Prima: `if (!item) return false` usciva SUBITO quando l'id selezionato
   * non corrispondeva a NESSUNA delle 5 righe statiche `.session-item`
   * del mockup (`refactor-auth-flow`/`audit-api-permissions`/...) — cioè
   * SEMPRE, per costruzione, per ogni sessione mobile vera (un UUID reale
   * non può mai comparire in un elenco scritto a mano nell'HTML statico).
   * `state.session`/il titolo NON venivano mai aggiornati: la sessione
   * demo "Refactor auth flow" (prima riga statica) restava a schermo per
   * sempre, con tutto il suo contenuto (Plan/Attività/Topology) — non un
   * fallback innocuo, l'INTERO mockup mai sostituito. Il chiamante
   * (`harnessUiBridge.ts`, selectTalosHarnessUiSession) aveva un secondo
   * difetto gemello che nascondeva il primo: ignorava il valore di
   * ritorno di questa funzione e restituiva sempre `true` — quindi
   * nessun codice a monte vedeva MAI il fallimento, niente errore,
   * niente nuovo tentativo, silenzio totale. Corretti insieme, nello
   * stesso commit.
   *
   * Cura: la corrispondenza `.session-item` resta un BONUS (evidenzia la
   * riga giusta nel mockup del sidebar, se per caso combacia — mobile ha
   * il proprio sidebar nativo e nasconde questo, ma desktop no: nessuna
   * regressione lì). Il titolo si aggiorna SEMPRE che id+title siano
   * stringhe valide — la vera condizione di successo, non "esiste anche
   * una riga statica che lo mostri".
   */
  function selectSession(selection) {
    if (!selection || typeof selection.id !== 'string' || typeof selection.title !== 'string') return false;
    // ⭐ 29/8, ledger §24 (cherry-pick 80295fa5) — le sessioni demo statiche (dataset.sessionId) non esistono più: le uniche voci reali della sidebar hanno dataset.realSessionId (aggiornaElencoSessioniReali). Senza questa riga la ricerca non trovava MAI una sessione reale, nemmeno su desktop dove la sidebar è visibile.
    const item = $$('.session-item').find((candidate) => candidate.dataset.sessionId === selection.id || candidate.dataset.realSessionId === selection.id);
    if (item) {
      $$('.session-item').forEach((other) => other.classList.remove('active'));
      item.classList.add('active');
    }
    /*
     * ⛔⛔⛔ 2/9 — SETTIMA causa dello stesso bug (§14.2.1), trovata SOLO
     * riproducendo dal vivo un secondo click dopo un riavvio: questo
     * blocco viveva DENTRO `else { }` (solo se `item` era assente) —
     * ma `item` combacia anche con `dataset.realSessionId`
     * (aggiornaElencoSessioniReali popola quell'attributo per OGNI
     * sessione reale già vista in questo avvio, riga ~5534 — non solo
     * per righe demo statiche, che "non esistono più" per il commento
     * qui sopra). Appena una sessione era già stata caricata UNA volta
     * in questo avvio, `item` combaciava per lei e per ogni sessione
     * successiva con lo STESSO meccanismo — saltando l'intero
     * ricaricamento: header/sidebar si aggiornavano (sotto, fuori da
     * questo blocco), il CORPO restava quello di prima, invariato.
     * `item` resta un bonus di EVIDENZIAZIONE (sopra), mai un motivo
     * per saltare il ricaricamento — ora gira SEMPRE.
     */
    {
      /*
       * ⛔⛔⛔ 29/8 — owner dal vivo: "nella schermata principale c'è ancora
       * tutto il component mockup... deve mostrare il logo, la scritta
       * Talos, il messaggio di benvenuto, puoi usare esattamente lo stesso
       * component [della chat]". Un id senza riga statica corrispondente è
       * SEMPRE una sessione mobile vera (mai una delle 5 demo) — il
       * Mission/Plan/Attività statico del mockup non è mai stato reale per
       * lei, nemmeno un istante: non aspettare una StateDelta per
       * accorgersene, sostituirlo SUBITO qui è l'unico punto che sa già,
       * in questo stesso giro, che non c'è nessun dato vero da mostrare.
       * `renderRealReviewList()`/`aggiornaSommarioReviewReale()` restano
       * invariate: puliscono SOLO la scheda Review, mai questa.
       */
      const conversation = $('#conversation');
      // ⭐⭐⭐ 2/9 — stato di CARICAMENTO onesto, non "vuota": vedi il commento di costruisciConversationHeroCaricamento più sopra nel file.
      if (conversation) conversation.replaceChildren(costruisciConversationHeroCaricamento(selection.title));
      /*
       * ⭐⭐⭐ 2/9 — SOLO chi mostra l'hero di caricamento sa anche
       * quando è ora di risolverlo: prima questa funzione (chiamata dal
       * bridge nativo a OGNI cambio sessione, non solo al boot) si
       * fermava qui, contando su riprendiSessioneDalHost() — che parte
       * UNA sola volta, al boot — per la risoluzione vera. Cliccare una
       * SECONDA sessione mentre questa pagina è già montata mostrava lo
       * stesso hero e non lo risolveva mai più. Non await (selectSession
       * deve tornare true/false SUBITO al bridge, sincrona per
       * contratto) — caricaCronologiaSessione aggiorna il DOM da sola
       * quando risolve.
       */
      void caricaCronologiaSessione(selection.id, null, selection.title);
      /*
       * ⭐ 29/8 — ledger §10: stessa correzione, un livello più su. Senza
       * questa riga la striscia "Running 01:42" del mockup restava
       * appesa (default `running:true` del modulo, mai un giro vero dietro
       * per QUESTA sessione appena selezionata) sopra un corpo che, giusto
       * qui sopra, diventa onestamente vuoto — le due metà si
       * contraddicevano. Non sappiamo ANCORA se questa sessione ha un giro
       * vero in corso (nessun resume/riconnessione allo stream esiste
       * ancora, gap dichiarato in FASE 1 desktop): il default onesto è
       * "fermo", non "in esecuzione" — un RunStarted reale (stesso array di
       * eventi, handleRealEvent) lo correggerà se sbagliato.
       */
      setRunState(false);
    }
    state.session = selection.title;
    mostraTitoloOvunque(state.session);
    if (item) {
      const itemTitle = $('.session-main strong', item);
      if (itemTitle) itemTitle.textContent = state.session;
    }
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
    toast('Session exported', 'JSON pronto.');
  }

  async function shareSession() {
    const text = `TALOS · ${state.session} · feat/mobile-code`;
    try {
      if (navigator.share) await navigator.share({ title: state.session, text });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); toast('Snapshot copiato', 'Pronto da condividere.'); }
      else toast('Snapshot pronto', text);
    } catch (error) {
      if (error?.name !== 'AbortError') toast('Sharing not available', text);
    }
  }

  function announceVoiceUnavailable() {
    toast('Demo voice not connected', 'The microphone does not record or send audio on this surface.');
  }

  function visibleCommandButtons() {
    return $$('#commandResults button[data-command]').filter((button) => !button.hidden);
  }

  function setActiveCommand(button) {
    $$('#commandResults button[data-command]').forEach((item) => item.classList.toggle('command-active', item === button));
    button?.scrollIntoView({ block: 'nearest' });
  }

  function openCommandPalette() {
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
       * ⛔⛔⛔ 27/8 (33d4bbbe) — 'fork' mostrava sempre lo stesso toast finto
       * ("Fork created"), ANCHE con una sessione reale in corso, invece di
       * chiamare `forkSession()` (già scritta, già cablata sul bottone
       * "Fork questa sessione" altrove) — ricade da sola sullo stesso toast
       * finto quando non c'è una sessione reale, zero duplicazione qui.
       */
      case 'fork': forkSession(); break;
      /*
       * ⛔ 28/8, ledger Fase 1/resume-compact §3.A: 'compact' mostrava un
       * toast con un numero FISSO ("18.7k -> 9.3k"), sempre lo stesso,
       * qualunque fosse la conversazione vera — compactSession() (sotto)
       * esiste già, chiama il vero endpoint POST .../compact, e mostra il
       * suo stesso toast (con l'esito reale, righe 1817-1823) ma non era
       * mai chiamata da qui.
       */
      case 'compact': compactSession(); break;
      /*
       * ⛔ 28/8, stesso ledger §3.B: 'resume' non era nemmeno un case
       * riconosciuto — resumeSession() esiste, chiama il vero endpoint
       * POST .../resume, gestisce da sola il caso "nessuna sessione reale
       * da riprendere" con un toast onesto (riga 1789).
       */
      case 'resume': resumeSession(); break;
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
    toast(button.dataset.sessionAction === 'fork' ? 'Fork created' : 'Side thread created', 'Isolated context, link kept in the session graph.');
  }));
  /* ⭐ 27/8 — card "Session topology": il pulsante Fork chiama la VERA forkSession() (già reale per il blocco 1), non un toast finto — stesso attrezzo, un secondo punto d'accesso onesto. */
  $$('[data-action="fork-session"]').forEach((button) => button.addEventListener('click', () => forkSession()));
  $$('[data-control-action]').forEach((button) => button.addEventListener('click', () => {
    /*
     * ⛔ 30/8, porta canonico (b84e61df, dimenticato dal 27/8): questo
     * SECONDO bottone Doctor (card "Control plane" di Impostazioni,
     * fuori dal foglio "control") mostrava ANCORA il toast "Doctor:
     * Healthy" hardcoded — trovato leggendo il diff del commit, non lo
     * schermo: eseguiDoctor() (già reale dal 29/8, primo punto
     * d'ingresso) chiama GET /api/v1/doctor per davvero, sicura da
     * qui anche senza il foglio aperto (l'aggiornamento badge è
     * opzionale, if (badgeEl)).
     */
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
    if (action === 'copy') copyText($('.assistant-copy', message)?.textContent || '', 'Answer copied');
    if (action === 'retry') toast('Regeneration started', 'The session context and permissions are unchanged.');
    if (action === 'like' || action === 'dislike') {
      const group = $$('.message-actions [data-message-action="like"], .message-actions [data-message-action="dislike"]', message);
      const wasPressed = actionButton.getAttribute('aria-pressed') === 'true';
      group.forEach((button) => button.setAttribute('aria-pressed', 'false'));
      actionButton.setAttribute('aria-pressed', String(!wasPressed));
      toast(!wasPressed ? 'Feedback registrato' : 'Feedback rimosso');
    }
  });

  $$('[data-browser-action]').forEach((button) => button.addEventListener('click', () => {
    const labels = { back: 'Back', forward: 'Forward', reload: 'Preview reloaded', annotate: 'Modalità annotazione', inspect: 'Inspector browser' };
    toast(labels[button.dataset.browserAction] || 'Browser', 'Azione simulata nel mockup locale.');
  }));

  const demoActionCopy = {
    notifications: ['Notifiche demo', 'La superficie non è collegata a notifiche reali.'],
    widget: ['Widget demo', 'Adding will work once this Board has a backend.'],
    delegate: ['Delega demo', 'No sub-agent was started from this interface.'],
  };
  $$('[data-demo-action]').forEach((button) => button.addEventListener('click', () => {
    toast(...(demoActionCopy[button.dataset.demoAction] || ['Demo UI · not connected', 'No real action was taken.']));
  }));

  $$('[data-file-entry]').forEach((button) => button.addEventListener('click', () => {
    $$('[data-file-entry]').forEach((entry) => entry.classList.toggle('active', entry === button));
    toast('Item selected', button.textContent.trim());
  }));

  /*
   * ⭐ 27/8, piano §1.3-BIS, blocco Automazioni — riusa startRealSession
   * (già reale, già testata) invece di un toast: "Esegui ora" su una riga
   * con data-task-id avvia per davvero quel task del corpus, la stessa
   * strada di "New session". La SCHEDULAZIONE vera (un cron che parte
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
    // ⭐ porting dal bundle desktop — "Nuova automazione" apre il vero form invece di un toast finto. Sul desktop il cancello era `!talos-embedded` (mai vero su mobile: avrebbe spento la funzione per sempre); qui uso lo stesso `embeddedDemoOnly()` già corretto per 'run', coerente col resto del file.
    if (action === 'new' && !embeddedDemoOnly()) {
      openNewAutomationSheet();
      return;
    }
    const labels = { new: ['Nuova automazione', 'Il mockup rappresenta il flusso senza backend.'], run: ['Run started', 'Il mockup rappresenta il flusso senza backend.'], edit: ['Automazione aperta', 'Il mockup rappresenta il flusso senza backend.'] };
    toast(...(labels[action] || ['Automazione', 'Il mockup rappresenta il flusso senza backend.']));
  }));

  $('.stop-run')?.addEventListener('click', () => {
    if (!state.running) return;
    /*
     * ⭐ 29/8 — ledger §10: stopRealSession() esisteva già (POST reale
     * .../stop) ma non era MAI chiamata da nessun bottone — lo stesso
     * genere di difetto già chiuso altrove in questo file (§ "il difetto
     * è che non li chiamano"). Per una sessione reale il giro si ferma
     * DAVVERO (setRunState arriva dopo, dal RunFinished/RunError SSE
     * reale — mai finto qui: "si ferma al prossimo giro" è onesto, non
     * immediato). Il ramo demo resta il toggle di sempre.
     */
    if (state.realSession.id) {
      stopRealSession();
      return;
    }
    setRunState(false);
    setQueueMode(false);
    toast('Run stopped', 'Stato, diff e output restano disponibili per la review.');
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

  /*
   * ⭐⭐⭐ 3/9 — avm-03, dal vivo: «Scrivi un messaggio, apri Model Lab per
   * configurare la chiave, torni indietro: composer vuoto». Causa
   * verificata leggendo `HarnessSessionScreen.vue` (onBeforeUnmount →
   * teardown(), onMounted → app.js ricaricato da uno <script> fresco):
   * navigare via da questa schermata smonta l'intero realm JS di questo
   * bundle, `composerInput.value` compreso — non è recuperabile da
   * NESSUN codice dentro app.js stesso, deve sopravvivere FUORI da qui.
   * `localStorage` (non sessionStorage: sopravvive anche a un processo
   * WebView ricreato da zero, non solo a un remount) — chiave per
   * sessione, stesso attributo già letto da riprendiSessioneDalHost()
   * (data-harness-session-id), 'new' quando assente (sessione mai
   * avviata: un solo cassetto condiviso, onesto per il caso comune).
   * Try/catch ovunque: uno storage negato (privacy mode) non deve mai
   * rompere l'invio di un messaggio, solo rinunciare silenziosamente a
   * ricordarlo.
   */
  function chiaveBozzaComposer() {
    const id = HOST().closest?.('[data-harness-session-id]')?.dataset.harnessSessionId;
    return `talos-codice-bozza:${id || 'new'}`;
  }
  function salvaBozzaComposer() {
    try {
      const valore = composerInput.value;
      if (valore) window.localStorage.setItem(chiaveBozzaComposer(), valore);
      else window.localStorage.removeItem(chiaveBozzaComposer());
    } catch { /* storage negato: il testo resta solo a schermo, meglio che un crash sull'invio */ }
  }
  function ripristinaBozzaComposer() {
    try {
      const bozza = window.localStorage.getItem(chiaveBozzaComposer());
      if (bozza) { composerInput.value = bozza; autoGrowTextarea(); }
    } catch { /* niente da ripristinare se lo storage non risponde */ }
  }

  composerInput.addEventListener('input', () => {
    autoGrowTextarea();
    const value = composerInput.value;
    if (value === '/') openCommandPalette();
    if (/@[^\s]*$/.test(value) && value.endsWith('@')) openSheet('references');
    salvaBozzaComposer();
  });
  composerInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      composerForm.requestSubmit();
    }
  });

  queueToggle.addEventListener('click', () => setQueueMode(!state.queueMode));
  composerMic?.addEventListener('click', announceVoiceUnavailable);

  composerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = composerInput.value.trim();
    if (!submitPrompt(text)) return;
    composerInput.value = '';
    autoGrowTextarea();
    salvaBozzaComposer(); // ⭐ 3/9 — un invio riuscito svuota anche la bozza salvata: non deve tornare dopo un giro in Model Lab
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
        toast('Follow-up cancelled');
      }
    } catch (error) {
      toast('Cancel failed', error.message);
    }
  });

  $$('[data-approve], [data-allow-session], [data-deny]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.approval-card');
      animateExit(card, {}, () => card?.remove());
      if (button.hasAttribute('data-deny')) toast('Permission denied', 'Il browser locale non verrà aperto.');
      else toast(button.hasAttribute('data-allow-session') ? 'Per-session permission' : 'Permesso concesso', 'Browser locale autorizzato.');
    });
  });

  $('#approveAllDiffs').addEventListener('click', () => {
    toast('Review approvata', '3 file pronti per il gate finale.');
    $$('.file-review').forEach((file) => { file.classList.remove('active'); file.setAttribute('aria-pressed', 'false'); });
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

  $$('[data-review-action]').forEach((button) => button.addEventListener('click', () => {
    toast(button.dataset.reviewAction === 'comment' ? 'Commento inline pronto' : 'File aperto nel workspace', diffPath?.textContent || 'Review');
  }));

  $('#reducedMotionToggle').addEventListener('change', (event) => {
    document.body.classList.toggle('reduce-motion', event.target.checked);
    toast('Movimento', event.target.checked ? 'Ridotto' : 'Standard');
  });

  campaignSelect?.addEventListener('change', () => {
    state.board.campaign = campaignSelect.value;
    harnessFilter.value = '';
    outcomeFilter.value = '';
    refreshCampaign();
  });
  harnessFilter?.addEventListener('change', reloadRunsFromFilters);
  outcomeFilter?.addEventListener('change', reloadRunsFromFilters);
  refreshCampaignButton?.addEventListener('click', () => {
    if (embeddedDemoOnly()) renderEmbeddedBoardDemo(true);
    else if (state.board.initialized) refreshCampaign();
    else ensureCampaignBoard();
  });
  loadMoreRunsButton?.addEventListener('click', async () => {
    const dashboard = $('[data-view="dashboard"]');
    const scrollTop = dashboard.scrollTop;
    const firstNewIndex = state.board.runs.length;
    loadMoreRunsButton.disabled = true;
    try {
      await loadCampaignRuns({ append: true });
      dashboard.scrollTop = scrollTop;
    } catch (error) {
      setConnectionState('error', 'Paginazione non disponibile', boardErrorMessage(error));
    } finally {
      loadMoreRunsButton.disabled = false;
      const focusTarget = loadMoreRunsButton.hidden
        ? campaignRunList.querySelectorAll('.campaign-run-toggle')[firstNewIndex]
        : loadMoreRunsButton;
      focusTarget?.focus({ preventScroll: true });
    }
  });
  $('[data-action="clear-evidence"]')?.addEventListener('click', clearCampaignEvidence);

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
    if (window.innerWidth > 780) sessionsPanel.classList.remove('open');
    syncInspectorToggle();
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
    startRealSessionFromMessage,
    startCustomSession,
    stopRealSession,
    handleRealEvent,
    forkSession,
    resumeSession,
    compactSession,
    passaASessione,
    // ⭐ 30/8, ledger §25/§31 — esposta per il test dedicato, stesso schema di sopra: internals reali, non un secondo contratto.
    riprendiSessioneDalHost,
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
    // ⭐ 28/8 — auto-rinomina dal primo messaggio: la funzione pura si espone per provare la sua logica (spazi/trim/tetto) senza dover avviare una sessione vera.
    titoloDalPrimoMessaggio,
    realSessionState: state.realSession,
    // ⭐ 29/8, porting dal bundle desktop (FASE A/C) — esposti per i test dedicati, stesso schema di sopra.
    eseguiDoctor,
    refreshDoctorBadge,
    caricaPannelloHooks,
    caricaAlberoSessione,
    openSheet,
    renderAutomationsReali,
    openNewAutomationSheet,
    setView,
  };
  window.__talosHarnessDestroy = () => {
    cancelMotionAnimations();
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
  $('#fileTreeFilter')?.addEventListener('input', (e) => filtraAlberoReale(e.target.value));

  sessionsCollapseBtn?.addEventListener('click', toggleSessionsPanel);

  // Ridimensionamento reale delle due sidebar, con limiti — owner 24/8.
  // Un trascinamento vero (pointer capture) e la stessa cosa da tastiera,
  // perché una maniglia raggiungibile solo dal dito non lo è da chi non
  // può trascinare. Persistito per-viewer in localStorage, come le altre
  // comodità di sola interfaccia di questo mockup (non è dato reale).
  const PANEL_RESIZE_LIMITS = { sessions: [220, 420], inspector: [280, 480] };
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
    const [min, max] = PANEL_RESIZE_LIMITS[which];
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
   * (`window.location.assign`) e il tasto Back non tornava alla SPA né
   * usciva dall'app — vedi [[tocchi-reali-adb-obbligatori]] per come è
   * stato trovato. Montato dentro `HarnessSessionScreen.vue` invece, la
   * pagina non cambia mai: è la STESSA cronologia Vue Router già verificata
   * su `/memoria` (Back → `/`), niente da reinventare qui.
   */

  ensureDemoLabels();
  /*
   * ⛔⛔⛔ 27/8 (3626c9bd), owner: "il caricamento della pagina non deve
   * azzerare le sessioni in corso... se aggiorno adesso le sessioni passate
   * spariscono". Prima di questo fix la sidebar restava vuota fino alla
   * PRIMA azione di sessione — ma un F5 non è mai un'azione di sessione:
   * azzerava la vista senza che il server avesse perso niente.
   * `setTimeout(…, 0)` invece di una chiamata diretta: un boot sincrono non
   * deve bloccarsi su una fetch di rete, e i test che montano il runtime
   * con un fetch finto restano sincroni fino alla loro ultima asserzione —
   * questa chiamata parte DOPO, non li tocca.
   *
   * ⭐ 27/8, secondo giro (già presente su questa copia, superset di
   * 3626c9bd): `renderAutomationsReali()` gira nello stesso callback — la
   * card automazioni della sidebar è live da subito, non solo dopo aver
   * aperto la vista. ⛔ Il `talos-embedded` gate qui resta invariato dal
   * commit che l'ha introdotto — se e quando vale la pena farlo girare
   * anche in embedded ora che mobile ha un backend on-device reale è una
   * decisione separata, non presa di striscio risolvendo questo conflitto.
   */
  window.setTimeout(() => {
    // ⛔ verificato al MOMENTO del fire, non alla schedulazione: un test (o
    // un embed reale) può marcare talos-embedded fra i due istanti.
    if (!HOST().classList.contains('talos-embedded')) {
      aggiornaElencoSessioniReali();
      renderAutomationsReali(); // ⭐ 27/8 — la card automazioni della sidebar è live da subito, non solo dopo aver aperto la vista
    }
  }, 0);
  aggiornaPillolaModello(); // ⭐ 27/8 — sincronizza SUBITO la pillola con lo stato vero (state.model === ''), invece di lasciare "gpt-5.6-sol · high" scritto a mano nell'HTML statico
  applyQaState();
  syncNavigationState();
  syncInspectorToggle();
  syncSessionsToggle();
  loadPanelWidths();
  setupPanelResize();
  syncHostLayout();
  setQueueMode(false);
  setRunState(true);
  setInspectorTab($('.inspector-tabs button.active'));
  renderReviewFile('composer');
  autoGrowTextarea();
  ripristinaBozzaComposer(); // ⭐ 3/9 — un app.js appena montato (boot, o un ritorno da Model Lab) riprende quello che c'era scritto prima di partire
  syncVisualViewport();
  /*
   * ⛔ 26/8 — provato e SCARTATO: aggiungere qui una chiamata a
   * aggiornaElencoSessioniReali() per sincronizzare la sidebar all'avvio.
   * Sembrava un buco (le sette funzioni di sessione la richiamano dopo
   * ogni azione, ma nessuna all'avvio), ma DUE test lo smentiscono:
   * CODE-COMPOSER-DEMO-SEND-01 (mount standalone, senza `talos-embedded`)
   * e HARNESS-BOARD-MOBILE-HONESTY-01 (mount embedded) pretendono ENTRAMBI
   * zero fetch al mount — non solo in embedded. È lo stesso principio
   * della Board (ensureCampaignBoard/loadCampaigns, mai chiamate al boot,
   * solo al cambio vista): il boot non fa MAI una chiamata di rete propria,
   * a prescindere da standalone/embedded. Non un buco: design deliberato.
   *
   * ⭐ 30/8 — QUESTA riga sotto NON è quel buco riaperto: non è
   * incondizionata, parte solo se il DOM stesso (`data-harness-session-id`
   * su un antenato di HOST(), piantato SOLO da HarnessSessionScreen.vue)
   * dice che questa pagina è nata per una sessione precisa — vedi
   * riprendiSessioneDalHost() sopra per il perché. `mountStaticRuntime()`
   * (i due test citati) non pianta mai quell'attributo: `HOST().closest`
   * torna `undefined`, la funzione esce alla prima riga, zero fetch,
   * invariato per loro.
   *
   * ⭐⭐⭐ 2/9 — resta un chiamante DISTINTO da selectSession() (non
   * rimosso): HarnessSessionScreen.vue chiama SEMPRE
   * selectTalosHarnessUiSession subito dopo, quindi i due normalmente
   * corrono in parallelo per lo STESSO id — caricaCronologiaSessione
   * (sopra) de-duplica per sessionId apposta per questo, non è una
   * corsa a chi arriva prima.
   */
  riprendiSessioneDalHost();
})();
