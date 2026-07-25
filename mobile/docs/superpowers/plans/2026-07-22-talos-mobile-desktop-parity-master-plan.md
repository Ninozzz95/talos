# TALOS Mobile Absolute Desktop Parity Master Plan

Date: 2026-07-22
Owner: Codex acting as the mobile/Kimi lane owner
Writable lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
Frozen desktop specification: `C:/Users/ninox/Desktop/AVM` at `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed`
Status: IN PROGRESS

## Objective

Deliver a standalone, local-first TALOS Android application with complete visual and functional parity with the frozen desktop product. Desktop files are read-only until this program reaches its final parity gate. A mobile capability is complete only when the final phone UI drives real local or provider behavior, persists correctly, survives reload/relaunch, handles failure honestly, and is verified in Chromium plus an Android APK/device gate.

## Frozen rules

- Never modify `C:/Users/ninox/Desktop/AVM/control-plane` during this program.
- Reuse or port the frozen desktop component, type, token, copy, and interaction contracts where portable.
- Replace desktop window geometry with the already-approved mobile rail plus tool-sheet/fullscreen presentation; preserve all capability semantics.
- Mobile remains usable without a desktop server. Optional desktop sync is a later adapter, never the source of local truth.
- Provider credentials stay in Android Keystore/iOS Keychain through the existing secure-storage adapter. They never enter Preferences, SQLite rows, logs, screenshots, tests, or telemetry.
- Every visible control must call real behavior or render an explicit unavailable state. No mock success and no decorative controls.
- Every phase receives its own exact code-level ledger and current primary-source research before product edits.

## Audited baseline

Complete and verified:

- Capacitor Android shell, top mobile rail, tool sheets, native lifecycle framing.
- Thirteen desktop themes, light/dark/system modes, Motion V6 core and procedural renderer.
- Twelve-category Settings Center with functional local Appearance, AI Defaults, Models/keys, and Shortcuts panels.
- Six-provider dynamic discovery/probe/completion, shared Model Lab/composer selection, explicit Ollama endpoint, credential-safe failure states and no-reload refresh.
- Durable local SQLite chat sessions/messages, reload-safe composer drafts, desktop-style thread rendering/actions, provider/model and effort controls, model-backed prompt enhancement, and capability-honest slash commands.
- Current P1.7 verification checkpoint: 1,057 unit tests passed plus 2 skipped,
  production build with `476034/512000` initial JavaScript bytes, 31/31 complete
  Chromium journeys, zero audit vulnerabilities and successful Capacitor sync
  with ten native plugins. Portable Temurin 21, Android Gradle tests and
  `assembleDebug` are green; the resulting APK is hashed and copied to Downloads.
  Physical-device install/launch remains open because the host `adb` exits with
  Windows status `0xC0000135` before device enumeration.

Present but incomplete:

- Browser mode now remains on the Chat surface, persists per conversation, opens
  detected URLs through the pinned official InAppBrowser adapter and renders
  truthful durable lifecycle/screenshot evidence inline. Trusted-node Playwright
  automation, privileged HMI actions and the physical-device open/close gate remain
  intentionally separate future promotion work.
- Research, Runs/Cockpit, local knowledge retrieval and most Settings categories
  remain primitive or capability-gated. Context Vault now has real local files,
  grants, attach/reuse/revoke/delete and persisted safe message labels, but not the
  future chunk retrieval/context-set layer.
- `mobile/docs/feature-parity.json` is regenerated against the frozen revision at
  each implemented checkpoint; entries remain `implemented`, not `verified`, until
  their complete device and phase-specific evidence gates pass.

## Program roadmap

### P0 - Foundation parity

Status: COMPLETE.

- Theme, Motion V6, shell, Settings information architecture, local preferences, secure key storage.

### P1 - Chat and Model Lab parity

Status: IN PROGRESS.

1. Provider/model runtime: COMPLETE for six adapters, dynamic full model discovery, probe, immediate composer refresh, provider-aware capabilities and errors. OpenRouter has a real-upstream completion gate; Gemini awaits a valid external credential.
2. Durable conversation repository: COMPLETE for direct `@capacitor-community/sqlite@8.1.0` integration, versioned schema, sessions/messages/attachments/tool activities, transactional writes, migration and recovery.
3. Thread parity: COMPLETE for markdown, message state, status rows, actions/overflow,
   sensitive-content disclosure, copy/retry/edit/delete/export and scroll anchoring;
   tool approvals/evidence continue under item 7.
