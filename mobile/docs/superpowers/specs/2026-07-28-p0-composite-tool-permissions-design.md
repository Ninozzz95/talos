# Design - P0 composite tool permissions

Date: 2026-07-28

## Contract

`TalosToolDefinition.action` remains the stable primary action used for the
activity category. `TalosToolDefinition.requiredActions` is an optional,
readonly complete capability declaration.

`talosToolRequiredActions(tool)` returns a stable, duplicate-free list that
always contains the primary `action`, even if a malformed definition omits it
from `requiredActions`. Existing tools therefore retain their current
single-action behavior.

Before a tool body runs:

1. parse and validate arguments;
2. derive every required action;
3. if any action resolves to `deny`, return
   `TALOS_TOOL_DENIED_BY_POLICY` without asking or running;
4. collect actions resolving to `ask`;
5. if the collection is non-empty, request one human decision that names those
   actions;
6. only after an explicit allow may the body run.

The tool-offer filter uses the same helper and omits a schema if any required
action is denied. This keeps provider declarations and execution enforcement
conformant.

## Web tools

Both `web_search` and `web_read` declare:

```ts
action: 'outbound',
requiredActions: ['outbound', 'write'],
```

Their descriptions tell both the model and consent surface that successful
results/pages are persisted to the encrypted Library.

## Conversation-scoped write consent

The established write-only consent cache remains compatible. It may satisfy a
request only when every currently asked action is `write`. An earlier write
approval must never satisfy a later `outbound` confirmation.

For compound requests, the executor supplies the exact actions currently set to
`ask`. Approving a compound request may cache its write component for the
conversation, but it does not cache or bypass outbound confirmation.

## Settings and audit

- AI Defaults must say web search/read currently send data off-device.
- It must say their source records also require write permission.
- Each tool activity row keeps the primary `action` and adds
  `required_actions` to its payload.

## Compatibility and rollback

- Provider wire schemas are unchanged: authorization metadata never leaves the
  device.
- Legacy tools with no `requiredActions` behave exactly as before.
- Rollback is removal of the optional field/helper and the two web declarations;
  no stored data or schema migration is involved.

## R4 follow-up contracts

- `generate_image` keeps `action: 'write'` as its stable activity label and
  declares `requiredActions: ['outbound', 'write']`. If outbound is denied, it
  is neither offered nor executed; no provider call or Library write may occur.
- `library_export` keeps `action: 'write'` and declares
  `requiredActions: ['read', 'write']`. If read is denied, it is neither offered
  nor executed; candidate listing, decrypted-byte access, and Save-As must not
  occur.
- The established central offer/execution matrix remains the sole enforcement
  mechanism. Tool-local ad-hoc permission checks are forbidden.
