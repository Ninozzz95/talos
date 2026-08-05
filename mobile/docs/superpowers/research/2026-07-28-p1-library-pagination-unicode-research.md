# Research dossier - P1 Library pagination and Unicode retrieval

Date: 2026-07-28

Subsystem: TALOS mobile local Library retrieval and read-only tools.

Lane: `<corsia locale>`

Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduction and root causes

The independent post-APK review found two deterministic retrieval defects.

1. `library_search` slices `limit` rows, computes `returned`, `matched`, and
   `next_offset`, then clips the fully rendered string at 8,000 UTF-16 code
   units. Long rows can therefore be reported as returned even though the model
   never receives them. The advertised next offset skips those invisible rows.
2. `rankLibraryDocs` tokenizes with `[^a-z0-9]`. Accented Latin, Cyrillic,
   Arabic, CJK, and other scripts are discarded or split incorrectly. Neither
   the query nor indexed text is Unicode-normalized, so canonically equivalent
   strings such as composed and decomposed `caffe` with an accent can miss.

## Current primary standards and mature references

### Unicode Standard Annex #15

Source: `https://unicode.org/reports/tr15/`

Pin inspected: Unicode 17.0.0, UAX #15 revision 57.

UAX #15 defines the four normalization forms and states that normalization gives
equivalent strings a stable representation for comparison. NFKC additionally
folds compatibility distinctions such as full-width forms, while warning that
it must not be used blindly when source formatting distinctions must round-trip.

Decision: **adopt NFKC only for the ephemeral search comparison index**. Keep
the original filename and document text unchanged for display, storage,
export, and evidence. This gives width/canonical-insensitive lookup without
rewriting owner data.

### ECMAScript text processing

Sources:

- `https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.normalize`
- `https://tc39.es/ecma262/multipage/text-processing.html#prod-CharacterClassEscape`

Pin inspected: living ECMA-262 text-processing specification on 2026-07-28.

ECMAScript exposes Unicode normalization through
`String.prototype.normalize()` and Unicode general categories through regular
expression property escapes. `\p{L}` and `\p{N}` cover letters and numbers
independently of script when the Unicode flag is enabled.

Decision: **adopt the platform implementation directly** with NFKC,
lower-casing, and `/[\p{L}\p{N}]+/gu`. No tokenizer dependency is warranted for
this bounded on-device keyword ranker.

### OpenAI vector-store search

Source:
`https://developers.openai.com/api/reference/resources/vector_stores/methods/search`

Pin inspected: current API reference on 2026-07-28.

The mature contract returns a concrete result array together with continuation
state (`has_more` and `next_page`). A requested `max_num_results` is a maximum,
not permission to claim records absent from the response.

Decision: **adapt the result/continuation invariant**, not the hosted vector
service. TALOS remains local-first and keeps its existing `offset` input for
wire compatibility, but the offset advances only by records actually emitted.

### Gemini File Search document listing

Source:
`https://ai.google.dev/api/file-search/documents`

Pin inspected: Gemini API `v1beta` documentation on 2026-07-28.

Gemini explicitly permits a service to return fewer documents than the
requested page size and supplies `nextPageToken` to retrieve the following
page.

Decision: **adapt this bounded-page behavior**. When TALOS's response budget
fills, return fewer complete rows and expose the exact next offset.

### JSON:API cursor pagination profile

Source: `https://jsonapi.org/profiles/ethanresnick/cursor-pagination/`

Pin inspected: published cursor-pagination profile on 2026-07-28.

The profile requires stable ordering and makes truncation/continuation explicit.
It also documents the mutation hazards of offset pagination.

Decision: **retain the established TALOS offset contract for compatibility**,
while preserving deterministic ranking and making budget truncation explicit
through an accurate `next_offset`. An opaque snapshot cursor is a possible
future one-up for libraries that mutate during a multi-call traversal, but is
outside this regression fix.

## Result-budget design consequences

- A Library result row is atomic: it is either fully present or not counted.
- Identity/provenance/display fields are individually bounded before packing,
  so one hostile or malformed row cannot monopolize the tool context.
- The heading, `matched`, `returned`, and `next_offset` are derived after
  packing, never before it.
- The next offset points to the first matching row not emitted.
- No trailing whole-response clip is allowed for `library_search`; the page
  builder itself must prove it remains within `MAX_TOOL_CONTENT`.
- The rank order remains score-descending, then recency, so existing behavior
  and pagination remain deterministic for an unchanged Library snapshot.

## Unicode retrieval design consequences

- Normalize query, filename, and extracted text to NFKC only in memory.
- Lower-case after normalization.
- Tokenize runs of Unicode letters or numbers and retain one-code-point tokens;
  this is required for meaningful single-character CJK and other-script
  searches.
- Match normalized tokens as literal substrings. No regex is constructed from
  user input.
- Preserve the existing name weight, frequency saturation, score-zero behavior,
  and recency tie-break.

## Rejected alternatives

- **Clip the text but keep old evidence:** this is the current data-loss defect.
- **Reduce the hard page limit globally:** still fails for sufficiently long
  fields and hides continuation semantics.
- **Silently truncate a row midway:** makes a reported file impossible to
  identify or re-read reliably.
- **Use `Intl.Segmenter` as the only tokenizer:** its availability and word
  segmentation can vary with the embedded ICU data. Unicode properties give a
  smaller deterministic compatibility surface for this keyword ranker.
- **Add a hosted/vector dependency:** unnecessary for the reported correctness
  bugs and incompatible with the local-first/offline boundary.
- **NFKC-normalize stored owner content:** destroys distinctions in source data
  and violates round-trip expectations.

## Security and compatibility requirements

- Search terms and Library text remain untrusted data.
- Matching must not construct executable regular expressions from user input.
- Existing ASCII queries, empty-query recency fallback, result ordering,
  `library_read`, and tool permission behavior remain stable.
- No database migration, network call, package, or provider-specific model is
  introduced.

