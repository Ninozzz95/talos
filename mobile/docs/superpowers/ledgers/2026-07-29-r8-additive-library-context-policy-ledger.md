# R8 Additive Library Context Policy — Code-Level Ledger

Date: 2026-07-29  
Status: approved; ledger before product edits  
Lane: `lane/kimi-mobile` only  
Commit policy: Codex must not commit  
Research pin: `docs/superpowers/research/2026-07-29-r8-additive-library-context-policy-research.md`

## Owned subsystem and boundaries

- Primary owner: TALOS UI/mobile local-first control plane.
- Persistence remains in the existing encrypted chat repository and Capacitor
  Preferences boundaries.
- Provider-specific request shapes remain behind existing adapters.
- Documents and tool output remain untrusted data.
- No validator, PHP core, Laravel desktop/control-plane, or Claude session file
  is in scope.

## Blocking compatibility contracts

The following tests must be green before any new mode may progress:

1. `P1-CTX-COMPAT-01 broad mode preserves whole-library-under-budget behavior`
2. `P1-CTX-COMPAT-02 broad mode preserves current over-budget fallback`
3. `P1-CTX-COMPAT-03 existing enabled users resolve to broad_compat_v1`
4. `P1-CTX-COMPAT-04 global default remains off`
5. `P1-CTX-COMPAT-05 generated files stay out of ambient context`
6. `P1-CTX-COMPAT-06 generated shared files remain tool-discoverable`
7. `P1-CTX-COMPAT-07 library_shared revocation remains live and fail-closed`
8. `P1-CTX-COMPAT-08 explicit attachments remain readable`
9. `P1-CTX-COMPAT-09 public Library tool contracts remain byte-compatible`
10. `P1-CTX-COMPAT-10 model switching cannot mutate policy/source scope of an
    accepted send`

Any failure stops the slice. No adjacent feature work continues until the
contract is restored.

## Public contracts to add or amend

### Send identity

- Add `TalosChatSendIdentity` in `src/lib/chat/sendSnapshot.ts`.
- Add `createTalosChatSendIdentity()` as the single runtime-freezing boundary.
- Add `TalosChatSendPreparationContext<Runtime>` and
  `TalosChatSendPreparation<Runtime>`.
- Add `ChatCompletionInvocation<Runtime>` in `src/stores/chat.ts`.
- Extend `ChatCompletion<Runtime>`, `ChatStoreOptions<Runtime>`,
  `ChatStore<Runtime>`, and `createChatStore<Runtime>()` without breaking
  call sites that omit a preparer.
- Add optional `ChatStoreOptions.captureSendRuntime()` so controller-owned
  provider/settings state is copied synchronously after target-session capture
  and before any retrieval await. Inspection showed that an async preparer
  alone would still leave a race before its first awaited dependency.
- Add `ChatStore.setSessionLibraryContextPolicy()`.
- Keep `ChatStore.send()` public arguments compatible; add only an optional
  final turn-policy argument.

### Library policy

- Add `TalosLibraryContextMode`:
  - `broad_compat_v1`
  - `smart_relevant_v1`
  - `ask_before_use_v1`
  - `agentic_on_demand_v1`
- Add `TalosLibraryContextPolicyV1`,
  `TalosSessionLibraryContextPolicyV1`,
  `TalosLibraryContextPolicyPatch`,
  `TalosLibraryTurnOverride`,
  `TalosEffectiveLibraryContextPolicy`,
  `TalosLibraryContextDecision`,
  `TalosLibraryPolicyReceipt`, and `TalosLibraryPolicyConflictError`.
- Add pure functions:
  - `parseTalosLibraryContextPolicy()`
  - `parseTalosSessionLibraryContextPolicy()`
  - `resolveTalosLibraryContextPolicy()`
  - `applyTalosLibraryContextPolicyPatch()`
  - `buildTalosLibraryTopicAnchor()`
  - `selectTalosLibraryContext()`
  - `assessTalosLibraryAnswerRelevance()`
- Preserve `selectLibraryDocsForInjection()` unchanged as the broad
  compatibility implementation.
