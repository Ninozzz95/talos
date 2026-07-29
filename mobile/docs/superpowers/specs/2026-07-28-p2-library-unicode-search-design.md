# Design - P2 canonical Unicode Library search

Date: 2026-07-28

## Canonical comparison key

`normalizeTalosLibrarySearchText(value)`:

1. applies Unicode NFKC;
2. applies ECMAScript locale-independent lowercase;
3. removes U+FE0E and U+FE0F presentation selectors;
4. collapses Unicode whitespace to one ASCII space;
5. trims the result.

This function creates a comparison key only. It never mutates stored filenames,
document bodies, UI labels, exports, hashes, or vault bytes.

## Query atoms

`talosLibrarySearchTerms(query)` splits the canonical key only on spaces and
deduplicates atoms in first-seen order.

No category is discarded. These are all valid complete atoms:

- `预算`
- `€`
- `C++`
- `🔒`
- `👨‍👩‍👧‍👦`

An empty/whitespace-only query produces no atoms.

## Scoring and matching

`scoreTalosLibrarySearchFields(query, fields)` preserves the established
BM25-lite behavior:

- normalize each field once;
- count every occurrence of each atom;
- multiply counts by the field weight;
- apply the established `tf / (tf + 1.5)` saturation per atom;
- sum atom scores.

Agent ranking passes filename weight 3 and extracted-text weight 1, preserving
the existing preference for filename matches.

`matchesTalosLibrarySearchFields(query, fields)`:

- returns true for an empty query;
- otherwise returns true only when the canonical score is greater than zero.

The global and per-chat Library use unweighted filename plus extracted-text
fields, so they expose the same genuine-match decision as agent retrieval.

## Integration

- `rankLibraryDocs` delegates normalization/tokenization/scoring to the shared
  module.
- `filterLibraryFiles` delegates its query predicate to the shared module.
- `ContextScreen.vue` removes its duplicate lowercase matcher, applies its
  image/file/link type filter, then calls `filterLibraryFiles`.
- `library_search` needs no new code path: its existing `score > 0` rule now
  recognizes symbol-only queries through `rankLibraryDocs`.

## Compatibility and rollback

Stable:

- `rankLibraryDocs` ordering and empty-query recency fallback;
- filename weighting;
- `filterLibraryFiles` origin/session/kind/filter ordering;
- stored data and result shapes.

Intentional behavior improvements:

- canonical-equivalent, compatibility, CJK, punctuation/symbol, emoji, and
  emoji-presentation queries match consistently in agent and UI paths.

Rollback removes the shared module and restores the two old matchers. No
database, cache, persisted key, migration, package, or native artifact changes.
