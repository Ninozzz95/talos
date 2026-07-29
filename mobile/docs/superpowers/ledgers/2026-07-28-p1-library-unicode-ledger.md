# Execution ledger - P1-B Unicode Library retrieval

- Subsystem: TALOS mobile local Library ranker
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pins:
  - Unicode 17.0.0, UAX #15 revision 57
  - living ECMA-262 text-processing specification, inspected 2026-07-28
- Upstream decision: adopt platform NFKC normalization and Unicode
  Letter/Number property escapes for an ephemeral comparison index; preserve
  original owner data.

## Exact file ownership

Create:

- `mobile/docs/superpowers/ledgers/2026-07-28-p1-library-unicode-ledger.md`

Shared, already created by P1-A:

- `mobile/docs/superpowers/research/2026-07-28-p1-library-pagination-unicode-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p1-library-pagination-unicode-design.md`

Modify:

- `mobile/src/lib/chat/libraryContext.ts`
- `mobile/tests/unit/lib/libraryContext.test.ts`
- `mobile/tests/unit/tools/readTools.test.ts`

Delete: none.

## Symbols and compatibility

Private additions:

- `normalizeLibrarySearchText(text)`
- `tokenizeLibraryQuery(text)`

Stable public symbols/contracts:

- `LibraryDoc`
- `rankLibraryDocs(...)`
- `selectLibraryDocsForInjection(...)`
- `buildTalosLibraryContextBlock(...)`
- `buildTalosLibraryContextMessage(...)`
- `talosLibraryDisclosure(...)`
- existing weighting, saturation, empty-query fallback, and recency tie-break

## Named RED scenarios

- `LIB-UNICODE-01 canonical Italian accents match`
- `LIB-UNICODE-02 Cyrillic terms match`
- `LIB-UNICODE-03 Arabic terms match`
- `LIB-UNICODE-04 CJK and a one-code-point query match`
- `LIB-UNICODE-05 full-width compatibility forms match`
- `LIB-UNICODE-06 library_search exposes the Unicode-ranked row end to end`

Current expected failure: the ASCII-only tokenizer produces no usable terms or
compares incompatible code-unit sequences.

## RED command

`npx vitest run tests/unit/lib/libraryContext.test.ts tests/unit/tools/readTools.test.ts`

## GREEN and regression gates

Run the RED command, then:

`npx vitest run tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/chat/chatController.test.ts`

`npm run typecheck`

`git diff --check -- mobile/src/lib/chat/libraryContext.ts mobile/tests/unit/lib/libraryContext.test.ts mobile/tests/unit/tools/readTools.test.ts mobile/docs/superpowers/ledgers/2026-07-28-p1-library-unicode-ledger.md`

The final pre-APK run repeats the complete controlled unit and E2E gates.

## Real-upstream and human proof

No network upstream is required. The physical checklist searches persisted
Library filenames/body text with accented Italian, Cyrillic, Arabic, CJK, and
full-width forms and verifies the relevant item is actually readable.

## Rollback

Remove the normalization/tokenization helpers and multilingual regression
tests, restoring the ASCII splitter. No owner content is rewritten.

## Closure record

P1-A closed before this slice began.

RED established on 2026-07-28:

- Focused command: 6 new failures, 19 compatibility tests passed.
- All five ranker fixtures incorrectly fell back to the newer unrelated row:
  canonically equivalent accented Italian, Cyrillic, Arabic, one-code-point
  CJK, and full-width `DS4`.
- The real `library_search` executor returned the honest no-match message for
  Arabic text that was present in the supplied Library.

Implementation and automated closure completed on 2026-07-28.

GREEN evidence:

- Focused ranker plus real-tool gate: 25/25 passed.
- The five multilingual fixtures now rank the relevant older document above
  unrelated recency, and Arabic `library_search` exposes the genuine ID.
- Adjacent `toolsetLibraryDiscovery.test.ts` plus
  `chatController.test.ts`: 35/35 passed.
- `npm run typecheck`: passed.
- Scoped `git diff --check`: exit 0 with no findings.

The comparison index uses platform NFKC, locale-independent lower-casing, and
Unicode Letter/Number runs. Stored and displayed owner content is unchanged.

Automated status: **CLOSED**.

Physical multilingual retrieval from persisted encrypted storage remains a
final owner APK check; it is not evidence needed to begin P1-C.
