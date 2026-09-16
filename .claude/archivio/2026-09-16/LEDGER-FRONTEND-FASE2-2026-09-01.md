# Ledger esecutivo — Frontend desktop Fase 2

Data: 2026-09-01  
Owner: TALOS UI desktop  
Stato: GREEN; RED, GREEN focalizzati, regressioni e review indipendente chiusi.  
Cutover: vietato; `harness-ui/public/` e server owner `4174` restano invariati.

Ricerca vincolante:
`.claude/DOSSIER-RICERCA-FRONTEND-FASE2-2026-09-01.md`.

## Debiti owner registrati

- `NAV-CAPABILITY-FIRSTCLASS-01`: Libreria, Memoria, Note, Attività e Ricerca
  approfondita devono essere righe di sidebar di prima classe e aprire pagine
  dedicate collegate a dati reali. Il Capability Hub non è la destinazione
  finale.
- `RESEARCH-MOBILE-PARITY-01`: la thin slice Ricerca desktop non equivale al
  motore mobile completo. Pianificazione, verifica indipendente, citazioni,
  approvazione e persistenza eventi restano un programma esplicito.
- `MESSAGE-ACTIONS-6.3B`: contratto canonico mobile pin
  `e69402bcf940a4a347434ab93e551c39ff7f86c6`, verificato contenere schema,
  fixture, resolver e test Harness. Il desktop non tocca
  `mobile/public/harness-ui`; l'allineamento del mirror resta alla lane mobile.

La Fase 2 prepara il controller di route e lo stato, ma non pubblica route senza
pagina né superfici decorative. Le righe e le pagine sono gate della Fase 4;
la parità del motore Ricerca resta un gate funzionale successivo.

## File esatti

### Da creare

- `.claude/DOSSIER-RICERCA-FRONTEND-FASE2-2026-09-01.md`
- `.claude/LEDGER-FRONTEND-FASE2-2026-09-01.md`
- `.claude/CONSEGNA-FRONTEND-FASE2-2026-09-01.md`
- `harness-ui/frontend/src/state/initial-state.js`
- `harness-ui/frontend/src/state/actions.js`
- `harness-ui/frontend/src/state/reducer.js`
- `harness-ui/frontend/src/state/selectors.js`
- `harness-ui/frontend/src/state/invariants.js`
- `harness-ui/frontend/src/state/create-store.js`
- `harness-ui/frontend/src/app/effect-scope.js`
- `harness-ui/frontend/src/app/application.js`
- `harness-ui/frontend/src/app/bootstrap.js`
- `harness-ui/frontend/src/app/route-controller.js`
- `harness-ui/frontend/src/app/workspace-layout.js`
- `harness-ui/frontend/src/ui/component.js`
- `harness-ui/frontend/src/ui/dom.js`
- `harness-ui/frontend/src/ui/keyed-list.js`
- `harness-ui/frontend/src/ui/virtual-list.js`
- `harness-ui/frontend/src/ui/focus-manager.js`
- `harness-ui/frontend/src/ui/overlay-manager.js`
- `harness-ui/frontend/src/ui/shortcut-manager.js`
- `harness-ui/frontend/src/ui/announcement-region.js`
- `harness-ui/frontend/lab/routes/virtual-list.js`
- `harness-ui/frontend/lab/routes/focus-overlay.js`
- `harness-ui/frontend/lab/routes/application-lifecycle.js`
- `harness-ui/frontend/tests/unit/state-invariants.test.mjs`
- `harness-ui/frontend/tests/unit/reducer.test.mjs`
- `harness-ui/frontend/tests/unit/selectors.test.mjs`
- `harness-ui/frontend/tests/unit/create-store.test.mjs`
- `harness-ui/frontend/tests/unit/effect-scope.test.mjs`
- `harness-ui/frontend/tests/unit/component.test.mjs`
- `harness-ui/frontend/tests/unit/dom.test.mjs`
- `harness-ui/frontend/tests/unit/keyed-list.test.mjs`
- `harness-ui/frontend/tests/unit/overlay-manager.test.mjs`
- `harness-ui/frontend/tests/unit/shortcut-manager.test.mjs`
- `harness-ui/frontend/tests/unit/application.test.mjs`
- `harness-ui/frontend/tests/component/virtual-list.spec.mjs`
- `harness-ui/frontend/tests/component/focus-overlay.spec.mjs`
- `harness-ui/frontend/tests/integration/application-lifecycle.spec.mjs`

