# P1 Chat-media / global-Library style execution ledger

Date: 2026-07-28
Subsystem: TALOS mobile UI
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED (automated); physical Android proof deferred to final owner checklist

Amendment 2026-07-28: compatibility inspection showed that
`talos-chat-media-open-<id>` is activated directly by existing unit tests and
must remain on the thumbnail button. Add the optional `openTestId` prop to the
shared row rather than moving that hook to the row container.

Amendment 2026-07-28 (owner follow-up): both Libraries must make every file
extension unambiguous in the icon region. Add one pure file-presentation
adapter and one shared glyph component; use them in the shared list row and in
the existing global grid. This expands the slice before any product edit.

Amendment 2026-07-28 (RED inspection): `library_view` is persisted and the
test environment currently opens `list`; the old test title saying the grid
was the default did not prove a grid contract. Rename that characterization
and add `contextScreen.test.ts::shows the shared file-type glyph in the
optional grid view`, which explicitly selects Grid before asserting PDF/image
format cues.

## Exact ownership

Create:

- `mobile/src/lib/libraryFilePresentation.ts`
- `mobile/src/components/talos/library/TalosMobileLibraryFileGlyph.vue`
- `mobile/src/components/talos/library/TalosMobileLibraryFileRow.vue`
- `mobile/tests/unit/lib/libraryFilePresentation.test.ts`
- `mobile/tests/unit/library/TalosMobileLibraryFileGlyph.test.ts`
- `mobile/tests/unit/library/TalosMobileLibraryFileRow.test.ts`
- `mobile/docs/superpowers/research/2026-07-28-p1-chat-media-library-style-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p1-chat-media-library-style-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p1-chat-media-library-style-ledger.md`

Modify:

- `mobile/src/screens/ContextScreen.vue`
- `mobile/src/components/chat/TalosMobileChatMediaPanel.vue`
- `mobile/tests/unit/chat/chatMediaPanel.test.ts`
- `mobile/tests/unit/screens/contextScreen.test.ts`
- `mobile/tests/e2e/mobile-chat-files.e2e.spec.ts`

Delete: none.

## Public symbols and compatibility

New public component:

- `TalosMobileLibraryFileRow`
- props: `file`, `thumbnailUrl`, `selectionMode`, `selected`, `openLabel`,
  `openTestId`, `testId`
- event: `open`
- slots: `meta`, `details`, `actions`
- `TalosMobileLibraryFileGlyph`
- props: `file`, `thumbnailUrl`, `variant`

New public TypeScript contract:

- `TalosLibraryFileIconKind`
- `TalosLibraryFilePresentation`
- `talosLibraryFilePresentation(displayName, mediaType)`

Stable compatibility:

- keep every existing `TalosMobileChatMediaPanel` prop and `close` / `open`
  event;
- keep `talos-chat-media-panel`, `talos-chat-media-scope`,
  `talos-chat-media-grid`, `talos-chat-media-open-<id>`,
  `talos-chat-media-share-<id>`, viewer, error, and empty IDs;
- keep all Library routes, settings values, vault schemas, and actions.

New private row hooks:

- `data-talos-library-row`
- `data-talos-library-thumbnail`
- `data-talos-library-name`
- `data-talos-library-file-glyph`
- `data-talos-library-extension`
- `data-talos-library-icon-kind`

## RED

Named unit regressions:

- `libraryFilePresentation.test.ts::classifies supported filename extensions into stable icon families`
- `libraryFilePresentation.test.ts::keeps the actual normalized extension as the visible label`
- `TalosMobileLibraryFileGlyph.test.ts::renders a distinct icon-kind hook and visible extension without a thumbnail`
- `TalosMobileLibraryFileGlyph.test.ts::keeps an image thumbnail and overlays its visible extension`
- `chatMediaPanel.test.ts::uses the same canonical Library row and filter-chip contract`
- `contextScreen.test.ts::uses the canonical Library row in list view`
- `contextScreen.test.ts::shows the shared file-type glyph in the optional grid view`
- `TalosMobileLibraryFileRow.test.ts::renders the shared thumbnail, name, metadata, details, and action slots`

The presentation/glyph tests fail because neither module exists. The surface
tests fail because no shared row/glyph hook exists and the chat collection still
has grid/card classes. The row component test fails to import before the
component exists.