- Add `selectRelevantLibraryDocsForInjection()` as the focused selector with a
  positive evidence threshold and forced-include support.
- Extend `buildTalosLibraryContextBlock()` only through an optional topic-anchor
  option; existing output without that option remains stable.

### Settings and session persistence

- Add `library_context_policy` to `TalosMobileShellPreferences`.
- Add transactional `SettingsStore.setLibraryContextPolicy(patch,
  expectedRevision)`.
- Existing enabled settings with no policy field resolve in memory to broad
  compatibility and are not rewritten during hydration.
- Add serialized, revision-checked session metadata writes under the key
  `library_context_policy`.
- Exclusion always wins over inclusion; neither can bypass availability,
  upload-only ambient policy, or `library_shared=false`.

### Agent tool

- Add `library_context_policy_update` as a disabled-by-default
  `TalosAgentToolId`.
- Add `TalosToolDefinition.confirmation?: 'policy' | 'always'`; only `always`
  is used by this tool.
- Add the closed-schema factory
  `createTalosLibraryContextPolicyTools()`.
- Add bounded `TalosLibraryContextPolicyReceiptV1` and
  `parseTalosLibraryContextPolicyReceipt()` so undo can recover its encrypted
  audit evidence after a send continuation or app reload without trusting raw
  activity JSON.
- Supported actions:
  - `set_mode`
  - `include_files`
  - `exclude_files`
  - `clear_overrides`
  - `set_enabled`
  - `undo`
- Supported scopes:
  - `global`
  - `chat`
  - `turn`
- Persistent global/chat mutations require `expected_revision`, a top-level
  user-originated tool call, dedicated capability, and confirmation even when
  generic write permission is `allow`.
- Turn scope is non-persistent but still produces disclosure/audit.
- Successful persistent mutations return a bounded receipt; `undo` restores the
  exact prior value when the receipt and current revision still match.

### UI

- AI Defaults: master switch plus explicit mode chooser. New enablement is not
  committed until a mode is chosen; existing enabled/missing-mode users see
  broad compatibility.
- Global Library: visible global mode and per-file include/exclude state.
- Per-chat media: visible effective/inherited mode and per-file chat overrides.
- Composer: a compact source chip opens a turn-only policy sheet and displays
  the effective mode plus selected-source count.
- Send receipt metadata records candidates and actual transmitted file IDs.
- English and Italian copy remain structurally identical.

## Exact file ownership

### Create

1. `src/lib/chat/sendSnapshot.ts`
2. `src/lib/chat/libraryPolicy.ts`
3. `src/lib/tools/libraryContextPolicyTools.ts`
4. `src/components/chat/TalosMobileLibraryContextSheet.vue`
5. `tests/unit/chat/sendSnapshot.test.ts`
6. `tests/unit/lib/libraryPolicy.test.ts`
7. `tests/unit/tools/libraryContextPolicyTools.test.ts`
8. `docs/superpowers/research/2026-07-29-r8-additive-library-context-policy-research.md`
9. `docs/superpowers/ledgers/2026-07-29-r8-additive-library-context-policy-ledger.md`
10. `docs/superpowers/plans/2026-07-29-r8-additive-library-context-policy-plan.md`

### Modify

