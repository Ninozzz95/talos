# R9 Tool Authorization — Current Research Dossier

Date: 2026-07-29  
Subsystem: TALOS mobile agent tools / consent / encrypted local persistence  
Status: blocking research gate completed before behavior edits

## User contract

For every tool that is enabled and offered:

- an existing baseline authorization or an exact persistent tool grant may let
  the call proceed;
- otherwise TALOS must show the proposed tool and exact arguments and offer
  **Allow once**, **Always allow**, and **Deny**;
- Allow once is bound to that exact pending call and input, not to the chat or
  a later call;
- Always allow is scoped to the exact tool and the action capabilities shown,
  is persisted on this device, is visible in Settings, and is revocable;
- an action-level or administrative deny always wins over any saved grant;
- waiting for a decision must not keep `chat.state.sending` true, freeze the
  composer, or hold an in-memory Promise as the only copy of the run;
- an approved or denied call resumes from a durable checkpoint; it must not be
  silently rebound to another chat, model, tool input, or provider;
- a crash in the uncertain interval around a side effect fails to
  `recovery_required`; TALOS never silently repeats a possibly completed write.

Tool eligibility and authorization are separate:

- disabled tool: no provider schema, no popup, no execution;
- enabled tool plus action policy `deny`: no provider schema and no popup;
- enabled tool plus action policy `allow`: baseline authorization is active;
- enabled tool plus action policy `ask`: exact persistent grant or popup.

## Local diagnosis

Current code is only a partial implementation:

1. `permissionTypes.ts` has action-wide `allow | ask | deny` with defaults
   `read=allow`, `write=ask`, `outbound=deny`.
2. `toolControls.ts` has independent per-tool enablement.
3. `executor.ts` validates arguments and fails closed, but
   `requestConsent()` returns only `true | false | busy`.
4. `chatController.askOnce()` parks a Promise while the tool round awaits.
   Consequently `chat.state.sending` stays true and the composer is blocked.
5. The button is labeled “Allow once”, but `writeConsentGrantedFor` grants all
   later non-outbound writes in the same conversation. The label and behavior
   disagree.
6. `TalosMobileToolConsentSheet.vue` is a full-screen modal backdrop with a
   focus trap. It prevents interaction with the conversation.
7. No exact per-tool persistent grant, Settings revocation surface, durable
   pending request, or resumable agent-loop checkpoint exists.
8. An abort or failed send destroys the only in-memory consent state. The
   current queue prevents parallel sheets but does not provide durable HITL.

## Primary competitor and standards research

### OpenAI — ChatGPT apps

Source inspected 2026-07-29:
<https://help.openai.com/en/articles/11487775-connectors-in-chatgpt>

- App permission policy is separate from whether an app is connected and what
  upstream scopes it has.
- The default “Important actions” policy permits reads but asks before actions
  with meaningful external effect, sensitive disclosure, or difficult
  rollback.
- The approval card shows the app and proposed action.
- Available decisions include Deny, Allow/Allow once, low-risk authorization,
  and Always allow.
- Overall defaults can be overridden per app and reset in Settings.
- Especially risky actions and workspace protections can still block a call;
  a permissive user preference does not override those boundaries.

Adopted pattern: separate eligibility, baseline policy, exact proposed action,
saved per-tool grant, and non-overridable deny.

### Anthropic — Claude Code permissions

Sources inspected 2026-07-29:

- <https://code.claude.com/docs/en/permissions>
- <https://code.claude.com/docs/en/permission-modes>
- <https://code.claude.com/docs/en/security>

Claude Code separates allow/ask/deny rules, supports exact tool/specifier
matching, and gives deny precedence across settings scopes. “Don’t ask again”
has a declared scope and lifetime: Bash rules can persist per repository and
command, while file-modification approval lasts only for the session. Managed
policy cannot be weakened by a lower-precedence grant.

Adopted pattern: the grant records exact tool plus required actions and its
scope/lifetime. A later deny wins. Rejected alternative: one conversation-wide
write boolean, because it authorizes unrelated tools and contradicts the
visible “Allow once” copy.

### Model Context Protocol — user interaction and recovery

Exact standards pin:

- MCP specification `2025-11-25`, Elicitation:
  <https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation>
- MCP specification `2025-03-26`, Architecture:
  <https://modelcontextprotocol.io/specification/2025-03-26/architecture>

Relevant requirements and patterns:

- identify which server/tool is requesting interaction and explain why;
- provide clear decline and cancel controls;
- bind requests to the initiating client and user;
- do not collect credentials in ordinary in-band form elicitation;
- sensitive external authorization belongs in an out-of-band HTTPS flow;
- completion notifications may resume work, but clients should retain manual
  retry/cancel/resume controls if completion never arrives;
