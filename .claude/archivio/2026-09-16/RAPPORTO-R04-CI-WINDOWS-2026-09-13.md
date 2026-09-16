# R-04 — CI Windows, installer e provenienza

**Workflow consegnato; accettazione della release ancora bloccata.** Il job desktop
costruisce l'installer Windows R-02 e pubblica soltanto dopo cancelli e smoke
dell'installato riusciti. I 33 test puri e actionlint passano; la build locale
produce EXE e ZIP. Lo smoke reale resta rosso nella sandbox e alcune suite
preesistenti falliscono. Non dichiaro una release pronta né un job GitHub provato.

Rapporto nel percorso richiesto `.claude/` del worktree. Nome datato 13/09 come
da brief; ricerche e prove di questa sessione eseguite il **12/09/2026**, con
timestamp UTC nei JSON. Ambiente locale: Windows 11, build 10.0.26200.0,
PowerShell 7.6.5, Node 24.18.0, npm 11.16.0. Base e HEAD invariati:
`5c3cb15cd056b6adf374cf059a1c043b361477b7`; checkout ancora detached.

Nessun `git add`, commit o push sul worktree; nessun tag remoto o job GitHub
avviato. Nessun uso della porta 4174 o chiamata a servizi a pagamento.
Conservati `.claude/R04-BASE.txt` e i rapporti preesistenti in `harness-ui/.claude/`.
Il [ledger](LEDGER-R04.md) precede gli interventi e registra le rettifiche TDD.

## Ricerca e decisioni upstream

Tutte le fonti seguenti sono state consultate il **12/09/2026**. Le versioni
dell'immagine ospitata possono cambiare: il job scrive ImageOS, ImageVersion,
Windows, PowerShell, Node e npm nel riepilogo effettivo dell'esecuzione.

