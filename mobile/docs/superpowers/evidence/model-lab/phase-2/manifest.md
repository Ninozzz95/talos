# Model Lab physical evidence — Phase 2

- Phase status: GREEN DEVICE
- Git HEAD: `3b6a4fbc2e051b5f2769eed4176353c91174b50b`
- Dirty paths included in APK:
  - `mobile/packages/design-tokens/src/index.ts`
  - `mobile/src/App.vue`
  - `mobile/src/components/shell/TalosMobileSidebar.vue`
  - `mobile/src/components/talos/models/TalosMobileDeviceCapacityCard.vue`
  - `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
  - `mobile/src/components/talos/models/TalosMobileModelAdvancedOptions.vue`
  - `mobile/src/components/talos/models/TalosMobileModelCatalog.vue`
  - `mobile/src/components/talos/models/TalosMobileModelLabHub.vue`
  - `mobile/src/components/talos/models/TalosMobileProviderRuntimePanel.vue`
  - `mobile/src/components/talos/models/TalosModelFitBar.vue`
  - `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
  - `mobile/src/components/talos/settings/TalosMobileSettingsModelsPanel.vue` (deleted)
  - `mobile/src/components/talos/settings/settingsTabs.ts`
  - `mobile/src/components/talos/ui/TalosRowActions.vue`
  - `mobile/src/i18n/locales/en.ts`
  - `mobile/src/i18n/locales/it.ts`
  - `mobile/src/lib/chat/providers/openAiCompatibleAdapter.ts`
  - `mobile/src/lib/mobileRoutes.ts`
  - `mobile/src/lib/navigation/viewRegistry.ts`
  - `mobile/src/lib/talosThemes.ts`
  - `mobile/src/screens/ChatScreen.vue`
  - `mobile/src/screens/SettingsModelsCatalogScreen.vue`
  - `mobile/src/screens/SettingsModelsLocalScreen.vue`
  - `mobile/src/screens/SettingsModelsProvidersScreen.vue`
  - `mobile/src/screens/SettingsModelsScreen.vue`
  - `mobile/src/screens/SettingsScreen.vue`
  - `mobile/src/services/nativeFraming.ts`
  - `mobile/src/stores/theme.ts`
  - `mobile/src/style.css`
  - `mobile/src/theme/applyDesignTokens.ts`
- APK path: `C:\Users\Antonino\Desktop\projects\AVM\mobile\android\app\build\outputs\apk\debug\app-debug.apk`
- APK bytes: 31103284
- APK SHA-256: `b6a24bc695127aaf912719f6a4d102e3f484aef71ddecc8d73fd32438406aa3d`
- Build command: `npm.cmd run build`; `npx.cmd cap sync android`; from `mobile/android`, `.\gradlew.bat testDebugUnitTest assembleDebug -PtalosSideBySide --no-daemon --console=plain`
- Build timestamp UTC: `2026-08-05T05:51:21.7394103Z`
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
- Theme preset/mode: Paper/light; Terminal/dark; Calm/dark
- Density/radius/UI scale: Paper spacious/balanced; Terminal compact/sharp; Calm comfortable/soft; UI large (1.15)
- Reduced motion: off (`prefers-reduced-motion=false`; animation scales non-zero)
- Reviewer: Codex main-agent source/automated/physical audit. Dedicated reviewer attempts `019fcf25-dd5e-7091-80e9-a4d1c938ef26` and `019fcf25-debe-7eb1-9caa-e1c51d365027` produced no output because the workspace credit gate left them in `pending_init`; both were closed. The mandatory Phase 5.5 reviewer batch remains separate.
- Geometry restoration: PASS — final `wm size` 2400×3392 and `wm density` 420, with no override.
- Account restoration: PASS — the generic capture-only account was replaced with the original preference, and the session restore sentinel was removed before cold start.

## Scenario: F2-HUB-PAPER-PHONE

- Route: `/settings/models`
- Preconditions: current Phase 2 APK; Paper preset; light mode; temporary phone override; measured physical device.
- Interaction performed: open Settings, tap the single Model Lab card, inspect the full hub.
- Expected visible result: one device card above exactly three routed destination cards; no Model Lab tab strip; dark Android status icons over the light surface.
- Screenshot: `hub-paper-light.png`
- Screenshot bytes: 250030
- Screenshot timestamp UTC: `2026-08-05T05:59:05.1848239Z`
- Screenshot SHA-256: `5ca68f13ed945f72e50ca3bb0cd4c02e4c80ae0b0ee2ea1a90b5d96ca8258afe`
- Visual inspection: PASS
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Scenario: F2-HUB-TERMINAL-PHONE

