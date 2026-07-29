# R9 Nonblocking Tool Authorization — Code-Level Ledger

Date: 2026-07-29  
Status: automated gates complete; owner APK validation pending  
Lane: `lane/kimi-mobile` only  
Commit policy: Codex must not commit  
Research pin:
`docs/superpowers/research/2026-07-29-r9-tool-authorization-nonblocking-research.md`  
Design pin:
`docs/superpowers/specs/2026-07-29-r9-tool-authorization-nonblocking-design.md`

## Owned subsystem

- TALOS mobile canonical tool executor and provider-neutral agent loop.
- Encrypted local tool-activity persistence.
- Mobile Settings grant metadata.
- Non-modal TALOS UI authorization presentation.

No desktop/backend/core/validator/Claude-session file is in scope.

## Public contracts

### `src/lib/tools/toolAuthorizations.ts`

Add:

- `TalosToolAuthorizationGrantV1`
- `TalosToolAuthorizationGrantsV1`
- `TalosToolAuthorizationDecision`
- `TalosToolAuthorizationRequestV1`
- `TalosToolAuthorizationResolution`
- `TALOS_EMPTY_TOOL_AUTHORIZATIONS`
- `parseTalosToolAuthorizationGrants()`
- `applyTalosToolAuthorizationGrant()`
- `revokeTalosToolAuthorizationGrant()`
- `resolveTalosToolAuthorization()`
- `canonicalizeTalosToolAuthorizationInput()`
- `digestTalosToolAuthorizationInput()`

### `src/lib/tools/toolAuthorizationCheckpoint.ts`

Add:

- `TalosToolAuthorizationCheckpointV1`
- `TalosToolAuthorizationCheckpointPhase`
- `TalosToolAuthorizationPendingView`
- `TalosToolAuthorizationRecoveryView`
- `parseTalosToolAuthorizationCheckpoint()`
- `createTalosToolAuthorizationCoordinator()`

Coordinator methods:

- `hydrate()`
- `suspend()`
- `pending()`
- `recoveries()`
- `decide(requestId, 'allow_once' | 'always_allow' | 'deny')`
- `markRunningTools(checkpointId)`
- `saveBeforeModel(checkpointId, checkpoint)`
- `complete(checkpointId)`
- `cancel(checkpointId)`
- `retryRecovery(checkpointId)`

### Executor and loop

Add:

- `preflightTalosToolExecution()`
- `TalosToolExecutionPreflight`
- `TalosAgentLoopCheckpointV1`
- `TalosAgentLoopSuspension`
- `resumeTalosAgentLoop()`

Amend `TalosAgentLoopDeps` with:

- `preflight(call)`
- `onBeforeModelCheckpoint?(checkpoint)`

Amend `TalosAgentLoopOutcome` with optional `suspension`.

### Settings and controller

Add `tool_authorizations` to `TalosMobileSettingsState`.

Add:

- `SettingsStore.grantToolAuthorization(tool, actions)`
- `SettingsStore.revokeToolAuthorization(tool)`
- `ChatController.pendingToolAuthorizations`
- `ChatController.toolAuthorizationRecoveries`
- `ChatController.decideToolAuthorization(requestId, decision)`
- `ChatController.dismissToolAuthorization(requestId)`
- `ChatController.retryToolAuthorization(checkpointId)`
- `ChatController.cancelToolAuthorization(checkpointId)`

Remove the behavioral use of:

- `writeConsentGrantedFor`
- parked `askOnce()` Promise
- `createTalosConsentQueue()` in controller execution

The existing exported queue module may remain for compatibility until its
tests and imports prove it has no consumer; deletion requires a ledger
amendment.

### Chat continuation

Add `ChatStore.continueFromCheckpoint()` as a queued, owner-session-bound
assistant continuation. It never appends a synthetic user message and never
uses the currently selected session/model in place of the checkpoint identity.

## Exact file ownership

### Create

