# TALOS Mobile Settings Parity Plan

Date: 2026-07-22
Owner: Codex mobile lane
Branch: `lane/kimi-mobile`
Desktop reference revision: `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed` (read-only)
Status: COMPLETE

## Objective

Replace the primitive mobile Settings screen with the same twelve-category Settings Center exposed by the frozen desktop product. Preserve the local-first mobile architecture: device preferences remain functional without a server, provider secrets remain in Android Keystore, and capabilities that still require a later mobile runtime are visible but fail closed instead of implying that they work.

## Upstream decision

- ADOPT `reka-ui@2.10.1` Tabs directly. It is already pinned in `mobile/package.json`, implements the WAI-ARIA Tabs pattern, controlled state, automatic activation, and keyboard navigation. No custom tab state machine or new dependency is permitted.
- ADAPT the desktop Settings information architecture and `--talos-*` visual tokens behind mobile-owned panels. Desktop source is a read-only product contract, not a code-edit target.
- ADOPT Capacitor Preferences for non-secret local settings and the existing secure-storage-backed chat controller for provider secrets.
- REJECT a WebView/server proxy for Settings because mobile must remain standalone.

Primary research:

- https://www.reka-ui.com/docs/components/tabs
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout

## Delivery slices

1. Characterize the twelve-category contract, tab semantics, secure provider controls, and local persistence with failing tests.
2. Add the Settings registry and Reka-based Settings Center shell.
3. Extract Models, AI Defaults, Appearance, and Shortcuts into functional mobile panels.
4. Represent Search, Browser, Integrations, Email, Reminders, Account, Agent Tools, and System as explicit capability-gated panels until their real mobile services land.
5. Run focused unit tests, typecheck/build, accessibility-oriented keyboard checks, and mobile viewport E2E at the milestone gate.

## Acceptance

- All twelve desktop categories exist with identical labels and stable IDs.
- The active category is exposed through native tab/tablist/tabpanel semantics and keyboard navigation.
- Provider keys still use secure storage and update the composer without reload.
- Default model selection remains connected to the same chat controller as the composer.
- Theme preset, color mode, chat layout, visibility, AI defaults, and shortcuts persist locally and update their live stores.
- Gated capabilities never render active controls or unsupported success claims.
- No desktop, backend, validator, or core file changes.

## Execution record

- Exact twelve-category registry and adaptive one-pane/two-pane Settings Center delivered.
- Models, AI Defaults, Appearance/Motion V6, and Shortcuts are functional through existing local-first stores.
- Runtime-dependent categories remain visible and explicitly fail closed; no decorative capability claims were introduced.
- Fail-closed shell navigation regression `SET-M08` was found by the full E2E corpus, measured in Chromium, fixed at the product stacking boundary, and retained as a permanent normal-pointer-click test.
- Verification: 64 unit files / 755 tests PASS; production build PASS; 15/15 Playwright mobile journeys PASS; representative 360x640 and 390x844 screenshots inspected.
