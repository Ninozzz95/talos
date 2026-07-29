# Execution ledger - P0 tablet Settings primary pane

Date: 2026-07-28  
Subsystem: TALOS mobile UI  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED - automated gates green; physical tablet acceptance remains in
the final owner checklist

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p0-tablet-settings-primary-pane-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-tablet-settings-primary-pane-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-tablet-settings-primary-pane-ledger.md`

Modify:

- `mobile/src/App.vue`
- `mobile/src/components/shell/TalosMobileScreen.vue`
- `mobile/src/screens/SettingsScreen.vue`
- `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
- `mobile/tests/unit/shell/TalosMobileScreen.test.ts`
- `mobile/tests/unit/settings/TalosMobileSettingsCenter.test.ts`
- `mobile/tests/e2e/mobile-f6-tablet.e2e.spec.ts`

Delete:

- none

## Public symbols and compatibility

- Add computed `tabletChatRailVisible` in `App.vue`.
- Add CSS custom property `--talos-tablet-sidebar-width`.
- Keep `--talos-tablet-rail` as the station-sheet offset contract.
- Add optional prop
  `TalosMobileScreen.tabletEdgeToEdge?: boolean`, default `false`.
- Preserve `tabletSidebarWidth`, `commitTabletWidth`,
  `TalosMobileSettingsCenter.requestedTab`, route names, persisted setting
  `shell.tablet_sidebar_width`, phone navigation, and all test ids.

## RED scenarios

1. `TABLET-SETTINGS-01 replaces the chat rail with Settings categories`
   - 1024x768 tablet starts with the chat rail and divider.
   - Opening Settings removes both and places its sheet at x=0.
   - Category pane x and width equal the former chat rail geometry.
   - Detail is visible beside it.
2. `TABLET-SETTINGS-02 restores the chat rail and saved width`
   - Close Settings.
   - Chat rail and divider return at their prior width.
3. `TABLET-SETTINGS-03 phone keeps padded single-pane navigation`
   - `tabletEdgeToEdge` changes only `md`; compact layout keeps the existing
     categories/detail flow and screen gutter.
4. `TABLET-SETTINGS-04 Settings panes own tablet scrolling`
   - Generic screen body is non-scrolling at `md`;
   - category and detail panes remain independently scrollable.

Expected pre-fix failure: the chat rail remains visible; the sheet begins after
it; the category pane is a nested fixed `w-56` third column.

## TDD commands

RED/focused GREEN:

```powershell
npx vitest run tests/unit/shell/TalosMobileScreen.test.ts tests/unit/settings/TalosMobileSettingsCenter.test.ts
npx playwright test tests/e2e/mobile-f6-tablet.e2e.spec.ts --grep "replaces the chat rail"
```

Affected regression:

```powershell
npx vitest run tests/unit/composables/useTalosTabletLayout.test.ts tests/unit/lib/tabletLayout.test.ts tests/unit/shell/TalosMobileScreen.test.ts tests/unit/settings/TalosMobileSettingsCenter.test.ts
npx playwright test tests/e2e/mobile-f6-tablet.e2e.spec.ts tests/e2e/mobile-settings-parity.e2e.spec.ts
npm run typecheck
npm run build
git diff --check
```

## Real-upstream and human-visible gate

The browser journey proves the AVM adapter at representative expanded and
compact widths. The owner then opens Settings on the physical tablet, rotates
it, changes category, closes/reopens Settings, and confirms:

- exactly two Settings panes, with no chat rail;
- no truncated category helper text at the saved default width;
- active selection and independent scrolling remain clear;
- closing restores the chat rail at exactly its prior width;
- phone layout remains one pane at a time.

## Rollback

Revert only the seven modified product/test files and remove these three task
documents. No persisted value, schema, native capability, dependency, or user
content requires rollback.

## RED evidence

Fresh pre-product commands on 2026-07-28:

```text
Vitest focused
2 files failed
2 expected failures, 11 compatibility tests passed

- TalosMobileScreen has no edge-to-edge tablet body contract.
- TalosMobileSettingsCenter has no full-height primary-pane scaffold contract.

Playwright focused
1 expected failure

- after opening Settings, talos-tablet-sidebar remained mounted (received 1,
  expected 0), proving the owner screenshot's third-column defect.
```

Product implementation may begin.

## GREEN and regression evidence

Fresh evidence on 2026-07-28:

```text
Focused Vitest
2 files, 13 / 13 passed

Focused Playwright
TABLET-SETTINGS-01/02: 1 / 1 passed
- Settings sheet x = 0
- category pane x = 0
- category width = prior chat-rail width
- chat rail and divider absent in Settings
- both restored at the same width on close

Affected Vitest
4 files, 26 / 26 passed

Affected Playwright
13 / 13 passed across tablet and Settings parity journeys

TypeScript + production build
PASS - 3,219 modules
initial JavaScript 557,062 / 560,000 bytes
initial CSS 129,477 / 150,000 bytes
feature parity 9 / 9
```

The implementation adds no dependency, schema, route, or persisted setting.
The saved tablet width remains the single geometry source for both the chat
rail and the replacement Settings category pane. P1 code-extension work may
begin.
