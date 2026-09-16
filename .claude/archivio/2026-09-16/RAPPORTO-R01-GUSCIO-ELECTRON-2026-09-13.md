# Rapporto R-01 — guscio Electron — consegna richiesta 13/09/2026

**Esito: implementazione su disco, R-01 NON accettata.** I 17 test puri e il gate del backend reale passano; i due gate grafici Electron falliscono prima della prima finestra. L'ABI di node-pty è verificata e non richiede rebuild su Windows x64. Restano il blocco grafico e il limite del passaggio al browser descritto sotto.

Il nome del rapporto segue la consegna. Le prove sono state eseguite **12/09/2026**, fino alle **21:09 Europe/Rome**; i JSON registrano UTC. Base effettiva verificata: **71506cb2**. Sottosistema TALOS UI, lane/harness-desktop. Nessun `git add`, commit, push o movimento Git; nessuna porta 4174 usata; nessuna chiamata a modelli a pagamento. Nessun delegato avviato.

## 1. Ricerca, fonti e decisioni

Tutte le fonti sotto sono state consultate il **12/09/2026**. Le pagine Electron `latest` sono documentazione corrente; il binario e il lock del lavoro sono fissati a **44.3.0**, non a latest. Registro scritto prima del codice: [LEDGER-R01](LEDGER-R01-GUSCIO-ELECTRON-2026-09-13.md), con gli emendamenti dovuti alle prove.