1. `src/lib/chat/libraryContext.ts`
2. `src/stores/chat.ts`
3. `src/stores/chatController.ts`
4. `src/stores/settings.ts`
5. `src/lib/tools/registry.ts`
6. `src/lib/tools/executor.ts`
7. `src/lib/tools/toolControls.ts`
8. `src/lib/tools/toolControlCatalog.ts`
9. `src/lib/tools/toolset.ts`
10. `src/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue`
11. `src/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue`
12. `src/components/chat/TalosMobileComposer.vue`
13. `src/components/chat/TalosMobileChatMediaPanel.vue`
14. `src/screens/ChatScreen.vue`
15. `src/screens/ContextScreen.vue`
16. `src/App.vue`
17. `src/i18n/locales/en.ts`
18. `src/i18n/locales/it.ts`
19. `tests/unit/lib/libraryContext.test.ts`
20. `tests/unit/chat/chatStore.test.ts`
21. `tests/unit/chat/chatController.test.ts`
22. `tests/unit/tools/toolExecutor.test.ts`
23. `tests/unit/tools/toolControls.test.ts`
24. `tests/unit/tools/toolsetLibraryRevocation.test.ts`
25. `tests/unit/theme/settingsStore.test.ts`
26. `tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`
27. `tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts`
28. `tests/unit/chat/TalosMobileComposer.drawer.test.ts`
29. `tests/unit/chat/chatMediaPanel.test.ts`
30. `tests/unit/screens/contextScreen.test.ts`
31. `tests/unit/shell/appShell.test.ts`
32. `tests/e2e/mobile-chat-files.e2e.spec.ts`
33. `tests/e2e/mobile-settings-parity.e2e.spec.ts`
34. `docs/feature-parity.json`
35. `docs/upstream-provenance.md`
36. `src/composables/useTalosMobileAttachments.ts`
37. `tests/unit/composables/useTalosMobileAttachments.test.ts`
38. `tests/unit/chat/TalosMobileComposerSheet.test.ts`
39. `src/lib/tools/toolLabels.ts`
40. `tests/unit/tools/toolLabels.test.ts`
41. `src/lib/tools/toolAuthorizationCheckpoint.ts`
42. `tests/unit/tools/toolAuthorizationCheckpoint.test.ts`

### Delete

None.

If inspection proves a listed file unnecessary or reveals an additional file,
this ledger must be amended with the exact reason before that product file is
edited.

R8-A inspection amendment: generated document, image, marker, and archived web
source saves currently resolve `currentSessionId()` at the late write boundary.
The two files numbered 36–37 are therefore added so those existing methods can
accept an optional captured origin session ID; otherwise a navigation during a
tool round would preserve message ownership but still misattribute its artifact.

R8-B inspection amendment: chat overrides must explicitly restore inheritance,
so `TalosSessionLibraryContextPolicyPatch` and
`applyTalosSessionLibraryContextPolicyPatch()` are added to the public policy
contract. Exact candidate/transmission evidence can change at the live
revocation check after the user row is committed; therefore
`ChatCompletionResult.metadata` is added as a controller-owned assistant
evidence channel. This avoids a new repository mutation contract or schema
change while preserving the established `used_library` user-row disclosure.

R8-C inspection amendment: the new turn-policy sheet delegates modality,
keyboard trapping, focus restoration, responsive geometry, and reduced-motion
close timing to the existing `TalosMobileComposerSheet`. File 38 is added so
`P1-CTX-UI-05` verifies that shared runtime contract instead of duplicating a
second modal implementation in the Library feature.

R8-D inspection amendment: files 39–40 are required because a newly executable
tool without owned activity, icon, and localized authorization copy would
regress the existing “every tool is human-identifiable” contract.

R8-D revision amendment: undo restores the exact prior policy fields under a
new monotonic revision after verifying both the bounded receipt and current
revision. Reusing the historical revision number is rejected because it would
create an ABA/lost-update hole in the existing optimistic-concurrency
contract.

R8-D receipt-boundary amendment: the realistic multi-turn test exposed that a
model may copy the generated UUID receipt together with terminal sentence
punctuation. The previous test also asserted inside the mocked provider
transport, where the production error boundary converted the failed assertion
into a provider failure and hid the invalid undo. Permanent scenario
`P1-CTX-AGENT-04B` moves provider-payload proof outside the mock and requires
receipt lookup to try the exact opaque ID first, then a bounded fallback with
only trailing ASCII sentence punctuation removed. Scope, captured session,
current revision, dedicated capability, and per-call confirmation remain
mandatory; successful evidence records the canonical matched receipt ID.
RED evidence: the undo activity failed with
`TALOS_LIBRARY_POLICY_UNDO_INVALID`, input receipt ended in `.`, and persisted
chat policy remained revision `1`. Rollback removes only the fallback and its
test; exact receipt lookup remains unchanged.

