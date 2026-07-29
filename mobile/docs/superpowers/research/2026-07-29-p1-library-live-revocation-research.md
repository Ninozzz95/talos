# Research dossier - live Library revocation

Date: 2026-07-29  
Subsystem: TALOS mobile agent tools / encrypted Library

## Local diagnosis

- the global `library_context_enabled` switch is evaluated when a send builds
  the model-visible tool list;
- the tool definitions are then retained for the whole agent loop, so a tool
  call returned by the provider can still execute after the user withdraws
  Library access;
- Library list, full-text search, read, image-byte read, and export sources do
  not re-check the global switch after their asynchronous repository or Vault
  boundary;
- `offer()` calls the policy callback without a fail-closed error path;
- the generic Agent Tools executor already performs a fresh execution-time
  toggle check and fail-closes callback errors, but the controller currently
  supplies only the per-tool toggle, not the global Library switch.

This is a time-of-check/time-of-use authorization defect: hiding a schema from
the next request is not revocation of a call already offered in the current
request.

## Current primary sources

1. OWASP, **Authorization Cheat Sheet**, inspected 2026-07-29:
   <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>
   - deny access by default;
   - validate permissions on every request;
   - apply defense in depth instead of relying on one control;
   - fail safely and test authorization failures.
2. OWASP, **Business Logic Security Cheat Sheet**, inspected 2026-07-29:
   <https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html>
   - ask whether the action is allowed on this object, in this state, right
     now;
   - do not rely on a permission checked only when a resource was loaded;
   - keep contextual authorization close to the guarded operation;
   - record TOCTOU and ordering failures as permanent tests.
3. NIST, **Zero Trust Cybersecurity: Never Trust, Always Verify**, inspected
   2026-07-29:
   <https://www.nist.gov/blogs/taking-measure/zero-trust-cybersecurity-never-trust-always-verify>
   - prior access is not a durable authorization grant;
   - access decisions must reflect current policy and context.

Exact upstream pin: the three documents above as retrieved 2026-07-29. No
runtime package or protocol dependency is introduced.

## Upstream decision

**Adapt the standards behind a TALOS-owned dynamic policy adapter.**

- retain the global setting as the canonical product decision;
- make its callback fail closed;
- re-check it at schema offer, tool execution, and immediately around each
  asynchronous metadata/content/byte boundary;
- keep the per-file sharing decision as a separate object-level policy;
- let the existing executor own the typed denial/audit path.

Rejected alternatives:

- rebuild the toolset whenever Settings changes: rejected because an already
  returned provider call still holds a reference to the old offered tool;
- check only in the controller: rejected because direct toolset consumers and
  a setting change during an awaited Vault read would bypass it;
- check only inside the toolset: rejected because argument parsing and a
  consent prompt could still occur after access was withdrawn;
- cache the setting in the toolset: rejected because it turns revocation into
  next-launch behavior;
- add a new authorization package: rejected because the required dynamic
  boolean policy is small, local, already persisted, and no external identity
  or policy language is involved.

## Security and lifecycle constraints

- callback exceptions deny Library access;
- no Library repository/Vault read begins when access is already off;
- if access becomes off while an async read is in flight, its data is
  discarded and never returned to the model or passed to device export;
- export re-validates before decrypted bytes and before native Save-As;
- once the Android document picker has accepted a platform write, it remains
  the user's explicit native action and cannot truthfully be reported as
  rolled back by a later in-app toggle;
- every denial continues through the existing tool audit boundary.
