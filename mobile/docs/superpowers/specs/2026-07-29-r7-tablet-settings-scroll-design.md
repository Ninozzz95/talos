# R7 design - Tablet Settings category scrolling

Date: 2026-07-29

## Contract

At `md` and wider, the Settings list-detail surface has two independent
bounded scrollports:

1. the category `TabsList` on the left;
2. the active settings detail pane on the right.

The category rail itself is structural and must not compete for the same
gesture. At phone widths, the existing single-pane flow and parent-sheet
scroller remain unchanged.

## Layout

`settings-category-pane` becomes:

```text
md:flex md:min-h-0 md:flex-col md:overflow-hidden
```

The category `TabsList` remains:

```text
md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain
```

This mirrors the global sidebar's bounded navigation scroller. No fixed pixel
height, custom event listener, scrollbar hiding, or nested overscroll owner is
introduced.

## Accessibility and compatibility

- Preserve Reka `orientation="vertical"` and automatic activation.
- Preserve Up/Down, Home, End, focus visibility and selected-tab state.
- Preserve every category and its order.
- Preserve `--talos-tablet-sidebar-width`.
- Preserve independent detail scrolling and scroll-to-top on panel change.
- Preserve phone list-detail, modal header, safe areas and horizontal overflow.

## Acceptance

At a 1024 px-wide tablet viewport reduced to 420 px high:

- category `scrollHeight` exceeds `clientHeight`;
- a wheel gesture over the category list increases its own `scrollTop`;
- the outer category rail remains at `scrollTop=0`;
- the last System tab can be reached, activated and displays its panel;
- the detail pane and modal remain visible.
