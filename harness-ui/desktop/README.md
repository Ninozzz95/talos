# TALOS Desktop 0.1.0 — R-01

Guscio Electron 44.3.0 della stessa interfaccia web TALOS, tema Calm di serie.
Il servizio locale usa `process.execPath` con `ELECTRON_RUN_AS_NODE=1`: nessun
Node separato dal PATH nell'avvio del prodotto. Installer, motore locale e CI
Windows appartengono ai lotti successivi.

**Stato della verifica:** 17 test puri e il gate backend/PTY passano. I due test
Playwright Electron falliscono in questa sessione Windows prima della finestra
per il crash del processo GPU `-1073741515`. R-01 non è dichiarata accettata.
Rapporto: `../.claude/RAPPORTO-R01-GUSCIO-ELECTRON-2026-09-13.md`.

## Avvio da sorgente

Questo percorso di sviluppo richiede le dipendenze del repository già presenti,
comprese quelle di `context-engine/`; i comandi npm sono strumenti di sviluppo.
Il futuro pacchetto R-02 conterrà il runtime e tutte le dipendenze.

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