- Route: `/settings/models`
- Preconditions: current Phase 2 APK; Terminal preset; dark mode; temporary phone override.
- Interaction performed: switch theme through Appearance, dismiss the launcher-icon choice without changing the icon, then reopen Model Lab.
- Expected visible result: the same hierarchy rendered with compact spacing, sharp radii, terminal typography and light Android status icons.
- Screenshot: `hub-terminal-dark.png`
- Screenshot bytes: 209291
- Screenshot timestamp UTC: `2026-08-05T05:56:23.4050514Z`
- Screenshot SHA-256: `e7b84489ee8ad2c670d9d4db993e4d8310e1cc74c22d0bbb967ca2e1078fb00f`
- Visual inspection: PASS
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Scenario: F2-PROVIDERS-NO-DEVICE-DUPLICATE

- Route: `/settings/models/providers`
- Preconditions: current Phase 2 APK; Terminal/dark; temporary phone override; provider credentials already present in secure storage.
- Interaction performed: tap `Provider e accessi` from the hub and inspect the page without expanding a credential row.
- Expected visible result: provider status rows and advanced manual models; zero `talos-model-lab-device` cards and no credential value.
- Screenshot: `providers-no-device-duplicate.png`
- Screenshot bytes: 205871
- Screenshot timestamp UTC: `2026-08-05T05:58:27.3029610Z`
- Screenshot SHA-256: `86ea4f6d7777ed7ab4e5793834602a273b8b3946e4b1d1701c41f173985a71eb`
- Visual inspection: PASS
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Scenario: F2-SIDEBAR-CANONICAL-PARENT

- Route: `/`
- Preconditions: current Phase 2 APK; Calm/dark; temporary phone override; generic capture-only account.
- Interaction performed: open the complete navigation drawer.
- Expected visible result: Settings remains reachable; there is no standalone Model Lab item at the same hierarchy level.
- Screenshot: `sidebar-without-model-lab.png`
- Screenshot bytes: 121138
- Screenshot timestamp UTC: `2026-08-05T05:54:08.9474250Z`
- Screenshot SHA-256: `6e598f261529d3f4402332e1d4081f93dd8ab4bc74d8df2c71b077646d49b542`
- Visual inspection: PASS
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Scenario: F2-SETTINGS-SINGLE-MODEL-LAB-ENTRY

- Route: `/settings`
- Preconditions: current Phase 2 APK; Calm/dark; temporary phone override; generic capture-only account.
- Interaction performed: open Settings from the drawer and inspect the category hierarchy.
- Expected visible result: exactly one `Laboratorio modelli` card above the Settings tablist; no second Model Lab tab or peer drawer destination.
- Screenshot: `settings-single-model-lab-entry.png`
- Screenshot bytes: 171810
- Screenshot timestamp UTC: `2026-08-05T05:54:32.6932651Z`
- Screenshot SHA-256: `e0ed64bdbe4ebe7a066673b556cbb86d8b0ad63befa3d93d7a5b2d38a674982d`
- Visual inspection: PASS
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Scenario: F2-HUB-PAPER-TABLET-COLD-START

- Route: `/settings/models`
- Preconditions: current Phase 2 APK; Paper/light; native 2400×3392/density 420 restored; cold start completed; original account preference restored.
- Interaction performed: launch the app from a stopped process, open the single Settings Model Lab card, and inspect the hub at native tablet geometry.
- Expected visible result: wide responsive hub without clipping, one device card, three destination cards and dark status icons over Paper/light.
- Screenshot: `hub-tablet-native.png`
- Screenshot bytes: 235488
- Screenshot timestamp UTC: `2026-08-05T06:00:52.5968369Z`
- Screenshot SHA-256: `185f58f48baaaaf4c51b37d4febc36a00a1dc87a9c3ef5be304278a928c0eaa2`
- Visual inspection: PASS
- Overflow check: PASS
- Touch target check: PASS
- Secret/PII check: PASS
- Defects: none

## Automated and upstream gates

- Focused unit gate: PASS — 71/71.
- Extended browser gate on fresh `dist`: PASS — 37/37.
- Complete unit gate: PASS — 401 files passed, 3 skipped; 3593 tests passed, 9 skipped.
- Typecheck/build/parity/chunk gate: PASS — initial JavaScript 599681/600000 bytes; initial CSS 203928/220000 bytes.
- Capacitor sync: PASS — 15 plugins.
- Android unit/build gate: PASS — 591 Gradle tasks; APK installed successfully on the recorded device.
- Official upstream decision: ADAPT — Android top-level navigation and Settings hierarchy, WAI-ARIA tab semantics, Capacitor 8 status-bar contract and Android edge-to-edge guidance are pinned in the Phase 2 research dossier.
- Defects: none
