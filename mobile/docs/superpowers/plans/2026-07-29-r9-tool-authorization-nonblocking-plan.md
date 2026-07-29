# R9 Nonblocking Tool Authorization — Execution Plan

Date: 2026-07-29  
Mode: sequential TDD; do not advance across a red gate

1. Add RED pure tests for exact grant scope, revision, precedence, malformed
   state, request binding, digest, and checkpoint parsing.
2. Implement pure authorization contracts and transactional Settings storage.
3. Add RED encrypted repository/checkpoint tests, including reload and
   recovery-required phases.
4. Implement the activity-backed coordinator without a database migration.
5. Add RED executor/agent-loop tests proving whole-round preflight and zero
   execution before durable suspension.
6. Implement two-phase preflight, serializable suspension, and before-model
   checkpoint callback.
7. Add RED chat/controller tests proving the foreground send releases,
   continuation remains bound to its original identity, and uncertain side
   effects never auto-repeat.
8. Implement queued background continuation and startup reconciliation.
9. Add RED UI tests for non-modal behavior, three decisions, Later semantics,
   pending count, origin chat, localization, and grant revocation.
10. Implement the card and Settings status/revoke presentation.
11. Route generated-marker saves through the same authorization contract.
12. Run focused gates after each slice, then the affected unit gate,
    typecheck, build, diff check, and coordinated E2E.
13. Amend R8-C/D to consume this generic authorization path; do not add a
    second Library-only blocking consent mechanism.

