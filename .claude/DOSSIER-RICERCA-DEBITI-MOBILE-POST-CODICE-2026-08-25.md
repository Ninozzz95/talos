# Dossier di ricerca — debiti mobile post-Codice — 2026-08-25

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
