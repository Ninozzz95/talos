# TALOS Mobile Durable Chat SQLite Execution Ledger

Date: 2026-07-22
Owner: Codex mobile lane
Status: IN PROGRESS
Research: `docs/superpowers/research/2026-07-22-mobile-durable-chat-sqlite-research.md`
Desktop reference: `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed` read-only

## UI upstream amendment (2026-07-22)

Current primary-source review:

- shadcn-vue Drawer documentation: Drawer is distributed source code built on
  Vaul Vue and is the supported mobile overlay primitive already pinned in this
  lane;
- Reka UI Dialog documentation: modal focus trapping, accessible Title and
  Description, Escape close and trigger-focus restoration are upstream-owned;
- W3C WAI-ARIA APG modal dialog pattern: focus enters the dialog, remains in its
  tab sequence, Escape closes it, a visible close control is required and focus
  returns to the invoker unless that control no longer exists.

Decision: **adopt directly** the existing hash-locked shadcn-vue Drawer/Vaul
primitives for chat history and the existing shadcn-vue Dialog/Reka primitives
for destructive confirmation. TALOS owns only session-domain content, event
wiring and `--talos-*` presentation. A hand-rolled drawer, focus trap or modal
state machine is rejected because it would duplicate maintained upstream
behavior and weaken keyboard/mobile accessibility. The real browser E2E remains
the upstream integration gate; component mocks alone cannot promote the slice.

Android backup amendment: current Android documentation states that
`android:allowBackup="false"` can be ignored by some Android 12+ device-transfer
implementations. The durable-chat boundary therefore uses all three controls:
`allowBackup="false"`, Android 12+ `dataExtractionRules` excluding `database`
and `sharedpref` from cloud and device transfer, and the Android 11-and-lower
`fullBackupContent` rules. Add the exact file
`mobile/android/app/src/main/res/xml/backup_rules.xml` to the Create inventory;
no other inventory wildcard is authorized.

## Objective

Replace volatile single-thread chat state with an encrypted, versioned, local-first session repository. The final user path must create, restore, switch, rename and delete conversations without a server; provider context must survive reload and Android process death.

## Public contracts

- `TalosSqlValue`
- `TalosSqlRow`
- `TalosSqlConnection`
- `TalosSqlitePlatform`
- `TalosSqliteRuntime`
- `TalosCapacitorSqliteGateway`
- `CapacitorSqliteRuntimeOptions`
- `createCapacitorSqliteRuntime()`
- `prepareOfficialWebStore(loader?)`
- `TALOS_CHAT_DATABASE_NAME`
- `TALOS_CHAT_DATABASE_VERSION`
- `TALOS_CHAT_DATABASE_UPGRADES`
- `TalosLocalChatSession`
- `TalosLocalChatMessage`
- `TalosLocalChatAttachment`
- `TalosLocalToolActivity`
- `CreateChatSessionInput`
- `AppendChatMessageInput`
- `UpdateChatSessionInput`
- `ChatRepositoryOptions`
- `TalosChatRepository`
- `createSqliteChatRepository(runtime, options)`
- `createMemoryChatRepository(options)` (test/conformance implementation only; never a production fallback)
- `ChatRepositoryLoader`
- `createLazyChatRepository(loader)`
- `createProductionChatRepository()`
- `newTalosMobileId()`
- `ChatState.persistenceStatus`
- `ChatState.persistenceError`
- `ChatStore.sessions`
- `ChatStore.activeSession`
- `ChatStore.initialize()`
- `ChatStore.retryPersistence()`
- `ChatStore.createSession()`
- `ChatStore.selectSession(id)`
- `ChatStore.renameSession(id,title)`
- `ChatStore.deleteSession(id)`
- `ChatStore.send(text)` (durable semantics)
- `ChatController.newSession()`
- `ChatController.selectSession(id)`
- `ChatController.renameSession(id,title)`
- `ChatController.deleteSession(id)`

Compatibility symbols kept stable:

- `createChatStore`
- `ChatCompletion`
- `ChatTurn`
- `useChatController`
- all current provider/model controller methods and refs
- `TalosMobileMessageView` fields already rendered by the message list

## Exact file inventory

Create:

