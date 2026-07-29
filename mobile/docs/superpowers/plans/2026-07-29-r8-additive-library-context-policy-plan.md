# R8 Additive Library Context Policy — Implementation Plan

> **For Codex:** Execute sequentially with `executing-plans`,
> `systematic-debugging`, `test-driven-development`, and
> `verification-before-completion`. Stop on the first red regression. Repository
> and user rules override the skill's commit/delegation suggestions: no commits
> and no implementation subagents.

**Goal:** Preserve the established broad Library contract while making every
send transactionally bound to one session/model/policy snapshot, then add
optional smart, ask-before-use, on-demand, manual-scope, and confirmed
natural-language policy controls.

**Architecture:** `ChatStore` owns the send single-flight and immutable identity.
The controller prepares a TALOS-specific runtime only after that identity is
captured. Pure `libraryPolicy.ts` resolves global/chat/turn precedence and
selects candidates. Existing repository metadata and Preferences persist
versioned policy objects with optimistic revisions. Provider adapters remain
unchanged; the completion path receives a snapshot rather than reading live
computed state.

**Stack:** Vue 3, TypeScript, Vitest, Zod, Capacitor Preferences, existing
encrypted chat repository, Playwright, Android/Capacitor build.

## Task 1: Freeze compatibility and send identity

Files:

- Create `src/lib/chat/sendSnapshot.ts`
- Create `tests/unit/chat/sendSnapshot.test.ts`
- Modify `tests/unit/lib/libraryContext.test.ts`
- Modify `tests/unit/chat/chatStore.test.ts`
- Modify `tests/unit/chat/chatController.test.ts`

Steps:

1. Add the ten named `P1-CTX-COMPAT-*` characterization cases without changing
   product code.
2. Run only those cases and verify current established behavior is green.
3. Add RED isolation tests for delayed retrieval, double send, session switch,
   model switch, stale session projection, and late durable rows.
4. Implement immutable identity types.
5. Change `ChatStore` to raise the lock and allocate abort/snapshot identity
   before preparation.
6. Pass a single runtime invocation into completion.
7. Remove controller-global pending context and bind consent/tools/audit/trace
   to captured identity.
8. Serialize model persistence per session and fence active projections.
9. Run the R8-A focused command and `git diff --check`.
10. Record a diff checkpoint in the ledger; do not commit.

## Task 2: Add the pure versioned policy

Files:

- Create `src/lib/chat/libraryPolicy.ts`
- Create `tests/unit/lib/libraryPolicy.test.ts`
- Modify `src/lib/chat/libraryContext.ts`
- Modify `tests/unit/lib/libraryContext.test.ts`

Steps:

1. Write RED parser, legacy-resolution, precedence, include/exclude,
   multilingual anaphora, positive-threshold, and no-ambient mode tests.
2. Implement the smallest pure types/parser/resolver.
3. Route broad mode through the unchanged selector.
4. Add focused retrieval with abstention and the optional scored-adapter seam.
5. Add same-session topic-anchor and answer-assessment helpers.
6. Run the R8-B pure tests.

## Task 3: Persist global/chat policy transactionally

Files:

- Modify `src/stores/settings.ts`
- Modify `src/stores/chat.ts`
- Modify `src/stores/chatController.ts`
- Modify `tests/unit/theme/settingsStore.test.ts`
- Modify `tests/unit/chat/chatStore.test.ts`
- Modify `tests/unit/chat/chatController.test.ts`

Steps:

1. Write RED legacy-no-rewrite, successful round-trip, rejected-write rollback,
   concurrent mutation, and revision-conflict tests.
2. Add the optional global policy field and parse it fail-closed.
3. Persist candidate settings before publishing reactive state.
4. Add serialized revision-checked session metadata mutation.
5. Resolve and capture global/chat/turn policy during send preparation.
6. Re-check file revocation immediately before provider egress.
7. Persist actual candidate/transmission disclosure.
8. Run the R8-B store/controller command and all R8-A cases.

## Task 4: Add manual UI controls

Files:

- Create `src/components/chat/TalosMobileLibraryContextSheet.vue`
- Modify `src/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue`
- Modify `src/components/chat/TalosMobileComposer.vue`
- Modify `src/components/chat/TalosMobileChatMediaPanel.vue`
- Modify `src/screens/ChatScreen.vue`
- Modify `src/screens/ContextScreen.vue`
- Modify `src/App.vue`
- Modify `src/i18n/locales/en.ts`
- Modify `src/i18n/locales/it.ts`
- Modify `tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`
- Modify `tests/unit/chat/TalosMobileComposer.drawer.test.ts`
- Modify `tests/unit/chat/chatMediaPanel.test.ts`
- Modify `tests/unit/screens/contextScreen.test.ts`
- Modify `tests/unit/shell/appShell.test.ts`