Named realistic E2E regression added to the existing full file journey:

`mobile-chat-files.e2e.spec.ts::sends text and image evidence...`

After the same uploaded file is visible in both surfaces, compare:

- chat/global thumbnail width and height;
- chat/global filename computed font size;
- chat/global All-filter height;
- chat/global extension text and icon-kind hook for the same persisted file.

Expected RED: the chat preview is a large square and its filter/name are smaller
than the global Library equivalents.

RED commands:

```powershell
npm run test:unit -- tests/unit/library/TalosMobileLibraryFileRow.test.ts tests/unit/chat/chatMediaPanel.test.ts tests/unit/screens/contextScreen.test.ts
npx playwright test tests/e2e/mobile-chat-files.e2e.spec.ts --grep "sends text and image evidence"
```

## GREEN

- Add the shared semantic list row.
- Replace only the global Library list markup with that component.
- Replace only the per-chat card collection with the same component.
- Render a shared glyph/extension cue in both list surfaces and the existing
  global grid without changing open/select/attach/delete behavior.
- Align per-chat filter chips and header typography to Library tokens.
- Preserve all data, permissions, viewers, and actions.

Focused GREEN commands are the two RED commands above.

## Affected regression gates

```powershell
npm run test:unit -- tests/unit/lib/libraryFilePresentation.test.ts tests/unit/library/TalosMobileLibraryFileGlyph.test.ts tests/unit/library/TalosMobileLibraryFileRow.test.ts tests/unit/chat/chatMediaPanel.test.ts tests/unit/screens/contextScreen.test.ts tests/unit/lib/chatMediaFilter.test.ts tests/unit/lib/vaultLibrary.test.ts
npx playwright test tests/e2e/mobile-chat-files.e2e.spec.ts tests/e2e/mobile-shell.e2e.spec.ts
npm run typecheck
npm run build
git diff --check
```

## Real path, accessibility, rollback

- Real browser journey uploads bytes, sends them, reloads persisted chat,
  opens the populated chat media panel, then opens the global Library and
  compares rendered geometry, extension text, and icon family.
- Manual Android proof: open both surfaces at 320/390px, use TalkBack order,
  operate row/switch separately, rotate/reopen, verify no clipping, then switch
  the global Library between list/grid and inspect PDF, Office, image, code,
  structured-data, and unknown fixtures.
- Rollback is the scoped reversal of the shared component integration. No data
  rollback exists because persistence and schemas do not change.

## Upstream pin and decision

- Adopt IANA's registered media-type families as the classification fallback.
- Adapt them behind `talosLibraryFilePresentation`; filename suffix remains the
  user-visible source of truth when present.
- Retain existing `@lucide/vue@1.25.0` (ISC) and its current lockfile pin.
- Reject a second icon package, vendor-logo assets, and color-only format
  coding for compatibility, bundle, licensing, and accessibility reasons.

## Closure evidence

RED, observed before product implementation:

- the pure presentation, glyph, and row suites could not resolve their missing
  modules;
- chat collection had no `role=list`, shared rows, extension labels, or
  canonical chip sizing;
- global list/grid had no shared row/glyph hooks;
- 24 adjacent tests remained green, isolating the intended change.

Fresh GREEN:

- focused/affected unit suites: 7 files, 50 tests passed;
- `npm run typecheck`: passed;
- production `npm run build`: 3,210 modules transformed, parity 9/9, initial
  JavaScript 554,502 / 560,000 bytes and CSS 129,328 / 150,000 bytes;
- `mobile-chat-files.e2e.spec.ts` plus `mobile-shell.e2e.spec.ts`: 17/17 passed,
  including upload/send/reload, chat/global row geometry, icon kind, extension
  text, file reuse/revocation, 320px overflow, routing, and shell smoke;
- `git diff --check`: passed.

One preliminary E2E invocation served the pre-change `dist` because Playwright
uses `vite preview` without building. Its accessibility snapshot showed the old
two-column card markup, so it was discarded as stale-artifact evidence. After
the production build, the same test passed; no test assertion was weakened.

Physical Android/TalkBack, rotation, system font maximum, and representative
real-file visual inspection remain owner-manual gates in the final APK
checklist. No commit was created.
