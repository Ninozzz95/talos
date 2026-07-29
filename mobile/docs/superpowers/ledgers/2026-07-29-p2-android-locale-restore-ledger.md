# Execution ledger - P2-G Android locale restoration

- Subsystem: TALOS mobile localization and Android bridge
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi/mobile`
- Branch: `lane/kimi-mobile`
- Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pin: `androidx.appcompat:appcompat:1.7.1`
- Decision: adopt official AndroidX auto-storage and adapt its documented
  custom-store handoff behind the AVM-owned locale bridge.

## Exact file ownership

Create:

- `docs/superpowers/research/2026-07-29-p2-android-locale-restore-research.md`
- `docs/superpowers/specs/2026-07-29-p2-android-locale-restore-design.md`
- `docs/superpowers/ledgers/2026-07-29-p2-android-locale-restore-ledger.md`
- `tests/unit/services/nativeLocale.test.ts`

Modify:

- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/ai/talos/TalosLocalePlugin.java`
- `src/services/nativeLocale.ts`
- `tests/unit/i18n/localization.test.ts`
- `docs/upstream-provenance.md`

Delete: none.

## Public symbols

Add:

- `TalosNativeLocaleState.usesAppCompatStorage`
- `TalosNativeLocaleReconciliation`
- `reconcileTalosNativeLocaleMode(persistedMode, nativeState)`

Stable:

- `TalosLocalePlugin.getState()` and `setMode()`;
- `TalosLocaleMode = system | en | it`;
- preference keys and localization controller;
- Android locale config, application id, permissions and backup policy.

## RED and GREEN

RED:

```powershell
npx vitest run tests/unit/i18n/localization.test.ts
```

Expected failure: the app manifest has no official
`AppLocalesMetadataHolderService`/`autoStoreLocales` declaration.

Focused GREEN:

```powershell
npx vitest run tests/unit/i18n/localization.test.ts tests/unit/services/nativeLocale.test.ts
$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:testDebugUnitTest --tests ai.talos.TalosLocalePolicyTest
```

Affected and real integration gates:

```powershell
npx vitest run tests/unit/i18n tests/unit/settings/TalosMobileSettingsLanguagePanel.test.ts tests/unit/components/TalosMobileSetupIntro.test.ts
$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:processDebugMainManifest :app:processDebugResources :app:compileDebugJavaWithJavac
npm run typecheck
npm run build
npx playwright test tests/e2e/mobile-localization-onboarding.e2e.spec.ts
git diff --check
```

## Human-visible proof

On Android 12 or lower: choose Italian, force-stop/kill the process, relaunch
and verify both the first native frame and complete UI restore Italian; repeat
with English and System. On Android 13+: change TALOS to Italian, then choose
System in Android's App Language settings and verify cold relaunch follows the
device. Existing-upgrade migration must be checked with an APK that already has
an explicit `talos.mobile.locale`.

Manual proof is required before the Claude ACK ticket.

## Rollback

Remove only the metadata service, state field, reconciliation helper and tests.
No stored preference is deleted; older builds ignore AndroidX locale storage.

## Closure evidence

Fresh 2026-07-29 evidence:

- RED: official AndroidX storage service absent; 5 neighboring localization
  tests passed;
- focused manifest/reconciliation GREEN: 2 files, 12/12 tests;
- affected localization/onboarding/dictation regressions: 9 files, 57/57
  tests;
- `npm run typecheck`: passed;
- focused Android locale policy plus real manifest/resource/Java pipeline:
  `BUILD SUCCESSFUL`, 248 tasks, 8 executed and 240 up-to-date;
- generated merged and packaged debug manifests contain exactly the disabled,
  non-exported metadata service with `autoStoreLocales=true`;
- production build: 3,240 modules, initial JavaScript
  555,764/560,000 bytes, CSS 132,986/150,000 bytes, parity 9/9;
- localization/onboarding Playwright: 1/1;
- `git diff --check`: exit 0 (line-ending notices only).

Physical Android 12 cold-process restoration, upgrade handoff and Android 13+
system-Settings reset remain intentionally open for the final owner checklist.

Status: **CLOSED**.