1. `src/lib/tools/toolAuthorizations.ts`
2. `src/lib/tools/toolAuthorizationCheckpoint.ts`
3. `tests/unit/tools/toolAuthorizations.test.ts`
4. `tests/unit/tools/toolAuthorizationCheckpoint.test.ts`
5. `tests/unit/chat/toolAuthorizationContinuation.test.ts`
6. `docs/superpowers/research/2026-07-29-r9-tool-authorization-nonblocking-research.md`
7. `docs/superpowers/specs/2026-07-29-r9-tool-authorization-nonblocking-design.md`
8. `docs/superpowers/ledgers/2026-07-29-r9-tool-authorization-nonblocking-ledger.md`
9. `docs/superpowers/plans/2026-07-29-r9-tool-authorization-nonblocking-plan.md`
10. `tests/unit/chat/agentLoop.test.ts`
11. `src/components/chat/TalosMobileToolAuthorizationRecoveryCard.vue`
12. `tests/unit/chat/TalosMobileToolAuthorizationRecoveryCard.test.ts`

### Modify

1. `src/lib/tools/permissionTypes.ts`
2. `src/lib/tools/registry.ts`
3. `src/lib/tools/executor.ts`
4. `src/lib/tools/agentLoop.ts`
5. `src/lib/tools/toolset.ts`
6. `src/stores/settings.ts`
7. `src/stores/chat.ts`
8. `src/stores/chatController.ts`
9. `src/repositories/chatRepository.ts`
10. `src/repositories/memoryChatRepository.ts`
11. `src/repositories/sqliteChatRepository.ts`
12. `src/repositories/lazyChatRepository.ts`
13. `src/components/chat/TalosMobileToolConsentSheet.vue`
14. `src/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue`
15. `src/App.vue`
16. `src/i18n/locales/en.ts`
17. `src/i18n/locales/it.ts`
18. `tests/unit/tools/toolExecutor.test.ts`
19. `tests/unit/tools/toolControls.test.ts`
20. `tests/unit/tools/consentQueue.test.ts`
21. `tests/unit/chat/chatController.test.ts`
22. `tests/unit/chat/chatStore.test.ts`
23. `tests/unit/theme/settingsStore.test.ts`
24. `tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts`
25. `tests/unit/shell/appShell.test.ts`
26. `tests/unit/repositories/chatRepository.contract.ts`
27. `tests/unit/repositories/sqliteChatRepository.test.ts`
28. `tests/e2e/mobile-agent-tools.e2e.spec.ts`
29. `docs/feature-parity.json`
30. `docs/upstream-provenance.md`
31. `docs/superpowers/ledgers/2026-07-29-r8-additive-library-context-policy-ledger.md`
32. `scripts/verify-initial-chunk.mjs`
33. `tests/unit/build/initialChunkContract.test.ts`

### Delete

None initially.

If inspection proves a file unnecessary or reveals another exact owner, amend
this list and record the reason before editing that product file.

Inspection amendment: `tests/unit/chat/agentLoop.test.ts` did not exist. It is
therefore moved from Modify to Create before its RED scenarios are written.

UI inspection amendment: the consent component had no focused unit test.
Create `tests/unit/chat/TalosMobileToolConsentSheet.test.ts` to prove non-modal
semantics, all three decisions, “Later”, bounded arguments, and pending count.

Recovery inspection amendment: the encrypted coordinator correctly refuses to
auto-resume an uncertain `running_tools` checkpoint, but no controller/UI
surface exposes the required explicit retry or cancel choice. Create
`TalosMobileToolAuthorizationRecoveryCard.vue` and its focused test; expose a
bounded checkpoint-level recovery view plus controller retry/cancel methods.
This closes the existing design contract without changing tool execution
semantics.

Build-gate amendment: after R9-E3, production compilation succeeded but the
established initial-JavaScript gate failed at `597,743 > 560,000` bytes.
Source-map attribution identified the optional procedural-motion component
tree as the smallest existing supported split boundary that clears the full
overage. Modify App wiring plus the build verifier and its fixture test; keep
the static themed background immediate, retain the existing byte ceiling, and
record the current Vue/Vite upstream decision in the research dossier.

## Named RED scenarios

