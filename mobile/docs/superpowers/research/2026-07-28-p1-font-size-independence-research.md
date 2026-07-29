# P1 Font-size independence research

Date: 2026-07-28

## Problem named from current code

TALOS exposes two persisted controls:

- `Font size` (`shell.ui_font_scale`) for interface text.
- `Chat message size` (`chat_layout.bubble_scale`) for message content.

They are not independent. `talosChatTextSize()` currently returns
`calc(<chat-rem> * var(--talos-ui-scale))`, so changing the interface control
also changes the message body. The owner contract is the opposite: interface
size changes all UI text except chat messages, while chat size changes only
chat message content.

## Current primary sources and pins

Accessed 2026-07-28:

1. [CSS Values and Units Level 4, section 6.1.1](https://www.w3.org/TR/css-values-4/#font-relative-lengths)
   defines `rem` relative to the root element and distinguishes it from local
   inherited `em` sizing. Pin: W3C Working Draft 12 March 2024.
2. [CSS Cascading and Inheritance Level 5, section 7.2](https://www.w3.org/TR/css-cascade-5/#inheriting)
   defines inheritance as propagation of the parent's computed value. Pin:
   W3C Candidate Recommendation Draft 13 January 2022.
3. [WCAG 2.2, SC 1.4.4 Resize Text](https://www.w3.org/TR/WCAG22/#resize-text)
   requires text resize up to 200 percent without loss of content or
   functionality. Pin: W3C Recommendation WCAG 2.2.
4. [WCAG 2.2, SC 1.4.10 Reflow](https://www.w3.org/TR/WCAG22/#reflow)
   requires enlarged content to reflow without two-dimensional scrolling in
   the defined viewport.
5. [Android 14 non-linear font scaling](https://developer.android.com/about/versions/14/features#non-linear-font-scaling)
   requires testing at the platform's 200 percent font setting and warns
   against assuming a single linear system font scalar.

MDN's maintained [`font-size` reference](https://developer.mozilla.org/en-US/docs/Web/CSS/font-size)
was inspected as an implementation reference: `rem` avoids parent compounding,
while `em` multiplies the inherited computed size.

## Upstream decision

**Adapt behind an AVM-owned boundary.** Keep TALOS's two existing persisted
preferences and its existing `--talos-ui-scale` adapter. Return a root-relative
`rem` from the existing public `talosChatTextSize()` boundary instead of
multiplying it by the interface variable.

No package, SDK, sidecar, or protocol is appropriate: this is standards-defined
CSS value resolution, not a missing library capability. Adding a dependency
would neither improve conformance nor remove the need for the browser-level
acceptance proof.

## Accessibility consequences

- Interface text tokens continue to consume `--talos-ui-scale`.
- Message prose inherits one explicit `rem` size from the thread root and does
  not consume the TALOS interface scale a second time.
- Message-adjacent controls and evidence chrome (Reasoning, Sources, actions,
  timestamps, composer) remain interface UI and continue to use UI tokens.
- Browser/WebView user zoom and Android system accessibility scaling are not
  disabled. App-level control independence is additional to, not a replacement
  for, platform accessibility.
- The final device checklist must include Android maximum font size and confirm
  wrapping, no clipping, and no horizontal overflow.

## Rejected alternatives

- A second global CSS variable applied to the whole thread: rejected because it
  would also capture message-adjacent controls that belong to interface scale.
- Per-descendant overrides: rejected because they recreate the prior regression
  class where nested text utilities silently override message sizing.
- Changing the root HTML font size: rejected because `rem`-based interface and
  message axes would become coupled again.
