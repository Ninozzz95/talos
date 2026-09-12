# TALOS Desktop 0.1.0 — R-02

Guscio Electron 44.3.0 della stessa interfaccia web TALOS, tema Calm di serie.
Il servizio locale usa `process.execPath` con `ELECTRON_RUN_AS_NODE=1`: nessun
Node separato dal PATH nell'avvio del prodotto. Il pacchetto comprende backend,
interfaccia costruita, kernel, context-engine e motore llama.cpp b10517 CPU/Vulkan.
I modelli GGUF non sono inclusi: il loro download dall'app appartiene a R-03.

**Stato: lotto non ancora accettato.** Lo staging e la cartella creata da
electron-builder sono provati. Il backend impacchettato risponde con cookie,
esegue il PTY e rileva il motore incluso. Restano aperti il percorso dati del
backend, il crash GPU preesistente e la build EXE/ZIP (cache NSIS assente, rete
aggiuntiva da autorizzare). Non distribuire questa copia come release conclusa.
Rapporto: [R-02](../.claude/RAPPORTO-R02-INSTALLER-2026-09-13.md).

## Requisiti e installazione prevista

Windows 10 **1809 o successivo, x64**, oppure Windows 11 x64. Non serve installare
Node. Per l'accelerazione Vulkan occorre un driver GPU compatibile; se il binario
Vulkan non è eseguibile, il guscio usa quello CPU incluso. La compatibilità con
Windows 10 1809 e con macchine senza driver Vulkan deve ancora essere provata.

L'artefatto previsto è `TALOS-Setup-0.1.0.exe`: doppio clic, installazione per
l'utente corrente senza richiesta di amministratore, collegamenti «TALOS» e
apertura dell'app. NSIS oneClick usa normalmente
`%LOCALAPPDATA%\Programs\talos-desktop` (nome npm sanitizzato). Se Windows ha
rilocato UserProgramFiles, segue quella cartella. Non mostra una scelta del percorso.

L'alternativa `TALOS-0.1.0-win.zip` si estrae **interamente** in una cartella
scrivibile; aprire `TALOS.exe`, mantenendo `resources` e le DLL accanto all'EXE.
Lo ZIP usa anch'esso il profilo utente: non è una modalità con dati accanto allo ZIP.

La v0.1 non contiene auto-update né telemetria aggiunti dal guscio. La rete è
necessaria quando la persona usa un provider remoto o scarica un modello;
installazione e motore CPU sono inclusi nel pacchetto completo.

## Avviso SmartScreen: v0.1 non firmata

L'installer non ha una firma TALOS. Windows può mostrare **«PC protetto da Windows»**
con autore sconosciuto. Dopo aver verificato provenienza e SHA256 pubblicato dalla
release: aprire **«Ulteriori informazioni»**, controllare che il file sia
`TALOS-Setup-0.1.0.exe`, quindi scegliere **«Esegui comunque»** se si intende procedere.
Se l'opzione manca per una regola del dispositivo, rivolgersi al suo amministratore.
Non disattivare SmartScreen o Defender e non rimuovere automaticamente il blocco
dei file scaricati. R-02 non è stato provato con un download marcato da Windows.

La personalizzazione NSIS usa il logo originale, l'accento Calm e testi italiani;
resta una finestra nativa Windows. Non riproduce il frontend HTML. Con
`signAndEditExecutable:false` il builder lascia anche icona e metadati PE del
binario Electron originali; le icone di installer, disinstallatore e finestra
sono configurate separatamente. Questo limite deve essere rivisto dall'owner.

## Preparazione e build

Da `harness-ui/desktop` su Windows x64, con i sorgenti R-01 e `public/` già costruito:

```powershell
npm ci --cache .cache-r02/npm
npm run dist
```

Lo script usa Electron **44.3.0**, electron-builder **26.16.1**, resedit **1.7.2**
e resvg **2.6.2**. `electronDist` punta a `node_modules/electron/dist` già completo:
una build non scarica un'altra copia di Electron. L'installazione npm deve aver
preparato questa distribuzione (oppure deve essere stata fornita una copia verificata).