### Da modificare

- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`
- `C:/Users/Antonino/Desktop/projects/TALOS-RICERCHE/2026-08-31-harness-desktop-frontend-refactor-review-plan.md`
- `harness-ui/frontend/src/main.js`
- `harness-ui/frontend/src/styles/index.css`
- `harness-ui/frontend/lab/main.js`
- `harness-ui/frontend/playwright.lab.config.mjs`
- `harness-ui/frontend/package.json`
- `harness-ui/frontend/package-lock.json`
- `harness-ui/frontend/scripts/copy-vendored-assets.mjs`
- `harness-ui/frontend/scripts/verify.mjs`
- `harness-ui/frontend/src/contracts/session-events.js`
- `harness-ui/frontend/src/contracts/persistence.js`
- `harness-ui/frontend/tests/contract/vendored-assets.test.mjs`
- `harness-ui/frontend/tests/contract/session-events.test.mjs`
- `harness-ui/frontend/tests/unit/persistence.test.mjs`

### Da eliminare

- Nessuno.

### Esplicitamente invariati

- `harness-ui/public/index.html`
- `harness-ui/public/app.js`
- `harness-ui/public/styles.css`
- `harness-ui/server.mjs`
- ogni file sotto `mobile/`

## Simboli pubblici

- Stato: `createInitialState`, `ACTIONS`, `reducer`,
  `assertStateInvariants`, `selectRuntimePhase`, `selectSessionHeader`,
  `selectConversation`, `selectDock`, `selectApprovalCount`,
  `selectReviewSummary`, `selectTerminalStatus`, `selectStatusBar`.
- Store: `createStore` con `getState`, `dispatch`, `subscribe`.
- Lifecycle: `createEffectScope` con `add`, `abortController`, `listen`,
  `timeout`, `interval`, `observe`, `own`, `nextGeneration`, `isCurrent`,
  `destroy`.
- UI core: `defineComponent`, `element`, `setAttributes`, `replaceChildren`,
  `delegate`, `text`, `reconcileKeys`, `createKeyedList`,
  `createVirtualList`.
- Interaction: `createFocusManager`, `createOverlayManager`,
  `normalizeShortcut`, `createShortcutManager`, `createAnnouncementRegion`.
- Application: `createApplication`, `createBootstrapController`,
  `createRouteController`, `createWorkspaceLayout`,
  `createFrontendBootstrap`.

Compatibilità immutabile: tutti i simboli Fase 1, globali
`__talosHarnessUiRuntime`/`__talosHarnessDestroy`, chiavi storage, 23 eventi
sessione, frame terminale byte `0/1`, endpoint `/api/v1/` e output owner.
La Fase 1 asset allowlist cresce da 19 a 20 file esclusivamente per includere
`vendor/tanstack/LICENSE-virtual-core`; il relativo scenario viene aggiornato e
resta deterministico.

## RED nominati ed esito atteso

- `PHASE2-STATE-INVARIANTS-01`: stato freddo, `ready-active`, `ready-empty`,
  oggetti browser vietati nello stato. Atteso: moduli stato mancanti.
- `PHASE2-REDUCER-GENERATION-02`: evento di sessione obsoleto non muta lo
  stato; transizioni creano solo slice interessate. Atteso: reducer mancante.
- `PHASE2-STORE-SELECTOR-03`: listener invocato solo se il valore selezionato
  cambia; stato invalido non viene pubblicato. Atteso: store mancante.
- `PHASE2-EFFECT-TEARDOWN-04`: abort/listener/timer/resource chiusi una volta,
  LIFO, token generazione obsoleto respinto. Atteso: scope mancante.
- `PHASE2-COMPONENT-LIFECYCLE-05`: root/update/destroy/focus canonici e DOM
  senza `innerHTML`. Atteso: helper mancanti.
- `PHASE2-VIRTUAL-IDENTITY-06`: identità keyed conservata e 10.000 righe con
  DOM montato limitato. Atteso: moduli/lista lab mancanti.
- `PHASE2-OVERLAY-FOCUS-07`: stack, inert, Tab/Shift+Tab, Escape e ritorno
  focus; shortcut non intercetta testo. Atteso: manager mancanti.
- `PHASE2-APPLICATION-TEARDOWN-08`: start/destroy doppi senza handle e nessuna
  pretesa operativa non osservata. Atteso: application mancante.
- `PHASE2-OWNER-IMMUTABLE-09`: hash dei tre file `public` invariato prima e
  dopo la fase; health `4174` sempre 200.

### Emendamento durante il GREEN

`PHASE2-GLOBAL-TEARDOWN-10`: il primo gate browser ha confermato che il teardown
rimuove subito `__talosHarnessDestroy`. Il test deve conservare il riferimento
alla funzione prima della prima chiamata: la stessa funzione restituisce
`true` e poi `false`, mentre i globali restano rimossi. Richiamare il nome
globale dopo la distruzione non è un contratto valido.

`PHASE2-OVERLAY-STATE-11`: il gate visivo e la revisione del lifecycle hanno
individuato che la chiusura di una modale azzerava `inert` e `aria-hidden`
preesistenti sui fratelli della pagina. RED osservato: `{ inert: false,
ariaHidden: null }` al posto dello stato iniziale `{ inert: true,
ariaHidden: 'true' }`. Il manager deve conservare e ripristinare esattamente
lo stato precedente di ogni nodo, anche con overlay annidati.

`PHASE2-SELECTOR-STABILITY-12`: la review indipendente ha misurato che
`selectSessionHeader` e gli altri selector a oggetto creavano una nuova
identità a ogni lettura. Con `Object.is`, una notifica estranea invocava quindi
il listener della testata sessione. I selector a oggetto devono mantenere la
stessa identità finché i soli input osservati non cambiano.

`PHASE2-EFFECT-CLEANUP-ISOLATION-13`: un cleanup che lanciava interrompeva il
teardown LIFO e lasciava vive le risorse registrate prima. Tutti i cleanup
devono essere tentati una volta; gli errori vengono raccolti e rilanciati solo
dopo la chiusura completa.

`PHASE2-OVERLAY-STACK-14`: un handle non in cima poteva chiudere il proprio
layer e ripristinare focus fuori dalla modale figlia ancora attiva. La chiusura
non-top deve fallire chiusa (`false`) senza modificare stack, DOM, inert o
focus; dopo la chiusura del top, il padre torna chiudibile normalmente.

`PHASE2-OVERLAY-DESTROY-15`: dopo `destroy()` il manager accettava ancora
`open()`, creando un layer senza listener Escape/focus trap. Il manager deve
chiudersi una volta, rifiutare ogni resurrezione e continuare a tentare la
chiusura dei layer rimanenti anche se un callback lancia.

`PHASE2-EFFECT-TIMEOUT-16`: un timeout one-shot già eseguito conservava il
proprio record fino alla distruzione dello scope. Il record deve rimuoversi
prima del callback; il disposer successivo restituisce `false` e scope lunghi
non accumulano cleanup scaduti.

`PHASE2-STATE-PLAIN-17`: la denylist dei costruttori lasciava entrare
`EventTarget`, `MessagePort` e `Map` con risorse annidate. Lo stato accetta solo
valori JSON-like, array e oggetti con prototipo semplice/null, senza cicli,
funzioni, simboli, bigint o numeri non finiti.

`PHASE2-SESSION-MEMBERSHIP-18`: `SESSION_SELECTED` accettava un id assente
dall'elenco e produceva `ready-active` senza sessione reale. Reducer e
invariante devono entrambi rifiutare l'id sconosciuto; una sessione presente
resta selezionabile.

`PHASE2-EVENT-CONTRACT-DRIFT-19`: durante la review il contratto pubblico
corrente risultava di 23 eventi, mentre l'adapter Fase 1 ne conservava ancora
19. I quattro `RunRedirect*` della baseline devono entrare nel Set e nel test;
non sono eventi inventati dalla Fase 2.

`PHASE2-STORAGE-CONTRACT-DRIFT-20`: la baseline owner contiene
`talos-harness-modal-sizes-v1`, ma la persistence allowlist Fase 1 la
rifiutava. La chiave pubblica corrente deve essere nominata da
`TALOS_STORAGE_KEYS` senza allargare l'accesso a chiavi arbitrarie.

`PHASE2-LIVE-REGION-MODAL-21`: le due live region erano figlie della root e
venivano rese `inert`/`aria-hidden` insieme allo sfondo prima dell'annuncio di
apertura. Solo le regioni possedute dall'announcer devono restare esenti;
tutto il restante sfondo continua a essere inerte.

`PHASE2-STATE-IMMUTABLE-22`: `getState()` esponeva riferimenti mutabili e una
scrittura diretta aggirava reducer, validazione e subscriber. Ogni stato
pubblicato deve essere ricorsivamente congelato; le mutazioni esterne falliscono
senza cambiare lo store.

### Emendamento re-audit finale

`PHASE2-SELECTOR-STABILITY-12` include ora il caso multi-store: la cache di uno
store con una sessione diversa non deve espellere quella di un altro store.
Modifica esatta: `harness-ui/frontend/src/state/selectors.js`, helper privato
`memoizeInputs`; compatibilita di tutti gli export `select*` invariata. RED:
`harness-ui/frontend/tests/unit/create-store.test.mjs`, caso nominato
`PHASE2-SELECTOR-STABILITY-12 concurrent stores cannot evict each other
selector identity`; atteso prima del fix: listener A invocato dopo una sola
lettura dello store B.

`PHASE2-STATE-IMMUTABLE-22` copre inoltre chiavi `Symbol` e proprieta non
enumerabili. Modifica esatta:
`harness-ui/frontend/src/state/create-store.js`, helper privato `freezeState`;
API pubblica `createStore/getState/dispatch/subscribe` invariata. RED:
`harness-ui/frontend/tests/unit/create-store.test.mjs`, caso nominato
`PHASE2-STATE-IMMUTABLE-22 symbol and non-enumerable children are frozen too`;
atteso prima del fix: entrambi i figli restano mutabili.
Lo stesso scenario rifiuta accessor e oggetti esotici mutabili (`Map`):
`Object.freeze()` non potrebbe garantire l'immutabilita profonda dei loro dati.

Ricerca specifica:

- Redux documenta che una cache di dimensione uno viene invalidata da input
  alternati e che istanze concorrenti richiedono cache/istanze indipendenti;
- MDN documenta `WeakMap` per associare dati a oggetti senza trattenerli in
  memoria;
- MDN documenta `Reflect.ownKeys()` come unico accesso completo a proprieta
  proprie enumerabili/non enumerabili e stringa/`Symbol`.

Decisione: **ADAPT** con cache `WeakMap` posseduta da TALOS per identita della
slice; **ADOPT** `Reflect.ownKeys()` e descriptor ECMAScript per il freeze.
Nessuna nuova dipendenza. Rollback: ripristino dei due helper privati; nessun
formato persistito o simbolo pubblico cambia.

`PHASE2-VERIFICATION-EVIDENCE-23`: la review finale ha rilevato che il comando
`npm run verify`, pur eseguendo i gate della Fase 2, scriveva ancora
`artifacts/phase-01-verification.json`, dichiarava `phase: 1` e stampava
"Fase 1 verificata". Il RED nominato vive in
`harness-ui/frontend/tests/contract/package-shape.test.mjs` e deve fallire
finché nome artefatto, metadato e messaggio non dichiarano coerentemente la
Fase 2. Modifica esatta: `harness-ui/frontend/scripts/verify.mjs`; nessun
comando pubblico cambia. La documentazione Node.js corrente conferma l'uso
sequenziale di `fsPromises.writeFile()` e del test runner/assert per verificare
invarianti di file. Decisione: **ADOPT** le primitive Node già pin­nate e
correggere solo i metadati TALOS; nessuna dipendenza o contratto esterno.
Rollback: ripristinare il solo script e rimuovere l'asserzione nominata.

## GREEN focalizzati

- `rtk node --test harness-ui/frontend/tests/unit/state-invariants.test.mjs harness-ui/frontend/tests/unit/reducer.test.mjs harness-ui/frontend/tests/unit/selectors.test.mjs`
- `rtk node --test harness-ui/frontend/tests/unit/create-store.test.mjs harness-ui/frontend/tests/unit/effect-scope.test.mjs`
- `rtk node --test harness-ui/frontend/tests/unit/overlay-manager.test.mjs`
- `rtk node --test harness-ui/frontend/tests/contract/session-events.test.mjs harness-ui/frontend/tests/unit/persistence.test.mjs`
- `rtk node --test harness-ui/frontend/tests/unit/component.test.mjs harness-ui/frontend/tests/unit/dom.test.mjs harness-ui/frontend/tests/unit/keyed-list.test.mjs harness-ui/frontend/tests/unit/shortcut-manager.test.mjs`
- `rtk node --test harness-ui/frontend/tests/unit/application.test.mjs`
- `rtk npm --prefix harness-ui/frontend run build:lab`
- `rtk npm --prefix harness-ui/frontend run test:lab`

## Regressioni e gate finali

- `rtk npm --prefix harness-ui/frontend run verify`
- `rtk npm --prefix harness-ui/frontend run test`
- `rtk node --test harness-ui/tests/*.test.mjs`
- `rtk git diff --check`
- `GET http://127.0.0.1:4174/api/v1/health` prima e dopo.
- Confronto SHA-256 di `harness-ui/public/index.html`, `app.js`, `styles.css`.

Nessun nuovo messaggio reale al provider è autorizzato o necessario: il gate
Qwen end-to-end già chiuso resta valido e non viene ripetuto.

## Prova visibile

Laboratorio isolato `4175`, Chrome pin del progetto:

- VirtualList a 1440×900, 1280×800 e 1024×800: 10.000 elementi logici, DOM
  limitato, prima/ultima riga raggiungibili, nessun overflow esterno.
- FocusOverlay nelle stesse viewport: focus iniziale, ciclo Tab, Escape,
  restituzione all'invocatore, background realmente inerte.
- Application lifecycle: stato osservato visibile senza sessioni, provider o
  capability inventate; destroy e restart non duplicano annunci/listener.
- Screenshot interi ispezionati per overflow, clipping, focus, tema, motion,
  console e richieste fallite.

## Review indipendente

Il re-audit indipendente ha chiuso tecnicamente i finding 12 e 22 e non ha
trovato nuove criticità funzionali. Ha richiesto l'allineamento formale dei
conteggi e dell'attestato `verify`; `PHASE2-VERIFICATION-EVIDENCE-23` rende il
rilievo permanente. Esito finale: frontend `53/53`, laboratorio `15/15`, build
e determinismo `24` asset, backend Harness `1259/1259`, browser prodotto `76`
passati e `2` integrazioni reali opt-in saltate, hash owner invariati, health
`4174` uguale a `200` e `git diff --check` pulito.

## Rollback

Rimuovere esclusivamente i file nuovi della Fase 2 e ripristinare `main.js`,
lab, config e package frontend. Non esistono migrazioni dati né cambio del
server owner; `public/` resta il rollback immediato.
