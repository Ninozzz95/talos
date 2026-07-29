# Design - P0 Agent Tools control

Date: 2026-07-28

## Product contract

`Settings > Agent Tools` is a real local panel listing every tool the chat
runtime can execute. Each row has a localized name, concise purpose, required
action badges, and an accessible persistent switch.

An enabled switch means only that the tool is eligible. Effective availability
is the intersection:

```text
model supports tools
AND runtime source exists
AND tool switch is enabled
AND every read/write/outbound action is not denied
AND required human consent succeeds
```

The panel states this layering so it never implies that enabling web search
configures a provider or that enabling a write tool bypasses confirmation.

## Canonical control catalog

The boot-loaded `toolControls.ts` is dependency-free and records, for every
current wire name:

- stable `id`;
- explicit boolean default.

`TalosAgentToolId` and `TalosAgentToolEnabled` are derived from that default
map. The Settings-only `toolControlCatalog.ts` adds UI group and complete action
set without placing display metadata on the initial application graph.
Conformance tests compare both structures with every executable factory.

`parseTalosAgentToolEnabled()`:

1. accepts only a plain object;
2. visits only known catalog IDs;
3. keeps only boolean stored values;
4. fills missing or malformed known values from the explicit default;
5. drops unknown keys.

`isTalosAgentToolEnabled()` fails closed for an unknown tool name.

Every currently shipped tool declares `defaultEnabled: true` for compatibility.
The separate default action policy remains read allow, write ask, outbound deny.

## Persistence

`TalosMobileSettingsState.agent_tools` stores the complete sanitized boolean
map in the existing `talos.mobile.settings` Preferences envelope.

`SettingsStore.setAgentToolEnabled(id, enabled)` validates the ID, updates one
known value, and persists immediately. Hydration restores the map. Older
settings with no `agent_tools` field receive explicit catalog defaults.

## Enforcement

### Provider boundary

`TalosToolset.offer(permissions, enabledTools)` first assembles only currently
installed/runtime-capable tools, then removes:

1. Library tools blocked by the Library sharing contract;
2. tools disabled in `enabledTools`;
3. tools whose required actions resolve to `deny`.

Only this final array is adapted to OpenAI, Anthropic, Gemini, Ollama, or
OpenRouter wire schemas.

### Executor boundary

`TalosToolExecutionDeps.isToolEnabled(name)` is mandatory. The executor invokes
it before argument parsing, consent, or the tool body. False or a thrown policy
callback produces an audited denial:

- code: `TALOS_TOOL_DISABLED`;
- no consent prompt;
- no read, write, network, or other tool side effect.

The production callback reads live Settings state. Therefore a tool disabled
after schemas were sent but before execution is still revoked.

Argument schema validation, compound action policy, human consent, untrusted
output wrapping, and audit semantics otherwise remain unchanged.

## UI and accessibility

- The former gated `agent_tools` tab becomes `available`.
- The local panel is grouped as Library, Personal, Web, and Create.
- Every switch uses `role="switch"`, a localized accessible name, and a
  minimum 44-pixel target.
- Text and action badges communicate state without relying on color.
- The enabled count updates immediately.
- English and Italian catalogs remain structurally identical.
- No master switch, connector setup, or unavailable runtime status is invented
  in this slice.

## Compatibility and rollback

- No provider wire extension, dependency, database migration, Android
  permission, or secret storage change.
- Existing settings upgrade to all twelve current switches enabled.
- Existing action-policy defaults remain unchanged.
- Rollback removes the `agent_tools` settings subtree, panel, and the second
  offer/executor gates. Stored unknown JSON would then be ignored by the old
  parser.
