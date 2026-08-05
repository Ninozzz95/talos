# Model Lab physical evidence — Phase 3

- Phase status: GREEN DEVICE
- Git HEAD: `11156fd1456c7289395c9e9ef8ca5a79af3a352b`
- Dirty product paths included in APK:
  - `mobile/src/components/talos/models/TalosMobileHuggingFaceAccessCard.vue`
  - `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
  - `mobile/src/components/talos/models/TalosMobileModelLabHub.vue`
  - `mobile/src/i18n/locales/en.ts`
  - `mobile/src/i18n/locales/it.ts`
  - `mobile/src/lib/models/browseFilters.ts`
  - `mobile/src/lib/models/huggingFace.ts`
  - `mobile/src/lib/models/licensePolicy.ts`
  - `mobile/src/lib/models/providerGrouping.ts`
  - `mobile/src/screens/SettingsModelsProvidersScreen.vue`
- APK path: `C:\Users\Antonino\Desktop\projects\AVM\mobile\android\app\build\outputs\apk\debug\app-debug.apk`
- APK bytes: 30351219
- APK SHA-256: `c6716d11f013ba9df1c5834ce145de8c79cdc2d607cb3be1883ceb1ad9fcea45`
- Build command: `npm run build`; `npx cap sync android`; from
  `mobile/android`, `.\gradlew.bat testDebugUnitTest assembleDebug
  -PtalosSideBySide --no-daemon --console=plain`
- Build timestamp UTC: `2026-08-05T06:51:12.7828897Z`
- Package/application ID: `ai.talos.dev`
- App version/version code: `1.0-dev` / `1`
- Device serial: `2ea6573c`
- Manufacturer/model: OnePlus / OPD2415
- Android/API: 16 / 36
- Physical pixels: 2400×3392
- Physical density: 420
- Temporary phone override: 1080×2376 / density 480
- CSS viewport/DPR, phone: 360×792 / 3
- CSS viewport/DPR, tablet: 914×1292 / 2.625
- Theme preset/mode during captures: Calm/light, letto dal Theme Engine
  (`data-theme-preset=calm`, `data-theme-mode=light`)
- Theme geometry: comfortable/soft; UI large (1.15); touch target 48 CSS px;
  card radius e spacing risolti dai token a 12 CSS px
- Reduced motion: off (`prefers-reduced-motion=false`)
- Reviewer: Codex main-agent source, automated and physical audit. Il batch
  reviewer obbligatorio rimane una fase separata 5.5, come richiesto
  dall'owner.
- Geometry restoration: PASS — cold start finale a 2400×3392/density 420,
  viewport 914×1292/DPR 2.625, nessun override e auto-rotazione preservata.
- Account/secret restoration: PASS — nessuna preferenza account modificata;
  token HF mai letto o mostrato e campo manuale lasciato vuoto.

## Scenario: F3-FILTERS-COMBINED

- Route: `/settings/models/local`
- Preconditions: APK Fase 3 corrente; Calm/light; override telefono; catalogo
  Hugging Face live caricato.
- Interaction performed: attivare Chat, Orientato al codice, Q4 e Licenza
  permissiva dichiarata mantenendo tutti gli autori.
- Expected visible result: AND fra quattro facet, due risultati, gruppi
  `unsloth` e `DavidAU`, conteggi singolari corretti e controlli integri.
- Screenshot: `filters-combined-results.png`
- Screenshot bytes: 234316
- Screenshot timestamp UTC: `2026-08-05T06:52:25.5664143Z`
- Screenshot SHA-256: `af66d8d8ca275fe5422e3c3c8b312bc1f24070fbb7f0780bb35ca963fda2ee81`
- Visual inspection: PASS
- Overflow check: PASS — 0 px
- Touch target check: PASS — facet almeno 48 px
- Secret/PII check: PASS
- Defects: none

## Scenario: F3-FILTERS-EMPTY-PROVIDER-STABLE

- Route: `/settings/models/local`
- Preconditions: stessi quattro filtri attivi; provider `antirez (1)` scelto
  dalle opzioni derivate dal dataset non filtrato.
- Interaction performed: selezionare `antirez` e portare lo zero-state nel
  viewport.
- Expected visible result: zero risultati senza perdita di filtri/provider,
  messaggio contestuale e azione Reimposta filtri da 48 px.
- Screenshot: `filters-empty-provider-stable.png`
- Screenshot bytes: 238450
- Screenshot timestamp UTC: `2026-08-05T06:52:45.2926625Z`
- Screenshot SHA-256: `a16ad172c8ea03bea574a0adfd6cb466bbf91c12962959276a6e228bd41352af`
- Visual inspection: PASS
- Overflow check: PASS — 0 px
- Touch target check: PASS — reset 48 px
- Reset recovery: PASS — torna a tutti i risultati e a Tutti gli autori
- Secret/PII check: PASS
- Defects: none

## Scenario: F3-HF-ACCESS-CARD

- Route: `/settings/models/providers`
- Preconditions: APK Fase 3 corrente; Calm/light; override telefono; campo
  token vuoto.
- Interaction performed: tornare all'hub, aprire Provider e accessi e portare
  la card Hugging Face nel viewport.
- Expected visible result: una sola card HF, input password vuoto, nessun
  controllo token nella pagina Locale e nessun valore della cassaforte.
- Screenshot: `hugging-face-access-card.png`
- Screenshot bytes: 253846
- Screenshot timestamp UTC: `2026-08-05T06:51:53.5828556Z`
- Screenshot SHA-256: `48b1399f68d0616363fb8681e45472623ca90c29c012697e1b518f35c2683a39`
- Visual inspection: PASS
- Responsive header check: PASS — copy 246 px; badge in seconda riga a 360
  px e in terza colonna a 914 px
- Overflow check: PASS — 0 px a telefono e tablet
- Secret/PII check: PASS — input `type=password`, valore vuoto, zero legacy
  token input
- Defects: none

## Automated and upstream gates

- F3-RED-14 proof: PASS — prima della correzione il copy misurava 121.375 px
  e il nuovo E2E falliva; dopo la correzione supera 200 px.
- Complete unit gate: PASS — 403 file passati, 3 skipped; 3616 test passati,
  10 skipped.
- Model Lab browser gate on fresh `dist`: PASS — 11/11, inclusi filtri,
  navigazione e parità provider/modello.
- Typecheck: PASS — `vue-tsc -b --force`.
- Build/parity/chunk gate: PASS — JavaScript iniziale 599729/600000 byte;
  CSS iniziale 204327/220000 byte.
- Hugging Face live upstream gate: PASS — 3/3 su OpenAPI canonica, Qwen pin e
  non-chat pin `antirez`.
- Capacitor sync: PASS — 15 plugin.
- Android unit/build gate: PASS — 591 task Gradle; APK side-by-side installata
  con successo sul dispositivo registrato.
- Official upstream decision: ADAPT — metadati HF ufficiali normalizzati dietro
  boundary TALOS; REJECT inferenze permissive da nome/pipeline quando manca
  evidenza canonica. Nessuna dipendenza aggiunta.
- Defects: none
