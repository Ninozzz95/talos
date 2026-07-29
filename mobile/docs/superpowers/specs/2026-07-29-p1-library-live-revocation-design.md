# Design - live Library revocation

Date: 2026-07-29  
Status: ready for RED

## Canonical enforcement flow

```text
global Library switch
  |-> offer-time filter (model never sees a currently forbidden schema)
  |-> execution-time gate (old provider call cannot start)
  `-> operation-local guard
        |-> before async repository/Vault access
        `-> after async access, before data is returned or exported
```

The per-tool Agent Tools toggle, read/write permission policy, per-file
`library_shared` state, and encrypted-storage lock remain independent,
cumulative gates.

## Contracts

- one private `libraryAllowed()` function reads the setting dynamically and
  returns `false` on callback failure;
- one private `requireLibraryEnabled()` function throws the stable
  `TALOS_LIBRARY_DISABLED` code;
- `TalosToolset.isEnabled()` is the single dynamic per-tool/global decision
  used by both schema offer and controller execution;
- every Library metadata, content, image-byte, and export source checks before
  and after the relevant awaited boundary;
- the controller execution callback delegates to that canonical decision, so a
  `library_*` call is allowed only when both its Agent Tools toggle and the
  current global Library switch are on;
- the generic executor keeps its existing `TALOS_TOOL_DISABLED` result when
  withdrawal is observed before the body starts;
- withdrawal observed during a tool body becomes
  `TALOS_LIBRARY_DISABLED`, is audited as failed, and exposes no payload.

## Compatibility

- no settings, repository, Vault, provider, tool schema, or Android contract
  changes;
- non-Library tools are unaffected;
- Library access remains available when the optional callback is absent, which
  preserves isolated/core consumers that do not own mobile Settings;
- per-file sharing and generated-file semantics are not changed in this slice;
- native Save-As keeps the existing consent and cancellation behavior;
- the initial JavaScript budget remains 560,000 bytes.

## Human-visible proof

If the user turns off “Let chats use your Library” after a model request has
already been sent, a returned Library tool call is refused and audited without
opening the Vault. If withdrawal occurs during a slow read, no file content,
image bytes, or device export reaches the next model round.
