# C1 - Tools

Delta ID: `DELTA-2026-C1`

Date: 2026-08-04
Author/agent: Codex
Feature ID (parity): `tool_registry`
Desktop change: documentation proposal only; source inspected at
`dafb9457c085ea8cb3a539fc7376a8fb76a89c7e`
Mobile reference: read-only source inspected at
`643035bf12f68adfd01a4042739804846b7e8f23`

## 1. Mobile decision

- [ ] no impact
- [x] affects an existing mobile surface; mobile remains owner-only and
  read-only for this desktop program
- [ ] new capability already authorized for implementation

This document originally exposed two mutually exclusive paths for whether an
installed mobile application may load executable tool code at runtime:

1. **Signed runtime packages.** Mobile gains runtime loading, but needs a
   separately versioned package format, trusted publisher roots, signature and
   digest verification before load, revocation, rollback, quarantine, store
   policy review, and an execution sandbox. A tool declaration is not enough.
2. **Declared dual lifecycle (recommended).** The common contract allows
   `bundled` and `managed_registry`. Mobile executes only `bundled`; desktop may
   execute both. Unsupported lifecycle/location combinations fail closed and
   remain visible as unavailable. This preserves capability parity without
   pretending both installations can accept the same executable payload.

Owner decision, 2026-08-04: **path 2 selected**. C1 is frozen as a declared
dual lifecycle. Mobile v1 executes only `bundled` tools; desktop may execute
`bundled` and `managed_registry` tools; mobile may delegate to an explicitly
paired `trusted_node`. Signed runtime-loaded mobile packages are deferred to a
separate, versioned security program and are not implied by C1 schema version 1.

## 2. Shared contract

- [ ] no contract change
- [x] proposed single contract: `talos.tool_definition`
- proposed `schema_version`: `1`
- canonical schema dialect: JSON Schema Draft 2020-12
- declaration shape adapted from MCP Tool schema 2025-11-25

### Source schemas, side by side

The following shapes are copied from the cited code. Method bodies and comments
not needed to identify the record were omitted; field names and unions are
unchanged.

| Desktop (`@dafb945`) | Mobile (`@643035b`) |
|---|---|
| <pre><code class="language-php">// TalosTool::toApiArray()
[
  'id' =&gt; (string) $this-&gt;id,
  'connector_id' =&gt; $this-&gt;connector_id,
  'name' =&gt; $this-&gt;name,
  'display_name' =&gt; $this-&gt;display_name,
  'description' =&gt; $this-&gt;description,
  'input_schema' =&gt; $this-&gt;input_schema ?? [],
  'risk_level' =&gt; $this-&gt;risk_level,
  'capability' =&gt; $this-&gt;capability,
  'policy' =&gt; $this-&gt;policy ?? [],
  'is_enabled' =&gt; (bool) $this-&gt;is_enabled,
  'planning_enabled' =&gt; (bool) $this-&gt;planning_enabled,
  'created_at' =&gt; $this-&gt;created_at?-&gt;toJSON(),
  'updated_at' =&gt; $this-&gt;updated_at?-&gt;toJSON(),
]

// core ToolDefinition::fromArray()
name: string
title?: string
description?: string
inputSchema: object
outputSchema?: object
annotations?: object
icons?: list
execution?: object
_meta?: object</code></pre> | <pre><code class="language-ts">export interface TalosToolDefinition&lt;Input = unknown&gt; {
  name: string
  title: string
  description: string
  requiredActions?: readonly TalosToolAction[]
  action: TalosToolAction
  confirmation?: 'policy' | 'always'
  input: ZodType&lt;Input&gt;
  run(
    input: Input,
    context: TalosToolContext,
  ): Promise&lt;TalosToolResult&gt;
}

export interface TalosToolResult {
  ok: boolean
  content: string
  code?: string | null
  images?: TalosMobileImageInputPart[]
  messageAttachments?: AppendChatAttachmentInput[]
  evidence?: Record&lt;string, unknown&gt;
}

export type TalosToolAction =
  | 'read'
  | 'write'
  | 'outbound'</code></pre> |

Lifecycle copied from code:

- Desktop: `POST/PATCH/DELETE /tools`, persisted `talos_tools`, runtime CRUD;
  planning availability also depends on tool and connector state.
