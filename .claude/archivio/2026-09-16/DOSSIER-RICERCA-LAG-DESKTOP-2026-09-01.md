# Dossier ricerca — lag globale Harness Desktop

Data: 2026-09-01  
Perimetro: solo `AVM-harness-desktop`; mobile e runtime esterni restano in sola lettura.

## Esito in una frase

Il lag P0 non nasce dal modello né dalle API: sono state isolate due sorgenti
indipendenti di lavoro continuo, entrambe nel desktop Harness.

1. Il watcher ricorsivo Chokidar resta vivo per tutta la durata del processo e,
   dopo l'attivazione su un workspace reale, crea un watcher per ogni directory.
2. Lo sfondo animato riscrive tre custom property sulla radice dell'app ad ogni
   frame, costringendo Chromium a ricalcolare gli stili dell'intera interfaccia.

## Evidenza locale riprodotta

### Server

- Processo degradato prima del riavvio controllato: PID `23808`.
- `255.330` handle, circa `3,03 GB` di memoria privata.
- In cinque secondi apparentemente inattivi ha consumato `8,125 s` di CPU.
- Il workspace della sessione Qwen reale conteneva `9.583` directory e `51.314`
  file; anche escludendo `.git` e `node_modules` restavano `2.985` directory e
  `19.207` file.
- Dopo il riavvio, senza riattivare il watcher: PID `6148`, `274` handle, circa
  `72 MB` privati e delta CPU `0` in cinque secondi.
- Aprire e selezionare la cronologia Qwen senza iniziare un turno non cambia il
  dato: `273` handle e delta CPU `0`.

La differenza causale è quindi l'attivazione del watcher ricorsivo durante un
giro, non il caricamento della cronologia, il server HTTP o la selezione della
sessione.

### Browser

Misura CDP isolata per cinque secondi sulla stessa build:

| Stato sfondo | TaskDuration | RecalcStyleDuration | ScriptDuration |
| --- | ---: | ---: | ---: |
| animato | 0,5166 s | 0,4635 s | 0,0096 s |
| fermo | 0,0004 s | 0 s | ~0 s |

La scrittura ad ogni `requestAnimationFrame()` di
`--talos-motion-phase/x/y` su `#app` rende invalida la cascata di tutta la UI.
Lo script in sé costa poco; il costo dominante è il ricalcolo stile globale.

## Standard e sorgenti primarie

### Node.js 24

