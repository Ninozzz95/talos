# P0 — Sidebar Model Lab deep-link ledger

Date: 2026-07-28  
Subsystem: TALOS UI  
Lane: `lane/kimi-mobile`  
Status: CLOSED (automated gates)  
Commit policy: no commit without fresh owner authorization

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p0-sidebar-model-lab-deep-link-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-sidebar-model-lab-deep-link-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-sidebar-model-lab-deep-link-ledger.md`

Modify:

- `mobile/src/App.vue`
- `mobile/tests/unit/shell/appShell.test.ts`
- `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
- `mobile/tests/e2e/mobile-shell.e2e.spec.ts`

Delete:

- none

No other product file is owned. If inspection requires another path, amend this
ledger before editing it.

## Public and compatibility symbols

Stable:

- sidebar `openModelLab`, `openSettings`, and `navigate` events;
- route name `settings`;
- query tab id `models`;
- `navigate` and `sidebarNavigate` remain internal shell helpers.

## Upstream pin and decision

Research:

- `mobile/docs/superpowers/research/2026-07-28-p0-sidebar-model-lab-deep-link-research.md`

Pin: `vue-router@5.2.0`, MIT.

Decision: adopt Vue Router's location-object/query contract directly, reusing
the existing Settings Model Lab deep link.

## RED

Command:

```powershell
npm run test:unit -- tests/unit/shell/appShell.test.ts tests/unit/shell/TalosMobileSidebar.test.ts
```

Expected failure: the parent shell route is `settings` but
`route.query.tab` is undefined after clicking Model Lab.

Observed:

```text
appShell + TalosMobileSidebar
1 failed, 10 passed
expected route.query.tab "models"; received undefined
```

## GREEN

Focused:

```powershell
npm run test:unit -- tests/unit/shell/appShell.test.ts tests/unit/shell/TalosMobileSidebar.test.ts tests/unit/screens/settingsScreen.test.ts
npx playwright test tests/e2e/mobile-shell.e2e.spec.ts
```

Wider:

```powershell
npx playwright test tests/e2e/mobile-model-lab-parity.e2e.spec.ts
npm run typecheck
npm run build
git diff --check
```

Observed:

```text
focused unit: 3 files, 22 tests passed
production build: 3224 modules transformed
initial JavaScript: 547551 / 560000 bytes
parity ledger: ok
mobile-shell.e2e.spec.ts: 15 passed
mobile-model-lab-parity.e2e.spec.ts: 2 passed
scoped git diff --check: passed
```

The first Playwright invocation after the source edit was not accepted as an
authoritative gate: `vite preview` served the pre-edit `dist`, so the new
journey correctly observed the old `/settings` behavior while the other 14
shell journeys passed. The production bundle was rebuilt and the unchanged
journey was rerun against that artifact, where it passed.

## Implementation

- `sidebarNavigate()` and `navigate()` accept a typed `LocationQueryRaw`.
- the sidebar's dedicated `openModelLab` event navigates to
  `/settings?tab=models`;
- the generic Settings action still navigates to `/settings` without a tab.

## Real-upstream gate

The focused App test and Playwright journey exercise the real installed Vue
Router with memory and browser histories respectively; no router mock may
substitute for both.

## Rollback

Restore the two App navigation helper signatures and the single
`open-model-lab` binding. No data or migration rollback exists.
