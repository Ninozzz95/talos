# P0 tablet continuity and Settings detail - upstream research (2026-07-28)

## Questions

1. Why does the persistent tablet sidebar disappear when the Android keyboard
   opens?
2. Why is the initial Settings detail column blank at tablet width?
3. How can TALOS preserve the existing wide-but-short phone guard?

## Exact upstream and standards

- `@capacitor/keyboard` AVM pin: `8.0.5`
- [official Capacitor v8 Keyboard API](https://capacitorjs.com/docs/apis/keyboard)
- [official Android input-method layout guidance](https://developer.android.com/develop/ui/views/touch-and-input/keyboard-input/visibility)
- [official Android window-size-class guidance](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes)
- [official Tailwind responsive design](https://tailwindcss.com/docs/responsive-design)
- [official Tailwind display utilities](https://tailwindcss.com/docs/display)

## Findings

1. Capacitor defines `KeyboardResize.Native` as resizing the whole native
   WebView when the keyboard shows or hides. Android likewise documents that
   an on-screen keyboard reduces the space available to the app and that
   `adjustResize` resizes the layout into the remaining space.
2. TALOS deliberately uses a live media query:
   `(min-width: 768px) and (min-height: 500px)`. When the keyboard reduces the
   WebView below 500 CSS px, `matchMedia` changes to false and `App.vue`
   unmounts both `TalosTabletSidebar` and `TalosTabletDivider`.
3. Android recommends width as the primary adaptive-layout dimension for most
   apps, but also calls out compact-height landscape phones where a two-pane
   layout is impractical. Therefore replacing the query with width-only would
   fix the keyboard symptom while reopening the existing 915x412 phone defect.
4. Tailwind's `md` breakpoint is 768 px and responsive display utilities
   override the unprefixed mobile display state at that width. The Settings
   category pane has `md:block`; the detail pane does not. Its initial
   `mobilePane === 'categories'` state therefore applies `hidden` to the entire
   right column even though the active Models tabpanel exists.

## Upstream decision

**Adapt the official behavior behind the existing AVM layout composable.**

- Keep the current width+height query as the qualification gate.
- Add a width-only continuity query at the same 768 px breakpoint.
- Once the current window has qualified for tablet split view, retain tablet
  state across height-only reductions while width remains at least 768 px.
- Reset the qualification when width drops below 768 px; a fresh wide-but-short
  phone never qualifies.
- Add `md:block` to the Settings detail pane, matching the already-correct
  category pane.

Rejected alternatives:

- **Width-only tablet query:** violates the permanent landscape-phone
  regression contract.
- **Ignore all height changes forever:** would retain split view after a real
  narrow-window transition.
- **Subscribe to native keyboard show/hide events to override layout:** adds a
  second asynchronous source of truth, misses web/multi-window vertical
  resizing, and can race the media-query event. The viewport already provides
  sufficient evidence.
- **Use physical screen/device detection:** Android explicitly defines adaptive
  layout from app-window size, not physical device type.
- **Change native resize to overlay the keyboard:** would cover composer
  controls and contradict Android guidance to keep controls accessible.

## Security, compatibility, rollback

- No native manifest, keyboard policy, persistence, route, or data change.
- Phone initial behavior and the 768 px `md` design contract remain unchanged.
- Rollback is limited to the composable continuity state and one responsive
  display class; no stored data conversion exists.

