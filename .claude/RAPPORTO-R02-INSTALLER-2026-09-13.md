# R-02 — installer Windows per utente e ZIP

**Esito: implementazione su disco, lotto NON chiuso.** Staging riproducibile e cartella del programma costruiti con electron-builder 26.16.1. Il backend impacchettato supera le verifiche HTTP, cookie, PTY e rilevamento llama.cpp, ma il gate dati resta rosso. EXE NSIS e ZIP non prodotti: manca la cache dei tool ufficiali e non è arrivata l'autorizzazione a estendere la rete del brief. Nessuna installazione o disinstallazione eseguita.

Il nome del rapporto segue la consegna del 13/09. Le prove di questa sessione sono del **12/09/2026**, tra le 21:35 e le 22:05 circa, Europe/Rome; i JSON registrano UTC. HEAD effettivo `c3ce6fea8333d65aeaed1dc7cbcfdf11e70654d2`, commit documentale immediatamente successivo a `aca60ce5`. Nessun ripristino della base. Il rapporto R-01 già non tracciato in `.claude/` alla radice del repository è stato conservato.

Mai eseguiti `git add`, `git commit`, `git push`; nessuna porta 4174, nessuna chiamata a pagamento, nessun GGUF scaricato. Le modifiche sono in `harness-ui/desktop/` e in questo rapporto. Nessun file di backend, frontend, kernel, mobile, core, control-plane o CI modificato.

## Ricerca, fonti e decisioni

Ricerca aggiornata e codice pin consultati il **12/09/2026**; il [ledger](../desktop/LEDGER-R02.md) precede le modifiche e registra RED, GREEN e correzioni del piano.

