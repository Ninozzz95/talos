# Execution ledger - P1-A budget-honest Library pagination

- Subsystem: TALOS mobile read-only Library tools
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pins:
  - OpenAI vector-store Search API reference, inspected 2026-07-28
  - Gemini File Search documents `v1beta`, inspected 2026-07-28
  - JSON:API cursor-pagination profile, inspected 2026-07-28
- Upstream decision: adapt accurate returned-result and continuation semantics
  behind the existing local `library_search` offset contract.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p1-library-pagination-unicode-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p1-library-pagination-unicode-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p1-library-pagination-ledger.md`

Modify:

- `mobile/src/lib/tools/readTools.ts`
- `mobile/tests/unit/tools/readTools.test.ts`

Delete: none.

## Symbols and compatibility

Private additions:

- `takeCodePoints(value, max)`
- `formatLibrarySearchRecord(doc)`
- `buildLibrarySearchPage(matching, offset, requestedLimit)`

Stable public symbols/contracts:

- `TalosToolSources`
- `createTalosReadTools(...)`
- tool name `library_search`
- input fields `query`, `limit`, `offset`
- evidence fields `matched`, `matched_total`, `returned`, `offset`,
  `next_offset`

## Named RED scenarios

- `LIB-PAGE-01 long rows never count as returned when absent from content`
  - Current expected failure: whole-response `clip()` removes later rows after
    evidence and continuation have already counted them.
- `LIB-PAGE-02 next_offset exposes the first row omitted by the byte budget`
  - Current expected failure: next offset advances by the requested page slice
    and skips clipped records.
- `LIB-PAGE-03 following offsets reaches every match exactly once`
  - Current expected failure: at least one clipped ID is permanently skipped.
- `LIB-PAGE-04 short-page compatibility remains unchanged`
  - Characterization gate: existing three-document pagination stays green.

## RED command

`npx vitest run tests/unit/tools/readTools.test.ts`

Expected failure: the new long-record assertions show evidence IDs and
`next_offset` disagree with the complete rows in the tool result.

## GREEN and regression gates

`npx vitest run tests/unit/tools/readTools.test.ts`

`npx vitest run tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/chat/chatController.test.ts`

`npm run typecheck`

`git diff --check -- mobile/src/lib/tools/readTools.ts mobile/tests/unit/tools/readTools.test.ts mobile/docs/superpowers/research/2026-07-28-p1-library-pagination-unicode-research.md mobile/docs/superpowers/specs/2026-07-28-p1-library-pagination-unicode-design.md mobile/docs/superpowers/ledgers/2026-07-28-p1-library-pagination-ledger.md`

The final pre-APK run repeats the complete controlled unit and E2E gates.

## Real-upstream and human proof

No network upstream is required: this is a local deterministic adapter.
Physical acceptance follows the six-step Library checklist in the design and
must traverse every returned `next_offset`.

## Rollback

Remove the three private packing helpers and the long-record regression tests,
then restore the prior whole-result clip. No stored data changes.

## Closure record

RED established on 2026-07-28:

- `readTools.test.ts`: 2 new failures, 9 compatibility tests passed.
- `LIB-PAGE-01/02`: the result declared `showing 1-20`, `returned: 20`, and
  `next_offset: 20`, but the 8,000-character clip cut the fourth long record
  mid-field and emitted the truncation marker.
- `LIB-PAGE-03`: following the advertised offset would begin at row 21 and
  permanently skip every clipped row between the visible prefix and row 20.

Implementation and automated closure completed on 2026-07-28.

GREEN evidence:

- Focused `readTools.test.ts`: 11/11 passed, including complete-row/evidence
  equality and traversal of all 25 long matches exactly once.
- Adjacent `toolsetLibraryDiscovery.test.ts` plus
  `chatController.test.ts`: 35/35 passed.
- `npm run typecheck`: passed.
- Scoped `git diff --check`: exit 0; only the repository's line-ending
  conversion warning was emitted.

The implementation bounds individual untrusted fields by Unicode code point,
packs only complete records, computes evidence after packing, and points
`next_offset` to the first unreturned ranked row.

Automated status: **CLOSED**.

Physical traversal of a real large persisted Library remains a final owner APK
check; it is not evidence needed to begin the next independently automated
slice.