R8-D turn-effect amendment: inspection proved that a successful
`scope=turn` mutation changed only an in-memory map after the initial Library
selection; the next provider round still received the pre-tool context. This
would make the natural-language control decorative. Permanent scenario
`P1-CTX-AGENT-07` starts in `agentic_on_demand_v1`, confirms a turn-only switch
to `smart_relevant_v1`, and requires the selected document in the next provider
round, actual-source disclosure, unchanged persistent policy, no inheritance
by the next send, and an encrypted `before_model` checkpoint containing both
the refreshed provider-neutral tool turn and refreshed runtime. Files 41–42
are added because the existing coordinator must atomically persist the updated
controller runtime together with the already-supported before-model loop; no
new checkpoint schema or storage format is introduced. Public method
`TalosToolAuthorizationCoordinator.saveBeforeModel()` gains one optional
bounded runtime argument. Rollback removes that optional argument and the
turn-result augmentation; persistent global/chat policy behavior remains
unchanged.

## Sequential TDD slices

### Slice R8-A — immutable send and compatibility characterization

RED:

- `P1-CTX-COMPAT-01` through `P1-CTX-COMPAT-10`
- `P1-CTX-ISO-03 second send is rejected while context preflight is pending`
- `P1-CTX-ISO-04 session switch during preflight cannot receive another
  session's rows, stream, tools, or audit`
- `P1-CTX-ISO-05 model switch during preflight affects only the next send`
- `P1-CTX-ISO-06 stale model persistence cannot reactivate an old session`

GREEN:

- set `sending` and allocate the abort/snapshot identity before retrieval;
- run retrieval through the store preparer after target-session capture;
- carry one immutable runtime into completion;
- fence active-session projections by captured revision/session;
- serialize model writes per session;
- persist late rows to their owner but project them only when still selected;
- bind consent, tool context, audit, trace, and keeper to snapshot identity.

Focused command:

```text
npm run test:unit -- --run tests/unit/chat/sendSnapshot.test.ts tests/unit/chat/chatStore.test.ts tests/unit/chat/chatController.test.ts tests/unit/lib/libraryContext.test.ts
```

Stop gate: all compatibility and isolation tests green.

#### R8-A checkpoint — 2026-07-29

- RED reproduced exactly four ownership races:
  `P1-CTX-ISO-03`, `P1-CTX-ISO-04`, `P1-CTX-ISO-05`, and
  `P1-CTX-ISO-06`.
- Added immutable identity/preparation coverage `P1-CTX-ISO-01/02`,
  preparation-failure recovery `P1-CTX-ISO-08`, captured artifact provenance
  `P1-CTX-ISO-07`, and a real tool/audit navigation case under
  `P1-CTX-ISO-04`.
- Focused plus affected regression gate:
  `11` files, `149` tests passed.
- `npm run typecheck`: passed.
- Scoped `git diff --check` for every R8-A tracked file: passed.
- Full dirty-worktree `git diff --check` remains unsuitable as a slice claim
  because unrelated pre-existing CRLF warnings span earlier work. No whitespace
  error remains in the R8-A scope.
- No commit created.

### Slice R8-B — pure additive policy and persistence

RED:

- `P1-CTX-SMART-01 smart mode excludes zero-evidence documents`
- `P1-CTX-SMART-02 smart mode resolves multilingual anaphoric follow-ups`
- `P1-CTX-ASK-01 candidate bodies do not egress before consent`
- `P1-CTX-ONDEMAND-01 on-demand sends no ambient body and keeps explicit tools`
- `P1-CTX-POLICY-01 exclusion wins and cannot be bypassed by an include`
- `P1-CTX-POLICY-02 revision conflicts leave persisted and reactive state intact`
- `P1-CTX-POLICY-03 no silent migration rewrites legacy broad users`

GREEN:

- pure versioned parser/resolver/selector;
- transactional global and chat storage;
- same-session topic anchor;
- actual candidate/transmission disclosure;
- turn override consumed by one accepted send only;
- revocation re-check immediately before provider egress.

Focused command:

