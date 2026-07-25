# TALOS Mobile Composer Durable State Ledger

Status: COMPLETE / ALL PLANNED GATES GREEN

Date: 2026-07-22

Research dossier: `docs/superpowers/research/2026-07-22-mobile-composer-durable-state-research.md`

Desktop reference is read-only at `C:/Users/ninox/Desktop/AVM` pinned to `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed`.

## Scope

This is mobile parity sub-slice P1.4-A. It makes the existing composer state durable and its current controls honest. It does not implement prompt enhancement, slash commands, Vault ingestion, context selection, or browser mode; those remain separately gated P1.4-B/P1.6/P1.7 slices.

## Exact product file ownership

Create:

1. `mobile/src/composables/useTalosMobileComposerDraft.ts`

Modify:

2. `mobile/src/repositories/chatRepository.ts`
3. `mobile/src/repositories/memoryChatRepository.ts`
4. `mobile/src/repositories/sqliteChatRepository.ts`
5. `mobile/src/repositories/lazyChatRepository.ts`
6. `mobile/src/stores/chat.ts`
7. `mobile/src/stores/settings.ts`
8. `mobile/src/stores/chatController.ts`
9. `mobile/src/components/chat/TalosMobileComposer.vue`
10. `mobile/src/components/chat/TalosMobileComposerModelPicker.vue`
11. `mobile/src/screens/ChatScreen.vue`
12. `mobile/src/screens/SettingsScreen.vue`
13. `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`

No desktop, backend, validator, package, lockfile, Android native, or design-token file is owned by this slice.

## Exact test file ownership

Create:

1. `mobile/tests/unit/composables/useTalosMobileComposerDraft.test.ts`
2. `mobile/tests/e2e/mobile-composer-state.e2e.spec.ts`

Modify:

3. `mobile/tests/unit/repositories/chatRepository.contract.ts`
4. `mobile/tests/unit/repositories/sqliteChatRepository.test.ts`
5. `mobile/tests/unit/theme/settingsStore.test.ts`
6. `mobile/tests/unit/chat/chatStore.test.ts`
7. `mobile/tests/unit/chat/chatController.test.ts`
8. `mobile/tests/unit/chat/TalosMobileComposer.test.ts`
9. `mobile/tests/unit/chat/TalosMobileComposerModelPicker.test.ts`
10. `mobile/tests/unit/screens/chatScreen.test.ts`
11. `mobile/tests/unit/screens/settingsScreen.test.ts`
12. `mobile/tests/unit/shell/appShell.test.ts`
13. `mobile/tests/unit/router/routeWiring.test.ts`

## Public symbols and compatibility contracts

1. `TalosChatRepository.loadComposerDraft(scopeId)` returns the canonical draft or an empty string.
2. `TalosChatRepository.saveComposerDraft(scopeId, draft)` upserts a non-empty draft and deletes an empty draft.
3. `ChatStore.loadComposerDraft`, `saveComposerDraft`, `setActiveModelProfile` expose the durable operations without leaking SQL.
4. `TalosComposerDefaults` contains `model_profile_id`, `effort`, and `thinking`.
5. `SettingsStore.setComposerDefaults(patch)` sanitizes and persists lightweight defaults.
6. `useTalosMobileComposerDraft(options)` exposes controlled `prompt`, `updatePrompt`, `activateScope`, `flush`, `clear`, `dispose`, and an actionable `error` ref.
7. `ChatController.refreshConfiguredProviders()` refreshes configured catalogs without opening Settings or reloading the app.
8. `ChatController.selectModel`, `selectEffort`, and `setThinking` update reactive state immediately and return a persistence promise.
9. Existing component events remain compatible. New events are `refreshModels` and `openModelLab`; file/context controls gain availability/reason props and remain disabled until real bridges land.
10. Settings accepts a `tab=models` deep link and opens the Models detail pane on mobile.

## RED scenarios

### Repository and state

- COMPOSER-01 `chatRepository.contract.ts::persists independent bounded drafts and deletes empty drafts`
  - Expected RED: repository methods do not exist.
- COMPOSER-02 `sqliteChatRepository.test.ts::stores composer drafts in talos_chat_state without a schema migration`
  - Expected RED: no SQL draft boundary exists.
- COMPOSER-03 `settingsStore.test.ts::sanitizes and persists composer defaults`
  - Expected RED: settings schema has no composer defaults.
- COMPOSER-04 `settingsStore.test.ts::fails malformed composer defaults closed`
  - Expected RED: malformed values are not parsed because the subtree is absent.

### Controller and draft lifecycle

- COMPOSER-05 `chatController.test.ts::restores model effort and thinking without a reload`
  - Expected RED: all three values start from in-memory defaults.
- COMPOSER-06 `chatController.test.ts::persists a model change immediately into the active session and global default`
  - Expected RED: selection is synchronous memory-only until send.
- COMPOSER-07 `chatController.test.ts::initializes exactly once across Chat and Model Lab mounts`
  - Expected RED: duplicate `init()` calls repeat provider discovery.
- COMPOSER-08 `useTalosMobileComposerDraft.test.ts::restores independent drafts when switching sessions`
  - Expected RED: composable absent.
- COMPOSER-09 `useTalosMobileComposerDraft.test.ts::drops a superseded async read and flushes before a scope switch`
  - Expected RED: composable absent.
- COMPOSER-10 `useTalosMobileComposerDraft.test.ts::reports a write failure without discarding the typed draft`
  - Expected RED: composable absent.