1. `TOOL-AUTH-01 enabled ask tool suspends without executing`
2. `TOOL-AUTH-02 foreground send releases after durable checkpoint`
3. `TOOL-AUTH-03 allow once is exact-call and single-use`
4. `TOOL-AUTH-04 always allow persists per exact tool and survives reload`
5. `TOOL-AUTH-05 always grant does not authorize another tool`
6. `TOOL-AUTH-06 new required action invalidates old grant coverage`
7. `TOOL-AUTH-07 deny and disabled tool override every grant`
8. `TOOL-AUTH-08 raw/corrupt/unknown grant fails closed`
9. `TOOL-AUTH-09 input digest or call-ID mismatch cannot consume approval`
10. `TOOL-AUTH-10 concurrent tool round executes nothing before all decisions`
11. `TOOL-AUTH-11 independent decisions preserve provider call order`
12. `TOOL-AUTH-12 denial becomes typed tool result, not exception`
13. `TOOL-AUTH-13 process reload restores pending request`
14. `TOOL-AUTH-14 uncertain side effect never auto-retries`
15. `TOOL-AUTH-15 post-tool checkpoint resumes model without rerunning tool`
16. `TOOL-AUTH-16 final assistant receipt reconciles interrupted close`
17. `TOOL-AUTH-17 approval stays on originating session/model after navigation`
18. `TOOL-AUTH-18 card is non-modal and composer remains usable`
19. `TOOL-AUTH-19 dismiss means later, not deny`
20. `TOOL-AUTH-20 Settings exposes and revokes saved exact-tool grant`
21. `TOOL-AUTH-21 EN/IT copy and accessible names are structurally complete`
22. `TOOL-AUTH-22 existing allow/deny/tool-toggle/provider schemas regress none`
23. `TOOL-AUTH-23 app re-lock hides arguments without changing the decision`
24. `TOOL-AUTH-24 generated marker save uses the same nonblocking grant model`
25. `TOOL-AUTH-25 uncertain checkpoint exposes explicit retry or cancel`
26. `TOOL-AUTH-26 optional procedural background stays outside initial graph`
27. `TOOL-AUTH-27 agent-tool description is a native switch label target`

## Sequential gates

### R9-E1 — pure grant and checkpoint contracts

RED first: `TOOL-AUTH-03` through `TOOL-AUTH-09`, `TOOL-AUTH-13`.

Focused gate:

```text
npm run test:unit -- --run tests/unit/tools/toolAuthorizations.test.ts tests/unit/tools/toolAuthorizationCheckpoint.test.ts tests/unit/theme/settingsStore.test.ts tests/unit/repositories/sqliteChatRepository.test.ts
```

Stop: parsing, persistence, and precedence all green.

#### R9-E1 checkpoint — 2026-07-29

- RED reproduced missing grant/settings/checkpoint contracts.
- Added RFC 8785 canonical input plus SHA-256 binding, exact tool/action
  grants, deny precedence, optimistic revision checks, transactional
  Preferences publication, and activity-backed checkpoint recovery.
- Focused gate: `3` files, `43` tests passed.
- `npm run typecheck`: passed.
- No commit created.

### R9-E2 — executor and loop suspension

RED first: `TOOL-AUTH-01`, `10`, `11`, `12`, `14`, `15`.

Focused gate:

```text
npm run test:unit -- --run tests/unit/tools/toolExecutor.test.ts tests/unit/chat/agentLoop.test.ts tests/unit/chat/toolAuthorizationContinuation.test.ts
```

Stop: no side effect occurs before checkpoint; uncertain work never retries.

#### R9-E2 checkpoint — 2026-07-29

- RED reproduced the former in-memory behavior: unresolved calls still ran,
  mixed parallel rounds partially executed, and no resume entry point existed.
- Added whole-round preflight, serializable `before_tools` / `before_model`
  agent-loop checkpoints, exact resume without duplicate tool execution, and
  provider-order preservation under bounded parallelism.
- Added owner-session/model-bound `ChatStore.continueFromCheckpoint()`: it
  queues behind an active send, appends no synthetic user turn, and reconciles
  a previously persisted checkpoint receipt without provider re-egress.
