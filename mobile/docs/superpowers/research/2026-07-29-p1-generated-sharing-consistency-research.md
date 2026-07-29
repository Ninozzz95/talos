# Research dossier - generated-file sharing consistency

Date: 2026-07-29  
Subsystem: TALOS mobile per-chat Library / agent Library tools

## Local diagnosis

Three individually reasonable changes now contradict one another:

- explicit `library_list`, `library_search`, and `library_read` correctly admit
  available uploaded and generated files, and uniformly honor
  `metadata.library_shared !== false`;
- the per-chat Library UI still says “TALOS never re-reads what it wrote”,
  exposes no sharing control for generated rows, and therefore gives the user
  no way to govern that real explicit-read capability;
- `library_export`, another chat-agent operation requiring read plus write,
  unconditionally admits generated files even when
  `metadata.library_shared === false`.

Automatic ambient injection remains intentionally uploaded-only. That
anti-self-poisoning boundary is separate from an explicit, audited,
untrusted-wrapped Library tool call requested in the conversation.

The persistence service already supports updating `library_shared` on a
generated row while preserving its `origin` and `origin_session_id`; no schema
or migration is missing.

## Current primary sources

1. OpenAI, **File storage and Library in ChatGPT**, inspected 2026-07-29:
   <https://help.openai.com/en/articles/20001052-library-for-chatgpt>
   - uploaded and created files live in one Library and can be found and reused
     later;
   - users can browse uploaded and generated files together;
   - disabling automatic Library referencing is distinct from browsing,
     searching, opening, or explicitly attaching a file.
2. Google, **Gemini API File Search**, inspected 2026-07-29:
   <https://ai.google.dev/gemini-api/docs/file-search>
   - persistent indexed content is queried through an explicit File Search
     tool;
   - the request names the store to retrieve from, keeping retrieval a
     deliberate tool boundary rather than unconditional context.
3. OWASP, **LLM Prompt Injection Prevention Cheat Sheet**, inspected
   2026-07-29:
   <https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html>
   - RAG documents and tool outputs are untrusted content;
   - agent tool calls must be checked against user permissions and context;
   - use least privilege, structured data separation, monitoring, and
     deterministic controls.
4. OWASP GenAI, **LLM01:2025 Prompt Injection**, inspected 2026-07-29:
   <https://genai.owasp.org/llmrisk/llm01-prompt-injection/>
   - restrict model privileges to the intended operation;
   - segregate and label untrusted content;
   - adversarially test access-control boundaries.

Exact upstream pin: the four documents above as retrieved 2026-07-29. No
runtime dependency is introduced.

## Upstream decision

**Adapt the unified-Library / explicit-retrieval split behind one TALOS-owned
per-file policy.**

- uploaded and generated rows expose the same “Any chat may read it” control;
- absent `library_shared` remains shared for legacy compatibility;
- `library_shared=false` excludes either origin from every agent Library
  operation: list, search, read, and export;
- direct human actions remain independent: Open, Attach, Save to phone, and
  Delete are not model reads and stay available;
- generated content remains excluded from automatic ambient injection;
- when explicitly read, generated content remains untrusted and passes through
  the existing executor wrapper, permissions, and audit.

Rejected alternatives:

- restore the old “generated files can never be read” behavior: rejected
  because it recreates the owner's proven inability to find a file TALOS just
  created and diverges from unified Library products;
- allow export despite per-file withdrawal: rejected because the agent must
  decrypt/read the file before Save-As and would bypass the visible policy;
- expose separate uploaded/generated toggles: rejected because one stored
  policy already governs both and two meanings would drift again;
- permit generated ambient injection: rejected because it creates a persistent
  self-poisoning loop and is unnecessary for explicit retrieval;
- remove generated files from the per-chat Library: rejected because the
  surface is also the durable history of what that chat created.

## TALOS one-up and security boundary

Competitors separate automatic referencing and manual reuse. TALOS keeps that
distinction but makes it inspectable per file, local-first, and auditable:

- the row visibly states whether any chat agent may explicitly retrieve it;
- the menu changes the exact metadata enforced by every agent entry point;
- automatic context remains more restrictive for generated output;
- user-driven attach and phone export remain possible after model access is
  withdrawn;
- no cloud index, account, or hidden workspace administrator is required.