- Mobile: `defineTalosTool()` modules are bundled into the APK; Zod is the
  executable validator and is translated at provider boundaries.

### Divergences

| ID | Class | Divergence | Correct semantics and concrete failure |
|---|---|---|---|
| C1-D1 | cosmetica | `display_name` versus `title`; `input_schema` versus `input`. | Canonical wire names are `title` and `input_schema`; adapters retain local naming. No behavior change. |
| C1-D2 | strutturale | Desktop stores JSON Schema and policy metadata; mobile stores a Zod validator plus executable `run`. | The common record must contain declarative JSON only. A serialized callback is impossible and unsafe; each runtime resolves an implementation locally. |
| C1-D3 | strutturale | Desktop has connector, enabled, and planning flags; mobile has action, confirmation, and required actions. | Preserve all as typed declaration fields. Omitting either side causes a tool to be offered when its connector is unhealthy or executed without the mobile consent boundary. |
| C1-D4 | semantica | Desktop records are runtime-creatable; mobile tools are compilation-bound. | Neither side is universally correct. Desktop is correct for managed server installations; bundled mobile is correct for store-distributed code. If a desktop-created record were treated as executable mobile code, untrusted remote code could enter the app. If all tools were declared bundled, desktop runtime CRUD would become misleading. The owner selected path 2: declared dual lifecycle. |
| C1-D5 | semantica | Desktop capability is a named domain capability; mobile action is only `read/write/outbound`. | Desktop specificity and mobile coarse actions are both needed. Example: mapping `browser.upload` only to `outbound` loses the file-authority check; mapping only to `browser.upload` loses the generic outbound policy gate. Canonical contract carries both. |
| C1-D6 | semantica | Desktop strict tool schemas require object roots and can carry output schemas; mobile derives provider dialects from Zod and has no canonical output schema. | JSON Schema 2020-12 is the shared source. Mobile remains correct to translate at provider edges, but provider-specific rewrites must not overwrite the canonical schema. Otherwise Gemini's subset could silently weaken every other provider's contract. |

