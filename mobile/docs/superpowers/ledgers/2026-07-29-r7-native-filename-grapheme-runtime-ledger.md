# Execution ledger - R7 native filename grapheme runtime

Date: 2026-07-29
Subsystem: TALOS Android SAF export policy
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED in automation; physical Android Save-As remains in the owner
checklist
Commit policy: no commit without fresh owner authorization
Upstream pins: Unicode 17 / UAX #29 revision 47, Android API 26+ ICU regex,
Java SE 17 `Pattern \X`

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-native-filename-grapheme-runtime-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-native-filename-grapheme-runtime-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-native-filename-grapheme-runtime-ledger.md`

Modify:

- `mobile/android/app/src/main/java/ai/talos/TalosFileExportPolicy.java`
- `mobile/android/app/src/test/java/ai/talos/TalosFileExportPolicyTest.java`
- `mobile/docs/upstream-provenance.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

Delete:

- none

## Public symbols and compatibility

- Preserve `TalosFileExportPolicy.safeDisplayName(String)`.
- Preserve `TalosFileExportPlugin.saveFile`, bridge name, request/response
  fields, error codes and Android SAF intent.
- Replace only private `safeGraphemePrefix` internals and the private imported
  standard class.
- Add no public class/method, dependency, permission, schema or resource.

## RED evidence

Compile and run the exact current policy/test source with installed
`C:\Program Files\Eclipse Adoptium\jdk-17.0.4.101-hotspot`:

```text
Tests run: 9
Failures: 1
neverRetainsHalfAFlagAtTheBoundedFilenameStem
8 compatibility tests passed
```

The same existing fixture passes under JDK 21, proving the defect is a runtime
semantic dependency rather than missing test coverage.

After adding the broader cluster matrix and before the implementation:

```text
Installed JDK 17
Tests run: 10
Failures: 2
8 compatibility tests passed
```

## Focused GREEN and affected gates

```powershell
# Standalone JDK 17 compile/JUnit of policy + focused test
$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'
.\gradlew.bat :app:testDebugUnitTest --tests ai.talos.TalosFileExportPolicyTest
.\gradlew.bat :app:compileDebugJavaWithJavac
npx vitest run tests/unit/lib/fileNamePolicy.test.ts tests/unit/services/saveVaultFileToDevice.test.ts tests/unit/tools/libraryExportTools.test.ts
npm run typecheck
git diff --check -- android/app/src/main/java/ai/talos/TalosFileExportPolicy.java android/app/src/test/java/ai/talos/TalosFileExportPolicyTest.java docs/upstream-provenance.md
git diff --check
```

The coordinated final gate runs all Android unit tests and assembles the APK.

## Closure evidence

Fresh 2026-07-29 evidence:

```text
Installed Temurin JDK 17 direct compile/JUnit:
10 / 10 passed

Pinned Temurin JDK 21 Android Gradle focused gate:
10 / 10 passed
BUILD SUCCESSFUL
248 tasks, 5 executed and 243 up-to-date

Affected TypeScript filename/device-save/tool matrix:
3 files passed
22 tests passed

npm run typecheck:
passed

app:compileDebugJavaWithJavac:
executed successfully inside the focused Gradle gate

focused git diff --check:
passed

repository git diff --check:
passed (line-ending notices only)
```

The native policy now advances exclusively by standard `\X` matcher ends.
There is no custom grapheme algorithm or new dependency.

## Human-visible proof

On a physical supported Android device, export names whose limit falls inside
an Italian flag, a family ZWJ emoji, a keycap, an emoji with skin-tone modifier,
and a combining accent. The picker and returned display name must contain
either the entire cluster or none of it, retain the extension, and never show a
replacement glyph.

Manual proof remains required before the Claude ACK ticket.

## Rollback

Restore only the private iterator/import and focused test additions. There is
no persisted migration or destructive cleanup.
