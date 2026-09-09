# Ledger — modali ridimensionabili e comandi File Explorer

Data: 2026-09-01  
Stato: **implementazione e gate tecnici verdi; review indipendente e prova
visuale ufficiale ancora aperte**.

## File autorizzati

### Da modificare

- `harness-ui/public/app.js`
- `harness-ui/public/index.html`
- `harness-ui/public/styles.css`
- `harness-ui/src/workspace-browser.mjs`
- `harness-ui/src/http-app.mjs`
- `harness-ui/tests/workspace-browser.test.mjs`
- `harness-ui/tests/http-routes-workspace-browser.test.mjs`
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
- `harness-ui/frontend/tests/browser/workspace-chooser.spec.mjs`
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`

### Da creare

- `.claude/DOSSIER-RICERCA-MODALI-FILE-EXPLORER-2026-09-01.md`
- `.claude/LEDGER-MODALI-FILE-EXPLORER-2026-09-01.md`
- `.claude/CONSEGNA-MODALI-FILE-EXPLORER-2026-09-01.md`

### Da eliminare

- Nessuno.

## Simboli e contratti

- `prepareResizableDialog(dialog, logicalKey)` assegna l’identità logica e ripristina solo la sua misura.
- `setupDialogResize()` monta tre maniglie su entrambi i dialog reali.
- `readSavedDialogSizes()`, `saveDialogSize()`, `clampDialogSize()` gestiscono storage, limiti e viewport.
- `createWorkspaceBrowser().createFolder(parentPath, name)` crea una sola directory, senza ricorsione, dopo gli stessi gate di root/link del browse.
- `POST /api/v1/workspace-browser/folders` accetta solo `{ parentPath, name }` e restituisce `{ name, path }` nella busta API esistente.
- `refreshSessionFileTree()`, `collapseSessionFileTree()` e `workspaceChooser` collegano toolbar visibili ad azioni reali.
- Compatibilità da preservare: `browse()`, endpoint GET `/api/v1/workspace-browser`, fogli esistenti, focus trap, Escape annidato, menu contestuale e CRUD sessione.

## Scenari permanenti

1. `MODAL-RESIZE-PERSIST-01` — trascinare la maniglia diagonale di Modello salva larghezza e altezza; reload+riapertura ripristina entrambe.
2. `MODAL-RESIZE-ISOLATION-02` — Modello e Permessi conservano misure distinte benché condividano `#sheetDialog`.
3. `MODAL-RESIZE-AXES-03` — maniglia destra cambia solo larghezza, inferiore solo altezza, diagonale entrambe.
4. `MODAL-RESIZE-VIEWPORT-04` — una misura persistita enorme viene ricondotta dentro il viewport; sotto 781px le maniglie non interferiscono col bottom sheet responsive.
5. `FILE-EXPLORER-TOOLBAR-05` — sidebar Files espone Nuovo file, Nuova cartella, Aggiorna e Comprimi tutto; nessun comando è attivo senza sessione reale.
6. `FILE-EXPLORER-REFRESH-06` — Aggiorna invalida la cache e rilegge la radice; Comprimi tutto svuota gli aperti e ridisegna.
7. `WORKSPACE-NEW-FOLDER-07` — Nuova cartella crea davvero una directory valida nel percorso corrente, poi aggiorna e seleziona il nuovo elemento.
8. `WORKSPACE-NEW-FOLDER-INVERSE-08` — traversal, separatori, nomi riservati Windows, link/reparse e destinazione esistente sono rifiutati senza uscire dalla root.
9. `WORKSPACE-TOOLBAR-09` — chooser espone Nuova cartella, Aggiorna, Comprimi tutto e Copia percorso, con label accessibili e feedback reale.
10. `MODAL-FOCUS-REGRESSION-10` — resize non rompe ciclo Tab, Escape del picker annidato o ritorno del focus.

## RED atteso

- I test browser non trovano `.dialog-resize-handle`, non osservano persistenza per chiave e non trovano le toolbar.
- I test adapter non trovano `createFolder`.
- La rotta POST nuova restituisce 405/404.

