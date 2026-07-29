# Execution ledger - P2 canonical Unicode Library search

Date: 2026-07-28

Subsystem: TALOS mobile Library agent retrieval and UI filtering.

Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`

Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

Status: CLOSED - automated gates green; physical Unicode fixtures remain in the
owner checklist.

## Exact ownership

Create:

1. `mobile/docs/superpowers/research/2026-07-28-p2-library-unicode-search-research.md`
2. `mobile/docs/superpowers/specs/2026-07-28-p2-library-unicode-search-design.md`
3. `mobile/docs/superpowers/ledgers/2026-07-28-p2-library-unicode-search-ledger.md`
4. `mobile/src/lib/librarySearchText.ts`
5. `mobile/tests/unit/lib/librarySearchText.test.ts`

Modify:

6. `mobile/src/lib/chat/libraryContext.ts`
7. `mobile/src/lib/vaultLibrary.ts`
8. `mobile/src/screens/ContextScreen.vue`
9. `mobile/tests/unit/lib/libraryContext.test.ts`
10. `mobile/tests/unit/lib/vaultLibrary.test.ts`
11. `mobile/tests/unit/screens/contextScreen.test.ts`
12. `mobile/tests/unit/tools/readTools.test.ts`

Delete: none.

## Public symbols

Stable:

- `rankLibraryDocs`
- `filterLibraryFiles`
- `createTalosReadTools`
- `library_search`

Add:

- `TalosLibrarySearchField`
- `normalizeTalosLibrarySearchText`
- `talosLibrarySearchTerms`
- `scoreTalosLibrarySearchFields`
- `matchesTalosLibrarySearchFields`

No repository, schema, migration, provider, Android, or stored-data symbol
changes.

## RED scenarios

1. `P2-UNI-01 canonical key folds composed/decomposed and full-width forms`
   - Expected RED: shared module does not exist.
   - File: `mobile/tests/unit/lib/librarySearchText.test.ts`.

2. `P2-UNI-02 terms preserve CJK, symbols, punctuation, emoji and ZWJ atoms`
   - Expected RED: current chat tokenizer drops every non-letter/non-number
     query.
   - File: `mobile/tests/unit/lib/librarySearchText.test.ts`.

3. `P2-UNI-03 emoji presentation selectors do not change discovery`
   - Expected RED: `☕` and `☕️` have different raw keys.
   - File: `mobile/tests/unit/lib/librarySearchText.test.ts`.

4. `P2-CHAT-01 rankLibraryDocs returns genuine emoji/symbol/CJK matches`
   - Expected RED: emoji/symbol queries receive score zero and unrelated
     recency wins.
   - File: `mobile/tests/unit/lib/libraryContext.test.ts`.

5. `P2-TOOL-01 library_search returns an emoji-only genuine match`
   - Expected RED: all rows are filtered out by `score > 0`.
   - File: `mobile/tests/unit/tools/readTools.test.ts`.

6. `P2-UI-01 global filter matches the same canonical/emoji fixtures`
   - Expected RED: raw lowercase matching misses decomposed and presentation
     variants.
   - Files: `mobile/tests/unit/lib/vaultLibrary.test.ts` and
     `mobile/tests/unit/screens/contextScreen.test.ts`.

## Focused GREEN commands

```text
npm run test:unit -- --run tests/unit/lib/librarySearchText.test.ts tests/unit/lib/libraryContext.test.ts tests/unit/lib/vaultLibrary.test.ts tests/unit/screens/contextScreen.test.ts tests/unit/tools/readTools.test.ts
npm run typecheck
```

## Affected regressions

- the five focused files above;
- `tests/unit/lib/chatMediaFilter.test.ts`;
- `tests/unit/chat/chatMediaPanel.test.ts`;
- `tests/unit/chat/chatController.test.ts`;
- `tests/unit/tools/toolsetLibraryDiscovery.test.ts`;
- full `npm run test:unit`;
- `npm run build`;
- full `npm run test:e2e`;
- `git diff --check`.

## Real-upstream gate

No upstream runtime is added. Conformance evidence consists of:

1. Unicode 17 normalization fixtures through the real ECMAScript built-in;
2. shared pure-core fixtures for accents, compatibility text, CJK, currency,
   punctuation, emoji, variation selectors, and ZWJ sequences;
3. the real `library_search` executor;
4. the mounted global Library search input;
5. Android-targeted production build plus web E2E.

## Human-visible proof

1. Save files whose names/text contain `Café`, `ＡＶＭ`, `预算`, `€`, `C++`,
   `🔒`, `☕️`, and `👨‍👩‍👧‍👦`.
2. In global Library, search with composed/decomposed accents, ASCII `AVM`,
   partial CJK, each symbol/emoji, and `☕` without a presentation selector.
3. Ask chat to find the same values through natural language.
4. Verify global UI and chat return the same relevant files and no unrelated
   recency fallback.
5. Repeat after reload and in the per-chat media surface where applicable.

## Rollback

Revert only the twelve exact paths above. No stored text, database row, index,
package, generated asset, native code, or user preference requires rollback.

## RED evidence

Behavioral command, before product edits:

`npm run test:unit -- --run tests/unit/lib/libraryContext.test.ts tests/unit/lib/vaultLibrary.test.ts tests/unit/screens/contextScreen.test.ts tests/unit/tools/readTools.test.ts`

Observed:

- 4 files failed;
- 7 P2 assertions failed and 55 adjacent assertions passed;
- chat ranker returned unrelated recency for `€`, `🔒`, and `☕`;
- the real `library_search` returned no match for an emoji-only filename;
- vault/global UI missed composed-versus-decomposed `CAFÉ` and full-width
  compatibility text;
- the mounted global Library missed the canonical-accent fixture.

Pure-module command:

`npm run test:unit -- --run tests/unit/lib/librarySearchText.test.ts`

- failed to resolve the planned `@/lib/librarySearchText` module;
- zero test bodies ran, exactly proving the shared contract was absent before
  implementation.

The behavioral RED is isolated to the reproduced Unicode mismatches; no
environment, dependency, or unrelated assertion failed.

## GREEN evidence

Focused:

- 5 files passed;
- 67/67 tests passed;
- `npm run typecheck` passed.

Affected Library/chat/toolset regression set:

- 9 files passed;
- 133/133 tests passed.

Complete subsystem and cross-cutting gates:

- `npm run test:unit`: 250 files passed, 2 skipped; 2,111 tests passed,
  5 skipped; only the four established jsdom canvas notices appeared;
- `npm run build`: passed, 3,214 modules; initial JavaScript 555,906 / 560,000
  bytes, CSS 129,354 / 150,000 bytes; parity 9/9;
- `npm run test:e2e`: 74/74 passed;
- final `git diff --check`: passed.

## Implemented upstream decision

Unicode 17 UAX #15 NFKC comparison semantics are now centralized in
`librarySearchText.ts`. The UAX #29 boundary risk is handled by an explicit
portable profile: whitespace-delimited atoms preserve every other code point
sequence instead of attempting locale/dictionary word segmentation.

The same scorer/matcher now governs:

- weighted filename/full-text agent ranking;
- `library_search` genuine-match filtering;
- `filterLibraryFiles`;
- global mounted Library search;
- per-chat consumers of the shared vault filter.

Stored text is unchanged. No dependency, migration, index, native code,
provider wire change, or persisted comparison key was added.
