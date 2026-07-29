# Execution ledger - P1 web-search results in the Library

- Subsystem: TALOS mobile web tools + encrypted Library
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pins:
  - Tavily Search REST `/search`, inspected 2026-07-28
  - Brave Web Search REST + retention FAQ, inspected 2026-07-28
  - SearXNG Search API docs `2026.7.26+b060c780d`
  - WHATWG URL Standard, inspected 2026-07-28
- Upstream decision: adapt normalized provider results behind an AVM recorder;
  reject default Brave-result retention; adopt platform WHATWG URL parsing.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p1-web-search-library-sources-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p1-web-search-library-sources-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p1-web-search-library-sources-ledger.md`
- `mobile/src/lib/search/webSourceArchive.ts`
- `mobile/tests/unit/search/webSourceArchive.test.ts`

Modify:

- `mobile/src/lib/search/webTools.ts`
- `mobile/tests/unit/search/webTools.test.ts`
- `mobile/src/stores/chatController.ts`
- `mobile/tests/unit/chat/chatController.test.ts`
- `mobile/src/stores/chat.ts`
- `mobile/src/services/talosVaultService.ts`
- `mobile/tests/unit/services/talosVaultService.test.ts`
- `mobile/src/composables/useTalosMobileAttachments.ts`
- `mobile/tests/unit/composables/useTalosMobileAttachments.test.ts`
- `mobile/src/lib/vaultLibrary.ts`
- `mobile/tests/unit/chat/savedLinkRows.test.ts`
- `mobile/src/screens/ContextScreen.vue`
- `mobile/tests/unit/screens/contextScreen.test.ts`
- `mobile/src/components/talos/settings/TalosMobileSearchSourcePanel.vue`
- `mobile/tests/unit/settings/searchSourcePanel.test.ts`
- `mobile/src/lib/search/searchSources.ts`
- `mobile/tests/unit/tools/toolLabels.test.ts`

Delete: none.

## Public symbols and compatibility

Create:

- `TalosWebArchivePolicy`
- `TalosWebArchiveReport`
- `TalosWebSourceLink`
- `TalosArchivedWebSource`
- `TalosWebSourceArchive`
- `TalosWebSourceArchiveSaveInput`
- `canonicalTalosWebSourceUrl(...)`
- `createTalosWebSourceArchive(...)`

Modify while preserving existing callers:

- `TalosWebToolSources.rememberSearch(...)`
- `TalosGeneratedTextInput.sourceLinks`
- `TalosMobileAttachmentsController.saveGenerated(...)`
- `TalosVaultService.createGenerated(...)`
- `parseVaultSourceUrl(...)`
- `talosSavedLinkRows(...)`

Stable:

- `createTalosWebTools(...)`
- `runTalosSearch(...)`
- `readTalosPage(...)`
- `TalosSearchResult`
- legacy `metadata.source_url`
- legacy Markdown `Source:` fallback
- `TalosMobileWebSource`

## Named RED scenarios

- `WEB-LIB-01 search-only results are archived and cited`
  - Current expected failure: `rememberSearch` does not exist and no save runs.
- `WEB-LIB-02 parallel/duplicate results become one canonical link`
  - Current expected failure: no search-result recorder exists.
- `WEB-LIB-03 a single dossier expands into every Library link`
  - Current expected failure: `talosSavedLinkRows` only understands one URL per
    file.
- `WEB-LIB-04 storage failure is visible to the model`
  - Current expected failure: `catch(() => {})` hides it.
- `WEB-LIB-05 Brave search-result retention fails closed`
  - Current expected failure: no source-specific retention decision exists.
- `WEB-LIB-06 generated-analysis degradation keeps source metadata`
  - Current expected failure: fallback metadata drops `source_url` and any new
    `source_links`.
- `WEB-LIB-07 realistic typoed search survives composer, reload metadata, and
  Library projection`
  - Current expected failure: controller only records `web_read`.
- `WEB-LIB-08 credentialed URLs never become openable Library rows`
  - Current expected failure: `parseVaultSourceUrl` accepts URL credentials.

## RED commands

Focused:

`npx vitest run tests/unit/search/webSourceArchive.test.ts tests/unit/search/webTools.test.ts tests/unit/chat/savedLinkRows.test.ts`

Integration:

`npx vitest run tests/unit/chat/chatController.test.ts tests/unit/services/talosVaultService.test.ts tests/unit/composables/useTalosMobileAttachments.test.ts tests/unit/screens/contextScreen.test.ts tests/unit/settings/searchSourcePanel.test.ts tests/unit/tools/toolLabels.test.ts`

## GREEN and regression gates

Focused RED command, then:

`npx vitest run tests/unit/search/searchSources.test.ts tests/unit/search/pageExtract.test.ts tests/unit/chat/savedSourceLinks.test.ts tests/unit/chat/sessionCleanup.test.ts`

`npm run typecheck`

`npm run build`

`git diff --check`

At final pre-APK closure, rerun the controlled full unit suite and affected
Playwright journeys under the single-runner rule.

## Real-upstream and human proof

- Owner's existing physical trace is the production RED: two successful
  parallel `web_search` calls, zero `web_read`, empty Links.
- Final APK checklist repeats that path with the owner's configured Tavily,
  SearXNG, or custom endpoint and verifies reload persistence.
- A separate Brave checklist confirms no raw API-result retention and explicit
  `web_read` guidance.
- No key or paid provider request is made by automated tests.

## Closure record

RED established on 2026-07-28.

- `webSourceArchive.test.ts`: suite import failed exactly because the planned
  recorder module did not yet exist.
- Remaining focused/integration RED: 8 files ran; 91 compatibility tests passed
  and the 10 new assertions failed for the expected missing contracts:
  four web-tool archive/status cases, two Library multi-link/security cases,
  one Vault metadata-degradation case, one empty-state copy case, one current
  Brave policy case, and one realistic controller journey.

Implementation and automated closure completed on 2026-07-28.

## GREEN evidence

- Recorder unit gate:
  - `webSourceArchive.test.ts`: 6/6 passed.
- Focused plus realistic controller journey:
  - 9 files passed; 107/107 tests passed.
  - Includes search-only persistence, two parallel searches, canonical URL
    deduplication, invalid/credentialed URL rejection, storage-failure
    visibility, Brave fail-closed retention, per-answer citations, SQL-backed
    message metadata reload, and Library metadata reload.
- Affected search/Library/controller gate:
  - 13 files passed; 138/138 tests passed.
- Explicit compatibility gate:
  - `searchSources`, `pageExtract`, `savedSourceLinks`, and `sessionCleanup`;
    4 files passed, 31/31 tests passed.
- First `npm run typecheck` exposed one compile-only defect in the new recorder:
  TypeScript rejected `readonly Array<T>` (`TS1354`). The declaration was
  corrected to `ReadonlyArray<T>`.
- Fresh `npm run typecheck`: passed.
- Fresh `npm run build`: passed.
  - 3,204 modules transformed.
  - Initial JavaScript: 554,327 / 560,000 bytes.
  - Initial CSS: 129,159 / 150,000 bytes.
  - Parity verifier: 9/9 script tests passed and ledger valid.
- `git diff --check`: exit 0; only pre-existing line-ending conversion
  warnings were emitted.

Automated status: **CLOSED**.

Physical real-upstream closure remains in the final owner checklist because it
requires the owner's configured search credential/endpoint. It must confirm:

1. a Tavily, SearXNG, or custom `web_search` that performs no `web_read` still
   creates one Library dossier and one tappable row per retained result;
2. the answer Sources chip and Library rows survive app reload;
3. Brave search results are not retained and the model is told to use
   `web_read`;
4. a forced/observed Library write failure leaves the search usable while
   stating that its evidence was not saved.

Fresh revalidation after the generated-Library discovery repair:

- 13 affected search/Library/controller files passed;
- 144/144 tests passed;
- generated source dossiers remain excluded from ambient injection but are
  now reachable by an explicit, untrusted `library_search`, matching the global
  Library contract.
