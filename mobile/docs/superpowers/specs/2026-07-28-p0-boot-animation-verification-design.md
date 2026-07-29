# P0 boot animation verification design

Date: 2026-07-28  
Subsystem: TALOS mobile brand boot overlay

## Contract

Normal motion:

1. Native `Theme.SplashScreen` supplies the static cold-start frame.
2. `TalosBootLogo` paints an opaque in-WebView overlay.
3. Nodes and edges assemble once; no animation is infinite.
4. The latest edge/node ends by 1,280 ms.
5. The complete mark rests until 1,500 ms.
6. Only then does the overlay fade for 400 ms.
7. `done` emits at 2,000 ms, after the CSS transition allowance.

Reduced motion:

- nodes and edges are immediately complete;
- no edge/node animation runs;
- the shorter existing 450 ms hold and fade remain;
- content is never gated indefinitely.

## Implementation

- Keep all public Vue events and test ids unchanged.
- Change `.edge` from dash drawing to a top-origin SVG `scaleY`.
- Animate only `transform` and `opacity`.
- Preserve final `scaleY(1)` and opacity 1 through 100%.
- Mark only the short-lived boot overlay/elements with the properties that
  will change.

No route, native theme, storage, preference, schema or dependency changes.

## Proof and rollback

- Unit timing proves no early fade or `done`.
- Source/CSS contract proves a finite, persistent compositor-property
  animation and the reduced-motion override.
- Existing Playwright reload journeys prove the overlay appears and detaches.
- Build/typecheck and diff-check remain required.
- Rollback is the two-file component/test diff; there is no persisted state.