1. `docs/superpowers/research/2026-07-22-mobile-durable-chat-sqlite-research.md`
2. `docs/superpowers/ledgers/2026-07-22-talos-mobile-durable-chat-sqlite-ledger.md`
3. `mobile/src/persistence/sqliteTypes.ts`
4. `mobile/src/persistence/chatDatabaseSchema.ts`
5. `mobile/src/persistence/capacitorSqliteRuntime.ts`
6. `mobile/src/repositories/chatRepository.ts`
7. `mobile/src/repositories/sqliteChatRepository.ts`
8. `mobile/src/repositories/memoryChatRepository.ts`
9. `mobile/src/lib/mobileIds.ts`
10. `mobile/src/components/chat/TalosMobileChatHeader.vue`
11. `mobile/src/components/chat/TalosMobileSessionDrawer.vue`
12. `mobile/tests/unit/persistence/chatDatabaseSchema.test.ts`
13. `mobile/tests/unit/persistence/capacitorSqliteRuntime.test.ts`
14. `mobile/tests/unit/repositories/chatRepository.contract.ts`
15. `mobile/tests/unit/repositories/memoryChatRepository.test.ts`
16. `mobile/tests/unit/repositories/sqliteChatRepository.test.ts`
17. `mobile/tests/unit/chat/TalosMobileChatHeader.test.ts`
18. `mobile/tests/unit/chat/TalosMobileSessionDrawer.test.ts`
19. `mobile/tests/e2e/mobile-chat-persistence.e2e.spec.ts`
20. `mobile/public/assets/sql-wasm.wasm` (byte-for-byte copy from pinned `sql.js@1.11.0`)
21. `mobile/android/app/src/main/res/xml/data_extraction_rules.xml`
22. `mobile/android/app/src/main/res/xml/backup_rules.xml`
23. `mobile/src/repositories/lazyChatRepository.ts`
24. `mobile/src/repositories/productionChatRepository.ts`
25. `mobile/tests/unit/repositories/lazyChatRepository.test.ts`
26. `mobile/scripts/verify-initial-chunk.mjs`
27. `mobile/tests/unit/build/initialChunkContract.test.ts`

Modify:

28. `mobile/package.json`
29. `mobile/package-lock.json`
30. `mobile/vite.config.ts`
31. `mobile/capacitor.config.ts`
32. `mobile/android/app/src/main/AndroidManifest.xml`
33. `mobile/src/components/chat/mobileChatTypes.ts`
34. `mobile/src/stores/chat.ts`
35. `mobile/src/stores/chatController.ts`
36. `mobile/src/screens/ChatScreen.vue`
37. `mobile/src/App.vue`
38. `mobile/tests/unit/chat/chatStore.test.ts`
39. `mobile/tests/unit/chat/chatController.test.ts`
40. `mobile/tests/unit/screens/chatScreen.test.ts`
41. `mobile/tests/unit/app/appShell.test.ts`
42. `mobile/docs/feature-parity.json` only after all slice gates pass
43. `docs/superpowers/research/2026-07-22-mobile-durable-chat-sqlite-research.md`
44. `docs/superpowers/plans/2026-07-22-talos-mobile-desktop-parity-master-plan.md` only after all slice gates pass
45. `docs/superpowers/progress/kimi-mobile/M2-lite-usable-app-execution-ledger.md` only after all slice gates pass
46. `mobile/src/lib/mobileRoutes.ts`
47. `mobile/src/router/index.ts`
48. `mobile/tests/unit/router/routeWiring.test.ts`
49. `mobile/tests/unit/shell/appShell.test.ts`
50. `mobile/tests/e2e/mobile-provider-model-refresh.e2e.spec.ts`
51. `mobile/src/components/talos/settings/TalosMobileSettingsModelsPanel.vue`
52. `mobile/tests/unit/screens/settingsScreen.test.ts`

Delete: none.

Generated native files changed by `npx cap sync android` must be inventoried in an execution amendment before accepting the sync diff. No wildcard grants ownership in advance.

## TDD scenarios

### CHAT-DB01 - schema and migration order

RED: version 1 creates all five named tables, foreign keys, ordering indexes and constrained state columns. Upgrade registration occurs before open. Unknown/newer schema and malformed rows fail closed.

### CHAT-DB02 - encrypted native bootstrap

