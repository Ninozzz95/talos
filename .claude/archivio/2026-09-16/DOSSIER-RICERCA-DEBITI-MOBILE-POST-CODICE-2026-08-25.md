# Dossier di ricerca — debiti mobile post-Codice — 2026-08-25

## DEBT-MOBILE-007 — Pinch-to-zoom nella Chat

### Fonti primarie consultate

- MDN, proprietà CSS `touch-action`:
  `https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action`
- W3C Pointer Events, sezione viewport panning/zooming:
  `https://www.w3.org/TR/pointerevents/#the-touch-action-css-property`

### Decisione

Adottare la utility Tailwind già presente `touch-pan-y` soltanto sul thread
scrollabile della Chat. Non usare `user-scalable=no` o un blocco globale: la
regione mantiene lo scroll verticale e il resto dell'app conserva il normale
zoom/accessibilità.

## DEBT-MOBILE-008 — Drag della sidebar globale

### Fonte primaria consultata

- Vaul upstream, contratto `direction`, `dismissible`, soglia e gesto:
  `https://github.com/emilkowalski/vaul/blob/main/src/index.tsx`

### Decisione

Riutilizzare il comportamento nativo già presente di `vaul-vue`: la sidebar è
una drawer `direction="left"`, quindi la chiusura è il drag della sua stessa
superficie verso sinistra. Il difetto reale era il binding
`:dismissible="!props.busy"`, che disattivava il drag mentre la X rimaneva
operativa. Rimuovere listener paralleli evita conflitti con scroll e motion
tokens; il gate umano deve comunque verificare il gesto reale sul Pad.

## DEBT-MOBILE-009 — Errore OAuth OpenRouter dopo salvataggio chiave

### Fonti e decisione

Il codice locale documenta un flusso OAuth PKCE per client pubblico e il
contratto RFC 8252 è già adottato per il browser di sistema. La diagnosi sul
percorso reale ha distinto l'errore temporaneo del login dal catalogo
provider: la chiave salvata e i modelli pronti sono uno stato successivo che
deve invalidare il messaggio OAuth precedente.

Decisione: non rifare OAuth e non nascondere gli errori di catalogo; impedire
solo che l'avviso OAuth resti visibile quando la chiave OpenRouter è presente.

## DEBT-MOBILE-010 — Immagine nella model card Hugging Face

### Fonti primarie consultate

- markdown-it, opzione `html` e renderer token:
  `https://markdown-it.github.io/markdown-it/interfaces/MarkdownItOptions.html`
- DOMPurify, allowlist esplicite e sanitizzazione URL:
  `https://github.com/cure53/DOMPurify`

### Decisione

Adattare il renderer condiviso dietro un'opzione disattivata per default.
Mantenere `html:false`, convertire soltanto il tag immagine noto della scheda
in Markdown e consentire nel DOM esclusivamente immagini HTTPS dall'host
`cdn-uploads.huggingface.co`. Nessun HTML generico, stile inline, handler,
protocollo sconosciuto o host arbitrario viene accettato.

## DEBT-MOBILE-002 — Verifica GPU: diagnosi e ricerca (fase 1)

### Percorso reale verificato

- La prima scelta di un profilo locale passa da
  `mobile/src/stores/chatController.ts::decideLocalEngineProbeConsent`.
  Con `granted` la modale si chiude subito e il sondaggio parte in background
  tramite `talosLocalEngineLazy().then(...qualify...)`.
- La modale è
  `mobile/src/components/shell/TalosLocalEngineProbeConsentSheet.vue`: non
  riceve né espone uno stato di esecuzione; il pulsante «Sì, verifica ora»
  emette soltanto `granted`.
- Il comando delle impostazioni è
  `mobile/src/components/talos/settings/TalosMobileSettingsPrivacyPanel.vue::runLocalEngineProbeFromSettings`.
  Mostra «In corso…» finché la Promise torna, ma non ha un ramo `catch`: un
  rifiuto del ponte nativo resetta `busy` nel `finally` e lascia la scheda senza
  esito né errore.
- La qualificazione reale è `mobile/src/services/localEngine.ts::talosQualifyLocalBackend`
  e il ponte Android è
  `mobile/android/app/src/main/java/ai/talos/TalosLlamaPlugin.java::qualifyBackend`.
  Sul Pad la CPU ha prodotto nel logcat un verdetto `VALID` in circa 5 secondi;
  quindi il percorso nativo esiste e il lavoro è reale, non un dummy. Nel test
  osservato l'esito UI non è comparso dopo il completamento nativo perché la
  superficie era stata lasciata/riaperta durante la corsa: il percorso non
  possiede uno stato persistente o un errore osservabile fuori dal componente.

