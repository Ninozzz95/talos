# P0-A web outbound-permission execution ledger

Date: 2026-07-28  
Subsystem: TALOS mobile / security / tool permissions  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED — automated gates complete; owner device acceptance pending  
Commit: forbidden without fresh explicit owner authorization

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p0-web-tool-network-security-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-web-tool-network-security-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-web-outbound-permission-ledger.md`

Modify:

- `mobile/src/lib/search/webTools.ts`
- `mobile/tests/unit/search/webTools.test.ts`
- `mobile/tests/unit/chat/chatController.test.ts`

Delete:

- none

## Stable public contracts

- `TalosToolAction = 'read' | 'write' | 'outbound'`
- `TalosToolPermissions`
- `TALOS_DEFAULT_TOOL_PERMISSIONS`
- `decideTalosToolPermission(...)`
- `executeTalosTool(...)`
- `createTalosWebTools(...)`
- tool names `web_search` and `web_read`

No new permission vocabulary or settings migration is allowed.

## RED scenarios

1. `WEB-OUTBOUND-01 classifies both network tools as outbound`
   - Expected pre-fix failure: both actions equal `read`.
2. `WEB-OUTBOUND-02 deny blocks search before the source`
   - Execute with `{ read: allow, outbound: deny }`.
   - Expected pre-fix failure: `sources.search` runs.
3. `WEB-OUTBOUND-03 deny blocks read before the source`
   - Expected pre-fix failure: `sources.read` runs.
4. `WEB-OUTBOUND-04 ask requires consent before network`
   - Decline and prove neither source runs.
5. Existing search/read journeys explicitly grant outbound and remain green.
6. Controller search-only journey explicitly grants outbound, proving the
   realistic provider/tool/evidence path rather than relying on the old
   misclassification.

## GREEN edit

- Change only `web_search.action` and `web_read.action` to `outbound`.
- Keep executor ordering, denial result, consent queue, audit and untrusted
  wrapper unchanged.
- Update positive tests to opt in explicitly.

## Commands

RED and focused GREEN:

```powershell
npx vitest run tests/unit/search/webTools.test.ts tests/unit/chat/chatController.test.ts
```

Affected permission/tool regression:

```powershell
npx vitest run tests/unit/tools/toolExecutor.test.ts tests/unit/tools/toolRegistry.test.ts tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/search/webTools.test.ts tests/unit/chat/chatController.test.ts
npm run typecheck
git diff --check
```

## Upstream decision, real proof and rollback

Research and design:

- `../research/2026-07-28-p0-web-tool-network-security-research.md`
- `../specs/2026-07-28-p0-web-tool-network-security-design.md`

Decision: adapt the already-pinned AVM `outbound` capability; no dependency is
needed for this slice.

Human-visible proof: with Web search configured, `outbound: deny` offers/runs
no web tool; `ask` shows consent before a query or URL leaves the device;
`allow` performs the normal search/read flow.

Rollback may revert only the two action values and their tests, but restoring
the bypass is not an acceptable release state.

## Closure record

- RED: 2 files, 51 tests; the five named outbound scenarios failed and 46
  adjacent scenarios passed.
- Focused GREEN: 2 files, 51/51 passed.
- Affected permission/tool/controller regression: 5 files, 69/69 passed.
- `npm run typecheck`: pass.
- Scoped `git diff --check`: pass.
- No dependency, persisted state, schema, credential, commit, Claude session
  or external provider was changed.
- Physical consent/allow/deny presentation remains an item for the rebuilt APK
  checklist. This slice does not authorize a Claude ACK ticket.
