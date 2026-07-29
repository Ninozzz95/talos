# Execution ledger - P1-C3 native export runtime guard test

- Subsystem: TALOS Android Storage Access Framework adapter
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pins:
  - Android local JVM testing guide, inspected 2026-07-28
  - Android Storage Access Framework guide, inspected 2026-07-28
  - Capacitor Android plugin guide, runtime remains 8.0.10
- Upstream decision: retain direct SAF/Capacitor integration and adapt the
  post-picker decision behind the existing pure Java policy seam.

## Exact file ownership

Create:

- `mobile/docs/superpowers/ledgers/2026-07-28-p1-native-export-runtime-test-ledger.md`

Modify:

- `mobile/android/app/src/main/java/ai/talos/TalosFileExportPolicy.java`
- `mobile/android/app/src/main/java/ai/talos/TalosFileExportPlugin.java`
- `mobile/android/app/src/test/java/ai/talos/TalosFileExportPolicyTest.java`

Delete: none.

## Symbols and compatibility

Package-private additions in `TalosFileExportPolicy`:

- `UNTRUSTED_SOURCE`
- `SIZE_MISMATCH`
- `stagedSourceFailure(File, File, long)`
- `postPickerSourceFailure(File, File, long, Runnable)`

Stable:

- Capacitor plugin name `TalosFileExport`;
- `saveFile(PluginCall)`;
- callback `saveFileResult(PluginCall, ActivityResult)`;
- TypeScript error codes;
- SAF `ACTION_CREATE_DOCUMENT`;
- best-effort destination deletion.

## Named RED scenarios

- `EXPORT-RUNTIME-01 untrusted post-picker source executes cleanup once`
- `EXPORT-RUNTIME-02 changed-size post-picker source executes cleanup once`
- `EXPORT-RUNTIME-03 exact trusted source executes no cleanup`
- `EXPORT-RUNTIME-04 source-text inspection is absent`

Current expected failure: the production runtime methods do not exist and the
test substitutes source-string inspection.

## RED command

`.\gradlew.bat :app:testDebugUnitTest --tests ai.talos.TalosFileExportPolicyTest`

## GREEN and regression gates

Repeat RED command, then:

`.\gradlew.bat :app:testDebugUnitTest`

`.\gradlew.bat :app:compileDebugJavaWithJavac`

`git diff --check -- mobile/android/app/src/main/java/ai/talos/TalosFileExportPolicy.java mobile/android/app/src/main/java/ai/talos/TalosFileExportPlugin.java mobile/android/app/src/test/java/ai/talos/TalosFileExportPolicyTest.java mobile/docs/superpowers/ledgers/2026-07-28-p1-native-export-runtime-test-ledger.md`

Final pre-APK closure repeats native tests, Capacitor sync, and assemble.

## Human proof

The owner performs cancel and successful Save-As on the physical APK. A
post-picker source substitution cannot be safely induced in ordinary manual
use; the runtime JVM guard test is the deterministic evidence for that fault.

## Rollback

Restore inline plugin guards and prior policy/test shape. No stored files or
permissions change.

## Closure record

P1-C1 and P1-C2 closed on 2026-07-28 with their focused, adjacent, rendered,
typecheck, and diff gates green.

Status: RED TEST AUTHORIZED. Product implementation has not begun.

The first Gradle invocation was rejected before compilation because the host
defaulted to JDK 11. Re-running with the repository-local Temurin
`21.0.11+10` reached the intended RED:

- test compilation failed on the four deliberately absent policy symbols;
- six references failed (`UNTRUSTED_SOURCE`, `SIZE_MISMATCH`,
  `stagedSourceFailure`, and `postPickerSourceFailure`);
- no runtime assertion executed and no unrelated production compilation failed.

Status: RED. Minimal product implementation may begin.

GREEN evidence on 2026-07-28 with repository-local Temurin `21.0.11+10`:

- focused `TalosFileExportPolicyTest`: 6/6 runtime tests passed;
- full Android JVM suite with `--rerun-tasks`: 19/19 tests passed across five
  reports, with zero failures/errors/skips;
- `:app:compileDebugJavaWithJavac`: passed;
- scoped `git diff --check`: passed.

Both pre-picker and post-picker guards now call the pure policy decision. The
post-picker seam executes destination cleanup exactly once for an untrusted or
size-changed source and never for an exact trusted source. Source-text
inspection and its filesystem imports are absent.

Status: CLOSED. P2 review findings may begin.