### Ricerca web ufficiale (2026-08-25)

- Android Developers, **Foreground services overview**, aggiornato
  2026-08-14: un'operazione lunga e percepibile deve rendere visibile il fatto
  che sta consumando risorse tramite stato/notifica; non si deve presentare
  come completata mentre corre.
  https://developer.android.com/develop/background-work/services/fgs
- Android Developers, **Services overview**: il lavoro bloccante deve stare
  fuori dal thread principale e il servizio non fornisce da solo una UI.
  https://developer.android.com/develop/background-work/services
- Android Developers, **Observe intermediate worker progress**: quando un
  lavoro espone avanzamento, la UI deve osservarlo; per questa qualificazione
  breve non esiste una percentuale nativa affidabile, quindi lo stato corretto
  è `running` fino all'esito, non una percentuale inventata.
  https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/observe

### Decisione upstream

Adattare il pattern ufficiale di stato osservabile senza introdurre un nuovo
WorkManager/foreground-service: la verifica viene avviata da una schermata
visibile, è bounded e già eseguita su `qualificationWorker`; aggiungere un
servizio per questa singola corsa allargherebbe il perimetro e non risolverebbe
il difetto UI. La UI riceverà uno stato osservabile `running/success/error` e
renderizzerà sempre l'esito, anche quando il ponte rifiuta la chiamata. Nessuna
percentuale finta.

Owner: Antonino  
Sottosistema: TALOS UI mobile (`mobile/`)  
Pin temporale delle fonti: 2026-08-25

## DEBT-MOBILE-003 — Strutture Markdown in streaming

### Percorso reale verificato

- `mobile/src/components/chat/TalosMobileStreamingReply.vue` separa il
  prefisso Markdown dal tail ancora in arrivo. `tailTarget()` rifiuta elementi
  strutturali come `TABLE`, quindi il tail ricadeva sul contenitore e
  `ensureTail()` creava comunque il caret typewriter.
- `mobile/src/components/chat/TalosMobileMessageContent.vue` mantiene il
  parsing a blocchi con `v-memo`; non va sostituito con un renderer parallelo.
- Il RED aggiunto in
  `mobile/tests/unit/chat/streamingUi.test.ts` riproduce una tabella completa
  e fallisce perché `[data-testid="talos-stream-caret"]` esiste dopo il
  rendering della tabella.

### Ricerca web ufficiale corrente (2026-08-26)

- MDN, **prefers-reduced-motion**: la preferenza deve rimuovere o ridurre le
  animazioni non essenziali; fonte primaria:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion
- MDN, **animation CSS property**: le animazioni devono avere durata e stato
  espliciti e prevedere un meccanismo per disabilitarle;
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation
- markdown-it, **Interface MarkdownIt**: il parser produce token e il renderer
  li converte in HTML; fonte upstream mantenuta:
  https://markdown-it.github.io/markdown-it/interfaces/MarkdownIt.html

### Decisione upstream

Adattare i contratti già presenti: il parser `markdown-it` e il renderer a
blocchi restano la fonte di verità; per un tail che termina su una struttura
(`TABLE` o riga Markdown tabellare) si sopprime il caret prompt e si usa la
stessa animazione di opacità del fade, senza animare posizione/layout. Il
percorso `prefers-reduced-motion` esistente continua a disabilitare la
transizione. Nessun parser o dipendenza nuova.

### GREEN

- `rtk npm exec vitest run tests/unit/chat/streamingUi.test.ts`: 18/18 verdi.
- Il test di regressione verifica che una tabella strutturata non mostri il
  caret typewriter; gli scenari precedenti di testo, fade, code fence e tool
  activity restano verdi.

## DEBT-MOBILE-004 — Scala caratteri della prima installazione

### Percorso reale verificato

- `mobile/src/lib/talosFontScale.ts` possedeva solo `small/default/large/xlarge`
  e `TALOS_DEFAULT_FONT_SCALE = 'default'`; la UI non poteva offrire
  «Molto piccola» per i testi dell'interfaccia.
- `parseTalosMobileSettings(null)` e `parseTalosMobileSettings('{}')` usano
  `TALOS_DEFAULT_FONT_SCALE`, quindi erano entrambi RED riproducibili.
- `mobile/src/main.ts` applica già la scala al primo frame tramite il mirror
  sincrono; non serve una nuova persistenza o un nuovo watcher.

