# Execution ledger - P0 storage relock recovery

- Subsystem: TALOS mobile persistence and diagnostics
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Inspected HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Upstream decision: adapt `@capacitor-community/sqlite@8.1.0` behind the
  existing AVM runtime; see the task-specific research dossier.
- Commit: forbidden unless the owner gives a fresh explicit authorization.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p0-storage-relock-recovery-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-storage-relock-recovery-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-storage-relock-recovery-ledger.md`

Modify:

- `mobile/src/repositories/sqliteChatRepository.ts`
- `mobile/src/lib/diagnostics/doctorSections.ts`
- `mobile/src/screens/DoctorScreen.vue`
- `mobile/tests/unit/repositories/sqliteChatRepository.test.ts`
- `mobile/tests/unit/screens/doctorSections.test.ts`

Delete: none.

## Symbols

- Preserve public `createSqliteChatRepository(...)` and every
  `TalosChatRepository` method.
- Change private `initialize()` and preserve private `db()` and transaction
  serialization.
- Add public pure function `talosStorageDoctorRow(...)`.
- Add public input interface `TalosStorageDoctorInput`.
- Preserve `TALOS_DOCTOR_SECTIONS`, `talosDoctorVerdict(...)`,
  `splitTalosDoctorRows(...)`, and diagnostics schema
  `talos.diagnostics/1`.
- Change `DoctorScreen.vue`'s private `scan()` only at construction of the
  storage row.

## RED scenarios

1. `P0 relock: a repository operation reacquires the runtime connection after
   the runtime replaces its wrapper`
   - First initialization returns wrapper A.
   - Simulated relock/unlock changes the runtime's authoritative wrapper to B.
   - A subsequent repository read must query B.
   - Expected failure before implementation: A is queried and
     `runtime.connect()` is called only once.
2. `P0 storage Doctor: reports a bounded recovery hint for a missing native
   connection`
   - Expected failure before implementation: formatter does not exist.
3. `P0 storage Doctor: reports unlock required without leaking arbitrary error
   text`
   - Expected failure before implementation: formatter does not exist.

## GREEN edit

- Remove the stale-local-reference early return from repository
  `initialize()`; continue using the in-flight promise as the concurrency
  fence and assign the current runtime result.
- Route Doctor storage-row construction through the pure formatter.
- Do not change `capacitorSqliteRuntime`, database schema, key handling, or
  destructive migration paths.

## Commands

RED:

`npx vitest run tests/unit/repositories/sqliteChatRepository.test.ts tests/unit/screens/doctorSections.test.ts`

Focused GREEN:

`npx vitest run tests/unit/repositories/sqliteChatRepository.test.ts tests/unit/persistence/capacitorSqliteRuntime.test.ts tests/unit/repositories/lazyChatRepository.test.ts tests/unit/services/databaseProtection.test.ts tests/unit/screens/doctorSections.test.ts tests/unit/chat/chatStore.test.ts tests/unit/screens/chatScreen.test.ts`

Affected regression:

`npm run typecheck`

`npm run test:unit`

`git diff --check`

Real-upstream gate:

- The pinned `@capacitor-community/sqlite@8.1.0` is exercised by the Android APK
  build and by the owner physical-device relock/unlock checklist. Unit doubles
  prove orchestration but do not replace that gate.

## Rollback

Revert only the five modified files listed above and remove the three new task
documents. No persisted state, schema, key, or migration rollback is required.

## Closure record

Automated implementation slice: **CLOSED 2026-07-28**.

- RED: 2 files, 27 tests; 4 expected failures and 23 passes.
  - Repository used wrapper A and called `runtime.connect()` once.
  - Three Doctor tests failed because `talosStorageDoctorRow()` did not exist.
- Focused GREEN: 2 files, 27/27 passed.
- Affected persistence/lock/chat/Doctor regression: 7 files, 99/99 passed.
- `npm run typecheck`: exit 0.
- First default full-unit run: 1981 passed, 5 skipped, 4 PDF-generation
  tests timed out at the fixed 5-second ceiling under 239-file host load.
- Exact four-file rerun: 31/31 passed in 3.87 seconds, proving no PDF product
  regression.
- Controlled complete suite:
  `npm run test:unit -- --maxWorkers=4` -> 237 files passed, 2 skipped;
  1985 tests passed, 5 skipped.
- `npm run build`: exit 0; 3203 modules transformed; initial JS
  550982/560000 bytes; initial CSS 129137/150000 bytes; parity 9/9 and ledger
  verification green.
- `git diff --check`: exit 0 before the closure-record update.
- Destructive operations, schema changes, key migrations, operation retries,
  and commits: none.

Physical-device acceptance remains deliberately deferred to the final APK
checklist so the owner can test every backlog item on one build. It does not
reopen this implementation slice. The Claude ACK ticket remains explicitly
forbidden until that owner gate passes for every item.
