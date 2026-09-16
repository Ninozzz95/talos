# R-01 — registro esecutivo prima delle modifiche

Sottosistema: TALOS UI, lane/harness-desktop. Base dichiarata 71506cb2; albero iniziale pulito. Nessuna scrittura Git, nessuna porta 4174, nessuna chiamata a pagamento. Regole specifiche del lotto prevalgono sulle suite complete e sulla verifica del server dell'owner. Piani dell'owner letti in `../.claude/` (non in `harness-ui/.claude/`).

## Ricerca e decisione upstream (consultazione 12/09/2026, ora locale da registrare nelle prove)

- [Electron 44.3.0, 08/09/2026](https://releases.electronjs.org/release/v44.3.0): pin esatto richiesto, MIT; Chromium 152.0.7977.78, Node 24.20.0 dichiarati dalla fonte, da misurare nel binario.
- [Ambiente Electron](https://www.electronjs.org/docs/latest/api/environment-variables): adozione diretta di `ELECTRON_RUN_AS_NODE=1`, fuse `runAsNode` da mantenere acceso in R-02. Nessun Node dal PATH nel prodotto.
- [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process): valutato, non scelto per R-01; aggiungerebbe Services API Chromium/MessagePort al contratto esistente. `spawn(process.execPath)` conserva ChildProcess, ambiente, handshake e IPC Node per spegnimento/misure.
- [app](https://www.electronjs.org/docs/latest/api/app), [Tray](https://www.electronjs.org/docs/latest/api/tray), [shell](https://www.electronjs.org/docs/latest/api/shell): adozione diretta di lock, evento seconda istanza, menu nativo, openExternal/openPath; tutte le azioni originate dal main, nessun ponte privilegiato nel renderer.
- [Sicurezza](https://www.electronjs.org/docs/latest/tutorial/security): isolamento e sandbox espliciti, niente Node/preload, blocco navigazioni fuori origine e nuove finestre non autorizzate.
- [Moduli nativi Electron](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules), [node-pty](https://github.com/microsoft/node-pty), [rebuild](https://github.com/electron/rebuild): verificare il vero 1.1.0 esistente prima di introdurre rebuild. MIT. Il pacchetto installato dipende da node-addon-api 7; la sola diversità di NODE_MODULE_VERSION non prova incompatibilità di un addon Node-API. Se fallisce, emendamento prima di integrare rebuild nel solo desktop.
- [Playwright Electron](https://playwright.dev/docs/api/class-electron): `_electron.launch`, `firstWindow`, evaluate del main e della pagina; usare 1.62.1 già installato nel frontend senza modificarlo. API sperimentale, gate sul vero binario.
- [Node net.Server](https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback): adattamento piccolo di listen(0) per ottenere una porta effimera. Il server attuale rifiuta 0 (src/config.mjs:353); niente patch fuori perimetro. Prenotazione poi rilascio: collisione gestita come avvio fallito/backoff, mai ripiego a 4174.
- [Ollama app](https://github.com/ollama/ollama/tree/main/app): Go, webview e wintray; non è un esempio di ABI Electron. Valutato come riferimento di integrazione nativa, non adottato perché l'owner ha scelto Electron.
- Hermes: clone locale richiesto, `apps/desktop/package.json`, `electron/backend-command.ts`, `electron/terminal-ipc.ts`, `scripts/stage-native-deps.mjs`: Electron 40.10.2, node-pty 1.1.0 nel main, rebuild 4.2.0 e staging/as arUnpack. Non copiare la sua architettura IPC renderer: TALOS mantiene le API HTTP esistenti.

## File previsti (nessun altro file prodotto autorizzato)

Creare `desktop/package.json`, `desktop/package-lock.json`, `desktop/.gitignore`, `desktop/README.md`, `desktop/main.mjs`, `desktop/lifecycle.mjs`, `desktop/window-state.mjs`, `desktop/runtime.mjs`, `desktop/child-bootstrap.mjs`, `desktop/log.mjs`, `desktop/scripts/genera-icone.mjs`, `desktop/scripts/prova-pty.mjs`, `desktop/assets/talos.png`, `desktop/assets/talos-tray.png`, `desktop/tests/lifecycle.test.mjs`, `desktop/tests/window-state.test.mjs`, `desktop/tests/runtime.test.mjs`, `desktop/tests/log.test.mjs`, `desktop/tests/guscio.spec.mjs`, `desktop/tests/fixtures/figlio-guasto.mjs`, `desktop/tests/fixtures/avvio-guasto.mjs`.

Modificare soltanto `labs/electron-shell/README.md` aggiungendo la riga di rimando. Copiare i moduli dal lab, mantenere gli originali: il movimento Git compete all'owner.

Evidenze previste: `.claude/RAPPORTO-R01-GUSCIO-ELECTRON-2026-09-13.md`, `.claude/R01-red.txt`, `.claude/R01-test.txt`, `.claude/R01-puri.txt`, `.claude/R01-pty.json`, `.claude/R01-misure.json`, `.claude/R01-chiaro-1024.png`, `.claude/R01-chiaro-1440.png`, `.claude/R01-scuro-1024.png`, `.claude/R01-scuro-1440.png`. Directory temporanee dei test e node_modules/lock nel solo desktop; nessun build/frontend/dist.

## Contratti e simboli

Compatibilità: `STATI`, `BACKOFF_MS_DEFAULT`, `creaCicloDiVita` e metodi `avvia`, `chiudi`, `sospendi`, `riprendi`, `figlioUscito`, `stato`, `handle`, `transizioni`, `riavviiConsecutivi`; aggiunta `riprova`. `STATO_FINESTRA_DEFAULT`, `leggiStatoFinestra`, `salvaStatoFinestra`: schema geometria esistente più booleano `restaNelVassoio`, default false. Nessuna migrazione, classe o contratto del kernel modificato.

Nuovi export: `risolviPercorsi`, `creaAvvioFiglio`, `scegliPortaEffimera`, `validaHandshake`, `urlIngresso`, `creaRegistro`. IPC privato padre/figlio: `chiudi`, `misura`, `misura` con pid/versions/memoryUsage; nessun segreto nel messaggio. Percorso confezionato dichiarato: resources/harness-ui/server.mjs, con dipendenze e public reali esterni ad asar; sorgente: padre di app.getAppPath(); override assoluto TALOS_DESKTOP_HARNESS_DIR per provarlo.

## RED → GREEN e scenari permanenti

RED prima del codice nuovo: R01-PERCORSI (export mancante), R01-AMBIENTE (execPath, no argomenti segreti, host/porta/store isolati), R01-HANDSHAKE (rifiuta host remoto/porta 4174/porta diversa), R01-VASSOIO (default false e roundtrip), R01-LOG (segreto diviso fra chunk), R01-CICLO-ORFANO (salute fallita deve uccidere il vecchio figlio), R01-CICLO-CHIUSURA-AVVIO (handle tardivo deve essere ucciso), R01-CICLO-RIPROVA (arreso ripartibile), R01-CICLO-RISVEGLIO-TARDIVO (chiusura vince). Conservare tutti gli 8 test del lab e aggiornare il solo oggetto atteso per il nuovo campo.

GREEN: `npm run test:puri` e `npm test` dentro desktop; npm test serializza puri e `node --test tests/guscio.spec.mjs`. Niente suite intera. Real-upstream gate: Electron 44.3.0 in modalità Node carica node-pty esistente ed esegue una PTY fino a exit; poi finestra reale → cookie/health 200 contro 401 → UI Terminale → echo TALOS-R01 → uscita; PID figlio assente dopo close; seconda istanza chiude e prima riceve focus; tray on/off e persistenza; errore di avvio mostra dialogo con Riprova/Apri il registro; reload, tastiera, reduced-motion e screenshot chiaro/scuro a 1024x800 e 1440x900.

Misure: performance.now prima di launch fino a firstWindow e pagina pronta (metriche distinte), process.memoryUsage main/figlio + app.getAppMetrics dopo attesa dichiarata; macchina e versioni nel JSON. Segreti mai stampati. Limiti di shell.openExternal/URL di bootstrap da verificare e dichiarare: non promettere cancellazione dalla cronologia di tutti i browser.

Rollback: owner rimuove i soli nuovi file desktop e la riga di rimando, conserva il lab intatto; nessun dato preesistente toccato. Upgrade pin richiede nuovamente ABI, E2E, lifecycle e confronto schermate. R-02/03/04 esclusi.

## Emendamento A — prova runtime, 12/09 ore 20:58 locali

ABI reale 149, Node 24.20.0, Electron 44.3.0: node-pty 1.1.0 caricato, ConPTY stampa TALOS-R01 ed esce 0. Il node_modules del worktree è una giunzione al repo dell'owner: nessuna modifica alla destinazione. Nessun rebuild necessario su questa macchina.

Il renderer della sola conversione icone fallisce anche sotto Playwright con `ERR_FAILED` e processo GPU `-1073741515`, DPAPI `0x2`; non è ancora dimostrata la causa. Non togliere sandbox/isolamento per produrre prove verdi. La conversione non deve dipendere dall'avvio di una GUI: adottare direttamente [resvg-js](https://github.com/thx/resvg-js/blob/main/README.md), pin 2.6.2 (MPL-2.0), devDependency nel solo desktop. Stessi file script/PNG già enumerati; cambiare `icone` in `node scripts/genera-icone.mjs`. Il README documenterà licenze e provenienza. Proseguire con i gate reali; fallimenti dichiarati, mai screenshot inventati.

Lo script di prova PTY termina esplicitamente dopo l'evento di uscita e il salvataggio: node-pty lascia un handle di gestione aperto in questo piccolo processo diagnostico. Il prodotto usa invece lo shutdown del server via IPC privato. `genera-icone.mjs` inizialmente attendeva app.whenReady al livello superiore ESM: spostato in callback prima della successiva prova; il nuovo script resvg elimina questa dipendenza.

## Emendamento B — isolamento dei dati reali del backend

`server.mjs` costruisce `.workspace-launch-token` e altri store rispetto a import.meta.url, oltre alla directory sessioni configurabile. I gate useranno una copia byte-identica del solo server in `desktop/.prove/<prova>/harness-ui/server.mjs`, con giunzioni in sola lettura d'uso verso src/public/node_modules esistenti. TALOS_DESKTOP_HARNESS_DIR prova così il percorso dichiarato senza scritture negli store dell'owner. Nessun sorgente del backend viene modificato; le copie sono artefatti ignorati di test. Il contratto R-02 per stato scrivibile completo richiede handoff al backend e verrà descritto nel rapporto.

Aggiungere `desktop/tests/backend.spec.mjs` al gate seriale: processo Electron in modalità Node → backend vero isolato → redirect/cookie/health/WS+PTY → spegnimento via IPC/ESRCH e misura RSS del figlio. È una prova distinta dal percorso grafico, non lo sostituisce. Nuova evidenza `.claude/R01-backend.json`; gli errori grafici restano fallimenti in npm test.

Emendamento B2: il worktree manca di context-engine/node_modules (zod 4.5.4). Aggiungere desktop/tests/support.mjs: copia byte-identica di server, src e context-engine/src e package.json sotto la sola .prove; giunzioni node_modules già disponibili (zod 4.5.4 e sqlite-vec del repository), public invariato. Così si prova il backend completo senza installare o modificare dipendenze fuori desktop. Il problema del worktree rimane dichiarato. Nessun adattatore di risoluzione globale o monkey patch nel prodotto.

Chiusura del registro: export di supporto ai test root, attendi, preparaRuntime. Nessun preload o IPC renderer aggiunto. Prova nativa identifica prebuilds/win32-x64/conpty.node, non una compilazione locale per Node 24. Gate finale: 17/17 puri, 1/1 backend, 0/2 Electron grafici; acceptance bloccata prima di firstWindow. Il crash del main lascia comunque il figlio ESRCH (R01-misure.json). Non sono state prodotte schermate o misure inventate. Il riuso di shell.openExternal con il token nel redirect richiesto non certifica il divieto assoluto di credenziali nella riga di comando del browser; limite esplicito nel rapporto.