### Ricerca web ufficiale corrente (2026-08-26)

- Android Developers, **Accessibility foundations**: il testo regolabile deve
  usare la scala del sistema e unità scalabili;
  https://developer.android.com/design/ui/mobile/guides/foundations/accessibility
- W3C, **WCAG 2.2 SC 1.4.4 Resize Text**: il supporto deve consentire di
  ingrandire il testo fino al 200% senza perdere contenuto o funzionalità;
  https://www.w3.org/WAI/WCAG22/Understanding/resize-text
- MDN, **font-size**: le unità root-relative restano relative alla dimensione
  dell'elemento radice;
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-size

### Decisione upstream

Adattare la scala CSS già posseduta dall'app: aggiungere il solo gradino
`xsmall = 0.8`, etichettato «Molto piccola» in italiano, e renderlo il default
di una nuova installazione. Il mirror sincrono e i gradini maggiori restano
intatti; una scelta persistita diversa non viene sovrascritta.

### GREEN

- `rtk npm exec vitest run tests/unit/stores/predefinitiInstallazioneNuova.test.ts tests/unit/lib/talosFontScale.test.ts`: 13/13 verdi.

## DEBT-MOBILE-005 — «Autorizza tutti · Sempre» abilita i due switch agente

### Percorso reale verificato

- `mobile/src/components/intro/TalosMobileSetupIntro.vue::next` già salva i
  tre livelli `read/write/outbound` e abilita `library_context_enabled` quando
  sono tutti `allow`, ma non toccava `agent_tools`.
- `mobile/src/lib/tools/toolControls.ts` dichiara entrambi i controlli
  conservativi di default: `library_context_policy_update: false` e
  `device_screen_drive: false`.
- Le etichette reali del pannello sono «Gestisci la policy Libreria» e «Usa
  un’app al posto tuo»; `app_azione` è un controllo diverso e non va acceso al
  posto del secondo.

### Ricerca web ufficiale corrente (2026-08-26)

- Android Developers, **Permissions overview**: l'utente mantiene il controllo
  e l'app deve associare gli accessi alle azioni richieste;
  https://developer.android.com/guide/topics/permissions/overview
- Android Developers, **App permissions best practices**: chiedere il minimo
  necessario e nel contesto dell'azione;
  https://developer.android.com/training/permissions/usage-notes
- Android Developers, **Minimize permission requests**: gli accessi vanno
  ridotti e negati con un degrado leggibile;
  https://developer.android.com/privacy-and-security/minimize-permission-requests

### Decisione upstream

Adattare il contratto locale già esistente: solo il gesto esplicito
«Autorizza tutti» con durata «Sempre» abilita i due controlli richiesti tramite
`settings.setAgentToolEnabled`; «Chiedi»/«Nega» e il passaggio senza tocco non
li attivano. Nessun permesso Android nuovo e nessuna modifica al catalogo.

### GREEN

- `rtk npm exec vitest run tests/unit/components/TalosMobileSetupIntro.test.ts`:
  26/26 verdi, compresa la prova inversa.

## DEBT-MOBILE-006 — Tastiera nascosta, focus e composer compatto

### Percorso reale verificato

- `mobile/src/services/nativeFraming.ts::configureNativeFraming` registra già
  il listener Capacitor `keyboardDidHide`; quando il focus DOM resta su
  `textarea`/`input`, chiama `blur()`.
- `mobile/src/components/chat/TalosMobileComposer.vue` aggiorna
  `composerFocused` nei listener `focus/blur`; con campo vuoto e preference
  immersive il computed `composerCompact` torna quindi vero.
- I test esistenti coprono sia il rilascio del focus nativo sia il ritorno
  compatto dopo `blur`; non è emersa una lacuna di codice in questa verifica.

### Ricerca web ufficiale corrente (2026-08-26)

- Capacitor Keyboard v8 documenta gli eventi `keyboardWillHide` e
  `keyboardDidHide` per tracciare la visibilità della tastiera:
  https://capacitorjs.com/docs/apis/keyboard
- La stessa API documenta `addListener` e il comportamento Android, quindi il
  listener condiviso del framing è il punto corretto; non serve un secondo
  listener per ogni composer.

### Decisione upstream e stato

Adattamento già presente dell'API ufficiale: mantenere un solo listener globale
che rilascia il focus, lasciando al componente condiviso il ritorno compatto.
Nessun nuovo codice prodotto in questa fase.

### GREEN