`npm run prepara` ricrea `.staging/`, copia solo le radici dichiarate di produzione,
esegue `npm ci --omit=dev` separatamente per backend e contesto, verifica addon
con Electron e scarica gli ZIP llama.cpp ufficiali controllando gli SHA256 fissati
in `scripts/prepara-pacchetto.mjs`. La cache è `.cache-r02/`; una cache esterna di
ZIP llama può essere indicata con `TALOS_R02_LLAMA_CACHE`. Non riusa i binari
estratti nella `.local-runtime` dell'owner. Le impronte vengono verificate a ogni giro.

`.staging/MANIFEST.json` contiene percorso relativo, byte e SHA256 di ogni file di
staging, versioni, provenienza degli archivi e data UTC. Il manifest stesso è
escluso dalla propria lista. La selezione è riproducibile dai lock; non si dichiara
identità byte per byte degli installer (timestamp e metadati possono variare).

Per rispettare il limite di rete del lotto, la build richiede cache ufficiali
verificate sotto `ELECTRON_BUILDER_CACHE` (default `.cache-r02/builder`):

- `nsis@1.2.1/nsis-bundle-3.12.tar.gz`;
- `7zip@1.0.0/7zip-win-x64.tar.gz`.

Solo dopo autorizzazione dei download dei tool ufficiali builder, impostare
`TALOS_R02_BUILDER_NETWORK=1` prima di `npm run dist`. `publish:null` e
`publish:never` impediscono la pubblicazione. Non ci sono aggiornamenti automatici.

Per controllare localmente la cartella del programma, senza i tool NSIS/ZIP:

```powershell
npm run prepara
node node_modules/electron-builder/out/cli/cli.js --dir --win --x64 --publish never
$env:TALOS_R02_PACCHETTO = '1'
node --test tests/pacchetto.spec.mjs
```

Il gate confronta tutti gli hash del manifest prima dell'avvio e prova i percorsi
reali, cookie, PTY e rilevamento del motore. Il sottotest `R02-DATI` resta rosso
finché il backend scrive fuori da `userData`.

Il test dell'installer **installa e disinstalla davvero**, solo su richiesta:

```powershell
$env:TALOS_R02_INSTALLER = '1'
npm run test:installer
```

Non sovrascrive installazioni esistenti. Usa dati isolati in `.prove/`, porte
effimere e nessun modello. `TALOS_R02_INSTALL_DIR` può indicare una destinazione
assoluta di banco: il rapporto la distingue dal percorso NSIS predefinito.
Le misure, screenshot e risultati finiscono in `.prove/R02-installer.json` e PNG.
Il tempo misura dal lancio strumentato dell'EXE installato alla prima BrowserWindow,
non un doppio clic manuale comprensivo di SmartScreen.

## Dati e disinstallazione

Registro, geometria della finestra e sessioni del guscio sono in
`%APPDATA%\TALOS` (`app.getPath('userData')`); il menu permette di aprire il registro.
Per prove isolate si può impostare `TALOS_DESKTOP_DATA_DIR` a un percorso assoluto.

**Limite da risolvere prima del rilascio:** il backend esistente mantiene ancora
modelli, immagini, automazioni, cache favicon e alcuni file di configurazione
accanto a `resources/harness-ui/server.mjs`. La prova ha misurato la creazione di
`.workspace-launch-token` lì. Questi dati non hanno ancora la garanzia di
conservazione del profilo: la correzione proposta per il backend è nel rapporto,
non applicata perché fuori dal perimetro R-02.

Per disinstallare: chiudere TALOS anche dal vassoio, aprire **Impostazioni → App →
App installate → TALOS → Disinstalla** (su Windows 10: **App e funzionalità**).
In alternativa avviare `Uninstall TALOS.exe` nella cartella del programma.
`deleteAppDataOnUninstall:false` conserva il profilo utente. Rimuoverlo manualmente
solo se si vogliono eliminare anche registro, impostazioni e sessioni.

## Avvio da sorgente

Questo percorso di sviluppo richiede le dipendenze del repository già presenti,
comprese quelle di `context-engine/`; i comandi npm sono strumenti di sviluppo.
Il percorso impacchettato usa invece lo staging di produzione descritto sopra.

