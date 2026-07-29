# P0 Library link browser lifecycle execution ledger

Date: 2026-07-28  
Subsystem: TALOS mobile browser adapter / Library UI  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED — automated gates complete; owner physical-device acceptance pending

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p0-library-link-browser-lifecycle-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-library-link-browser-lifecycle-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-library-link-browser-lifecycle-ledger.md`

Modify:

- `mobile/src/services/inAppBrowserService.ts`
- `mobile/tests/unit/services/inAppBrowserService.test.ts`

Delete: none.

## Public symbols and compatibility

Stable:

- `createTalosInAppBrowserService`;
- `openTalosLinkOnce`;
- `TalosInAppBrowserService.open`, `close`, `dispose`;
- presentations `isolated_webview` and `system_browser`;
- all ContextScreen and source-chip props/test ids.

Compatible extension:

- `TalosInAppBrowserDisposeOptions`;
- optional `dispose({ closeActive: false })`; no-argument behavior remains
  close-then-clean.

No route, permission, dependency, native source, schema or stored state.

## RED

Named regression:

- `inAppBrowserService.test.ts::launches a one-shot Library link without immediately closing the user's browser`

Expected RED: `openInSystemBrowser` is called once, then the unconditional
one-shot `dispose()` calls `plugin.close()` once.

Command:

```powershell
npm run test:unit -- tests/unit/services/inAppBrowserService.test.ts
```

## GREEN

- preserve closing disposal by default;
- detach successful one-shot launches without upstream `close()`;
- remove registered JS listener handles in both modes;
- retain canonical URL and sanitized failure behavior.

## Affected gates

```powershell
npm run test:unit -- tests/unit/services/inAppBrowserService.test.ts tests/unit/screens/contextScreen.test.ts tests/unit/chat/savedLinkRows.test.ts
npm run typecheck
npx playwright test tests/e2e/mobile-browser-evidence.e2e.spec.ts
npm run build
git diff --check
```

Physical Android Custom Tab, authenticated-cookie and Back behavior stay in the
final owner checklist because ADB cannot start here (exit `-1073741515`).

## Upstream pin and decision

- direct `@capacitor/inappbrowser@4.0.1`;
- use `openInSystemBrowser`/Android Custom Tabs for user navigation;
- keep isolated WebView for TALOS-controlled browsing;
- reject custom schemes and a duplicate native plugin.

## Closure evidence

Fresh RED on 2026-07-28:

- focused service suite: 1/6 failed;
- the real one-shot helper called `openInSystemBrowser` once and then
  `plugin.close()` once, proving the immediate-dismiss lifecycle defect.

Fresh GREEN:

- browser service: 6/6, including successful one-shot detach and default owned
  close;
- browser + global Library + saved-link regression matrix: 31/31;
- `npm run typecheck`: passed;
- browser fallback/lifecycle Playwright: 2/2;
- `npm run build`: 3,210 modules, parity 9/9, initial JS
  555,473/560,000 bytes and CSS 129,636/150,000 bytes;
- `git diff --check`: passed (line-ending notices only).

`openTalosLinkOnce` now calls the official browser exactly once, releases its
three listener handles and local references, and does not call upstream
`close()` after success. Invalid/failed opens still fail closed, while the
long-lived Chat Browse service retains close-on-dispose behavior.
