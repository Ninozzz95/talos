# P0 tablet keyboard continuity and Settings detail - approved design

## Owner-visible failures

- On a tablet, focusing the composer opens the Android keyboard and the
  persistent left chat sidebar disappears.
- Opening Settings on a tablet shows categories at left but a blank right
  detail region until a category is selected.

## Root causes

The keyboard failure is a state-classification defect, not a sidebar rendering
defect. The native WebView resize changes the live viewport height, the
width+height qualification media query becomes false, and `App.vue` removes
the tablet components with `v-if`.

The Settings failure is independent. The component intentionally starts its
phone navigation state at `categories`. That contributes `hidden` to the
detail section. The tablet category section has a responsive `md:block`
override; its detail sibling accidentally lacks the same override.

## Required behavior

1. A fresh 1024x768-class window qualifies for tablet split view.
2. A height-only shrink below 500 px does not unmount the split while width
   remains at least 768 px.
3. A width shrink below 768 px returns to phone layout.
4. A fresh 915x412-class wide landscape phone never qualifies.
5. At `md` width, both Settings categories and the active detail panel are
   visible immediately.
6. Below `md`, the existing categories -> detail -> contextual Back flow is
   unchanged.

## State transition

`useTalosTabletLayout()` observes:

- `qualified`: width >= 768 px and height >= 500 px
- `wide`: width >= 768 px
- module-local `hasQualified`

On each media-query change:

1. If `wide` is false, clear `hasQualified` and publish phone layout.
2. If `qualified` is true, set `hasQualified`.
3. Publish tablet layout only when `wide && hasQualified`.

This keeps keyboard-induced height changes continuous without promoting a
window that never had enough height for the two-pane layout.

## Human-visible proof

On the physical Android tablet:

1. Confirm the chat sidebar is present.
2. Focus the composer and type while the keyboard is open.
3. Confirm the sidebar/divider remain present and the composer remains usable.
4. Hide/reopen the keyboard twice; no layout flash or width reset.
5. Open Settings; Models detail is visible beside categories immediately.
6. Select Appearance, close/reopen Settings, and confirm both columns remain
   usable.
7. Rotate or narrow below 768 px and confirm the phone flow still works.

