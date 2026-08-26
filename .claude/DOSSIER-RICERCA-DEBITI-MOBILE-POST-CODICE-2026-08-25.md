# Dossier di ricerca — debiti mobile post-Codice — 2026-08-25

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
  l'app lo consuma correttamente altrove.
