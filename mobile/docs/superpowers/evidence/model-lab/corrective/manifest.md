# Model Lab physical evidence — Corrective tranche

- Tranche status: IN PROGRESS — Slice C/D/E restano aperte
- Slice A status: GREEN DEVICE + REVIEW GREEN
- Slice B status: GREEN AUTOMATION + GREEN PHYSICAL DEVICE
- Git HEAD: `11156fd1456c7289395c9e9ef8ca5a79af3a352b`
- Dirty product paths included in APK:
  - `mobile/src/App.vue`
  - `mobile/src/components/talos/models/TalosMobileCatalogProfileRow.vue`
  - `mobile/src/components/talos/models/TalosMobileHuggingFaceAccessCard.vue`
  - `mobile/src/components/talos/models/TalosMobileLocalModelRow.vue`
  - `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
  - `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue`
  - `mobile/src/components/talos/models/TalosMobileModelCatalog.vue`
  - `mobile/src/components/talos/models/TalosMobileModelLabHub.vue`
  - `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
  - `mobile/src/components/talos/settings/settingsTabs.ts`
  - `mobile/src/i18n/locales/en.ts`
  - `mobile/src/i18n/locales/it.ts`
  - `mobile/src/lib/mobileRoutes.ts`
  - `mobile/src/lib/models/browseFilters.ts`
  - `mobile/src/lib/models/huggingFace.ts`
  - `mobile/src/lib/models/licensePolicy.ts`
  - `mobile/src/lib/models/progressiveModelList.ts`
  - `mobile/src/lib/models/providerGrouping.ts`
  - `mobile/src/lib/models/readmeSummary.ts`
  - `mobile/src/screens/SettingsModelsLocalRepoScreen.vue`
  - `mobile/src/screens/SettingsModelsProvidersScreen.vue`
  - `mobile/src/stores/localModels.ts`
