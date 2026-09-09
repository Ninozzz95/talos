# PROMPT DI RIPRESA — main agent — debiti mobile dopo Codice

Riprendi il lavoro nel repository:

`C:\Users\Antonino\Desktop\projects\AVM`

Branch attuale: `lane/voce-personale`.
HEAD di partenza: `8dc14d74 chore(mobile): consolida fix e consegne debiti`.

L'owner ha fermato la sessione precedente per esaurimento del tempo. Prima di
scrivere o committare, leggi per intero e in quest'ordine:

1. `C:\Users\Antonino\Desktop\projects\AVM\AGENTS.md`
2. `C:\Users\Antonino\Desktop\projects\AVM\.claude\LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
3. `C:\Users\Antonino\Desktop\projects\AVM\.claude\DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
4. `C:\Users\Antonino\Desktop\projects\AVM\.claude\CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
5. Questo documento.

Non ripartire da zero e non ripetere domande già chiuse. Ispeziona prima
`git status --short` e il diff reale. Il worktree contiene modifiche non
committate della sessione precedente: preservale, non resettarle e non usare
`git add -A`.

## Obiettivo residuo esatto

Concludere e verificare i due ultimi debiti senza aprire altro scope:

- **DEBT-MOBILE-014:** continuità download nel Model Lab tablet. La testata
  deve mostrare il centro download quando la rail chat non esiste; il pulsante
  `Scarica {{quantizzazione}}` deve trasformarsi nello stesso punto in una
  barra reale; il popover download deve apparire sopra la sidebar globale e
  restare cliccabile.
- **DEBT-MOBILE-015:** durante lo streaming locale LFM2/LFM2.5, thinking e
  sintassi tool non devono mai entrare nella risposta pubblica. Il ragionamento
  resta nel canale dedicato e la risposta persistita resta pulita.

Non modificare TALOS-BANCO. Non cambiare il budget del bundle per far passare
il gate. Non creare nuovi parser, store, poller o dipendenze: il fix corrente
riusa le autorità già esistenti.

## Implementazione già presente e da preservare

### Download/overlay

- `mobile/src/App.vue`
  - `hide-app-actions` dipende da tablet **e** presenza reale della chat rail.
- `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue`
  - `selectedTransfer` abbina `repo`, `revision`, `paths` alla variante;
  - il bottone diventa `role=progressbar` con bytes/percentuale reali.
- `mobile/src/style.css`
  - `--talos-z-app-overlay: 120`, sopra navigazione globale 110.
- `mobile/src/components/shell/TalosMobileDownloadCenterTrigger.vue`
  - il popover usa il token overlay.
- `mobile/src/components/shell/TalosMobileSidebar.vue`
  - drawer `modal=false`;
  - overlay manuale sopra il fondo ma `pointer-events-none`, così il popover
    portaled resta utilizzabile e le righe sidebar restano cliccabili.

### Streaming locale

- `mobile/src/lib/chat/thinkStream.ts`
  - `talosCreateThinkSplitter(startsInReasoning = false)` può partire nel
    canale ragionamento mantenendo il default compatibile.
- `mobile/src/lib/chat/providers/localAdapter.ts`
  - lo stato iniziale deriva esclusivamente dal prompt renderizzato:
    `plan.prompt.trimEnd().endsWith('<think>')`.

Questa è una correzione alla radice del flusso condiviso. Non sostituirla con
filtri DOM, riconoscimento per nome modello o guardie duplicate nei caller.

## Test già aggiunti

- `mobile/tests/unit/chat/thinkStream.test.ts`
- `mobile/tests/unit/chat/localAdapter.test.ts`
- `mobile/tests/unit/models/TalosMobileLocalRepoDetail.test.ts`
- `mobile/tests/unit/shell/TalosMobileDownloadCenterTrigger.test.ts`
- `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
- `mobile/tests/e2e/mobile-model-download-center.e2e.spec.ts`

Ultima evidenza automatica della sessione precedente:

