# Prompt per l'agente Claude mobile — chiudi DEBT-MOBILE-014/015

Da: agente Claude desktop (coordinatore, sessione `avm-e8`), dopo review
indipendente completa del worktree.
A: agente Claude mobile (backend mobile).
Owner: Antonino.

Questo prompt sostituisce, per te, `.claude/PROMPT-RIPRESA-MAIN-AGENT-DEBITI-MOBILE-2026-08-26.md`
(che resta sul disco invariato: è la versione scritta dalla sessione precedente
prima dello stop). Il contenuto tecnico è lo stesso; qui trovi in più la
verifica indipendente appena fatta e i confini rispetto al mio lavoro.

## Perché arriva a te

L'agente che ha scritto il codice di DEBT-MOBILE-014/015 ha finito
l'implementazione ma NON ha completato: mancano tre prove fisiche sul Pad, mai
sostituibili con test sintetici. L'owner ha deciso di delegare la chiusura di
questo lavoro a te (agente mobile), non a me (agente desktop — io continuo su
TALOS-BANCO e Harness Desktop in parallelo).

## Leggi per intero, in quest'ordine, prima di scrivere o committare

1. `C:\Users\Antonino\Desktop\projects\AVM\AGENTS.md`
2. `C:\Users\Antonino\Desktop\projects\AVM\.claude\LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
3. `C:\Users\Antonino\Desktop\projects\AVM\.claude\DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
4. `C:\Users\Antonino\Desktop\projects\AVM\.claude\CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
5. `C:\Users\Antonino\Desktop\projects\AVM\.claude\PROMPT-RIPRESA-MAIN-AGENT-DEBITI-MOBILE-2026-08-26.md`
6. Questo documento.

Non ripartire da zero, non riaprire domande già chiuse nei documenti sopra.

## Verifica indipendente già fatta da me, adesso — non ripeterla, fidatene

Branch `lane/voce-personale`, HEAD `8dc14d74 chore(mobile): consolida fix e
consegne debiti`. Appena verificato, in quest'ordine:

- `git status --short` combacia ESATTAMENTE con la lista "File esatti ancora
  non committati" del ledger: 3 documenti `.claude/*DEBITI-MOBILE*`, 12 file
  di prodotto/test mobile, più `PROMPT-RIPRESA-MAIN-AGENT-DEBITI-MOBILE-2026-08-26.md`
  e le immagini/XML non tracciate in `.claude/pad-debt-campaign-2026-08-26/`.
  Nessun file estraneo nel worktree, nessun file mancante rispetto a quanto
  dichiarato.
- Ho letto per intero (non solo lo stat) il diff di `App.vue`,
  `TalosMobileSidebar.vue`, `TalosMobileDownloadCenterTrigger.vue`,
  `TalosMobileLocalRepoDetail.vue`, `thinkStream.ts`, `localAdapter.ts`,
  `style.css`: sono piccoli, chirurgici, e corrispondono esattamente a quanto
  descritto nei tre documenti — nessuna promessa gonfiata.
- `npm run typecheck`: verde, appena rieseguito.
- `npx vitest run` sui sei file focalizzati (i cinque del ledger più
  `TalosMobileToolSheet.test.ts` come controllo incrociato):
  **120 passati, 0 falliti** — un superset di quanto dichiarato (106).
- `git diff --check`: pulito, zero avvisi.
- DEBT-MOBILE-013 (effort slider): confermato già committato due commit prima
  di HEAD (`ba5c5d34`, `251fccc7`) — non è nel tuo perimetro, non toccarlo.
- Il Pad `2ea6573c` risulta connesso ORA (sia USB sia wireless
  `adb-2ea6573c-...`) — ma verificalo di nuovo tu stesso all'inizio della tua
  sessione: non darlo per scontato al momento in cui leggi questo prompt.

Conclusione della mia review: **il codice e i documenti sono affidabili così
come sono**. Non ho trovato nulla da correggere prima che tu proceda. Il tuo
lavoro è chiudere le tre prove fisiche, non rivedere l'implementazione.

## Obiettivo residuo esatto — nessun altro scope

- **DEBT-MOBILE-014:** continuità download nel Model Lab tablet. Testata con
  centro download quando la rail chat non è montata; il bottone
  «Scarica {{quantizzazione}}» diventa nello stesso punto una barra
  `role=progressbar` con bytes/percentuale reali dallo store trasferimenti
  esistente; il popover del centro download sopra la sidebar globale e
  cliccabile.
- **DEBT-MOBILE-015:** durante lo streaming locale LFM2/LFM2.5, thinking e
  sintassi tool non devono mai entrare nella risposta pubblica; il
  ragionamento resta nel canale dedicato; la risposta persistita e dopo
  reload resta pulita.

## Implementazione già presente — preservala, non la reinventi

### Download/overlay

- `mobile/src/App.vue` — `hide-app-actions` dipende da tablet **e** presenza
  reale della chat rail (`tabletChatRailVisible`).
- `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue` —
  `selectedTransfer` abbina `repo`/`revision`/`paths` alla variante
  selezionata; il bottone si trasforma in `role=progressbar`.
- `mobile/src/style.css` — `--talos-z-app-overlay: 120`, sopra
  `--talos-z-global-navigation: 110`.
- `mobile/src/components/shell/TalosMobileDownloadCenterTrigger.vue` — il
  popover usa il token overlay.
- `mobile/src/components/shell/TalosMobileSidebar.vue` — `Drawer` con
  `:modal="false"`; overlay manuale portato in `Teleport to="body"` con
  `pointer-events-none`, per lasciare cliccabili sia il popover portaled sia
  le righe della sidebar.

### Streaming locale

- `mobile/src/lib/chat/thinkStream.ts` —
  `talosCreateThinkSplitter(startsInReasoning = false)` può partire
  direttamente nello stato `ragionamento`, default compatibile invariato.
- `mobile/src/lib/chat/providers/localAdapter.ts` — lo stato iniziale deriva
  SOLO dal prompt realmente renderizzato:
  `plan.prompt.trimEnd().endsWith('<think>')`, niente euristica su nome
  modello/provider.

Non sostituire questa soluzione con filtri DOM, controlli sul nome del
modello, parser duplicati o modifiche al bridge C++/Java.

## Test già aggiunti — regressione minima da rilanciare

- `mobile/tests/unit/chat/thinkStream.test.ts`
- `mobile/tests/unit/chat/localAdapter.test.ts`
- `mobile/tests/unit/models/TalosMobileLocalRepoDetail.test.ts`
- `mobile/tests/unit/shell/TalosMobileDownloadCenterTrigger.test.ts`
- `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
- `mobile/tests/e2e/mobile-model-download-center.e2e.spec.ts`

Se tocchi qualcosa (dovresti solo aggiungere evidenza, non codice, salvo
sorprese dal gate fisico): rilancia `npm run typecheck`, `npx vitest run`
completo, `npm run build` (verde tranne il tripwire noto sotto),
`npx cap copy android`, Gradle debug/release, `git diff --check`.

## Ricerca upstream già fatta — non rifarla

Nel dossier: WAI-ARIA `progressbar`/range properties, Reka UI Popover, MDN
stacking context, llama.cpp `common/chat.h`/`common/chat.cpp`, Hugging Face
Chat Response Parsing e Chat Templates. Decisione presa: adattare
componenti/helper esistenti, zero dipendenze nuove.

## APK ed evidenze già raccolte

APK finale già costruita, copiata nei Download e installata sul Pad:

`C:\Users\Antonino\Downloads\talos-debug-2026-08-26-post-code-debts-final.apk`
SHA-256 `AEE53F439E71A5CEA16AD16098F46B34CCDC8AF58C149D1B4075F2D304F4677E`

Pad: seriale `2ea6573c`, package `ai.talos`, activity `ai.talos/.MainActivity`.
ADB: `C:\Users\Antonino\AppData\Local\Android\Sdk\platform-tools\adb.exe`

Cartella evidenze: `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26`
(130 file: screenshot finali + molte catture esplorative storiche). Finali già
ispezionate e utili: `final-tablet-landscape-loaded.png`,
`final-phone-landscape.png`, `final-phone-portrait.png`,
`final-code-navigation.png`, `final-code-list-loaded.png`,
`final-library-route.png`, `final-settings-route.png`,
`final-model-lab-header.png`, `final-models-local-header.png`,
`05-sidebar-open-atomic.png`, `06-sidebar-body-swipe-atomic.png`.

Non aggiungere al commit tutte le catture esplorative: seleziona solo
l'evidenza finale utile, comprese le nuove che produrrai per i tre gate sotto.

## I tre gate fisici — l'unico lavoro reale che ti resta

1. **Tablet portrait reale.** Il tentativo precedente ha prodotto di nuovo
   landscape: il device riportava `rotation=1` e ignorava la forma richiesta.
   `final-tablet-portrait-requested-loaded.png` NON è una prova valida.
   Controlla sempre lo screenshot reale, mai solo `wm size`/`user_rotation`.
2. **Download reale attivo.** Avvia un download piccolo e controllato;
   verifica sul Pad: icona download in testata, bottone che diventa barra,
   percentuale/byte in movimento, popover sopra la sidebar e cliccabile con
   sidebar aperta, stato corretto dopo uscita/rientro dalla pagina. Non
   simulare un successo, non dichiarare chiuso con solo unit/E2E.
3. **Streaming LFM2.5 reale.** Genera una risposta reale osservando l'intera
   fase live: nessun thinking nella risposta pubblica, nessun `<think>`/
   `</think>`, nessun marker `tool_call`, ragionamento nel canale previsto,
   risposta finale pulita, ancora pulita dopo reload.

L'owner vuole UNA sola verifica Pad atomica dopo aver sistemato tutto — non
installare un'APK dopo ogni micro-modifica. Ogni nuova APK installata va
copiata anche in `C:\Users\Antonino\Downloads`.

## Confini — cosa NON è tuo in questo giro

- Non toccare TALOS-BANCO.
- Non allargare lo scope oltre DEBT-MOBILE-014/015.
- Non aggiungere dipendenze, parser, store o poller nuovi.
- Non modificare la soglia del bundle (`614000` byte) per far passare il
  gate — il rosso `npm run build` su quel tripwire è noto, preesistente,
  fuori dal perimetro di questi due debiti; lascialo così.
- Non toccare Harness Desktop / `AVM-harness-ui` / il bundle
  `mobile/public/harness-ui/` — è il mio filone, in corso in parallelo.
- Lo zip "Tool Forge TALOS" non è ancora arrivato ed è comunque fuori dal tuo
  perimetro qui: se ti arriva qualcosa a riguardo, non è questo compito.
- Non dichiarare chiuso un gate fisico non realmente esercitato.
- Non fare push senza un sì esplicito e fresco dell'owner.

## Commit — solo dopo i tre gate

1. `git status --short`.
2. Controlla che non sia entrato nulla di estraneo nel worktree.
3. Aggiungi solo percorsi espliciti, mai `git add -A`.
4. Rilancia i gate finali e `git diff --check`.
5. Aggiorna `LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md` e
   `CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md` con l'evidenza nuova dei
   tre gate.
6. Commit in italiano, senza `Co-Authored-By` né `Claude-Session`.
7. Non fare push senza autorizzazione esplicita e fresca.

Se non riesci a chiudere uno dei tre gate, fermati e dichiaralo apertamente
aperto — non sostituirlo con un test sintetico.

## Riassunto operativo

Il codice è pronto, verificato due volte (dalla sessione precedente e ora da
me) e i test automatici sono verdi. Il tuo lavoro è interamente fisico: tre
prove sul Pad reale, aggiornare i due documenti con l'evidenza, selezionare
solo gli screenshot finali, committare solo i file giusti. Nessun push.
