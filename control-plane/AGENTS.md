# AVM Laravel control-plane — working rules

## Architecture Boundaries

- Laravel control-plane owns product state: sessions, chat pages, files, runs, users, APIs, persistence, queues, reports, and UI delivery.
- TALOS UI is the user-facing product surface. It must show real behavior from Laravel/core/validator APIs, not disconnected mock panels.

## Tool Routing

- Use Laravel APIs for browser-facing TALOS behavior.

## No fake feature rule

For TALOS specifically:

- Chat pages must call real chat APIs.
- Benchmark panels must be fed by benchmark endpoints or labeled fixtures.
- File ingestion UI must call ingestion APIs or be visibly disabled.
- Trace/replay UI must render real trace events or explain that none are available.

## UI Product Rules

- `/chat` is the dedicated low-noise chat surface.
- `/dashboard` is the control-plane/cockpit surface.
- Do not mix cockpit noise into the primary chat route.
- TALOS UI must use compact, enterprise-grade interaction patterns, not toy dashboards.
- Use shadcn-vue style primitives where appropriate, with owned components and AVM-specific semantics.
- Do not add a visual unless it clarifies state, evidence, execution, or user action.

## Verification

Run verification before claiming completion. Choose commands that prove the claim:

- Control-plane backend changes: `php artisan test`.
- TALOS UI changes: `npm run build` in `control-plane`, route checks when a server is running.
- Cross-cutting changes: `git diff --check`.
