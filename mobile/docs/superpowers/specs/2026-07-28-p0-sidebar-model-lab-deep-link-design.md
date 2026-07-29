# P0 — Sidebar Model Lab deep-link design

Date: 2026-07-28  
Status: approved by the owner's explicit bug report

## User-visible contract

- Tapping **Model Lab** in the sidebar closes the sidebar.
- The URL becomes `/settings?tab=models`.
- The real `[data-settings-panel="models"]` detail surface is visible, not the
  generic Settings category list.
- Tapping **Settings** still opens generic `/settings`.
- Back navigation follows the existing Settings/detail → categories → chat
  contract.

## Implementation

- Extend the internal `navigate(name, query?)` and `sidebarNavigate(name,
  query?)` helpers to accept Vue Router `LocationQueryRaw`.
- Bind `open-model-lab` to
  `sidebarNavigate('settings', { tab: 'models' })`.
- Keep `open-settings` bound to `sidebarNavigate('settings')`.

No public component event, route name, settings tab id, or persisted preference
changes.

## Tests

RED:

- `appShell.test.ts::sidebar Model Lab deep-links to the real Models panel while
  Settings stays generic`

Regression:

- `TalosMobileSidebar.test.ts`
- `settingsScreen.test.ts`
- `mobile-shell.e2e.spec.ts`
- `mobile-model-lab-parity.e2e.spec.ts`
- typecheck, production build, and `git diff --check`

Human proof: from chat, open the hamburger → Model Lab and verify the Providers /
Catalog / Advanced Model Lab UI is immediately visible.

