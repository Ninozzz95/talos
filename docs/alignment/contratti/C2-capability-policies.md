# C2 - Capability policies

Delta ID: `DELTA-2026-C2`

Date: 2026-08-04
Author/agent: Codex
Feature ID (parity): `capability_policy`
Desktop change: documentation proposal only; source inspected at
`dafb9457c085ea8cb3a539fc7376a8fb76a89c7e`
Mobile reference: read-only source inspected at
`643035bf12f68adfd01a4042739804846b7e8f23`

## 1. Mobile decision

- [ ] no impact
- [x] affects existing desktop and mobile policy surfaces
- [ ] implementation authorized

Owner constraint, 2026-08-04: one permission grammar everywhere, exactly three
states, no new booleans, and inherited/off values migrate to `ask`.

Owner decision, 2026-08-04: **canonical migration selected**. Preserve the
three-state baseline, represent approval lifetimes as separate scoped grants,
translate master enable into an audited revision-checked batch operation, and
make revoke-all preserve explicit user denies. This accepts the contract for
future desktop implementation; it does not execute or authorize a migration
before the P0 decision checkpoint and RED migration tests are complete.

## 2. Shared contract

- [ ] no contract change
- [x] proposed single contract: `talos.capability_policy_set`
- proposed `schema_version`: `1`

### Source schemas, side by side

| Desktop (`@dafb945`) | Mobile (`@643035b`) |
|---|---|
| <pre><code class="language-php">enum TalosCapabilityDecision: string
{
  case DENY = 'deny';
  case ASK = 'ask';
  case ALLOW_FOR_SESSION = 'allow_for_session';
  case ALLOW_UNTIL_REVOKED = 'allow_until_revoked';
}

// snapshotFromSet()
[
  'schema_version' =&gt; 1,
  'revision' =&gt; int,
  'capabilities' =&gt; [[
    // capability metadata
    'decision' =&gt; string,
    'source' =&gt; 'explicit'|'default'|'invalid',
    'session_id' =&gt; ?string,
    'expires_at' =&gt; ?string,
    'last_used_at' =&gt; ?string,
  ]],
  'master_enable' =&gt; [
    'eligible' =&gt; string[],
    'excluded' =&gt; string[],
  ],
]</code></pre> | <pre><code class="language-ts">export type TalosToolAction =
  | 'read'
  | 'write'
  | 'outbound'

export type TalosToolPermission =
  | 'allow'
  | 'ask'
  | 'deny'

export type TalosToolPermissions =
  Record&lt;TalosToolAction,
         TalosToolPermission&gt;

export const TALOS_DEFAULT_TOOL_PERMISSIONS = {
  read: 'ask',
  write: 'ask',
  outbound: 'ask',
}

// persistent grant
{
  schema_version: 1,
  tool: string,
  actions: TalosToolAction[],
  scope: 'device',
  granted_at: string,
}</code></pre> |

Desktop capability identifiers include domain-specific values such as
`browser.read`, `browser.write`, `files.transfer_to_provider`, `email.send`,
and `calendar.write`. Mobile baseline policies are action-level and individual
tool grants bind a tool plus actions.

### Divergences

| ID | Class | Divergence | Correct semantics and concrete failure |
|---|---|---|---|
| C2-D1 | cosmetica | Desktop calls the record a capability policy; mobile UI calls it a tool permission. | Canonical term is capability policy; a tool declares one or more capabilities/actions. |
| C2-D2 | strutturale | Desktop keys policy by domain capability; mobile baseline keys by `read/write/outbound` and grants by tool. | Unified evaluation needs all three dimensions: capability, action, and optional tool/resource scope. Dropping domain capability could allow every outbound tool after approving one harmless web search. |
| C2-D3 | semantica | Desktop encodes duration as two additional decisions; mobile keeps baseline `allow/ask/deny` and records grants separately. | Mobile separation is correct under the owner rule. Example: `allow_for_session` is not a fourth opinion; it means baseline `ask` plus a live session grant. Keeping it as a policy value makes settings show four states and prevents one grammar everywhere. |
| C2-D4 | semantica | Desktop `revokeAll()` writes explicit `deny` for every capability; mobile distinguishes inherited defaults from choices. | Mobile default semantics are correct. Revoking grants must return inherited entries to `ask`, while preserving explicit user denies. Current desktop behavior turns “remove approvals” into “never allow” and suppresses future prompts. |
| C2-D5 | semantica | Desktop `masterEnable()` writes `allow_until_revoked`; the route name can be mistaken for a stored master boolean. | It must translate to an audited batch operation, never a boolean. Example: a boolean cannot represent excluded high-risk capabilities and can drift from individual rows. |
| C2-D6 | strutturale | Desktop has optimistic revision, risk acknowledgment, TTL, expiry, and last-used metadata; mobile grants have revision and device scope but a smaller lifetime set. | Preserve revision and audit/lifetime metadata. Without expected revision, two settings surfaces can overwrite a newer denial with stale allowance. |

