# Execution ledger - R7 global Library All includes saved links

Date: 2026-07-29
Subsystem: TALOS UI / global Library projection
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED - automated gates green; physical Android acceptance pending
Commit policy: no commit without fresh owner authorization
Upstream pins: OpenAI Library Help, Google Drive Search Help, Apple iPhone
Messages shared-content guide and W3C APG Button Pattern inspected 2026-07-29

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-library-all-links-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-library-all-links-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-library-all-links-ledger.md`
- `mobile/tests/e2e/mobile-library-all-links.e2e.spec.ts`

Modify:

- `mobile/src/lib/vaultLibrary.ts`
- `mobile/src/screens/ContextScreen.vue`
- `mobile/tests/unit/chat/savedLinkRows.test.ts`
- `mobile/tests/unit/screens/contextScreen.test.ts`
- `mobile/docs/upstream-provenance.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

Delete:

- none

## Public symbols and compatibility

- Add exported pure function
  `filterTalosSavedLinkRows(files, query): TalosSavedLinkRow[]`.
- Add internal computed values `allLinkRows`, `linkRows`,
  `logicalLibraryItemCount`, `renderedLinkRows` and
  `hasVisibleLibraryItems`.
- Preserve `TalosLibrarySurfaceTab`, `talosLibraryFileType`,
  `matchesTalosLibrarySurfaceTab`, `talosSavedLinkRows`, every Vault schema,
  route, translation key, file/link action, setting and repository method.
- Clarify that `matchesTalosLibrarySurfaceTab(..., "all")` is the non-link file
  branch; `ContextScreen` owns global aggregation with the link projection.
- Per-chat Library behavior remains out of scope and unchanged.

## Baseline

Fresh 2026-07-29:

```text
3 files passed
43 tests passed
```

The existing permanent `LIB-FILTER-PARITY-01` characterization confirms the
defect: a valid `web_source` is absent from `All`, `Images` and `Files`, and
appears only after activating `Links`.

## RED and expected failure

Add or strengthen these permanent scenarios before product code:

- `LIB-ALL-LINK-01`: mixed documents/images/sources render every logical item
  in `All`, with link rows but no source transcript tile;
- `LIB-ALL-LINK-02`: Images, Files and Links remain exact narrow projections;
- `LIB-ALL-LINK-03`: duplicate canonical URLs are one row owned by the newest
  copy, while a multi-link dossier projects all distinct rows;
- `LIB-ALL-LINK-04`: title, host, URL and retained-copy text search compose
  with both `All` and `Links`;
- `LIB-ALL-LINK-05`: logical header count excludes raw source rows and remains
  stable across chips;
- `LIB-ALL-LINK-06`: bulk file selection hides non-selectable saved-link rows
  and exiting restores them without changing selected file semantics;
- `LIB-ALL-LINK-E2E-01`: typo-tolerant natural-language web search produces
  saved links in default `All`, survives type/search changes and reload, and
  never exposes the backing Markdown tile.

Expected pre-fix failure: `All` contains zero
`[data-talos-saved-link-row]` elements, its raw count is inflated by source
records, and URL/title/host queries cannot discover a saved page.

Fresh RED evidence, 2026-07-29:

```text
2 files failed
5 tests failed, 28 passed
LIB-ALL-LINK-04 pure filter: filterTalosSavedLinkRows is not a function
LIB-ALL-LINK-01: expected 1 All link row, received 0
LIB-ALL-LINK-02/05: expected logical count 4, received raw count 3
LIB-ALL-LINK-04 mounted search: expected 1 All link row, received 0
LIB-ALL-LINK-06: expected 1 pre-selection All link row, received 0
```

The existing 28 scenarios stayed green. This isolates the missing inclusive
projection and link-aware search/count behavior without implicating file
rendering, existing Links-only actions or the Vault lifecycle.

The first real browser run then exposed a missing unit fixture detail: one
search dossier repeats every result URL in its retained text. Querying
`reuters.com` matched the Reuters row directly but also admitted its sibling
through that shared dossier body. The fixture was strengthened before changing
the helper:

```text
1 test failed, 12 skipped
LIB-ALL-LINK-04: expected [reuters.com], received [reuters.com, example.org]
```

`filterTalosSavedLinkRows` now applies deterministic precedence: visible row
identity (title, host, canonical URL) first; retained-copy filename/body only
when no row identity matches. This preserves dossier-content discovery without
turning a domain query into a non-narrowing filter.

## Focused GREEN and affected gates

```powershell
npx vitest run tests/unit/chat/savedLinkRows.test.ts tests/unit/lib/vaultLibrary.test.ts tests/unit/screens/contextScreen.test.ts
npx vitest run tests/unit/lib/librarySearchText.test.ts tests/unit/lib/libraryContext.test.ts tests/unit/tools/readTools.test.ts tests/unit/tools/toolsetLibraryDiscovery.test.ts
npx playwright test tests/e2e/mobile-library-all-links.e2e.spec.ts
npx playwright test tests/e2e/mobile-chat-files.e2e.spec.ts
npm run typecheck
npm run build
git diff --check
```

## Real-upstream and human-visible proof

The browser journey must use the real composer, OpenAI-compatible adapter,
tool-call loop, configured Tavily boundary, web-source archive, encrypted Vault
repository and global Library route. Only provider/search network responses are
deterministic Playwright routes; no UI or repository method is mocked.

On the final Android APK, ask a tool-capable model to research a topic with
multiple sources. Open the global Library and confirm `All` shows every saved
link alongside ordinary files, search by title/domain/URL, inspect the
type-specific chips, close/reopen the app and repeat.

Manual proof remains required before the Claude ACK ticket.

## GREEN evidence

Fresh 2026-07-29 results:

- focused saved-link/Vault/global-screen gate: 3 files, 48/48 tests passed;
- complete affected Library/search/tool/Vault/controller matrix: 12 files,
  176/176 tests passed;
- real `LIB-ALL-LINK-E2E-01` journey: 1/1 passed in 8.3 seconds, proving the
  typoed composer request, offered OpenAI-compatible `web_search` schema,
  two-round tool protocol, Tavily Bearer request, encrypted dossier save,
  inclusive default `All`, direct identity search, exact type filters and
  reload persistence;
- existing global file/media lifecycle browser suite: 3/3 passed, including
  upload, provider delivery, per-chat/global parity, export, revocation,
  deletion, unsupported picker recovery and 320px composer geometry;
- `npm run typecheck`: passed;
- `npm run build`: passed, including parity validation; initial JavaScript is
  558,115 / 560,000 bytes and initial CSS is 133,268 / 150,000 bytes;
- scoped `git diff --check`: passed, with line-ending notices only.

The first E2E attempt also corrected its own phone navigation: after configuring
Models, the test now uses the real contextual Back action to return to the
hidden category list before opening AI Defaults. No product assertion was
weakened.

Implementation changes only the global projection and pure search helper.
Vault rows, encrypted bytes, per-chat Library membership, URL safety, link
actions, file actions and repository contracts remain unchanged.

## Rollback

Restore only the two product/test files, the new E2E, provenance/plan entries
and three slice documents listed above. No Vault data, setting or migration
rollback is needed.
