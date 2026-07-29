# Execution ledger - P1 live Library revocation

Date: 2026-07-29  
Subsystem: TALOS mobile tools / encrypted Library  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED (automated; physical-device timing gate remains for owner)  
Commit policy: no commit without fresh owner authorization

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-p1-library-live-revocation-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-p1-library-live-revocation-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-p1-library-live-revocation-ledger.md`
- `mobile/tests/unit/tools/toolsetLibraryRevocation.test.ts`

Modify:

- `mobile/src/lib/tools/toolset.ts`
- `mobile/src/stores/chatController.ts`
- `mobile/tests/unit/chat/chatController.test.ts`

Delete:

- none

## Public symbols and compatibility

- add `TalosToolset.isEnabled(name, enabledTools)` as the canonical live
  per-tool/global policy query;
- preserve `createTalosToolset`, `TalosToolsetDeps.libraryEnabled`,
  `TalosToolset.offer`, `executeTalosTool`, all Library tool names and schemas,
  repository/Vault contracts, and settings persistence;
- add only private `libraryAllowed` and `requireLibraryEnabled` policy helpers;
- preserve absent-`libraryEnabled` compatibility as enabled.

## RED scenarios

1. `LIB-REVOKE-01 a throwing global policy source hides every Library tool`.
2. `LIB-REVOKE-02 revocation during a metadata read discards the returned
   summaries`.
3. `LIB-REVOKE-03 revocation during an image-byte read discards the image`.
4. `LIB-REVOKE-04 revocation during an export byte read never starts Save-As`.
5. `LIB-REVOKE-05 a call offered before withdrawal is denied by the realistic
   controller before any Library source executes`.
6. Existing Library discovery, pagination, read, export, permission, audit,
   provider-loop, and non-Library tool tests remain green.

Expected pre-fix failures:

- `offer()` throws when the settings callback throws;
- list/read/export return or save data after the callback changes to false;
- the controller executes a Library call returned after the switch is off.

## Focused GREEN commands

```powershell
npx vitest run tests/unit/tools/toolsetLibraryRevocation.test.ts tests/unit/chat/chatController.test.ts
npx vitest run tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/tools/libraryExportTools.test.ts tests/unit/tools/toolExecutor.test.ts tests/unit/tools/readTools.test.ts tests/unit/lib/libraryContext.test.ts
npm run typecheck
npm run build
git diff --check -- src/lib/tools/toolset.ts src/stores/chatController.ts tests/unit/tools/toolsetLibraryRevocation.test.ts tests/unit/chat/chatController.test.ts docs/superpowers/research/2026-07-29-p1-library-live-revocation-research.md docs/superpowers/specs/2026-07-29-p1-library-live-revocation-design.md docs/superpowers/ledgers/2026-07-29-p1-library-live-revocation-ledger.md
```

## Real-upstream and human-visible gate

On the physical Android build:

- enable Library chat access and send a natural-language request that causes a
  Library list/read;
- before the model returns its tool call, disable Library chat access;
- verify no file data appears, no export picker opens, and diagnostics/audit
  records a denial;
- re-enable access and verify a new request succeeds;
- repeat with app lock during a read and confirm the existing locked-storage
  error remains distinct.

Automation controls the exact interleavings; it does not replace this owner's
timing and native-device acceptance gate.

## Rollback

Revert only the two product files and two test files listed above, then remove
these three task documents. No schema, stored setting, Vault content, or native
file requires rollback.

## RED evidence

Fresh pre-fix command on 2026-07-29:

```text
npx vitest run tests/unit/tools/toolsetLibraryRevocation.test.ts tests/unit/chat/chatController.test.ts

2 test files failed
5 expected revocation tests failed
40 compatibility tests passed
```

Observed boundaries:

- `LIB-REVOKE-01`: the settings callback exception escaped `offer()`;
- `LIB-REVOKE-02`: summaries returned after withdrawal produced a successful
  list result;
- `LIB-REVOKE-03`: image bytes returned after withdrawal reached the tool
  result;
- `LIB-REVOKE-04`: device Save-As started after the byte read disabled access;
- `LIB-REVOKE-05`: the realistic controller called the Library repository
  after the provider response had withdrawn the setting.

Every failure matches the ledger and the 40 pre-existing controller scenarios
remain green. Product implementation may begin.

## Plan amendment - persisted audit projection

The first post-fix run reached 44/45. All five security boundaries behaved
correctly, including zero repository calls after controller withdrawal. The
remaining assertion expected the executor's internal `denied` status verbatim
in `TalosToolActivity.status`.

The established repository projection deliberately stores every non-success as
`status: failed` and preserves the precise executor state in
`payload.outcome: denied`. The controller test is amended to assert that
existing two-field contract. No product or audit behavior is changed.

## Plan amendment - initial bundle budget

The behavior and type gates passed, and Vite compiled 3,239 modules, but the
initial chunk budget rejected:

```text
TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED: 560031 bytes exceeds 560000 bytes
```

The 560,000-byte limit is unchanged. Four pre-access guard calls duplicate the
post-`await` guard that ran immediately before them with only synchronous
lookup/branching in between. JavaScript run-to-completion means the settings
state cannot change between those statements. The duplicate calls are removed
while retaining:

- a guard before and after every independently awaited metadata/content/byte
  boundary;
- a post-byte guard before Save-As;
- controller execution-time denial;
- fail-closed offer behavior.

This is a behavior-neutral compaction inside the already owned toolset file.

## Plan amendment - canonical lazy execution policy

The next build remained exactly 560,031 bytes because the removed calls live in
the separately loaded `toolset` chunk. The 84-byte initial-entry increase is
the controller's duplicated Agent Tools plus global-Library expression and its
runtime import.

The plan is amended to expose `TalosToolset.isEnabled(name, enabledTools)`.
`offer()` and execution both delegate to this one dynamic decision. The
controller retains only the `TalosAgentToolEnabled` type import, while policy
code and its runtime dependency remain in the already lazy toolset chunk.

This strengthens the no-drift authorization boundary and is expected to return
the initial entry under its unchanged budget. The new method is covered by the
same offer-time and execution-time RED scenarios.

## GREEN evidence

Fresh post-fix evidence on 2026-07-29:

```text
focused revocation/controller matrix: 2 files, 45/45 passed
Library discovery/export/executor/read/context regressions: 5 files, 58/58 passed
vue-tsc typecheck: passed
Vite production build: passed, 3,239 modules
initial JavaScript: 559,957 / 560,000 bytes
initial CSS: 132,986 / 150,000 bytes
feature parity: 9/9
git diff --check (exact owned files): passed
```

The automated interleavings now prove:

- a broken policy callback hides every Library tool without throwing;
- metadata and image bytes returned after withdrawal are discarded;
- a withdrawn export never reaches native Save-As;
- a call legitimately offered before withdrawal is denied at execution, with
  zero later Library source calls;
- the persisted audit records `status: failed` plus
  `payload.outcome: denied`;
- re-enabled and non-Library compatibility paths remain green.

No provider key, physical Vault, or Android picker was used by automation. The
owner's real-device timing gate remains open for the final APK checklist, so no
Claude ACK ticket may be produced yet.
