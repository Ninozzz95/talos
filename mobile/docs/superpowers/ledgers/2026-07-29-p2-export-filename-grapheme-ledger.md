# Execution ledger - P2-E grapheme-safe device export names

- Subsystem: TALOS device-save service and Android SAF policy
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi/mobile`
- Branch: `lane/kimi-mobile`
- Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pins: Unicode 17 / UAX #29 revision 47,
  `unicode-segmenter@0.15.0`, Java 21/OpenJDK EGC `BreakIterator`, Android
  platform ICU
- Decision: adopt the pinned JavaScript segmenter; adapt the platform
  character iterator behind the native policy.

## Exact file ownership

Create:

- `docs/superpowers/research/2026-07-29-p2-export-filename-grapheme-research.md`
- `docs/superpowers/specs/2026-07-29-p2-export-filename-grapheme-design.md`
- `docs/superpowers/ledgers/2026-07-29-p2-export-filename-grapheme-ledger.md`

Modify:

- `docs/upstream-provenance.md`
- `src/services/saveVaultFileToDevice.ts`
- `tests/unit/services/saveVaultFileToDevice.test.ts`
- `android/app/src/main/java/ai/talos/TalosFileExportPolicy.java`
- `android/app/src/test/java/ai/talos/TalosFileExportPolicyTest.java`

Delete: none.

## Symbols

Replace private compatibility implementation:

- TypeScript `safeUtf16Prefix` -> `safeGraphemePrefix`
- Java `safeUtf16Prefix` -> `safeGraphemePrefix`

Stable:

- synchronous `talosSafeExportName(value)`
- `saveTalosVaultFileToDevice`
- `TalosFileExportPolicy.safeDisplayName`
- plugin name/method/error codes
- 180-code-unit ceiling, short suffix, ASCII fallback and media-type policy

## RED and GREEN

RED:

```powershell
npx vitest run tests/unit/services/saveVaultFileToDevice.test.ts
$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:testDebugUnitTest --tests ai.talos.TalosFileExportPolicyTest
```

Expected failure: a 174-ASCII prefix plus `🇮🇹tail.pdf` becomes 174 ASCII
characters plus only `🇮` and `.pdf`.

Focused/affected GREEN:

```powershell
npx vitest run tests/unit/services/saveVaultFileToDevice.test.ts tests/unit/tools/libraryExportTools.test.ts
npm run typecheck
$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:testDebugUnitTest --tests ai.talos.TalosFileExportPolicyTest
$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:testDebugUnitTest --rerun-tasks
$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:compileDebugJavaWithJavac
npm run build
git diff --check
```

## Real-upstream and human proof

- Vitest executes the real pinned `splitGraphemes` path.
- JVM 21 executes the real EGC `BreakIterator`; Android source compiles against
  the API-26+ platform contract.
- Production manifest keeps `unicode-segmenter/grapheme` outside the initial
  closure and the unchanged 560,000-byte budget passes.
- On a physical phone export a long flag/emoji filename through Android
  Save-As and verify no partial glyph/replacement character and a preserved
  extension.

Manual phone proof is required before the Claude ACK ticket.

## Closure record

RED established independently:

- TypeScript: `EXPORT-NAME-EGC-01` returned one `🇮` before `.pdf`, and
  `EXPORT-NAME-EGC-03` removed ZWJ/ZWNJ; 8 compatibility tests remained green.
- Java: the same two scenarios failed while 7 compatibility tests remained
  green.

Fresh GREEN evidence:

- focused TypeScript policy: 10/10;
- focused Java policy: 9/9;
- affected device-save/Library/Chat Media/Context matrix: 59/59;
- `npm run typecheck`: passed;
- complete Android JVM gate with `--rerun-tasks`: 248 tasks executed,
  6 reports / 26 tests, zero failures, errors or skips;
- `:app:compileDebugJavaWithJavac`: passed;
- `npm run build`: exit 0, 3,240 modules transformed, parity 9/9;
- initial JavaScript 555,037 / 560,000 bytes and CSS
  132,986 / 150,000 bytes;
- real `unicode-segmenter/grapheme` remains a separate dynamic entry;
- chat-file Playwright gate: 3/3;
- scoped `git diff --check`: passed.

Physical Android Save-As inspection is intentionally not claimed and remains
in the owner checklist.

Status: **CLOSED**.

## Rollback

Restore only the two private prefix helpers, sanitizer character ranges and
their tests. No stored filename is rewritten and no schema migration exists.