- Slice B product/build paths additionally included in the current APK:
  - `mobile/android/app/src/main/java/ai/talos/TalosModelTransferJob.java`
  - `mobile/android/app/src/main/java/ai/talos/TalosModelTransferPlugin.java`
  - `mobile/android/app/src/main/java/ai/talos/TalosModelTransferService.java`
  - `mobile/android/app/src/main/java/ai/talos/TalosStorageReservation.java`
  - `mobile/android/app/src/main/java/ai/talos/TalosTransferControl.java`
  - `mobile/android/app/src/main/java/ai/talos/TalosTransferDispatcher.java`
  - `mobile/android/app/src/main/java/ai/talos/TalosTransferJournal.java`
  - `mobile/android/app/src/main/java/ai/talos/TalosTransferNotification.java`
  - `mobile/android/app/src/main/java/ai/talos/TalosTransferSession.java`
  - `mobile/src/App.vue`
  - `mobile/src/components/shell/TalosMobileDownloadCenterTrigger.vue`
  - `mobile/src/components/shell/TalosMobileHeader.vue`
  - `mobile/src/components/shell/TalosMobileImmersiveChrome.vue`
  - `mobile/src/components/shell/TalosMobileSidebar.vue`
  - `mobile/src/components/shell/TalosMobileToolSheet.vue`
  - `mobile/src/components/shell/TalosTabletSidebar.vue`
  - `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
  - `mobile/src/i18n/locales/en.ts`
  - `mobile/src/i18n/locales/it.ts`
  - `mobile/src/lib/models/modelTools.ts`
  - `mobile/src/services/modelTransfer.ts`
  - `mobile/src/stores/modelTransfers.ts`
  - `mobile/scripts/verify-initial-chunk.mjs`
  - `mobile/vite.config.ts`
- APK path:
  `C:\Users\Antonino\Desktop\projects\AVM\mobile\android\app\build\outputs\apk\debug\app-debug.apk`
- Current Slice B APK bytes: 30388012
- APK SHA-256:
  `4226ab4ee32c1ff3ec34ea050ee9f6be67eb9803e36f2a34aa61d41abd3f3811`
- Current build commands: `rtk npm run build`; `rtk npx cap sync android`;
  from `mobile/android`, `rtk proxy .\gradlew.bat :app:testDebugUnitTest
  --no-daemon --console=plain` and `rtk proxy .\gradlew.bat assembleDebug
  -PtalosSideBySide --no-daemon --console=plain`
- Current APK build timestamp UTC: `2026-08-05T13:05:28.3537247Z`
- Slice A accepted APK: 30574433 bytes, SHA-256
  `7477f92d913f29bae3c8db27aa5970c9a9123f47ef7d1e1d5ea78181c32db588`
- Package/application ID: `ai.talos.dev`
- Device serial: `2ea6573c`
- Manufacturer/model: OnePlus / OPD2415
- Android/API: 16 / 36
- Physical pixels: 2400×3392
- Physical density: 420
- Temporary phone override: 1080×2376 / density 480
- CSS viewport/DPR: native 914×1292 / 2.625; phone 360×792 / 3
- Theme preset/mode: Calm / active dark rendering during both captures
- Theme Engine geometry: comfortable density
  (`--talos-density-scale=1`), soft radius
  (`--talos-radius-card=0.75rem`), large UI scale
  (`--talos-ui-scale=1.15`) and 48 CSS px touch-target token
  (`--talos-touch-target=3rem`)
- Reduced motion: off
- Reviewer: independent read-only Codex reviewer followed by Codex main-agent
  fix verification and direct original-pixel inspection of both PNGs
- Geometry restoration: PASS — final 2400×3392/density 420, viewport
  914×1292/DPR 2.625 and no ADB geometry override
- DevTools restoration: PENDING final handoff cleanup — task-owned `tcp:9222`
  is removed only after documentation verification; owner `tcp:9223` must be
  preserved.
- Account restoration: PASS — for the Slice B sidebar capture the side-by-side
  development app was set through its real Account UI to the non-identifying
  fixture `Utente`, then restored through the same UI. The restored field was
  verified enabled/settled after native geometry restoration. Production
  package `ai.talos` was never modified.
- Install semantics: PASS — `ai.talos.dev` was updated in place with
  `adb install -r -g`; `firstInstallTime=2026-08-01 23:02:40` remained stable
  and only `lastUpdateTime=2026-08-05 15:10:15` changed. No uninstall and no
  `pm clear` were used; package `ai.talos` remained untouched.

## Scenario: C45-DEVICE-SETTINGS-TABLET

- Route: `/settings`
- Preconditions: current corrective APK installed side-by-side; native tablet
  geometry; Settings category rail at scroll top; PII-safe account label
- Interaction performed: cold-start the installed app into the retained
  Settings route and inspect the side-by-side category/detail presentation
- Expected visible result: Account is the first card; Intelligence follows;
  Model Lab is the first Intelligence row above AI Defaults and Agent Tools;
  the category rail remains navigation rather than a tablist
- Screenshot: `settings-intelligence-tablet.png`
- Screenshot pixels: 2400×3392
- Screenshot bytes: 744262
- Screenshot timestamp UTC: `2026-08-05T10:13:32.9791532Z`
- Screenshot SHA-256:
  `69a20ba054c9da2477dc143a9e60af5a0867123db064714c9832f6d7c14e82b4`
- DOM/geometry proof: viewport 914×1292/DPR 2.625; destination order
  `account → models → ai_defaults → agent_tools`; nav and detail both visible
  and horizontally adjacent at x=384 CSS px; zero settings
  `tablist`/`tab`/`tabpanel`; document horizontal overflow false
- Visual inspection: PASS — hierarchy, dividers, icon alignment, text scale,
  side-by-side balance and selected Account state are coherent; no row or
  label clips or wraps incorrectly
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Scenario: C45-DEVICE-SETTINGS-PHONE

- Route: `/settings` (with routed `/settings/models` round trip verified)
- Preconditions: same installed APK; temporary 360×792 CSS viewport; category
  list at scroll top; PII-safe account label
- Interaction performed: capture the category rail, activate the real Model
  Lab row, verify the routed hub at `/settings/models`, then use physical Back
  to return to `/settings` and verify the original account DOM remounted
- Expected visible result: the phone shows one low-noise navigation list with
  Account first and the three Intelligence rows in the intended order; no
  tablet-only tab semantics or detail pane leaks into the phone layout
- Screenshot: `settings-intelligence-phone.png`
- Screenshot pixels: 1080×2376
- Screenshot bytes: 167205
- Screenshot timestamp UTC: `2026-08-05T10:14:25.5585407Z`
- Screenshot SHA-256:
  `c4e83de1d7fd486c6e871071a79c6e3aeab1ded766c7e7353521109fb9d14b57`
- DOM/geometry proof: viewport 360×792/DPR 3; destination order
  `account → models → ai_defaults → agent_tools`; zero settings
  `tablist`/`tab`/`tabpanel`; detail pane hidden; Account 328×67.4 CSS px;
  Model Lab 326×56 CSS px; list `scrollWidth=clientWidth=328`; document
  overflow 0 CSS px
- Visual inspection: PASS — Account and the complete Intelligence group are
  readable in the first viewport, with stable spacing, hierarchy and contrast
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Slice A automated gates

- Focused unit RED: PASS as a RED proof — 7 expected failures and 19 existing
  component tests green before product edits
- Focused unit GREEN: PASS — 26/26
- Review RED: PASS as a RED proof — 2 expected failures out of 22 exposed the
  fixed `min-h-14`/`gap-3`/`px-3` Settings row and static Theme Engine violation
- Review-fix GREEN: PASS — 22/22; consolidated Settings + Theme Engine suite
  29/29
- Browser RED: PASS as a RED proof — 2 expected failures against the previous
  `dist`; an earlier 12/12 run was discarded because Playwright reused that
  stale preview bundle
- Browser GREEN on rebuilt `dist`: PASS — 13/13, including phone/tablet
  Account → Model Lab → AI Defaults → Agent Tools focus order, Enter routing,
  and measured tablet side-by-side panes
- Typecheck/build/parity: PASS — integrated `vue-tsc`, Vite build and parity
  ledger; initial JavaScript 599981/600000 bytes and CSS 205142/220000 bytes
- Android JVM/build: PASS — 591 tasks, `BUILD SUCCESSFUL`
- Physical install: PASS — streamed side-by-side install of `ai.talos.dev`;
  final APK hash is the post-review-fix hash recorded above

## Scenario: C45-DEVICE-DOWNLOAD-TABLET-PAUSED

- Route: `/settings/models/local/LiquidAI/LFM2-350M-GGUF`
- Preconditions: current Slice B APK, native 914×1292 CSS viewport, two real
  pinned Hugging Face transfers persisted and paused independently
- Interaction performed: open the global Download Center from the Model Lab
  route after pausing both rows through their own controls
- Expected visible result: two distinct rows, each with its own resume and
  cancel affordance, full model label and independent progress line
- Screenshot: `download-center-tablet.png`
- Screenshot pixels/bytes: 2400×3392 / 449114
- Screenshot timestamp UTC: `2026-08-05T13:13:00.6968491Z`
- Screenshot SHA-256:
  `a802fc8b68439fbc159232aaf5e4e05a990e6b2d479029b281e3f7e6c313e393`
- Visual inspection: PASS for the Download Center — no clipping, overlap,
  missing controls or ambiguous row ownership
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: Download Center none; the oversized repository cards visible behind
  the popover are the already-open Slice C scenario `C45-RED-14`

## Scenario: C45-DEVICE-DOWNLOAD-TWO-ACTIVE

- Route: `/settings/models/local/LiquidAI/LFM2-350M-GGUF`
- Preconditions: same APK/native geometry; SmolLM2 135M F16 and LFM2 350M
  Q4_K_M resumed from the real durable journal
- Interaction performed: resume both rows from the global center and capture
  while Android owns two simultaneous user-initiated transfer jobs
- Expected visible result: both rows say `Download in corso`; SmolLM2 and LFM2
  retain separate pause/cancel controls and separate byte counters
- Screenshot: `download-center-two-active.png`
- Screenshot pixels/bytes: 2400×3392 / 462575
- Screenshot timestamp UTC: `2026-08-05T13:26:37.6468447Z`
- Screenshot SHA-256:
  `3b0b94cf37eaf9e9a4e80f715103b594a22d00301d9e9df96641c0518387fc0d`
- Native/visible proof: SmolLM2 was 62 MB / 258 MB (24%); LFM2 was
  148 KB / 219 MB (0%). JobScheduler recorded distinct jobs 118555 and 676558
  with declared download byte totals 270885952 and 229309376.
- Visual inspection: PASS for the Download Center
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: Download Center none; known pending `C45-RED-14` remains visible in
  the background Model Lab list

## Scenario: C45-DEVICE-DOWNLOAD-MODEL-LAB-CHROME

- Route: `/settings/models/local/LiquidAI/LFM2-350M-GGUF`
- Preconditions: current APK/native geometry; one real LFM2 F16 transfer active
- Interaction performed: start the 711482304-byte variant through its real
  `Scarica` button, return the repository title to view and inspect the global
  header trigger without opening the center
- Expected visible result: header download glyph and count badge `1` remain
  visible without displacing the route title or Back action
- Screenshot: `download-model-lab-running.png`
- Screenshot pixels/bytes: 2400×3392 / 400043
- Screenshot timestamp UTC: `2026-08-05T13:31:41.7447482Z`
- Screenshot SHA-256:
  `ecb7133d3606bff40596c0a7c48b9cade71d557871e630248e60efcdc5b01b29`
- Visual inspection: PASS for global chrome, badge alignment and contrast
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: known pending `C45-RED-14` — variant cards and paired full-width
  actions consume excessive vertical space on a tablet and phone

## Scenario: C45-DEVICE-DOWNLOAD-CHAT-PHONE

- Route: `/`
- Preconditions: temporary 360×792 CSS phone viewport; a real LFM2 F16
  transfer active; a fresh empty chat selected to prevent PII capture
- Interaction performed: close the Model Lab route through four real Back
  actions and inspect the immersive chat chrome
- Expected visible result: the same global download glyph and badge `1` are
  reachable between menu and chat options, with no overlap or clipped safe area
- Screenshot: `download-chat-running.png`
- Screenshot pixels/bytes: 1080×2376 / 117035
- Screenshot timestamp UTC: `2026-08-05T14:32:02.3194343Z`
- Screenshot SHA-256:
  `cb7e1c944a5e6ddabe77f5eb9f988b85ef03c863b0eb7d04e7a6cad0f7017e49`
- Visual inspection: PASS
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none in the retained screenshot. A discarded pre-capture with an
  existing scrolled conversation showed copy passing under the transparent
  immersive controls; this remains an explicit item for the planned exhaustive
  UI stress review, not a Slice B Download Center failure.

## Scenario: C45-DEVICE-DOWNLOAD-SIDEBAR-PHONE

- Route: `/`, full-width mobile sidebar open
- Preconditions: same phone viewport and active real transfer; the development
  profile was temporarily set through the Account UI to generic `Utente`
- Interaction performed: open the sidebar through the real hamburger control
  and inspect its independent global trigger
- Expected visible result: header contains TALOS title, download badge `1` and
  close action; sidebar navigation remains usable and no duplicate Model Lab
  destination appears in the tool list
- Screenshot: `download-drawer-running.png`
- Screenshot pixels/bytes: 1080×2376 / 121069
- Screenshot timestamp UTC: `2026-08-05T14:36:32.7232022Z`
- Screenshot SHA-256:
  `6314ce2ae6ffde765bb47b399908c56f4d07d775ea8aa303aa68b9a8bcbf8ada`
- Visual inspection: PASS
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS — generic capture fixture only; original profile was
  restored and verified after capture
- Defects: none

## Scenario: C45-DEVICE-DOWNLOAD-PAUSED-PHONE

- Route: `/`, fresh empty chat with Download Center open
- Preconditions: phone viewport; one real LFM2 F16 transfer paused through its
  own row at 594 MB / 679 MB
- Interaction performed: open the center from chat, pause, then inspect resume
  and cancel controls before cancelling the exact transfer
- Expected visible result: centered phone popover, natural Italian status
  `In pausa`, 88% progress, one resume and one cancel control on the same row
- Screenshot: `download-center-paused.png`
- Screenshot pixels/bytes: 1080×2376 / 158047
- Screenshot timestamp UTC: `2026-08-05T14:34:24.9455181Z`
- Screenshot SHA-256:
  `b1000be7ac34f1f7028e955bd4d24a25fb08e37b0af4db842ea8f0ab30ae6013`
- Visual inspection: PASS
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Slice B real-device functional matrix

- Real upstream pin 1: `unsloth/SmolLM2-135M-Instruct-GGUF`, revision
  `9e6855bc4be717fca1ef21360a1db4b29d5c559a`, F16 270885952 bytes,
  SHA-256 `5157ca60744d21631818364854ac8e4452e1b8022d2ab4c8a2f9cda2344afb30`.
- Real upstream pin 2: `LiquidAI/LFM2-350M-GGUF`, revision
  `8fdc9d526b7ed346b19257551b05816c7912ecc2`, Q4_K_M 229309376 bytes,
  SHA-256 `a4d000c7064bd3b2e42c6845836286a899a4e79cf1791da1a6797b58d575957d`.
- Two-active gate: PASS — both jobs ran simultaneously and completed to final
  files; the app then deleted those exact test files through its real installed
  model UI.
- Independent pause gate: PASS — one row remained paused while the other was
  visibly running.
- Independent cancel gate: PASS — cancelling LFM2 removed only that row while
  SmolLM2 advanced from 16 MB to 32 MB; SmolLM2 was then cancelled separately.
- Process-death gate: PASS — journal recorded LFM2 `running`; exact app PID
  2823 was terminated without force-stop/data clearing; JobScheduler restarted
  package work as PID 31517 and produced the final GGUF.
- Cleanup gate: PASS — no test GGUF, `.part`, `.talosdl`, transfer journal or
  pending Download Center row remained. The owner's earlier deletion of all
  pre-existing GGUF is baseline, not a TALOS defect.
- Responsive restoration: PASS — final physical geometry 2400×3392/density
  420 and CSS viewport 914×1292/DPR 2.625.

## Slice B automated gates

- Focused TypeScript Slice B: PASS — 95/95.
- Focused Android static contract: PASS — 10/10.
- Focused JVM RED/GREEN, including orphan-host recovery: PASS.
- Full Android JVM `:app:testDebugUnitTest`: PASS.
- Full TypeScript unit suite: PASS — 411 files passed, 3 skipped; 3659 tests
  passed, 10 skipped.
- Provider tool-contract review: PASS — Anthropic/OpenAI/Gemini digests were
  consciously repinned only after proving the old wording alone reproduces the
  previous three hashes and names/input schemas are unchanged.
- Typecheck: PASS.
- Production build/parity: PASS — 3419 modules; initial JS 590449/600000;
  CSS 205811/220000; parity 9/9.
- Download Center E2E on the rebuilt bundle: PASS — 5/5.
- Capacitor sync and side-by-side Gradle assemble: PASS.
- `git diff --check`: PASS before evidence documentation; rerun required after
  final handoff edits.

## Slice B closure verdict

Slice B is **GREEN and closed**. The current APK is updated in place on the
physical device, every Download Center invariant has automated and physical
evidence, all temporary model artifacts were removed by exact identity, and
the phone override was restored. The corrective tranche remains **IN
PROGRESS** because Slice C (`C45-RED-09A` through `C45-RED-15`) and Slice D/E
local-runtime compatibility work are intentionally still open. Phase 5 OAuth
remains deferred until a domain and explicit owner review are available.

## Scenario: C45-DEVICE-LOCAL-COMPAT-C3-TEMPORARY

- Route: `/`, chat reale TALOS in modalità temporanea sul tablet nativo
- Preconditions: APK side-by-side SHA-256
  `111ad3680e9056a7803a5e0214ee3cc95bc5a14ecfedd7dd832c4243034e0802`;
  fixture `LiquidAI/LFM2-350M-GGUF@8fdc9d526b7ed346b19257551b05816c7912ecc2`,
  `LFM2-350M-Q4_K_M.gguf`, 229309376 byte, SHA-256
  `a4d000c7064bd3b2e42c6845836286a899a4e79cf1791da1a6797b58d575957d`
- Interaction performed: stream seriale via ADB reverse, verifica hash nel
  target, open/template/generazione nativa; chat nuova → modalità temporanea
  verificata → selezione modello locale → invio semantico
- Expected visible result: banner «Non salvata su questo telefono», nessun chip
  memoria, risposta del body contenente `TALOS`, metadati e composer leggibili
- Screenshot: `local-compat-lfm2-chat.png`
- Screenshot pixels/bytes: 2400×3392 / 401944
- Screenshot timestamp UTC: `2026-08-05T18:12:52.8505132Z`
- Screenshot SHA-256:
  `75c40e53b39927f7db79e8c75258f9179c3cff6ea78a767e8f19466fb4027ac1`
- Native/visible proof: report `PASS`, `ui.contextTokens=4096`, marker positivo
  presente e zero marker noti di context echo
- Visual inspection at original pixels: PASS
- Overflow/clipping/overlap check: PASS
- Temporary-mode and owner-memory check: PASS
- Secret/PII check: PASS
- Postcondition: zero reverse, zero GGUF campagna, zero directory temp host;
  geometria 2400×3392/density 420
- Model-quality note: LFM2 ha esteso la frase invece di rispettare «exactly»;
  il gate misura compatibilità runtime/UI e non maschera questo limite di
  instruction-following
- Defects: none nel runtime o nella UI di questa prova
