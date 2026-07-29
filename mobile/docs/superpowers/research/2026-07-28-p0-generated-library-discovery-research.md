# P0 generated-Library discovery research

Date: 2026-07-28

## Problem named from owner evidence and current code

The owner's exported transcript records this exact sequence:

1. TALOS created a `ds4` PDF and reported that it was saved to the Library.
2. A later natural-language request asked TALOS to find that PDF in the
   Library.
3. TALOS reported only unrelated uploaded images and falsely concluded that
   the generated PDF did not exist.
4. The owner's Library screenshot showed 30 items, including the generated
   `ds4` PDFs and Markdown research files.

The persisted file is not the failing boundary. The global Library UI reads all
available Vault rows. The chat tool path does not:

- `toolset.ts::librarySummaries()` admits only `origin === 'uploaded'`, so
  `library_search` and `library_read` can never see generated documents;
- `readTools.ts::library_search` ranks every admitted row and slices the top N
  without dropping score-zero rows, so a query with no admitted match returns
  unrelated uploads as if they matched.

This is why the transcript saw a handful of images and not the generated PDF.

## Current official sources

Accessed 2026-07-28:

1. [OpenAI: File storage and Library in ChatGPT](https://help.openai.com/en/articles/20001052)
   states that uploaded and created files are saved to one Library, can be
   browsed together, searched, filtered by Uploaded or Generated origin, and
   reused in later chats. It also documents a workspace control for automatic
   referencing without removing manual browse/search/open access.
2. [Anthropic: How can I create and manage projects?](https://support.anthropic.com/en/articles/9519177-how-can-i-create-and-manage-projects)
   documents a shared project knowledge base whose added content is processed
   and used across chats, with RAG enabled as the collection approaches the
   context limit.
3. [Google Gemini API: File Search](https://ai.google.dev/gemini-api/docs/file-search)
   documents a persistent indexed store, semantic retrieval, document
   management, and bounded retrieval rather than injecting an unbounded corpus
   into every request.
4. [Google Gemini API: File Search Documents](https://ai.google.dev/api/file-search/documents)
   uses an explicit paginated list contract: bounded `pageSize` plus a
   continuation token. A short first page is not represented as the complete
   collection.
5. [OpenAI API: Vector store files](https://platform.openai.com/docs/api-reference/vector-stores-files)
   likewise exposes bounded pages, a cursor, and `has_more`, separating a
   result page from collection completeness.
6. [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
   recommends segregating and identifying external content, least privilege,
   and human approval for high-risk actions.
7. [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
   explicitly includes RAG poisoning and tool-output injection, and recommends
   trust-boundary separation, tool parameter validation, least privilege,
   action screening, and monitoring.

## Upstream decision

**Adapt the established unified-Library and bounded-result contracts behind the
existing TALOS read-only tool boundary.**

- Explicit `library_search` and `library_read` must admit both uploaded and
  generated files that are available and shared with chats.
- Ambient automatic context remains more restrictive and continues to exclude
  generated files. This avoids silently feeding model-authored output back into
  every future turn.
- Explicit tool results continue through `executor.ts::wrapUntrusted()`, so a
  generated document is data, never authority.
- Search must discard score-zero rows instead of presenting unrelated files as
  matches.
- A bounded page must disclose total matches and whether another page exists;
  add an integer offset rather than pretending the first N rows are the whole
  Library.
- The global Library switch and per-file `library_shared=false` opt-out remain
  fail-closed for both origins.

No package or protocol dependency is required. The existing Vault, Zod tool
schema, executor trust wrapper, audit path, and local ranker are the correct
owned boundaries.

Rejected:

- exposing generated documents through ambient injection: unnecessary for the
  owner's explicit search and creates persistent self-poisoning risk;
- retaining the uploaded-only tool filter: contradicts the product contract and
  official unified-Library behavior;
- returning zero-score fallback rows: it creates fabricated evidence;
- removing the result bound: it can consume the context window and still gives
  no stable continuation contract;
- treating generated content as trusted because TALOS created it: model output
  is untrusted input when it is consumed again.

## Competitor-informed TALOS one-up

TALOS will combine unified uploaded/generated discovery with local-first
controls competitors document separately:

- every returned row carries origin and originating-chat provenance;
- every page states `shown / total` and a deterministic next offset;
- exact Vault ids support a second, auditable read;
- the same global and per-file opt-outs govern both search and read;
- generated results remain explicitly untrusted and cannot bypass action
  permissions;
- no cloud indexing or account is required for the correctness fix.