### Proposed unified schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://talo.sh/schemas/tool-definition.v1.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "id",
    "name",
    "title",
    "description",
    "input_schema",
    "capabilities",
    "actions",
    "risk",
    "effects",
    "lifecycle",
    "execution",
    "enabled",
    "planning_enabled"
  ],
  "properties": {
    "schema_version": { "const": 1 },
    "id": { "type": "string", "minLength": 1, "maxLength": 120 },
    "name": { "type": "string", "pattern": "^[A-Z][A-Z0-9_]*$" },
    "title": { "type": "string", "minLength": 1, "maxLength": 160 },
    "description": { "type": "string", "minLength": 1, "maxLength": 4000 },
    "input_schema": {
      "type": "object",
      "required": ["type"],
      "properties": { "type": { "const": "object" } }
    },
    "output_schema": { "type": ["object", "null"] },
    "capabilities": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "type": "string", "minLength": 1 }
    },
    "actions": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "enum": ["read", "write", "outbound"] }
    },
    "confirmation": { "enum": ["policy", "always"] },
    "risk": { "enum": ["low", "medium", "high", "critical"] },
    "effects": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mutates_state", "parallel_safe", "requires_approval", "produces_evidence"],
      "properties": {
        "mutates_state": { "type": "boolean" },
        "parallel_safe": { "type": "boolean" },
        "requires_approval": { "type": "boolean" },
        "produces_evidence": { "type": "boolean" }
      }
    },
    "lifecycle": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "revision"],
      "properties": {
        "kind": { "enum": ["bundled", "managed_registry"] },
        "revision": { "type": "string", "minLength": 1 },
        "integrity_sha256": { "type": ["string", "null"], "pattern": "^[a-f0-9]{64}$" }
      }
    },
    "execution": {
      "type": "object",
      "additionalProperties": false,
      "required": ["locations", "implementation_key"],
      "properties": {
        "locations": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": { "enum": ["local_mobile", "trusted_node", "remote_provider"] }
        },
        "implementation_key": { "type": "string", "minLength": 1 }
      }
    },
    "connector_id": { "type": ["string", "null"] },
    "enabled": { "type": "boolean" },
    "planning_enabled": { "type": "boolean" },
    "annotations": { "type": "object" },
    "metadata": { "type": "object" }
  }
}
```

Cross-field validators, outside plain JSON Schema keywords above:

- `high|critical` requires `effects.requires_approval=true`;
- `effects.mutates_state=true` requires `parallel_safe=false`;
- a runtime may execute only a supported `(lifecycle.kind, location)` pair;
- `implementation_key` resolves local code and is never a URL or code body.

### Fixture valida

```json
{
  "schema_version": 1,
  "id": "browser-screenshot",
  "name": "BROWSER_SCREENSHOT",
  "title": "Capture screenshot",
  "description": "Capture the current browser viewport as evidence.",
  "input_schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  },
  "output_schema": null,
  "capabilities": ["browser.read"],
  "actions": ["read"],
  "confirmation": "policy",
  "risk": "low",
  "effects": {
    "mutates_state": false,
    "parallel_safe": true,
    "requires_approval": false,
    "produces_evidence": true
  },
  "lifecycle": {
    "kind": "bundled",
    "revision": "mobile-app:1"
  },
  "execution": {
    "locations": ["local_mobile", "trusted_node"],
    "implementation_key": "browser.screenshot"
  },
  "connector_id": null,
  "enabled": true,
  "planning_enabled": true,
  "annotations": {},
  "metadata": {}
}
```

### Fixture invalida

Syntactically valid JSON, contract-invalid because the input root is not an
object, the lifecycle is unknown, and a critical mutating tool is marked
parallel-safe without approval.

```json
{
  "schema_version": 1,
  "id": "unsafe",
  "name": "unsafe-tool",
  "title": "Unsafe",
  "description": "Invalid fixture.",
  "input_schema": { "type": "string" },
  "capabilities": ["filesystem.write"],
  "actions": ["write"],
  "risk": "critical",
  "effects": {
    "mutates_state": true,
    "parallel_safe": true,
    "requires_approval": false,
    "produces_evidence": false
  },
  "lifecycle": { "kind": "downloaded_code", "revision": "latest" },
  "execution": {
    "locations": ["local_mobile"],
    "implementation_key": "https://example.invalid/tool.js"
  },
  "enabled": true,
  "planning_enabled": true
}
```

## 3. Execution location mobile

- [x] `local_mobile` for bundled tools
- [x] `trusted_node` when delegated to an explicitly paired node
- [x] `remote_provider` for provider-owned operations behind an adapter
- [x] `unavailable` when lifecycle/location is unsupported

Required capabilities are declared per tool. Data classification is derived
from capability plus arguments; secrets never enter synchronized declarations.

## 4. Sync/conflict

Behavior: typed merge by `id + schema_version + lifecycle.revision`.

Conflict: visible conflict object; never last-write-wins executable behavior.
Metadata may sync, but implementation code does not sync under path 2. Under
path 1, package transport requires its own owner-approved contract.

## 5. Offline and fallback

Bundled tools remain available offline when their dependencies are local.
Managed-registry tools without a trusted node are `unavailable`, not silently
replaced by a model answer. Provider tools report controlled offline failure.

## 6. Tests

- Desktop RED/GREEN: future `ToolDefinitionContractTest` parses valid fixture,
  rejects invalid fixture, and proves DB records cannot imply mobile execution.
- Mobile RED/GREEN: future `toolDefinition.contract.test.ts` validates the same
  fixture decisions and rejects managed runtime execution under path 2.
- Semantic parity: one shared fixture corpus, consumed independently by PHP and
  TypeScript; provider adapters additionally prove dialect conversion does not
  mutate the canonical schema.

## 7. Gate

- Desktop visual/human: registry shows lifecycle and execution availability.
- Mobile physical/human: unavailable managed tool is visible but cannot be
  offered or invoked.
- The lifecycle owner gate is satisfied by path 2. Global state is not promoted
  until both independent validators make identical fixture decisions.

## 8. Rollback

Delete this proposal before implementation, or retain legacy adapters during a
future versioned cutover. Never delete existing desktop rows or mobile bundled
tools as part of rollback.

## Out of scope

Browser behavior, connectors, skill sources, executable package distribution,
and provider-specific tool-call payloads are not changed by C1.
