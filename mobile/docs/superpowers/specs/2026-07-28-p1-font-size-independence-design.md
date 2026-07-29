# P1 Font-size independence design

Date: 2026-07-28

## Contract

1. `Font size` changes TALOS interface text: menus, settings, tabs, controls,
   headers, sheets, toasts, composer, and message-adjacent chrome.
2. It does not change user or assistant message prose.
3. `Chat message size` changes user and assistant message prose only.
4. It does not change menus, settings, tabs, controls, headers, sheets, toasts,
   composer, Reasoning/Sources rows, timestamps, or message actions.
5. Both values remain independently persisted and survive reload.
6. Existing option values and serialized preference schemas remain stable.

## Design

`TalosMobileMessageList` remains the single message-prose sizing boundary.
`talosChatTextSize(scale)` returns the mapped root-relative `<n>rem` value.
Message content continues to inherit `1em` below that root. UI descendants keep
their Tailwind text tokens, which consume `--talos-ui-scale`.

No migration is needed because neither `shell.ui_font_scale` nor
`chat_layout.bubble_scale` changes shape or meaning.

## Human-visible acceptance

In a real rendered chat:

- establish `Font size = Small` and `Chat message size = Extra small`;
- change only interface size to `Extra large`: an Appearance label grows while
  existing message prose remains exactly the same computed size;
- change only chat size to `Large`: existing message prose grows while the
  Appearance label remains exactly the same computed size;
- reload: both computed sizes and selected values persist independently.

On Android hardware, repeat the two-axis test and then repeat at maximum system
font size, checking wrap, clipping, and horizontal overflow.