### Proposed unified schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://talo.sh/schemas/capability-policy-set.v1.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "revision", "policies", "grants"],
  "properties": {
    "schema_version": { "const": 1 },
    "revision": { "type": "integer", "minimum": 0 },
    "policies": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["capability", "actions", "decision", "source", "risk"],
        "properties": {
          "capability": { "type": "string", "minLength": 1 },
          "actions": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": { "enum": ["read", "write", "outbound"] }
          },
          "decision": { "enum": ["allow", "ask", "deny"] },
          "source": { "enum": ["default", "user", "managed"] },
          "risk": { "enum": ["low", "medium", "high", "critical"] },
          "updated_at": { "type": ["string", "null"], "format": "date-time" },
          "last_used_at": { "type": ["string", "null"], "format": "date-time" }
        }
      }
    },
    "grants": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "capability", "actions", "scope", "status", "granted_at"],
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "capability": { "type": "string", "minLength": 1 },
          "tool_id": { "type": ["string", "null"] },
          "actions": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": { "enum": ["read", "write", "outbound"] }
          },
          "scope": { "enum": ["once", "session", "device", "account"] },
          "scope_id": { "type": ["string", "null"] },
          "status": { "enum": ["active", "consumed", "expired", "revoked"] },
          "granted_at": { "type": "string", "format": "date-time" },
          "expires_at": { "type": ["string", "null"], "format": "date-time" },
          "risk_acknowledged": { "type": "boolean" }
        }
      }
    }
  }
}
```

Normative evaluation order:

1. explicit `deny` denies regardless of grants;
2. a matching active grant allows within its scope;
3. baseline `allow` allows and is persisted as an account-level user choice;
4. `ask` requires interactive authorization;
5. absent/malformed entries fail to inherited `ask`, except malformed security
   records may fail closed operationally and emit a visible fault.

`master-enable` translation:

```json
{
  "schema_version": 1,
  "operation": "batch_set",
  "selector": "master_enable_eligible",
  "decision": "allow",
  "grant_scope": "account",
  "expected_revision": 12,
  "risk_acknowledged": true
}
```

This is a command, not stored policy state and not a boolean.

### Fixture valida

```json
{
  "schema_version": 1,
  "revision": 13,
  "policies": [
    {
      "capability": "browser.read",
      "actions": ["read", "outbound"],
      "decision": "ask",
      "source": "default",
      "risk": "medium",
      "updated_at": null,
      "last_used_at": null
    },
    {
      "capability": "files.write",
      "actions": ["write"],
      "decision": "deny",
      "source": "user",
      "risk": "high",
      "updated_at": "2026-08-04T10:00:00Z",
      "last_used_at": null
    }
  ],
  "grants": [
    {
      "id": "grant-browser-session-1",
      "capability": "browser.read",
      "tool_id": "browser-snapshot",
      "actions": ["read", "outbound"],
      "scope": "session",
      "scope_id": "session-42",
      "status": "active",
      "granted_at": "2026-08-04T10:01:00Z",
      "expires_at": "2026-08-04T18:01:00Z",
      "risk_acknowledged": true
    }
  ]
}
```

### Fixture invalida

Syntactically valid JSON, contract-invalid because it introduces a fourth
policy state and a boolean master switch.

```json
{
  "schema_version": 1,
  "revision": 1,
  "master_enabled": true,
  "policies": [
    {
      "capability": "browser.read",
      "actions": ["read"],
      "decision": "allow_for_session",
      "source": "user",
      "risk": "medium"
    }
  ],
  "grants": []
}
```

### Migration rules proposed

| Existing value | Canonical policy | Grant/action |
|---|---|---|
| missing, inherited off, feature boolean `false` | `ask`, source `default` | no grant |
| desktop `ask` | `ask` | no grant |
| desktop `allow_for_session` | `ask` | active `session` grant |
| desktop `allow_until_revoked` | `allow`, source `user` | account grant/audit record |
| desktop explicit `deny` | `deny`, source `user` | no grant |
| mobile chosen `allow` | `allow`, source `user` | account or device grant according to existing ownership |
| mobile chosen `deny` | `deny`, source `user` | no grant |

The “off -> ask” rule applies only to inherited/default values. It must not
erase a deliberate explicit denial.

## 3. Execution location mobile

- [x] `local_mobile` for local tool/file policy enforcement
- [x] `trusted_node` for node-side capability enforcement
- [x] `remote_provider` only after local policy permits transfer/action
- [x] `unavailable` when no enforcement point can prove the policy

Capabilities are domain-specific; data can be public, private, or secret.
Secrets require local enforcement and must not appear in policy snapshots.

## 4. Sync/conflict

Behavior: typed merge with optimistic `revision`; grants are append/revoke
records, policies are explicit keyed choices.

Conflict: return a visible revision conflict. Never silently merge two
opposing explicit user decisions. Default-source rows may be recomputed from
the current canonical defaults.

## 5. Offline and fallback

Cached local policy and grants are enforceable offline. Missing or expired
grant under `ask` blocks the action and presents authorization; it never
silently upgrades to allow. Remote-only managed policy unavailable offline
fails closed with a visible reason.

## 6. Tests

- Desktop RED/GREEN: future `CapabilityPolicyContractTest` validates the shared
  fixtures, migration table, revision conflicts, and batch translation.
- Mobile RED/GREEN: future `capabilityPolicy.contract.test.ts` makes identical
  fixture decisions and proves inherited defaults can change without replacing
  explicit choices.
- Semantic parity: shared vectors for deny precedence, session expiry,
  once-consumption, revoke-all, master batch, and stale revision.

## 7. Gate

- The owner contract/migration gate is satisfied by the canonical migration
  decision recorded on 2026-08-04.
- Desktop human gate: every permission shows exactly three choices; master
  action previews eligible/excluded changes and requires acknowledgement.
- Mobile physical gate: the same choices and outcomes survive reload/offline.
- Promotion requires a dry-run migration report before any stored decision is
  rewritten.

## 8. Rollback

Keep a read adapter for the old desktop four-state rows and mobile chosen-action
records until the canonical write path is proven. Rollback re-enables old reads;
it never deletes audit/grant history or converts `ask` into `deny`.

## Out of scope

Browser interaction policy, Google/connectors, calendar, file-authority resource
bindings, and provider secrets are not redesigned in C2.
