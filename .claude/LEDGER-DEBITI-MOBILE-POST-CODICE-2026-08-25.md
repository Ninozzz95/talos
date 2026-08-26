# Ledger tecnico — debiti mobile post-Codice — 2026-08-25

Owner: Antonino  
Sottosistema proprietario: TALOS UI mobile (`mobile/`)

## Regole di avanzamento

- I fix di codice vengono chiusi nell'ordine DEBT-MOBILE-001…012; il Pad non
  viene più usato come gate intermedio.
- Ogni debito: riproduzione, ricerca primaria, ledger emendato, RED, GREEN,
  regressioni, build, Pad reale e aggiornamento consegna.
- Ogni regressione scoperta riceve nome stabile e test automatico.
- Ogni APK installato sul Pad viene copiato anche in
  `C:\Users\Antonino\Downloads` con hash SHA-256 registrato.

## Gate build — riduzione chunk iniziale

Perimetro file esatto:

- `mobile/src/lib/talosFontScale.ts` — mantiene solo il contratto usato dal
  boot (`TALOS_FONT_SCALES`, default e funzioni runtime).
- `mobile/src/lib/talosFontScaleOptions.ts` — elenco visuale lazy delle opzioni
  dell'impostazione.
- `mobile/src/components/talos/settings/TalosMobileSettingsAppearancePanel.vue`
  — importa l'elenco soltanto nel pannello impostazioni.
- `mobile/tests/unit/lib/talosFontScale.test.ts` — importa l'elenco dal modulo
  lazy e mantiene il test di monotonicità.
- `mobile/upstream/desktop-ported-libs-manifest.json` — hash e riconciliazione
  della divergenza mobile-only del renderer HF.

RED: build a `614.051/614.000` byte. GREEN: l'elenco viene escluso dal chunk
iniziale senza cambiare il comportamento; build misurata a `613.869/614.000`,
CSS `215.338/220.000`, parità verde. Rollback: riunire l'elenco nel modulo
originale e ripristinare il budget precedente soltanto se il contratto lazy
viene rimosso.

## DEBT-MOBILE-010 — Immagine HTML nella model card Hugging Face

Evidenza: `C:\Users\Antonino\Downloads\aaa.jpg`.

### Perimetro file esatto

- `mobile/src/lib/models/modelCardMarkdown.ts`
- `mobile/src/lib/talosMessageMarkdown.ts`
- `mobile/src/components/chat/TalosMobileMessageContent.vue`
- `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue`
- `mobile/tests/unit/models/modelCardMarkdown.test.ts`

### Contratto, RED e GREEN

La scheda trasforma un `<img>` del CDN ufficiale in Markdown e abilita
esplicitamente le immagini solo per quel riuso del renderer. Il renderer
accetta esclusivamente URL HTTPS con host esatto
`cdn-uploads.huggingface.co`, conserva `html:false`, sanifica con DOMPurify e
aggiunge `img/src/alt/loading/decoding` alla allowlist soltanto quando l'opzione
è attiva. La Chat resta sul comportamento “immagine esterna omessa”.

RED: `DEBT-MOBILE-010 RED: renders a trusted Hugging Face model-card image`;
prima del fix l'HTML finale era vuoto. GREEN: test model card 14/14, inclusa
prova inversa su host non autorizzato.

### Gate e rollback

Nel gate Pad finale: immagine reale, dimensionamento responsive, scroll,
fallback URL rifiutato e scheda senza immagini. Rollback: rimuovere l'opzione
del renderer e ripristinare la rimozione delle immagini nel pre-processore.

## DEBT-MOBILE-011 — Blocchi `think` e tool call esposti durante lo streaming

### Perimetro file esatto

- `mobile/src/lib/chat/thinkStream.ts`
- `mobile/tests/unit/chat/thinkStream.test.ts`
- `.claude/DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`

La riproduzione ha confermato che il punto unico già usato dal percorso locale
è `talosCreateThinkSplitter`; non servono file Android, provider-specifici o
un filtro nel renderer.

### Contratto

I delimitatori `<think>`/`</think>` e `<tool_call_start>`/`<tool_call_end>`
possono arrivare in più chunk. Finché uno dei blocchi è aperto il contenuto va
tenuto nello stato interno e non nel testo pubblico; la chiusura va consumata;
il testo successivo va emesso normalmente. La risposta finale deve essere
identica a quella già corretta a stream completo. Input senza blocchi e marker
spezzati restano compatibili.

### RED, GREEN e regressioni

- RED nominato: `DEBT-MOBILE-011 RED: streaming think and tool markers stay
  hidden`; deve fallire sui percorsi riprodotti da `abc.jpg` e `tool.jpg`,
  inclusi marker divisi tra chunk.
- GREEN: estendere la sola macchina di stato nel parser condiviso ai marker
  LFM2.5 `<|tool_call_start|>`/`<|tool_call_end|>`, senza filtrare a posteriori
  il DOM e senza dipendere dal nome del modello.
- Regressioni: stream semplice, Markdown/table, think e tool call nello stesso
  chunk, marker spezzati, stream terminato dentro un blocco e risposta finale
  già persistita.

### Gate e rollback

Ricerca primaria su contratto di streaming e parser Markdown prima dell'edit;
vitest focalizzato, typecheck e suite completa dopo tutti i debiti. Il gate
umano finale userà il modello dell'evidenza e un modello senza think. Rollback:
ripristinare il parser precedente e il solo test RED/GREEN, senza cambiare il
contratto provider.

## DEBT-MOBILE-012 — Persistenza immagine OpenRouter/Gemini

### Perimetro chiuso dal tracing locale

Il risultato reale attraversa `mobile/src/lib/images/imageGateway.ts` e poi il
callback `sources.save` in `mobile/src/stores/chatController.ts`; il wrapper
`mobile/src/lib/images/imageTools.ts` traduce ogni throw del salvataggio in
`TALOS_IMAGE_PERSIST_FAILED`. Il fix tocca solo il parser/picker condiviso e il
test del gateway; nessun file Android o provider generico entra nel perimetro.

File esatti modificati:

- `mobile/src/lib/images/imageGateway.ts` — `walk`, nuovo
  `normalizeBase64Bytes`, `pickTalosImageModel`.
- `mobile/tests/unit/images/imageGateway.test.ts` — due test DEBT-MOBILE-012
  (base64 con line-break e modello testuale Gemini 3.7).
- `mobile/tests/unit/chat/chatController.test.ts` — il percorso OpenRouter
  completo usa un `b64_json` spezzato e verifica che la `data:` URL consegnata
  al decoder sia compatta, poi persistenza, rendering e reload.
- questo ledger, dossier e consegna.

### Contratto, RED e GREEN

Il contratto ufficiale Image API è base64 grezzo in `data[].b64_json` (PNG può
omettere `media_type`); il server tool è un contratto diverso e restituisce
un URL al modello. RED nominati:

- `DEBT-MOBILE-012 RED: normalizes wrapped OpenRouter base64 before
  persistence` — falliva lasciando il line-break nella `data:` URL.
