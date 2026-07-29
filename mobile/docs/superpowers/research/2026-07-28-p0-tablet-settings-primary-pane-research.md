# P0 tablet Settings primary-pane research

Date: 2026-07-28  
Subsystem: TALOS mobile UI / adaptive tablet shell  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Local defect

The owner's physical screenshot shows three simultaneous columns:

1. persistent chat sidebar;
2. narrow Settings category list;
3. Settings detail.

That is the wrong hierarchy. Once Settings is the active station, its category
list is the primary navigation for that task and must occupy the leading pane
previously used by chat navigation. Keeping both creates redundant navigation,
compresses labels into ellipses, and leaves the detail pane unnecessarily
narrow.

## Current primary guidance

### Android adaptive list-detail

- Source:
  `https://developer.android.com/develop/adaptive-apps/guides/list-detail`
- Source:
  `https://developer.android.com/develop/ui/views/layout/canonical-layouts`
- Retrieved: 2026-07-28.

Android explicitly identifies app preferences as a valid list-detail use case.
On expanded windows the list and detail panes appear side by side; at compact
width only one pane is visible. Selection and window changes preserve the
active detail.

### Material canonical layouts

- Source:
  `https://m3.material.io/foundations/layout/canonical-examples/overview`
- Retrieved: 2026-07-28.

Material defines list-detail as one of its canonical adaptive layouts. This
supports treating Settings categories and their selected panel as one
two-pane hierarchy, not nesting that hierarchy beside unrelated chat
navigation.

### Apple split-view corroboration

- Source:
  `https://developer.apple.com/design/human-interface-guidelines/split-views`
- Change-log pin: iOS/iPadOS platform considerations added 2025-06-09.
- Retrieved: 2026-07-28.

The leading pane owns navigation for the content in the secondary pane.
Selection remains visibly highlighted, pane widths must remain useful at
resizable widths, and nonessential panes may be hidden to preserve detail
space.

## Upstream decision

**ADAPT behind the AVM-owned Vue/Capacitor shell.**

Do not add Jetpack Compose or Material adaptive runtime dependencies to a
WebView application. Reproduce the established list-detail contract with the
existing TALOS route state, persisted tablet-width policy, sheet shell, and
Settings tabs:

- Settings replaces the chat rail only while the Settings route is active;
- its category pane uses the same persisted/clamped rail width;
- the detail pane receives the remaining width;
- closing Settings restores the chat rail without changing its width;
- phone behavior remains the existing single-pane categories/detail flow.

This is not a custom navigation protocol. It is a route-aware application of
the two-pane canonical layout using existing project primitives.

## Rejected alternatives

- **Keep three panes and widen Categories:** rejected; it preserves redundant
  primary navigation and steals more detail space.
- **Hide Categories after selection on tablet:** rejected; expanded-width
  list-detail guidance keeps list and detail visible together.
- **Adopt Compose adaptive libraries:** rejected; TALOS mobile UI is Vue inside
  Capacitor and a second UI runtime would violate the subsystem boundary.
- **Reset the saved sidebar width:** rejected; the width is user state and must
  survive entering/leaving Settings.

