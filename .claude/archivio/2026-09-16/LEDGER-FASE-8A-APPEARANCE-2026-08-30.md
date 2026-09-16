# Ledger Fase 8A — parità completa Aspetto mobile → desktop

Data: 2026-08-30  
Ownership: Harness Desktop (`AVM-harness-desktop`) soltanto. La lane `mobile/`
è riferimento in sola lettura.

## Obiettivo e confini

Portare nel pannello **Aspetto** desktop tutte le 35 voci A01–A35 del dossier
`.claude/INVENTARIO-IMPOSTAZIONI-MOBILE-DESKTOP-2026-08-30.md`. Ogni controllo
deve produrre un effetto reale nel bundle o essere esplicitamente marcato
`Preparazione runtime`/`Non applicabile`; niente switch decorativi. Il runtime
LLM locale e il Model Lab restano fuori da questa fase.

## Ricerca upstream e decisioni

- MDN `color-scheme` e `prefers-color-scheme`: adottare le API native per
  modalità `system/light/dark`, inclusa la meta `color-scheme`; fonti:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme>
  e <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-color-scheme>.
- MDN Page Visibility e `requestAnimationFrame`: adottare per sospendere il
  renderer quando la pagina è nascosta e per un frame loop corretto;
  fonti <https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API>
  e <https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame>.
- MDN `prefers-reduced-motion`: mantenere l’override locale separato dal
  segnale OS; fonte <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion>.
- Hermes Desktop: adattare preset, font e streaming come impostazioni persistenti
  ma mantenere TALOS token-first; fonte
  <https://hermes-agent.nousresearch.com/docs/user-guide/desktop>.
- VS Code: adottare lo scope locale dichiarato ora; User/Workspace separati solo
  con un contratto server reale; fonte
  <https://code.visualstudio.com/docs/configure/settings>.

Decisione: nessuna nuova dipendenza. Theme engine e motion engine restano
adapter TALOS nel bundle statico; renderer background semplice via CSS/custom
properties + `requestAnimationFrame` solo per la parallasse, con fallback statico.

## File e simboli esatti

### Modificare

1. `mobile/public/harness-ui/index.html`
   - sezione `[data-view="settings"]`;
   - card `#appearanceSettingsCard`;
   - controlli `#themePresetSelect`, `#colorModeSelect`,
     `#sceneOverrideSelect`, `#backgroundMotionToggle`,
     `#interfaceMotionToggle`, `#motionModeSelect`, `#motionQualitySelect`,
     `#motionSpeedRange`, `#motionIntensityRange`, `#motionGlowRange`,
     `#motionDensityRange`, `#motionDepthRange`, `#motionTrailsRange`,
     `#motionContrastRange`, `#motionParallaxRange`, `#pauseWhenHiddenToggle`,
     `#respectDataSaverToggle`, `#motionProfileSelect`, `#motionEasingSelect`,
     `#motionDurationRange`, `#motionUiIntensityRange`, `#motionStaggerRange`,
     `#motionWindowsToggle`, `#motionSurfacesToggle`,
     `#motionNavigationToggle`, `#motionComposerToggle`,
     `#motionMessagesToggle`, `#motionFeedbackToggle`,
     `#composerShapeSelect`, `#composerPlusSelect`, `#messageStyleSelect`,
     `#streamingAnimationSelect`, `#windowPresentationSelect`,
     `#immersiveHeaderToggle`, `#resetMotionButton`.
2. `mobile/public/harness-ui/app.js`
   - `DESKTOP_APPEARANCE_DEFAULTS` esteso a tutti i campi A01–A35;
   - costanti allowlist dei preset, scene, enum e range;
   - `normalizzaAspettoDesktop(value)` fail-closed, senza segreti;
   - `applicaAspettoDesktop(appearance)` per dataset, token CSS e controlli;
   - `aggiornaMotionDesktop()` per scena/renderer e categorie;
   - `avviaBackgroundDesktop()`/`fermaBackgroundDesktop()` con visibility,
     reduced-motion e data-saver;
   - `resettaMotionDesktop()` ripristina soltanto i default Motion;
   - `inizializzaAspettoDesktop()` e wiring change/input/reset.
3. `mobile/public/harness-ui/styles.css`
   - token `[data-talos-theme]`, `[data-talos-color-mode]`,
     `[data-talos-scene]`, `--talos-motion-*`;
   - renderer `.talos-background-scene` e stati `background-motion-off`,
     `interface-motion-off`, `reduce-motion`;
   - layout responsive della card e badge `Preparazione runtime`;
   - `@media (prefers-reduced-motion: reduce)` come fallback OS.
4. `mobile/tests/unit/harness/harnessUiFrontend.test.ts`
   - test RED/GREEN `CODE-SETTINGS-APPEARANCE-COMPLETE-01`;
   - `CODE-SETTINGS-THEME-REAL-01`;
   - `CODE-SETTINGS-MOTION-REAL-01`;
   - `CODE-SETTINGS-MOTION-VISIBILITY-01`;
   - `CODE-SETTINGS-MOTION-STATIC-01`;
   - `CODE-SETTINGS-MOTION-RESET-01`.
5. `.claude/QA-VISIVA-HARNESS-2026-08-30.md` — aggiungere la matrice desktop
   1440×900 e 1024×800 per ogni gruppo Aspetto, cambio/reload/reset, tema
   light/dark/system, scena, motion on/off e reduced-motion.

### Creare

- Nessun nuovo modulo: la slice riusa il runtime statico esistente. Il plugin
  Ponytail è stato disinstallato e non è una dipendenza del desktop.

### Eliminare

- Nessun file.

## RED / GREEN / gate

- RED: i nuovi selettori non esistono e i 35 campi non vengono idratati,
  persistiti o applicati a token/renderer.
- GREEN focalizzato: `npx vitest run mobile/tests/unit/harness/harnessUiFrontend.test.ts`.
- Regressione: `npx vitest run mobile/tests/unit/harness` e suite Harness completa.
- Static checks: `node --check mobile/public/harness-ui/app.js` e `git diff --check`.
- Gate reale: server locale Harness, browser Chromium alle risoluzioni 1440×900
  e 1024×800; screenshot interi prima/durante/dopo scena e transizioni,
  reload persistente, pagina nascosta, reduced-motion e reset.
- Rollback: rimuovere soltanto i controlli/simboli A01–A35 e le regole renderer;
  preservare schema `talos.harness.desktop.settings.v1`, file tree e chat.

## Criteri di chiusura

La fase è chiusa solo quando ogni A01–A35 è: (a) operativo e verificato, oppure
(b) marcato non applicabile/gated con motivo visibile. Nessun valore mobile viene
copiato in `localStorage` oltre alla allowlist normalizzata.

## Amend — verifica visuale 30/08/2026

La prima corsa ha evidenziato un difetto di compositing: `.app-shell` aveva
un fondo opaco che copriva `.talos-background-scene`. Il fix rende il guscio
trasparente; la modalità `static` non avvia il renderer; il favicon inline
elimina il 404 cosmetico. Le corse CDP a 1440×900 e 1024×800 sono state
ripetute dopo il fix, con zero errori di rete e zero eccezioni.