```text
npm run test:unit -- --run tests/unit/lib/libraryPolicy.test.ts tests/unit/lib/libraryContext.test.ts tests/unit/theme/settingsStore.test.ts tests/unit/chat/chatStore.test.ts tests/unit/chat/chatController.test.ts
```

Stop gate: R8-A stays green and every policy state round-trips after reload.

### Slice R8-C — manual global/chat/turn UI

R9-E dependency amendment — 2026-07-29:

- The owner requires every unresolved enabled-tool authorization to offer
  Allow once / Always allow / Deny without blocking the conversation.
- The current parked-Promise consent cannot satisfy `ask_before_use_v1`.
- R8-C UI work therefore pauses before its ask-mode consent surface. The
  generic durable/nonblocking authorization contract in
  `docs/superpowers/ledgers/2026-07-29-r9-tool-authorization-nonblocking-ledger.md`
  must close first.
- R8-C then consumes that contract; it must not introduce a separate
  Library-only Promise, modal, grant cache, or persistence format.

R9 consumption amendment — 2026-07-29:

- `src/stores/chatController.ts` owns a private
  `talos.library-context-consent/1` continuation payload inside the existing
  `talos.tool.authorization-checkpoint/1` envelope. No new persistence or UI
  contract is introduced.
- The authorization request uses canonical tool `library_read`, action
  `read`, and a bounded input containing candidate IDs/names but never document
  bodies. The existing R9 card therefore exposes Allow once / Always allow /
  Deny and the existing Settings revocation path.
- The accepted send's provider-neutral turns and immutable runtime remain in
  the encrypted checkpoint. On continuation, the controller verifies the
  request/candidate binding, reapplies restrictive live read policy, rechecks
  the global master and every file's current shared/available/uploaded state,
  then performs the first provider call.
- Deny or live revocation resumes the same accepted send without Library
  bodies. A persisted exact `library_read` grant may satisfy later ask-mode
  sends until revoked; it does not alter broad/smart/on-demand contracts.
- New permanent scenarios:
  `P1-CTX-ASK-02 ask mode yields a durable nonblocking R9 checkpoint before
  provider egress` and
  `P1-CTX-ASK-03 allow-once, persistent grant, denial, and live revocation
  preserve exact candidate/transmission receipts`.
- RED/GREEN files remain within the existing ownership list:
  `tests/unit/chat/chatController.test.ts` and
  `src/stores/chatController.ts`.
- Rollback removes only the private continuation adapter and restores the
  already-green pure no-egress selector; it must not roll back R9 or the R8
  policy/UI contracts.

RED:

- `P1-CTX-UI-01 enabling from off requires an explicit mode choice`
- `P1-CTX-UI-02 legacy enabled state renders broad compatibility`
- `P1-CTX-UI-03 global and chat overrides expose inherited/included/excluded
  truth`
- `P1-CTX-UI-04 turn override is consumed once and clears only after commit`
- `P1-CTX-UI-05 keyboard, reduced-motion, reload, and narrow/tablet layouts`
- `P1-CTX-ASK-02 ask mode yields a durable nonblocking R9 checkpoint before
  provider egress`
- `P1-CTX-ASK-03 allow-once, persistent grant, denial, and live revocation
  preserve exact candidate/transmission receipts`

GREEN:

- mode controls in AI Defaults, Library, chat media, and composer;
- no optimistic policy truth before persistence;
- compact source chip and modal focus/escape handling;
- EN/IT copy and stable test IDs.

Focused command:

```text
npm run test:unit -- --run tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts tests/unit/chat/TalosMobileComposer.drawer.test.ts tests/unit/chat/chatMediaPanel.test.ts tests/unit/screens/contextScreen.test.ts tests/unit/shell/appShell.test.ts
```

Stop gate: no navigation/file-menu/chat-media regression.

#### R8-C checkpoint — 2026-07-29

- Global, per-chat, per-file, and one-turn controls are implemented without
  optimistic persistence or changing legacy broad users.
