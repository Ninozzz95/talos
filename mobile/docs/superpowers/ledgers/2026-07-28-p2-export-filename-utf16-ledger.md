# Execution ledger - P2-B export filename UTF-16 integrity

- Subsystem: TALOS device-save service and Android SAF policy
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pins: Unicode 17.0, ECMAScript String definition, Java SE 17
  `Character`, inspected 2026-07-28
- Upstream decision: adapt surrogate-boundary detection behind both existing
  AVM-owned filename policy adapters.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p2-export-filename-utf16-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p2-export-filename-utf16-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p2-export-filename-utf16-ledger.md`

Modify:

- `mobile/src/services/saveVaultFileToDevice.ts`
- `mobile/tests/unit/services/saveVaultFileToDevice.test.ts`
- `mobile/android/app/src/main/java/ai/talos/TalosFileExportPolicy.java`
- `mobile/android/app/src/test/java/ai/talos/TalosFileExportPolicyTest.java`

Delete: none.

## Symbols and compatibility

Private additions:

- TypeScript `safeUtf16Prefix(value, maxCodeUnits)`
- Java `safeUtf16Prefix(String, int)`

Stable:

- `talosSafeExportName`
- `saveTalosVaultFileToDevice`
- `TalosFileExportPolicy.safeDisplayName`
- plugin name/method/error codes
- 180-code-unit limit and suffix/fallback rules

## Named RED scenarios

- `EXPORT-NAME-UTF16-01 TypeScript truncation never emits a lone surrogate`
- `EXPORT-NAME-UTF16-02 Java truncation never emits a lone surrogate`
- `EXPORT-NAME-UTF16-03 both runtimes preserve the same .pdf suffix/result`

Expected RED: each runtime returns 175 `a`, one lone high surrogate, and `.pdf`.

## RED commands

`npx vitest run tests/unit/services/saveVaultFileToDevice.test.ts`

`$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:testDebugUnitTest --tests ai.talos.TalosFileExportPolicyTest`

## GREEN and regression gates

Repeat both RED commands, then:

`npm run typecheck`

`$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:testDebugUnitTest --rerun-tasks`

`$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:compileDebugJavaWithJavac`

`git diff --check -- mobile/src/services/saveVaultFileToDevice.ts mobile/tests/unit/services/saveVaultFileToDevice.test.ts mobile/android/app/src/main/java/ai/talos/TalosFileExportPolicy.java mobile/android/app/src/test/java/ai/talos/TalosFileExportPolicyTest.java mobile/docs/superpowers/research/2026-07-28-p2-export-filename-utf16-research.md mobile/docs/superpowers/specs/2026-07-28-p2-export-filename-utf16-design.md mobile/docs/superpowers/ledgers/2026-07-28-p2-export-filename-utf16-ledger.md`

## Human proof

Use a long emoji-bearing generated filename in a physical Save-As flow and
confirm Android shows a clean suffix with no replacement glyph.

## Rollback

Restore only the two private helpers/calls and two regression assertions.

## Closure record

P2-A is CLOSED with 13/13 focused tests and direct UTF-8 probe evidence.

Status: RED TEST AUTHORIZED. Product implementation has not begun.

RED established independently on 2026-07-28:

- TypeScript focused Vitest: 1 expected failure, 7 compatibility tests passed;
- Java focused JVM test: 1 expected failure, 6 compatibility tests passed;
- each failed exact equality because the 176-unit stem ended in the lone high
  surrogate rendered as a replacement glyph before `.pdf`.

Status: RED. Mirrored private-helper implementation may begin.

GREEN evidence on 2026-07-28:

- TypeScript service Vitest: 8/8 tests passed;
- Java export-policy JVM test: 7/7 tests passed;
- full Android JVM suite with `--rerun-tasks`: 20/20 tests passed across five
  reports, zero failures/errors/skips;
- `npm run typecheck`: passed;
- `:app:compileDebugJavaWithJavac`: passed;
- scoped `git diff --check`: passed.

Both runtimes retain the same 180-code-unit/suffix contract and back off only
when the proposed boundary separates a valid high/low surrogate pair.

Status: CLOSED. Full pre-APK gates may begin.