- `rtk npm exec vitest run tests/unit/services/nativeFraming.test.ts tests/unit/chat/TalosMobileComposer.drawer.test.ts`: test esistenti verdi; il gate
  completo e la prova Pad restano nel lotto finale.

## DEBT-MOBILE-001 — Safe area del viewer Markdown

### Problema misurato

- Evidenza owner: `C:\Users\Antonino\Downloads\bug\unnamed (1).jpg`.
- Aprendo il Markdown appena generato dalla scheda Chat, il nome file e la X
  entrano nella status bar del Pad.
- `TalosMobileMarkdownViewer.vue` è un overlay `fixed inset-0`, ma protegge
  soltanto il fondo con `env(safe-area-inset-bottom)`; la testata usa solo
  `py-3`.
- Il percorso Libreria non monta questo overlay: rende il documento nella
  superficie canonica di Libreria, che applica già la safe area superiore.
- Le superfici sorelle già corrette (`TalosMobileChatMediaPanel.vue`,
  `TalosMobileImageViewer.vue`, `ContextScreen.vue`) applicano
  `env(safe-area-inset-top)` alla testata o alla radice fullscreen.
- Build Android corrente: `compileSdkVersion = 36`, `targetSdkVersion = 36`;
  WebView Capacitor `8.4.2`.

### Fonti primarie correnti

1. Android Developers, **Edge-to-edge design**, aggiornato 2026-08-14:
   https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge
   - Lo sfondo può disegnare sotto le system bar.
   - Contenuto critico e bersagli touch devono invece rispettare gli inset.
2. Android Developers, **Understand window insets in WebView**:
   https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets
   - WebView inoltra `displayCutout` e `systemBars` al contenuto web tramite le
     variabili CSS `safe-area-inset-*`.
3. MDN, **`env()` CSS function**, consultata 2026-08-25:
   https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env
   - `safe-area-inset-top` definisce la distanza sicura superiore; vale zero
     su viewport rettangolari non ostruite.

### Decisione upstream

**Adopt directly.** Usare il contratto nativo già esposto da WebView,
`env(safe-area-inset-top)`, nel viewer condiviso. Nessun adapter, pacchetto o
codice Android aggiuntivo: l'app applica già lo stesso pattern nelle superfici
sorelle. Pin di compatibilità: Android target 36 + Capacitor 8.4.2 come presenti
nel lock/progetto al 2026-08-25.

### Alternative escluse

- Altezza fissa della status bar: rifiutata perché varia con device, densità,
  orientamento, cutout e modalità finestra.
- Correzione solo nella scheda Chat: rifiutata perché il contratto appartiene
  all'overlay fullscreen condiviso.
- Plugin o modifica nativa: rifiutati perché WebView fornisce già l'inset e
  l'app lo consuma correttamente.

## DEBT-MOBILE-011 — Think e tool call durante lo streaming

### Fonti primarie correnti

- llama.cpp, `common_chat.h`: il contratto normalizzato distingue
  `content`, `reasoning_content` e `tool_calls`:
  `https://github.com/ggml-org/llama.cpp/blob/master/common/chat.h`.
- llama.cpp, guida al parser PEG: i parser maturi consumano i delimitatori di
  ragionamento e tool call prima di esporre il contenuto:
  `https://github.com/ggml-org/llama.cpp/blob/master/docs/development/parsing.md`.
- llama.cpp, parser automatico: il formato può avere marcatori di apertura e
  chiusura specifici per modello, quindi la lettura deve essere stateful:
  `https://github.com/ggml-org/llama.cpp/blob/master/common/chat-auto-parser.h`.

### Decisione upstream

Adattare il separatore `talosCreateThinkSplitter` già usato dall'adapter locale,
estendendolo ai marker LFM2/LFM2.5 `<|tool_call_start|>` e
`<|tool_call_end|>` e riusandolo anche sul canale testuale condiviso quando un
provider consegna marker inline. Non filtrare il DOM a posteriori e non
duplicare parser per modello: il separatore conserva la coda tra chunk,
separa il ragionamento nel canale già previsto e butta la sintassi tool.
L'adozione diretta del parser C++ non è possibile nel WebView; il contratto
upstream viene adattato dietro l'helper TypeScript esistente.

### Deducibilità dal finding

La presenza di `</think>` e dei marker LFM2.5 nello screenshot è coerente con
un protocollo inline consegnato come testo, non con un evento `reasoning_content`
già normalizzato. Il test deve quindi includere marker completi, spezzati e
stream interrotto mentre il blocco è aperto.

