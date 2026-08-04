# Model Lab physical evidence — Phase 1

- Phase status: GREEN DEVICE — replacement APK after F1-RED-11…17, both
  physical captures visually accepted
- Git HEAD: `f7a88a599e48cb63727a4fc12f673cbecf9615fd`
- Dirty paths included in APK:
  - `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
  - `mobile/src/components/talos/models/TalosModelFitBar.vue`
  - `mobile/src/i18n/locales/en.ts`
  - `mobile/src/i18n/locales/it.ts`
  - `mobile/src/lib/models/browseFilters.ts`
  - `mobile/src/lib/models/browseVariant.ts`
  - `mobile/src/lib/models/catalogue.ts`
  - `mobile/src/lib/models/fit.ts`
  - `mobile/src/lib/models/fitBadge.ts`
  - `mobile/src/lib/models/huggingFace.ts`
  - `mobile/src/lib/models/modelTools.ts`
  - `mobile/src/lib/models/sizeFromName.ts`
  - `mobile/src/services/deviceCapacity.ts`
- APK path: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- APK SHA-256: `94b68dbfe2ede416d321c91579e0c7945b2f72440d5c1bd4cbc4a8bb5174dc3f`
- APK bytes: 31,102,688
- Build command: `npm run build`; `npx.cmd cap sync android`; `android\\gradlew.bat testDebugUnitTest assembleDebug -PtalosSideBySide --no-daemon --console=plain`
- Build timestamp UTC: `2026-08-04T21:23:32.6810981Z`
- Package/application ID: `ai.talos.dev`
- Device serial: `2ea6573c`
- Manufacturer/model: OnePlus OPD2415
- Android/API: 16 / 36
- Physical pixels: 2400x3392
- Density: 420 physical / 480 temporary phone override
- CSS viewport/DPR: 360x792 / 3
- Theme preset/mode: `calm` / dark
- Density/radius/UI scale: comfortable (`1`) / soft (`0.75rem`) / large (`1.15`)
- Reduced motion: off
- Reviewer: Codex main agent, original-pixel visual inspection
- Native restoration: PASS — 2400x3392, density 420, automatic rotation 1,
  user rotation 0 reconfirmed after both captures

## Scenario: F1-RED-02-storage-precedes-memory

- Route: `/settings?tab=models`
- Preconditions: side-by-side APK above; 38 GB allocatable storage and 3.9 GB
  free RAM reported by the physical device; temporary 360x792 phone viewport;
  Italian locale; Hugging Face network available.
- Interaction performed: opened Hugging Face search, entered
  `bartowski/Meta-Llama-3.1-70B-Instruct-GGUF`, pressed Search and brought the
  only result fully into view.
- Expected visible result: the representative Q4 estimate is about 39 GB and
  the result says **Spazio insufficiente**, with the fit track judged against
  storage rather than RAM.
- Screenshot: `storage-first.png`
- Screenshot timestamp UTC: `2026-08-04T21:26:44.7637984Z`
- Screenshot pixels: 1080x2376
- Screenshot SHA-256: `7515693d91baec4ec6f528782bce13265ed9cee8a41765d03c30a4c9659fca52`
- Visual inspection: PASS
- Overflow check: PASS — the result card and verdict remain inside the viewport;
  repository ellipsis and the horizontally scrollable filter rail are
  intentional responsive treatments.
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Scenario: F1-RED-03-memory-after-storage

- Route: `/settings?tab=models`
- Preconditions: same build, device, locale and temporary viewport; 38 GB
  allocatable storage is sufficient for the representative file plus the
  product reserve, while 4.1 GB free RAM is not.
- Interaction performed: replaced the query with
  `bartowski/Qwen2.5-32B-Instruct-GGUF`, pressed Search and brought the only
  result fully into view.
- Expected visible result: the representative Q4 estimate is about 18 GB and
  the result says **RAM insufficiente**, with the fit track judged against
  memory only after the storage gate passes.
- Screenshot: `memory-after-storage.png`
- Screenshot timestamp UTC: `2026-08-04T21:27:07.2440270Z`
- Screenshot pixels: 1080x2376
- Screenshot SHA-256: `0282e9eab65002c9de2b6a636aa2eee5f28a3dc7577c55f75f9c679d0912e466`
- Visual inspection: PASS
- Overflow check: PASS — the result card and verdict remain inside the viewport;
  repository ellipsis and the horizontally scrollable filter rail are
  intentional responsive treatments. The verdict span ends at 323 CSS px
  inside the card edge at 336 CSS px at the owner's large font scale.
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none
