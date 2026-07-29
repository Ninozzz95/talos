# Design - P1 persisted reasoning row and drawer

Date: 2026-07-28

## Contract

One canonical function derives displayable reasoning from a message metadata
object:

- a non-empty string is returned byte-for-byte;
- whitespace-only, missing, redacted, object, array, and numeric values return
  `null`;
- the function never parses provider wire formats or mutates metadata.

`toMessageView(...)` projects that value onto
`TalosMobileMessageView.reasoning`. Every message loaded from SQLite and every
newly appended assistant message therefore crosses the same boundary.

`TalosMobileMessageList` renders `TalosMobileReasoningBlock` only when:

1. the message role is `assistant`; and
2. the typed `message.reasoning` value is non-null.

The row remains above the answer. The reasoning text remains absent from the
answer DOM until the row is activated, then appears as plain text in the
existing modal bottom drawer.

The session export uses the same canonical extractor. Therefore a persisted
message cannot satisfy the Markdown `Reasoning` condition while failing the
mobile view projection condition.

## Compatibility

- Provider adapters and their request/stream contracts do not change.
- SQLite schema and stored JSON do not change.
- Existing messages gain the typed value when read; no migration is required.
- Streaming reasoning continues to use the existing live component.
- Empty or unavailable summaries remain silent.
- Answer content, exports, tool activity, sources, and message actions remain
  unchanged.

## Failure behavior

Malformed or non-text metadata fails closed to no reasoning row and no export
section. It does not crash the thread and is never coerced with `String(...)`.

## Rollback

Remove the typed projection and canonical extractor, restore the two direct
metadata reads, and remove the new integration tests. No database or provider
rollback is required.