- `DEBT-MOBILE-012 RED: never treats the selected Gemini 3.7 text model as an
  image model` — falliva scegliendo un candidato OpenRouter non tipizzato.

Il test di integrazione esistente `IMAGE-OR-05 IMAGE-DUR-01/02/03
DEBT-MOBILE-012` esercita anche il percorso completo controller → Image API →
decoder → vault → messaggio → reload, con il base64 spezzato.

GREEN: il parser compone una stringa base64 compatta prima del decoder e il
picker OpenRouter richiede la capacità `image`; `6 file, 60 test` nella suite
immagini e `4 file, 54 test` nel focus corrente. La verifica Pad deve ancora
provare bytes reali, repository cifrato, reload e rendering; non viene simulata
da un mock.

### Gate e rollback

Ricerca primaria completata prima dell'edit su Image Generation, server tool,
Models API e List image models. Focalizzati RED → GREEN completati; restano
typecheck, suite completa e una sola verifica Pad finale con il modello chat
Gemini 3.7 (che deve delegare al modello immagine scoperto) e un provider
immagine alternativo. Rollback: rimuovere `normalizeBase64Bytes`, ripristinare
il filtro precedente e i due test nominati, senza alterare il contratto dei
tool non immagine.

### Aggiornamento gate reale — 2026-08-26

L'evidenza allegata dell'owner conferma `TALOS_IMAGE_PERSIST_FAILED` sul
percorso OpenRouter/Gemini. I gate locali restano verdi (115 test focalizzati;
suite completa 6.351 passati, 10 saltati, 0 falliti). La prova Pad con una
generazione reale è ancora **BLOCCATA per autorizzazione/costo**: non è
presente `TALOS_TEST_OPENROUTER_API_KEY` e la chiave applicativa non viene
usata implicitamente per chiamate che possono consumare credito.

### Emendamento dopo prova reale — persistenza binaria oltre il limite bridge

