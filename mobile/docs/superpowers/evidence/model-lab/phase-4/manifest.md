# Model Lab physical evidence — Phase 4

- Phase status: GREEN DEVICE → IMPLEMENTED
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
- Source APK path:
  `C:\Users\Antonino\Desktop\projects\AVM\mobile\android\app\build\outputs\apk\debug\app-debug.apk`
- Owner Desktop copy:
  `C:\Users\Antonino\Desktop\TALOS-mobile-phase-4-20260805.apk`
- APK bytes: 30574412
- APK SHA-256:
  `085e98242359d7bd03d5c2408eb638859f9421112ec92f8b31b264ccbb272e32`
- Desktop/source byte identity: PASS
- Build command: `npm run build`; `npx cap sync android`; from
  `mobile/android`, `.\gradlew.bat testDebugUnitTest assembleDebug
  -PtalosSideBySide --no-daemon --console=plain`
- Build timestamp UTC: `2026-08-05T08:01:08.0928758Z`
- Package/application ID: `ai.talos.dev`
- App version/version code: `1.0-dev` / `1`
- Device serial: `2ea6573c`
- Manufacturer/model: OnePlus / OPD2415
- Android/API: 16 / 36
- Physical pixels: 2400×3392
- Physical density: 420
- Temporary phone override: 1080×2376 / density 480
- CSS viewport/DPR during captures: 360×792 / 3
- Theme preset/mode during captures: Calm/system, resolved dark
  (`data-theme-preset=calm`, `data-theme-mode=dark`)
- Theme geometry: comfortable density (`--talos-density-scale=1`), soft radius
  (`--talos-radius-card=0.75rem`, 12 CSS px), large UI scale
  (`--talos-ui-scale=1.15`) and 48 CSS px touch target
  (`--talos-touch-target=3rem`)
- Reduced motion: off (`prefers-reduced-motion=false`)
- Reviewer: Codex main agent, automated plus direct inspection of every final
  physical screenshot
- Geometry restoration: PASS — final physical 2400×3392/density 420,
  viewport 914×1292/DPR 2.625, auto-rotation enabled and no ADB geometry
  override. The task-owned `tcp:9222` CDP forward was removed; a separate
  `tcp:9223` forward not created by this capture was preserved untouched.
- Account/secret restoration: PASS — no account preference changed, no token or
  personal identifier read or captured

## Scenario: F4-LOCAL-OVERVIEW

- Route: `/settings/models/local`
- Preconditions: final Phase 4 APK; Calm/system resolved dark; temporary phone
  override; real Hugging Face browse results loaded.
- Interaction performed: open Local models from the route hierarchy and scroll
  the real surface until filters, both selects and the first repository rows
  are visible.
- Expected visible result: compact phone hierarchy, stable filters/selects,
  wrapped repository names and verdicts, with no embedded repository detail or
  duplicated device card.
- Screenshot: `local-overview-360x792.png`
- Screenshot pixels: 1080×2376
- Screenshot bytes: 232411
- Screenshot timestamp UTC: `2026-08-05T08:01:53.2866552Z`
- Screenshot SHA-256:
  `70d06534d04c2d7e34ea0802cb0d124124de6313ea2bfc66c17cf4c6b6f85e98`
- DOM/geometry proof: 20 repository rows mounted; three visible in the capture;
  `scrollTop=739`, `scrollHeight=4537`, `clientHeight=692`,
  `scrollWidth=clientWidth=360`.
- Visual inspection: PASS
- Overflow check: PASS — 0 CSS px
- Touch target check: PASS — controls resolve from the 48 CSS px Theme Engine
  token
- Secret/PII check: PASS
- Defects: none

## Scenario: F4-LOCAL-REPO-DEEP-LINK

- Route:
  `/settings/models/local/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF?revision=b17cb02dd882d5b6ab62fc777ad2995f19668350`
- Preconditions: final Phase 4 APK; real pinned repository data loaded; temporary
  phone override.
- Interaction performed: open the repository from its route-native row, then
  reload the WebView on the resulting deep link before capturing.
- Expected visible result: the same repository reopens from URL; long title and
  README summary wrap; the full README is behind native disclosure; 27 variant
  sets remain actionable; exactly one header Back, no body Back and no device
  card are present.
- Screenshot: `local-repo-detail-360x792.png`
- Screenshot pixels: 1080×2376
- Screenshot bytes: 261545
- Screenshot timestamp UTC: `2026-08-05T08:03:24.6771734Z`
- Screenshot SHA-256:
  `550475f50c15e22e90db73ee855b87caef3406a9c1cdf579918b9b482c6928f9`
