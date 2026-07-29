# Design - P1 Library browse and full-content retrieval

Date: 2026-07-28

## Product contract

Natural-language Library discovery has two explicit operations.

### `library_list`

Use when the user asks to show, browse, enumerate, count, or filter Library
items without a content keyword.

Input:

- `origin`: `all | uploaded | generated`, default `all`;
- `file_type`: `all | image | document | link`, default `all`;
- `page_size`: 1-20, default 10;
- `page_token`: optional opaque continuation from the preceding response.

Each result contains bounded metadata only:

- stable Library id;
- display name;
- `image | document | link`;
- MIME type;
- uploaded/generated origin;
- origin chat title;
- created timestamp.

Rows are ordered deterministically by `updatedAt DESC, createdAt DESC, id DESC`.
The result includes exact current `total_size`, returned ids, and
`next_page_token`. No next token means end-of-collection.

Continuation tokens are secure random URL-safe ids held in a bounded in-memory
map. State records the last deterministic sort tuple, number already returned,
and filters. A continuation:

1. passes through the normal read permission and Library opt-out gates again;
2. re-lists the current allowed collection;
3. rejects an unknown/expired token;
4. rejects changed origin/file-type filters;
5. resumes strictly after the last returned tuple, so concurrent insertions at
   the front do not duplicate already-returned rows.

The token conveys no file authority. The map is bounded to prevent unbounded
growth, and the token disappears naturally when the memoized toolset is
recreated.

### `library_search`

Use for a non-empty filename/content query.

The tool keeps its established genuine-match rule, relevance ranking, bounded
records, ids, provenance, and explicit offset pagination. Its source changes
from 600-character summaries to the complete `extracted_text` values returned
by `listVaultFiles()`.

This full-corpus transfer occurs only when `library_search` is explicitly
executed. Tool construction, `library_list`, and automatic context injection do
not request the full corpus.

### `library_read`

The description accepts an id returned by either `library_list` or
`library_search`. Its existing full-text/image behavior and 8,000-character
tool-result cap remain stable.

## Canonical entry model

`TalosLibraryListEntry` is provider-neutral and repository-independent:

```ts
interface TalosLibraryListEntry {
    id: string
    displayName: string
    mediaType: string
    fileType: 'image' | 'document' | 'link'
    origin: 'uploaded' | 'generated'
    originSessionId: string | null
    originSessionTitle: string | null
    createdAt: string
    updatedAt: string
}
```

The toolset maps available, chat-shared vault summaries into this shape:

- `metadata.kind === "web_source"` -> `link`;
- otherwise `media_type` beginning `image/` -> `image`;
- every other row -> `document`.

Unavailable and per-file-withdrawn rows remain inaccessible. The global
`library_context_enabled` switch continues to remove every `library_*` schema.

## Performance and privacy boundaries

- `library_list`: summaries only; never transfers extracted full text.
- ambient injection: summaries, uploaded-only selection, then bounded hydration
  of winners; unchanged.
- `library_search`: one explicit full list, local ranking, bounded result.
- `library_read`: one selected file.
- no content, URI, hash, raw metadata, or continuation state is exposed in list
  records.
- every tool result remains untrusted data at the existing executor boundary.

## Compatibility and rollback

There is no schema migration, dependency, provider wire extension, Android
permission, or persisted token format.

Rollback removes `library_list`, restores explicit search to summaries, and
removes its labels/tests. Existing `library_search`, `library_read`, repository
interfaces, stored files, and ambient context remain valid.