Steps:

1. Add RED settings, global Library, chat Library, source-chip, one-shot,
   keyboard, failure-state, and reload tests.
2. Intercept fresh enablement until a mode is explicitly selected.
3. Render legacy enabled/missing-mode as broad compatibility.
4. Add per-file global/chat include/exclude actions without altering
   `library_shared`.
5. Add the compact composer source chip and modal turn override.
6. Clear the turn override only after the user message commit callback.
7. Add matched EN/IT strings and test IDs.
8. Run R8-C focused tests and both prior slices.

## Task 5: Add confirmed natural-language policy control

Files:

- Create `src/lib/tools/libraryContextPolicyTools.ts`
- Create `tests/unit/tools/libraryContextPolicyTools.test.ts`
- Modify `src/lib/tools/registry.ts`
- Modify `src/lib/tools/executor.ts`
- Modify `src/lib/tools/toolControls.ts`
- Modify `src/lib/tools/toolControlCatalog.ts`
- Modify `src/lib/tools/toolset.ts`
- Modify `src/stores/chatController.ts`
- Modify `src/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue`
- Modify `tests/unit/tools/toolExecutor.test.ts`
- Modify `tests/unit/tools/toolControls.test.ts`
- Modify `tests/unit/tools/toolsetLibraryRevocation.test.ts`
- Modify `tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts`
- Modify `tests/unit/chat/chatController.test.ts`

Steps:

1. Add RED closed-schema, disabled-default, always-confirm, top-level-origin,
   conflict, audit, and exact-undo tests.
2. Add `confirmation: 'always'` to the canonical tool definition and executor.
3. Ensure conversation-scoped generic write consent cannot satisfy it.
4. Add the policy tool factory and bounded receipt store.
5. Offer it while Library master is off only when its dedicated capability is
   enabled; all content-reading Library tools remain off.
6. Bind chat scope to the captured send session.
7. Add Agent Tools EN/IT metadata and update exact tool counts.
8. Run R8-D focused tests and all previous gates.

## Task 6: Add the bounded broad-mode answer guard

Files:

- Modify `src/lib/chat/libraryPolicy.ts`
- Modify `src/stores/chatController.ts`
- Modify `tests/unit/lib/libraryPolicy.test.ts`
- Modify `tests/unit/chat/chatController.test.ts`
- Modify `tests/unit/chat/chatStoreStreaming.test.ts`

Steps:

1. Add RED OmniRoute/iTerm fixtures and no-duplicate-side-effect tests.
2. Record per-document lexical score while retaining every broad-mode document.
3. Buffer only an ambiguous high-risk first draft.
4. Accept immediately when relevant; otherwise perform at most one no-tool
   correction against the same immutable snapshot.
5. If correction remains off-topic, return an explicit abstention.
6. Never retry after a tool execution, abort, or visible partial stream.
7. Run R8-E focused tests and all earlier slices.

## Task 7: Update parity/provenance and verify

Files:

- Modify `docs/feature-parity.json`
- Modify `docs/upstream-provenance.md`
- Modify `tests/e2e/mobile-chat-files.e2e.spec.ts`
- Modify `tests/e2e/mobile-settings-parity.e2e.spec.ts`

Steps:

1. Add parity evidence for global/chat/turn controls, transactional snapshot,
   confirmed NL mutation, audit/undo, and current semantic-adapter limitation.
2. Add Playwright coverage for the human-visible settings and Library paths.
3. Run all affected unit tests.
4. Run `npm run typecheck`.
5. Run `npm run build`.
6. Run the two exact Playwright specs as the coordinated single runner.
7. Run `git diff --check`.
8. Inspect the exact scoped diff and confirm no non-lane/Claude/desktop file was
   touched.
9. Do not create the Claude ACK ticket and do not commit.

## Task 8: Manual APK acceptance handoff

1. After all automated gates are green, build/sync/sign the APK through the
   repository's already-approved Android process.
2. Place the APK on the Desktop only at the final APK stage.
3. Provide a manual checklist covering all four modes, model/session race,
   generated/uploaded/shared/revoked files, global/chat/turn scope, NL
   confirmation/conflict/undo, reload, EN/IT, mobile/tablet, keyboard, and
   reduced motion.
4. Wait for the user's explicit manual-test result.
5. Only after every point passes and the user explicitly authorizes it, prepare
   the detailed Claude ACK transcript ticket.
