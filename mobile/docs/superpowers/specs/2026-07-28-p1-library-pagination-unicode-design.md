# Design - P1 Library pagination and Unicode retrieval

Date: 2026-07-28

Status: approved by the owner's autonomous sequential-fix instruction.

## Slice A - budget-honest Library pages

`readTools.ts` keeps the public `library_search` schema unchanged.

Private helpers:

- `takeCodePoints(value, max)` bounds a field without splitting a surrogate
  pair;
- `formatLibrarySearchRecord(doc)` creates one complete, bounded record;
- `buildLibrarySearchPage(matching, offset, requestedLimit)` greedily appends
  complete records while the rendered payload stays within
  `MAX_TOOL_CONTENT`.

For every successful non-empty page:

- `evidence.matched` is exactly the IDs whose complete records appear;
- `evidence.returned` equals that array's length;
- `evidence.next_offset` is the index of the first unreturned match or `null`;
- the human-readable range uses the same actual count;
- the raw tool body never exceeds `MAX_TOOL_CONTENT`.

The existing offset, limit, scoring, provenance fields, untrusted executor
wrapper, and no-match/no-more messages remain compatible.

## Slice B - Unicode comparison index

`libraryContext.ts` adds private comparison helpers:

- `normalizeLibrarySearchText(text)` returns NFKC plus lower-case text;
- `tokenizeLibraryQuery(text)` extracts `\p{L}`/`\p{N}` runs in Unicode mode.

`rankLibraryDocs` applies the same normalization to query terms, filename, and
body before the existing weighted occurrence score. Original values are never
modified or returned in normalized form.

Named compatibility cases cover:

- existing ASCII relevance and recency;
- precomposed/decomposed accented Italian;
- Cyrillic;
- Arabic;
- CJK including a one-character query;
- full-width Latin/number compatibility matching.

## Human-visible acceptance

1. Populate at least 25 long matching Library documents.
2. Ask the chat to find all of them.
3. Verify each tool page lists only complete records, follows `next_offset`,
   and eventually exposes every matched ID exactly once.
4. Search by accented Italian, Cyrillic, Arabic, and CJK terms present in
   filenames or extracted text.
5. Verify exact relevant files appear and unrelated rows do not.
6. Reload and repeat to prove the behavior is backed by persisted Library data.

## Rollback

Restore the old page rendering and ASCII tokenizer together with their tests.
There is no migration, persisted rewrite, dependency, or external service to
undo.