RED: a fresh native install creates one random secret and opens encrypted mode; subsequent init reuses the stored secret. Existing database plus missing secret fails `TALOS_CHAT_DB_KEY_MISSING`. Web never calls unsupported encryption methods.

### CHAT-DB03 - official web bootstrap

RED: Web defines one `jeep-sqlite` element, initializes the upstream Web store, loads the pinned WASM asset and reuses an existing connection after reload/hot replacement.

### CHAT-DB04 - atomic repository writes

RED: create+active-pointer, append+session-touch, and delete+active-reselection commit atomically. Any inner failure rolls back and leaves the previous snapshot unchanged. Writes are parameterized; metadata is validated JSON.

### CHAT-DB05 - durable ordering and context

RED: messages reload by `(created_at, ordinal, id)` and the second completion receives the complete prior user/assistant context from the restored active session.

### CHAT-DB06 - process-death restoration

RED: a new store/controller instance on the same repository restores sessions, active session, messages, selected model reference and titles without a server or credential duplication.

### CHAT-DB07 - session lifecycle

RED: New Chat creates a distinct active empty session; switching loads only that thread; rename trims/bounds the title; deleting cascades messages and selects the newest remaining session; deleting the last session returns to the welcome state.

### CHAT-DB08 - persistence failure is honest

RED: init/write failure sets an actionable persistence error, disables send, keeps retry reachable and never falls back to volatile messages. Provider failure persists a failed system row without corrupting the prior thread.

### CHAT-DB09 - credential and backup boundary

RED: database values, serialized metadata, exported test snapshots and errors contain no sentinel provider key. Android backup/device-transfer excludes databases and shared preferences.

### CHAT-DB10 - human Web journey

RED E2E against real `jeep-sqlite`: create two chats, complete two contextual turns, reload, restore exact active thread, switch, rename, delete, reload, and observe the final durable state. No server request supplies chat/session data.

### CHAT-DB11 - frozen provider regression

RED: provider key save still refreshes Model Lab/composer without reload; persistence initialization never opens Settings or clears model/draft state.

### CHAT-DB12 - lazy production driver and initial-chunk budget

RED: importing the chat controller statically pulls the concrete SQLite runtime
into the HTML entry and the complete initial JavaScript closure exceeds 512,000
bytes.
The production repository must be a Vite dynamic entry outside the entry's
static closure. Concurrent initialization invokes its loader and concrete
`initialize()` exactly once; a loader/initialization failure is propagated,
closed best-effort, discarded, and a later explicit retry obtains a fresh
repository. No operation may execute before successful initialization.

The four station screens (`ResearchScreen.vue`, `RunsScreen.vue`,
`ContextScreen.vue`, `SettingsScreen.vue`) must also be literal Vue Router
dynamic imports and dynamic manifest entries outside the initial graph. Chat is
the only eager screen because it is the persistent base. Route navigation,
offline native packaging and all route marker contracts remain unchanged.

### CHAT-DB13 - pinned jeep-sqlite loader drift

RED: the unit gate imports the real pinned `jeep-sqlite@2.8.0/loader` module and
proves its runtime namespace contains `defineCustomElements` but not the
declaration-only `applyPolyfills`. `prepareOfficialWebStore(loader?)` uses a
narrow injected loader in jsdom to prove ordering and idempotent mounting
without rendering the Stencil component in the incomplete jsdom CSS runtime.
The current production code calls declaration-only `applyPolyfills`; no
`jeep-sqlite` element is mounted in Chromium and
the real provider E2E renders `Local chat storage is unavailable. s is not a
function`. GREEN requires the actual runtime export `defineCustomElements` to
be awaited, exactly one element to be mounted across repeated preparation, Web
store initialization to complete, Send to remain enabled and the two-turn
provider journey to render both assistant replies. The rejected-provider alert
must be scoped to the Models settings panel so an unrelated application alert
cannot satisfy or make the locator ambiguous.

### CHAT-DB14 - jeep-sqlite glue/WASM binary conformance