| Fonte primaria | Verifica e decisione |
|---|---|
| [electron-builder v26: configurazione](https://www.electron.build/v26/docs/configuration/) | Adottato direttamente **26.16.1**, versione confermata nei package installati di builder e app-builder-lib. `win.target` NSIS/ZIP, nomi degli artefatti per target, `publish:null`, Electron 44.3.0. |
| [NSIS electron-builder](https://www.electron.build/docs/nsis/) | `oneClick:true`, `perMachine:false`, cartella fissa e nessuna elevazione. `allowElevation` e scelta cartella sono opzioni del wizard assistito: la modalità per utente è determinata dalla coppia oneClick/perMachine. Icone installer/uninstaller/header, `include`, conservazione userData e collegamento TALOS configurati. |
| [Contenuti applicazione v26](https://www.electron.build/v26/docs/contents/) | Guscio limitato a una lista di file; backend e addon fuori da asar con `extraResources`. Il bootstrap ESM del figlio continua a ricevere un percorso reale. FileSet separati per i due node_modules: il filtro upstream esclude un node_modules relativo alla radice del FileSet. |
| [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/) | Due installazioni dai rispettivi lock con `--omit=dev`: backend e context-engine. Non si copia il node_modules dell'owner. Nessun rebuild Electron: il prebuild node-pty funziona realmente. |
| [Cache offline](https://www.electron.build/docs/tutorials/offline-air-gapped-builds/) | `electronDist` riusa la distribuzione Electron locale, ma servono anche i tool builder. Cache di Electron, npm e tool di packaging hanno ruoli distinti. |
| [NSIS Modern UI](https://nsis.sourceforge.io/Docs/Modern%20UI%202/Readme.html) | Include minimo con colori Calm esistenti, intestazione italiana e progressione nativa. La finestra NSIS non ospita la UI HTML; verifica visiva ancora mancante. |
| [resedit](https://github.com/jet2jet/resedit-js) | **1.7.2**, MIT, usato direttamente per generare ICO dai PNG prodotti da resvg 2.6.2. Nessun convertitore proprietario o modifica del PE Electron. |
| [Release llama.cpp b10517](https://github.com/ggml-org/llama.cpp/releases/tag/b10517), [asset con digest](https://github.com/ggml-org/llama.cpp/releases/expanded_assets/b10517) | CPU/Vulkan Windows x64 verificati contro SHA256 ufficiali; seconda conferma con API GitHub. Il binario CPU dichiara build 10517, commit `dc72703fc`, Clang 20.1.8. |
| [LICENSE del tag llama.cpp](https://raw.githubusercontent.com/ggml-org/llama.cpp/b10517/LICENSE) | Gli ZIP non contengono il testo MIT: recuperato dal tag con Node, conservato integralmente in `assets/llama-LICENSE.txt` e copiato in entrambe le varianti. |
| [Microsoft: reputazione SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation) | README con avviso di installer non firmato e passi dell'interfaccia Windows. Nessuna disattivazione di SmartScreen/Defender, nessuna rimozione automatica del contrassegno di download. |

Gli asset ufficiali sono pubblicati il **20/08/2026**:

| Asset | Byte scaricati | SHA256 ufficiale e verificato |
|---|---:|---|
| `llama-b10517-bin-win-cpu-x64.zip` | 18.507.219 | `f3fed0673c934ade45663a8e29220a0903b58ad7eff91eeeef606a37061cd031` |
| `llama-b10517-bin-win-vulkan-x64.zip` | 34.861.435 | `afa3b2d38b2b461e45a3df7783009b22b2b7e4bb92b40bcb910d0c8924925c88` |

Per i tool di packaging, il codice npm ufficiale `app-builder-lib@26.16.1` dichiara:

| Tool fissato | Archivio | SHA256 upstream |
|---|---|---|
| NSIS toolset 1.2.1 / NSIS 3.12 | `nsis-bundle-3.12.tar.gz` | `56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4` |
| 7zip toolset 1.0.0 | `7zip-win-x64.tar.gz` | `be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3` |

Questi due archivi **non sono stati scaricati**: il brief permette npm e i binari llama.cpp. La richiesta asincrona di estensione puntuale della rete resta senza risposta. `scripts/distribuisci.mjs` si ferma prima del download se non trova le cache verificate; dopo autorizzazione esplicita il comando può usare `TALOS_R02_BUILDER_NETWORK=1`. In alternativa, fornire le cache offline già verificate in `ELECTRON_BUILDER_CACHE`.

Decisione upstream: integrazione diretta di electron-builder/NSIS e delle release llama.cpp. Il guscio adatta solo i percorsi e la scelta del motore tramite `TALOS_LLAMA_SERVER_PATH`. Non viene riscritto il supervisore. La selezione prova `--version` su Vulkan; se non è eseguibile prova CPU. Un override esplicito resta prioritario. Dai sorgenti resta la scoperta precedente di `src/config.mjs` (Vulkan b10517, poi CPU).

## Layout e manifest

```text
desktop/.staging/
  MANIFEST.json
  AVVISI.txt
  LICENZA-REPOSITORY.txt
  harness-ui/
    server.mjs
    package.json
    package-lock.json
    src/                 # comprende il kernel; esclusi test e fixture
    public/              # frontend già costruito, non ricostruito da questo lotto
    node_modules/        # npm ci --omit=dev dal lock backend
  context-engine/
    package.json
    package-lock.json
    THIRD_PARTY_NOTICES.md
    src/                 # comprende la migrazione SQL del worker SQLite
    node_modules/        # lock del contesto: zod, sqlite-vec e DLL Windows
  local-runtime/
    cpu/                 # archivio ufficiale completo + LICENSE.txt
    vulkan/              # archivio ufficiale completo + LICENSE.txt

desktop/dist/win-unpacked/
  TALOS.exe              # Electron 44.3.0 rinominato da builder
  LICENSE
  LICENSES.chromium.html
  [DLL, pak, snapshot e locali della distribuzione Electron]
  resources/
    app/
      main.mjs
      runtime.mjs
      child-bootstrap.mjs
      lifecycle.mjs
      log.mjs
      window-state.mjs
      package.json
      assets/talos.png
      assets/talos-tray.png
    MANIFEST.json
    AVVISI.txt
    LICENZA-REPOSITORY.txt
    harness-ui/
    context-engine/
    local-runtime/cpu/
    local-runtime/vulkan/
```

Il [MANIFEST completo](../desktop/.staging/MANIFEST.json) contiene **8.263 record**, ognuno con percorso relativo, byte e SHA256; contiene anche versioni, URL/digest degli archivi e data UTC. La propria dimensione è **1.632.923 byte**, SHA256 **`09da4f3830d7aa1ec6a7a1747a81f597cc92a29da206959661938621b03569bb`**. È copiato nelle risorse del programma. Lo staging complessivo ha 8.264 file contando il manifest.

Verificati nuovamente tutti gli **8.263 SHA256 contro la cartella finale del builder**. Il manifest inventaria lo staging, non il PE Electron e i file del guscio generati/coperti dalla configurazione builder. La distribuzione Electron è quella già presente in R-01, riutilizzata localmente; non è stata scaricata né confrontata nuovamente con un archivio ufficiale Electron.

Niente sorgenti frontend, test del prodotto, labs, `.claude`, scratch, GGUF o `.local-runtime` privata. I package npm di produzione conservano i propri file pubblicati, inclusi avvisi, sorgenti e documentazione upstream: non sono le dipendenze di sviluppo del backend. È eliminato il solo `.gitkeep` vuoto che builder comunque ignora. La selezione dei sorgenti rifiuta link/junction; l'estrazione ZIP controlla CRC, traversal, link e dimensione massima oltre al digest dell'archivio.

Le directory `.staging/`, `.cache-r02/`, `dist/`, `.prove/` e `node_modules/` sono ignorate. La junction iniziale `desktop/node_modules` è stata rimossa come solo collegamento, conservando intatto il bersaglio dell'owner; le dipendenze desktop sono ora isolate. Nessuna installazione npm in frontend o nelle radici backend/contesto originali.

## Misure

Macchina: **Windows 11 Pro 10.0.26200 x64**, AMD Ryzen 7 7800X3D, 16 processori logici, RAM **33.944.801.280 byte**; GPU rilevata dal binario Vulkan: **AMD Radeon RX 9070 XT, 16.304 MiB**. Node degli strumenti v24.18.0, npm 11.16.0. Il prodotto usa il Node di Electron 44.3.0.

| Oggetto | Byte misurati | Nota |
|---|---:|---|
| node_modules backend originale | 205.076.645 | Misura in sola lettura della copia collegata dell'owner |
| node_modules backend produzione | 181.450.277 | 7.125 file, 94 package installati da npm |
| context-engine completo | 6.219.233 | 852 file; npm installa 3 package |
| llama.cpp CPU estratto | 47.426.454 | 52 file, LICENSE aggiunto incluso |
| llama.cpp Vulkan estratto | 101.780.886 | 53 file, LICENSE aggiunto incluso |
| Staging senza manifest | 343.726.503 | Somma dei record del manifest |
| Staging con manifest | **345.359.426** | Circa 329,36 MiB |
| Cartella programma win-unpacked | **730.673.544** | Circa 696,82 MiB, 8.346 file; non è una misura di installazione NSIS |
| `TALOS-Setup-0.1.0.exe` | **NON PRODOTTO** | Cache NSIS assente |
| `TALOS-0.1.0-win.zip` | **NON PRODOTTO** | Cache tool di compressione assente |
| Installato tramite NSIS | **NON MISURATO** | Nessuna installazione eseguita |
| Lancio installato → prima finestra visibile | **NON MISURATO** | Nessun eseguibile installato |

Sono dimensioni logiche dei file, non spazio allocato a cluster, picco RAM o spazio temporaneo richiesto dall'installer. Dati completi: [R02-pesi.json](../desktop/.prove/R02-pesi.json). Non viene inventata una stima del peso EXE/ZIP.

## Test e prove fresche

| Comando/gate | Esito |
|---|---|
| RED iniziale runtime + pacchetto | 6 test conteggiati, 3 verdi e 3 rossi attesi: modulo staging assente, percorsi binari assenti, selettore assente |
| GREEN runtime + pacchetto | **8/8 verdi** |
| `npm run test:puri`, ultimo giro | **22/22 verdi** |
| Probe staging con Electron | PTY reale con marker e uscita 0; caricamento keyring; query `vec_version()` tramite DLL sqlite-vec 0.1.9 |
| CPU `llama-server --version` | Uscita 0, build 10517, commit dc72703fc |
| `npm test` | Test puri 22 verdi; integrazione R01: **1 verde, 2 rossi** |
| `R01-BACKEND` | Electron Node, redirect, cookie, rifiuto anonimo, PTY, IPC e nessun orfano: verde |
| `R01-GUSCIO`, `R01-ARRESO` | Falliscono prima della finestra; processo GPU `-1073741515` / `0xC0000135`, poi `GPU process isn't usable` |
| Controprova con EXE originale dell'owner | Gli stessi **2 rossi**; nessuna modifica ai sandbox per aggirarli |
| `electron-builder --dir --win --x64 --publish never` | Cartella reale costruita, codice 0; ultimo giro dopo rimozione dei dati della prova |
| Verifica manifest sulla cartella finale | **8.263/8.263 impronte corrispondenti** |
| `R02-BACKEND-PACCHETTO` | HTTP anonimo 401; cookie 200; comando PTY eseguito con uscita 0; llama.cpp `observed`, modelli `[]`; Vulkan selezionato; PID backend assente dopo chiusura |
| Sottotest permanente `R02-DATI` | **ROSSO**: `.workspace-launch-token` viene creato sotto resources/harness-ui. Node conta 2 test falliti, sottotest e contenitore: il gate complessivo non è verde |
| `npm run dist` | Codice 1 esplicito prima del download dei tool builder, cache NSIS assente |
| Installer senza opt-in | **1 saltato**, nessuna installazione |
| `TALOS_R02_INSTALLER=1 npm run test:installer` | **1 rosso** al prerequisito EXE/ZIP assenti, prima di qualunque installazione |
| `git diff --check` | Codice 0 |

La prova impacchettata usa porta effimera **51766**. [R02-pacchetto.json](../desktop/.prove/R02-pacchetto.json) contiene le evidenze senza il cookie o la credenziale. I log del backend contengono anche l'avviso preesistente «Il runtime agente non espone il catalogo task richiesto»: il successo di health non prova un giro agente. Nessun modello o provider a pagamento è stato chiamato.

Due problemi di packaging scoperti e risolti, con gate permanente: **R02-RISORSE-NODE-MODULES**, 7.963 file inizialmente esclusi dal filtro upstream, risolto con FileSet dedicati; **R02-MANIFEST**, `.gitkeep` upstream escluso da builder, ora tolto prima del manifest. Il controllo di integrità precede sempre il probe impacchettato. Il probe rifiuta anche una cartella già contaminata da dati di un giro precedente.

La cartella finale è stata ricostruita dopo il probe: **nessun file di stato nascosto nella radice resources/harness-ui**, nessuna credenziale della prova nel programma consegnato. I dati e i log della prova rimangono soltanto negli artefatti locali ignorati; non sono una distribuzione pubblicata.

## File su disco e righe

Percorsi relativi a `harness-ui/desktop/`, salvo il rapporto. Le righe indicano l'ingresso rilevante; nessun file è stato aggiunto all'indice git.

| File | Righe | Intervento |
|---|---:|---|
| `.gitignore` | 3 | Staging, cache e dist esclusi |
| `package.json` | 7, 21, 26 | Script, pin esatti e configurazione builder/NSIS/ZIP |
| `package-lock.json` | 1 | Lock locale aggiornato; 286 package desktop installati |
| `runtime.mjs` | 6, 18 | Risorse packaged, scoperta sorgente conservata, Vulkan/CPU |
| `main.mjs` | 12, 106 | AUMID e passaggio del percorso motore via ambiente |
| `scripts/prepara-pacchetto.mjs` | 14, 19, 31, 49, 75, 83, 105, 127 | Pin, selezione, digest, inventario, npm ci, cache, ZIP, staging |
| `scripts/distribuisci.mjs` | 1 | API builder, cache/permesso rete e pubblicazione disabilitata |
| `scripts/verifica-nativi.mjs` | 1 | Probe reale node-pty/keyring/sqlite-vec in Electron |
| `scripts/genera-icone.mjs` | 5, 10 | ICO upstream dai PNG del marchio |
| `assets/talos.ico` | binario | Icona 256/32 px; PNG R01 invariati |
| `assets/installer.nsh` | 1 | Intestazione, colori Calm e branding nativo |
| `assets/llama-LICENSE.txt` | 1 | Testo MIT dal tag b10517, non tradotto perché avviso originale |
| `tests/runtime.test.mjs` | 42, 49 | Percorsi e selezione con ripiego/override |
| `tests/pacchetto.test.mjs` | 8, 15, 24 | Hash errato, esclusioni/link, inventario |
| `tests/pacchetto.spec.mjs` | 14 | Gate reale cartella builder e regressione dati |
| `tests/installer.spec.mjs` | 37 | Opt-in installazione, UI, PTY, runtime, hash, cleanup e conservazione dati |
| `README.md` | 1, 16, 37, 53, 116 | Stato, requisiti, SmartScreen, build/cache, dati/disinstallazione |
| `LEDGER-R02.md` | 1 | Dossier, simboli, RED/GREEN e cinque emendamenti |
| `../.claude/RAPPORTO-R02-INSTALLER-2026-09-13.md` | 1 | Questo rapporto |

Prove principali ignorate: `.staging/MANIFEST.json`, `.prove/R02-pesi.json`, `.prove/R02-pacchetto.json`, `.prove/R01-backend.json`, `.prove/R01-misure.json`. La lista completa dei file di staging è nel manifest, non un glob implicito. Le cache npm e gli archivi ufficiali sono esclusi dalla consegna git.

## Diff non applicati e handoff all'owner

**`harness-ui/server.mjs` è vietato in questo lotto.** Il diff qui sotto è una proposta meccanica da sottoporre a RED/GREEN dell'owner: rende unico il percorso dei dati del backend, usa `TALOS_DESKTOP_DATA_DIR` già passato dal guscio e mantiene il default da sorgente quando assente. Non è stato applicato né dichiarato verificato. Non risolve da solo migrazione dei dati precedenti, compatibilità dei profili o il crash GPU.

Gli store coinvolti sono provider runtime, sorgente ricerca, immagini chat/generate, modelli/trasferimenti GGUF, token workspace, automazioni e favicon. Gate owner: test config/default sorgente, CRUD degli store, import/lettura GGUF, reload e persistenza, `R02-DATI`, installazione/disinstallazione, regressione completa backend e flussi UI interessati. La licenza del repository resta Apache-2.0 mentre package desktop dichiara AGPL-3.0-only: riallineamento nel lotto R-05, non cambiato da R-02.

```diff
diff --git a/harness-ui/server.mjs b/harness-ui/server.mjs
--- a/harness-ui/server.mjs
+++ b/harness-ui/server.mjs
@@ -46,11 +46,19 @@ import { WebSocket } from 'ws'; // 07/9: il canale di controllo verso il Chromiu
 import { creaGestoreBrowserVivo } from './src/browser-sessione-viva.mjs'; // 07/9: il Chromium di sistema pilotato dal server
 import { createLocalRuntimeProbe } from './src/local-runtime-probe.mjs';
 import { readGgufHeader } from './src/gguf-header.mjs';
-import { join, parse } from 'node:path';
+import { join, parse, isAbsolute } from 'node:path';
 
 /** ⛔ Stessi tre nomi loopback validati in config.mjs (`LOOPBACK_HOSTS`, non esportato — costante minuscola e stabile, duplicarla qui è più semplice che aggiungere un export per tre stringhe). Un browser può presentarsi con uno qualunque dei tre alias anche se il server è bindato su un altro. */
 const ALIAS_LOOPBACK = ['127.0.0.1', '::1', 'localhost'];
 
+// Proposta R-02: preservare il default sorgente e rispettare il profilo desktop.
+function percorsoDatiDesktop(relativo) {
+  const cartella = process.env.TALOS_DESKTOP_DATA_DIR;
+  if (!cartella) return fileURLToPath(new URL(relativo, import.meta.url));
+  if (!isAbsolute(cartella)) throw new Error('TALOS_DESKTOP_DATA_DIR deve essere assoluto.');
+  return join(cartella, relativo);
+}
+
 async function startServer() {
   const config = loadConfig(process.env, import.meta.url);
   let providerKeyring = null;
@@ -67,7 +75,7 @@ async function startServer() {
   const providerStore = createProviderCredentialStore({
     env: process.env,
     keyring: providerKeyring,
-    runtimeFile: fileURLToPath(new URL('.provider-runtime.json', import.meta.url)),
+    runtimeFile: percorsoDatiDesktop('.provider-runtime.json'),
   });
   providerStore.loadFromKeyring();
 
@@ -83,7 +91,7 @@ async function startServer() {
   const searchSourceStore = createSearchSourceStore({
     env: process.env,
     keyring: providerKeyring,
-    file: fileURLToPath(new URL('.search-source.json', import.meta.url)),
+    file: percorsoDatiDesktop('.search-source.json'),
   });
   const trasportoSenzaChiave = creaTrasportoSenzaChiave();
   const ricercaWebFn = () => searchSourceStore.perKernel({ trasportoSenzaChiave, sentinellaDuckDuckGo: ENDPOINT_SENTINELLA_DUCKDUCKGO });
@@ -152,7 +160,7 @@ async function startServer() {
   let supervisoreLocale = null;
   let contextRuntime = null;
 
-  const chatImageStore = createChatImageStore({ rootDir: fileURLToPath(new URL('.chat-images/', import.meta.url)) });
+  const chatImageStore = createChatImageStore({ rootDir: percorsoDatiDesktop('.chat-images/') });
   const readModelCapabilities = async modelId => {
     try {
       const { modelli } = await modelCatalog.ottieni();
@@ -212,7 +220,7 @@ async function startServer() {
     taskCatalogError = error;
     console.warn(`[runtime-owner] catalogo task non disponibile: ${error.message}`);
   }
-  const localModelStore = createLocalModelStore({ rootDir: fileURLToPath(new URL('.local-models/', import.meta.url)) });
+  const localModelStore = createLocalModelStore({ rootDir: percorsoDatiDesktop('.local-models/') });
   /*
    * ⭐ 12/09, P-C — il motore locale si sonda all'INDIRIZZO che la persona ha scelto nel pannello
    *   Provider, lo stesso con cui la chat lo chiamerà: sondare un indirizzo e chiamarne un altro
@@ -226,9 +234,9 @@ async function startServer() {
     }])),
   });
   const hfHubClient = createHfHubClient({ token: config.hfToken });
-  const localModelTransfer = createHfDirectTransfer({ rootDir: fileURLToPath(new URL('.local-models/', import.meta.url)), modelStore: localModelStore, hubClient: hfHubClient });
-  const generatedImageStore = createGeneratedImageStore({ rootDir: fileURLToPath(new URL('.generated-images/', import.meta.url)) });
-  const workspaceLaunchStore = createWorkspaceLaunchStore({ credentialFile: fileURLToPath(new URL('.workspace-launch-token', import.meta.url)) });
+  const localModelTransfer = createHfDirectTransfer({ rootDir: percorsoDatiDesktop('.local-models/'), modelStore: localModelStore, hubClient: hfHubClient });
+  const generatedImageStore = createGeneratedImageStore({ rootDir: percorsoDatiDesktop('.generated-images/') });
+  const workspaceLaunchStore = createWorkspaceLaunchStore({ credentialFile: percorsoDatiDesktop('.workspace-launch-token') });
   const localRuntimes = {
     ollama: {
       detect: () => compatibleRuntime.detect('ollama'), listModels: () => compatibleRuntime.listModels('ollama'),
@@ -301,7 +309,7 @@ async function startServer() {
         const manifest = await localModelStore.inspect(modelId);
         if (!manifest || manifest.state !== 'ready') { const error = new Error('Modello locale non pronto'); error.code = 'MODEL_NOT_FOUND'; throw error; }
         const file = manifest.files[0];
-        const radiceModelli = fileURLToPath(new URL('.local-models/', import.meta.url));
+        const radiceModelli = percorsoDatiDesktop('.local-models/');
         const modelPath = join(radiceModelli, manifest.path, file.path);
         let contextLength = Number.isInteger(opzioni.contextLength) && opzioni.contextLength > 0 ? opzioni.contextLength : null;
         if (contextLength === null) {
@@ -371,7 +379,7 @@ async function startServer() {
        * da `load` poche righe sopra — un solo posto da cambiare se un
        * giorno la cartella si sposta.
        */
-      readHeader: (percorsoRelativo) => readGgufHeader(join(fileURLToPath(new URL('.local-models/', import.meta.url)), percorsoRelativo)),
+      readHeader: (percorsoRelativo) => readGgufHeader(join(percorsoDatiDesktop('.local-models/'), percorsoRelativo)),
       measureMachine: () => misuraCapacitaMacchina({ storagePath: config.publicDir }),
     });
   }
@@ -497,7 +505,7 @@ async function startServer() {
    * prossimo giro.
    */
   const automationStore = createAutomationStore({
-    cartella: fileURLToPath(new URL('.automations/', import.meta.url)),
+    cartella: percorsoDatiDesktop('.automations/'),
   });
   const automationScheduler = createAutomationScheduler({
     store: automationStore,
@@ -611,7 +619,7 @@ async function startServer() {
     custodisciChiaveOpenRouter: async (chiave) => { providerStore.setKey('openrouter', chiave); },
     contextService: contextRuntime?.service,
     // ⭐ 10/09: le favicon delle fonti, prese dal server una volta sola e tenute qui accanto alle sessioni.
-    cartellaFavicon: fileURLToPath(new URL('.favicon-cache/', import.meta.url)),
+    cartellaFavicon: percorsoDatiDesktop('.favicon-cache/'),
     chatImageStore,
     staticHandler: createStaticHandler(config.publicDir),
     sessionRegistry,

```

## Cosa non è stato verificato

- Compilazione NSIS e ZIP, /S, registro, collegamenti, rimozione file/processi dopo uninstall, dimensione installata e tempo della finestra installata. Il test esiste ma manca il prerequisito degli artefatti.
- Finestra dell'installer e confronto grafico col marchio; app installata nei due temi a 1024×800 e 1440×900; reload, tastiera e reduced-motion del percorso installato. Gli screenshot sono previsti dal test ma **non prodotti**.
- Doppio clic manuale, schermata SmartScreen reale, download marcato da Windows, account standard pulito o Windows 10 1809. Non si dichiara che la sola combinazione di opzioni equivalga a una prova su macchina pulita.
- Inferenza reale, download/import di modelli, fallback su una macchina realmente priva di Vulkan. CPU e selezione Vulkan sono provati sul banco; il fallback è coperto dal test puro.
- Suite generali backend, frontend e kernel: nessun relativo sorgente modificato. Nessun giro agente da composer attraverso provider a pagamento. La suite desktop e il backend impacchettato sono i gate eseguiti.
- Audit completo delle licenze di tutte le DLL della release upstream, migrazione Apache/AGPL e pubblicazione dei sorgenti corrispondenti; firma, attestazioni e auto-update appartengono ad altri lotti.
- Enumerazione globale dei processi via WMI/CIM: il sandbox restituisce «Accesso negato». La verifica positiva di chiusura riguarda i PID dei figli conosciuti dai test, non una certificazione globale del sistema. Il gate installer segnala esplicitamente questo errore se non può verificare i processi.

La selezione di produzione è ripetibile dai lock e le impronte sono confrontabili; non è stata dimostrata una build EXE byte-identica fra macchine. La misurazione futura distingue creazione della BrowserWindow dalla sua visibilità e non include il tempo della schermata SmartScreen.

## Testo di commit proposto, non eseguito

```text
feat(desktop): prepara R-02 con staging verificato e configurazione NSIS/ZIP

Aggiunge electron-builder 26.16.1, staging dai lock di produzione, llama.cpp
b10517 CPU/Vulkan con SHA256, manifest e risoluzione delle risorse nel guscio.
Include icone, avvisi, README e gate opt-in per pacchetto e installer reale.

Verificati 22 test puri, backend/PTY R01 e flussi HTTP/PTY/motore del pacchetto.
Lotto non accettato: cache NSIS da fornire/autorizzare, GUI R01 bloccata dal
processo GPU e regressione dati backend aperta con diff non applicato.
```

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** fornire cache ufficiali o rispondere all'autorizzazione dei due download builder; prendere in carico il diff di `server.mjs`, il gate GPU preesistente e l'allineamento licenze. Nessuna richiesta di commit automatico.

**Cosa faccio io:** consegno questi file, lo staging e la cartella builder pulita, le impronte e le prove ripetibili. Mantengo i test rossi visibili e i file vietati intatti. Dopo lo sblocco dei prerequisiti posso eseguire i gate già preparati senza riaprire la scelta dell'installer.

**Cosa rimane:** produrre realmente EXE/ZIP, installare per utente, provare finestra/Terminale/motori con profilo nuovo, fotografare temi e installer, misurare pesi/avvio e disinstallare verificando dati e processi. **R-02 non va segnato chiuso con queste evidenze.**