## DEBT-MOBILE-012 — OpenRouter/Gemini e persistenza immagini

### Fonti primarie correnti

- OpenRouter, **Image Generation**: l'Image API espone capacità, formato di
  risposta e opzioni per modelli immagine:
  `https://openrouter.ai/docs/guides/overview/multimodal/image-generation`.
- OpenRouter, **Image Generation server tool**: il server tool può essere
  invocato da un modello chat e restituisce il risultato al modello:
  `https://openrouter.ai/docs/guides/features/server-tools/image-generation`.
- OpenRouter, **Models API**: la capacità `output_modalities=image` è distinta
  dal percorso testo:
  `https://openrouter.ai/docs/guides/overview/models`.
- OpenRouter, **List image models**: gli endpoint espongono le capacità e se
  supportano lo streaming:
  `https://openrouter.ai/docs/api/api-reference/images/list-image-models`.
- OpenRouter, **Google: Gemini 3.7 Flash**: la scheda del modello chat dichiara
  input multimodale ma output testuale, non `image`:
  `https://openrouter.ai/google/gemini-3.7-flash`.

### Tracing locale e decisione adottata

Il percorso effettivo non è il server tool: `chatController.ts` pianifica
`POST /api/v1/images`, riceve `response.data`, passa dal parser condiviso e
chiama `sources.save`. Il server tool beta avrebbe un contratto diverso
(`openrouter:image_generation` su chat completions, con `imageUrl` restituito al
modello); non va mescolato con il decoder locale.

La Image API documenta `data[].b64_json` come base64 dei bytes; per PNG
`media_type` può essere omesso, mentre i modelli vettoriali possono dichiarare
`image/svg+xml`. Il parser locale conserva il perimetro persistibile già
supportato (PNG/JPEG/WebP), ma compatta il whitespace del base64 prima di
passarlo alla `data:` URL: una stringa con line-break è base64 valido ma una
`data:` URL non normalizzata può far fallire `fetch()` prima del vault.

Il catalogo OpenRouter espone `output_modalities`; la pagina di Gemini 3.7
Flash lo classifica come modello che restituisce testo. Il picker ora accetta
un candidato OpenRouter solo quando la capacità immagine è esplicita, quindi
un modello chat come `google/gemini-3.7-flash` non può diventare per errore il
modello della chiamata immagini. Il modello immagine viene scelto dal catalogo
dedicato; nessun id statico o fallback remoto è stato introdotto.

Il test d'integrazione `IMAGE-OR-05 IMAGE-DUR-01/02/03
DEBT-MOBILE-012` ora porta un `b64_json` spezzato attraverso il controller e
asserisce che la `data:` URL passata a `fetch` sia compatta, poi controlla
persistenza, allegato, reload e assenza di reinvio dei bytes nel turno
successivo. Questo prova il collegamento applicativo senza fingere il vault.

### Limite ancora aperto

Il log owner prova un throw dentro `sources.save`, ma non contiene il payload
base64 né la causa interna del vault; perciò non dichiaro già chiuso il
repository cifrato. La campagna Pad finale dovrà generare con Gemini 3.7,
controllare che il modello immagine scoperto risponda, verificare bytes e
rendering, ricaricare la chat e ripetere con un provider alternativo. Se il
Pad riproduce ancora `TALOS_IMAGE_PERSIST_FAILED`, il prossimo passo sarà
registrare la causa interna del save al confine diagnostico, senza esporre
 segreti o percorsi privati.

## Aggiornamento ricerca — DEBT-MOBILE-008B e DEBT-MOBILE-010 — 2026-08-26

### Fonti ufficiali consultate

- MDN `Element.setPointerCapture()`:
  `https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture`
- MDN `touch-action`:
  `https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action`
- Vaul Vue upstream (avviso di manutenzione e Drawer di Reka UI):
  `https://github.com/unovue/vaul-vue`
- Vaul upstream (contratto di drag/release):
  `https://github.com/emilkowalski/vaul/blob/main/src/index.tsx`
- Hugging Face Model Cards (README Markdown e immagini CDN):
  `https://huggingface.co/docs/hub/main/en/model-cards`
- DOMPurify security model (allow-list e URI validation):
  `https://github.com/cure53/DOMPurify/wiki`

### Decisione applicata

