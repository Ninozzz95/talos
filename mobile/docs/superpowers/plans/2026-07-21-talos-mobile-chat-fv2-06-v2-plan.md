# TALOS Mobile Chat + FV2-06.0 V2 Implementation Plan

> **For agentic workers:** execute inline and linearly. The main GPT5 agent writes product code. Review agents may only run focused tests or perform mechanical review. Steps use checkbox syntax for tracking.

**Goal:** Deliver the first non-placeholder standalone mobile screen with desktop-parity Chat, model selection, model-conditional effort, thinking control and Model Lab catalog presentation.

**Architecture:** Controlled Vue mobile views consume Kimi-owned local repository state through strict view models and emit typed intents. GPT5 does not modify router, shared contracts, design-token package, persistent architecture or desktop/backend files. Kimi performs the final route/repository wiring and parity review.

**Tech stack:** Vue 3.5.40, TypeScript 5.9.3, Vite 7.3.6, Vitest 4.1.10, Playwright 1.61.1, Capacitor 8.4.2, Tailwind 4.3.3, Lucide Vue 1.25.0, existing checked-in shadcn-vue Button/Dialog/Drawer primitives.

## Global Constraints

- Local-first and standalone by default; no Laravel/control-plane runtime dependency.
- Desktop `main@19d854ec` is the visual and behavioral source of truth.
- Use shared design-token CSS variables; do not introduce a second palette.
- No provider secrets in source, Preferences or browser storage.
- No fake success, fake evidence, fake catalog data or silent provider fallback.
- Touch targets are at least 44x44 CSS pixels.
- Effort is derived from profile `effort_levels`; never claim unsupported levels.
- Kimi owns `mobileRoutes.ts`, router, `App.vue`, Preferences, contracts, tokens and theme.
- Zero mutating Git operations; the user owns commits.

---

### Task 1: Freeze view-model and effort/provider presentation contracts

**Files:**
- Create: `mobile/src/components/chat/mobileChatTypes.ts`
- Create: `mobile/src/lib/mobileEffort.ts`
- Create: `mobile/src/lib/mobileProviders.ts`
- Create: `mobile/tests/unit/lib/mobileEffort.test.ts`
- Create: `mobile/tests/unit/lib/mobileProviders.test.ts`

**Produces:**
- `TalosMobileProviderId`
- `TalosMobileModelStatus`
- `TalosMobileModelProfileView`
- `TalosMobileRoutingProfileView`
- `TalosMobileMessageView`
- `TalosMobileEffortLevel`
- `TALOS_MOBILE_EFFORT_ORDER`
- `mobileEffortLadderFromLevels(levels)`
- `clampMobileEffort(levels, desired)`
- `mobileEffortLabel(level)`
- `talosMobileProviderById(id)`
- `talosMobileModelProfileIsCallable(profile)`

- [ ] **Step 1: Write RED effort tests**