RED: Chromium downloads the existing `sql.js@1.14.1` WASM with HTTP 200 but
`jeep-sqlite@2.8.0` aborts during instantiation because its published glue was
built against `sql.js@1.11.0`. The schema conformance test must require exact
pin `1.11.0`, registry integrity
`sha512-GsLUDU3vhOo14Pd5ME0y2te49JQyby6HuoCuadevEV+CGgTUjmYRrm7B7lhRyzOgrmcWmspUfyjNb6sOAEqdsA==`,
652,953-byte asset length and SHA-256
`083460b3e9d428ebbbbaa03918ba55da33d810e0fb3470d4b5d8677b462b2c2b`.
GREEN requires npm tree/lockfile agreement, a byte-identical copied asset, no
page error, Web store readiness and the provider journey's two durable replies.

### CHAT-DB15 - model availability count grammar

RED: a ready provider with one discovered model renders the user-visible text
`1 models available`, causing the durable-chat Chromium journey to fail before
session lifecycle begins. The Models panel must render `1 model available` for
exactly one and `<n> models available` for every other count, using one private
formatter shared by remote providers and Ollama. The focused Settings unit test
must cover both branches; the Playwright journey remains the final visible
proof. No public contract or dependency is added.

### CHAT-DB16 - cascaded delete change-count semantics

RED: deleting the active chat after multiple messages returns a positive
`run().changes` value greater than one from the real Web backend because pinned
`jeep-sqlite@2.8.0` measures a delta of SQLite `total_changes()`. The repository
currently requires exactly one, throws `TALOS_CHAT_SESSION_NOT_FOUND`, rolls
back the valid delete and leaves both sessions visible. The SQLite repository
test must return a multi-row cascade count and still promote the newest
remaining session atomically; a separate zero-count case must continue to
reject and roll back. The full Chromium lifecycle is the upstream integration
proof.

## RED commands

- `npm.cmd run test:unit -- tests/unit/persistence/chatDatabaseSchema.test.ts tests/unit/persistence/capacitorSqliteRuntime.test.ts`
- `npm.cmd run test:unit -- tests/unit/repositories/memoryChatRepository.test.ts tests/unit/repositories/sqliteChatRepository.test.ts`
- `npm.cmd run test:unit -- tests/unit/chat/chatStore.test.ts tests/unit/chat/chatController.test.ts tests/unit/chat/TalosMobileChatHeader.test.ts tests/unit/chat/TalosMobileSessionDrawer.test.ts tests/unit/screens/chatScreen.test.ts tests/unit/app/appShell.test.ts`
- `npx.cmd playwright test tests/e2e/mobile-chat-persistence.e2e.spec.ts --workers=1`
- `npm.cmd run test:unit -- tests/unit/repositories/lazyChatRepository.test.ts tests/unit/build/initialChunkContract.test.ts`
- `npm.cmd run test:unit -- tests/unit/persistence/capacitorSqliteRuntime.test.ts`
- `npx.cmd playwright test tests/e2e/mobile-provider-model-refresh.e2e.spec.ts --workers=1`

Each scenario must be observed failing for the missing contract before its production implementation.

## Focused GREEN commands

Run the same four groups above after their respective minimal implementation. The real Web E2E is mandatory and mocks may not replace it.

## Regression and upstream gates

1. `npm.cmd run test:unit`
2. `npm.cmd run build`
3. `npx.cmd playwright test --workers=1`
4. `npm.cmd audit --audit-level=high`
5. `npx.cmd cap sync android`
6. `mobile/android/gradlew.bat assembleDebug` from `mobile/android`
7. `node mobile/scripts/verify-parity-ledger.mjs mobile/docs/feature-parity.json`
8. `git diff --check`
9. desktop `git status --short` remains empty

## Human-visible proof

- The first message creates a real titled session.
- Chat history opens as a mobile drawer, with current-thread state, timestamps and reachable rename/delete actions.
- New Chat immediately shows a clean welcome surface without erasing earlier sessions.
- Reload and full browser-context recreation restore the selected thread and messages.
- A storage failure leaves a visible Retry action and disables Send with a concrete reason.
- At 320x640, 360x800, 390x844 and tablet, the drawer, message thread and fixed composer do not clip or overlap.

## Rollback

Remove repository wiring, plugin config and Web element registration; restore the previous volatile store only in a deliberate rollback build. Keep `talos_mobileSQLite.db` and its encryption secret untouched for forward recovery. Never delete or silently recreate a database after key/schema failure.