- unknown or completed request identifiers must be ignored.

Adopted pattern: a versioned request ID bound to session, send, tool-call ID,
canonical input digest, and checkpoint ID. Unknown, stale, consumed, or
mismatched decisions fail closed.

### JSON Canonicalization Scheme

Exact pin: RFC 8785, June 2020:
<https://www.rfc-editor.org/rfc/rfc8785.html>

JCS defines deterministic, whitespace-free JSON using ECMAScript primitive
serialization, recursive UTF-16 property sorting, preserved array order, the
I-JSON subset, and UTF-8 output. TALOS adapts the RFC sample algorithm for the
validated tool-input digest instead of inventing an order-dependent
`JSON.stringify()` hash. Non-finite numbers, invalid Unicode, unsupported
values, and cycles fail closed.

### LangChain / LangGraph HITL

Source inspected 2026-07-29:
<https://docs.langchain.com/oss/python/langchain/human-in-the-loop>

Documentation pin: conditional interrupts require `langchain>=1.3.3`.

- Tool calls are inspected after model output and before execution.
- The graph state is checkpointed so a run can pause and resume later.
- Decisions are explicit and ordered per action: approve, edit, reject, or a
  direct human response for ask-user tools.
- Production uses a persistent checkpointer; in-memory persistence is
  documented only for development/prototyping.
- Rejection becomes a typed tool result rather than an exception.

Adopted pattern: two-phase tool-round preflight. If any call needs approval,
none of that round’s calls executes before the durable checkpoint is written.
TALOS supports approve/reject now; editing arguments is rejected for this
slice because it would require revalidation, new consent copy, and a separate
user contract.

Direct LangGraph integration is rejected: TALOS already owns a bounded,
provider-neutral TypeScript loop, local SQLCipher repository, trace/audit
format, attachments, and mobile lifecycle. Shipping a Python/JS graph runtime
would duplicate the product state boundary. The checkpoint semantics are
adapted behind AVM-owned contracts instead.

### Microsoft AutoGen

Sources inspected 2026-07-29:

- <https://microsoft.github.io/autogen/dev/user-guide/core-user-guide/cookbook/tool-use-with-intervention.html>
- <https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/human-in-the-loop.html>

AutoGen demonstrates interception before tool execution. Its own HITL guide
warns that in-run user input blocks the team and leaves an unstable state that
cannot be saved or resumed, recommending it only for short immediate input.

Adopted lesson: do not retain TALOS’s current parked-Promise design.

### OpenHands

Sources inspected 2026-07-29:

- <https://docs.openhands.dev/sdk/guides/security>
- <https://docs.openhands.dev/sdk/arch/security>

OpenHands separates confirmation policy from a risk analyzer, records
decisions in event history, exposes `WAITING_FOR_CONFIRMATION`, and supports
AlwaysConfirm, NeverConfirm, and risk-threshold confirmation. Unknown risk
confirms by default.

Adopted pattern: unknown/corrupt policy fails closed, the pending state is an
event/activity, and policy/grant decisions are auditable. Rejected pattern:
letting an LLM alone assign security risk; TALOS capability categories and
hard denies remain deterministic.

### Android

Sources inspected 2026-07-29:

- <https://developer.android.com/training/permissions/requesting>
- <https://developer.android.com/privacy-and-security/minimize-permission-requests>

Android recommends requesting permission in context, checking it every time,
explaining the exact data/action, allowing cancel, gracefully degrading after
denial, and never blocking the whole interface. Android 11+ also establishes a
clear user expectation for “Only this time”.

Adopted pattern: a non-modal, contextual authorization card; no full-screen
backdrop; the chat remains usable; denial is specific and does not nag.

## Upstream decision

**ADAPT the durable-interrupt pattern behind AVM-owned TypeScript contracts.**

No new dependency is added.

Why:

- exact behavior already belongs at TALOS’s canonical executor and encrypted
  repository boundaries;
- direct LangGraph/OpenHands/AutoGen integration would introduce a second
  runtime and state owner;
- OpenAI and Claude product behavior supplies the user-facing grant model;
- MCP `2025-11-25` supplies request identity, cancellation, and recovery
  principles;
- RFC 8785 supplies deterministic JSON bytes for exact-input SHA-256 binding;
- the current repository’s encrypted `talos_tool_activity` rows can persist a
  bounded checkpoint without a schema migration.

## Required TALOS design

