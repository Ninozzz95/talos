# Research dossier - P0 Agent Tools control

Date: 2026-07-28

Subsystem: TALOS mobile Settings, provider-neutral tool registry, authorization,
and chat execution.

Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`

Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Local finding

The mobile runtime already owns twelve genuine tools:

1. `library_list`
2. `library_search`
3. `library_read`
4. `notes_list`
5. `tasks_list`
6. `memory_search`
7. `time_now`
8. `web_search`
9. `web_read`
10. `document_create`
11. `generate_image`
12. `library_export`

Their provider schemas are assembled by `createTalosToolset().offer()`, and every
call reaches the single `executeTalosTool()` boundary. Settings currently shows
`Agent Tools` as an unavailable placeholder even though this runtime is already
installed. There is no persisted per-tool allowlist.

Action permissions (`read`, `write`, `outbound`) already form a separate,
working policy layer. A per-tool switch must narrow that policy, never replace
or silently relax it.

## Current primary sources and competitor behavior

### OpenAI Responses API tool controls

- Source:
  `https://platform.openai.com/docs/api-reference/responses/create`
- Retrieved: 2026-07-28.
- Current contract: the request supplies the tools the model may call, and
  `tool_choice.allowed_tools` can constrain that set further.

Decision: **ADAPT** the allowlist semantics at TALOS's existing `offer()`
boundary. Disabled tool schemas never leave the device or enter provider
prompt/cache state.

### ChatGPT Apps action controls

- Source:
  `https://help.openai.com/en/articles/11487775-connectors-in`
- Retrieved: 2026-07-28.
- Current product behavior: workspace controls can allow all actions, only read
  actions, or a custom set; new actions have an explicit policy; calls are
  logged and unavailable apps are blocked across supported surfaces.

Decision: **ADAPT** the separation between individual availability and
read/write approval. TALOS keeps its existing action policy and adds a custom
per-tool allowlist. Every catalog addition must declare an explicit default so
an upgrade cannot silently inherit an accidental boolean.

### Claude tool definitions and connector controls

- Tool source:
  `https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools`
- Connector source:
  `https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp`
- Retrieved: 2026-07-28.
- Current contract: Claude can call only tools included in the request;
  connectors expose enable/disable toggles for a conversation; Anthropic tells
  users to disable tools that are irrelevant or should not be invoked and to
  review approval requests before allowing unsupervised actions.

Decision: **ADAPT** tool omission and clear human controls. This slice implements
the owner's requested persistent Settings defaults. Conversation-scoped
overrides are not introduced because they were not requested and would add a
second precedence layer without an established TALOS contract.

### OWASP prompt-injection guidance

- Source:
  `https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html`
- Retrieved: 2026-07-28.
- Current guidance: validate tool calls against user permissions and session
  context, restrict tool access by least privilege, require human approval for
  high-risk actions, and log enforcement decisions. Model guardrails are only
  one defense layer.

Decision: **ADOPT SEMANTICS** at deterministic code boundaries. Filtering the
provider schema is necessary but insufficient: `executeTalosTool()` must
re-check the live switch so a stale, replayed, forged, or in-flight call cannot
run after revocation.

### Capacitor Preferences 8.0.1

- Source: `https://capacitorjs.com/docs/apis/preferences`
- Installed pin: `@capacitor/preferences@8.0.1`
- Retrieved: 2026-07-28.
- Current contract: values are strings; structured values are persisted with
  `JSON.stringify` and restored with `JSON.parse`.

Decision: **ADOPT** the installed upstream through the existing settings
envelope. No new storage library or Android permission is required. Unknown
keys and non-boolean values are discarded by the AVM-owned parser.

## Default and upgrade decision

All twelve already-shipped tools default to enabled in the new per-tool layer.
This preserves established user flows on fresh installs and upgrades. It does
not make them autonomous:

- default `read=allow`;
- default `write=ask`;
- default `outbound=deny`;
- missing runtime capabilities still prevent offering;
- Library sharing remains an independent prerequisite.

The catalog still requires an explicit `defaultEnabled` value for every entry.
A future tool therefore cannot become active merely because the parser treats
missing data as truthy.

## Alternatives

### UI-only switches

Rejected. A model could still receive schemas and invoke the executor, making
the setting decorative and violating the no-fake-feature rule.

### Filter only before the provider request

Rejected. A setting may change while a round is in flight, and buffered or
forged calls can outlive the schema snapshot. Revocation must also be checked at
the execution boundary.

### Replace action permissions with per-tool booleans

Rejected. A tool being enabled means it is eligible, not that it may read,
write, or send data without the existing policy and consent checks.

### Import Zod-backed tool factories into Settings

Rejected. Settings is on the initial application graph and the current build
has a strict 560,000-byte JavaScript budget. The canonical control catalog must
remain dependency-free; conformance tests compare it with the real factories.

## Upstream decision

No new package is appropriate. TALOS will **adapt** current OpenAI, Anthropic,
OWASP, and Capacitor contracts behind its existing provider-neutral registry:

- one lightweight catalog for every executable tool and explicit default;
- boot-loaded IDs/defaults separated from Settings-only group/action metadata;
- persisted, localized per-tool switches;
- omission before provider schema exposure;
- live fail-closed re-check at the sole executor;
- existing action permissions and consent remain additive;
- denied attempts remain audited;
- conformance tests fail when a factory and the control catalog drift.

## Owner-requested completeness revalidation - 2026-07-29

The runtime was re-inventoried from every `defineTalosTool()` call and the
actual `createTalosToolset().offer()` assembly. It still contains exactly the
twelve catalogued tools above. `browser_click` and `browser_file_upload` occur
only in dormant approval data types and have no mobile chat tool factory; adding
toggles for them would violate the no-fake-feature rule.

Current Anthropic Managed Agents documentation now exposes the same two-level
shape directly:
<https://platform.claude.com/docs/en/managed-agents/tools>. A toolset can keep
its tools enabled by default, set individual `enabled: false` overrides, and
apply a separate permission policy. This independently confirms TALOS's
explicit default map plus per-tool overrides and additive action policy.

The current OWASP Agent/Prompt Injection guidance was also rechecked:
<https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html>
and
<https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html>.
Both continue to require least privilege, permission validation and execution
checks. The existing dual gate (schema omission plus live executor denial)
therefore remains the selected design.