| Tema | Riscontro e decisione | Fonte primaria |
|---|---|---|
| Runner | `windows-latest` indica Windows Server 2025 x64 con Visual Studio 2026; immagine documentata con PowerShell 7.6.5, Python, SDK Windows, strumenti C++ e librerie Spectre. Adottare il runner richiesto e registrare la versione reale. | [Etichette runner](https://github.com/actions/runner-images/blob/main/README.md), [software Windows 2025](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-VS2026-Readme.md) |
| Node/npm | `setup-node` con Node 24, cache npm e più lock; non conserva `node_modules`. Includo anche frontend e context-engine, effettivamente installati dal job. | [setup-node, uso avanzato](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md) |
| Addon nativi | node-pty 1.1.0 ha prebuild Windows x64 e script `prebuild.js || node-gyp rebuild`. Non disabilitare gli script npm. Il fallback richiede Python/C++/SDK/Spectre, presenti nell'immagine; la prova reale PTY è nel cancello Electron. | [node-pty, requisiti Windows](https://github.com/microsoft/node-pty) |
| Cache binari | Espandere LOCALAPPDATA in PowerShell: la sintassi `%LOCALAPPDATA%` non viene espansa automaticamente da cache. Cache distinte Electron e builder, più cache staging R-02 con impronte llama controllate a ogni build. | [actions/cache](https://github.com/actions/cache), [v6.0.0](https://github.com/actions/cache/releases/tag/v6.0.0) |
| Attestazioni | `actions/attest` v4 accetta `subject-path` multilinea; richiede scrittura per OIDC, attestazioni e metadati. Uso lo stesso SHA del job apk, senza il wrapper `attest-build-provenance`. | [actions/attest](https://github.com/actions/attest), [contratto al pin](https://github.com/actions/attest/blob/1e69f48acb82d1966a394da916b4c1698aa569d6/action.yml) |
| Disponibilità attestazioni | Repo pubblici: Free/Pro/Team; repo privati/interni: Enterprise Cloud. Prima di R-05 l'owner deve verificare il piano del repository attuale; non aggiungo segreti o un fallback senza provenienza. | [Attestazioni GitHub](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) |
| Artefatti | Upload con elenco esplicito EXE/ZIP/SHA, errore sui file mancanti, compressione 0 per archivi già compressi, conservazione 14 giorni. Rapporto smoke separato, anche se fallisce. | [upload-artifact](https://github.com/actions/upload-artifact), [v7.0.0](https://github.com/actions/upload-artifact/releases/tag/v7.0.0) |
| Release | `gh release create` accetta più asset; `--verify-tag` impedisce di creare implicitamente un tag, `--notes-file` usa note scritte, `--repo` viene dal contesto GitHub. | [Manuale GitHub CLI](https://cli.github.com/manual/gh_release_create) |
| NSIS | `/S` è sensibile al caso. `/D` deve essere ultimo e senza virgolette interne anche con spazi. `/S` non avvia automaticamente l'app salvo `--force-run`; la prova avvia l'EXE separatamente. | [NSIS, riga di comando](https://nsis.sourceforge.io/Docs/Chapter3.html), [template electron-builder](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/nsis/installSection.nsh) |
| Destinazione per utente | Il template R-02 risolve UserProgramFiles e il nome npm sanitizzato: default stock `%LOCALAPPDATA%\Programs\talos-desktop`, EXE `TALOS.exe`, disinstallatore `Uninstall TALOS.exe`. `Programs\TALOS` del brief non è il nome prodotto da questa configurazione. Nessuna modifica al contratto R-02. | [Template multiutente](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/nsis/multiUser.nsh), configurazione e template locali di electron-builder 26.16.1 |
| Electron/Playwright | Adotto `_electron` 1.62.1 già nel lock, con Electron 44.3.0. API dichiarata sperimentale; upstream esegue i test Electron anche su `windows-latest`. Nel job TALOS resta un cancello reale obbligatorio. Il Chromium scaricato separatamente serve a un test DOM frontend, non a `_electron`. | [API Electron](https://playwright.dev/docs/api/class-electron), [CI Playwright](https://playwright.dev/docs/ci), [matrice upstream Electron](https://github.com/microsoft/playwright/blob/main/.github/workflows/tests_secondary.yml) |
| YAML e lint | js-yaml 4.3.2 già fissato dal lock desktop, senza nuove dipendenze. actionlint ufficiale 1.7.12 eseguito tramite il wrapper npm `github-actionlint@1.7.12`, esplicitamente via npx. | [js-yaml](https://github.com/nodeca/js-yaml), [actionlint 1.7.12](https://github.com/rhysd/actionlint/releases/tag/v1.7.12), [wrapper npm](https://github.com/judeallred/github-actionlint) |
| Limite temporale | GitHub consente fino a 6 ore per job hosted; imposto 45 minuti, dipendenze 10, cancelli 15, dist 15, smoke 8. Sono limiti per fase all'interno del limite complessivo, non tempi promessi. | [Limiti Actions](https://docs.github.com/en/actions/reference/limits) |
| Costo | La documentazione corrente riporta Windows baseline **0,010 USD/min** e Linux **0,006 USD/min**. Il vecchio URL dei moltiplicatori rimanda alle tariffe attuali: non confermo «Windows ×2» come rapporto tra i prezzi correnti. Per il conteggio delle quote dell'account l'owner controlla il piano applicabile; 45 × 2 = 90 sarebbe il consumo con la regola ×2 indicata nel brief. A tariffa baseline, 45 minuti fuori quota valgono fino a 0,45 USD di calcolo, storage separato. Runner standard gratuiti nei repo pubblici. | [Fatturazione Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [tariffe runner](https://docs.github.com/en/billing/reference/actions-runner-pricing) |

Decisione: integrazione diretta delle action e degli strumenti upstream; codice
AVM limitato a orchestrazione smoke, contratti di prova e metadati di release.
Nessun nuovo runtime o parser proprietario. Le licenze e le provenienze del
pacchetto R-02 sono conservate; js-yaml e il wrapper npx sono MIT, quest'ultimo
serve solo al controllo locale. Rifiutati lo ZIP di sorgenti che richiede Node
all'utente, Azure/Authenticode per decisione dell'owner e il wrapper di attestazione.

Pin effettivi delle action desktop:

| Action | Versione | SHA |
|---|---|---|
| checkout | v7, invariato | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| setup-node | v7, invariato | `820762786026740c76f36085b0efc47a31fe5020` |
| cache | v6.0.0 | `2c8a9bd7457de244a408f35966fab2fb45fda9c8` |
| attest | v4, identico ad apk | `1e69f48acb82d1966a394da916b4c1698aa569d6` |
| upload-artifact | v7.0.0 | `bbbca2ddaa5d8feaa63e36b76fdaad77386f024f` |

Pin prodotto conservati: Electron 44.3.0, electron-builder 26.16.1,
node-pty 1.1.0, Playwright 1.62.1, llama.cpp b10517 CPU/Vulkan. Tool NSIS
bundle 3.12 / distribuzione 1.2.1 e 7zip 1.0.0, digest già verificati dallo script R-02.

## Il job, nell'ordine di esecuzione

1. Il trigger `desktop-v*` seleziona soltanto desktop su `windows-latest`, shell
   `pwsh`; i tag mobile `v*` mantengono il job apk. Checkout senza credenziali
   Git persistenti. Una branch locale `ci-desktop-release` conserva esattamente
   il commit del tag: prima/dopo sono confrontati gli SHA. Serve ai test server
   che richiedono una branch anche nella checkout detached dei tag.
2. Node 24 con cache npm basata sui quattro lock. Il passo ambiente rifiuta tag,
   package e lock discordanti; usa `ConvertFrom-Json -AsHashtable` perché il
   lock v3 contiene `packages['']`. Scrive percorsi cache e ambiente nel summary.
3. Cache `%LOCALAPPDATA%\electron\Cache`, `%LOCALAPPDATA%\electron-builder\Cache`,
   cache npm dello staging e due ZIP llama fissati. Chiave con OS, architettura,
   lock e script di staging; nessuna cache `node_modules` o chiave di ripiego generica.
4. `npm ci` backend, frontend, desktop e context-engine, script nativi attivi.
   Scarica Chromium con il Playwright del lock per `provider-pkl-bis-dom`;
   gli altri test che usano `channel: chrome` trovano Chrome nell'immagine.
5. Build frontend e copia `frontend/dist/*` in `public/` sul runner.
6. Cancelli seriali: test server, kernel, `kernel:controlla`, unit frontend,
   `test:puri` desktop, `test:guscio` Electron reale. Ogni codice non zero
   interrompe il job. Nessuno skip o `continue-on-error` aggiunto.
7. `npm run dist`: staging R-02 a inclusioni, addon verificati con Electron,
   llama con SHA256, installer NSIS per utente e ZIP completo. Niente firma,
   auto-update o pubblicazione implicita electron-builder. Tempo nel summary.
8. `ci-smoke.ps1`: preflight contro installazioni/collegamenti preesistenti,
   installer `/S`, EXE realmente installato, profilo temporaneo tramite
   `TALOS_DESKTOP_DATA_DIR`, finestra e cookie HttpOnly/SameSite Strict.
   Verifica `/api/v1/health`: 401 anonimo, 200 con cookie, 200 dopo reload.
   Chiude app/backend, disinstalla `/S`, verifica processi, EXE, collegamenti,
   registro e conservazione del dato sentinella. Un cleanup forzato resta errore.
9. `release-assets.mjs`: verifica entrambi i file non vuoti, smoke riuscito e
   SHA dell'EXE identico a quello installato; genera `SHA256SUMS.txt` e note
   italiane. Le note includono Windows 10 1809+ x64, SmartScreen con i passi,
   contenuto/assenze, hash effettivi e `gh attestation verify` per entrambi i file.
10. `actions/attest` attesta EXE e ZIP con due `subject-path`. Upload degli
    stessi due file più SHA256SUMS; nessun glob sull'intera cartella dist.
    `gh release create` allega esattamente questi tre asset e usa le note scritte.
11. A fine job, anche su errore, conserva il report smoke se esiste e scrive il
    tempo osservato. Il totale dichiarato esclude checkout/setup-node e le
    post action, come specificato nel summary.

I permessi globali sono **identici alla base**, senza ampliamenti nel desktop:

| Permesso | Uso |
|---|---|
| `contents: write` | Creazione della release e caricamento degli asset tramite `github.token`. |
| `id-token: write` | Token OIDC per la provenienza. |
| `attestations: write` | Registrazione dell'attestazione GitHub. |
| `artifact-metadata: write` | Metadati richiesti da `actions/attest` v4. |

Il desktop non usa `secrets.*`, repository fisso o segreti configurati; prende
repository e token effimero da GitHub. Il job apk, header e permessi sono
verificati invariati; `ci.yml` e `package.json` sono intatti.

## Prove locali ed evidenze

Le dipendenze backend/frontend/desktop del worktree sono junction verso quelle
già fornite dall'owner. Non ho eseguito `npm ci` su queste junction. Ho installato
solo i 3 pacchetti mancanti di context-engine dal lock, nella sua cartella
generata ignorata da Git; lo staging R-02 esegue i propri `npm ci` isolati.
La sequenza completa di installazione su checkout pulita resta un gate GitHub.
I comandi sono stati eseguiti tramite `rtk proxy`; qui sono riportati senza quel
prefisso per renderli riusabili. Nella shell locale uso `npm.cmd`/`npx.cmd`.

| Prova finale | Risultato misurato |
|---|---|
| `npm.cmd --prefix harness-ui/desktop run test:puri` | **33/33**, zero falliti/skipped, **18.108,8227 ms**. Include test R-01/R-02 puri e nuovi contratti R-04. |
| `npx.cmd --yes github-actionlint@1.7.12 .github/workflows/release.yml` | **Codice 0**, nessuna diagnostica; binario ufficiale actionlint 1.7.12 Windows amd64 scaricato dal wrapper npm. Cache nel worktree, nessuna installazione globale. |
| PowerShell e Node | Parsing AST dello smoke, preflight su EXE fittizio mai avviato, verifica `Get-Process` sul vero processo PowerShell; passo ambiente YAML eseguito realmente, tag valido/invalido; `node --check` sui due helper riuscito. |
| `R04-TAG-COMMIT` | Repository temporaneo ottenuto con fetch locale della base: da detached a ramo CI, **stesso SHA**, nessun add/commit/push. Prova singola circa 16,9 s; inclusa poi nei 33 test finali. |
| `npm.cmd --prefix harness-ui/desktop run dist` | **Codice 0, 297 s**, EXE/ZIP reali. Staging: **8.263 file, 343.727.282 byte**, manifest escluso dal conteggio. |
| Addon dello staging | Electron 44.3.0 reale; node-pty 1.1.0 con processo PTY, keyring caricato, sqlite-vec 0.1.9 con query. Non è una promessa sul fallback node-gyp hosted. |
| `TALOS_R02_PACCHETTO=1`, `node --test .../tests/pacchetto.spec.mjs` | **2/2**, **11.194,4813 ms**. Electron del pacchetto avvia il backend, porta 55232, cookie 200/anonimo 401, PTY exit 0, nessun orfano, zero scritture fuori userData. Motore rilevato, nessun modello; nessuna inferenza eseguita. |
| Smoke vero `ci-smoke.ps1` | **Fallito**. Installazione silenziosa in **42.318 ms**, durata totale **110.888 ms**. Dettagli sotto. |
| CLI `release-assets.mjs` sui file reali | Rifiuto atteso, exit 1: smoke non riuscito. Verificata assenza di SHA256SUMS.txt e NOTE-RELEASE.md definitivi. Nessuna pubblicazione tentata. |
| Controllo del perimetro | `git diff --check` passa; prime **378 righe** del workflow identiche, oggetto YAML apk e permessi identici, HEAD/base e stato detached invariati. |

Dist non esisteva: la build autorizzata ha scaricato gratuitamente tool ufficiali
NSIS/7zip e llama verificandone gli hash. Usa il `public/` già presente nella
base: la ricostruzione frontend nei test temporanei fallisce nella sandbox con
gli errori esbuild riportati sotto. Non ho copiato un frontend parziale in
`public/`, né modificato sorgenti frontend per aggirare la limitazione.

I due file prodotti localmente, **non ancora approvati per distribuzione**:

| File in `harness-ui/desktop/dist/` | Byte | MiB | SHA256 |
|---|---:|---:|---|
| `TALOS-Setup-0.1.0.exe` | 152074299 | 145,03 | `e835c7dbc0707bc7167121dabffcee6d8775c2ec0c033e9dba6904c023c5a0de` |
| `TALOS-0.1.0-win.zip` | 255856493 | 244,00 | `6ce088822f1f87f416ab63fae1e6406886feef6a267235655c8b68ea92c8d0e7` |

Le impronte sono delle copie locali; la futura build GitHub ne produrrà e
pubblicherà di proprie. `SHA256SUMS.txt` e le note definitive di questi asset
non sono stati generati: lo smoke fallito è una condizione di rifiuto voluta.
I test del generatore verificano hash reali su fixture temporanee, entrambi gli
asset obbligatori, tag/versione, smoke falso e hash dell'EXE divergente.

### Smoke dell'installato: risultato rosso conservato

Comando effettivo da radice, destinazione di banco isolata con spazi:

```powershell
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File harness-ui/desktop/scripts/ci-smoke.ps1 `
  -Installer harness-ui/desktop/dist/TALOS-Setup-0.1.0.exe `
  -InstallDir 'C:\Users\Antonino\AppData\Local\Temp\claude\wt-astra-r04\harness-ui\desktop\.prove\installazione TALOS R04'
```

L'installer `/S /D=...` crea il programma e termina 0. L'app avvia il backend
(porta osservata 59485), poi Playwright riceve `Target page, context or browser
has been closed` prima della prima finestra. **Il controllo health via finestra
dell'installato non viene raggiunto.** Il test separato del backend impacchettato
non sostituisce questa prova.

Il disinstallatore `/S` termina 0 ma `TALOS.exe` rimane oltre i 60 secondi:
il rapporto registra correttamente il fallimento. Anche una prova separata NSIS
con `_?=<percorso>` non rimuove quei file. Causa non accertata; gli errori HKCU
di altri test e il crash GPU sono osservazioni, non una diagnosi certificata NSIS.

Ho rimosso manualmente soltanto la cartella creata dalla prova, dopo verifica
del percorso assoluto interno al worktree e assenza di processi. **Zero processi
residui**, cartella rimossa, dati temporanei conservati. Questa pulizia non è
conteggiata come disinstallazione riuscita.
Evidenze: [smoke fallito](R04-smoke-fallito.json), [pulizia circoscritta](R04-pulizia.json).

Le correzioni R-04 sono precedute da RED: vecchio job Ubuntu/modulo asset
assente, chiave vuota nel lock PowerShell, registro Uninstall assente,
enumerazione WMI negata e checkout detached. Tutti i rispettivi test permanenti
passano. `Get-Process` sostituisce WMI senza richiedere nuovi permessi,
seguendo l'[API Microsoft](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-process)
(consultata il 12/09/2026). Non è stata disabilitata la GPU per far passare il test.

### Regressioni e limiti ereditati: nessuno nascosto dal job

Le suite sono state eseguite serialmente; per raccogliere tutti gli esiti locali
ho proseguito con la suite successiva dopo ogni errore. Il workflow invece si
ferma al primo cancello fallito, prima del pacchetto e della pubblicazione.

| Comando | Passati / falliti / skipped | Durata |
|---|---|---|
| `node --test harness-ui/tests/*.test.mjs` | 2868 / 6 / 6 | 68.529,7684 ms |
| `npm --prefix harness-ui run test:kernel` | 556 / 1 / 1 | 1.364,5435 ms |
| `npm --prefix harness-ui run kernel:controlla` | exit 0; 8.753 righe, SHA breve `bfe91115dda80742` | < 1 s |
| `npm --prefix harness-ui/frontend run test:unit` | 1013 / 5 / 1 | 6.974,2609 ms |
| `npm --prefix harness-ui/desktop run test:guscio` | 1 / 2 / 0 | 11.059,3069 ms |

`kernel:controlla` dichiara la fonte esterna non raggiungibile: **nessun confronto
con l'upstream esterno è stato eseguito**, pur essendo il comando terminato 0.

Scenari permanenti nel ledger, con test già presenti:

- **R04-TAG-COMMIT:** `agent-service.test.mjs:512` e `workspace-context.test.mjs:18`
  esigono una branch reale. Il worktree locale resta detached; il nuovo passo
  CI corregge questa condizione senza cambiare commit, coperto da un test reale.
- **R04-RICEVUTE-IMPORT-ESTERNO:** `harness-receipt-keypair.test.mjs:131` importa
  `../../../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`, assente.
  Questo test impedirà anche una release da checkout pulita finché l'owner non
  porta l'import sul kernel incluso nel repository. Non serve copiare un repo privato.
- **R04-STOP-ALBERO:** `kernel-loop-locale-e-stop.test.mjs:300`, comando di 45 s
  fermato dopo 1 s, ritorna dopo **45.217 ms**; il controllo di arresto immediato fallisce.
- **R04-HKCU-SANDBOX:** `windows-open-with-talos.test.mjs:72` e `:97` falliscono
  per accesso negato al registro isolato. Da ripetere su Windows hosted.
- **R04-KERNEL-MARCATORE:** `src/kernel/talosHarness.test.mjs:435` attende
  `caratteri tolti nel mezzo`; l'implementazione emette `tolti 6000 caratteri dal mezzo`.
- **R04-FRONTEND-BUILD:** `PHASE1-BUILD-PARALLEL-01`, `PHASE1-GRAPH-ISOLATION-01`,
  `PHASE1-ASSET-ALLOWLIST-01` falliscono per accesso esbuild a directory antenate
  negato e conseguente risoluzione fallita degli ingressi.
- **R04-FRONTEND-RISOLUTORE:** `PK-UI-02/03` in
  `frontend/tests/unit/provider-pk-browser.test.mjs:15` e `PH-UI-BROWSER` in
  `provider-pool-browser.test.mjs:13` falliscono con «Sorgente fuori dal frontend».
- **R04-GPU:** `tests/guscio.spec.mjs:21` e `:152` falliscono; il secondo
  registra ripetutamente exit GPU **-1073741515** e `GPU process isn't usable`.
  Il primo non raggiunge la finestra. `R01-BACKEND` passa con cookie, PTY e arresto.

Il rapporto R-02 precede alcune correzioni già nella base: `server.mjs` contiene
ora `percorsoDatiDesktop`; R01-BACKEND e R02-DATI passano. **Non riapplicare il
vecchio diff sui dati backend**. Il README è stato aggiornato per distinguere
questo risultato dagli errori GUI/disinstallazione ancora presenti.

## File consegnati e righe

Righe riferite ai file finali nel worktree. Nessuna modifica a package.json,
ci.yml, apk, server, src, frontend, mobile, control-plane, core o docs.

| File | Righe / contenuto |
|---|---|
| `.github/workflows/release.yml` | 379: commento desktop; 381: job Windows; 396: commit tag; 419: ambiente; 438: cache; 449: dipendenze; 473: cancelli; 491: dist; 500: smoke; 507: hash/note; 515: attest; 522: upload; 535: release; 558: tempo. |
| `harness-ui/desktop/scripts/ci-smoke.ps1` | 1: parametri; 12: attesa; 21: processi; 34: registro; 42: NSIS; 51: preflight; 70: dati/report; 86: installazione/avvio; 104: disinstallazione e risultato. |
| `harness-ui/desktop/scripts/ci-smoke-installed.mjs` | 9: `provaInstallato`; app confezionata, profilo, cookie/health/reload e arresto; CLI in fondo. |
| `harness-ui/desktop/scripts/release-assets.mjs` | 7: `nomiArtefatti`; 12: `preparaRelease`; hash, guardia smoke, note e output Actions. |
| `harness-ui/desktop/tests/workflow.test.mjs` | 1: caricamento YAML reale; contratti Windows/permessi/pin/asset/portabilità, passo PowerShell e commit tag reali. |
| `harness-ui/desktop/tests/release-assets.test.mjs` | 1: fixture temporanee, versioni, file obbligatori, digest e guardie di pubblicazione. |
| `harness-ui/desktop/tests/ci-smoke.test.mjs` | 1: parsing PowerShell, preflight non distruttivo, processi senza WMI. |
| `harness-ui/desktop/README.md` | 9: stato veritiero; 139: «Come nasce una release», tag, asset e verifiche. |
| `.claude/LEDGER-R04.md` | 1: piano esecutivo, dossier, TDD, scenari e stato finale. |
| `.claude/RAPPORTO-R04-CI-WINDOWS-2026-09-13.md` | Questo rapporto. |
| `.claude/R04-cancelli.json` | Codici e durate delle suite. |
| `.claude/R04-smoke-fallito.json` | Copia del risultato dello smoke reale. |
| `.claude/R04-pulizia.json` | Prova di pulizia della sola installazione temporanea. |
| `.claude/R04-verifica-finale.json` | Base/HEAD, perimetro, apk/permessi invariati, test e lint. |

Log locali ignorati da Git ma disponibili su disco in `.claude/`:
`R04-dist.log`, `R04-server.log`, `R04-kernel.log`, `R04-kernel-controlla.log`,
`R04-frontend.log`, `R04-guscio.log`, `R04-pacchetto.log`, `R04-puri.log`,
`R04-actionlint.log`. Prova backend confezionato in
`harness-ui/desktop/.prove/R02-pacchetto.json`; smoke in `.prove/R04-ci-smoke.json`.
Dist, staging, cache e node_modules generati restano ignorati; non vanno aggiunti
al commit. I file non tracciati preesistenti non fanno parte del lotto R-04.

## Handoff e diff non applicati

Nessun diff fuori dai file autorizzati è stato applicato. Due correzioni minime
da far valutare ai proprietari backend/kernel, **solo proposte, non provate**:

```diff
--- a/harness-ui/tests/harness-receipt-keypair.test.mjs
+++ b/harness-ui/tests/harness-receipt-keypair.test.mjs
@@
-        '../../../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs'
+        '../src/kernel/talosHarness.mjs'
```

Il file interno esporta entrambe le funzioni usate dal test; l'owner deve
eseguire il round-trip e la suite server prima di accettare la sostituzione.

```diff
--- a/harness-ui/src/kernel/talosHarness.test.mjs
+++ b/harness-ui/src/kernel/talosHarness.test.mjs
@@
-        assert.match(r, /caratteri tolti nel mezzo/,
+        assert.match(r, /tolti 6000 caratteri dal mezzo/,
```

Questa proposta conserva e rende numerica la verifica del taglio dichiarato;
il proprietario kernel deve confermare quale formulazione sia il contratto.
Non applicare automaticamente una modifica al test per mascherare un difetto.

Ulteriori handoff, senza diff speculativi: backend/Windows per lo stop albero
(`harness-ui/tests/kernel-loop-locale-e-stop.test.mjs` e implementazione individuata
dal suo owner); frontend per `scripts/build.mjs`, i tre test contract e i due
test browser citati; R-01 per `desktop/main.mjs`/`tests/guscio.spec.mjs` e crash
GPU; R-02 per impostazioni NSIS di `desktop/package.json` e
`tests/installer.spec.mjs`/disinstallazione. HKCU richiede anche ripetizione fuori
sandbox. R-04 non modifica questi file e non disabilita i cancelli.

## Verifiche che richiedono l'owner e GitHub

**Non fare il tag di rilascio finché i blocchi noti non sono chiusi.** Il test
dell'import esterno e il marcatore kernel sono già motivi concreti per cui questa
base non può completare il job, anche se il runner risolvesse i limiti sandbox.

1. Revisionare e integrare i file R-04 senza i generati, risolvere gli handoff e
   ripetere le suite e lo smoke su un Windows con installazione/disinstallazione
   funzionanti. Verificare `version=0.1.0` in package e lock desktop, oppure
   allinearli alla versione scelta fuori da questo lotto.
2. Controllare disponibilità attestazioni nel piano corrente e policy Actions
   per le action fissate. Non servono nuovi segreti. La futura copia pubblica
   usa automaticamente il proprio `github.repository`.
3. **Push del tag `desktop-v0.1.0` sul commit verificato**, da parte dell'owner.
   Se la versione cambia, usare `desktop-vX.Y.Z` corrispondente. Guardare il
   workflow **`release`**, job **`desktop`**; il job apk deve risultare escluso.
4. Verificare sull'immagine hosted: checkout dello stesso commit, cache a freddo
   e restore, `npm ci` con gli addon nativi, Chrome/Chromium, build frontend,
   tutti i cancelli, `_electron` senza crash GPU e build NSIS/ZIP. Localmente
   non sono state certificate queste condizioni della macchina GitHub.
5. Nel passo smoke verificare default per utente senza `/D`, installer e
   disinstallatore `/S`, EXE installato, health 401/200/200, profilo temporaneo,
   chiusura senza orfani, rimozione EXE/collegamenti/registro e dati conservati.
   Scaricare `talos-desktop-smoke-<run_id>-<run_attempt>` e controllare
   `completato:true`, `disinstallato:true` e `processiResidui:[]`.
6. Verificare OIDC, attestazione reale di **entrambi** i file, permessi metadati,
   upload con i tre asset esatti, release creata da `gh` e note con gli hash
   della build hosted. Controllare pesi/tempi reali e consumo nel summary/Billing.
7. Scaricare dalla release EXE, ZIP e SHA256SUMS. Confrontare `Get-FileHash
   -Algorithm SHA256` per entrambi contro SHA256SUMS e note; eseguire
   `gh attestation verify .\TALOS-Setup-0.1.0.exe --repo OWNER/REPOSITORY` e
   `gh attestation verify .\TALOS-0.1.0-win.zip --repo OWNER/REPOSITORY`.
8. Su macchina destinataria separata: Windows 10 1809 x64, SmartScreen su download
   reale, CPU senza Vulkan e GPU compatibile. Server 2025 da solo non certifica
   questi requisiti minimi né il comportamento dei provider/modelli di R-03.

Un rerun non sovrascrive silenziosamente una release già creata: `gh release
create` segnala l'esistenza. L'owner ispeziona gli asset e decide il recupero;
R-04 non elimina release/tag né aggiunge `--clobber`.

## Commit proposto e rollback

Testo proposto, **non eseguito**:

```text
ci(desktop): costruisci e verifica installer Windows prima della release

Sostituisce lo ZIP sorgenti con NSIS e ZIP completo R-02, smoke installato,
SHA256 e provenienza actions/attest v4. Aggiunge test YAML/PowerShell/asset e
documentazione; conserva apk e permessi. Registra i blocchi locali nel rapporto.
```

Rollback a cura dell'owner: ripristinare soltanto il job desktop dalla base e
rimuovere i nuovi file R-04 dopo revisione; non resettare l'intero worktree e non
toccare modifiche utente, dati o rapporti preesistenti. Nessuna release remota
da ritirare è stata creata durante questa sessione.

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** revisionare e integrare il lotto, chiudere gli handoff,
provare lo smoke su Windows non limitato dalla sandbox, verificare il piano
GitHub e infine pubblicare il tag corrispondente. Controllare il job e gli asset
secondo l'elenco precedente. Commit, push e distribuzione restano suoi.

**Cosa faccio io:** consegno workflow, script riusabili, test permanenti, README,
ledger ed evidenze su disco. Ho costruito EXE/ZIP, eseguito il vero smoke e
registrato il suo errore, chiuso i difetti R-04 riproducibili nei file autorizzati
e verificato il perimetro senza modificare le altre lane.

**Cosa rimane:** accettazione completa di installazione/GUI/health/disinstallazione,
regressioni ereditate elencate, esecuzione hosted e provenienza remota, verifica
SmartScreen/Windows minimo e compatibilità CPU/Vulkan. **R-04 non è dichiarata
verde finché questi gate applicabili non passano.**