- `ask_before_use_v1` now yields the generic encrypted R9 authorization
  checkpoint before any provider call. Allow once, Always allow, Settings
  revocation, Deny, app-continuation, and file-level live revocation use the
  same `library_read` / `read` contract; request UI input contains no document
  body.
- The legacy/missing-session-metadata boundary is null-safe.
- Focused UI gate: `6` files, `111` tests passed.
- Focused controller gate: `55` tests passed.
- Shared modal gate, including `P1-CTX-UI-05`: `4` tests passed.
- Cumulative R8-A/B/C plus R9 regression gate: `22` files, `315` tests passed.
- `npm run typecheck`: passed.
- No commit created.

### Slice R8-D — natural-language policy control

RED:

- `P1-CTX-AGENT-01 mutation requires dedicated capability and confirmation`
- `P1-CTX-AGENT-02 indirect prompt/tool/file content cannot authorize mutation`
- `P1-CTX-AGENT-03 revision conflict fails without lost update`
- `P1-CTX-AGENT-04 undo restores the exact previous revision`
- `P1-CTX-AGENT-04B terminal sentence punctuation cannot turn a valid receipt
  into a false invalid-undo result`
- `P1-CTX-AGENT-05 generic write approval never suppresses policy confirmation`
- `P1-CTX-AGENT-06 tool remains reachable to enable policy while master is off`
- `P1-CTX-AGENT-07 confirmed turn policy affects the current response and
  survives the before-model checkpoint without leaking into the next send`

GREEN:

- closed Zod schema and dedicated disabled-by-default control;
- always-confirm executor path;
- bounded receipts and exact undo;
- captured session scope, audit evidence, and live revocation.

Focused command:

```text
npm run test:unit -- --run tests/unit/tools/libraryContextPolicyTools.test.ts tests/unit/tools/toolExecutor.test.ts tests/unit/tools/toolControls.test.ts tests/unit/tools/toolsetLibraryRevocation.test.ts tests/unit/chat/chatController.test.ts
```

Stop gate: realistic Italian/English/typoed multi-turn tool journeys green.

#### R8-D checkpoint — 2026-07-29

- Dedicated disabled-by-default `library_context_policy_update` uses a closed
  schema, `confirmation=always`, captured session ownership, optimistic
  revisions, bounded encrypted receipts, canonical-ID undo, and monotonic
  restoration.
- The realistic undo journey exposed a terminal `.` copied into the receipt
  ID. Exact lookup remains first; bounded sentence-punctuation fallback is
  scope/revision checked. Provider-payload assertions now run outside the
  transport mock, so production error handling cannot hide a failed test.
- Confirmed `scope=turn` mutations now refresh Library selection before the
  next provider round, append only live-authorized uploaded context, persist
  the refreshed provider-neutral turn and controller runtime together at the
  encrypted `before_model` boundary, disclose actual transmitted files, leave
  global/chat state unchanged, and do not leak into the next send.
- Focused R8-D gate: `8` files, `121` tests passed.
- Cumulative R8-A/B/C/D plus R9 regression gate: `26` files, `331` tests
  passed.
- `npm run typecheck`: passed.
- Scoped `git diff --check`: passed.
- No commit created.

### Slice R8-E — broad-mode topic guard

Inspection amendment before RED:

- Add `src/i18n/locales/en.ts` and `src/i18n/locales/it.ts` to the owned file
  list for the deterministic final abstention. A hard-coded language would
  violate the established system/selected-locale contract.
- `src/lib/chat/libraryPolicy.ts` adds public
  `TalosLibraryDocumentRelevance`, `TalosLibraryAnswerGuardTrace`,
  `shouldGuardTalosBroadLibraryAnswer()`, and extends
  `TalosLibraryContextDecision` with bounded `document_relevance`.
- `src/stores/chatController.ts` owns the private buffered first-draft adapter,
  one no-tool correction against the captured send snapshot, and the bounded
  `library_answer_guard` assistant-message metadata.
- The existing performance `TalosSendTrace` schema remains unchanged: its
  security boundary intentionally records timings/tool names but no prompt,
  topic, file, or answer semantics. The durable assistant metadata is the
  scoped per-send trace for this semantic correction.
