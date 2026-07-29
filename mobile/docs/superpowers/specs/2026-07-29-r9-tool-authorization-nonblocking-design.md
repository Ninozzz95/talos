# R9 Nonblocking Tool Authorization — Design

Date: 2026-07-29  
Research:
`docs/superpowers/research/2026-07-29-r9-tool-authorization-nonblocking-research.md`

## State model

```text
tool enabled?
  no  -> unavailable; no schema; no prompt
  yes -> action policy
           deny  -> unavailable; deny wins
           allow -> runnable baseline
           ask   -> exact saved grant?
                        yes -> runnable grant
                        no  -> durable authorization request
```

An enabled tool does not imply authorization. An authorization grant does not
enable a disabled tool.

## Persistent grant

Contract `talos.tool.authorization-grants/1`:

```ts
interface TalosToolAuthorizationGrantV1 {
    schema_version: 1
    tool: TalosAgentToolId
    actions: readonly TalosToolAction[]
    scope: 'device'
    granted_at: string
}

interface TalosToolAuthorizationGrantsV1 {
    schema_version: 1
    revision: number
    grants: Readonly<Record<string, TalosToolAuthorizationGrantV1>>
}
```

Rules:

- exact tool match;
- every currently asked action must be covered;
- extra/future required actions are not covered;
- current deny and disabled state always win;
- mutation is serialized, persisted before reactive publication, revisioned,
  visible, and reversible.

## Durable interrupt

One encrypted `talos_tool_activity` row represents one suspended provider tool
round:

- operation: `tool.authorization`;
- status:
  - `pending`: waiting for one or more decisions;
  - `recovery_required`: execution or continuation needs explicit recovery;
  - `succeeded`: final assistant continuation persisted;
  - `cancelled`: originating session/run was explicitly abandoned before any
    side effect;
- payload contract: `talos.tool.authorization-checkpoint/1`.

The payload contains:

- checkpoint/session/send/model identity;
- loop stage (`before_tools` or `before_model`);
- provider-neutral typed turns and bounded loop counters;
- the assistant tool-call round;
- independent requests and decisions;
- attachment references, never decrypted file bytes;
- no API key or credential.

Each request contains canonical name, call ID, action set, validated input,
SHA-256 of deterministic JSON, title/description keys, and
`allow_persistent`.

## Agent-loop transition

The loop becomes two phase:

1. provider returns a tool-call round;
2. preflight every call without running a tool;
3. if any preflight is unresolved, return a serializable checkpoint;
4. controller persists it;
5. foreground send appends one honest pending-status assistant row and releases
   `sending`;
6. decisions mutate the encrypted checkpoint;
7. once resolved, the continuation single-flight resumes:
   - re-preflight with the stored decisions and live revocation;
   - execute calls with bounded parallelism;
   - persist the post-tool `before_model` checkpoint;
   - continue the provider loop;
   - append the final assistant row with `tool_authorization_checkpoint_id`;
   - close the activity.

No call in the suspended round executes before step 6.

## Crash and exactly-once boundary

Tool bodies are not assumed idempotent.

- Before side effects, status becomes `recovery_required` and phase
  `running_tools`.
- After all results are available, phase becomes `before_model` and the exact
  result turns are persisted.
- Startup may safely resume `before_model`; it never auto-runs
  `running_tools`.
- If the final assistant row already carries the checkpoint ID, reconciliation
  closes the activity without another provider or tool call.
- An uncertain `running_tools` checkpoint requires an explicit retry/cancel
  choice and explains that the prior side effect may have completed.

## UI

`TalosMobileToolConsentSheet` becomes a non-modal authorization card:

- no full-screen backdrop;
- no `aria-modal=true`;
- no focus trap;
- exact tool title, explanation, action badges, origin chat, and bounded
  formatted arguments;
- buttons: Deny, Allow once, Always allow;
- close/minimize means “Later”, not denial;
- oldest request first and pending count;
- background composer and navigation remain operable.

Agent Tools Settings shows one of:

- disabled;
- allowed by baseline policy;
- asks before use;
- always allowed for this tool;
- unavailable by action policy.

Saved authorization has a visible “Ask again” revocation action.

## Rejected alternatives

- parked Promise: blocks chat and vanishes on process death;
- conversation-wide write cache: contradicts “Allow once” and over-grants;
- permanent allow by action category from the popup: too broad;
- executing allowed siblings before checkpointing unresolved calls: creates a
  partial side-effect checkpoint;
- automatic retry from uncertain `running_tools`: can duplicate writes;
- a new external agent runtime: conflicts with TALOS state ownership;
- storing checkpoint/provider keys in Preferences: unencrypted and wrong
  boundary.