- DOM/geometry proof: 27 variant sets; zero body Back controls; one header Back;
  zero device cards; `scrollTop=0`, `scrollHeight=6764`,
  `scrollWidth=clientWidth=360`.
- Action collision proof: PASS — the two primary controls stack below `sm`;
  each spans CSS x=29…331 and labels remain inside their own bounds.
- Visual inspection: PASS
- Overflow check: PASS — 0 CSS px
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Scenario: F4-CATALOG-INITIAL-40

- Route: `/settings/models/catalog`
- Preconditions: final Phase 4 APK; deterministic provider discovery and real
  catalog surface; temporary phone override.
- Interaction performed: navigate to Catalog and observe the untouched first
  render before requesting another page.
- Expected visible result: exactly 40 compact profile rows out of the 479-model
  discovered catalog, stable order and a reachable **Mostra altri** action.
- Screenshot: `catalog-initial-40.png`
- Screenshot pixels: 1080×2376
- Screenshot bytes: 216503
- Screenshot timestamp UTC: `2026-08-05T08:04:18.8583468Z`
- Screenshot SHA-256:
  `884f9203db0bd290fb7cd7fb71e76722568311dd05418346e09177d408c75d9a`
- DOM/geometry proof: 40 cards; visible status `40 di 479 modelli`;
  `scrollTop=0`, `scrollHeight=9812`, `clientHeight=692`,
  `scrollWidth=clientWidth=360`; **Mostra altri** present.
- Visual inspection: PASS
- Overflow check: PASS — 0 CSS px
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Scenario: F4-CATALOG-AFTER-MORE

- Route: `/settings/models/catalog`
- Preconditions: same live page and model order as F4-CATALOG-INITIAL-40.
- Interaction performed: activate the real **Mostra altri** control once and
  return to the top of the expanded surface for capture.
- Expected visible result: exactly 80 unique rows, no duplicate or skipped ID,
  unchanged global denominator and another page still reachable.
- Screenshot: `catalog-after-more.png`
- Screenshot pixels: 1080×2376
- Screenshot bytes: 216272
- Screenshot timestamp UTC: `2026-08-05T08:05:21.8114376Z`
- Screenshot SHA-256:
  `93cef747769590529f1e764c25d6c4055e569d9818a37d15594af242171ab2cb`
- DOM/geometry proof: 80 cards and 80 unique IDs; visible status
  `80 di 479 modelli`; `scrollTop=0`, `scrollHeight=19453`,
  `clientHeight=692`, `scrollWidth=clientWidth=360`; **Mostra altri** present.
- Visual inspection: PASS
- Overflow check: PASS — 0 CSS px
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Automated, upstream and Android gates

- Permanent scenarios: PASS — F4-RED-01…15 all GREEN.
- Complete unit gate: PASS — 408 files passed, 3 skipped; 3633 tests passed,
  10 skipped. Two earlier full runs each exposed a different pre-existing chat
  controller test at the fixed 5-second timeout; both passed in isolation and
  the unchanged final source completed the official full suite cleanly.
- Model Lab browser gate on final `dist`: PASS — 13/13 with one worker,
  including deep-link reload, 40→80 progression, unique ordering, overflow,
  actions and Phase 1–3 parity.
- Typecheck: PASS — `vue-tsc -b --force` and build-integrated `vue-tsc -b`.
- Build/parity/chunk gate: PASS — initial JavaScript 599981/600000 bytes;
  initial CSS 205078/220000 bytes; gzip 193253/31361 bytes. An intermediate
  600034-byte JavaScript build was rejected and reduced without raising the
  contract limit.
- Hugging Face live upstream gate: PASS — 3/3 on canonical OpenAPI, pinned
  Qwen revision and non-chat revision; Phase 4 did not alter the wire contract.
- Capacitor sync: PASS.
- Android unit/build gate: PASS — 591 Gradle tasks, 31 executed and 560
  up-to-date; side-by-side APK installed successfully on the registered device.
- Repository hygiene: PASS — `git diff --check`; every Phase 4 PNG and manifest
  returned `git check-ignore` exit 1 with no output; all screenshot/APK hashes
  were recomputed after documentation closure.
- Official upstream decision: ADOPT Vue Router named params and native
  `details`/`summary`; ADAPT Android list-detail and deterministic 40/+40 window
  behind TALOS-owned helpers; REJECT a new virtualization or Markdown
  dependency. Installed versions and pins are recorded in the Phase 4 ledger
  and research dossier.
- Open Phase 4 defects: none.
