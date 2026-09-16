# Ledger di codice — “Apri cartella con TALOS” su Windows

Data: 1 settembre 2026  
Owner: TALOS UI + backend locale Harness Desktop  
Fuori perimetro: `mobile/`, installer/MSIX definitivo, DLL COM
`IExplorerCommand`, push e riavvio del server owner su `127.0.0.1:4174`.

## Obiettivo verificabile

Dal menu contestuale di una cartella Windows, una scelta esplicita crea
un'intenzione workspace autenticata, apre TALOS sulla schermata di nuova
sessione e pre-seleziona quella cartella. Il percorso assoluto resta server-side
e la policy non viene promossa automaticamente a `Full access`.

Ricerca vincolante: `.claude/DOSSIER-RICERCA-OPEN-WITH-TALOS-WINDOWS-2026-09-01.md`.
Decisione upstream: **ADAPT** oggi; **ADOPT `IExplorerCommand`** nella fase
Installer. Riferimento maturo esatto: VS Code
`df2411cf7d8f2e0cfc79109a3bc8eaab2c69165b`.

## Inventario file e simboli

### File da creare

1. `harness-ui/src/workspace-launch-store.mjs`
   - `WorkspaceLaunchError`
   - `createWorkspaceLaunchStore(options)`
   - metodi pubblici `create()`, `inspect()`, `resolve()`, `consume()`
2. `harness-ui/tests/workspace-launch-store.test.mjs`
   - scenari `OPEN-WITH-TALOS-STORE-01..08`
3. `harness-ui/tests/http-routes-workspace-launch.test.mjs`
   - scenari `OPEN-WITH-TALOS-HTTP-01..07`
4. `harness-ui/tests/windows-open-with-talos.test.mjs`
   - scenari `OPEN-WITH-TALOS-WINDOWS-01..05`
5. `harness-ui/scripts/windows/open-with-talos.ps1`
   - parametri pubblici `WorkspacePath`, `BaseUrl`, `TokenFile`, `NoBrowser`
6. `harness-ui/scripts/windows/register-open-with-talos.ps1`
   - parametri pubblici `Unregister`, `BaseUrl`, `RegistryRoot` (quest'ultimo
     consente al test di usare una chiave HKCU isolata invece delle voci reali)
7. `.claude/CONSEGNA-OPEN-WITH-TALOS-WINDOWS-2026-09-01.md`

### File da modificare

1. `harness-ui/src/http-app.mjs`
   - dipendenza `workspaceLaunchStore`
   - POST `/api/v1/workspace-launches`
   - GET `/api/v1/workspace-launches/:id`
   - `requireWorkspaceLaunchBody()`
   - codici pubblici `WORKSPACE_LAUNCH_UNAUTHORIZED`,
     `WORKSPACE_LAUNCH_NOT_AVAILABLE`, `WORKSPACE_NOT_AVAILABLE`
   - `requireCustomTaskBody()` accetta `workspaceLaunchId` come terza scelta
     mutuamente esclusiva
2. `harness-ui/src/session-registry.mjs`
   - dipendenze `resolveWorkspaceLaunchFn`, `consumeWorkspaceLaunchFn`
   - `avviaLibero()` risolve il percorso server-owned e consuma l'intenzione
     soltanto dopo la creazione riuscita
3. `harness-ui/server.mjs`
   - crea lo store con `harness-ui/.workspace-launch-token`
   - lo inietta in HTTP e session registry
4. `harness-ui/public/app.js`
   - `leggiWorkspaceLaunchId()`
   - `apriWorkspaceDaLauncher()`
   - `avviaSessionePendente()` e `startCustomSession()` propagano
     `workspaceLaunchId`
   - il fragment viene rimosso dalla cronologia dopo la gestione