- Translation keys: `chat.libraryAnswerGuardAbstention` in EN and IT.
- Rollback removes only the optional decision scores, private guard adapter,
  message metadata, translations, and the named tests below; broad selection,
  send snapshot, tools, receipts, and all earlier R8 slices remain intact.
- RED inspection amendment: the real abort journey proved that a Web
  `ReadableStream` reader may surface a generic error after its associated
  `AbortSignal` is already aborted. `buildChatCompletion()` checked only
  `error.name === 'AbortError'`, then launched the buffered fallback and a
  second inference. Add `src/lib/chat/chatCompletion.ts` and
  `tests/unit/chat/chatCompletionStreaming.test.ts` to ownership. Permanent
  scenario `P1-CTX-ISO-07 abort signal state wins over a wrapped stream error`
  must normalize the error to `AbortError` and prove the buffered adapter is
  never called. Rollback of this regression fix is independent of selector and
  guard logic.

RED:

- `P1-CTX-ISO-01 broad mode keeps all docs but preserves the OmniRoute topic`
- `P1-CTX-ISO-02 answer guard catches the iTerm/mock-GPS pivot`
- `P1-CTX-ISO-07 no retry after a tool action, abort, partial visible stream, or
  accepted relevant answer`

GREEN:

- mark broad-mode document scores without removing documents;
- put same-session topic anchor before the untrusted block and keep current
  `USER_TASK` final;
- buffer only the high-risk ambiguous/no-tool first draft;
- allow at most one correction call;
- never rerun tools, never retry after visible partial output, and record the
  bounded correction in trace metadata;
- abstain instead of returning a detected off-topic draft when correction also
  fails.

Focused command:

```text
npm run test:unit -- --run tests/unit/lib/libraryPolicy.test.ts tests/unit/chat/chatController.test.ts tests/unit/chat/chatStoreStreaming.test.ts
```

Stop gate: no duplicate inference on the ordinary path and no duplicate tool
side effect on any path.

#### R8-E checkpoint — 2026-07-29

- Broad compatibility still transmits every selected document. The selector
  additionally records bounded per-document lexical relevance without changing
  the transmitted set or rewriting legacy persisted policy.
- RED exposed a raw-substring false positive: Italian stopword `si` matched
  inside `simulare`, incorrectly treating the unrelated iTerm/mock-GPS draft as
  relevant. Unicode-normalized, punctuation-bounded tokens and a single bounded
  edit for tokens of at least five characters now preserve the intended
  `omnirouter` / `OmniRoute` typo match without accepting substring pivots.
- The high-risk broad-mode path buffers only the first no-tool draft. A relevant
  answer flushes unchanged; an off-topic answer receives exactly one no-tool
  correction using the immutable captured provider-neutral turns, provider,
  profile, Library payload, and send snapshot. A second off-topic answer becomes
  the localized deterministic EN/IT abstention.
- Any tool call disarms the guard before side effects. A visible partial stream
  is flushed exactly on error or abort and never retried. Legacy checkpoints
  without `document_relevance` remain parseable and safely skip the guard.
- The real abort RED exposed a second inference when a stream reader threw a
  generic error after its `AbortSignal` was already aborted. Signal state is now
  authoritative, normalized to an `AbortError`, and the buffered fallback is
  never invoked.
- Focused R8-E gate: `4` files, `91` tests passed.
- Cumulative R8-A/B/C/D/E plus R9 regression gate: `26` files, `338` tests
  passed.
- `npm run typecheck`: passed.
- Scoped R8-E `git diff --check`: passed. The full dirty-worktree command
  remains unsuitable as a slice claim because unrelated earlier CRLF conversion
  warnings return a non-zero status outside the R8-E ownership list.
- No commit created.

### Task 7 parity/provenance and browser verification checkpoint — 2026-07-29

- `docs/feature-parity.json` now records global/chat/one-turn/file policy,
  immutable send ownership, confirmed natural-language mutation, audit/undo,
  live revocation, bounded answer correction, and the explicit lexical-versus-
  semantic limitation. `npm run verify:parity` passed its `9/9` contract tests
  and returned no missing or invalid feature.
