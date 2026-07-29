# Execution ledger - R7 Agent Tools transactional persistence

Date: 2026-07-29
Subsystem: TALOS mobile settings / Agent Tools
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED in automation; physical-device verification remains in the
owner checklist
Commit policy: no commit without fresh owner authorization

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-agent-tools-transactional-persistence-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-agent-tools-transactional-persistence-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-agent-tools-transactional-persistence-ledger.md`

Modify:

- `mobile/src/stores/settings.ts`
- `mobile/src/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue`
- `mobile/src/i18n/locales/en.ts`
- `mobile/src/i18n/locales/it.ts`
- `mobile/tests/unit/theme/settingsStore.test.ts`
- `mobile/tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts`

Delete:

- none

## Public symbols and compatibility

- Preserve `SettingsStore.setAgentToolEnabled(tool, enabled): Promise<void>`.
- Preserve `TalosMobileSettingsState.agent_tools`, canonical ids/defaults,
  Preferences key and JSON schema, `talosBridgeCall`, component route, native
  checkbox, and existing test ids.
- Add no public class, storage key, migration, dependency, or schema field.

## RED tests and expected failures

1. `AGENT-TOOLS-PERSIST-01 aborts reactive state when Preferences rejects and
   allows a later retry`.
   - pre-fix reactive state changes before the rejection;
   - the next launch reloads the old value.
2. `AGENT-TOOLS-PERSIST-02 serializes overlapping switches without losing an
   update`.
   - pre-fix both native writes start concurrently;
   - completion order can overwrite one whole-settings snapshot.
3. `AGENT-TOOLS-PERSIST-03 restores the controlled switch and announces a
   failed save`.
   - pre-fix the checkbox remains visually changed;
   - pre-fix rejection is unhandled and no alert exists.
4. Existing successful persist/rehydrate, registry filtering, live revocation,
   executor, localization parity, and web reload E2E remain green.

## Baseline evidence

Fresh command before RED edits on 2026-07-29:

```text
npx vitest run tests/unit/theme/settingsStore.test.ts tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts tests/unit/tools/toolControls.test.ts tests/unit/tools/toolExecutor.test.ts

4 files passed
30 tests passed
```

## RED evidence

Fresh failing run on 2026-07-29 after adding the three named regression
scenarios:

```text
2 files failed
3 expected tests failed
15 compatibility tests passed
```

The failures proved that the old implementation mutated reactive state before
durable persistence, started overlapping whole-settings writes, and left the
checkbox visually changed without an actionable alert.

## Focused GREEN and affected regression gates

```powershell
npx vitest run tests/unit/theme/settingsStore.test.ts tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts
npx vitest run tests/unit/tools/toolControls.test.ts tests/unit/tools/toolExecutor.test.ts tests/unit/settings/settingsTabs.test.ts tests/unit/i18n/localization.test.ts
npx playwright test tests/e2e/mobile-agent-tools.e2e.spec.ts
npm run typecheck
npm run build
git diff --check
```

## Real-device and human-visible gate

On a physical device:

- enable airplane mode only if it helps reproduce a bridge failure; the
  preferred test is an instrumented Preferences rejection or storage fault;
- tap one Agent Tools switch and verify it remains on the committed value;
- verify the localized persistent error and unchanged enabled count;
- send a new natural-language request and confirm the tool offer still matches
  the committed value;
- recover storage, toggle again, restart the app, and verify the choice;
- rapidly tap two different switches under healthy storage and verify both
  choices survive restart.

Automation cannot substitute for the native bridge and restart gate.

## Closure evidence

Fresh commands on 2026-07-29:

```text
Focused GREEN:
2 files passed
18 tests passed

Affected unit regressions:
5 files passed
68 tests passed

Playwright reload persistence:
1 test passed

npm run typecheck:
passed

npm run build:
3,240 modules transformed
initial JavaScript 557,317 / 560,000 bytes
initial CSS 133,209 / 150,000 bytes
parity ledger 9 / 9 tests passed

focused git diff --check:
passed

repository git diff --check:
passed (line-ending notices only)
```

The store now serializes candidate writes, publishes reactive state only after
successful persistence, keeps the queue usable after rejection, and lets the
panel restore the committed checkbox while exposing a localized persistent
alert. No storage schema, key, dependency, or native bridge changed.

## Rollback

Revert only the two product logic/UI files, two locale catalogs, and two tests
listed above, then remove these three task documents. No persisted data or
schema rollback is required.
