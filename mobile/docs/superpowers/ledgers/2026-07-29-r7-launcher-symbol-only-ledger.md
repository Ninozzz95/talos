# Execution ledger - R7 launcher symbol only

Date: 2026-07-29
Subsystem: TALOS Android launcher branding / Settings preview
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED - automated gates green; physical-launcher acceptance pending
Commit policy: no commit without fresh owner authorization
Upstream pin: Android adaptive-icon contract through API 36

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-launcher-symbol-only-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-launcher-symbol-only-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-launcher-symbol-only-ledger.md`

Modify source:

- `mobile/src/assets/talosBootFinalFrame.json`
- `mobile/tools/android-assets/gen_theme_icons.py`
- `mobile/src/components/talos/settings/TalosLauncherIconDialog.vue`
- `mobile/tests/unit/brand/launcherIconParity.test.ts`
- `mobile/tests/unit/settings/TalosLauncherIconDialog.test.ts`
- `mobile/docs/upstream-provenance.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

Modify generated foregrounds:

- `mobile/android/app/src/main/res/drawable/ic_talos_fg_forge.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_paper.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_terminal.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_aurora.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_glacier.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_ember.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_atlas.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_noir.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_signal.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_violet.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_claudius.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_basicus.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_telemetry.xml`
- `mobile/android/app/src/main/res/drawable/ic_talos_fg_calm.xml`

Delete:

- none

The generator may rewrite adaptive/color/alias outputs byte-for-byte. Any
semantic diff outside the exact list above requires a ledger amendment before
continuing.

## Public symbols and compatibility

- Preserve all `ic_launcher[_<preset>][_round]` names.
- Preserve `MainActivityIcon_<preset>`, default `calm`, theme ids, palette
  backgrounds/accents, apply/restart flow and stored preference.
- Preserve the boot animation and its visible wordmark.
- Add only `adaptive.content = "mark-only"` to the internal JSON contract.
- Add no API, dependency, permission, activity or resource identifier.

## Baseline

Fresh 2026-07-29 command:

```text
5 files passed
25 tests passed
```

## RED and expected failure

Update permanent launcher and preview assertions first:

- all fourteen foregrounds must contain five filled nodes and no wordmark;
- the canonical transform must be scale 1 / translate 50,50;
- calculated mark dimensions must be within 48-66 dp;
- the Settings preview must expose no launcher wordmark.

Expected pre-fix failures: generated XML still contains the Orbitron outline,
the source contract still scales the composite to 0.69 and translates the mark
up, the preview still renders the wordmark, and generator `--check` remains
green only for the old contract.

Fresh RED evidence, 2026-07-29:

```text
2 test files failed
3 tests failed, 6 tests passed
```

The failures were exactly `LAUNCHER-SYMBOL-01`,
`LAUNCHER-SYMBOL-02`, and the Settings preview assertion. No compatibility
scenario failed.

## Focused GREEN and affected gates

```powershell
npx vitest run tests/unit/brand/launcherIconParity.test.ts tests/unit/settings/TalosLauncherIconDialog.test.ts
python tools/android-assets/gen_theme_icons.py --check
npx vitest run tests/unit/brand/bootLogo.test.ts tests/unit/lib/launcherIconPlan.test.ts tests/unit/services/launcherIcon.test.ts
npm run typecheck
npm run build
$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'
.\gradlew.bat :app:processDebugResources :app:compileDebugJavaWithJavac
git diff --check
```

## GREEN evidence

Fresh 2026-07-29 results:

- launcher symbol and preview: 2 files, 9/9 tests passed;
- boot/logo-plan/launcher-service regressions: 3 files, 16/16 tests passed;
- generator conformance: 46/46 generated resources match;
- `npm run typecheck`: passed;
- `npm run build`: passed, including parity verification; initial JavaScript
  557,756 / 560,000 bytes;
- Android `processDebugResources` plus `compileDebugJavaWithJavac`: `BUILD
  SUCCESSFUL`, 224 tasks;
- `git diff --check`: passed.

The launcher source contract now retains the exact final-frame mark geometry,
maps it to a centered 52.02 x 62.37 dp symbol, and excludes the boot-only
Orbitron outline from all fourteen theme foregrounds and the Settings preview.
Adaptive aliases, preset ids, colors, restart behavior, and the monochrome
layer remain unchanged.

## Human-visible proof

On a physical launcher, inspect all current mask variants available (at least
circle and squircle), normal and Android themed icons, and one alias switch.
The icon must contain only the centered mark, use the selected theme palette,
match the final lit boot symbol, avoid clipping, survive restart, and retain
exactly one launcher entry. The Settings preview must match it.

Manual proof remains required before the Claude ACK ticket.

## Rollback

Restore only the listed source/generated branding files and tests. No user
state, alias enrollment or preference is deleted.
