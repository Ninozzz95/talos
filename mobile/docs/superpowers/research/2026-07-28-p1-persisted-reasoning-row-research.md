# Research dossier - P1 persisted reasoning row and drawer

Date: 2026-07-28

## Local problem statement

The immutable owner transcript records a TALOS Markdown export at
`2026-07-27T19:56:01.956Z` in which two assistant messages contain
`> **Reasoning**`, followed by the report:

> nel markdown transcript spunta il reasoning ma nella chat non c'è la riga
> reasoning e il conseguente drawer

The APK identifies baseline `0e66f3b`. That baseline already contains:

- provider-specific reasoning capture;
- persistence in `message.metadata.reasoning`;
- export from that metadata;
- a muted `TalosMobileReasoningBlock` row and modal bottom drawer;
- live-stream rendering of the same block.

The current unit coverage proves those pieces separately but does not prove the
reported invariant end to end: a persisted message whose reasoning is exported
must project a visible completed-message row, open its drawer, and do so again
after reload.

## Current primary sources inspected

### Anthropic thinking blocks

- Official Claude Platform documentation:
  https://platform.claude.com/docs/en/build-with-claude/extended-thinking
- Inspected 2026-07-28.
- Anthropic returns thinking in content blocks separate from answer text.
- Current models can return summarized rather than raw internal reasoning, and
  redacted/omitted blocks may contain no displayable text.

Decision: display only the exact readable thinking text returned by the
provider adapter. Do not reconstruct, solicit, or claim access to hidden chain
of thought. An absent/empty provider block produces no row.

### Gemini thought summaries

- Official Google AI documentation:
  https://ai.google.dev/gemini-api/docs/thinking
- Inspected 2026-07-28.
- Gemini identifies thought summaries separately from model output; a thought
  block can legitimately contain no summary text.

Decision: keep the provider adapter as the wire-format boundary and normalize
only non-empty returned text into TALOS's canonical reasoning field.

### Modal dialog semantics

- WAI-ARIA Authoring Practices Guide, modal dialog pattern:
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- WAI-ARIA 1.2:
  https://www.w3.org/TR/wai-aria/
- Inspected 2026-07-28.
- A button that opens a dialog may advertise `aria-haspopup="dialog"`.
- A modal dialog moves focus inside, contains its tab sequence, closes with
  Escape, and returns focus to the invoking control.

Decision: adapt through the existing AVM-owned
`TalosMobileTraceRow` and `TalosMobileComposerSheet`; no new disclosure or
dialog implementation.

### Touch target

- WCAG 2.2:
  https://www.w3.org/TR/WCAG22/
- Inspected 2026-07-28.

Decision: preserve the app's existing 44px reasoning-row touch target, which is
stricter than the WCAG 2.2 minimum.

## Root-cause boundary

The exported reasoning and rendered reasoning currently read the same untyped
metadata bag independently. The runtime path appears equivalent, but there is
no typed projection contract and no completed-message/reload integration test.
That allowed the owner's contradictory observation to remain unresolved:
isolated capture, export, and drawer tests all passed without proving their
connection.

The repair makes displayable reasoning a first-class
`TalosMobileMessageView.reasoning` value, derived at the store projection
boundary by one canonical extractor shared with export. The completed-message
renderer consumes that typed value rather than reaching back into arbitrary
metadata.

## Adopt / adapt / reject record

- Adopt: provider-returned readable thinking/thought-summary text exactly as
  supplied.
- Adapt: normalize it through one AVM-owned metadata extractor and expose it on
  the mobile message view.
- Reuse: existing trace row and modal sheet, including focus and Back/Escape
  behavior.
- Reject: a new package, an accordion, rendering reasoning as answer Markdown,
  reconstructing hidden thoughts, showing empty/redacted blocks, or adding
  reasoning to user/system rows.

## Security and privacy boundary

- Only already persisted, provider-returned readable text is displayed.
- No hidden, encrypted, redacted, or signature content is decoded or exposed.
- Reasoning remains separate from canonical answer text and provider replay.
- The drawer renders plain text, never executable HTML or Markdown.
- Existing 64 KiB capture bounds remain unchanged.

