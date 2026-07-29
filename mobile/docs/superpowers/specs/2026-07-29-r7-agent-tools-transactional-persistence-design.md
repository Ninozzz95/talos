# Design - transactional Agent Tools toggles

Date: 2026-07-29
Status: ready for RED

## Canonical transition

```text
user requests toggle
  -> restore checkbox DOM to committed reactive value
  -> disable panel switches and clear prior alert
  -> serialized store mutation
       parse candidate from latest committed state
       persist whole settings snapshot with candidate
       success -> publish candidate to reactive state
       failure -> keep prior state and rethrow
  -> success: checked state/count update
  -> failure: previous state/count remain + localized role=alert
```

## Contracts

- `setAgentToolEnabled` still returns `Promise<void>` and ignores malformed
  ids/values.
- valid mutations run serially and compute from the state committed by the
  previous mutation.
- failed persistence never mutates `state.agent_tools`.
- a failed operation does not poison subsequent operations.
- the panel catches every store rejection, keeps one operation in flight,
  exposes `aria-busy`, and disables switches until settlement.
- the error remains visible until the next attempt; it does not steal focus.
- existing success persistence, reload, live revocation, defaults, accessible
  names, and tool registry behavior stay unchanged.

## Human-visible proof

With `Preferences.set` forced to fail, tapping an enabled tool leaves its
switch on and the enabled count unchanged, announces that the previous setting
is still active, and does not change the tools offered to a new message. After
storage recovers, a second tap persists, updates the switch/count, and survives
restart.
