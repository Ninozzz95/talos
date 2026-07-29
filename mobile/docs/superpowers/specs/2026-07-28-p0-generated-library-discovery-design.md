# P0 generated-Library discovery design

Date: 2026-07-28

## Single job

When the user asks TALOS to find a file in the global Library, the chat must
search the same available, chat-shared uploaded and generated assets that the
Library UI displays, return only genuine matches, and state when the result is
only one bounded page.

## Trust and visibility boundaries

```text
global Vault summaries
        |
        +-- UI browser: all available rows
        |
        +-- ambient context: available + shared + uploaded only
        |
        `-- explicit Library tools: available + shared + uploaded/generated
                                      |
                                      `-- executor untrusted-data wrapper
```

The explicit search path does not weaken ambient injection. It is reachable
only when the global Library-context setting exposes the tools, and
`library_shared=false` excludes either origin from both search and read.

## Search contract

`library_search` input remains a natural-language `query` and gains:

- `limit`: 1..20, default 5;
- `offset`: non-negative integer, default 0.

For a non-empty query:

1. rank every eligible summary by filename plus stored text preview;
2. discard every row whose score is zero;
3. page the positive matches with `offset` and `limit`;
4. include id, name, origin, originating chat, and bounded excerpt;
5. report returned range, total positive matches, and the next offset when
   another page exists;
6. include the same facts in additive audit evidence.

No positive match returns an honest no-match result. An offset beyond the last
positive match returns an honest no-more-results result, not unrelated rows.

## Read contract

`library_read(id)` re-evaluates the same availability and sharing predicate
immediately before reading. Generated text and images use the existing text or
byte path. A withdrawn, failed, missing, or unknown id is refused.

## Compatibility

- tool names, action classes, permission defaults, global setting, Vault schema,
  UI contracts, and provider adapters do not change;
- `offset` and evidence fields are additive;
- existing callers that omit `offset` retain first-page behavior;
- ambient context selection is unchanged;
- no migration and no new dependency are required.