MDN conferma che il browser può emettere `pointercancel` quando prende in
carico lo scroll e che `setPointerCapture` è il meccanismo standard per
continuare a ricevere eventi fuori dall'elemento. Il codice conserva quindi
il fallback TouchEvent già necessario al WebView Android e aggiorna il
drawer con `translate3d` a ogni movimento; la soglia viene valutata solo al
rilascio. Non si migra da `vaul-vue@0.4.1` in questo fix perché l'upstream lo
dichiara non mantenuto: una migrazione a Reka UI è un lavoro separato.

Hugging Face documenta che le model card sono README Markdown e che le
immagini caricate usano `cdn-uploads.huggingface.co`. La scheda converte solo
quel tag `<img>` in Markdown, poi il renderer esistente abilita `img` soltanto
per quel contesto e DOMPurify mantiene la allow-list/validazione URI; la Chat
continua a omettere le immagini esterne.

## Aggiornamento ricerca — DEBT-MOBILE-014/015 — 2026-08-26

### Download, progresso e livelli

- WAI-ARIA `progressbar`: il valore è readonly; `aria-valuenow` va omesso
  quando il totale non è determinabile:
  `https://www.w3.org/TR/wai-aria/#progressbar`.
- WAI-ARIA APG, proprietà di range: `aria-valuemin`, `aria-valuemax` e valore
  corrente devono descrivere il progresso reale:
  `https://www.w3.org/WAI/ARIA/apg/practices/range-related-properties/`.
- Reka UI Popover: il contenuto viene portato con `PopoverPortal`, ma la
  posizione di livello resta responsabilità CSS dell'app:
  `https://reka-ui.com/docs/components/popover`.
- MDN, stacking context: un `z-index` maggiore nello stesso contesto/top-level
  dipende dall'ordine numerico esplicito, non dal fatto che il nodo sia stato
  portato altrove:
  `https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context`.

Decisione: adattare i componenti esistenti, senza nuove dipendenze. Riutilizzare
lo store trasferimenti e il suo poller; la pagina dettaglio è solo una
proiezione. Introdurre un token TALOS sopra la navigazione globale invece di un
altro numero locale.

### Streaming e prefisso di ragionamento

- llama.cpp `common/chat.h`: `generation_prompt` è il prefisso assistant già
  inserito nel prompt ed è usato per determinare lo stato iniziale del parser:
  `https://github.com/ggml-org/llama.cpp/blob/master/common/chat.h`.
- llama.cpp `common/chat.cpp`: il parser specializzato LFM2/LFM2.5 dichiara
  `<think>`/`</think>`, `generation_prompt` e marker tool LFM:
  `https://github.com/ggml-org/llama.cpp/blob/master/common/chat.cpp`.
- Hugging Face, Chat Response Parsing: quando il prefisso ha già aperto una
  regione thinking, il parser streaming espone eventi iniziali prima dei byte
  generati; non si può aspettare un secondo marker dal modello:
  `https://huggingface.co/docs/transformers/main/en/chat_response_parsing`.
- Hugging Face, Chat Templates: un generation prompt/prefill può lasciare
  aperto il campo di ragionamento che il modello continua:
  `https://huggingface.co/docs/transformers/main/en/chat_templating`.

Decisione: adattare il separatore AVM esistente con un solo stato iniziale
esplicito derivato dal prompt effettivo. Non duplicare il parser C++, non
riconoscere modelli per nome e non filtrare il DOM dopo il rendering.

## Aggiornamento ricerca — controlli pausa/riprendi/annulla — 2026-08-26 (sera)

### Fonte primaria consultata

- W3C WAI-ARIA Authoring Practices Guide, pattern Button (toggle button):
  un bottone toggle mantiene l'etichetta invariata e comunica lo stato con
  `aria-pressed`, non scambiando testo/icona.
  `https://www.w3.org/WAI/ARIA/apg/patterns/button/`

### Decisione applicata

Il pattern APG puro (etichetta fissa + `aria-pressed`) non è stato adottato:
il repo ha già un controllo pausa/riprendi in produzione
(`TalosMobileDownloadCenterTrigger.vue`) che usa bottoni distinti scambiati
per stato, passato per la propria ricerca in una fase precedente del debito.
Introdurre il pattern APG *solo* nel nuovo punto di accesso allo stesso `id`
di trasferimento condiviso avrebbe reso lo stesso comando visivamente/
semanticamente diverso a seconda di dove viene toccato — un'incoerenza di
prodotto giudicata peggiore della non conformità letterale all'APG. La logica
di stato (`talosTransferCanPause`/`talosTransferCanResume`) è stata invece
estratta in un modulo condiviso (`lib/models/presentation.ts`) così i due
punti non possono mai mostrare stati diversi per lo stesso trasferimento.