- Focused gate: `3` files, `23` tests passed.
- Agent-loop compatibility gate: `4` files, `23` tests passed.
- Chat-store regression gate: `3` files, `30` tests passed.
- `npm run typecheck`: passed.
- No commit created.

### R9-E3 — controller and non-modal UI

RED first: `TOOL-AUTH-02`, `16` through `26`.

Focused gate:

```text
npm run test:unit -- --run tests/unit/chat/chatController.test.ts tests/unit/chat/chatStore.test.ts tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts tests/unit/shell/appShell.test.ts
```

Stop: composer usable while pending, origin ownership stable, grant revocable,
and generated-marker path governed by the same contract.

#### R9-E3 checkpoint — 2026-07-29

- RED reproduced the missing recovery surface:
  `gate.recoveries is not a function`, missing controller state, and missing
  recovery component.
- `TOOL-AUTH-25` now exposes encrypted `running_tools` checkpoints without raw
  arguments, never auto-retries them, and provides explicit retry/cancel/later.
- `TOOL-AUTH-26` reproduced the build budget failure at
  `597,743 > 560,000` bytes. The standards-backed async procedural-background
  boundary reduced the production entry to `517,319` bytes; CSS is
  `135,954 / 150,000` bytes. The ceiling was not raised.
- `TOOL-AUTH-27` reproduced the real Playwright row-tap failure. A native
  full-row label now owns the checkbox target while the revoke button remains
  a separate interactive control.
- Focused authorization/UI gate: `12` files, `163` tests passed.
- Complete affected regression gate after all amendments: `18` files,
  `211` tests passed.
- Production build, initial-chunk contract, script suite, and parity ledger:
  passed.
- Playwright `tests/e2e/mobile-agent-tools.e2e.spec.ts`: `1/1` passed after a
  fresh production build.
- `git diff --check`: exit `0`; only repository line-ending conversion
  warnings were emitted.
- No commit was created. Real-device, TalkBack, lock/reload, provider, and APK
  checks remain owner-manual gates.

## Affected regression gate

```text
npm run test:unit -- --run tests/unit/tools/toolAuthorizations.test.ts tests/unit/tools/toolAuthorizationCheckpoint.test.ts tests/unit/tools/toolExecutor.test.ts tests/unit/tools/toolControls.test.ts tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/tools/toolsetLibraryRevocation.test.ts tests/unit/chat/agentLoop.test.ts tests/unit/chat/toolAuthorizationContinuation.test.ts tests/unit/chat/chatController.test.ts tests/unit/chat/chatStore.test.ts tests/unit/chat/streamingBelongsToItsChat.test.ts tests/unit/theme/settingsStore.test.ts tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts tests/unit/shell/appShell.test.ts tests/unit/repositories/sqliteChatRepository.test.ts
npm run typecheck
npm run build
git diff --check
```

Playwright remains a coordinated single-runner gate:

```text
npm run test:e2e -- tests/e2e/mobile-agent-tools.e2e.spec.ts
```

## Human-visible and real-upstream proof

- Real configured provider asks for two independent tools in one round.
- Neither executes before decisions.
- Chat accepts another normal message while the card remains pending.
- Allow once executes only the exact first call.
- Always allow executes the exact second tool and suppresses only its later
  matching prompt.
- Action deny and tool disable revoke execution live.
- Reload restores pending state; Settings shows and revokes saved grant.
- Phone/tablet, keyboard, TalkBack labels, app re-lock, Stop, offline/provider
  failure, and process-restart recovery are checked.

The final APK remains subject to the owner’s manual checklist. The Claude ACK
ticket is forbidden until every requested manual check passes and the owner
explicitly authorizes ticket creation.

## Rollback

- No commit/reset/checkout.
- Remove optional grant/checkpoint state and restore the former blocking path
  only through a scoped inverse patch if this slice fails before release.
- Missing new settings fields continue to parse as empty.
- No database schema migration is introduced; encrypted tool-activity rows use
  the existing table and can remain as inert audit history after rollback.
- Never auto-delete an unresolved or recovery-required activity.