La prova autorizzata sul Pad ha riprodotto il fallimento: il provider ha
risposto, ma `saveGeneratedBinary` è terminato in `TALOS_IMAGE_PERSIST_FAILED`.
La causa più probabile e misurabile al confine successivo è il passaggio di un
base64 intero a `Filesystem.writeFile`: su Android il payload attraversa il
bridge in una singola transazione. Il contratto Capacitor dichiara inoltre che
`Blob` è supportato solo sul Web; perciò non si può sostituire la stringa con un
Blob come scorciatoia nativa ([Filesystem API](https://capacitorjs.com/docs/apis/filesystem)).

Fix autorizzato da preparare: in `mobile/src/services/attachmentFileStore.ts`
scrivere il base64 in blocchi con `writeFile` per il primo blocco e
`appendFile` per i successivi, mantenendo lo stesso percorso privato e la
verifica byte-per-byte. Aggiungere il contratto `appendFile` a
`TalosFilesystemPort` e il test permanente in
`mobile/tests/unit/services/attachmentFileStore.test.ts` per un payload sopra
la dimensione del blocco. Nessun nuovo plugin o endpoint.

RED: il test deve fallire con il writer monolitico quando il mock rifiuta un
blocco oltre il limite; GREEN: la stessa immagine viene scritta a blocchi,
letta identica e resa disponibile al Vault. Gate Pad: una sola nuova
generazione reale dopo la build, quindi reload e Libreria.

### GREEN finale dopo prova reale — 2026-08-26

File e simboli chiusi:

- `mobile/src/services/attachmentFileStore.ts` — `TalosFilesystemPort.appendFile`,
  `BASE64_WRITE_CHUNK`, scrittura iniziale e append a blocchi.
- `mobile/src/stores/chatController.ts` — `sources.save`, fallback locale quando
  la data URL viene rifiutata da WebView.
- `mobile/src/lib/images/imageMultipart.ts` — `base64ToBytes` riusato dal
  percorso immagini (nessun nuovo endpoint).
- `mobile/tests/unit/services/attachmentFileStore.test.ts` — scenario permanente
  `DEBT-MOBILE-012` per file binario oltre 256 KiB base64.
- `mobile/tests/unit/chat/chatController.test.ts` — il test OpenRouter forza il
  rifiuto della data URL e verifica bytes, persistenza, rendering e reload.

RED reale: sul Pad `2ea6573c`, APK precedente, OpenRouter ha restituito
`TALOS_IMAGE_PERSIST_FAILED` dopo la risposta positiva del provider. GREEN
reale: con APK `403964f0ac74`, la generazione autorizzata del triangolo è stata
salvata e mostrata; dopo force-stop/reload l'immagine è rimasta visibile; la
Libreria l'ha elencata come file generato JPG.

Gate locali: focus `88/88`, suite completa `6.352 passati, 10 saltati, 0
falliti`, typecheck verde. Gradle debug/release verde. Il solo warning è il
budget JS iniziale misurato a 614.068 contro soglia preesistente 614.000; la
build Vite e il copy Capacitor sono riusciti.

Rollback: ripristinare la scrittura monolitica e rimuovere il fallback solo se
il bridge nativo viene sostituito da un contratto binario ufficiale; mantenere
il test RED per impedire la regressione.

## DEBT-MOBILE-007 — Pinch-to-zoom illimitato nella Chat

### Perimetro file esatto

- `mobile/src/screens/ChatScreen.vue`
- `mobile/tests/unit/screens/chatScreen.test.ts`
- dossier e consegna di questa campagna

### Ricerca, RED e GREEN

La ricerca primaria MDN/W3C sul contratto `touch-action` stabilisce che
`pan-y` consente lo scroll verticale a un dito e non abilita il pinch-zoom
sulla regione. Il RED nominato è `DEBT-MOBILE-007 RED: chat thread allows
vertical scroll but not viewport pinch zoom`; falliva perché il thread non
aveva `touch-pan-y`. GREEN: aggiunta della sola utility esistente
`touch-pan-y` al contenitore `data-testid="talos-chat-scroll"`; nessun meta
viewport globale e nessun nuovo listener.

### Gate e rollback

Focalizzato verde: `tests/unit/screens/chatScreen.test.ts` (42/42). La prova
Pad finale dovrà confermare scroll verticale, pinch ignorato e accesso al
composer in tutte le quattro forme; rollback = rimuovere la utility e il test.

## DEBT-MOBILE-001 — Safe area del viewer Markdown

### Perimetro file esatto

Creare:

- `.claude/DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`

Modificare:

- `.claude/DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `mobile/src/components/talos/library/TalosMobileMarkdownViewer.vue`
- `mobile/tests/unit/components/TalosMobileMarkdownViewer.test.ts`

Eliminare: nessun file.

### Simboli e contratti

- `TalosMobileMarkdownViewer`: restano stabili le prop pubbliche `fileId`,
  `nome` e l'evento `chiudi`.
- Nessuna nuova funzione, classe, interfaccia, schema, migrazione o dipendenza.
- Modifica prevista: la testata dell'overlay applica
  `pt-[max(0.75rem,env(safe-area-inset-top))]`, mantenendo invariati sfondo,
  contenuto e safe area inferiore.

### RED

- Test: `DEBT-MOBILE-001 tiene nome e chiusura sotto la status bar` in
  `mobile/tests/unit/components/TalosMobileMarkdownViewer.test.ts`.
- Fallimento atteso: la testata non contiene la classe canonica
  `pt-[max(0.75rem,env(safe-area-inset-top))]`.
- Comando:
  `cd mobile && npx vitest run tests/unit/components/TalosMobileMarkdownViewer.test.ts`.

### GREEN e regressioni

- GREEN focalizzato: stesso comando RED.
- Percorso scheda generata:
  `npx vitest run tests/unit/components/TalosMobileSchedaAzione.test.ts`.
- Percorso Libreria/media:
  `npx vitest run tests/unit/chat/chatMediaPanel.test.ts`.
- Regressione di sottosistema: `npm run typecheck`, `npx vitest run`,
  `npm run build`, `git diff --check`.

### Gate reale e prova umana

- Build debug Android e installazione su Pad `2ea6573c`.
- Confronto dei due ingressi reali: scheda Markdown appena generata e Libreria.
- Screenshot da ispezionare per intero in tablet portrait/landscape e forma
  telefono portrait/landscape; nome e X devono restare fuori dalle system bar.
  Tablet landscape e telefono landscape sono stati verificati sul Pad
  fisicamente landscape; le due forme portrait richiedono rotazione fisica del
  Pad e non si chiudono con un semplice scambio `wm size`.
- Prova inversa: chiusura, scroll lungo e riapertura dalla Libreria non devono
  cambiare comportamento.

### Rollback

- Revert del commit dedicato DEBT-MOBILE-001. La modifica comportamentale è
  confinata a una classe della testata del viewer e al relativo test.

## DEBT-MOBILE-003 — Strutture Markdown senza caret prompt

### Perimetro file esatto

Modificare:

- `mobile/src/components/chat/TalosMobileStreamingReply.vue`
- `mobile/tests/unit/chat/streamingUi.test.ts`
- `.claude/DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`

Eliminare: nessun file. Dipendenze nuove: nessuna.

### Simboli e contratti

- `tailTarget`, `ensureTail`, `appendChars` e `syncTail` restano privati al
  componente; il contratto è che un tail strutturale non crea
  `[data-testid="talos-stream-caret"]` e usa la classe fade.
- `TalosMobileMessageContent` e `stabilizeStreamingTalosMarkdown` restano
  invariati: il parser e il renderer esistenti continuano a possedere il
  markup strutturale.

### RED/GREEN e regressioni

- RED: `DEBT-MOBILE-003 RED: a streaming table never gets the prompt caret` in
  `mobile/tests/unit/chat/streamingUi.test.ts`; prima del fix falliva perché
  il caret veniva aggiunto dopo la tabella.
- GREEN: `rtk npm exec vitest run tests/unit/chat/streamingUi.test.ts`, 18/18.
- Suite interessate: intera `npx vitest run`, `npm run typecheck`, `npm run
  build`, `git diff --check` dopo la chiusura del lotto.

### Gate umano e rollback

Nel gate Pad finale: streaming di testo, tabella completa/incompleta e
riduzione movimento; screenshot interi prima/durante/dopo, senza caret nella
struttura e senza salti di layout. Rollback: revert delle sole modifiche ai
due file di prodotto/test, senza cambiare il parser.

## DEBT-MOBILE-008 — Chiusura gestuale della sidebar globale

### Perimetro file esatto

- `mobile/src/components/shell/TalosMobileSidebar.vue`
- `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
- dossier e consegna di questa campagna

### Ricerca, RED e GREEN

La ricerca primaria sul comportamento Vaul conferma che una drawer con
`direction="left"` riceve il gesto sulla propria superficie e si chiude con
uno spostamento da destra verso sinistra. Il RED è
`DEBT-MOBILE-008 RED: the sidebar drawer is dismissible by dragging its
component right-to-left`: falliva perché durante `busy` il componente passava
`dismissible=false`, mentre il pulsante X continuava a chiudere.
GREEN: la sidebar resta esplicitamente dismissible; la direzione sinistra già
presente nel componente governa il drag nativo e non introduce un secondo
listener o una gesture duplicata.

### Contratto e gate

Il gesto valido deve iniziare sulla componente sidebar visibile, non sul
contenuto sotto l'overlay. X e drag devono emettere la stessa chiusura anche
durante una risposta in corso; il gate Pad finale proverà entrambi, scroll
verticale interno e gesto Back. Focalizzato verde: test sidebar 12/12.
Rollback: ripristinare il solo binding `dismissible` precedente e il test.

## DEBT-MOBILE-009 — Stato OAuth OpenRouter contraddittorio

### Perimetro file esatto

- `mobile/src/components/talos/models/TalosMobileProviderRuntimePanel.vue`
- `mobile/tests/unit/models/TalosMobileProviderRuntimePanel.test.ts`
- dossier e consegna di questa campagna

### Ricerca, RED e GREEN

Il flusso resta OAuth PKCE e la chiave continua a essere salvata nel percorso
provider esistente; non viene aggiunto un token o un endpoint nuovo. Il RED
`DEBT-MOBILE-009 RED: a stale OAuth error is not shown once OpenRouter has a
saved key` riproduceva l'avviso di scambio fallito con chiave OpenRouter già
presente e catalogo pronto. GREEN: l'avviso OAuth transitorio viene mostrato
solo quando `controller.secrets.openrouter` è falso; gli errori correnti del
catalogo restano visibili nel loro punto specifico.

### Gate e rollback

Focalizzato verde: test provider runtime 6/6. Il gate Pad finale verificherà
fallimento OAuth, chiave appena aggiunta, reload, catalogo pronto e retry. Il
rollback rimuove la guardia di visibilità e il test nominato, senza toccare il
protocollo PKCE.

## DEBT-MOBILE-004 — Default «Molto piccola» alla prima installazione

### Perimetro file esatto

Modificare:

- `mobile/src/lib/talosFontScale.ts`
- `mobile/src/i18n/locales/it.ts`
- `mobile/src/i18n/locales/en.ts`
- `mobile/tests/unit/stores/predefinitiInstallazioneNuova.test.ts`
- `mobile/tests/unit/lib/talosFontScale.test.ts`
- `.claude/DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`

Eliminare: nessun file. Dipendenze nuove: nessuna.

### Simboli e contratti

- `TALOS_FONT_SCALES` aggiunge `xsmall`; `TALOS_DEFAULT_FONT_SCALE` diventa
  `xsmall`; `talosFontScaleFactor` assegna `0.8`.
- `parseTalosFontScale` continua a fail-closed; le scelte persistite
  `small/default/large/xlarge` restano valide.
- Le chiavi i18n `appearance.fontScales.xsmall` restano parallele in italiano
  e inglese.

### RED/GREEN e regressioni

- RED: i test di nuova installazione pretendevano `xsmall` e fallivano con
  `default`; il test dei fattori pretendeva un valore sotto `small`.
- GREEN: i due file focalizzati sono 13/13 verdi.
- Gate largo: `npx vitest run`, `npm run typecheck`, `npm run build`,
  `git diff --check` a fine lotto.

### Gate umano e rollback

Nel gate Pad finale: installazione pulita, schermata Impostazioni → Aspetto,
label «Molto piccola», primo frame e passaggio a ogni gradino; poi reload con
una scelta esplicita diversa. Rollback: ripristinare la lista e la costante
precedenti, senza rimuovere le preferenze già salvate.

## DEBT-MOBILE-005 — «Autorizza tutti · Sempre» e switch Strumenti agente

### Perimetro file esatto

Modificare:

- `mobile/src/components/intro/TalosMobileSetupIntro.vue`
- `mobile/tests/unit/components/TalosMobileSetupIntro.test.ts`
- `.claude/DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`

Eliminare: nessun file. Dipendenze nuove: nessuna.

### Simboli e contratti

- `TalosMobileSetupIntro::next` mantiene il gate `tutteSempre` e, solo in quel
  ramo, chiama `settings.setAgentToolEnabled` per
  `library_context_policy_update` e `device_screen_drive`.
- Il pannello Strumenti agente, `TALOS_DEFAULT_AGENT_TOOL_ENABLED` e il
  catalogo restano invariati; `app_azione` non è un alias del controllo richiesto.

### RED/GREEN e regressioni

- RED: il test del percorso «Sempre» osservava la Libreria accesa ma nessun
  aggiornamento dei due switch agente.
- GREEN: `rtk npm exec vitest run tests/unit/components/TalosMobileSetupIntro.test.ts` — 26/26.
- Prove inverse «Chiedi», «Nega» e passaggio senza tocco restano verdi.
- Gate largo: suite mobile, typecheck, build e `git diff --check` a fine lotto.

### Gate umano e rollback

Nel gate Pad finale: intro nuova, «Autorizza tutti» + «Sempre», apertura di
Impostazioni → Strumenti agente e verifica visiva dei due switch; poi prova
«Chiedi»/«Nega» su stato pulito. Rollback: rimuovere le due chiamate del ramo
`tutteSempre`, senza alterare i tre permessi principali.

## DEBT-MOBILE-006 — Tastiera nascosta, focus e composer compatto

### Perimetro verificato

Nessun file di prodotto da modificare in questa fase: il comportamento è già
centralizzato in:

- `mobile/src/services/nativeFraming.ts`
- `mobile/src/components/chat/TalosMobileComposer.vue`
- `mobile/tests/unit/services/nativeFraming.test.ts`
- `mobile/tests/unit/chat/TalosMobileComposer.drawer.test.ts`

La consegna e il dossier sono aggiornati; nessun file viene creato o eliminato.

### Contratto, GREEN e gate

- `configureNativeFraming` ascolta `keyboardDidHide` e rilascia il focus di
  input/textarea; `composerFocused` riceve il blur e `composerCompact` torna
  vero solo quando il campo è vuoto e la modalità lo prevede.
- GREEN: i due file focalizzati sono 36/36 verdi.
- Gate Pad finale: back/gesture, testo vuoto e non vuoto, riapertura tastiera,
  screenshot interi e prova inversa senza perdita della bozza.
- Rollback: nessuno; se il gate reale smentisce il contratto, si apre un
  emendamento sul listener globale, senza duplicarlo nel composer.

## DEBT-MOBILE-002…009

Perimetri da compilare uno alla volta dopo l'ispezione locale e la ricerca
primaria specifica. I requisiti owner restano nel registro
`.claude/DEBITI-MOBILE-POST-CODICE-2026-08-25.md`.

## DEBT-MOBILE-002 — Verifica GPU senza stato/esito

### Perimetro file esatto

Modificare:

- `mobile/src/stores/chatController.ts`
- `mobile/src/components/talos/settings/TalosMobileSettingsPrivacyPanel.vue`
- `mobile/src/i18n/locales/it.ts`
- `mobile/src/i18n/locales/en.ts`
- `mobile/src/lib/localEngineProbeRun.ts`
- `mobile/tests/unit/chat/chatController.test.ts`

Nessun file nativo, schema, migrazione o dipendenza nuova: il ponte reale
`TalosLlamaPlugin.qualifyBackend` resta invariato.

Emendamento dopo il primo GREEN: la build ha rifiutato il bundle iniziale
`614.684 / 614.000` byte. L'orchestrazione del toast non resta quindi inline in
`chatController.ts`: viene collocata nel già esistente e già lazy
`localEngineProbeRun.ts`. Motivo: mantenere invariato il budget iniziale senza
alzare la soglia e senza introdurre un modulo o una dipendenza nuova.

### Contratti e simboli

- `decideLocalEngineProbeConsent`: mantiene chiusura immediata della modale e
  avvio in background, ma pubblica un toast globale persistente `running`;
  alla conclusione lo sostituisce con l'esito reale, oppure con un errore
  leggibile. Il sondaggio non viene duplicato e non parte due volte.
- `runLocalEngineProbeFromSettings`: conserva il bottone disabilitato durante
  la corsa e aggiunge il ramo di errore visibile; `finally` continua a liberare
  il busy flag.
- `talosRunLocalEngineProbeWithNotice`: nuova funzione lazy nel modulo già
  proprietario della corsa; invoca una sola qualificazione e chiude sempre il
  toast di running in `finally`.
- Chiavi i18n nuove: `privacyPermissions.localEngineProbe.error` in italiano e
  inglese. Nessun testo hard-coded nella UI.

### RED

- Aggiornare `mobile/tests/unit/chat/chatController.test.ts` con una Promise
  differita: dopo «Sì, verifica ora» il toast deve dire `running`; dopo
  `resolve` deve sparire il running ed esporre l'esito. Un secondo scenario
  rifiuta il ponte e pretende un toast d'errore senza unhandled rejection.
- Fallimento atteso prima della modifica: nessun toast di running/esito e
  nessuna cattura del rifiuto.
- Comando RED: `cd mobile && npx vitest run tests/unit/chat/chatController.test.ts`.

### GREEN e regressioni

- GREEN: stesso test focalizzato.
- Regresso locale/privacy: `npx vitest run tests/unit/lib/localEngineProbeRun.test.ts`
  e la suite completa `npx vitest run`.
- Gate statico: `npm run typecheck`, `npm run build`, `git diff --check`.

### Gate Pad e prova umana

- Build/install debug sul Pad `2ea6573c`; copiare sempre l'APK in
  `C:\Users\Antonino\Downloads` con SHA-256.
- Prima scelta di un modello locale: il foglio si chiude, sopra il composer
  compare «In corso…», poi compare l'esito o l'errore; cambiare schermata non
  deve trasformare una corsa in silenzio.
- Impostazioni → Privacy e autorizzazioni: durante il comando il bottone resta
  disabilitato e leggibile; successo, temperatura e ponte rifiutato hanno tutti
  una frase distinta. Screenshot intero della scheda prima/durante/dopo.

### Rollback

Revert del commit DEBT-MOBILE-002: rimuove solo stato/toast/error handling UI,
senza toccare la qualificazione nativa già esistente.
## Emendamento DEBT-MOBILE-002 — stato effettivo dopo il gate statico

La lista effettiva dei file di prodotto modificati è:

- `mobile/src/stores/chatController.ts`
- `mobile/src/services/localEngine.ts`
- `mobile/src/components/talos/settings/TalosMobileSettingsPrivacyPanel.vue`
- `mobile/tests/unit/chat/chatController.test.ts`

`mobile/src/i18n/locales/it.ts` e `mobile/src/i18n/locales/en.ts` non risultano
modificati nel diff finale: il messaggio d'errore riusa `rejectGeneric`.

Il tentativo inline è stato respinto dal gate iniziale (`614.684` byte); la
versione finale riusa `talosLocalEngineLazy()` e il modulo motore già lazy,
mantenendo il budget a `<= 614.000` senza modificare la soglia.

## Chiusura di fase DEBT-MOBILE-008 — sidebar dal body

- File modificati: `mobile/src/components/shell/TalosMobileSidebar.vue`,
  `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`.
- Causa misurata: `pointercancel` interrompe il percorso pointer quando il
  body prende lo scroll; il successivo `touchmove` non aveva più l'origine.
- Fix minimo: `onSidebarPointerCancel` non azzera il punto condiviso; il
  `touchend` lo chiude normalmente. `Drawer` resta `dismissible=false` per non
  far competere Vaul con il gesto esplicito.
- RED/GREEN: la sequenza pointerdown → touchstart → pointercancel → touchmove
  falliva prima e passa dopo; suite sidebar 15/15.
- Gate: typecheck verde; suite completa 674 file passati, 3 saltati, 6.349
  test passati, 10 saltati; build Vite e parità verdi; Gradle
  `assembleDebug` + `compileReleaseJavaWithJavac` `BUILD SUCCESSFUL`.
- Prova umana: Pad `2ea6573c`, applicationId `ai.talos`; apertura dalla
  testata e chiusura con swipe iniziato nel body verificata negli screenshot
  `sidebar-open-final-apk.png` e `sidebar-body-swipe-final-apk.png`.
- APK riproducibile e copiata nei Download del PC:
  `C:\Users\Antonino\Downloads\talos-mobile-debt-audit-20260826-132724-e2322111fa4d.apk`
  (SHA-256 `e2322111fa4d35fcc04fbc9d5f574c78666cca4fbf08e9df08b3e68b00f8f2eb`).

## Regressione DEBT-MOBILE-008B — il pannello deve seguire il dito

### File e simboli

- Modificare `mobile/src/components/shell/TalosMobileSidebar.vue`:
  `startSidebarSwipe`, `maybeCloseSidebarSwipe`, `finishSidebarSwipe` e lo
  stato del trascinamento. Nessuna nuova dipendenza o componente.
- Modificare `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`: scenario
  permanente `DEBT-MOBILE-008B` sulla trasformazione intermedia e sul ritorno
  in sede sotto soglia.

### Ricerca upstream e decisione

- Pin reale installato: `vaul-vue@0.4.1`.
- Upstream ufficiale `unovue/vaul-vue`: progetto non più mantenuto e sostituito
  per i nuovi lavori dal Drawer di Reka UI. Il port corrente usa solo pointer
  events; Android WebView cancella quel flusso sul body scrollabile.
- Decisione: **adattare dietro il componente AVM esistente**, senza migrare ora
  tutta la libreria e senza aggiungere pacchetti. Durante `touchmove` il pannello
  usa `translate3d` con distanza clampata; al rilascio chiude oltre soglia o
  torna a zero usando `--talos-motion-duration-control` e
  `--talos-motion-ease`. Riduzione movimento: posizione sotto il dito invariata,
  ritorno finale senza durata.

### RED, GREEN e prova umana

- RED: a metà gesto il drawer deve avere una trasformazione negativa coerente
  con la distanza percorsa ma non deve ancora emettere la chiusura; sotto soglia
  `touchend` deve rimetterlo a zero.
- GREEN focalizzato: `npx vitest run tests/unit/shell/TalosMobileSidebar.test.ts`.
- Regressioni: `npm run typecheck`, suite completa, build Vite/parità e Gradle
  debug/release.
- Pad: trascinamento lento dal body e dalla testata, con screenshot a metà
  gesto e dopo il rilascio; il bordo del pannello deve coincidere con il dito,
  non partire da solo.
- Rollback: rimuovere solo l'applicazione/reset della trasformazione manuale;
  la chiusura con X e la navigazione restano indipendenti.

### GREEN finale DEBT-MOBILE-008B — 2026-08-26

- Implementazione verificata in `TalosMobileSidebar.vue`: trasformazione
  diretta durante il gesto, soglia valutata al rilascio, ritorno animato sotto
  soglia.
- Test: `TalosMobileSidebar.test.ts` verde; suite completa **6.351 passati,
  10 saltati, 0 falliti**.
- Pad `2ea6573c`, APK `d9cd32dbf381...`: `sidebar-drag-mid-200-latest.png`
  mostra lo spostamento di 200 px prima del rilascio e
  `sidebar-drag-after-latest.png` mostra la chiusura.

## Chiusura DEBT-MOBILE-010 — immagini multilinea nelle model card

- Causa: il README Hugging Face reale usa un tag `<img>` su più righe; la
  normalizzazione per riga lo lasciava escapato.
- Fix minimo: `modelCardMarkdown.ts` ricompone il tag multilinea e riusa il
  renderer immagine già allow-listato (`https` + `cdn-uploads.huggingface.co`).
- Test aggiunti: tag singolo, tag multilinea e host esterno rifiutato; test
  del componente `TalosMobileLocalRepoDetail` verifica l'`img` risultante.
- Prova Pad: `model-card-img-fixed.png` mostra il logo Liquid reale nella
  scheda modello.
- Rollback: rimuovere il raccoglitore multilinea e i test DEBT-MOBILE-010;
  lasciare invariato il renderer sanitizzato.

## DEBT-MOBILE-013 — effort selector slider nel drawer del composer

### Perimetro esatto

Artefatto owner: `C:\Users\Antonino\Downloads\talos-effort-slider-dropin.zip`
(SHA-256 `35C7C508E0349EEC46A64BDC91FA73FA4AD8221559906D82AAB029A6914184B4`).
Il pacchetto è ancorato al commit upstream `e7760d8fac95b84c0bda0e710be8df6d0d9ba74d`.

File da sostituire/creare nel lane mobile:

- sostituire `mobile/src/components/chat/TalosMobileEffortPicker.vue` con il
  drop-in `DROP_IN/src/components/chat/TalosMobileEffortPicker.vue`;
- creare `mobile/src/components/talos/ui/TalosThemedSegmentedSlider.vue` dal
  drop-in omonimo;
- sostituire `mobile/tests/unit/chat/TalosMobileEffortPicker.test.ts`;
- creare `mobile/tests/unit/ui/TalosThemedSegmentedSlider.test.ts`;
- aggiornare questo ledger e la consegna, senza modificare
  `mobile/src/lib/mobileEffort.ts`, traduzioni, package manifest o stato del
  composer. A seguito della richiesta owner 2026-08-26, il parent è stato
  toccato solo per rimuovere l'intestazione ridondante "Ragionamento" sopra
  "Livello di ragionamento".

### Contratto e simboli stabili

`TalosMobileEffortPicker` conserva props `effortLevels`, `selectedEffort`,
`supportsThinking`, `thinking` ed eventi `selectEffort`, `selectThinking`,
`requestClose`. `TalosThemedSegmentedSlider` aggiunge il wrapper controllato
con `modelValue`, `options`, `ariaLabel`, `testId`, `disabled` ed evento
`update:modelValue`. `mobileEffortLadderFromLevels()` resta l'autorità per
ordine e capacità del modello; il parent resta l'unico proprietario dello
stato.

### Ricerca upstream e decisione

Ricerca primaria completata prima dell'edit: Reka UI Slider 2.10.1 già
presente nel repo ([docs](https://reka-ui.com/docs/components/slider),
[API SliderRoot](https://reka-ui.com/meta/SliderRoot)) e pattern slider
WAI-ARIA ([APG](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)).
Decisione: adottare direttamente il primitivo Reka già pinned dietro un wrapper
TALOS a token, senza nuova dipendenza e senza pointer engine custom. Il
drop-in è la fonte di verità visuale e strutturale; preview e script del pacchetto
sono strumenti di validazione, non asset runtime.

### RED/GREEN e gate

RED nominato: `DEBT-MOBILE-013 RED: effort picker is a single controlled slider`
(la versione attuale espone `role=radiogroup` e più bottoni). GREEN deve
verificare ladder canonica dinamica, una sola thumb/tab stop, `aria-valuetext`,
click/drag, Arrow/Home/End, controlled state, switch thinking invariato,
Escape, deduplica e scala a sette livelli.

Comandi: `cd mobile && npx vitest run tests/unit/chat/TalosMobileEffortPicker.test.ts tests/unit/ui/TalosThemedSegmentedSlider.test.ts`,
`npm run typecheck`, suite `npx vitest run`, `npm run build`, Gradle
`:app:assembleDebug :app:compileReleaseJavaWithJavac`, quindi installazione
debug sul Pad `2ea6573c` e screenshot interi in tablet/telefono portrait e
landscape. Verificare anche ridotta animazione, forced-colors, focus e ritorno
del drawer.

### Rollback

Ripristinare i quattro file alla versione precedente; nessun rollback del
contratto effort o delle traduzioni; se necessario ripristinare anche la sola
rimozione dell'h3 in `TalosMobileModelEffortDrawer.vue`.

### Aggiornamento owner — posizione toggle e verifica 2026-08-26

Il toggle `TalosMobileSwitch` per `chat.extendedThinking` è stato posizionato
nella testata del valore selezionato (accanto a "Basso/Medio/Alto" cangiante),
non nella rail e non sotto il controllo. La rail resta il drop-in originale.
È stata rimossa la sola intestazione parent ridondante `chat.reasoning`.

Prove: typecheck verde; test focalizzati **14/14**; build Vite e Gradle
`assembleDebug` verdi. Sul Pad `2ea6573c`, con screenshot ispezionato per
intero, il valore selezionato e il toggle condividono la stessa riga senza
sovrapposizioni in viewport telefono portrait; la rail mantiene quattro stop
distinti. Screenshot:
`C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\effort-slider-phone-portrait-header-toggle.png`.

Nota gate storica (superata dall'aggiornamento finale sotto): il primo run
completo aveva segnalato `talosFontScale`; dopo la tokenizzazione del font il
test focalizzato è verde. `npm run build` resta bloccato dal tripwire
esistente 614.278 > 614.000; `vite build` e APK sono riusciti.

### Chiusura tecnica DEBT-MOBILE-013 — evidenza finale 2026-08-26

La richiesta owner sul label è ora applicata: `chat.extendedThinking` viene
renderizzato accanto allo switch nella stessa testata del valore selezionato,
non nella rail. Il titolo parent `chat.reasoning` resta rimosso; rimane una
sola intestazione, `chat.reasoningEffort`.

RED/GREEN aggiornato: suite focalizzata picker, slider, composer e font-scale
**36/36**; `npm run typecheck` verde. Suite completa: **6.358 passati,
1 fallito, 10 saltati**; l'unico rosso attuale è il test già esistente
`tests/unit/chat/streamingUi.test.ts` (`DEBT-MOBILE-003 RED`), fuori dal
perimetro del selettore e non toccato da questa modifica.

Prove packaging: `vite build` e `npx cap copy android` verdi; il comando
`npm run build` esegue il build ma si ferma sul tripwire globale esistente
`614278 > 614000`, senza modifica della soglia. Gradle
`:app:assembleDebug :app:compileReleaseJavaWithJavac --rerun-tasks` verde.

Prova Pad `2ea6573c` (override telefono portrait `2400x1080`): il drawer
mostra per intero la riga `DISATTIVATO — Ragionamento esteso — switch`, la
rail e i quattro livelli, senza sovrapposizioni. Screenshot ispezionato per
intero:
`C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\effort-slider-phone-portrait-final-label-visible.png`.
Override `wm size` e `wm density` ripristinati ai valori fisici dopo la prova.

APK finale installata sul Pad e copiata nei Download del PC:
`C:\Users\Antonino\Downloads\talos-mobile-effort-slider-20260826-162452-8001a3c7f224.apk`.
SHA-256 `8001a3c7f2241cc057fcd934f24b383b23e1dbc85ced55af1fe1a78bf4623bde`.

## DEBT-MOBILE-014 — continuità download nel Model Lab tablet

### Causa misurata

- `App.vue` passa `hideAppActions=true` a `TalosMobileToolSheet` su ogni
  tablet. Nelle stazioni Impostazioni, però, `tabletChatRailVisible=false`:
  quindi né la testata del foglio né la rail tablet montano il centro download.
- `TalosMobileLocalRepoDetail.vue` mostra sempre il bottone statico
  `talos-models-download`, anche quando `talosModelTransfers.items` contiene
  già il trasferimento della variante selezionata.
- Il popover del centro download usa `z-[100]`, mentre la sidebar globale usa
  `--talos-z-global-navigation: 110`: il portale esce dal DOM locale ma non
  annulla questo ordine esplicito. Inoltre Vaul in modalità modal applica
  `pointer-events: none` al resto del body: anche un livello più alto non è
  cliccabile finché la sidebar resta aperta.

### Perimetro esatto e simboli

- Modificare `mobile/src/App.vue`: la prop `hide-app-actions` deve nascondere
  le azioni solo quando la rail tablet che le possiede è davvero visibile.
- Modificare `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue`:
  aggiungere le sole proiezioni computate della variante selezionata su
  `talosLocalModels.transfer.items`; il bottone si trasforma nello stesso posto
  in `role=progressbar`, senza nuovo poller e senza stato duplicato.
- Modificare `mobile/src/style.css` e
  `mobile/src/components/shell/TalosMobileDownloadCenterTrigger.vue`: definire
  e usare un token di overlay sopra la navigazione globale.
- Modificare `mobile/src/components/shell/TalosMobileSidebar.vue`: mantenere
  l'overlay e il drawer sopra il contenuto, ma disattivare solo la modalità
  modal Vaul, che impedisce al popover portaled di ricevere puntatori.
- Test RED: `mobile/tests/unit/models/TalosMobileLocalRepoDetail.test.ts`,
  `mobile/tests/unit/shell/TalosMobileDownloadCenterTrigger.test.ts` e
  `mobile/tests/unit/shell/TalosMobileToolSheet.test.ts`; estendere
  `mobile/tests/e2e/mobile-model-download-center.e2e.spec.ts` per il percorso
  Model Lab dettaglio → avvio → barra live → centro download.

### Contratto e gate

- Il match del trasferimento usa `repo`, `revision` e `paths`, non il nome
  visuale. `haveBytes/totalBytes` alimentano `aria-valuenow`; senza totale il
  progresso resta indeterminato e non inventa una percentuale.
- RED: in tablet Impostazioni le azioni app restano presenti; un item reale
  della variante elimina il bottone e mostra avanzamento; il popover dichiara
  il layer sopra `--talos-z-global-navigation`.
- GREEN focalizzato: test unitari sopra e Playwright download-center.
- Gate finale: typecheck, Vitest completo, build Vite, Gradle debug/release e
  una sola campagna atomica sul Pad in tablet/telefono portrait/landscape.
- Rollback: ripristinare la prop, il ramo progress e il solo token overlay; lo
  store trasferimenti e il backend nativo restano invariati.

Decisione overlay: adattare il root Vaul con `modal=false`. L'overlay e il suo
z-index restano sopra il fondo, la sidebar resta non dismissibile, ma il browser
non applica il blocco globale dei puntatori che rende irraggiungibile il menu
portaled.

### Emendamento owner 2026-08-26 (sera) — pausa/riprendi/annulla nel bottone stesso

Precisazione owner dopo la prima prova Pad: la barra di avanzamento nel
pannello di dettaglio della variante deve portare anche i comandi di
pausa/riprendi/annulla, non solo la percentuale — «la sua barra integrata di
download, stop, annulla, eccetera eccetera». Il pulsante del centro download
in testata quando l'header globale non è montato era già presente e
verificato prima di questa richiesta.

Perimetro esatto dell'aggiunta:

- `mobile/src/lib/models/presentation.ts` — nuove funzioni pure condivise
  `talosTransferCanPause`/`talosTransferCanResume`, spostate qui dal trigger
  perché ora due componenti devono concordare sullo stesso giudizio sullo
  stesso `id` di trasferimento.
- `mobile/src/components/shell/TalosMobileDownloadCenterTrigger.vue` —
  riusa le due funzioni condivise al posto delle copie locali; nessun
  comportamento cambiato.
- `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue` —
  la card della variante selezionata guadagna una riga di comandi
  (Pausa/Riprendi + Annulla) sotto la barra `role=progressbar` esistente
  (che resta un contenitore separato: un widget `progressbar` non deve
  avere figli interattivi, W3C ARIA APG) e una conferma di annullamento
  identica a quella del Centro download, con le stesse chiavi i18n già
  presenti (`localModels.downloadCenter.*`, nessuna stringa nuova).
  `talosPauseManagedModelTransfer`/`talosResumeManagedModelTransfer`/
  `talosCancelManagedModelTransfer` sono le stesse funzioni dello store
  condiviso `modelTransfers.ts` già usate dal Centro download: nessun nuovo
  poller, nessun nuovo stato duplicato.

Decisione upstream: **non** adottare il pattern APG "toggle button con
`aria-pressed`" per pausa/riprendi (ricerca fatta: W3C ARIA APG Button/Toggle
consiglia un'etichetta invariata con stato booleano). Riusare invece il
pattern già in produzione nel Centro download (bottoni distinti che si
scambiano per stato) perché introdurre un secondo pattern per la stessa
identica azione, in un secondo punto che governa lo stesso `id` condiviso,
avrebbe creato un'incoerenza di prodotto peggiore della non conformità APG.

RED/GREEN: quattro scenari nuovi in
`mobile/tests/unit/models/TalosMobileLocalRepoDetail.test.ts` (pausa chiama
il comando sull'id giusto, riprendi sostituisce pausa, annulla chiede
conferma e "continua a conservarlo" la evita, nessun trasferimento non mostra
comandi). Focalizzati **38/38** verdi (repo detail + trigger). Suite completa
**675 file passati, 3 saltati; 6.367 test passati, 10 saltati** — 4 in più dei
6.363 precedenti, zero rossi. Typecheck verde. `git diff --check` pulito.

Gate Pad reale (Q4_K_M poi Q6_K, repo `MaziyarPanahi/Qwen3-0.6B-GGUF`, non
ancora scaricati): bottone → barra reale con bytes in movimento (0%→36%→52%,
232 MB/462 MB) → **Metti in pausa** cliccato realmente → la card è passata a
**Riprendi** (prova che la pausa ha avuto effetto) → **Riprendi** cliccato →
torna a **Metti in pausa** → **Annulla** cliccato → conferma con lo stesso
testo del Centro download → **Elimina il download** → il pulsante torna a
"Scarica Q6_K · 594 MB". Screenshot ispezionati per intero:
`final-download-014-active-0percent-controls.png`,
`final-download-014-active-36percent.png`,
`final-download-014-active-52percent-real-bytes.png`,
`final-download-014-waiting-cancel-only.png`,
`final-download-014-paused-resume-button.png`,
`final-download-014-resumed-pause-button.png`,
`final-download-014-cancel-confirmation.png`,
`final-download-014-cancelled-back-to-download-button.png`.

Modelli di prova (Q2_K, Q3_K_M, Q4_K_M dello stesso repo) eliminati dal
dispositivo al termine della prova: il Pad è tornato ai quattro modelli
originali.

## DEBT-MOBILE-015 — il prefisso di chat ha già aperto il ragionamento

### Causa misurata

Il parser LFM2/LFM2.5 vendorizzato in
`mobile/third_party/llama.cpp/common/chat.cpp` dichiara `<think>` come apertura
del ragionamento e conserva separatamente `generation_prompt`. Il template può
chiudere il prompt con `<think>`: il primo delta nativo nasce quindi già dentro
quel blocco e non ripete l'apertura. `talosCreateThinkSplitter()` partiva sempre
da `testo`, così l'analisi interna e gli eventuali marker tool restavano nella
bolla fino a `</think>`; solo il risultato finale veniva poi corretto dal parser
nativo.

### Perimetro esatto e simboli

- Modificare `mobile/src/lib/chat/thinkStream.ts`:
  `talosCreateThinkSplitter(startsInReasoning?: boolean)` conserva il default
  compatibile e può iniziare nello stato `ragionamento`.
- Modificare `mobile/src/lib/chat/providers/localAdapter.ts`: derivare il solo
  stato iniziale dal prompt reale già renderizzato (`trimEnd().endsWith('<think>')`),
  senza euristiche su nome/provider/modello.
- Test RED sintetici in `mobile/tests/unit/chat/thinkStream.test.ts` e
  `mobile/tests/unit/chat/localAdapter.test.ts`: prompt che termina in
  `<think>`, primo delta senza apertura, chiusura spezzata, risposta pubblica e
  marker tool successivi.

### Contratto e gate

- Il ragionamento continua ad arrivare a `onReasoning`; non viene cancellato.
- La risposta pubblica riceve soltanto il contenuto dopo `</think>` e nessun
  `<|tool_call_start|>...<|tool_call_end|>`.
- Prompt che non termina nell'apertura conserva il comportamento attuale: il
  testo normale non viene inghiottito.
- GREEN focalizzato: `thinkStream.test.ts` e `localAdapter.test.ts`; regressione
  su `toolCallNonAschermo.test.ts`, `protocolloFuoriDallaChat.test.ts` e UI
  streaming. Il Pad finale usa il modello LFM2.5 reale e controlla sia la fase
  live sia la risposta persistita.
- Rollback: rimuovere il parametro iniziale e il solo argomento nell'adapter;
  nessuna modifica al bridge Java/C++ o al formato salvato.

## Stato di arresto e passaggio al main agent — 2026-08-26

L'owner aveva ordinato di interrompere ogni ulteriore implementazione e prova;
questa sezione fotografava lo stato del worktree a quel momento. È superata
dalla chiusura sotto: entrambi i debiti hanno ora tutta l'evidenza richiesta,
raccolta dall'agente mobile nella stessa giornata.

### DEBT-MOBILE-014 — CHIUSO 2026-08-26 (sera)

Implementazione e test automatici erano già verdi (vedi sopra); il gate reale
mancante — un trasferimento attivo osservato con bytes in movimento — è stato
eseguito ed è verde, insieme ai comandi pausa/riprendi/annulla aggiunti dopo
la precisazione owner (emendamento sopra). Evidenza completa nella sezione
dedicata di questo ledger.

### DEBT-MOBILE-015 — CHIUSO 2026-08-26 (sera)

Gate Pad reale eseguito: modello locale `LFM2.5-2.6B-Q8_0` selezionato con
Ragionamento esteso attivo, due prompt reali inviati (uno breve, uno lungo per
avere più margine di osservazione durante lo streaming). Screenshot multipli
catturati **durante** la generazione (non solo alla fine), a intervalli di
~1 secondo:

- `final-streaming-015-live-frame-no-think-markers.png` — frame a metà
  streaming (punti 6-8 di 10, cursore attivo visibile a fine riga): testo
  pubblico pulito, nessun `<think>`/`</think>`/`<|tool_call_start|>` in
  nessun punto osservato.
- `final-streaming-015-reasoning-block-collapsed-separate.png` — il
  ragionamento vive in un blocco "🧠 Ragionamento" separato e collassato
  (freccia per espanderlo), sopra la risposta pubblica; non fa parte del
  testo della bolla.
- `final-streaming-015-completed-clean-response.png` — risposta finale
  completa (10 punti), pulita.
- `final-streaming-015-clean-after-reload.png` — dopo `am force-stop` e
  riavvio dell'app, la chat si riapre sulla stessa sessione con la risposta
  persistita identica, ancora pulita.

Il modello ha interpretato "sette per otto" come divisione (7÷8 = 0,875) nel
primo prompt di prova — comportamento del modello, non un difetto della UI;
irrilevante ai fini del debito, che riguarda l'assenza dei marker nel canale
pubblico, non l'esattezza aritmetica.

### Gate globali e limite noto — aggiornato 2026-08-26 (sera)

- `npm run typecheck`: verde.
- `npx vitest run`: **675 file passati, 3 saltati; 6.367 test passati, 10
  saltati, 0 falliti**.
- `git diff --check`: verde; restano soltanto avvisi CRLF/LF non bloccanti.
- `npx vite build` + `npx cap copy android`: verdi. `npm run build` continua a
  fermarsi solo sul tripwire globale preesistente del chunk iniziale
  (~614.29 kB contro 614.000 byte); soglia non toccata, fuori dal perimetro di
  questi due debiti.
- Gradle `:app:assembleDebug`: `BUILD SUCCESSFUL`.
- APK finale installata sul Pad e copiata nei Download del PC:
  `C:\Users\Antonino\Downloads\talos-mobile-debt014-controlli-download-20260826-194641-d49c7bd8b7e9.apk`.
- SHA-256: `d49c7bd8b7e93e5bcc8d5fcdc6135efe9b6059877522068eee386d6cf5060131`.
- Build precedente (senza i controlli pausa/riprendi/annulla), per riferimento:
  `talos-debug-2026-08-26-post-code-debts-final.apk`,
  SHA-256 `AEE53F439E71A5CEA16AD16098F46B34CCDC8AF58C149D1B4075F2D304F4677E`.

### Il solo gate ancora aperto — tablet portrait reale (DEBT-MOBILE-001, non 014/015)

Non riguarda DEBT-MOBILE-014/015: è un gate ereditato da DEBT-MOBILE-001,
mai chiuso perché richiede la rotazione **fisica** del Pad, non riproducibile
da programma. Il Pad ha reso tablet landscape e le due forme telefono; la
richiesta tablet portrait via `wm size`/`user_rotation` ha prodotto di nuovo
un frame landscape perché il dispositivo riportava rotazione `1` e ignorava
lo scambio dimensioni — `final-tablet-portrait-requested-loaded.png` non è
evidenza portrait valida, come già registrato. Nessun comando adb sostituisce
la rotazione fisica del dispositivo: serve l'owner.

### File esatti ancora non committati — aggiornato 2026-08-26 (sera)

- `.claude/DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/CONSEGNA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `mobile/src/App.vue`
- `mobile/src/components/shell/TalosMobileDownloadCenterTrigger.vue`
- `mobile/src/components/shell/TalosMobileSidebar.vue`
- `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue`
- `mobile/src/lib/chat/providers/localAdapter.ts`
- `mobile/src/lib/chat/thinkStream.ts`
- `mobile/src/lib/models/presentation.ts`
- `mobile/src/style.css`
- `mobile/tests/e2e/mobile-model-download-center.e2e.spec.ts`
- `mobile/tests/unit/chat/localAdapter.test.ts`
- `mobile/tests/unit/chat/thinkStream.test.ts`
- `mobile/tests/unit/models/TalosMobileLocalRepoDetail.test.ts`
- `mobile/tests/unit/shell/TalosMobileDownloadCenterTrigger.test.ts`
- `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`

I due prompt di ripresa della sessione precedente
(`PROMPT-RIPRESA-MAIN-AGENT-DEBITI-MOBILE-2026-08-26.md` e
`PROMPT-CLAUDE-MOBILE-DEBITI-014-015-2026-08-26.md`) restano non tracciati sul
disco per riferimento storico, senza essere aggiunti al commit: sono materiale
di consegna fra sessioni, non parte del prodotto.

Le immagini/XML sotto `.claude/pad-debt-campaign-2026-08-26/` sono evidenze
non tracciate. Le catture finali selezionate per questa chiusura hanno il
prefisso `final-download-014-*` e `final-streaming-015-*`; le decine di
catture esplorative (`gate2-*`, `gate3-*`, `verify*`, `stream*`, `live*`,
`nav*`, `cleanup*`, `ui-*.xml`) restano sul disco per tracciabilità ma non
entrano nel commit.
