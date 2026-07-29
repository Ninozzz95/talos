# Execution ledger - P2-F Library filter parity

- Subsystem: TALOS mobile Library, chat media and agent read tools
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi/mobile`
- Branch: `lane/kimi-mobile`
- Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pin: no new runtime; current OpenAI Library, Google Drive, Apple
  Messages and W3C WCAG/APG contracts inspected 2026-07-29
- Decision: adapt the established mutually exclusive type-filter pattern behind
  one AVM-owned classifier.

## Exact file ownership

Create:

- `docs/superpowers/research/2026-07-29-p2-library-filter-parity-research.md`
- `docs/superpowers/specs/2026-07-29-p2-library-filter-parity-design.md`
- `docs/superpowers/ledgers/2026-07-29-p2-library-filter-parity-ledger.md`

Modify:

- `src/lib/vaultLibrary.ts`
- `src/screens/ContextScreen.vue`
- `src/components/chat/TalosMobileChatMediaPanel.vue`
- `src/lib/tools/readTools.ts`
- `src/lib/tools/toolset.ts`
- `tests/unit/lib/vaultLibrary.test.ts`
- `tests/unit/screens/contextScreen.test.ts`
- `tests/unit/chat/chatMediaPanel.test.ts`
- `tests/unit/tools/toolsetLibraryDiscovery.test.ts`

Delete: none.

## Public symbols

Add:

- `TalosLibraryFileType`
- `TalosLibrarySurfaceTab`
- `talosLibraryFileType(file)`
- `matchesTalosLibrarySurfaceTab(file, tab)`

Move with compatibility re-export:

- `TalosLibraryFileType` from `readTools.ts` to `vaultLibrary.ts`

Stable:

- vault schema and bytes;
- `parseVaultKind`, `filterLibraryFiles`, and `talosSavedLinkRows`;
- `TalosLibraryListEntry.fileType`;
- `library_list` input/output and `file_type=all`;
- both Library routes, copy/browser actions, labels and accessibility states.

## RED and GREEN

RED:

```powershell
npx vitest run tests/unit/screens/contextScreen.test.ts
```

Expected current failure: a `web_source` Markdown backing record is visible in
both All and Files instead of only through the Links projection.

Focused GREEN:

```powershell
npx vitest run tests/unit/lib/vaultLibrary.test.ts tests/unit/screens/contextScreen.test.ts tests/unit/chat/chatMediaPanel.test.ts tests/unit/tools/toolsetLibraryDiscovery.test.ts
npm run typecheck
```

Affected regression and integration gates:

```powershell
npx vitest run tests/unit/lib/chatMediaFilter.test.ts tests/unit/chat/savedLinkRows.test.ts tests/unit/chat/savedSourceLinks.test.ts tests/unit/tools/readTools.test.ts
npm run build
npx playwright test tests/e2e/mobile-chat-files.e2e.spec.ts
git diff --check
```

## Real-upstream and human proof

No new executable upstream exists. The real gate traverses repository summaries
through the actual toolset, global Vue screen and chat Vue panel, preserving the
canonical retained-link row.

On the final physical APK:

1. save or generate a web source;
2. verify it is absent from All, Images and Files in both Library scopes;
3. verify it appears once as a recognizable address in Links;
4. open the retained encrypted copy and live browser independently;
5. ask the agent to list links and verify the same item is typed `link`.

Manual proof is required before the Claude ACK ticket.

## Rollback

Restore only the shared classifier consumers and their tests. No persisted data,
permission, Android resource, dependency or migration changes.

## Closure evidence

Fresh 2026-07-29 evidence:

- RED: the global screen returned `[true, false, true]` membership for one
  source across `[All, Images, Files]`; 16 neighboring tests passed;
- focused canonical/UI/tool GREEN: 4 files, 60/60 tests;
- affected session/link/tool/export regressions: 7 files, 66/66 tests;
- `npm run typecheck`: passed;
- production build: 3,240 modules, initial JavaScript
  555,280/560,000 bytes, CSS 132,986/150,000 bytes, parity 9/9;
- real mobile chat-file Playwright journey: 3/3;
- `git diff --check`: exit 0 (line-ending notices only).

Physical global/chat tab inspection and natural-language `library_list` proof
remain intentionally open for the final owner checklist.

Status: **CLOSED**.

## Focused-GREEN amendment

The first focused run exposed that private `ContextScreen.isImage()` is also
used by the viewer and grid renderer, not only by the old filter predicate.
Removing it produced four existing-test failures and one unhandled rejection.
Keep the helper as a thin call to `talosLibraryFileType(file) === "image"` so
all existing consumers gain the canonical precedence without duplicating it.
The existing grid, touch-contract and retained-copy tests are the permanent
regression coverage; exact file ownership is unchanged.

The new tool assertion also matched `media type: image/jpeg` as a substring of
`type: image`. Tighten it to a complete output line; no product behavior or
ownership changes.
