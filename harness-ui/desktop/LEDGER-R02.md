# Ledger R-02 — installer per utente e zip

Data di apertura: 12/09/2026 (rapporto richiesto con data 13/09). Sottosistema: TALOS UI, solo desktop. Base dichiarata `aca60ce5`. Nessun commit, push, porta 4174 o chiamata a pagamento.

## Ricerca e decisione upstream, prima del codice

Fonti ufficiali consultate il 12/09/2026:

- https://www.electron.build/v26/docs/configuration/ e https://www.electron.build/v26/docs/api/electron-builder.interface.configuration/ — configurazione v26, `files`, `extraResources`, `electronDist`.
- https://www.electron.build/docs/nsis/ — `oneClick`, `perMachine`, icone e `include`; le opzioni `allowElevation` e cambio cartella riguardano il wizard assistito. Per utente effettivo: oneClick + perMachine false.
- https://www.electron.build/v26/docs/troubleshooting/ e https://www.electron.build/docs/tutorials/offline-air-gapped-builds/ — cache Electron e tool NSIS separate; `electronDist` riusa la distribuzione locale ma non sostituisce la cache NSIS.
- https://docs.npmjs.com/cli/v11/commands/npm-ci/ — installazione dal lock, `--omit=dev` non installa dipendenze di sviluppo; gli script necessari agli addon restano attivi.
- https://github.com/ggml-org/llama.cpp/releases/tag/b10517 e https://github.com/ggml-org/llama.cpp/releases/expanded_assets/b10517 — asset ufficiali, pubblicati 20/08/2026. Conferma indipendente via API GitHub dal Node locale.
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation — reputazione separata dalla personalizzazione grafica e dalla firma.

Decisione: adottare direttamente electron-builder **26.16.1**, Electron **44.3.0** già presente, NSIS upstream con include minimo; nessuna ricostruzione di un installer proprietario. Guscio fuori da asar per conservare il bootstrap ESM `--import` del figlio; backend e addon in `extraResources`. Adottare llama.cpp **b10517**, licenza MIT, archivi CPU e Vulkan completi con DLL e avvisi upstream. SHA256 CPU `f3fed0673c934ade45663a8e29220a0903b58ad7eff91eeeef606a37061cd031`; Vulkan `afa3b2d38b2b461e45a3df7783009b22b2b7e4bb92b40bcb910d0c8924925c88`.

NSIS oneClick permette icona della finestra, del file e sopra il progresso; l'include personalizza testi e colori del controllo nativo. Non ospita il frontend Calm HTML. Non si promette un wizard HTML né una firma inesistente. `signAndEditExecutable:false` impedisce anche la modifica delle risorse dell'EXE Electron: limite da rendere esplicito.

## File e simboli previsti

Modifiche: `package.json` (script prepara/dist/test:installer, configurazione build e pin), `package-lock.json`, `.gitignore`, `runtime.mjs` (`risolviPercorsi`, `creaAvvioFiglio`; nuovi `scegliMotoreLocale`), `main.mjs` (AUMID e scelta binario), `scripts/genera-icone.mjs` (ICO dal marchio), `tests/runtime.test.mjs`, `README.md`.

Creazioni: `LEDGER-R02.md`, `scripts/prepara-pacchetto.mjs` (pubblici `LLAMA`, `fileProduzione`, `verificaImpronta`, `inventario`, `preparaPacchetto`), `scripts/verifica-nativi.mjs`, `scripts/distribuisci.mjs`, `assets/talos.ico`, `assets/installer.nsh`, `tests/pacchetto.test.mjs`, `tests/installer.spec.mjs`, `../.claude/RAPPORTO-R02-INSTALLER-2026-09-13.md`.

Generati ignorati: `.staging/MANIFEST.json`, albero `.staging/harness-ui` (server.mjs, package.json, package-lock.json, produzione src/public/node_modules), `.staging/context-engine` (package.json/lock, THIRD_PARTY_NOTICES.md, src e produzione node_modules), `.staging/local-runtime/cpu` e `vulkan`, `.staging/AVVISI.txt`, `.cache-r02` (npm e archivi verificati), `dist` (EXE, ZIP, win-unpacked e metadati builder), `.prove` (log e prove). Gli alberi generati hanno inventario nominativo completo nel manifest. Mai copiare radici indiscriminate del repository o seguire junction durante la selezione sorgenti.

Compatibilità: `scegliPortaEffimera`, `validaHandshake`, `urlIngresso`, lifecycle, cookie HttpOnly, IPC di chiusura e bootstrap restano stabili. `TALOS_LLAMA_SERVER_PATH` resta l'override esplicito; in sorgente resta la scoperta esistente, nel pacchetto Vulkan viene sondato e CPU è il ripiego se non eseguibile. Nessuno schema del backend cambia.

## RED → GREEN, regressioni e gate