5. `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
   - scenario visuale e funzionale `OPEN-WITH-TALOS-BROWSER-01`
6. `harness-ui/tests/session-registry.test.mjs`
   - scenari `OPEN-WITH-TALOS-REGISTRY-01..04`
7. `harness-ui/README.md`
   - uso, rimozione, limite Windows 11 e consegna all'installer
8. `.gitignore`
   - `harness-ui/.workspace-launch-token`

### File da eliminare

Nessuno.

## RED nominati ed errore atteso

1. `OPEN-WITH-TALOS-STORE-01`: oggi lo store non esiste; import fallisce.
2. `OPEN-WITH-TALOS-HTTP-01`: POST autenticata oggi torna 405.
3. `OPEN-WITH-TALOS-HTTP-02`: credenziale errata deve tornare 403 senza
   rivelare se il percorso esiste.
4. `OPEN-WITH-TALOS-REGISTRY-01`: `workspaceLaunchId` oggi è rifiutato dal
   parser HTTP e da `avviaLibero`.
5. `OPEN-WITH-TALOS-BROWSER-01`: il fragment oggi non prepara alcuna sessione.
6. `OPEN-WITH-TALOS-WINDOWS-01`: gli script e le chiavi HKCU oggi non esistono.

## GREEN focalizzati

```text
node --test harness-ui/tests/workspace-launch-store.test.mjs
node --test harness-ui/tests/http-routes-workspace-launch.test.mjs
node --test harness-ui/tests/session-registry.test.mjs
node --test harness-ui/tests/windows-open-with-talos.test.mjs
npm run test:browser -- --grep OPEN-WITH-TALOS
```

## Regressioni e gate più ampi

```text
node --test harness-ui/tests/*.test.mjs
npm run verify
npm run test:browser
npm run test:visual
npm run build
git diff --check
```

## Emendamento dopo il primo ciclo RED

1. `OPEN-WITH-TALOS-REGISTRY-01`: il test iniziale cercava `permessi` nel
   contratto interno passato al kernel. L'ispezione del contratto esistente ha
   confermato che `Workspace write` è rappresentato dall'assenza di
   `livelloAccesso: "Full access"` e di una callback di approvazione; il valore
   leggibile resta nella sessione del registro. Il test viene quindi corretto
   per verificare questi simboli reali e la policy persistita, senza cambiare
   il contratto produttivo.
2. `OPEN-WITH-TALOS-STORE-04`: `path.join()` normalizzava il `..` già nella
   preparazione del test, rendendo identici input e risultato atteso. Il test
   passa ora deliberatamente una stringa non canonica e verifica che lo store
   restituisca il `realpath` canonico. Nessun cambio di comportamento prodotto.
3. `OPEN-WITH-TALOS-WINDOWS-03/04`: la prima implementazione usava
   `RegistryKey.SetValue()` sull'oggetto restituito dal provider PowerShell,
   aperto in sola lettura. La prova reale HKCU ha restituito
   `UnauthorizedAccessException`; la scrittura del valore predefinito viene
   sostituita con il cmdlet supportato `Set-Item -Value`, mantenendo invariati
   ambito, quoting e rollback. I due test restano il gate permanente.
4. La lettura di verifica di `OPEN-WITH-TALOS-WINDOWS-03` raggruppava due
   cmdlet con una virgola senza racchiudere ciascuna invocazione: PowerShell
   terminava correttamente ma non produceva l'array JSON atteso. La fixture
   viene corretta con due espressioni parentetiche, come già fa lo scenario
   04; la registrazione prodotto non cambia.
5. `OPEN-WITH-TALOS-BROWSER-01`, ispezione dello screenshot 1440×900: il
   centro dichiarava “Sessione pronta su Progetto Ω”, mentre Files mostrava
   ancora “Nessuna cartella ancora scelta”. La preview via launch id non può
   leggere i file prima del primo messaggio (il percorso deve restare
   server-side), ma deve mostrare la radice scelta e spiegare che i file
   arriveranno all'avvio. Il test visuale verifica entrambe le frasi e impedisce
   il ritorno del placeholder contraddittorio.
6. Il gate `legacy-contract-snapshot` ha rilevato esattamente i due cambi
   pubblici intenzionali: nuovo hash/dimensione di `public/app.js` e nuovo
   frammento `/api/v1/workspace-launches`. La fixture viene aggiornata con
   l'estrattore AVM esistente e il test di baseline acquisisce un'asserzione
   esplicita sul nuovo endpoint; HTML, CSS, globali, storage ed eventi restano
   invariati.
7. La suite browser completa ha superato 35 scenari e interrotto soltanto la
   matrice visuale: dopo l'estensione preesistente da 12 a 24 screenshot, il
   test conservava il default Playwright di 30 secondi e veniva terminato
   durante la 19ª cattura. La documentazione ufficiale prescrive un timeout
   locale per il test lungo; `visual-matrix.spec.mjs` usa quindi 120 secondi,
   senza allargare i gate funzionali o le attese delle asserzioni.
8. Ispezione manuale dei 24 screenshot: nelle tre varianti Impostazioni la
   chat precedente e il composer restano visibili attraverso la nuova vista.
   È una regressione preesistente ma bloccante secondo il contratto AVM. Viene
   aggiunto `SETTINGS-VIEW-ISOLATION-01` a
   `frontend/tests/browser/baseline-shell.spec.mjs`; GREEN richiede una sola
   `.view-pane.active`, chat e composer non visibili dopo la transizione e
   contenuto Impostazioni visibile.
   RED misurato: anche dopo 400 ms restano due viste `active`. La causa è il
   guard di `setView()`: leggeva la generazione corrente della vista in uscita
   senza assegnarne una alla chiusura. La correzione usa
   `prossimaGenerazione(previous)` come id della specifica uscita; una
   riapertura lo invalida, la chiusura ordinaria lo conserva.
9. I primi gate HKCU rimuovevano correttamente i due verbi prodotto, ma
   lasciavano la radice isolata del test vuota sotto `HKCU\\Software\\Classes`.
   `OPEN-WITH-TALOS-WINDOWS-03/04/05` registrano ora un teardown sulla radice
   univoca del test: la prova resta fedele al rollback prodotto e non accumula
   contenitori temporanei nel profilo Windows.

`npm` viene eseguito in `harness-ui/frontend`. Il server owner 4174 non viene
fermato; i test HTTP usano porte effimere e la verifica browser usa il webServer
isolato della suite.

## Prova reale e visibile

1. Registrare le due chiavi per-utente con
   `register-open-with-talos.ps1` e leggerne valori e comandi dal Registro.
2. Aprire Esplora file, verificare il verbo sulla cartella selezionata e sullo
   sfondo della cartella; su Windows 11 controllare anche **Mostra altre
   opzioni**.
3. Invocare il launcher reale contro un server di prova, con cartella contenente
   spazi e caratteri Unicode.
4. Screenshot TALOS desktop dopo l'apertura: titolo `Nuova · <cartella>`, chat
   vuota, workspace visibile e composer invariato.
5. Prova contraria: token errato, percorso file, cartella rimossa, intenzione
   scaduta, doppio consumo e server non raggiungibile.
6. Una nuova sessione deve inviare `workspaceLaunchId` e la policy corrente;
   il corpo non deve contenere `cartellaLibera` né inventare `Full access`.

## Recovery, rollback e installer

- Fallimento prima della creazione sessione: intenzione ancora disponibile
  fino alla scadenza; l'owner può riprovare.
- Successo: consumo monouso; reload della sessione usa la persistenza ordinaria.
- Rollback prodotto: rimuovere endpoint/store/cablaggio frontend e token locale.
- Rollback Windows: eseguire `register-open-with-talos.ps1 -Unregister`; non
  cancellare sessioni, modelli o workspace.
- Installer: sostituire gli script/chiavi legacy con eseguibile stabile,
  single-instance IPC e `IExplorerCommand`; install/uninstall devono possedere
  la registrazione e non contenere alcun percorso di checkout.
