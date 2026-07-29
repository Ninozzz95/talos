# Execution ledger - R7 composer and Settings interaction motion

Date: 2026-07-29
Subsystem: TALOS UI / Motion V6 interaction consumers
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED - physical-device acceptance pending
Commit policy: no commit without fresh owner authorization
Upstream pins: `vue@3.5.40` MIT; `reka-ui@2.10.1` MIT; official Vue,
Reka, web.dev, Android, W3C and MDN guidance inspected 2026-07-29

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-interaction-motion-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-interaction-motion-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-interaction-motion-ledger.md`
- `mobile/tests/e2e/mobile-interaction-motion.e2e.spec.ts`

Modify:

- `mobile/src/App.vue`
- `mobile/src/motion-v6/interaction/style.ts`
- `mobile/src/css/talos-interaction-motion-v6.css`
- `mobile/src/components/chat/TalosMobileComposer.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsAppearancePanel.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsModelsPanel.vue`
- `mobile/src/components/shell/TalosMobileSidebar.vue`
- `mobile/src/motion-v6/interaction/style.test.ts`
- `mobile/src/motion-v6/interaction/interactionMotion.test.ts`
- `mobile/tests/unit/chat/TalosMobileComposer.drawer.test.ts`
- `mobile/tests/unit/settings/TalosMobileSettingsCenter.test.ts`
- `mobile/tests/unit/settings/TalosMobileSettingsAppearancePanel.test.ts`
- `mobile/tests/unit/screens/settingsScreen.test.ts`
- `mobile/tests/unit/shell/appShell.test.ts`
- `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
- `mobile/docs/upstream-provenance.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

Delete:

- none

## Public symbols and compatibility

Add CSS custom-property contracts:

- `--talos-motion-duration-composer-expand`
- `--talos-motion-duration-composer-collapse`
- `--talos-motion-duration-tab-change`
- `--talos-motion-ease-composer-expand`
- `--talos-motion-ease-composer-collapse`
- `--talos-motion-ease-tab-change`
- `--talos-motion-tab-change-transform`
- `--talos-motion-tab-change-opacity`

Add owned CSS hook `talos-motion-tab-panel` and temporary data hooks using the
existing intent names `composer-expand`, `composer-collapse` and `tab-change`.

Add private component state/functions only:

- composer: `composerRoot`, `composerMotionIntent`,
  `composerMotionRevision`, `runComposerLayoutMotion`,
  `clearComposerLayoutMotion`;
- Settings Center: `categoryRoot`, `mobileMotionPane`,
  `mobileMotionRevision`, `runMobilePaneMotion`,
  `clearMobilePaneMotion`, async `openDetail` and `backToCategories`.
- sidebar focus handoff: `restoreSidebarFocusOnClose`,
  `suppressSidebarFocusRestore`, and `onSidebarCloseAutoFocus`.

No public TypeScript class, function, method, interface, schema, migration,
route, translation key, event, setting or dependency changes. Preserve
`TalosMobileComposer` props/emits/exposed methods, Settings tab IDs, Reka roles,
automatic activation, shell navigation, scroll reset, keyboard dismissal,
draft/attachment compact rules and every existing test ID.

## Baseline

Fresh 2026-07-29:

```text
7 files passed
104 tests passed
```

The affected composer, Settings, Motion V6 style/controller and shell suites
are green before the new contracts. jsdom emits its existing non-failing
canvas-not-implemented notices during the shell suite.

## Ledger amendment - initial chunk budget

The post-GREEN production builds transformed all 3,240 modules and emitted the
intended bundle, then correctly failed the immutable initial-chunk gate while
the private composer implementation was still too large:

```text
560638 > 560000 bytes
560127 > 560000 bytes
560032 > 560000 bytes
```

This invalidated the verbose private-helper forms of the planned composer FLIP,
not its behavior or upstream decision. The implementation was compacted inside
the already-owned `TalosMobileComposer.vue` while retaining measured old/new
geometry, the revision race gate, focus behavior, CSS intent, zero-duration and
OS reduced-motion checks. The budget was not raised or weakened. The final
production gate passed at `559998 / 560000` initial JavaScript bytes, with only
two bytes of remaining headroom; slice 13 must therefore create real
code-splitting headroom before adding startup behavior.

## Ledger amendment - drawer close-focus race

The first real phone E2E passed composer expand/collapse, tablet focus, and the
complete OS reduced-motion scenario, but exposed a browser-only focus race:
after Settings moved focus to its final detail pane, the closing Vaul/Reka
sidebar restored focus to the original hamburger trigger. The final active
element was therefore outside the still-open Settings dialog.

Current upstream inspection adds two authoritative constraints:

- WAI-ARIA APG permits focus to move to a different logical workflow target
  when the dialog action directly continues into a subsequent step;
- pinned Reka/Vaul `DrawerContent` exposes preventable `closeAutoFocus`.

Amend ownership with `TalosMobileSidebar.vue` and
`TalosMobileSidebar.test.ts`. Add permanent `MOTION-SIDEBAR-FOCUS-01`: a
destination/navigation action suppresses that one close restoration, while the
ordinary Close button preserves the standard return-to-trigger behavior. Adapt
the supported upstream event locally; do not add timers, move focus twice, or
change the public sidebar emits. The sidebar is already an async chunk, so this
does not consume initial-JS budget.

Fresh regression RED:

```text
Test Files  1 failed (1)
Tests       1 failed | 6 skipped (7)
```

After invoking `Open Settings`, the synthetic supported `closeAutoFocus` event
was not prevented (`defaultPrevented: false`), exactly reproducing the browser
focus theft. Product code had not yet been changed.

## RED and expected failure

Add these permanent scenarios before product code:

- `MOTION-PRODUCT-01`: style projection publishes composer/tab tokens and
  independently zeros them for Composer/Navigation category gates;
- `MOTION-PRODUCT-02`: the shell projects persisted reactive Motion V6
  preferences rather than fresh defaults;
- `MOTION-COMPOSER-01`: empty immersive focus uses a positive measured FLIP
  delta and keeps textarea focus;
- `MOTION-COMPOSER-02`: blur uses the negative delta, preserves native blur,
  and cleans temporary state after animation;
- `MOTION-COMPOSER-03`: rapid reversal cannot commit a stale measurement;
- `MOTION-SETTINGS-01`: phone category-to-detail motion moves focus into the
  final pane and Back restores it to the selected trigger;
- `MOTION-SETTINGS-02`: Settings Center, Appearance and Model Lab tab content
  use one compositor-only active-panel contract;
- `MOTION-CSS-01`: relevant keyframes use only transform/opacity and include a
  global reduced-motion final-state override;
- `MOTION-E2E-01`: real phone composer focus/blur and Settings
  forward/back/nested changes emit the intended animations without focus loss;
- `MOTION-E2E-02`: tablet tab focus remains stable;
- `MOTION-E2E-03`: OS reduced motion applies state immediately with no running
  interaction animation.
- `MOTION-SIDEBAR-FOCUS-01`: navigation from the modal sidebar prevents its
  delayed close autofocus from stealing focus from the destination, while an
  ordinary dismissal still restores the invoking trigger.

Expected pre-fix failure: tokens and CSS hooks are absent, focus/blur produces
no composer animation, Settings panes/panels switch without motion, and
persisted category gates do not affect the shell tokens.

Fresh RED evidence, 2026-07-29:

```text
Test Files  7 failed (7)
Tests       8 failed | 99 passed (107)
Duration    13.67s
```

All failures matched the named contracts: the style projection had no
composer/tab variables; the owned CSS had no composer/tab keyframes or
compositor-only panel hook; composer focus/blur had no measured intent; the
Settings Center lacked the shared panel class and phone focus/motion contract;
Appearance and Model Lab lacked stable panel hooks; and the shell exposed no
persisted category-specific duration tokens. The 99 pre-existing assertions
inside the affected files remained green. No unexpected regression was present
in the RED run.

## Focused GREEN and affected gates

```powershell
npx vitest run src/motion-v6/interaction/style.test.ts src/motion-v6/interaction/interactionMotion.test.ts tests/unit/chat/TalosMobileComposer.drawer.test.ts tests/unit/settings/TalosMobileSettingsCenter.test.ts tests/unit/settings/TalosMobileSettingsAppearancePanel.test.ts tests/unit/screens/settingsScreen.test.ts tests/unit/shell/appShell.test.ts tests/unit/shell/TalosMobileSidebar.test.ts
npx vitest run tests/unit/chat/TalosMobileComposer.test.ts tests/unit/services/nativeFraming.test.ts tests/unit/screens/chatScreen.test.ts tests/unit/settings/TalosMobileSettingsBrowserPanel.test.ts tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts tests/unit/theme/settingsStore.test.ts
npm run typecheck
npm run build
npx playwright test tests/e2e/mobile-interaction-motion.e2e.spec.ts
npx playwright test tests/e2e/mobile-composer-state.e2e.spec.ts tests/e2e/mobile-settings-parity.e2e.spec.ts tests/e2e/mobile-f6-tablet.e2e.spec.ts
git diff --check
```

Fresh final evidence, 2026-07-29:

```text
Focused unit matrix:       8 files, 114/114 passed
Adjacent unit matrix:      6 files, 67/67 passed
Typecheck:                 passed
Production build:          passed, 3240 modules
Initial JavaScript:        559998 / 560000 bytes
Initial JavaScript gzip:   182392 bytes
Initial CSS:               134429 / 150000 bytes
Feature parity:            9/9 passed
Focused browser matrix:    3/3 passed
Adjacent browser matrix:   18/18 passed
Diff whitespace gate:      passed
```

The first focused browser run exposed the delayed drawer autofocus race
described above. After the supported preventable focus handoff was implemented,
the complete focused browser matrix passed on phone, tablet and OS
reduced-motion configurations. The final unit run retained only pre-existing
non-failing jsdom canvas and incomplete fixture-prop warnings.

## Real-upstream and human-visible proof

The browser proof runs the real shell, composer, persisted Preferences adapter,
Motion V6 token projection, Reka tabs and Settings navigation. No product
component or store method is mocked.

On the final APK, with an empty immersive composer, focus and dismiss the
keyboard repeatedly and confirm the surface follows the compact/expanded edge
without a jump. Exercise every Settings category plus Design/Motion/Voice and
Providers/Catalog, on phone and tablet. Repeat with Interface motion off,
Composer/Navigation categories off, duration extremes and Android Remove
animations enabled. Text must never re-wrap mid-transition and focus/keyboard,
scroll and selection must remain correct.

Manual physical-device and frame-profiler proof remains required before the
Claude ACK ticket.

## Rollback

Restore only the exact files listed above. No preference, database, Vault,
native resource, package or lockfile rollback is required.