- focalizzati: **106 passati, 0 falliti**;
- typecheck: verde;
- suite Vitest: **6.363 passati, 10 saltati, 0 falliti**;
- Playwright download center: **5/5**;
- Vite build: verde;
- Capacitor copy: verde;
- Gradle compile debug/release: verde;
- Gradle assembleDebug: verde;
- `git diff --check`: verde, con soli warning CRLF/LF;
- `npm run build`: rosso solo sul tripwire esistente
  **614288 byte > 614000 byte**.

Riesegui i gate necessari prima di qualsiasi dichiarazione finale. Non dare per
verdi risultati storici se il diff cambia.

## Ricerca upstream già svolta

La ricerca e la decisione sono nel dossier. Fonti principali:

- WAI-ARIA progressbar e range properties;
- Reka UI Popover;
- MDN stacking context;
- llama.cpp `common/chat.h` e `common/chat.cpp`;
- Hugging Face Chat Response Parsing e Chat Templates.

Decisione: adattare componenti/helper esistenti, nessuna nuova dipendenza.

## APK ed evidenze

APK finale già costruita, copiata nei Download e installata sul Pad:

`C:\Users\Antonino\Downloads\talos-debug-2026-08-26-post-code-debts-final.apk`

SHA-256:

`AEE53F439E71A5CEA16AD16098F46B34CCDC8AF58C149D1B4075F2D304F4677E`

Pad: seriale `2ea6573c`, package `ai.talos`, activity
`ai.talos/.MainActivity`. ADB:

`C:\Users\Antonino\AppData\Local\Android\Sdk\platform-tools\adb.exe`

Cartella evidenze:

`C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26`

Finali già ispezionate: `final-tablet-landscape-loaded.png`,
`final-phone-landscape.png`, `final-phone-portrait.png`,
`final-code-navigation.png`, `final-code-list-loaded.png`,
`final-library-route.png`, `final-settings-route.png`,
`final-model-lab-header.png`, `final-models-local-header.png`,
`05-sidebar-open-atomic.png`, `06-sidebar-body-swipe-atomic.png`.

La cartella contiene anche molte catture esplorative storiche. Non committarle
tutte automaticamente: seleziona soltanto l'evidenza finale utile.

## Tre gate fisici ancora aperti

1. **Tablet portrait reale:** il tentativo precedente ha prodotto di nuovo
   landscape (`rotation=1`). `final-tablet-portrait-requested-loaded.png` non
   vale come portrait. Verifica la forma reale guardando lo screenshot, non il
   solo comando `wm`.
2. **Download attivo reale:** avvia un download piccolo/controllato, verifica
   icona di testata, pulsante che diventa barra, percentuale/bytes, popover
   sopra sidebar e comportamento dopo chiusura/rientro. Non simulare successo.
3. **Streaming LFM2.5 reale:** osserva una risposta durante la generazione con
   thinking e tool call. Nessun testo interno o marker deve apparire nella
   bolla pubblica; verifica poi la risposta finale e il reload.

L'owner ha chiesto una verifica Pad atomica soltanto dopo aver chiuso tutti i
fix. Non installare un APK dopo ogni micro-modifica. Ogni nuova APK installata
deve essere copiata anche nei Download del PC.

## Stato Git e consegna

I file elencati nel ledger sono non committati. L'owner aveva autorizzato il
commit, ma non il push. Prima di staging:

1. `git status --short`;
2. controlla che nessun file estraneo sia entrato nel worktree;
3. aggiungi soltanto percorsi espliciti, mai `git add -A`;
4. esegui i gate finali e `git diff --check`;
5. aggiorna ledger e consegna con evidenza nuova;
6. commit in italiano, senza co-authoring;
7. non fare push senza autorizzazione esplicita e fresca.

Se non riesci a chiudere uno dei tre gate fisici, fermati e dichiaralo aperto:
non usare test sintetici per chiamare completata una prova reale mancante.

## Riassunto operativo semplice

Il codice è già scritto e i test automatici sono verdi. Non devi reinventare
la soluzione: devi controllare il diff, completare tre prove sul Pad, aggiornare
i documenti, selezionare l'evidenza finale e committare solo i file giusti.
