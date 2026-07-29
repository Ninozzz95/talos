# P0 boot animation verification execution ledger

Date: 2026-07-28  
Subsystem: TALOS mobile UI / brand boot  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED — automated gates complete; owner physical-device acceptance pending

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p0-boot-animation-verification-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-boot-animation-verification-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-boot-animation-verification-ledger.md`

Modify:

- `mobile/src/components/brand/TalosBootLogo.vue`
- `mobile/tests/unit/brand/bootLogo.test.ts`

Delete: none.

## Public symbols and compatibility

Stable:

- component `TalosBootLogo`;
- emitted event `done`;
- test id `talos-boot-logo`;
- native `AppTheme.NoActionBarLaunch`;
- owner-selected 1,500 ms hold and complete-mark persistence.

No new public symbol, dependency, preference, route, permission or native API.

## RED

Named regressions:

- `bootLogo.test.ts::does not reveal the app until the complete one-shot mark has rested`
- `bootLogo.test.ts::uses only compositor-friendly finite motion and keeps the assembled mark`
- `bootLogo.test.ts::settles edge and node motion under prefers-reduced-motion`

Expected RED:

- timing is not asserted at its actual boundaries;
- edge animation still contains `stroke-dashoffset`, a paint-bound property;
- no permanent test prevents the final line/node state from disappearing
  again.

Command:

```powershell
npm run test:unit -- tests/unit/brand/bootLogo.test.ts
```

## GREEN

- convert edge reveal to `transform: scaleY` plus opacity;
- retain the final complete state;
- make the timing and reduced-motion contracts executable.

Focused command is the RED command.

## Affected gates

```powershell
npm run test:unit -- tests/unit/brand/bootLogo.test.ts tests/unit/lib/talosFontScale.test.ts
npm run typecheck
npx playwright test tests/e2e/mobile-f5-regressions.e2e.spec.ts --grep "stations"
npm run build
git diff --check
```

The physical Android smoothness verdict remains in the final owner checklist
because ADB cannot start in this environment (exit `-1073741515`).

## Upstream pin and decision

- keep AndroidX Core SplashScreen `1.2.0`, Capacitor Android `8.4.2`, compile /
  target SDK 36 and min SDK 26;
- adapt the branded WebView layer to the web platform's transform/opacity
  animation contract;
- reject an AndroidX WebKit upgrade/prewarm experiment in this bounded slice.

## Closure evidence

Fresh RED on 2026-07-28:

- 4 focused tests executed;
- 2 passed (existing render and exact hold/handoff);
- 2 failed because the edge contract still contained `stroke-dashoffset` and
  reduced motion still settled that obsolete dash state.

Fresh GREEN:

- focused boot suite: 4/4;
- boot plus synchronous font-scale regression matrix: 12/12;
- `npm run typecheck`: passed;
- Playwright reload journey (`stations`): 1/1;
- `npm run build`: 3,210 modules, parity 9/9, initial JS
  555,423/560,000 bytes, CSS 129,636/150,000 bytes;
- `git diff --check`: passed (line-ending notices only).

The source now animates boot edges with `scaleY` plus opacity, nodes with
opacity, finishes the last element at 1,280 ms, rests the complete mark until
1,500 ms and removes the overlay only after its fade allowance at 2,000 ms.
No native theme, dependency or persisted state changed.