- COMPOSER-11 `chatStore.test.ts::returns whether a user prompt became durable`
  - Expected RED: `send()` returns `void` for both accepted and rejected writes.

### Human-visible UI

- COMPOSER-12 `TalosMobileComposer.test.ts::keeps file and context controls explicit but disabled until their bridges exist`
  - Expected RED: both controls are enabled and emit into no owner.
- COMPOSER-13 `TalosMobileComposerModelPicker.test.ts::keeps refresh and Model Lab commands outside the listbox`
  - Expected RED: footer commands do not exist.
- COMPOSER-14 `chatScreen.test.ts::restores and preserves a draft across session changes`
  - Expected RED: prompt is a local ephemeral ref.
- COMPOSER-15 `chatScreen.test.ts::restores the draft when persistence rejects a send`
  - Expected RED: prompt is cleared before send and never restored.
- COMPOSER-16 `settingsScreen.test.ts::opens the Models detail pane from the composer deep link`
  - Expected RED: `/settings?tab=models` still opens the category list.
- COMPOSER-17 `mobile-composer-state.e2e.spec.ts::persists draft and model controls across reload without opening unrelated UI`
  - Expected RED: draft/effort/thinking are lost and the Model Lab command only opens generic Settings.
- COMPOSER-18 `appShell.test.ts::App shell (rail + chat base + station sheets)`
  - Observed RED during the full gate: the shell fake omitted the new controller catalogs, preference error and durable draft methods, causing `ChatScreen` to fail before rendering.
- COMPOSER-19 `routeWiring.test.ts::resolves each of the 5 tab routes to its real parity screen`
  - Observed RED during the full gate: all five real lazy screens resolved in `5.019s`, narrowly exceeding Vitest's default `5s` only under full-suite contention; the same test resolved in `4.49s` alone.

## Focused GREEN commands

Run from `mobile/`:

1. `npm run test:unit -- tests/unit/repositories/chatRepository.contract.ts tests/unit/repositories/sqliteChatRepository.test.ts`
2. `npm run test:unit -- tests/unit/theme/settingsStore.test.ts tests/unit/chat/chatStore.test.ts tests/unit/chat/chatController.test.ts`
3. `npm run test:unit -- tests/unit/composables/useTalosMobileComposerDraft.test.ts`
4. `npm run test:unit -- tests/unit/chat/TalosMobileComposer.test.ts tests/unit/chat/TalosMobileComposerModelPicker.test.ts tests/unit/screens/chatScreen.test.ts tests/unit/screens/settingsScreen.test.ts`
5. `npx playwright test tests/e2e/mobile-composer-state.e2e.spec.ts --workers=1 --trace=on-first-retry`

Amendment: the lane Playwright config has one unnamed Chromium target, so the
planned `--project=chromium` flag was invalid. The command above exercises the
same repository-pinned Chromium runtime without inventing a project alias.

Regression amendment: current official Vitest documentation confirms a `5000ms`
Node test default and supports a per-test timeout. COMPOSER-19 therefore receives
a local `15000ms` ceiling while preserving every assertion. Current Vue Test
Utils guidance recommends explicit dependency mocks for high-level components;
COMPOSER-18 updates the shell fake to the real controller contract rather than
adding defensive production behavior. Sources:
`https://vitest.dev/config/testtimeout` and
`https://test-utils.vuejs.org/guide/advanced/vue-router`.

## Affected regression gates

1. All mobile repository/persistence tests.
2. All mobile chat controller/store/composer/screen tests.
3. Existing durable chat E2E corpus: `mobile-chat-persistence`, `mobile-chat-thread-parity`, `mobile-provider-model-refresh`.
4. Settings parity tests and route wiring tests.
5. `npm run build` including the fixed 512000-byte initial graph contract.
6. `npm audit --audit-level=low`.
7. `git diff --check` scoped to the mobile lane.

## Human-visible proof

At 390x844 and 360x640:

1. Type a draft, reload, and see the exact draft restored.
2. Create/switch chats and see each chat restore its own draft.
3. Select model/effort/thinking, reload, and see valid values restored without a Settings popup.
4. Open the model picker, refresh catalogs, then open Model Lab directly in its Models detail pane.
5. Confirm file/context buttons communicate their unavailable bridge and do not silently no-op.
6. Force a persistence failure and verify the typed prompt remains recoverable.

## Rollback

Remove the new composable and repository draft methods, remove `composer_defaults` from the settings schema, and restore the previous component wiring. No schema downgrade or data rewrite is needed because the existing state table and unknown Preferences JSON keys remain harmless.

## Execution evidence

1. Repository, settings, controller, component and screen focus: `10 files / 76 tests` GREEN.
2. Production gate: `vue-tsc -b`, Vite production build and initial-graph guard GREEN; `506155 / 512000` initial JavaScript bytes.
3. COMPOSER-17 Chromium journeys: GREEN at `390x844` and `360x640`; both verify draft, model, effort and thinking persistence across reload, zero unrelated tool sheets, direct `Models` detail routing, and no horizontal document overflow.
4. Full unit gate: `88 files / 865 tests` GREEN with `1 file / 2 tests` intentionally skipped by pre-existing gates.
5. Affected Chromium corpus: `9/9` GREEN in `51.9s`, including durable multi-turn chat, thread actions, provider discovery success/failure, Settings persistence and both composer viewports.
6. Dependency audit: `0 vulnerabilities` at `--audit-level=low`.
7. `git diff --check` scoped to mobile and this slice's records: GREEN.
