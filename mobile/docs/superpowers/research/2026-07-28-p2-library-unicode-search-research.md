# Research dossier - P2 canonical Unicode Library search

Date: 2026-07-28

Subsystem: TALOS mobile Library matching across agent retrieval, global Library
UI, and per-chat media filtering.

Lane: `<corsia locale>`

Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduction and root cause

The independent post-APK review found two incompatible search implementations:

- agent retrieval in `libraryContext.ts` uses NFKC plus lowercase, but tokenizes
  only Unicode letters and numbers;
- `vaultLibrary.ts` and the global `ContextScreen.vue` use raw lowercase
  substring checks with no Unicode normalization.

Consequences:

1. canonically equivalent composed/decomposed accents can match in chat but not
   in the global Library;
2. full-width compatibility forms can match in chat but not in UI;
3. an emoji-only or symbol-only query produces zero agent tokens, so
   `library_search` filters every row out even when the filename contains the
   exact emoji;
4. the global Library duplicates the matcher instead of using the same
   contract as the per-chat filter.

## Current primary standards

### Unicode Standard Annex #15

- Source: `https://www.unicode.org/reports/tr15/tr15-57.html`
- Pin: Unicode 17.0.0, UAX #15 revision 57, 2025-07-30.
- Retrieved: 2026-07-28.
- Relevant requirements: normalization gives equivalent strings a stable
  representation; NFKC folds compatibility forms such as full-width text;
  normalization must be applied explicitly and conformantly.

Decision: **ADOPT NFKC FOR SEARCH KEYS**. This is comparison-only. Stored
filenames and document text are never rewritten, so compatibility distinctions
remain available for display and export.

### Unicode Standard Annex #29

- Source: `https://www.unicode.org/reports/tr29/tr29-47.html`
- Pin: Unicode 17.0.0, UAX #29 revision 47, 2025-08-17.
- Retrieved: 2026-07-28.
- Relevant constraints: user-perceived characters may contain multiple code
  points; emoji ZWJ sequences need extended handling; reliable word boundaries
  for Chinese, Japanese, Thai, and similar scripts may require locale/dictionary
  tailoring.

Decision: **ADAPT, WITHOUT CLAIMING WORD-SEGMENTATION CONFORMANCE**. Library
search does not need to split human language into dictionary words. It uses
whitespace-delimited query atoms and substring matching inside normalized
fields. Therefore:

- CJK text remains an intact atom and partial CJK queries work by substring;
- emoji, ZWJ sequences, currency/math symbols, and punctuation inside an atom
  are retained rather than discarded;
- no platform ICU dictionary or locale-dependent boundary changes results
  between Android WebView, web development, and Vitest.

Emoji text/default presentation selectors U+FE0E/U+FE0F are removed from
comparison keys only. They affect glyph presentation, not the user's intended
Library identity, so `☕` and `☕️` discover the same file.

### ECMAScript `String.prototype.normalize`

- Source:
  `https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.normalize`
- Pin: ECMA-262 living specification retrieved 2026-07-28; the normative
  operation delegates NFC/NFD/NFKC/NFKD to UAX #15.
- Android compatibility source:
  `https://developer.android.com/reference/java/text/Normalizer`
- Android app floor: API 26; Java normalizer support begins at API 9.

Decision: **ADOPT THE BUILT-IN**, not a dependency. The shipped JavaScript
runtime already uses `String.prototype.normalize('NFKC')`; Unicode property
escapes are also already present in production code. No ICU/WASM/search package
is needed.

## Alternatives inspected

### Keep chat and UI matchers separate

Rejected. The same query returning different files depending on where it is
typed is a product regression, and future fixes would drift again.

### Use only `[\p{L}\p{N}]+`

Rejected. It explicitly erases the emoji/symbol-only queries reported by the
review.

### Add `Intl.Segmenter` or an ICU tokenizer

Rejected for this local exact/substring search. UAX #29 notes that high-quality
word segmentation can require locale and dictionary tailoring. That added
runtime-dependent complexity does not improve the requested filename/content
lookup and could make Android/web results diverge.

### Remove diacritics

Rejected. NFKC respects canonical and compatibility equivalence but does not
declare semantically different accented letters identical. Accent-insensitive
search is a separate product decision and must not be smuggled into this fix.

### Case-fold package

Rejected. The established code already uses ECMAScript locale-independent
lowercase. Full Unicode case folding would be a broader semantic change and no
current owner reproduction requires it.

## Upstream decision

TALOS will **adopt** Unicode 17 UAX #15 NFKC semantics and **adapt** UAX #29 by
preserving complete whitespace-delimited atoms instead of attempting
locale-dependent word segmentation.

One pure AVM-owned module will own:

- comparison-key normalization;
- query atoms;
- weighted field scoring;
- boolean field matching.

Agent ranking, `filterLibraryFiles`, and the global Library screen will consume
that module. No dependency, migration, stored-text rewrite, provider wire
change, native permission, or search index is introduced.
