# Execution ledger - P1 Library browse and full-content retrieval

Date: 2026-07-28

Subsystem: TALOS mobile Library discovery and read-only agent tools.

Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`

Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

Status: CLOSED - automated gates green; physical Library traversal remains in
the owner checklist.

## Exact ownership

Create:

1. `mobile/docs/superpowers/research/2026-07-28-p1-library-browse-full-content-research.md`
2. `mobile/docs/superpowers/specs/2026-07-28-p1-library-browse-full-content-design.md`
3. `mobile/docs/superpowers/ledgers/2026-07-28-p1-library-browse-full-content-ledger.md`

Modify:

4. `mobile/src/lib/tools/readTools.ts`
5. `mobile/src/lib/tools/toolset.ts`
6. `mobile/src/lib/tools/toolLabels.ts`
7. `mobile/tests/unit/tools/readTools.test.ts`
8. `mobile/tests/unit/tools/toolLabels.test.ts`
9. `mobile/tests/unit/tools/toolsetLibraryDiscovery.test.ts`
10. `mobile/tests/unit/chat/chatController.test.ts`

Delete: none.

No repository implementation, database schema, migration, dependency,
generated asset, Android source, or UI component is owned by this slice.

## Public symbols

Stable:

- `LibraryDoc`
- `TalosToolSources`
- `createTalosReadTools`
- `createTalosToolset`
- `rankLibraryDocs`
- `library_search`
- `library_read`
- `TalosChatRepository.listVaultFiles`
- `TalosChatRepository.listVaultFileSummaries`

Add:

- `TalosLibraryFileType`
- `TalosLibraryListEntry`
- `TalosToolSources.listLibraryEntries`
- provider-neutral tool `library_list`

Behavior amendment:

- `TalosToolSources.listLibraryDocs` supplies full extracted text for explicit
  search instead of 600-character previews.

No persisted or provider-specific symbol changes.

## RED scenarios

1. `P1-LIB-LIST-01 enumerates thirty Library items exactly once by following opaque page tokens`
   - Expected RED: `library_list` does not exist.
   - File: `mobile/tests/unit/tools/readTools.test.ts`.

2. `P1-LIB-LIST-02 filters origin and image/document/link without fabricated rows`
   - Expected RED: no list/filter schema exists.
   - File: `mobile/tests/unit/tools/readTools.test.ts`.

3. `P1-LIB-LIST-03 rejects unknown tokens and filter drift`
   - Expected RED: no opaque continuation contract exists.
   - File: `mobile/tests/unit/tools/readTools.test.ts`.

4. `P1-LIB-DEEP-01 finds a term after the 600-character preview boundary`
   - Expected RED: toolset search reports no match.
   - File: `mobile/tests/unit/tools/toolsetLibraryDiscovery.test.ts`.

5. `P1-LIB-PERF-01 list uses summaries and full corpus is read only by explicit search`
   - Expected RED: there is no distinct list source, while search reads only
     summaries.
   - File: `mobile/tests/unit/tools/toolsetLibraryDiscovery.test.ts`.

6. `P1-LIB-NL-01 a realistic Italian composer request is answered through library_list and audited`
   - Expected RED: the provider cannot call `library_list`.
   - File: `mobile/tests/unit/chat/chatController.test.ts`.

7. `P1-LIB-LABEL-01 every tool has an owned human label and icon`
   - Expected RED after the tool RED is introduced: label/icon guard names
     `library_list` as missing.
   - File: `mobile/tests/unit/tools/toolLabels.test.ts`.

## Focused GREEN commands

```text
npm run test:unit -- --run tests/unit/tools/readTools.test.ts
npm run test:unit -- --run tests/unit/tools/toolsetLibraryDiscovery.test.ts
npm run test:unit -- --run tests/unit/tools/toolLabels.test.ts
npm run test:unit -- --run tests/unit/chat/chatController.test.ts
```

## Affected regressions

- `tests/unit/tools/readTools.test.ts`
- `tests/unit/tools/toolLabels.test.ts`
- `tests/unit/tools/toolRegistry.test.ts`
- `tests/unit/tools/toolExecutor.test.ts`
- `tests/unit/tools/toolsetLibraryDiscovery.test.ts`
- `tests/unit/tools/agentLoop.test.ts`
- `tests/unit/chat/chatController.test.ts`
- `tests/unit/chat/streamComplete.test.ts`
- `tests/unit/chat/geminiOllamaTools.test.ts`
- full `npm run test:unit`
- `npm run typecheck`
- `npm run build`
- full `npm run test:e2e`
- `git diff --check`

## Real-upstream gate

No new runtime is integrated. Conformance is proven against the shipped
repository implementations:

1. memory repository for deterministic unit traversal;
2. SQLite summary/full-list methods through existing repository contract tests;
3. the real registry, provider schema translation, executor, tool loop, audit
   sink, and final composer in the natural-language acceptance;
4. web build/E2E to prove no Android-only FTS dependency entered the path.

The paired research dossier records AIP-158 and exact SQLite/plugin pins.

## Human-visible proof

1. Put at least 25 mixed items in Library: uploaded/generated documents,
   images, and saved web links.
2. In a new chat ask: `Mostrami tutti i file della mia libreria, senza cercare
   una parola specifica`.
3. Verify the answer traverses every page, counts every eligible item once, and
   includes names plus origin-chat provenance.
4. Ask for only generated images, then only saved links; verify every returned
   row matches the requested filter.
5. Save a markdown document whose unique marker occurs after character 600.
6. Ask TALOS to find that marker, then read the matching document; verify it
   finds the correct id and quotes content from the real file.
7. Turn off `Let chats use your Library`; repeat. Verify no Library tool is
   offered and no file content enters the prompt.
8. Reload and repeat list/search to prove encrypted persistence.

## Rollback

Revert only the ten paths in Exact ownership to their pre-slice content. No
stored row, schema version, generated asset, native package, or user setting
requires rollback. Retain the named RED scenarios as regression tests if the
implementation is replaced.

## RED evidence

Command:

`npm run test:unit -- --run tests/unit/tools/readTools.test.ts tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/tools/toolLabels.test.ts tests/unit/chat/chatController.test.ts`

Observed before product edits:

- 4 test files failed;
- 7 named/contract assertions failed and 59 adjacent assertions passed;
- `library_list` was absent from the read set and Anthropic schema;
- enumeration, filter, and continuation scenarios stopped at
  `missing tool library_list`;
- the label contract had no `library_list` entry;
- the realistic Italian composer request received schemas without
  `library_list`;
- the deep-content boundary could not begin its metadata-only list/search
  comparison because the distinct list contract was absent.

This is the expected behavioral RED. No environment, dependency, or compiler
failure obscured the missing product contract.

## Amendment - deep-search acceptance

The first GREEN run passed 65/66 assertions. `library_search` correctly selected
`deep-transcript` by a marker beyond character 600 and called the full-corpus
source, but the test additionally required that marker inside the result's
300-character leading excerpt.

That extra assertion is outside the stable bounded-search contract and would
encourage larger tool results. The permanent scenario is amended before its
fixture changes:

1. search by the deep marker;
2. assert the matching file id is returned and the full-corpus source ran;
3. call `library_read` with that id;
4. assert the real selected document contains the deep marker.

This proves discovery plus retrieval without changing the existing bounded
search-record format.

## GREEN evidence

Focused after implementation:

- 4 files passed;
- 66/66 tests passed;
- `npm run typecheck` passed.

Affected tool/provider/chat regression set:

`npm run test:unit -- --run tests/unit/tools/readTools.test.ts tests/unit/tools/toolLabels.test.ts tests/unit/tools/toolRegistry.test.ts tests/unit/tools/toolExecutor.test.ts tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/tools/agentLoop.test.ts tests/unit/chat/chatController.test.ts tests/unit/chat/streamComplete.test.ts tests/unit/chat/geminiOllamaTools.test.ts`

- 9 files passed;
- 116/116 tests passed.

Complete subsystem and cross-cutting gates:

- first `npm run test:unit` wrapper reached its 184-second command limit before
  a summary; its exact orphaned npm/Vitest process tree was identified and
  stopped before retry, so no suites overlapped;
- isolated retry: 249 files passed, 2 skipped; 2,094 tests passed, 5 skipped;
  only the four established jsdom canvas notices appeared;
- `npm run build`: passed, 3,213 modules; initial JavaScript 555,660 / 560,000
  bytes, CSS 129,354 / 150,000 bytes; parity 9/9;
- `npm run test:e2e`: 74/74 passed;
- `git diff --check`: passed.

## Implemented upstream decision

AIP-158 semantics and the mature browse/search separation were adapted behind
the TALOS-owned tool contract:

- `library_list` enumerates metadata with origin/type filters, deterministic
  ordering, bounded pages, secure opaque continuation tokens, filter-drift
  rejection, and explicit end-of-list;
- `library_search` now ranks complete extracted text only after an explicit
  call, so content after the former 600-character boundary is discoverable;
- `library_read` accepts ids from either operation;
- browse transfers summaries only, ambient injection remains unchanged, and
  unavailable/withdrawn rows remain inaccessible;
- the natural-language Italian final-composer path reaches the real tool,
  repository, provider continuation, and audit record.

No FTS migration, dependency, persisted cursor, provider-specific wire field,
Android permission, or database schema was added.