- `docs/upstream-provenance.md` records the R8 ADAPT/REJECT decision against the
  pinned Open WebUI, NotebookLM, OpenAI Vector Store, Azure AI Search,
  Anthropic Contextual Retrieval, MCP, OWASP, NIST, and OpenAI Library sources.
  No new runtime dependency or unpinned embedding model was introduced.
- Playwright adds the real human-visible global choice/reload path plus chat and
  one-turn/file overrides in the existing Library lifecycle. The first RED run
  was `8/10`: both failures were test-copy assumptions, while the captured
  accessibility snapshot proved the controls and files were present. The exact
  product strings (`Only when requested`; `Include … in the next message`) now
  bind the test to the existing localized accessible names.
- Corrected focused Playwright gate: `2/2` passed. Coordinated complete gate for
  `mobile-chat-files.e2e.spec.ts` and `mobile-settings-parity.e2e.spec.ts`:
  `10/10` passed.
- Production `npm run build`: passed, including `vue-tsc`, parity and initial
  bundle contracts. Initial JavaScript is `536,264 / 560,000` bytes; initial CSS
  is `136,268 / 150,000` bytes.
- Cumulative affected unit gate remains `26` files, `338` tests passed.
- Scoped Task 7 plus R8-E `git diff --check`: passed.
- No commit created; no Claude session or ticket was touched.

## Affected regression suites

```text
npm run test:unit -- --run \
  tests/unit/lib/libraryContext.test.ts \
  tests/unit/lib/libraryPolicy.test.ts \
  tests/unit/chat/sendSnapshot.test.ts \
  tests/unit/chat/chatStore.test.ts \
  tests/unit/chat/chatStoreStreaming.test.ts \
  tests/unit/chat/chatController.test.ts \
  tests/unit/chat/chatCompletion.test.ts \
  tests/unit/tools/libraryContextPolicyTools.test.ts \
  tests/unit/tools/toolExecutor.test.ts \
  tests/unit/tools/toolControls.test.ts \
  tests/unit/tools/toolsetLibraryRevocation.test.ts \
  tests/unit/tools/toolsetLibraryDiscovery.test.ts \
  tests/unit/theme/settingsStore.test.ts \
  tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts \
  tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts \
  tests/unit/chat/TalosMobileComposer.drawer.test.ts \
  tests/unit/chat/chatMediaPanel.test.ts \
  tests/unit/screens/contextScreen.test.ts \
  tests/unit/shell/appShell.test.ts
npm run typecheck
npm run build
git diff --check
```

Full affected unit suite follows if the focused list is green. Playwright is a
single-runner gate:

```text
npm run test:e2e -- tests/e2e/mobile-chat-files.e2e.spec.ts tests/e2e/mobile-settings-parity.e2e.spec.ts
```

## Real-upstream and human-visible gates

No new runtime upstream is integrated in R8. The real provider gate uses the
existing configured provider adapters and must prove:

- model A send accepted, then model B selected during delayed retrieval;
- first response, audit, and persisted message remain model/session A;
- next send uses model B;
- broad, smart, ask, and on-demand modes with one relevant and one newer
  irrelevant file;
- Italian and English short follow-ups, typoed Library command, reload, and
  encrypted persistence;
- denial/cancel/undo and policy conflict;
- mobile and tablet viewports, keyboard, focus return, and reduced motion.

The user performs final manual APK acceptance. No Claude ACK ticket is created
until every requested manual point is tested and the user explicitly authorizes
the ticket.

## Rollback

- No commit, reset, checkout, or destructive worktree command.
- Rollback is a scoped inverse patch limited to the exact files above.
- Legacy persisted state contains no mandatory migration and continues to
  resolve to broad/off under the old two-state switch.
- Removing the new optional policy fields returns control to the established
  broad/off behavior.
- A failure in R8-B through R8-E may roll back only that slice while retaining
  the independently verified R8-A race fix.