| Fonte primaria | Fatto verificato e decisione |
|---|---|
| [Electron 44.3.0](https://releases.electronjs.org/release/v44.3.0), pubblicata 08/09/2026 | Electron 44.3.0, Chromium 152.0.7977.78, Node 24.20.0; stessi valori letti dal processo reale. Adozione diretta, pin esatto. |
| [ELECTRON_RUN_AS_NODE](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node) | Avvia il Node incluso; richiede fuse runAsNode acceso. Scelto `spawn(process.execPath)`, senza ricerca di Node sul PATH. |
| [utilityProcess.fork](https://www.electronjs.org/docs/latest/api/utility-process) | Alternativa ufficiale con Services API Chromium e MessagePort. Valutata e non scelta: il contratto ChildProcess/handshake del lab basta e rende misurabile esattamente il runtime richiesto. Nessun vantaggio ABI assunto. |
| [app / istanza unica e percorsi](https://www.electronjs.org/docs/latest/api/app) | Lock acquisito prima di creare figli, seconda istanza restituisce il fuoco; getAppPath e resourcesPath definiscono i due layout. |
| [Tray](https://www.electronjs.org/docs/latest/api/tray) e [Menu](https://www.electronjs.org/docs/latest/api/menu) | Oggetto Tray mantenuto vivo, menu nativi italiani, distruzione alla chiusura. Adozione diretta. |
| [shell](https://www.electronjs.org/docs/latest/api/shell) | openExternal passa l'URL all'applicazione associata; openPath restituisce anche l'errore di apertura del registro. Il redirect HTTP non certifica la riga di comando del browser di sistema. |
| [Sicurezza Electron](https://www.electronjs.org/docs/latest/tutorial/security) | Renderer isolato, senza Node, sandbox esplicita, niente preload, navigazione limitata all'origine del servizio e nuove finestre negate. |
| [Moduli nativi](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) e [electron/rebuild](https://github.com/electron/rebuild) | Le ABI possono differire; rebuild ufficiale valutato come via di recupero, non installato perché la prova reale è riuscita. Un aggiornamento richiede la stessa prova. |
| [node-pty README](https://raw.githubusercontent.com/microsoft/node-pty/main/README.md) | Supporto Electron e ConPTY, requisito Windows 10 1809+ dichiarato da upstream. La pagina letta **non contiene** la ricetta «prebuild per runtime=electron»: non le attribuisco quella frase. Il pacchetto locale 1.1.0 cerca build/Release, build/Debug, poi prebuilds/piattaforma-architettura. |
| [Node-API](https://nodejs.org/api/n-api.html) | Node-API offre stabilità ABI con condizioni. Il sorgente locale conpty.cc usa Napi e node-addon-api: spiega il risultato, ma la decisione si basa anche sul caricamento e sulla PTY reali. |
| [Playwright Electron](https://playwright.dev/docs/api/class-electron) | launch, firstWindow ed evaluate del main; API sperimentale. Riutilizzato Playwright 1.62.1 del frontend senza installazioni o modifiche lì. |
| [Node net.Server](https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback) | listen(0) assegna la porta. Il server TALOS rifiuta 0: piccolo adattamento nel guscio, con collisione gestita dal ciclo e nessuna porta fissa. |
| [resvg-js](https://github.com/thx/resvg-js/blob/main/README.md) | Rasterizzazione SVG upstream. Adottato 2.6.2 esatto, sola devDependency, dopo il fallimento della conversione attraverso una finestra Electron. Nessuna nuova geometria del marchio. |
| [Ollama app](https://github.com/ollama/ollama/tree/main/app) e [wintray/tray.go](https://github.com/ollama/ollama/blob/main/app/wintray/tray.go) | App Go con webview e tray Win32, interfaccia con UITerminate/UIRunning/Quit. Riferimento di separazione del ciclo di vita; non dimostra nulla sull'ABI Electron e non è stato copiato nel prodotto. |

**Hermes letto dal clone richiesto:** commit **365e2835d490a053d076daa3b429371d6f35210f** (HEAD letto dai file Git, senza modificare safe.directory). `apps/desktop/package.json`: Electron 40.10.2, node-pty 1.1.0, rebuild 4.2.0; `electron/backend-command.ts`: backend separato e porta 0; `electron/terminal-ipc.ts`: node-pty nel main; `scripts/stage-native-deps.mjs`: staging delle dipendenze native. Il package dichiara asarUnpack per moduli/prebuild/dist. TALOS conserva HTTP/WS e un renderer senza ponte privilegiato, coerentemente con il confine esistente.

Licenze dichiarate dai pacchetti: Electron e node-pty MIT, Playwright Apache-2.0, resvg-js MPL-2.0. Il nuovo package dichiara AGPL-3.0-only secondo §5 dell'owner. I notice delle dipendenze devono accompagnare la futura distribuzione; nessuna pipeline di packaging è stata aggiunta.

## 2. Cosa è stato implementato

- Copia del lab in `desktop/`, originali lasciati intatti. Al README del lab aggiunta soltanto la riga richiesta e una separazione vuota. Nessun `git mv`.
- `talos-desktop@0.1.0`, main ESM, start, test seriale, test:puri, test:guscio, icone, prova:pty; Electron 44.3.0 e resvg-js 2.6.2 con lock.
- Avvio con lo stesso eseguibile Electron e variabile di modalità Node, token casuale da 64 caratteri solo nell'ambiente del figlio, host 127.0.0.1 e porta effimera esplicita. NODE_OPTIONS/NODE_PATH e il vecchio TALOS_PACKAGED_NODE non vengono ereditati.
- Handshake controllato contro host e porta richiesti; health autenticata con timeout; rifiuto di host estranei e porta 4174.
- Finestra protetta, tema e interfaccia serviti dal public esistente, nessuna modifica frontend. Bounds e scelta del vassoio nel profilo desktop.
- Tray con marchio PNG Calm, menu «Apri TALOS», «Apri nel browser», «Esci»; voce browser anche nel menu della finestra, azioni di modifica e visualizzazione in italiano.
- Chiudi finestra termina il servizio; opzione «Resta nel vassoio alla chiusura» false di serie. Spegnimento IPC sul canale privato, così Windows esegue gli handler SIGTERM del server; fallback dopo 5 secondi. La perdita del padre fa chiudere il figlio.
- Conservati backoff e sospensione/risveglio. Corretti figlio vivo dopo health fallita, handle consegnato dopo chiusura, risposta tardiva al risveglio, timer di generazioni superate. Aggiunto riprova dopo arreso.
- Dialogo di resa disponibile anche senza finestra, con «Riprova», «Apri il registro», «Esci». Registro con oscuramento dei segreti anche quando divisi tra chunk; nessun URL autenticato stampato dal guscio.

**Limite esplicito del browser:** il codice riusa `shell.openExternal(base + '/?token=…')`, come richiesto, e il server risponde 302 con cookie e URL finale pulito. Il token è assente dagli argomenti del figlio e dai log prodotti, ma l'associazione Windows può passare quell'URL negli argomenti del browser. Il browser reale non è stato aperto durante le prove. **Non dichiaro rispettato il divieto assoluto sui segreti nella riga di comando del browser**, né la cancellazione da ogni cronologia. Prima dell'accettazione occorre un passaggio browser che non esponga la credenziale permanente; il server attuale accetta soltanto quella. Nessuna modifica al contratto di autenticazione è stata nascosta nel guscio.

## 3. node-pty: prova e decisione

Evidenza completa [R01-pty.json](R01-pty.json), ultima prova 19:09:14 UTC:

| Voce | Risultato |
|---|---|
| Eseguibile | desktop/node_modules/electron/dist/electron.exe |
| Modalità | ELECTRON_RUN_AS_NODE=1 |
| Electron / Node / ABI / Node-API | 44.3.0 / 24.20.0 / 149 / 10 |
| Modulo JS | node-pty 1.1.0 già presente nel repository |
| Binario realmente caricato | **prebuilds/win32-x64/conpty.node** |
| SHA-256 binario | `ee8f4e6f4dad71939eecfda11de249400e34bfefe4c8b48af13f3b5476f4035b` |
| PTY | cmd.exe /d /q /c echo TALOS-R01 |
| Esito | marcatore ricevuto da onData, onExit exitCode=0 |
| Ricompilazione | **Non necessaria per questo binario e questa macchina** |

Il `harness-ui/node_modules` del worktree è una giunzione: la risoluzione reale finisce in `C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/node_modules/`. Non è stato modificato. La prova smentisce la premessa «.node compilato localmente per Node 24» per il file effettivamente caricato: si tratta del prebuild distribuito.

La prova isolata non sostituisce quella del prodotto: [R01-backend.json](R01-backend.json) esegue anche il vero server con lo stesso Electron, cookie, WebSocket e Git Bash scelta dal backend, fino all'evento `{evento: 'uscita', codice: 0}`.

In caso di futuro errore ABI: ricompilazione upstream con @electron/rebuild o prebuild compatibile nel pacchetto desktop, mai sostituzione con Node dal PATH e mai rebuild in-place delle dipendenze condivise col browser. Non è stato aggiunto un rebuild preventivo non necessario.

## 4. Test, numeri e regressioni

| Comando, da desktop | Risultato fresco | Evidenza |
|---|---|---|
| npm install, con cache locale consentita | riuscito; lock aggiornato | package-lock.json |
| npm run icone | riuscito, PNG 256 e 32 pixel | assets/talos.png, talos-tray.png |
| npm run prova:pty | exit 0 | R01-pty.json |
| npm run test:puri, RED prima del codice | 15 test caricati, 7 pass, 8 fail; import assenti riducono il conteggio | R01-red.txt |
| npm run test:puri, GREEN separato | **17/17**, 182,3771 ms | R01-puri.txt |
| npm test, ultima esecuzione | **18 pass, 2 fail**, exit 1 | R01-test.txt |
| porzione pura di npm test | 17/17, 180,4039 ms | stesso file |
| porzione integrazione di npm test | backend 1/1; Electron grafici 0/2; durata 11104,8255 ms | stesso file |
| git diff --check | riuscito | verifica finale senza modifiche Git |

Il gate backend ha usato **porta 55417**, PID **28084**: health senza cookie 401, cookie errato 401, ingresso 302 con HttpOnly/SameSite=Strict, health col cookie 200, WebSocket anonimo 401, PTY reale con uscita 0, chiusura IPC e **process.kill(pid,0) → ESRCH**.

Sono mantenuti gli 8 casi del lab, più 9 casi nuovi: quattro regressioni del ciclo, tre contratti percorsi/ambiente/handshake, registro e scelta persistente del vassoio. I test di integrazione non chiamano modelli. Le copie di server, src e context-engine sotto `.prove/` sono byte-identiche; public e dipendenze rimangono quelle del repository. Nessuna suite intera, build frontend o server dell'owner.

Il registro finale del backend segnala anche catalogo task del runtime agente non disponibile e, allo shutdown, RUNTIME_OPERATION_UNSUPPORTED / RUNTIME_UNREACHABLE. Il gate non esercita un motore agente o un modello: queste segnalazioni non sono dichiarate risolte e non invalidano gli esiti HTTP/PTY/PID misurati.

I due fallimenti grafici sono espliciti e non saltati:
1. **R01-GUSCIO**: firstWindow si interrompe perché il processo si chiude.
2. **R01-ARRESO**: evaluate perde il main prima della catena di sei avvii falliti.

Log: nove tentativi del processo GPU con **-1073741515**, poi `GPU process isn't usable. Goodbye.`; presente anche errore DPAPI `0x2`. La conversione iniziale di un semplice SVG attraverso BrowserWindow fallisce allo stesso modo. **Causa specifica non identificata**: non attribuisco il guasto con certezza a driver, DLL, Electron o sandbox del runner. L'esecuzione avviene come **CodexSandboxOnline**; l'ispezione CIM dei processi è negata. Nessuna sandbox disattivata per far passare il gate.

Anche dopo il crash effettivo del main, il PID del suo figlio è diventato **ESRCH**, registrato in R01-misure.json. Questo prova il recupero dalla perdita del padre; non prova il clic di chiusura di una finestra funzionante.

## 5. Misure e prova visibile

Macchina rilevata: **Windows 11 Pro 10.0.26200 x64**, **AMD Ryzen 7 7800X3D**, 16 processori logici, **33.944.801.280 byte di RAM** (31,61 GiB). Runner Node 24.18.0; runtime del prodotto Node 24.20.0 dentro Electron 44.3.0.

| Misura | Valore e condizioni |
|---|---|
| launch → prima finestra | **Non misurabile: finestra mai ottenuta**, null nel JSON |
| launch → UI pronta | **Non misurabile**, null |
| RAM guscio + figlio a riposo | **Non misurabile**: main termina prima dello stato di riposo |
| RSS del solo backend | **108.683.264 byte = 103,6484 MiB**, process.memoryUsage, 3 secondi dopo l'uscita della PTY, senza renderer |
| Heap usato del solo backend | 26.489.256 byte nello stesso campione |
| Tempo seconda istanza / focus | **Non misurato** |

Quella del backend è una singola osservazione; non è una misura della RAM totale del prodotto. Lo script grafico contiene la raccolta separata process.memoryUsage/main, app.getAppMetrics e risposta IPC del figlio dopo 3 secondi di riposo, ma non ha raggiunto quel punto.

Ispezionato visivamente il marchio rasterizzato: stessa geometria SVG, accento Calm #c08b3c, trasparenza. PNG 256: 6263 byte; PNG 32: 977 byte. SHA-256:
- talos.png: `2f4b81dc8965c7b913ec0b97ccd6d57a50f3539f48bf02ebc5ce40cda7b6eda7`
- talos-tray.png: `9ba4a65e955653945e8cb539b3bc827debbe7aaf648d157b1172828dc80d969b`

**Non prodotte** le quattro schermate chiaro/scuro 1024×800 e 1440×900. Il test le genera soltanto dopo una vera UI pronta. Nessun confronto visivo dichiarato senza immagini.

## 6. File consegnati e righe

Percorsi relativi a harness-ui. Numeri identificano il punto d'ingresso o il comportamento principale.

| File | Righe / contenuto |
|---|---|
| desktop/package.json | 1, identità/versioni/script |
| desktop/package-lock.json | 1, lock npm e integrità upstream |
| desktop/.gitignore | 1, node_modules e .prove esclusi |
| desktop/README.md | 1, avvio, layout, limiti e provenienza |
| desktop/main.mjs | 18 lock; 46 spegnimento; 62 handshake/health; 83 dialogo; 101 ciclo; 136 browser; 151 menu; 178 finestra; 212 chiusura |
| desktop/runtime.mjs | 5 percorsi; 15 avvio del figlio; 33 porta effimera; 46 handshake; 51 URL d'ingresso |
| desktop/child-bootstrap.mjs | 1, canale IPC, misura e perdita del padre |
| desktop/lifecycle.mjs | 1, macchina a stati trasferita e corretta |
| desktop/window-state.mjs | 1, geometria e restaNelVassoio |
| desktop/log.mjs | 1, registro oscurato |
| desktop/scripts/genera-icone.mjs | 1, conversione upstream del marchio |
| desktop/scripts/prova-pty.mjs | 1, prova ABI/PTY e hash .node |
| desktop/assets/talos.png | binario 256×256 |
| desktop/assets/talos-tray.png | binario 32×32 |
| desktop/tests/lifecycle.test.mjs | 1, casi del lab e regressioni R-01 |
| desktop/tests/window-state.test.mjs | 1, casi del lab e persistenza vassoio |
| desktop/tests/runtime.test.mjs | 1, percorsi, argomenti, ambiente, handshake |
| desktop/tests/log.test.mjs | 1, token diviso tra chunk |
| desktop/tests/support.mjs | 1, runtime di prova isolato e copie dei sorgenti |
| desktop/tests/backend.spec.mjs | 19, integrazione reale e memoria figlio |
| desktop/tests/guscio.spec.mjs | 21 percorso grafico; 151 resa/registro/riprova |
| desktop/tests/fixtures/figlio-guasto.mjs | 1, exit deliberato del banco |
| desktop/tests/fixtures/avvio-guasto.mjs | 1, osservazione dei dialoghi senza API di test nel prodotto |
| labs/electron-shell/README.md | 77: sola riga «spostato in desktop/ (R-01)» |
| .claude/LEDGER-R01-GUSCIO-ELECTRON-2026-09-13.md | 1, piano anteriore alle modifiche ed emendamenti |
| .claude/R01-red.txt | 1, fallimenti iniziali |
| .claude/R01-puri.txt | 1, GREEN separato |
| .claude/R01-test.txt | 1, esito npm test completo |
| .claude/R01-pty.json | 1, runtime e binario caricato |
| .claude/R01-backend.json | 1, HTTP/WS/PTY, memoria ed ESRCH |
| .claude/R01-misure.json | 1, macchina e blocco grafico |
| .claude/RAPPORTO-R01-GUSCIO-ELECTRON-2026-09-13.md | questo rapporto |

Artefatti locali ignorati: desktop/node_modules e desktop/.prove (cache npm/Electron, profili temporanei, copie runtime e giunzioni). Non sono file di distribuzione né modifiche ai target delle giunzioni. Il rapporto elenca i file da revisionare; il lock descrive le dipendenze installate.

## 7. Diff non applicati e passaggi tra sottosistemi

**Nessun file vietato modificato.** Lo stato Git mostra soltanto README del lab modificato, nuovo desktop e nuova .claude. Nessuna modifica a server.mjs, src, frontend, package/lock radice, context-engine, mobile, control-plane, core, docs o .github.

Il server attuale accetta solo porte ≥1024. L'adattatore consegnato lo rispetta. Se l'owner vuole eliminare anche la finestra di collisione tra prenotazione e spawn, questo è il diff minimo proposto, **NON applicato né testato**:

```diff
--- a/harness-ui/src/config.mjs
+++ b/harness-ui/src/config.mjs
@@
-  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
+  if (!Number.isInteger(port) || (port !== 0 && port < 1024) || port > 65535) {
     fail('TALOS_HARNESS_UI_PORT fuori intervallo');
--- a/harness-ui/server.mjs
+++ b/harness-ui/server.mjs
@@
-  const portaAscolto = await trovaPortaLibera(config.port, {
+  await trovaPortaLibera(config.port, {
@@
-  });
-
-  /*
-   * ⭐ 03/9, R-01 — handshake per `scripts/avvia-talos.mjs`: la porta reale
+  });
+  const portaAscolto = server.address().port;
+
+  /*
+   * ⭐ 03/9, R-01 — handshake per `scripts/avvia-talos.mjs`: la porta reale
```

Quel cambiamento richiede caratterizzazione config/handshake/origini WebSocket con porta 0 e porte esplicite, quindi l'aggiornamento dell'adattatore desktop. Il prodotto consegnato non dipende da questo diff.

Passaggi necessari, senza anticipare R-02:
- **context-engine**: questo worktree non ha node_modules; l'avvio dal sorgente originale fallisce su zod 4.5.4. I test isolati usano le dipendenze già disponibili tramite la propria giunzione; l'owner deve ripristinare le dipendenze del worktree per l'avvio sorgente ordinario.
- **server.mjs / stato scrivibile**: diversi store, inclusa .workspace-launch-token, sono relativi al file server. Il percorso confezionato è definito e provato come percorso dichiarato; la rilocazione completa dello stato in userData va concordata prima di distribuire in una cartella d'installazione. Nessun diff di packaging applicato.
- **http-app.mjs / ingresso browser**: il redirect attuale dimostra cookie e URL finale pulito ma non risolve il vincolo assoluto della riga di comando OS. Non ho inventato un endpoint monouso non esistente né spacciato un mock per il browser reale. Il contratto di consegna della credenziale va chiuso insieme al backend prima dell'accettazione.

## 8. Cosa non è verificato

Interazione reale con tray e menu; browser predefinito; prima finestra, focus della seconda istanza e durata relativa; Terminale attraverso la UI Electron; screenshot nei quattro casi; reload/preferenze/tastiera/reduced-motion del renderer; persistenza delle preferenze frontend attraverso un cambio di porta; finestra del dialogo italiano e suo retry reale. Questi passaggi sono scritti nel gate grafico ma **non raggiunti**. Restano non verificati anche installer, asar, macchina senza Node installato, Windows 10/ARM64, firma e altri sistemi operativi: lotti esclusi.

I test provano che il server viene lanciato con electron.exe, non che esista già un pacchetto installabile autonomo. Le preferenze in localStorage dipendono dall'origine/porta: il cambio porta tra processi rimane una limitazione da caratterizzare nel gate grafico.

## 9. Testo di commit proposto

Da usare dall'owner soltanto dopo revisione e chiusura dei gate:

```text
feat(desktop): promuove il guscio Electron R-01 con runtime incluso

Copia il laboratorio in desktop e fissa Electron 44.3.0.
Avvia il backend con execPath in modalità Node, aggiunge tray e menu
italiani, scelta del vassoio, registro e spegnimento IPC su Windows.
Mantiene i test del laboratorio e copre percorsi, credenziali e PTY reale.
```

Controllo finale: zero processi Electron residui del lotto, verificato con Get-Process filtrato sul percorso desktop di questo worktree.

Nessun commit eseguito. Per il movimento Git l'owner deve confrontare le copie già presenti: un git mv diretto verso desktop esistente non va lanciato alla cieca.

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** revisionare i file; ripetere `npm test` in una sessione Windows dove Electron avvia il renderer, identificare il guasto GPU senza ridurre la sandbox, chiudere il passaggio browser delle credenziali e ripristinare le dipendenze context-engine. Solo allora ispezionare le quattro schermate, misurare avvio/RAM totale e accettare R-01. Movimento Git e commit restano suoi.

**Cosa faccio io:** consegno il codice, i test che falliscono visibilmente sui gate mancanti, le prove ABI/HTTP/PTY/ESRCH, i dati grezzi e questo rapporto. Ho mantenuto i confini del lotto e non dichiaro conclusa una verifica che il runner non ha eseguito.

**Cosa rimane:** accettazione grafica e ingresso browser; poi, in lotti separati, R-02 installer/zip, R-03 motore locale, R-04 CI Windows. Nessuno di questi lotti è stato implementato qui.
