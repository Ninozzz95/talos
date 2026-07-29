# P0 tablet Settings primary-pane design

Date: 2026-07-28  
Status: approved by the owner's autonomous fix instruction

## Outcome

At TALOS tablet dimensions, opening Settings changes:

```text
[ chat rail | divider | Settings categories | Settings detail ]
```

to:

```text
[ Settings categories | Settings detail ]
```

Closing Settings restores:

```text
[ chat rail | divider | chat ]
```

The leading width is the same persisted, clamped tablet sidebar width in both
states.

## State and layout contract

`App.vue` derives `tabletChatRailVisible` from the existing tablet classifier
and active route. It is false only for the active Settings station. The shell
always exposes `--talos-tablet-sidebar-width`, while
`--talos-tablet-rail` becomes zero for Settings so its sheet owns the full
window.

`TalosMobileScreen` gains one compatibility-defaulted
`tabletEdgeToEdge?: boolean` prop. When true, only the `md` layout removes the
generic screen gutter and outer scrolling; phone spacing and scrolling stay
unchanged.

`SettingsScreen` opts into that contract. `TalosMobileSettingsCenter` becomes a
full-height borderless list-detail scaffold at `md`, and its category pane
uses `--talos-tablet-sidebar-width`. Existing selected-state, phone back
behavior, route query, and pane scrolling remain unchanged.

## Accessibility and lifecycle

- The Settings category `aside` remains labelled and the active tab remains
  selected through Reka Tabs.
- The modal sheet remains the only active station surface.
- Closing Settings restores the previously persisted chat rail width.
- No content, key, database, or route schema changes.
- Reduced-motion behavior is unchanged.