Cover canonical ordering, duplicate removal, unknown-level rejection, implicit Off, clamp-to-high, clamp-to-highest and empty-to-Off.

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- tests/unit/lib/mobileEffort.test.ts tests/unit/lib/mobileProviders.test.ts`  
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement minimal pure utilities and exact view types**

No I/O, no storage, no network and no imports from desktop runtime.

- [ ] **Step 4: Run GREEN**

Run the same command. Expected: all tests PASS.

### Task 2: Port exact provider identity assets and icon component

**Files:**
- Create: `mobile/src/assets/providers/anthropic.svg`
- Create: `mobile/src/assets/providers/deepseek.svg`
- Create: `mobile/src/assets/providers/gemini.svg`
- Create: `mobile/src/assets/providers/ollama.svg`
- Create: `mobile/src/assets/providers/openai.svg`
- Create: `mobile/src/assets/providers/openrouter.svg`
- Create: `mobile/src/components/models/TalosMobileProviderIcon.vue`
- Create: `mobile/tests/unit/models/TalosMobileProviderIcon.test.ts`

**Consumes:** `talosMobileProviderById`.

- [ ] **Step 1: Write RED icon test**

Require exact accessible provider name, checked-in SVG source for six known providers and controlled fallback for unknown values.

- [ ] **Step 2: Run RED**

Run: `npm run test:unit -- tests/unit/models/TalosMobileProviderIcon.test.ts`  
Expected: FAIL because component/assets do not exist.

- [ ] **Step 3: Copy provider SVG bytes from the current desktop source**

Source: `control-plane/resources/images/providers/*.svg`. Preserve bytes and do not fetch mutable remote logos.

- [ ] **Step 4: Implement icon component**

Use the shared semantic palette and the desktop provider label/tone mapping. Keep the image decorative inside one named `role=img` wrapper.

- [ ] **Step 5: Run GREEN and asset hash comparison**

Run focused Vitest plus SHA-256 comparison between six desktop and mobile SVG pairs. Expected: tests PASS and hashes match.

### Task 3: Build model and effort selectors

**Files:**
- Create: `mobile/src/components/chat/TalosMobileComposerModelPicker.vue`
- Create: `mobile/src/components/chat/TalosMobileEffortPicker.vue`
- Create: `mobile/tests/unit/chat/TalosMobileComposerModelPicker.test.ts`
- Create: `mobile/tests/unit/chat/TalosMobileEffortPicker.test.ts`

**Consumes:** view models, provider icon and effort utilities.  
**Produces events:** `selectModelProfile(profileId)`, `selectModelRoutingProfile(routeId)`, `selectEffort(level)`, `selectThinking(value)` and `requestClose()`.

- [ ] **Step 1: Write RED listbox tests**

Require no native select, named listbox, grouped Auto/Models sections, disabled uncallable rows, `aria-selected`, Arrow Up/Down wrap, Home/End and Escape close intent.

- [ ] **Step 2: Write RED effort tests**

Require profile-derived levels, implicit Off, pressed selected state, no thinking switch when unsupported and a working switch when supported.

- [ ] **Step 3: Run RED**

Run both focused files. Expected: module-not-found failures.

- [ ] **Step 4: Port desktop behavior with mobile containment**

Use the current desktop component labels and hierarchy. Keep each row/choice at least 44px high and constrain scrolling inside the popover/sheet surface.

- [ ] **Step 5: Run GREEN**

Expected: all selector tests PASS.

### Task 4: Build the mobile composer

**Files:**
- Create: `mobile/src/components/chat/TalosMobileComposer.vue`
- Create: `mobile/tests/unit/chat/TalosMobileComposer.test.ts`

**Consumes:** model/effort selectors and controlled profile state.  
**Produces events:** `update:prompt`, `send`, model/route/effort/thinking selection, `attach`, `openContext`, `openModelLab`.

- [ ] **Step 1: Write RED composer tests**

Cover icon-only controls, 44px targets, multiline draft growth, send disabled reason, Enter send vs Shift+Enter newline, model picker opening, effort picker opening, focus restoration and no compact-composer control.

- [ ] **Step 2: Run RED**

Expected: component missing.

- [ ] **Step 3: Implement transient interaction state only**

Do not clear the controlled draft until the owner supplies a successful persisted outcome. Do not open configuration panels automatically on send failure.

- [ ] **Step 4: Run GREEN**

Expected: composer tests PASS.

### Task 5: Build message thread and Chat screen

**Files:**
- Create: `mobile/src/components/chat/TalosMobileMessageList.vue`
- Create: `mobile/src/screens/TalosMobileChatScreen.vue`
- Create: `mobile/tests/unit/chat/TalosMobileMessageList.test.ts`
- Create: `mobile/tests/unit/chat/TalosMobileChatScreen.test.ts`

**Consumes:** controlled messages, composer state and selected model state.  
**Produces:** one complete screen component ready for Kimi route/repository wiring.

- [ ] **Step 1: Write RED message tests**

Cover empty state, user/assistant/system semantics, controlled error, processing state, stable message keys and no browser/evidence controls when evidence data is absent.

- [ ] **Step 2: Write RED screen tests**

Cover thread/composer composition, no horizontal overflow at 320 and 375 CSS pixels, last-message visibility region, composer above safe-area/bottom-nav padding, event forwarding and no desktop-server request on mount.

- [ ] **Step 3: Run RED**

Expected: missing components.

- [ ] **Step 4: Implement minimal screen composition**

Use full-height flex containment with internal thread scrolling. Keep the composer stable while the thread grows.

- [ ] **Step 5: Run GREEN**

Expected: message and screen suites PASS.

### Task 6: Build the mobile Model Lab catalog surface

**Files:**
- Create: `mobile/src/components/models/TalosMobileModelCatalog.vue`
- Create: `mobile/tests/unit/models/TalosMobileModelCatalog.test.ts`

**Consumes:** profile views and provider icons.  
**Produces events:** `refresh`, `toggleComposerVisibility(profileId, visible)`.

- [ ] **Step 1: Write RED catalog tests**

Cover provider filter, search, readiness badge, capability chips, effort ladder, thinking disclosure, visibility toggle, empty/loading/error states and no active create-secret form.

- [ ] **Step 2: Run RED**

Expected: component missing.

- [ ] **Step 3: Implement mobile single-column catalog**

Mirror desktop content and semantics; adapt only layout width and touch containment.

- [ ] **Step 4: Run GREEN**

Expected: catalog suite PASS.

### Task 7: GPT5 quality gate before Kimi integration

**Files:** all GPT5-owned files above.

- [ ] Run all new unit tests.
- [ ] Run `npm run test:unit` for the complete mobile unit suite.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` without staging or committing.
- [ ] Compare provider SVG hashes with desktop source.
- [ ] Record exact pass/fail counts and changed files in the ledger.

### Task 8: Kimi route/repository integration checkpoint

**Kimi-owned files, not edited by GPT5:**
- `mobile/src/lib/mobileRoutes.ts`
- Kimi-selected local repository/store adapters
- shared contract/token files only if parity review requires a frozen amendment

- [ ] Kimi maps Chat route to `TalosMobileChatScreen`.
- [ ] Kimi maps canonical local model/session repositories into the view props/events.
- [ ] Kimi confirms no server dependency and no secret in Preferences.
- [ ] Kimi runs parity review against desktop revision and returns exact findings.
- [ ] GPT5 addresses findings only within the owned screen/local-presentation files.

### Task 9: Integrated E2E, native assets and APK checkpoint

**Files:**
- Create after Kimi route wiring: `mobile/tests/e2e/mobile-chat-model-effort.e2e.spec.ts`
- Modify within GPT5 native ownership: `mobile/assets/icon-background.svg`
- Modify within GPT5 native ownership: `mobile/assets/icon-foreground.svg`
- Modify within GPT5 native ownership: `mobile/assets/splash.svg`
- Generated by accepted tooling: Android launcher/splash resources under `mobile/android/app/src/main/res/**`

- [ ] Write integrated E2E first and observe RED against any remaining placeholder route.
- [ ] Verify Chat renders, model picker works, effort follows selected profile, thinking gating works, draft survives local screen remount and no server request occurs.
- [ ] Replace generic assets with the canonical `logo-short.svg` composition through the accepted Android-assets transaction tool.
- [ ] Run `npm run build`.
- [ ] Run `npx cap sync android`.
- [ ] Run Gradle `assembleDebug` with the isolated JDK 21/Android SDK environment.
- [ ] Verify package, signature, byte size and SHA-256.
- [ ] When ADB becomes available: install, launch `ai.talos/.MainActivity`, inspect logcat and visually verify Chat at 320/375-equivalent widths.
- [ ] If no device is available, report APK integrity GREEN and device gate OPEN; never claim launch verification.

## Execution order after checkpoint 1

After Kimi accepts Chat/FV2-06.0, repeat the same spec-ledger-screen-review-APK loop in this order: Context/Vault, Runs/Cockpit, Research, Settings/Theme, Tasks/Notes/Calendar, Memory/Skills, Model Lab runtime/downloads, Doctor/Tools/Benchmarks, then capability-gated Browser. Browser implementation remains Codex-security-owned; mobile only consumes its approved contracts.
