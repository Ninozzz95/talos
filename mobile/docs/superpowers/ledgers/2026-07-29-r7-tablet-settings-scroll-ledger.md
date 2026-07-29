# Execution ledger - R7 tablet Settings category scrolling

Date: 2026-07-29
Subsystem: TALOS UI / Settings tablet list-detail
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED - automated gates green; physical-tablet acceptance pending
Commit policy: no commit without fresh owner authorization
Upstream pins: W3C CSS Overflow Level 3, Flexbox Level 1, Overscroll Level 1;
`reka-ui@2.10.1`

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-tablet-settings-scroll-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-tablet-settings-scroll-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-tablet-settings-scroll-ledger.md`

Modify:

- `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
- `mobile/tests/unit/settings/TalosMobileSettingsCenter.test.ts`
- `mobile/tests/e2e/mobile-f6-tablet.e2e.spec.ts`
- `mobile/docs/upstream-provenance.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

Delete:

- none

## Public symbols and compatibility

- Add no public class, function, component prop, route, setting or schema.
- Preserve all settings tab ids, Reka roles/orientation, activation behavior,
  rail width token, sheet contract and phone flow.
- Preserve the detail pane as its own scroll owner.

## Baseline

Fresh 2026-07-29 results:

```text
2 unit files passed
15 tests passed
1 existing tablet Settings E2E passed
```

The existing E2E proves geometry but does not exercise an overflowing category
rail or a real scroll gesture.

## RED and expected failure

Add permanent scenarios first:

- `TABLET-SETTINGS-SCROLL-01`: the structural rail is a bounded flex column and
  not a competing scroll container;
- `TABLET-SETTINGS-SCROLL-02`: the inner tablist is the sole bounded tablet
  category scroller;
- browser acceptance at 1024 x 420 proves positive overflow, a changed
  tablist `scrollTop`, a stationary outer rail and activation of the final tab.

Expected pre-fix failures: the rail is `md:block` plus
`md:overflow-y-auto`; the tablist's `md:flex-1` has no flex-column parent and
its measured height expands to its content.

Fresh RED evidence, 2026-07-29:

```text
Unit: 2 failed, 9 passed
Browser: 1 failed
TabsList clientHeight=927, scrollHeight=927 at a 420px viewport height
```

The unit failures were exactly `TABLET-SETTINGS-SCROLL-01` and
`TABLET-SETTINGS-SCROLL-02`. The browser failure proved the inner list had no
scroll range rather than merely lacking a visible scrollbar.

## Focused GREEN and affected gates

```powershell
npx vitest run tests/unit/settings/TalosMobileSettingsCenter.test.ts tests/unit/shell/TalosMobileScreen.test.ts
npx playwright test tests/e2e/mobile-f6-tablet.e2e.spec.ts --grep "tablet Settings"
npm run typecheck
npm run build
git diff --check
```

## GREEN evidence

Fresh 2026-07-29 results:

- focused Settings unit suite: 11/11 passed;
- Settings plus shell regression units: 2 files, 17/17 passed;
- short-viewport browser scroll scenario: 1/1 passed against a freshly built
  `dist`;
- complete tablet F6 E2E suite: 10/10 passed, including rail replacement,
  short-height resize, drag/keyboard width persistence and phone guards;
- `npm run typecheck`: passed;
- `npm run build`: passed, including parity verification; initial JavaScript
  remained 557,756 / 560,000 bytes;
- `git diff --check`: passed.

The structural `aside` is now a bounded flex column with clipped overflow. Its
inner Reka `TabsList` is the only tablet category scroll owner; the independent
detail-pane and phone scrollers are unchanged.

## Human-visible proof

On a tablet, open Settings in portrait and landscape, increase interface font
size, then swipe the left category rail from Account through System. Confirm
the right panel does not move with the rail, every tab remains reachable, and
Up/Down plus Home/End still select and reveal tabs. Repeat after an Android
keyboard-height resize.

Manual proof remains required before the Claude ACK ticket.

## Rollback

Restore only the five modified files and three slice documents listed above.
No setting, account data, tab state or persisted rail width is deleted.
