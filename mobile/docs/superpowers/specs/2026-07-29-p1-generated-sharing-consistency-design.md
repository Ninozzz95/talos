# Design - generated-file sharing consistency

Date: 2026-07-29  
Status: ready for RED

## One policy, two retrieval modes

```text
metadata.library_shared
        |
        +-- false -> deny agent list/search/read/export for either origin
        |
        `-- true/absent
              |-> uploaded: eligible for bounded ambient selection
              `-> uploaded/generated: eligible for explicit Library tools

direct human Open / Attach / Save / Delete: independent of this agent policy
```

## UI contract

- every available uploaded or generated row in “Media in this chat” shows the
  compact stored access state;
- every row's More menu contains one controlled “Any chat may read it”
  checkbox;
- absent metadata renders checked/shared; explicit false renders
  unchecked/private;
- selecting it calls the existing `setShared(fileId, desired)` operation;
- failure, per-file busy state, and non-optimistic stored truth remain exactly
  as implemented;
- provenance still distinguishes uploaded from generated.

The obsolete generated-only sentence “TALOS never re-reads what it wrote” is
removed from the rendered surface. The truthful nuance is architectural:
generated output is never injected automatically, but it may be explicitly
retrieved when the user leaves this policy enabled.

## Agent contract

- `librarySummaries()` remains the canonical list/search/read predicate;
- `libraryExportCandidates()` adopts that same
  `isTalosLibraryFileShared(metadata)` predicate for both origins;
- export continues to re-list immediately before decrypted-byte access;
- a withdrawn generated file resolves as unavailable and no Vault byte read or
  native Save-As begins;
- permission, consent, global live revocation, storage-lock, and audit behavior
  are unchanged.

## Compatibility

- no schema, migration, repository, Vault-service, provider, tool input, native
  Android, or persisted chat contract changes;
- absent flags remain shared;
- generated explicit discovery remains available by default;
- uploaded ambient injection remains unchanged;
- manual device save remains available even for a private file;
- the initial bundle budget remains 560,000 bytes.

## Human-visible proof

In a chat that generated a document, the row shows the same controlled access
state as an upload. Turning it off prevents a later natural-language
search/read/export from accessing that file, while manual Open, Attach, and
Save to phone still work.