## GREEN mirato

- `npm --prefix harness-ui test -- --test-name-pattern="WORKSPACE|MODAL|FILE-EXPLORER"`
- `npm --prefix harness-ui/frontend run test:browser -- --grep "MODAL-RESIZE|FILE-EXPLORER|WORKSPACE-TOOLBAR"`

## Regressioni

- Suite backend completa `npm --prefix harness-ui test`.
- Suite browser prodotto completa `npm --prefix harness-ui/frontend run test:browser`.
- `npm --prefix harness-ui/frontend run build`.
- `npm --prefix harness-ui/frontend run verify`.
- `node --check harness-ui/public/app.js`.
- `git diff --check`.

## Gate reale e prova umana

- Server isolato diverso da `4174`; mai riavviare il server owner.
- Messaggio reale solo con `qwen/qwen3.8-flash` e output verificato.
- Screenshot ufficiali 1440×900, 1920×1080 e 1280×800: Modello ridimensionato, Permessi con misura separata, Nuova sessione con toolbar, sidebar Files con toolbar. Ispezione integrale e taccuino aggiornato.
- La fase non è green visiva se il browser ufficiale dell’app non è disponibile.

## Rollback

- Rimuovere maniglie e chiave `talos-harness-modal-sizes-v1` senza toccare altre preferenze.
- Rimuovere la toolbar lasciando intatti menu contestuali e CRUD esistenti.
- Rimuovere solo `createFolder` e la rotta POST; il GET read-only resta invariato.

## Esito di implementazione — 01/09/2026

### RED osservati

- l'adapter non esponeva `createFolder` e i test adapter fallivano;
- `POST /api/v1/workspace-browser/folders` restituiva 405;
- le UI non esponevano né `.dialog-resize-handle` né le due toolbar;
- la prima suite completa ha scoperto una regressione reale nel ciclo del focus:
  le maniglie aggiunte in coda al dialog uscivano dal contratto Tab esistente;
- la matrice responsive ha scoperto una regressione reale a 780 px: il foglio
  conservava una larghezza desktop e poteva uscire dal viewport.

Le ultime due regressioni sono state corrette e conservate come scenari
permanenti: le maniglie sono montate negli header già inclusi nel focus trap e
il bottom sheet azzera min/max width al breakpoint compatto.

### Gate verdi freschi

- backend completo: **1219/1219**;
- browser prodotto: **70 passati**, più **1 gate reale opt-in escluso** dalla
  corsa ordinaria;
- frontend unit/contract: **14/14**;
- build: **23 asset**; `verify` verde;
- gate UI + endpoint reale su server isolato `4176`: **1/1**;
- creazione reale di una cartella temporanea: creata, riletta dall'albero e
  rimossa; nessun residuo lasciato;
- `node --check harness-ui/public/app.js` e `git diff --check`: verdi;
- snapshot legacy corrente: `app.js` 9721 righe, 518166 byte, SHA-256
  `8daa940bcc85e75279542d2f474d818e4c246aeecb2d70eb0ccbfba17313d7aa`;
  `styles.css` 2174 righe, 171725 byte, SHA-256
  `69f4899bb18c24c918d1630d63aeab4d7923754e662f38b474746997dbd0aa7e`;
  `index.html` 434 righe, 68678 byte, SHA-256
  `967aaa91a3282e200c9c0c50af40d51c848167ded636cd8d3c0380de52e605a3`.

### Gate aperti, senza falsa chiusura

- il browser ufficiale in-app non espone istanze (`[]`), quindi gli screenshot
  automatici non vengono presentati come ispezione visuale dell'owner;
- un nuovo messaggio Qwen 3.8 Flash sul server isolato ha emesso `RunStarted`
  ma non testo né `RunFinished` entro oltre due minuti; è stato annullato in
  modo pulito. Il gate Qwen già verde della slice chooser resta documentato,
  ma questa nuova corsa non è considerata riuscita;
- review indipendente in corso: ogni finding bloccante deve diventare RED,
  essere corretto e rieseguito prima di promuovere la fase.
