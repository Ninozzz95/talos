# Brief — mini-fase CLI-REQ (approvata dall'owner il 17/09/2026: «ok approvo»)

> Parte DOPO PO-27. Backend soltanto: nessun file del frontend. Base = il commit che ti do all'avvio, su
> `lane/harness-desktop`; crei tu il ramo `cli-req` nel tuo worktree. Un agente Opus 5 **xhigh** (kernel), revisore avversariale dopo.
> CLI-REQ-03 NON è qui: l'owner l'ha approvata DENTRO PO-27 (vedi in fondo).

## Da dove vengono
Quattro richieste della lane della CLI, commit `154a7296`. Leggile per intero, sono misurate bene:
`git show 154a7296:docs/talos-cli/handoffs/2026-09-17-CLI-REQ-0N-<nome>.md` (N = 01, 02, 04). ⛔ La lane della CLI non si tocca.
Io ho riaperto le posizioni nel nostro albero a `c022f756`: il codice citato c'è. Non ho riprodotto niente: la RED è tua.

## Ordine e decisioni GIÀ prese dall'owner (non ridiscuterle)

### 1 · CLI-REQ-04 — il terminale eredita i segreti del server 🔒
`src/pty-terminal.mjs` (~157) avvia la shell con `env: process.env`; `desktop/runtime.mjs:55-60` dà al server
`TALOS_HARNESS_UI_TOKEN`, `ELECTRON_RUN_AS_NODE=1` e, se configurata, la chiave delle ricevute (`config.mjs:601, 625-627`).
- **Deciso: elenco CHIUSO** di variabili solo-server tolte dall'ambiente del terminale. **NO** al filtro a forma
  (`ambienteSenzaCredenziali`): il terminale è della persona, `GH_TOKEN`/`NPM_TOKEN` suoi devono restare.
- Oltre alla loro proposta: (a) l'elenco non deve invecchiare in silenzio — una prova che legge i nomi che `runtime.mjs` mette
  nell'ambiente del figlio e pretende che ognuno sia nell'elenco o dichiarato innocuo per nome; (b) **accerta nel codice** ogni
  altro punto che avvia processi con `process.env` intero (`grep -n "env: process.env\|env: { *\.\.\.process.env" src/`): per
  ognuno scrivi se è coperto da D-10E (`talosHarness.mjs` ~3675-3729) o no. Non curare fuori dal terminale: ELENCA.
- Prove come nel loro documento (token assente, PATH/HOME/GH_TOKEN presenti per nome, riconnessione invariata), al contrario.

### 2 · CLI-REQ-02 — la fiducia del plugin copre solo `plugin.json` 🔒
`src/plugin-registry.mjs` (~138): `hash = sha256(testo del manifesto)`. Loro: v1 approvata, pacchetto scambiato, gira ancora.
- **Deciso:** impronta di TUTTI i file del pacchetto, nello stesso schema che usa la CLI (leggilo nel loro documento: i due
  archivi di fiducia devono dire la stessa cosa). Ordine dei file deterministico, percorsi normalizzati, niente che segua
  collegamenti fuori dal pacchetto (⛔ su Windows le giunzioni: non attraversarle), tetto di dimensione dichiarato.
- **Costo accettato:** i plugin già approvati richiedono di nuovo la fiducia. Deve uscire come RICHIESTA con una frase umana
  («Il contenuto di questo plugin è cambiato da quando l'hai approvato»), mai come errore, mai con nomi tecnici. Cerca prima
  come la UI mostra oggi un trust invalidato e riusa quella via; se serve un file del frontend, FERMATI e scrivimelo.
- RED: approva v1, cambia un file che non è il manifesto, il plugin NON gira e chiede. Al contrario: niente cambia → gira.

### 3 · CLI-REQ-01 — il comando digitato che fallisce esce 0
`src/kernel/talosHarness.mjs` ~4432-4445 `codaCheStampaLaCartella`; unico chiamante con `tracciaCartella: true` è
`agent-service.mjs` ~2060 (`!comando` della persona). L'attrezzo `shell` del modello NON è toccato: verificalo e non toccarlo.
- POSIX: la loro coda (`__talos_rc=$? ; printf … ; pwd ; exit $__talos_rc`) dà codice E cartella. Adottala, misurata da te.
- cmd: **l'owner vuole tutte e due le cose se si può; se non si può, vince il CODICE D'USCITA** sulla cartella. La loro coda
  `&& (echo.MARK& cd)` perde la cartella al fallimento; le varianti con `%ERRORLEVEL%`/`!ERRORLEVEL!` le hanno misurate
  inesatte su tre casi. Fonte letta il 17/09/2026: ss64 «Errorlevel» (https://ss64.com/nt/errorlevel.html) — ERRORLEVEL si
  riscrive a ogni comando e va salvato subito; «Exit» (https://ss64.com/nt/exit.html). Fai la TUA ricerca prima di scrivere.
  Candidata da misurare, non da credere: `comando && (echo.MARK& cd) || (echo.MARK& cd& exit /b <codice>)` — il problema è
  proprio `<codice>`. Se nessuna forma regge la loro tabella 15/15 (comprese le trappole `exit.bat`/`cd.bat`/`set.bat`),
  adotta la loro e, al fallimento, chi chiama TIENE l'ultima cartella nota (accertalo: `staccaCartellaFinale` senza marcatore
  che cosa restituisce? la cartella di stato non deve azzerarsi).
- Il commento a ~4440 («`;` e non `&&`») va riscritto dichiarando il costo. `kernel-cartella-finale-windows.test.mjs` esiste:
  estendilo con la loro tabella, su cmd VERO e su WSL vero (salta con motivo se WSL non risponde: ha guasti transitori).
- ⛔ Kernel: `npm run kernel:controlla` e `npm run test:kernel` interi.

## Vincoli
File tuoi: `src/pty-terminal.mjs`, `src/plugin-registry.mjs` (+ il suo store di fiducia), `src/kernel/talosHarness.mjs` (SOLO
la coda e il suo commento), i test relativi. Mai `mobile/`, `core/`, frontend, la lane della CLI. RED → GREEN → al contrario con
ripristino per copia e sha256. Nei test nuovi niente `rmSync` nudo (cancello BC09: usa l'aiuto che usano gli altri test).
Porte: mai 4174, 4177, 9333. Nessun giro col modello. Segreti mai su riga di comando né nei log (nelle prove usa valori finti
tipo `'a'.repeat(64)`). Commit a pezzi coerenti, uno per richiesta, in INGLESE, da file, senza trailer. Alla fine la suite
backend INTERA da sola: `node --test tests/*.test.mjs labs/electron-shell/*.test.mjs`, conteggi interi nel rapporto.
Rapporto: per richiesta — misurato vs letto, fonti con data, il NON verificato per nome.

## CLI-REQ-03 (va nel brief di PO-27, non qui)
`runtime-owner-adapter.mjs` ~845 lancia `PROVIDER_KEY_MISSING`; il catch del ripiego (~954-958) lo riclassifica in «Il fornitore
non ha accettato la richiesta.» e scrive un consumo per una chiamata mai partita. Prima si RIPRODUCE (loro l'hanno solo letto).
Cura: l'errore di contratto si rilancia com'è, nessun record di consumo, e a schermo «Manca la chiave di <nome umano del
fornitore>» con l'azione «Collega un modello» di PO-27.