- **R02-PERCORSI**: RED manca `localRuntime` nei percorsi packaged; verifica indipendenza dal cwd e layout sorgenti.
- **R02-MOTORE**: RED manca selezione con sonda, ripiego CPU e override; GREEN `node --test tests/runtime.test.mjs`.
- **R02-INTEGRITA**: RED script assente; hash sbagliato deve fallire, link e file di sviluppo esclusi, manifest ordinato e completo; GREEN `node --test tests/pacchetto.test.mjs`.
- Gate reale: npm ci produzione in staging, caricamento addon col Node di Electron, `llama-server --version` CPU e Vulkan senza modello, build NSIS + zip con builder pin.
- **R02-INSTALLER** opt-in `TALOS_R02_INSTALLER=1`: installazione /S, avvio EXE installato, prima finestra, health 401 anonimo/200 cookie, Terminale PTY, runtime observed e nessun GGUF, reload, chiusura, disinstallazione e assenza orfani. Screenshot Calm chiaro/scuro 1024×800 e 1440×900; pesi e macchina in JSON. Test deve fermarsi prima di sovrascrivere una installazione esistente.
- Regressioni: suite pura e R01 backend/guscio; nessun test frontend/prodotto alterato. Nessun gate sulla porta dell'owner.
- Prova umana: screenshot dell'app installata e, se tecnicamente disponibile, finestra nativa dell'installer. Misura da lancio processo Playwright, distinta da un doppio clic manuale.
- Rollback: disinstallatore upstream per la copia di prova; modifiche di prodotto reversibili tramite review file per file, mai git reset/revert. Archivi e output generati esclusi da git.

## Vincoli emersi dall'ispezione

`desktop/node_modules` è una junction verso la copia dell'owner: rimuovere solo il collegamento, non il bersaglio, e creare dipendenze isolate prima di npm install. `context-engine` importa `zod` e `sqlite-vec`: installare il suo lock separatamente nello staging. Il supervisore riceve il percorso da `src/config.mjs`, variabile `TALOS_LLAMA_SERVER_PATH`, che il guscio può impostare.

`server.mjs` conserva dati `.local-models`, `.generated-images`, `.provider-runtime.json`, `.search-source.json`, `.workspace-launch-token` accanto al modulo; `TALOS_DESKTOP_DATA_DIR` non li reindirizza. È un limite preesistente da provare e registrare, con diff non applicato nel rapporto. Non inventare che tutti i dati siano già in userData.

Rete di build limitata dall'owner: npm in desktop e release ufficiali llama.cpp; verificare presenza cache NSIS prima di consentire qualsiasi download di tool builder. Installazione sotto LocalAppData potrebbe essere impedita dal sandbox: non aggirare il limite, conservare il gate rieseguibile.

Amendamento 1: il probe degli addon termina esplicitamente dopo l'evento di uscita PTY: il suo helper ConPTY tiene altrimenti vivo il processo Node. La conversione ICO userà `resedit` già dipendenza upstream del builder, senza scaricare un tool grafico aggiuntivo. Cache NSIS assente: richiesta all'owner l'estensione puntuale della rete ai tool ufficiali builder, prima della build.

Amendamento 2: `resedit` **1.7.2** dichiarato direttamente e bloccato nel lock. Aggiungere `assets/llama-LICENSE.txt`: gli ZIP ufficiali non contengono il testo MIT, recuperato dal LICENSE del tag b10517 e conservato integralmente. Nuovo file `tests/pacchetto.spec.mjs`: gate reale della cartella prodotta dal builder (`R02-BACKEND-PACCHETTO`) e regressione `R02-DATI`, eseguibile anche quando la GUI non parte. La prova R01 con EXE isolato e quella con EXE originale terminano entrambe nel processo GPU con 0xC0000135: non attribuire a R-02 né dichiarare verificata la finestra. Nessuna modifica ai sandbox Chromium.

Amendamento 3 — regressione permanente **R02-RISORSE-NODE-MODULES**: il primo confronto con MANIFEST fallisce (7.963 file mancanti). `app-builder-lib@26.16.1/out/util/filter.js:createFilter` esclude una cartella relativa esattamente `node_modules`, anche in extraResources. Aggiungere in `package.json` due FileSet espliciti dalla radice di ciascun `node_modules` alla relativa destinazione, senza alterare il codice upstream. Il gate `R02-BACKEND-PACCHETTO` verifica ogni hash prima di avviare e conserva questa regressione automaticamente. Fonte aggiuntiva: https://www.electron.build/v26/docs/contents/ e implementazione pin verificata localmente il 12/09.

Amendamento 4: lo stesso gate rileva un solo segnaposto VCS escluso da builder (`undici/lib/llhttp/.gitkeep`); rimuoverlo dallo staging prima del manifest. NSIS fissato al toolset **1.2.1**, NSIS **3.12**; 7zip toolset **1.0.0**. Impronte dalla distribuzione npm ufficiale app-builder-lib 26.16.1. `distribuisci.mjs` controlla le cache prima della rete; download solo con autorizzazione esplicita attestata da `TALOS_R02_BUILDER_NETWORK=1`. La cartella predefinita NSIS oneClick/perUser è `Programs/talos-desktop`, ricavata da `getWindowsInstallationDirName` (nome npm sanitizzato), non `Programs/TALOS`.

