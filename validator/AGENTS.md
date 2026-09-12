# AVM Validator — working rules

## Architecture Boundaries

- Validator Node.js remains stateless. It owns Zod/JMP validation, validator health, and compatibility telemetry. It does not own product state.

## Typed Tool Response Parsing

- Parse structured responses by type and schema, not by array position.
- Prefer JSON/Zod/PHP value objects over regex.
- If parsing model JSON, strip code fences defensively, validate shape, and handle parse failure as a validation fault.

## Verification

Run verification before claiming completion. Choose commands that prove the claim:

- Validator changes: `npm test` and `npm run build` in `validator`.
- Cross-cutting changes: `git diff --check`.