```powershell
cd harness-ui/desktop
npm install
npm run icone
npm start
npm run test:puri
npm test
npm run prova:pty
```

`npm test` usa serialmente i test puri, il backend reale in Electron Node e
`tests/guscio.spec.mjs`, con Playwright 1.62.1 già installato nel frontend.
Non installa nulla nel frontend e non esegue le suite generali.

Nella sessione con filesystem limitato: usare `npm install --cache .prove/npm-cache`
e impostare `electron_config_cache` a una cartella assoluta sotto `desktop/.prove/`
prima del primo avvio: Electron scarica il binario al primo utilizzo.

## Percorsi e dati

- Sorgente: server nella cartella padre di `app.getAppPath()`.
- Confezionato, contratto per R-02: `process.resourcesPath/harness-ui/server.mjs`,
  insieme a `src/`, `public/`, `node_modules/` e al fratello `context-engine/`
  con le sue dipendenze. Il backend e i moduli nativi devono essere esterni ad asar.
- Override dichiarato: `TALOS_DESKTOP_HARNESS_DIR`, percorso assoluto.
- Profilo finestra, registro e sessioni: `app.getPath('userData')`; override assoluto
  `TALOS_DESKTOP_DATA_DIR`. La posizione esatta del registro è visibile dal menu.
- I test copiano il backend senza modificarlo sotto `.prove/`, per isolare anche
  gli store che il server esistente crea accanto al proprio file. La completa
  rilocazione di questi store resta un passaggio del backend prima dell'installer.
- Porta scelta dal sistema, esplicita nel figlio, sempre diversa da 4174.
  Il backend attuale rifiuta 0: il guscio prenota una porta con `listen(0)`, la
  rilascia e avvia il server. Una collisione produce un errore e un nuovo tentativo.

## Comportamento implementato

Istanza unica; «Apri TALOS», «Apri nel browser», «Esci» nel vassoio; azione browser
anche nel menu; salvataggio della geometria; «Resta nel vassoio alla chiusura»
spento di serie e persistente. Chiudere la finestra normalmente termina il figlio.
Lo spegnimento usa IPC privato per attivare la pulizia PTY del backend su Windows,
poi un termine forzato dopo cinque secondi. La perdita del padre chiude il figlio.

Cinque riavvii automatici con attese 500/1000/2000/4000/8000 ms; al termine,
dialogo «Riprova», «Apri il registro», «Esci», anche se nessuna finestra è aperta.
Registro con oscuramento delle credenziali e limite di dimensione.

Renderer senza Node o preload, con isolamento e sandbox attivi; nuove finestre
e navigazioni fuori dall'origine locale bloccate. `ignore-gpu-blocklist` conservato.

L'ingresso browser riusa il redirect `/?token=` esistente e il cookie HttpOnly,
SameSite=Strict. Il token non compare negli argomenti del figlio né nel registro.
L'URL passato all'associazione browser di Windows contiene la credenziale: la
pulizia della barra dopo il redirect non garantisce l'assenza dalla riga di comando
interna del browser o dalla sua cronologia. Questa parte non è certificata e va
risolta prima di considerare rispettato il vincolo assoluto sui segreti.

## Provenienza

Electron 44.3.0 (MIT), Playwright 1.62.1 esistente (Apache-2.0), node-pty 1.1.0
esistente (MIT). La prova Windows x64 carica direttamente il prebuild
`prebuilds/win32-x64/conpty.node`, senza rebuild. Altre piattaforme o binari
richiedono di ripetere la prova; la via ufficiale in caso di incompatibilità è
`@electron/rebuild` nel pacchetto desktop, senza alterare gli addon del browser.

`npm run icone` rasterizza il marchio originale
`../public/talos/brand/logo-short.svg` nell'accento Calm `#c08b3c` con
`@resvg/resvg-js@2.6.2` (MPL-2.0, sola dipendenza di sviluppo).
Conservare licenze Electron/Chromium e node-pty nella futura distribuzione.
Il codice del prodotto segue la decisione AGPL-3.0-only dell'owner.
