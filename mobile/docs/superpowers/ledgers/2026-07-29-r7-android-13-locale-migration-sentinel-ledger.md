# Execution ledger - R7 Android 13 locale migration sentinel

Date: 2026-07-29
Subsystem: TALOS mobile localization / Android bridge adapter
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED in automation; physical upgrade verification remains in the
owner checklist
Commit policy: no commit without fresh owner authorization
Upstream pins: `androidx.appcompat:appcompat:1.7.1`,
`@capacitor/preferences@8.0.1`

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-android-13-locale-migration-sentinel-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-android-13-locale-migration-sentinel-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-android-13-locale-migration-sentinel-ledger.md`

Modify:

- `mobile/src/services/nativeLocale.ts`
- `mobile/tests/unit/services/nativeLocale.test.ts`
- `mobile/docs/upstream-provenance.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

Delete:

- none

## Public symbols and compatibility

- Preserve `TalosLocalePlugin.getState()` and `setMode()`.
- Preserve `TalosLocaleMode`, `TalosNativeLocaleState`, visible language
  picker behavior, old locale/mirror keys, and `usesAppCompatStorage`.
- Extend `TalosNativeLocaleReconciliation` with
  `markMigrationComplete: boolean`.
- Extend `reconcileTalosNativeLocaleMode()` with the explicit
  `migrationComplete` input.
- Add no native class, permission, dependency, locale, or schema migration.

## Baseline

Fresh 2026-07-29 command:

```text
npx vitest run tests/unit/services/nativeLocale.test.ts tests/unit/i18n/localization.test.ts

2 files passed
12 tests passed
```

## RED tests and expected failures

1. `ANDROID-LOCALE-MIGRATION-01` fails because Android 13 native empty always
   wins and no handoff is returned.
2. `ANDROID-LOCALE-MIGRATION-02` protects intentional System after completion.
3. `ANDROID-LOCALE-MIGRATION-03` proves native explicit wins and completes the
   marker.
4. `ANDROID-LOCALE-MIGRATION-04` proves unknown generation cannot seal state.
5. `ANDROID-LOCALE-MIGRATION-05` exercises hydration ordering: rejected native
   handoff writes no sentinel and the next launch remains retryable.

## Focused GREEN and regression gates

```powershell
npx vitest run tests/unit/services/nativeLocale.test.ts tests/unit/i18n/localization.test.ts
npx vitest run tests/unit/i18n tests/unit/settings/TalosMobileSettingsLanguagePanel.test.ts tests/unit/components/TalosMobileSetupIntro.test.ts
npx playwright test tests/e2e/mobile-localization-onboarding.e2e.spec.ts
npm run typecheck
npm run build
git diff --check -- src/services/nativeLocale.ts tests/unit/services/nativeLocale.test.ts docs/upstream-provenance.md
git diff --check
```

No Android Java or manifest source changes in this slice; the already verified
real `TalosLocale` bridge is exercised through the TypeScript hydration
contract. Final Android assembly remains a coordinated full-program gate.

## RED and closure evidence

Fresh 2026-07-29 evidence:

```text
RED after permanent scenarios:
1 file failed
9 expected locale tests failed
6 compatibility tests passed

Focused GREEN:
2 files passed
15 tests passed

Affected localization/onboarding regressions:
6 files passed
29 tests passed

Playwright localization/onboarding:
1 test passed

npm run typecheck:
passed

npm run build:
3,240 modules transformed
initial JavaScript 557,756 / 560,000 bytes
initial CSS 133,209 / 150,000 bytes
parity ledger 9 / 9 tests passed

focused git diff --check:
passed

repository git diff --check:
passed (line-ending notices only)
```

The hydration integration test proves ordering with the real adapter contract:
a rejected native handoff leaves the sentinel absent; the next healthy
hydration calls `setMode()` again and only then persists marker value `1`.

## Physical-device proof

Upgrade an installation carrying explicit `talos.mobile.locale=it` but no
sentinel on Android 13+: first cold launch must hand Italian to Android and
show Italian in system App Language settings. Select System in Android
Settings, kill and relaunch: TALOS must now follow System and must not restore
Italian. Repeat an interrupted/failing bridge handoff and verify the next
healthy launch retries. Also repeat Android 12 process-death restoration.

Manual proof is required before the Claude ACK ticket.

## Rollback

Revert only the service, focused test, provenance paragraph and these R7
documents. Leave the inert sentinel value untouched; no destructive preference
cleanup is required.
