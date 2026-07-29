# Execution ledger - P0 launcher and boot-final-frame parity

- Subsystem: TALOS UI / Android launcher resources
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pins:
  - Android adaptive icons through API 36
  - AOSP SystemUI three-layer adaptive-icon reference
  - `@fontsource/orbitron@5.3.0`, OFL-1.1, publish hash
    `8eea555d30e69adc`
- Upstream decision: adopt Android's adaptive/safe-zone/monochrome contract and
  adapt the boot-final-frame lockup behind the existing TALOS icon generator.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p0-launcher-boot-frame-parity-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-launcher-boot-frame-parity-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-launcher-boot-frame-parity-ledger.md`
- `mobile/src/assets/talosBootFinalFrame.json`
- `mobile/tests/unit/brand/launcherIconParity.test.ts`
- `mobile/upstream/licenses/orbitron-5.3.0-OFL-1.1.txt`

Modify:

- `mobile/tools/android-assets/gen_theme_icons.py`
- `mobile/src/components/talos/settings/TalosLauncherIconDialog.vue`
- `mobile/tests/unit/settings/TalosLauncherIconDialog.test.ts`
- `mobile/docs/upstream-provenance.md`
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
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_forge.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_forge_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_paper.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_paper_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_terminal.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_terminal_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_aurora.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_aurora_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_glacier.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_glacier_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_ember.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_ember_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_atlas.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_atlas_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_noir.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_noir_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_signal.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_signal_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_violet.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_violet_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_claudius.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_claudius_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_basicus.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_basicus_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_telemetry.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_telemetry_round.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_calm.xml`
- `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_calm_round.xml`

Delete: none.

No other product file is owned. Normal generator execution may rewrite
`ic_talos_colors.xml` and `aliases.generated.xml` byte-for-byte; any semantic
diff in either invalidates the ledger and must be amended before proceeding.

## Symbols and compatibility

Internal additions:

- JSON schema `talos.boot-final-frame/1`
- generator `--check`

Stable:

- `TalosBootLogo`
- `TalosLauncherIconDialog`
- `TalosAppIconPlugin`
- all `MainActivityIcon_<preset>` aliases
- all `ic_launcher[_<preset>][_round]` resource names
- all theme ids, palette colors, restart semantics, and stored preferences

## RED scenarios and command

- `LAUNCHER-FRAME-01 all theme icons encode the completed boot state`
- `LAUNCHER-FRAME-02 composite stays centered inside the 66 dp safe zone`
- `LAUNCHER-FRAME-03 every adaptive icon exposes a monochrome layer`
- `LAUNCHER-FRAME-04 Settings preview uses the canonical completed frame`
- `LAUNCHER-FRAME-05 generator check detects stale generated resources`
- `LAUNCHER-FRAME-06 launcher aliases and palette mapping remain compatible`
- `LAUNCHER-FRAME-07 generated Android XML is LF-only on every host OS`

```powershell
npx vitest run tests/unit/brand/launcherIconParity.test.ts tests/unit/settings/TalosLauncherIconDialog.test.ts
```

Expected RED: generated foregrounds have empty nodes, opaque hexes, no wordmark,
the old translated transform, and adaptive resources have no monochrome layer;
the Settings preview has the same incomplete mark.

## GREEN and regression gates

```powershell
npx vitest run tests/unit/brand/launcherIconParity.test.ts tests/unit/settings/TalosLauncherIconDialog.test.ts tests/unit/brand/bootLogo.test.ts tests/unit/lib/launcherIconPlan.test.ts tests/unit/services/launcherIcon.test.ts
python tools/android-assets/gen_theme_icons.py --check
npm run typecheck
$env:JAVA_HOME='C:\Users\ninox\Desktop\AVM\.tools\jdk\jdk-21.0.11+10'; .\gradlew.bat :app:processDebugResources :app:compileDebugJavaWithJavac
git diff --check -- <every exact owned file above>
```

The full pre-APK gate repeats production web build, Capacitor sync, Android JVM
tests, resource processing, APK assembly, zipalign, signature verification, and
source/destination hashing.

## Real-platform gate

Android resource processing must compile the generated VectorDrawable and
adaptive-icon XML. The physical-device checklist must then cover preset alias
switching, circle/squircle masks, Android themed icons, restart, and the
single-launcher-entry invariant.

## Rollback

Restore only the owned source/generated branding files and tests. No migration,
preference reset, alias cleanup, or owner-data mutation is required.

## Closure record

RED established on 2026-07-28:

- Settings compatibility suite: 3/3 passed;
- launcher parity suite: 4/4 expected failures;
- failures independently identified the 500 viewport/old offset, missing
  completed-frame paint and wordmark, missing monochrome layer, and missing
  non-mutating generator check.

Status: RED. Product implementation may begin.

Ledger amendment on 2026-07-28:

- the post-GREEN `git diff --check` gate exposed that Python universal-newline
  reads let `--check` accept CRLF bytes emitted on Windows;
- `LAUNCHER-FRAME-07` permanently requires LF-only bytes so generated resources
  are reproducible and do not surface false trailing whitespace;
- the owned generator and existing launcher parity test already listed above
  are sufficient; no file-ownership expansion is required.

## Closure evidence

Closed at the code/platform gate on 2026-07-28:

- RED: 4/4 original launcher parity assertions failed for the incomplete
  foreground/transform/monochrome/check contract;
- GREEN: 5 focused test files, 25/25 assertions passed after adding the
  permanent LF determinism scenario;
- generator: `--check` proves all 46 canonical resources are byte-exact;
- adjacent Capacitor asset conformance: 58/58 assertions passed;
- TypeScript typecheck passed;
- production build passed with 3,225 modules, 551,684 initial JavaScript bytes
  against the 560,000-byte budget, and parity verification passed;
- Android `processDebugResources` and `compileDebugJavaWithJavac` passed against
  the final LF-only resources;
- full working-tree `git diff --check` passed;
- local circle and squircle render inspection showed the completed mark and
  TALOS wordmark centered without clipping.

Status: code and Android resource gates GREEN. Physical-launcher verification
for mask variants, themed icons, alias restart, and the single-entry invariant
remains explicitly reserved for the final manual APK checklist.
