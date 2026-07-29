# R8 Additive Library Context Policy — Standards Dossier

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Owner: TALOS mobile UI/local-first control plane
Full research record: `C:\Users\ninox\Downloads\findings\2026-07-29-r8-library-context-additive-policy-research.md`

## Problem pinned by local evidence

The current ambient Library path has two independent failure classes:

1. controller preflight mutates shared `pendingMemoryBlock`,
   `memorySelection`, `pendingLibraryBlock`, and `librarySelection` before
   `ChatStore.send()` raises its single-flight flag;
2. completion, consent, tool execution, audit, and run-keeper code re-read live
   model/session settings after asynchronous boundaries.

The current selector also intentionally injects the whole eligible uploaded
Library when it fits its budget. That behavior is already a user-approved
contract and is not the defect to delete.

## Current upstream pins

The implementation decision is pinned to the following primary documents as
retrieved on 2026-07-29:

- Open WebUI Knowledge, Full Context versus focused retrieval:
  https://docs.openwebui.com/features/workspace/knowledge/
- Google NotebookLM source selection:
  https://support.google.com/notebooklm/answer/16215270
- OpenAI Library retention and user-managed files:
  https://help.openai.com/en/articles/20001052-library-for-chatgpt
- OpenAI Vector Store Search `rewrite_query`, ranking, and score threshold:
  https://platform.openai.com/docs/api-reference/vector-stores
- Azure AI Search agentic retrieval with conversation history and activity:
  https://learn.microsoft.com/en-us/azure/search/search-agentic-retrieval-concept
- Anthropic Contextual Retrieval:
  https://www.anthropic.com/news/contextual-retrieval
- MCP elicitation requirements for explicit user decisions:
  https://modelcontextprotocol.io/specification/draft/client/elicitation
- OWASP LLM Prompt Injection Prevention:
  https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- NIST least-privilege and audit guidance:
  https://csrc.nist.gov/projects/role-based-access-control

No upstream wire protocol or package becomes the TALOS domain model.

## Upstream decision

**ADAPT behind TALOS-owned, versioned policy and send-snapshot adapters.**

Adopt:

- coexisting broad/full, focused, ask-before-egress, and on-demand modes;
- history-aware retrieval with a positive evidence threshold;
- source selection at global, chat, and turn scopes;
- immutable per-send identity;
- structured elicitation, decline/cancel, optimistic revision checks, receipts,
  audit, and undo;
- untrusted document/tool-result boundaries and live revocation.

Do not adopt:

- a provider-specific vector-store contract as local state;
- automatic migration from the established broad behavior;
- an unpinned remote embedding model download.

## Semantic retrieval decision

`@huggingface/transformers` is already pinned as a development dependency at
`4.2.0`, but no runtime model, model revision, cache policy, download consent,
APK-size budget, or multilingual device benchmark is pinned. Shipping an
implicit remote model download would violate local-first/off-device policy;
bundling an unmeasured model would violate the APK-size and low-end Android
performance gates.

R8 therefore implements a TALOS-owned scored-retrieval seam and a deterministic
multilingual lexical adapter with positive abstention. A semantic adapter may
be added only in a separately approved ledger that pins the exact model
revision and proves real-device cold/warm latency, memory, size, offline,
licence, download-consent, rollback, and quality gates. The UI must not claim
that semantic embeddings are active in R8.

## Compatibility decision

- Existing `library_context_enabled=false` remains off.
- Existing `library_context_enabled=true` with no policy field resolves to
  `broad_compat_v1` without rewriting storage.
- `broad_compat_v1` retains the current whole-library-under-budget selector and
  current over-budget fallback byte-for-byte at its pure-function boundary.
- Generated files remain excluded from ambient injection and remain available
  to explicit Library tools when shared.
- `library_shared=false` remains a hard fail-closed revocation.
- Explicit attachments remain a separate direct per-turn path.

## Baseline

Fresh command on 2026-07-29:

```text
npm run test:unit -- --run \
  tests/unit/lib/libraryContext.test.ts \
  tests/unit/chat/chatStore.test.ts \
  tests/unit/chat/chatController.test.ts \
  tests/unit/chat/chatCompletion.test.ts \
  tests/unit/tools/toolExecutor.test.ts \
  tests/unit/theme/settingsStore.test.ts

Test Files  6 passed (6)
Tests       115 passed (115)
```

An earlier `npm test` attempt failed only because this repository intentionally
has no `test` script; the canonical script is `test:unit`.