Aspetto NSIS: impostazioni MUI_BGCOLOR/MUI_TEXTCOLOR, colori della progressione e intestazione italiana nell'include prima delle pagine. Fonte primaria 12/09: https://nsis.sourceforge.io/Docs/Modern%20UI%202/Readme.html. Sono personalizzazioni native documentate; compilazione e verifica visiva restano gate distinti.

Amendamento 5: conservare anche il LICENSE effettivo del repository, copiato senza modifiche in `.staging/LICENZA-REPOSITORY.txt` e nelle risorse; non risolvere di nascosto il disallineamento Apache/AGPL riservato al lotto R-05. Il gate dati ha ora riprodotto `.workspace-launch-token` creato accanto al server, con HTTP/PTY/motore e chiusura già provati. Nessuna patch fuori desktop applicata. Generare il diff proposto in `.prove/server-r02-proposto.mjs` solo per inserirlo nel rapporto. Prima della consegna ricreare win-unpacked per togliere i dati di prova dal programma distribuibile.

Precisione del gate installato: preservare anche collegamenti preesistenti; misurare la finestra **visibile**, distinguendola dalla creazione; attendere la rimozione completa di file, collegamenti e voce di disinstallazione. Il gate R02-DATI rifiuta un pacchetto già contaminato da dati precedenti, così non diventa verde al secondo giro senza ricostruzione.

## Integrazione nell'albero principale (13/09/2026, Fable — review e prova sulla macchina dell'owner)

- Diff di Astra applicato (8 file toccati, 10 nuovi); `.staging/` copiato dal worktree; `npm run dist` in tre giri: il primo si è fermato perché `distribuisci.mjs` rifiuta i download di electron-builder senza cache verificata (comportamento voluto), il secondo con `TALOS_R02_BUILDER_NETWORK=1` ha scaricato nsis-bundle 3.12 e 7zip e costruito exe e zip, il terzo dopo la cura di `server.mjs`.
- `server.mjs` (fuori dal lotto di Astra, mia lane): `percorsoDatiDesktop(relativo)` applicato dal diff del rapporto ed ESTESO a `.automations/`, `.favicon-cache/` e alle sette cartelle del registro delle sessioni (`.hooks-trust`, `.mcp-trust`, `.plugin-trust`, `.notes-store`, `.tasks-store`, `.memory-store`, `.tool-forge-store`) che il diff non copriva. Senza, nel prodotto installato i dati finivano in `resources/harness-ui/` (cancellata a ogni disinstallazione).
- Verso contrario, misurato due volte: (1) `tests/backend.spec.mjs` — nelle tre prove precedenti alla cura (`.prove/backend-a9gSpL`, `-lt1kvy`, `-MF8UR5`) `.workspace-launch-token` stava accanto a `server.mjs`, dopo sta nella cartella dati; assert aggiunto allo spec. (2) `tests/installer.spec.mjs` sul pacchetto costruito col vecchio `server.mjs`: rosso su `R02-DATI` con `resources/harness-ui/.workspace-launch-token`; verde col pacchetto ricostruito.
- Misure dell'installer (Windows 11 Pro 26200, Ryzen 7 7800X3D, 32 GB, `.prove/R02-installer.json` del 12/09 22:38 UTC): exe **152.067.178 byte**, zip **255.856.651 byte**, installato **730.817.105 byte** (8.263 file da manifest), installazione silenziosa **42,8 s**, prima finestra visibile **3,82 s** dal lancio Playwright dell'exe installato (pagina pronta 3,96 s), `llama-server.exe` CPU e Vulkan b10517 rispondono a `--version` dalle risorse, PTY dal pacchetto esce 0, zero errori di pagina, zero scritture fuori dai dati utente, disinstallazione: nessun processo, file, collegamento o voce di registro residui, dati utente conservati.
- Foto dell'app installata nei due temi e due larghezze (`.prove/R02-{chiaro,scuro}-{1440,1024}.png`): tema Calm intero, nessun difetto visto.
- Rotta dei runtime locali: `runtimeState: 'unavailable'` è lo stato di riposo del supervisore senza motore avviato (`llama-server-supervisor.mjs:247`), non «binario non trovato».
- Test: desktop `test:puri` 22/22, `backend.spec` 1/1, `installer.spec` 1/1; backend `config`, `http-app`, `local-runtime-llama-server`, `workspace-launch*`, `provider-credential-store` 77/77.
- Tolte da `desktop/` due cartelle vuote dal nome mal codificato (`Microsoft/Spelling/neutral`, zero file) lasciate da un Electron avviato con dati in una cartella dal nome corrotto.
- NON verificato: il pacchetto su una macchina senza strumenti di sviluppo (Windows pulito); SmartScreen con l'exe scaricato dal browser (qui lanciato da disco locale).
