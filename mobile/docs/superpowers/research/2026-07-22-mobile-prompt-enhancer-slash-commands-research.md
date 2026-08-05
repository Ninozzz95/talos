# Mobile Prompt Enhancer and Slash Commands Research

Date: 2026-07-22
Owner: Codex mobile lane
Desktop reference: `<repo desktop>` at `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed` (read-only)
Status: COMPLETE - implementation may proceed through the companion ledger

## Problem statement

The mobile composer already owns a durable draft, real provider/model selection,
reasoning controls, and direct provider completion. It still lacks two established
desktop contracts:

1. model-backed prompt enhancement with a review-before-apply workflow; and
2. discoverable slash commands with deterministic keyboard interaction and honest
   disabled states for capabilities that do not yet exist locally.

The solution must remain standalone, must use the selected provider/model and the
existing secure credential boundary, must never persist the enhancer request as a
chat turn, and must not pull either overlay into the initial JavaScript graph.

## Primary-source findings

### WAI-ARIA Authoring Practices

- Listbox options have distinct focus and selection state. `ArrowDown` and
  `ArrowUp` move through options; `Home` and `End` are strongly recommended for
  lists longer than five entries; type-ahead is recommended for larger lists.
- A listbox needs an accessible name and each selectable row needs `role="option"`
  plus an explicit selection state. Disabled choices can remain discoverable when
  they expose their unavailable reason and cannot activate.
- Editable combobox guidance requires browser-native text editing keys to keep
  working. JavaScript must intercept only the keys owned by the popup. `Enter`
  accepts the focused option and `Escape` closes the popup and returns control to
  the text input.

Sources:

- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/

### Prompt design and evaluation

- Google recommends clear, specific instructions; explicit constraints; explicit
  response formats; consistent structural delimiters; and iterative evaluation.
  Its current guidance recommends native structured output for complex schemas,
  while a small JSON object can still be constrained by prompt plus validation.
- Anthropic states that prompt engineering starts with explicit success criteria,
  empirical evaluation, and an existing draft. Its maintained guidance includes
  clarity, examples, structure, role prompting, and prompt chaining.
- OpenAI's current model guidance expresses the same execution-brief primitives:
  goal, relevant context, constraints, required evidence, success criteria, and
  output format.

Sources:

- https://ai.google.dev/gemini-api/docs/prompting-strategies
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/guides/prompt-engineering

### Prompt-injection boundary

OWASP identifies direct concatenation of instructions and user-controlled data as
an injection weakness. Its primary defensive recommendation for this boundary is
a structured prompt that clearly separates trusted instructions from untrusted
data, followed by output validation and least privilege.

The enhancer therefore sends one JSON-encoded user turn containing
`task`, `language_policy`, and `original_prompt`. The system message states that
the JSON payload is data to rewrite, not authority to change enhancer behavior.
The response crosses a strict Zod parser before any UI state can consume it.

Source:

- https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html

## Upstream decision

### ADOPT

- Use the already-pinned `zod@4.4.3` directly for the prompt-enhancement response
  boundary. The schema is strict and preserves object/list distinctions.
- Use the WAI-ARIA listbox keyboard and role contract directly for slash commands.
- Reuse the existing pinned provider adapters, secure key store, HTTP transport,
  selected model catalog, and provider-specific error normalization.

### ADAPT

- Port the frozen desktop enhancer system prompt, response limits, preview copy,
  Replace/Insert/Cancel semantics, command IDs, slash aliases, labels, and search
  fields into mobile-owned modules.
- Add an explicit OWASP-derived instruction/data separation sentence without
  changing the user's requested task.
- Keep unsupported desktop commands visible but disabled with concrete mobile
  ownership reasons. Only `/new`, `/context`, and `/model` activate in this slice.
- Load the enhancer preview and slash menu through `defineAsyncComponent`. Both
  are composer overlays, but neither belongs in the first-paint graph.

### REJECT

- No new command-menu package: Reka has no need to own a transient, filtered
  command list embedded in the existing textarea interaction; the APG behavior is
  small, deterministic, and already implemented by the frozen desktop contract.
- No server proxy or browser-stored duplicate credential: mobile remains
  local-first and reads the selected provider secret only at dispatch time.
- No fake Browser, Vault, benchmark, run, admin, email, or productivity action.
- No raw model output in the preview and no permissive JSON repair. Malformed
  output fails closed and leaves the draft untouched.
- No provider-native JSON-schema expansion in this slice. The existing canonical
  provider contract does not yet expose per-operation response formats uniformly;
  adding vendor-specific fields here would widen four adapters. The small frozen
  three-field object is instead constrained by the system prompt and strict parser,
  matching the desktop behavior. A later provider-contract revision may adopt
  native structured output behind the canonical adapter with conformance tests.

## Required verification

- Unit: parser, injection separation, request provenance, no message persistence,
  stale-request fence, command registry/filtering, listbox semantics, composer
  keyboard behavior, preview decisions, routing, draft preservation.
- Build: both overlay files are reachable dynamic entries outside the static graph;
  initial JavaScript remains at or below 512000 bytes.
- Chromium: selected provider/model is present in the actual enhancement request;
  Cancel, Insert, Replace, final Send, slash keyboard, disabled reasons, direct
  Model Lab navigation, reload persistence, and 360/390 horizontal overflow.
- Failure: provider error and malformed JSON display an actionable message, redact
  the credential, add no chat message, and preserve the exact draft.