1. Preserve action-wide `allow | ask | deny` as the baseline policy.
2. Add `talos.tool.authorization-grants/1`, keyed by canonical tool ID, with
   exact required actions, creation time, and global-device scope.
3. Add `talos.tool.authorization-checkpoint/1` inside one encrypted
   `tool.authorization` activity row.
4. Bind every request to:
   - checkpoint ID;
   - originating session ID and send ID;
   - provider/model profile ID;
   - provider tool-call ID;
   - canonical tool name;
   - canonical validated-input SHA-256;
   - exact action set.
5. Preflight the whole provider tool round. If any call is unresolved, persist
   before executing any call in that round.
6. Release the foreground send after the checkpoint exists. Display a
   non-modal card with Allow once / Always allow / Deny.
7. Once all requests in the checkpoint are decided, resume automatically when
   the single-flight chat runner is free.
8. Immediately before execution, re-check:
   - tool still enabled;
   - Library/source/provider availability;
   - current hard denies;
   - request/input binding;
   - grant coverage.
9. Mark the checkpoint `recovery_required` before side effects. Persist the
   post-tool/pre-model checkpoint before another provider call. Never
   automatically repeat an uncertain side effect after process death.
10. A final assistant row carries the checkpoint ID. Startup reconciliation
    closes an activity already represented by that row instead of re-running.

## Security constraints

- Permanent grants never override `deny`, disabled tools, workspace/admin
  policy, missing provider authorization, Android permission, or a tool marked
  always-confirm.
- “Always allow” covers only the exact tool and action set displayed. A future
  added capability invalidates coverage until the user grants again.
- Raw arguments remain encrypted in the activity payload and visible only in
  the contextual approval card. Settings stores only non-secret grant metadata.
- Secrets/API keys never enter the checkpoint.
- The canonical SHA-256 is evidence/binding, not a replacement for comparing
  and revalidating the actual typed input.
- Generated/file/web data remains untrusted when returned to the model.
- Concurrent calls share one checkpoint but retain independent decisions.
- Cancel/dismiss may postpone the decision; it is not rewritten as user denial.
- Deny produces a typed tool result. It is never thrown as a provider error.

## Compatibility contracts

- Existing missing grant state parses as empty without a hydration rewrite.
- Existing action `allow` behavior remains automatic.
- Existing action `deny` remains unoffered and cannot be bypassed.
- Provider tool schemas and canonical tool names remain unchanged.
- Agent Tool enable toggles remain independent.
- Model/session ownership from R8-A remains immutable.
- Tool activity, attachments, source archive, trace, and audit stay bound to
  the originating session.
- No provider receives tool output without the established untrusted wrapper.

## Build-budget closure research — 2026-07-29

Fresh production evidence after R9-E3:

- Vite transformed `3,255` modules successfully.
- The initial JavaScript entry measured `597,743` bytes against the established
  `560,000` byte gate.
- Source-map attribution showed the optional procedural-motion tree occupying
  materially more than the `37,743` byte overage through `sceneTools`,
  registries, renderers, contracts, and stage control.
- The recovery and consent cards were already true dynamic entries; raising
  the budget would therefore hide accumulated startup drift rather than fix it.

Primary-source findings:

- Vue recommends lazy loading features not needed for initial page load and
  states that `defineAsyncComponent(() => import(...))` creates a separate
  chunk for the component tree:
  <https://vuejs.org/guide/best-practices/performance#code-splitting>
- Vue documents that the async wrapper loads only when rendered and forwards
  props/slots to the inner component:
  <https://vuejs.org/guide/components/async>
- Vite supports native dynamic imports as bundle split points:
  <https://vite.dev/guide/features#dynamic-import>

Decision: **ADOPT Vue's supported async-component boundary** for
`TalosMobileBackground`. The static app background/color remains present
immediately; only the optional procedural canvas/runtime loads asynchronously.
Pin the boundary in `verify-initial-chunk.mjs` and its fixture test. Do not
raise the byte ceiling and do not introduce manual vendor chunks.

The focused Playwright gate then exposed that tapping an Agent Tools row did
not activate its switch. MDN recommends a native `<label>` association because
it enlarges the checkbox touch target and preserves platform semantics,
including for touch screens:
<https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/label>.
WCAG 2.2 SC 2.5.8 requires pointer targets of at least 24 by 24 CSS pixels:
<https://www.w3.org/TR/WCAG22/#target-size-minimum>.

Decision: **ADOPT an explicit native label** across the descriptive part of
each tool row, with the revoke button left outside the label. Do not emulate a
checkbox by adding a click handler or ARIA role to the row.