- [`fs.watch()` Node 24](https://nodejs.org/download/release/v24.15.0/docs/api/fs.html#fswatchfilename-options-listener)
  supporta su Windows la ricorsione nativa tramite `ReadDirectoryChangesW`,
  `AbortSignal`, `persistent:false` e filtri `ignore`. La documentazione impone
  inoltre di gestire `filename === null` e dichiara i limiti su directory
  rinominate/eliminate.
- Runtime TALOS misurato: Node `v24.18.0`.

Decisione: **adottare direttamente** `node:fs.watch` dietro l'adapter TALOS già
esistente. Il debounce, la normalizzazione dei percorsi, il filtro difensivo e
la deduplica per workspace restano responsabilità AVM.

### Rendering web

- [web.dev, High-performance CSS animations](https://web.dev/articles/animations-guide):
  animare `transform`/`opacity`, evitare proprietà che riaprono layout o paint,
  verificare con Performance/Rendering e usare `will-change` con parsimonia.
- [Chrome Performance Insights](https://developer.chrome.com/docs/performance/insights):
  il costo di style/layout e i forced reflow sono predittori diretti della
  reattività; il confronto va fatto sul main thread, non “a occhio”.

Decisione: **adottare direttamente** il contratto del compositor. Lo sfondo
diventa due animazioni CSS isolate su `.scene-orb`; nessun valore sulla radice
viene più mutato per frame. Le impostazioni restano lette quando cambiano, non
sessanta volte al secondo.

## Confronto competitor mirato

### Hermes Agent

Pin esaminato: `82e6c46b9428a5eb7739978590913a32c814298b`.

- [`stream-throttle.ts`](https://github.com/NousResearch/hermes-agent/blob/82e6c46b9428a5eb7739978590913a32c814298b/apps/desktop/electron/stream-throttle.ts)
  documenta un caso reale di circa 20% CPU idle causato da renderer lasciati
  sempre attivi: Hermes disabilita il throttling soltanto durante lo stream e lo
  ripristina sul trailing edge.
- [`renderer-loop-pause.ts`](https://github.com/NousResearch/hermes-agent/blob/82e6c46b9428a5eb7739978590913a32c814298b/apps/desktop/src/lib/renderer-loop-pause.ts)
  mette in pausa le animazioni decorative quando finestra, focus o visibilità
  dicono che nessuno le osserva.
- [`use-message-stream/index.ts`](https://github.com/NousResearch/hermes-agent/blob/82e6c46b9428a5eb7739978590913a32c814298b/apps/desktop/src/app/session/hooks/use-message-stream/index.ts)
  accorpa i delta e adatta la frequenza al costo effettivo del commit, lasciando
  spazio al main thread per input e resize.
- [`render-churn.mjs`](https://github.com/NousResearch/hermes-agent/blob/82e6c46b9428a5eb7739978590913a32c814298b/apps/desktop/scripts/perf/scenarios/render-churn.mjs)
  attribuisce render e notifiche al componente/store responsabile e pretende
  zero render della sidebar durante stream non visibili.
- [`idle-cost.mjs`](https://github.com/NousResearch/hermes-agent/blob/82e6c46b9428a5eb7739978590913a32c814298b/apps/desktop/scripts/perf/scenarios/idle-cost.mjs)
  distingue esplicitamente il costo “turno aperto ma nessun token” dal costo
  dello streaming e misura commit idle, digitazione e drag.

Da adottare come principio, non come codice: attività solo sul bordo dello stato
reale, animazioni dormienti quando non osservabili, budget misurato e causa
attribuita. TALOS può fare meglio nel caso specifico eliminando del tutto il
loop JS decorativo, non limitandosi a ridurne la frequenza.

### Pi Coding Agent

Pin esaminato: `b8b873b9872db04a938fb4357b5e8e824ddc051c`.

- [`packages/tui/src/tui.ts`](https://github.com/badlogic/pi-mono/blob/b8b873b9872db04a938fb4357b5e8e824ddc051c/packages/tui/src/tui.ts)
  accorpa richieste duplicate (`renderRequested`), applica un intervallo minimo,
  cancella timer pendenti e permette all'input di prevaricare un frame
  throttled. La [README TUI](https://github.com/badlogic/pi-mono/blob/b8b873b9872db04a938fb4357b5e8e824ddc051c/packages/tui/README.md)
  raccomanda cache del rendering e invalidazione soltanto su cambiamento.
- [`fs-watch.ts`](https://github.com/badlogic/pi-mono/blob/b8b873b9872db04a938fb4357b5e8e824ddc051c/packages/coding-agent/src/utils/fs-watch.ts)
  usa il watcher nativo Node, chiusura esplicita e gestione dell'errore.
- [`footer-data-provider.ts`](https://github.com/badlogic/pi-mono/blob/b8b873b9872db04a938fb4357b5e8e824ddc051c/packages/coding-agent/src/core/footer-data-provider.ts)
  osserva directory/file Git strettamente necessari, pulisce watcher e timer
  prima di ricrearli e gestisce i salvataggi atomici senza osservare l'intero
  workspace.

Da adottare: coalescenza, input prioritario e watcher posseduti con cleanup.
TALOS ha un requisito diverso (refresh dell'intero file tree), quindi mantiene
un watcher ricorsivo nativo per il workspace ma lo vincola a un proprietario
reale e a una sola registrazione OS per percorso.

### OpenAI Codex

Pin esaminato: `1f4c47343a1bff2d8cddc429c5d39503fb5a6c30`.

- [`app-server README — fs/watch`](https://github.com/openai/codex/blob/1f4c47343a1bff2d8cddc429c5d39503fb5a6c30/codex-rs/app-server/README.md#example-filesystem-watch)
  espone `fs/watch`, `fs/changed` e `fs/unwatch` con `watchId` scelto dal client.
- [`app-server/src/fs_watch.rs`](https://github.com/openai/codex/blob/1f4c47343a1bff2d8cddc429c5d39503fb5a6c30/codex-rs/app-server/src/fs_watch.rs)
  lega il watcher alla connessione, rifiuta ID duplicati, debouncia a 200 ms e
  aspetta la cessazione del task prima di confermare `unwatch`.
- [`file-watcher/src/lib.rs`](https://github.com/openai/codex/blob/1f4c47343a1bff2d8cddc429c5d39503fb5a6c30/codex-rs/file-watcher/src/lib.rs)
  condivide registrazioni tramite refcount, usa guard RAII per rilasciarle e
  rimuove le sottoscrizioni quando il client si disconnette.

Da adottare: possesso connessione/sessione, refcount, debounce e rilascio
deterministico. Il protocollo Codex non diventa il dominio TALOS: il contratto
AG-UI/SSE esistente resta invariato.

### Claude Code

Pin pubblico esaminato: `a1e64dc407dd57dfb4ea283b0f8049adf3eabee5`.

Il repository pubblico non espone l'implementazione del renderer; la fonte
primaria disponibile è il
[`CHANGELOG.md`](https://github.com/anthropics/claude-code/blob/a1e64dc407dd57dfb4ea283b0f8049adf3eabee5/CHANGELOG.md).
Le correzioni pertinenti dichiarate sono:

- salto dei subtree walk senza effetto durante lo streaming;
- eliminazione di trasformazioni complete della cronologia quando lo stato dei
  tool non è cambiato;
- riduzione dei re-render idle e del timer a 5 Hz di un chip di stato;
- fix della chiusura di un watcher mentre una scansione directory è in corso;
- limiti espliciti per tabelle e payload molto grandi.

Da adottare: nessun lavoro senza un cambiamento osservabile e cleanup sicuro.
Non viene attribuita a Claude un'architettura interna non pubblicata.

### VS Code

- [File Watcher Internals](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals):
  watcher ricorsivo isolato, deduplica delle richieste sovrapposte, esclusioni
  per directory grandi/generate e lifecycle per sottoscrizione.
- [VS Code 1.76](https://code.visualstudio.com/updates/v1_76): il watcher è stato
  spostato in un utility process per isolare l'host principale.

Un processo separato sarebbe sensato se il watcher nativo TALOS restasse
costoso dopo il fix. Oggi sarebbe complessità prematura: il test causale mostra
che il problema è l'esplosione Chokidar, e Node 24 offre già un singolo watcher
ricorsivo Windows.

## Upstream decision finale

- **Adopt**: `node:fs.watch` di Node 24 per il backend Windows.
- **Adapt**: ownership/refcount di Codex e cleanup mirato di Pi nel registro
  sessioni TALOS, senza cambiare SSE/AG-UI.
- **Adopt**: animazioni CSS `transform`/`opacity` compositor-only.
- **Adapt**: pausa osservabilità e gate prestazionali di Hermes.
- **Reject**: Chokidar per questo percorso ricorsivo Windows, perché la
  scansione per-directory misurata è la causa del P0.
- **Defer con gate**: sidecar/utility process alla VS Code soltanto se il profilo
  post-fix supera ancora i budget dichiarati nel ledger.

## Addendum — il replay UI era una terza causa indipendente

Il riscontro owner successivo al primo gate ha provato che watcher OS e sfondo
non esaurivano il problema. Una sessione conclusa reale sul `4174` ha consegnato
in circa sei secondi `458` vecchi `WorkspaceChanged`; il frontend li ha
interpretati come cambiamenti appena avvenuti, avviando `466` letture della
stessa radice e `515` mutazioni del tree. Nello stesso replay, `162` delta testo
hanno prodotto `633` mutazioni della conversazione.

La distinzione empirica è netta: le sidebar laterali scorrono fluide, mentre la
superficie centrale si blocca quando il replay ricostruisce chat e file tree.
Il tree finale ha soltanto venti nodi; la causa è la moltiplicazione del lavoro,
non la dimensione della vista finale.

### Fonti primarie aggiornate

- [HTML Living Standard — Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html):
  `Last-Event-ID` garantisce continuità del flusso, non obbliga il renderer a
  eseguire un commit DOM per ogni record storico.
- [MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events):
  eventi nominati e `message` sono task distinti; il consumer deve controllare
  il costo applicativo dei propri handler.
- [Chrome — Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames):
  molte attività inferiori a 50 ms possono sommarsi nello stesso frame e
  produrre jank; il gate deve misurare frame e non soltanto singoli long task.
- [web.dev — DOM size and interactivity](https://web.dev/articles/dom-size-and-interactivity):
  ogni sostituzione di un subtree aumenta il costo di style/layout; evitare
  ricostruzioni ridondanti è prioritario rispetto a micro-ottimizzare il nodo.
- [VS Code — File Watcher Internals](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals):
  deduplica di richieste identiche e correlazione degli eventi per evitare
  lavoro globale non richiesto.
- [Hermes Desktop debug](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/debug/README.md):
  attribuzione di render e store churn; i commit senza cambiamento osservabile
  sono il primo elenco da eliminare.

### Decisione aggiornata

**ADAPT** replay ordinato, coalescenza visiva di Hermes e deduplica VS Code
dietro funzioni TALOS. Il testo continua ad accumularsi delta per delta, ma il
markdown entra nel DOM al massimo una volta per frame e viene forzato completo
su `TextMessageEnd`. Il tree conserva aggiornamento live e cache per livello,
ma una raffica produce un solo render differito e una sola corsa in volo. Non
si cambia lo schema SSE e non si tocca mobile.
## Addendum 02/09/2026 — lag interattivo globale dopo il replay fix

Il replay coalescente ha migliorato il prodotto ma l'owner segnala ancora lag
grave durante l'uso generale, soprattutto con sidebar visibili e aprendo
`Nuova sessione` o la palette comandi. Il P0 resta quindi aperto.

Ricerca web primaria eseguita in diretta il 02/09/2026:

- Chrome DevTools Performance reference:
  `https://developer.chrome.com/docs/devtools/performance/reference` — la
  traccia Interactions separa input delay, processing e presentation delay;
  gli eventi oltre 200 ms sono evidenziati e i `Recalculate Style` lunghi
  possono essere analizzati con statistiche selettori.
- Chrome Long Animation Frames API:
  `https://developer.chrome.com/docs/web-platform/long-animation-frames` —
  ogni LoAF attribuisce script, durata, `forcedStyleAndLayoutDuration`, pause e
  timestamp del primo evento UI.
- web.dev, Optimize INP: `https://web.dev/articles/optimize-inp` — prima si
  isolano input delay, handler e presentazione; layout thrashing, DOM grande,
  style calculation e lavoro sincrono sul main thread sono cause da misurare.
- MDN `PerformanceObserver`:
  `https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver` —
  raccolta buffered di entry `event`, `longtask` e `long-animation-frame`.
- Chrome DevTools Protocol, Tracing:
  `https://chromedevtools.github.io/devtools-protocol/tot/Tracing/` —
  `Tracing.start/dataCollected/tracingComplete` per attribuire eventi
  `EventDispatch`, `FunctionCall`, `UpdateLayoutTree`, `Layout`, `Paint` e task.

Decisione upstream: **ADOPT** PerformanceObserver e CDP Tracing come metodo di
diagnosi; **ADAPT** il gate INP/LoAF a un'app locale desktop; **REJECT** altri
fix ipotetici, framework switch o virtualizzazione finché la traccia non
attribuisce il costo a una funzione/componente preciso.

Matrice obbligatoria prima di modificare il prodotto:

1. pagina owner `4174`, sessione storica ripristinata, sidebar sinistra e rail
   destro visibili;
2. click `Nuova`, attesa primo paint stabile della modale, Escape;
3. `Ctrl+K`, attesa primo paint stabile della palette, ricerca digitata,
   Escape;
4. per gesto: Event Timing, LoAF/script, long task, layout/style/paint CDP,
   mutation record, numero nodi e listener/handler attribuibili;
5. idle di controllo con le stesse sidebar ma senza interazione.

Solo dopo questa matrice si emenda il ledger con file, simboli e RED esatti.
