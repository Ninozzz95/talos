# Ledger operativo — P0 lag Harness Desktop

Stato: RIAPERTO il 01/09/2026 dopo riscontro owner e nuova riproduzione
strumentata; le due cause già corrette restano chiuse, il replay UI è P0.  
Owner subsystem: TALOS UI desktop + backend locale Harness.

## Contratti che non devono regredire

- Il server `127.0.0.1:4174` resta disponibile durante il lavoro; ogni riavvio
  controlla PID, command line, workdir, porta e `/api/v1/health` prima/dopo.
- Nessun nuovo messaggio modello: Qwen 3.8 Flash resta l'unico modello
  autorizzato e il gate reale precedente è già conservato.
- Un file cambiato fuori dall'app aggiorna il file tree della sessione ancora
  aperta anche dopo `RunFinished`.
- Due sessioni sullo stesso workspace condividono una sola registrazione OS.
- La radice di volume (`C:\`) non viene osservata ricorsivamente.
- `.git`, `node_modules` e gli store TALOS non generano refresh.
- Background motion, pausa quando nascosta, data saver e reduced motion restano
  impostazioni funzionanti e persistenti.
- Nessun file mobile viene modificato.

## Slice RED/GREEN 1 — watcher nativo e ownership

### File

1. Modifica `harness-ui/src/workspace-watcher.mjs`
   - `creaGestoreWorkspaceWatcher({ watchFn })`
   - `guardaWorkspace(cartella, onCambiamento)`
   - compatibilità stabile: `quantiWatcherAttiviPerTest()` e valore esportato
     `guardaWorkspace`
   - nuovo helper privato per normalizzare/filtrare `filename`, incluso `null`
   - un'unica chiamata `node:fs.watch` con `recursive:true`, `persistent:false`,
     `encoding:'utf8'`, `ignore:IGNORATI`
   - debounce 400 ms, tetto 2 s e isolamento dei sottoscrittori invariati
2. Modifica `harness-ui/src/session-registry.mjs`
   - `attivaWatcherSessione(voce, cartella)`
   - nuovo `fermaWatcherSessione(voce)`
   - nuovo `rilasciaWatcherSessioneSeInattiva(voce)`
   - `broadcast()` rilascia dopo `RunFinished`/`RunError` se nessun client è
     iscritto
   - `iscriviti()` attiva il watcher anche per una cronologia conclusa e la
     disiscrizione lo rilascia quando non esiste più né run né client
   - `elimina()` rilascia sempre prima di rimuovere la voce
3. Modifica `harness-ui/tests/workspace-watcher.test.mjs`
   - `WATCHER-NATIVE-SINGLE-25`: un albero profondo produce una sola
     registrazione nativa
   - `WATCHER-NATIVE-NULL-FILENAME-26`: evento senza nome produce un refresh
     generico, non un crash
   - caratterizzazione esistente su evento reale, raffica, ignore, condivisione
     e cleanup resta green
4. Modifica `harness-ui/tests/full-access-root-e2e.test.mjs`
   - aggiorna l'iniezione al watcher nativo
   - conserva radice no-op e cartella ordinaria osservata
5. Modifica `harness-ui/tests/session-registry.test.mjs`
   - `SESSION-WATCHER-LIFECYCLE-27`: run concluso senza SSE rilascia
   - `SESSION-WATCHER-LIFECYCLE-28`: client ancora connesso conserva e riceve
     `WorkspaceChanged`, poi chiusura client rilascia
   - `SESSION-WATCHER-LIFECYCLE-29`: selezionare una cronologia conclusa
     riattiva una volta, deselezionare rilascia
   - `SESSION-WATCHER-LIFECYCLE-30`: eliminare rilascia anche con client vivo
6. Modifica `harness-ui/package.json`
   - rimuove dipendenza diretta `chokidar@4.0.3`
   - descrizione aggiornata senza dichiarazione obsoleta
7. Modifica `harness-ui/package-lock.json`
   - rimuove root dependency e pacchetti non più raggiungibili `chokidar` e
     `readdirp`

### RED atteso

- L'iniezione nativa e i test lifecycle non esistono.
- Il run concluso senza listener lascia `fermaWatcher` attiva.
- L'implementazione corrente chiama Chokidar e cresce per directory.

### GREEN mirato

```powershell
node --test harness-ui/tests/workspace-watcher.test.mjs harness-ui/tests/full-access-root-e2e.test.mjs harness-ui/tests/session-registry.test.mjs
```

### Gate reale

- Avviare un watcher su una copia temporanea con migliaia di directory.
- Misurare prima/dopo handle, memoria privata e CPU idle per almeno 5 s.
- Budget: una registrazione TALOS per workspace, delta CPU idle prossimo a zero,
  nessuna crescita proporzionale al numero di directory.
- Scrivere un file ordinario e uno ignorato; deve arrivare solo il primo.
- Chiudere l'ultimo owner; la registrazione deve tornare a zero.

### Rollback

Ripristinare esclusivamente i sette file della slice. Nessuna migrazione dati e
nessun cambio al formato eventi.

## Slice RED/GREEN 2 — background compositor-only

### File

1. Modifica `harness-ui/public/app.js`
   - `fermaBackgroundDesktop()` conserva il simbolo ma non usa più rAF
   - `avviaBackgroundDesktop()` legge una volta le impostazioni e sincronizza
     durata/stato CSS
   - `aggiornaBackgroundDesktop()` resta entry point stabile
   - `backgroundAnimationRunning` continua a descrivere lo stato effettivo
   - nessuna scrittura per-frame a custom property root
2. Modifica `harness-ui/public/styles.css`
   - `.scene-orb-a` e `.scene-orb-b` animate solo con `transform`
   - `will-change:transform` limitato ai due orb
   - keyframe distinti per evitare moto identico/decorazione piatta
   - `.background-motion-paused`, `.background-motion-off` e reduced-motion
     impostano `animation-play-state:paused`/`animation:none`
3. Modifica `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
   - `BACKGROUND-MOTION-COMPOSITOR-02`: due fotogrammi cambiano stato visivo,
     mentre l'attributo `style` di root resta invariato
   - `BACKGROUND-MOTION-PERF-03`: finestra di misura CDP senza costo ricorrente
     rilevante di `RecalcStyleDuration`
   - `BACKGROUND-MOTION-PAUSE-04`: off/static/reduced motion non animano;
     visibility/data saver usano la classe di pausa
4. Modifica `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
   - aggiorna soltanto hash/byte/righe intenzionali di `app.js` e `styles.css`

### RED atteso

- L'attributo `style` di root cambia fra due frame.
- `--talos-motion-phase/x/y` sono ancora scritte continuamente.
- Il profilo CDP mostra circa `0,46 s` di style recalculation in 5 s.

### GREEN mirato

```powershell
npm --prefix harness-ui/frontend run test:browser -- --grep "BACKGROUND-MOTION"
```

### Gate umano e prestazionale

- Screenshot originali a 1440×900 e 1024×800, tema Calm scuro e chiaro.
- Confrontare interamente header, sidebar, conversazione, composer, pannello
  destro e sfondo; nessun flash, overlay o contrasto regredito.
- CDP per 5 s con motion on/off: `RecalcStyleDuration` dell'on non deve più
  crescere continuamente e il main thread deve restare disponibile.
- Tab nascosta: pausa; ritorno visibile: ripresa senza salto o accumulo frame.

### Rollback

Ripristinare i quattro file della slice; le impostazioni persistite non cambiano
schema e non richiedono migrazione.

## Regressione completa e consegna

1. Backend completo: `node --test harness-ui/tests/*.test.mjs`.
2. Frontend unit/contract/browser e build: `npm --prefix harness-ui/frontend run verify`.
3. Browser suite completa: `npm --prefix harness-ui/frontend run test:browser`.
4. `git diff --check`.
5. Health `4174`, PID/command/workdir/porta e risorse del processo.
6. Nessun nuovo turno reale; usare sessione Qwen persistita per lettura e
   screenshot.
7. Aggiornare:
   - `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
   - `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`
   - `.claude/CONSEGNA-LAG-DESKTOP-2026-09-01.md`

## Criterio di chiusura

P0 è green soltanto quando entrambi i difetti hanno test permanenti, profilo
reale post-fix, screenshot interi ispezionati e suite completa pulita. Se il
watcher nativo supera ancora il budget, il lavoro non viene dichiarato chiuso:
si riapre il ledger con utility process/ParcelWatcher come fase successiva.

## Esito finale misurato

- RED osservato prima del prodotto: sei scenari watcher/lifecycle e tre scenari
  motion/performance fallivano per assenza del contratto nativo, mancato cleanup
  e mutazioni root per-frame.
- GREEN backend: `1259/1259` test passati, incluso evento filesystem reale,
  burst, ignore, condivisione, cleanup e radice volume.
- GREEN frontend: `npm run verify` passato; browser completo `76` passati e `2`
  gate reali opt-in saltati senza eseguire nuovi turni modello.
- Processo degradato ante-fix: `255330` handle, `3.03 GB` privati e `8.125 s`
  CPU in una finestra idle di `5 s` dopo l'attivazione del vecchio watcher.
- Processo post-fix PID `3640`: `273` handle e `73.25 MB` privati al boot;
  selezionando una sessione storica gli handle sono saliti soltanto a `277` e
  sono tornati a `272` dopo la chiusura. A regime: `0 s` CPU in `5 s`.
- Profilo browser post-fix per `5 s`: motion ON `RecalcStyleDuration=0`,
  `TaskDuration=0.001432`; motion OFF `RecalcStyleDuration=0`,
  `TaskDuration=0.000531`. Prima del fix motion ON produceva circa `0.4635 s`
  di ricalcolo stile nella stessa finestra.
- Screenshot originali ispezionati integralmente:
  `harness-ui/frontend/artifacts/p0-lag-2026-09-01/desktop-1440x900-dark.png`
  e `desktop-1024x800-light.png`. Nessun overflow orizzontale, overlay,
  sovrapposizione o regressione di contrasto osservata.
- Server owner: `http://127.0.0.1:4174/api/v1/health` risponde `200`; nessun
  nuovo messaggio modello e nessun file mobile modificato dalla slice.

Decisione post-gate: il budget nativo è soddisfatto; utility process e
ParcelWatcher restano rinviati, non necessari per chiudere questo P0.

## Riapertura P0 — replay storico trattato come attività live

Il riscontro owner «il lag persiste di molto», insieme all'osservazione che le
sidebar laterali scorrono fluide, ha invalidato la chiusura globale del P0. Il
profilo sul server owner, senza riavvio e senza nuovo turno modello, ha aperto
la prima sessione conclusa e misurato in `6081 ms`:

- `458` eventi storici `WorkspaceChanged`;
- `466` GET identiche della radice `/tree?percorso=`;
- `515` mutazioni DOM del file tree;
- `162` delta storici `TextMessageContent` e `633` mutazioni conversazione;
- `10` richieste alla lista sessioni;
- due long task, `130 ms` totali, massimo `72 ms`.

Il tree finale contiene soltanto `20` nodi: il problema non è la dimensione
del risultato, ma il trattamento di ogni delta storico come richiesta di
render live. `WorkspaceChanged` svuota l'intera cache e avvia un render async
senza single-flight; ogni `TextMessageContent` riparsa tutto il markdown
accumulato e sostituisce subito il DOM.

### Decisione upstream

- **ADAPT** HTML SSE/`Last-Event-ID`: il replay resta ordinato e completo, ma
  gli effetti visivi sono coalescenti; nessun nuovo formato vendor.
- **ADOPT** il principio Chrome LoAF/INP «ridurre il lavoro per frame» e usare
  `requestAnimationFrame` come frontiera di commit visivo.
- **ADAPT** Hermes Desktop: delta accumulati e commit visuali attribuibili,
  senza copiare React/store o il suo protocollo.
- **ADAPT** VS Code: un cambiamento filesystem invalida lo stato una volta; le
  richieste sovrapposte identiche vengono deduplicate.
- **REJECT** un nuovo framework o la rimozione del live tree: non correggono la
  concorrenza e violerebbero contratti già funzionanti.

### File esatti

Da modificare:

1. `harness-ui/public/app.js`
   - scheduler coalescente e single-flight del file tree;
   - flush per-frame dei messaggi streaming e flush finale su `TextMessageEnd`;
   - teardown/cambio generazione cancella frame e richieste differite;
   - refresh lista sessioni coalescente durante replay.
2. `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
   - `LAG-REPLAY-TREE-31`: 500 eventi storici producono al massimo un commit
     radice stabile, senza render concorrenti;
   - `LAG-REPLAY-TEXT-32`: centinaia di delta dello stesso messaggio producono
     un solo commit visivo finale e testo completo;
   - `LAG-LIVE-WORKSPACE-33`: un cambiamento live dopo il replay aggiorna
     ancora il tree;
   - `LAG-GENERATION-CANCEL-34`: cambio sessione cancella lavoro differito.
3. `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
   - soltanto hash/byte/righe intenzionali di `app.js`.
4. `.claude/DOSSIER-RICERCA-LAG-DESKTOP-2026-09-01.md`
5. `.claude/LEDGER-LAG-DESKTOP-2026-09-01.md`
6. `.claude/CONSEGNA-LAG-DESKTOP-2026-09-01.md`
7. `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
8. `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`

Nessun file backend, `mobile/`, schema SSE o formato sessione viene cambiato.

### RED e gate

RED atteso pre-fix: centinaia di tree fetch/DOM commit e markdown render per un
unico ripristino. GREEN mirato:

```powershell
rtk npm --prefix harness-ui/frontend run test:browser -- --grep "LAG-REPLAY|LAG-LIVE|LAG-GENERATION"
```

Gate finale: ripetere la misura reale sul `4174`; tree fetch `<=2`, nessun
render dopo cambio generazione, testo completo, nessun long frame attribuito
alla raffica, scroll centrale e laterale confrontati, suite frontend/backend e
hash/cutover invariati. La progressione Fase 4 resta bloccata finché il nuovo
P0 non è GREEN anche visivamente.

## Emendamento 02/09/2026 — il replay cadenzato attraversa più frame

La prima implementazione ha chiuso lo storm del file tree ma la prova reale ha
invalidato l'ipotesi che tutti i delta storici arrivassero nello stesso frame.
Sulla stessa sessione conclusa e nello stesso intervallo di `6080 ms`:

- `458` `WorkspaceChanged` producono ora **una** lettura del tree, non `466`;
- i `162` `TextMessageContent` producono ancora `325` mutazioni della
  conversazione, perché il server li consegna cadenzati su più frame;
- un solo long task da `74 ms`, contro due/`130 ms` totali prima del fix;
- server owner `4174` sempre HTTP `200`, nessun riavvio e nessun nuovo turno.

Il confine `requestAnimationFrame` resta corretto per lo streaming vivo, ma non
è un confine sufficiente per l'idratazione di una cronologia conclusa. La
decisione viene quindi affinata così:

- **ADAPT** SSE senza cambiare protocollo: quando `passaASessione()` riceve dal
  registro una sessione `conclusa:true`, il renderer accumula testo e
  ragionamento e fa il commit finale sui rispettivi eventi `*End`;
- `nuovaGenerazioneSessione()` disattiva sempre questa modalità prima di un
  nuovo run, fork o resume, così lo streaming vivo conserva i commit progressivi;
- nessun timeout euristico e nessuna supposizione sulla velocità di rete: il
  dato canonico `conclusa` già presente nella sessione decide il percorso;
- tool call, esiti, permessi e file restano renderizzati nello stesso ordine.

### Simboli e test aggiunti

1. `harness-ui/public/app.js`
   - nuovo stato privato `realSession.deferHistoricalRendering`;
   - `passaASessione()` lo abilita solo per una sessione conclusa;
   - `nuovaGenerazioneSessione()` lo azzera prima di ogni nuova generazione;
   - `handleRealEvent()` accumula `TextMessageContent` e
     `ReasoningMessageContent` senza commit intermedi quando il flag è attivo;
   - `TextMessageEnd` e `ReasoningMessageEnd` forzano il contenuto finale.
2. `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
   - `LAG-REPLAY-PACED-35`: delta storici separati da più frame mantengono un
     solo contenuto finale e un budget DOM indipendente dal numero di delta;
   - `LAG-REPLAY-REASONING-36`: anche il ragionamento storico nascosto non viene
     riparsato a ogni delta e conserva il testo completo;
   - `LAG-LIVE-TEXT-37`: dopo `nuovaGenerazioneSessione({continua:true})` il
     testo vivo compare prima di `TextMessageEnd`.

RED atteso: `LAG-REPLAY-PACED-35` e `LAG-REPLAY-REASONING-36` superano il
budget di mutazioni; `LAG-LIVE-TEXT-37` protegge la semantica live. GREEN
reale: ripetere la misura sul `4174`, con `conversationMutations <= 80` per la
cronologia campione e contenuto visivo completo.

## Riapertura P0 del 02/09/2026 — lag interattivo di scroll e modali

Il nuovo riscontro owner distingue tre stati riproducibili: lo scroll centrale
resta lento con entrambe le sidebar aperte, migliora quando entrambe vengono
compresse senza diventare fluido, e peggiora nettamente quando una grande
modale è aperta, in particolare durante lo scroll di «Nuova sessione». Questo
invalida l'ipotesi che il replay storico fosse l'unica causa del lag globale.

### Ricerca e decisione upstream

Fonti primarie verificate il 02/09/2026: Chrome DevTools Performance, Long
Animation Frames API, web.dev INP, MDN `PerformanceObserver` e Chrome DevTools
Protocol `Tracing`. Decisione: **ADOPT** `PerformanceObserver` e CDP Tracing per
attribuire ogni gesto a script/layout/paint/compositing; **ADAPT** INP/LoAF a un
budget locale ripetibile; **REJECT** ulteriori ottimizzazioni speculative e un
cambio framework prima dell'attribuzione misurata.

### File e simboli esatti della diagnosi

1. Creare `harness-ui/frontend/scripts/diagnose-interaction-lag.mjs`:
   - `collectScenario()` apre una pagina pulita sul server owner;
   - `startTrace()`/`stopTrace()` raccolgono CDP `devtools.timeline`;
   - `startFrameProbe()`/`stopFrameProbe()` misurano intervalli rAF, long task,
     LoAF, mutazioni e metriche Performance;
   - scenari `CHAT-SIDEBARS-OPEN`, `CHAT-SIDEBARS-COLLAPSED`,
     `NEW-SESSION-SCROLL` e `COMMAND-PALETTE-SCROLL` usano controlli e scroll
     reali, non classi di test;
   - output JSON e screenshot in
     `harness-ui/frontend/artifacts/lag-interaction-2026-09-02/`.
2. Modificare `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs` solo
   dopo l'attribuzione, aggiungendo un test RED nominato per la causa reale.
3. Modificare `harness-ui/public/styles.css` oppure
   `harness-ui/public/app.js` soltanto se la traccia attribuisce lì il costo;
   il simbolo/selettore esatto sarà registrato con un emendamento prima del
   prodotto.
4. Aggiornare la snapshot legacy soltanto per file prodotto intenzionalmente
   cambiati.
5. Aggiornare dossier, ledger, QA visiva e consegna con numeri ante/post.

### RED, GREEN, prova umana e rollback

- **RED diagnostico:** a parità di scroll, sidebar aperte o modale producono un
  degrado frame/paint significativamente maggiore dello stato compresso e la
  traccia deve nominare il responsabile, non soltanto il sintomo.
- **RED TDD:** il test permanente deve fallire sul CSS/handler corrente per la
  stessa causa misurata sul `4174`.
- **GREEN:** test mirato, `npm run verify`, browser suite completa, backend
  completo, `git diff --check`, poi ripetizione dei quattro profili reali.
- **Prova visibile:** screenshot completi 1440×900 dei quattro stati e scroll
  manuale equivalente sul server owner; nessun cambiamento estetico non
  richiesto.
- **Rollback:** ripristinare soltanto test, prodotto e snapshot della slice; lo
  strumento diagnostico e i report restano evidenza non invasiva.

### Attribuzione strumentata e implementazione autorizzata

La matrice reale sul `4174` ha isolato la causa senza mutazioni DOM né lavoro
JavaScript significativo:

- chat reale scrollabile (`scrollHeight 8535`), sidebar aperte: p95 `33,4 ms`;
- stesse condizioni con sidebar compresse: p95 `33,4 ms`, coda massima ridotta;
- stessa chat con solo background fermo: p95 `16,8 ms`;
- Nuova sessione: p95 `83,4 ms`, `46` LoAF consecutivi e script/layout quasi
  nulli;
- Nuova sessione con solo blur spento: p95 `33,4 ms`;
- Nuova sessione con solo background fermo: p95 `16,8 ms`.

Causa: i due grandi layer `.scene-orb` animati continuano a cambiare i pixel
sotto sidebar e backdrop con `backdrop-filter`; Chrome deve ricomporre le grandi
superfici a ogni fotogramma. `will-change:backdrop-filter` non rende il filtro
«calcolato una volta» quando ciò che sta dietro continua a cambiare. Lo scroll
non esegue handler costosi: il collo di bottiglia è compositing/raster.

Modifiche esatte:

1. `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
   - RED `LAG-INTERACTION-DIALOG-38`: un dialog reale mette in pausa il
     background senza disabilitarlo e la chiusura lo riprende;
   - RED `LAG-INTERACTION-SCROLL-39`: lo scroll reale mette in pausa il
     background durante il gesto e lo riprende dopo quiete;
   - i test falliscono se viene rimossa la pausa, se l'animazione viene spenta
     definitivamente o se non riprende.
2. `harness-ui/public/app.js`
   - stato `backgroundInteractionPauseReasons` e timer
     `backgroundScrollResumeTimer`;
   - funzioni private `setBackgroundInteractionPause()`,
     `syncBackgroundDialogPause()` e `queueBackgroundScrollPause()`;
   - `avviaBackgroundDesktop()` considera le pause interattive mantenendo
     `background-motion-active`, così la timeline riprende dallo stesso punto;
   - `showEmbeddedDialog()` e la chiusura effettiva sincronizzano la ragione
     `dialog`;
   - listener capture/passive su `wheel` e `scroll`, con teardown completo.
3. `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
   - aggiornamento intenzionale del solo `app.js`.

Nessun blur, token, forma, colore o impostazione viene rimosso. La pausa vale
solo durante un gesto di scroll o finché un dialog è aperto; lo sfondo torna a
muoversi automaticamente senza ripartire da zero.

## Seconda lettura — 02/09/2026, dopo che Codex ha esaurito i crediti

Questa era l'ULTIMA cosa scritta, mai passata da un secondo paio d'occhi —
owner: *"ancora oggi c'è del lag inspiegabile"*. Riletta riga per riga
(`setBackgroundInteractionPause`, `syncBackgroundDialogPause`,
`queueBackgroundScrollPause`, `harness-ui/public/app.js:5982-6018`), tracciati
tutti e tre i percorsi di chiusura di un dialog (bottone/azione esplicita →
`closeEmbeddedDialog`; Escape → `dismissTransientLayers`; click sul backdrop →
`dismissTransientLayers`) fino a `syncBackgroundDialogPause()`: tutti e tre
corretti, nessun percorso nativo (`<dialog>` in modalità `.show()`, non
`.showModal()` — l'Escape del browser non scatta da solo, è tutto manuale via
keydown) che lo scavalca. Teardown (`window.__talosHarnessDestroy`) pulisce
timer, reasons e classi CSS per intero.

**Rilanciato dal vivo, non solo riletto**: `LAG-INTERACTION-DIALOG-38` e
`LAG-INTERACTION-SCROLL-39` — **2/2 passati** (`npm --prefix harness-ui/frontend
run test:browser -- --grep "LAG-INTERACTION"`, server owner `4174` sano prima
e dopo).

**Conclusione di questa lettura**: questo pezzo specifico è solido — nessun
difetto trovato nella logica né nella copertura dei percorsi di chiusura. Se
il lag persiste "ancora oggi" come riporta l'owner, la causa è altrove — NON
in questa slice. Il perimetro da controllare per primo (non ancora fatto):
se il lag riportato è successivo al 02/09 e riguarda una sessione con MOLTI
messaggi/tool-call storici, la sezione "Riapertura P0... replay storico" più
sopra in questo stesso file (coalescenza `TextMessageContent`/`WorkspaceChanged`)
è la seconda area indicata dal proprio storico di riaperture — anch'essa da
riverificare dal vivo con lo stesso rigore, non ancora fatto in questo giro.