4. Composer parity: provider/model combobox, effort/thinking, model-backed prompt
   enhancer, slash commands, compact phone layout, safe-area and durable draft are
   COMPLETE. Context/file ingestion and browser mode continue under items 6-7.
5. Model Lab parity: COMPLETE for dynamic provider catalogs, search/filter, model
   compatibility and provenance, exact completion probe state, composer visibility,
   display-name overrides, manual recovery, advanced options, persisted timeout and
   endpoint configuration for Ollama/OpenAI-compatible servers, and the shared Chat
   quick picker without reload.
6. Attachment/Vault bridge: COMPLETE for the system picker, private durable
   bytes and metadata, bounded PDF/DOCX/text extraction, image/file provider
   parts, explicit grants, message binding, Vault reuse/revoke/delete and reload.
   Encrypted Vault, OCR and local RAG remain correctly assigned to P2.
7. Browser/evidence consumer UI: COMPLETE for local manual Browse, durable
   lifecycle evidence, screenshot/lightbox rendering, dev-only raw evidence,
   persisted confirmation policy and the pinned InAppBrowser boundary. Trusted-node
   automation and privileged HMI actions remain assigned to their security phase.
8. Natural multi-turn Chromium journeys, reload, offline/error,
   320/360/390/tablet gates, Capacitor sync and Gradle APK build: COMPLETE.
   Physical-device install/launch/logcat remains the open promotion gate because
   `adb` cannot start on this host (`0xC0000135`).

### P2 - Context Vault and local knowledge

- Local documents, folders, context sets, chunk metadata, retrieval and citations.
- Direct upstream OCR/extraction integrations selected in their own researched ledger.
- File grants, source trust labels, deletion/export and attachment-to-Vault continuity.

### P3 - Runtime Cockpit, runs and evidence

- Persisted local runs, node timeline/DAG, inspector, trace replay, recovery, artifacts and AVM ON/OFF evidence.
- Zethos/native runtime contracts and remote trusted-node adapter without making either mandatory for basic app use.

### P4 - Research and productivity stations

- Deep Research queue, sources, claims, graph and artifacts.
- Tasks, Notes, Calendar, Email drafts, Memory and Skills with the same trust/policy semantics as desktop.
- External writes remain draft-first and capability/confirmation gated.

### P5 - Forge, models and local inference

- Forge catalog/download manager, Hugging Face and Ollama direct integrations, hardware-fit and runtime health.
- Local model serve/inference through the selected Android runtime, with real-device benchmarks and rollback.

### P6 - Doctor, tools, integrations and optional sync

- Doctor, tool/connector registry, Google Workspace, account/system administration allowed on mobile.
- Optional encrypted desktop-mobile synchronization with deterministic conflict handling; local operation remains authoritative when disconnected.

### P7 - Absolute parity promotion

- Regenerate the feature-parity contract against desktop `5dd0c0b` and prove every entry `available` or honestly blocked by a desktop capability that is itself unavailable.
- Full unit, typecheck/build, shardable E2E, accessibility, reduced-motion, reload/relaunch, airplane-mode and failure corpus.
- Capacitor sync, Android Gradle test/assemble, APK signature/hash, physical-device install/launch/logcat and human visual review.
- No parity claim until all permanent gates are green and the user approves the final phone experience.
- Keep the initial JavaScript chunk below the enforced 512,000-byte production
  budget; the P1.7 checkpoint measures 476,034 bytes without weakening provider,
  Settings, Browser evidence or first-paint behavior.

## Verification cadence

- Inner loop: named RED test, minimal implementation, focused GREEN.
- Slice gate: affected unit corpus plus build and focused Playwright on a persistent preview server.
- Milestone gate: full mobile unit/E2E, `git diff --check`, cap sync, Gradle APK.
- Promotion gate: physical device plus human journey using natural language, typos, contextual follow-ups, reload and error recovery.

## Rollback

Each phase is isolated by mobile-owned adapters and versioned persistence schemas. Rollback removes the phase adapter/UI and returns to the prior schema reader without deleting user data. Desktop remains untouched throughout, so it is always an independent reference and recovery surface.
