# Execution ledger - P1-C1 Library 48dp touch targets

- Subsystem: TALOS mobile Library UI
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pin: Android accessibility guidance, inspected 2026-07-28
- Upstream decision: adopt the Android 48x48dp recommendation locally in both
  Library surfaces; reject a shared app-wide Button rewrite.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p1-library-accessibility-export-test-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p1-library-accessibility-export-test-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p1-library-touch-targets-ledger.md`

Modify:

- `mobile/src/components/talos/library/TalosMobileLibraryFileRow.vue`
- `mobile/src/components/chat/TalosMobileChatMediaPanel.vue`
- `mobile/src/screens/ContextScreen.vue`
- `mobile/tests/unit/library/TalosMobileLibraryFileRow.test.ts`
- `mobile/tests/unit/chat/chatMediaPanel.test.ts`
- `mobile/tests/unit/screens/contextScreen.test.ts`
- `mobile/tests/e2e/mobile-chat-files.e2e.spec.ts`

Delete: none.

## Symbols and compatibility

No public TypeScript/Vue symbol changes.

Stable:

- all props/emits/test IDs;
- `TalosMobileLibraryFileRow`;
- `TalosMobileChatMediaPanel`;
- `ContextScreen`;
- file open/save/attach/delete/filter/switch behavior.

## Named RED scenarios

- `LIB-TOUCH-01 chat close and viewer actions are at least 48x48`
- `LIB-TOUCH-02 chat filters, row actions, filename, and switch target are 48`
- `LIB-TOUCH-03 global options/filter/search/menu/list/grid actions are 48`
- `LIB-TOUCH-04 global overlay and document-viewer actions are 48`
- `LIB-TOUCH-05 both surfaces remain overflow-free at 320px`

Current expected failure: representative controls render at 36px or 44px.

## RED command

`npx vitest run tests/unit/library/TalosMobileLibraryFileRow.test.ts tests/unit/chat/chatMediaPanel.test.ts tests/unit/screens/contextScreen.test.ts`

The final rendered-geometry RED is:

`npx playwright test tests/e2e/mobile-chat-files.e2e.spec.ts`

## GREEN and regression gates

Repeat RED commands, then:

`npm run typecheck`

`git diff --check -- mobile/src/components/talos/library/TalosMobileLibraryFileRow.vue mobile/src/components/chat/TalosMobileChatMediaPanel.vue mobile/src/screens/ContextScreen.vue mobile/tests/unit/library/TalosMobileLibraryFileRow.test.ts mobile/tests/unit/chat/chatMediaPanel.test.ts mobile/tests/unit/screens/contextScreen.test.ts mobile/tests/e2e/mobile-chat-files.e2e.spec.ts`

Final pre-APK closure repeats complete unit/build/E2E gates.

## Real-upstream and human proof

Playwright supplies real CSS geometry. The final owner checklist adds Android
Accessibility Scanner/TalkBack on the physical APK.

## Rollback

Restore only the explicit Library utility classes and their tests. Do not alter
the shared Button primitive.

## Closure record

RED established on 2026-07-28.

- Unit gate: 4 expected failures, 31 compatibility tests passed.
- The canonical filename button had no 48px minimum; chat filters were 44px,
  chat close/viewer actions were 36px, and representative global controls were
  44px.
- Rendered Playwright gate: the main realistic journey failed on the first
  measured chat close control at exactly 36px; the other two spec journeys
  passed.

Status: RED. Product implementation may now begin.

First GREEN attempt: 34/35 unit tests passed. The remaining test assumption was
invalid because the established Library view mode is persisted and may start in
List. The gate was amended to select Grid explicitly before checking its save
target, then select List explicitly before checking row actions. No product
path changed.

First rendered GREEN attempt: the 36px controls were repaired, but Playwright
measured the short `All` chip at 43.453125px wide. `LIB-TOUCH-02/03` were
amended to require both `min-h-12` and `min-w-12` on filter chips, matching the
Android 48x48 contract rather than height alone.

Second rendered GREEN attempt exposed a gate-timing issue rather than a product
geometry defect: the Library menu's documented 150ms enter transition starts at
`scale(0.95)`, so an immediate sample measured the otherwise-48px List item at
45.6px. The Playwright geometry helper now polls until the rendered target
settles at or above 48px; it still fails any permanently undersized control.

Final evidence on 2026-07-28:

- focused Vitest: 3 files, 35/35 tests passed;
- rendered Playwright: 3/3 journeys passed, including the 320px viewport;
- `npm run typecheck`: passed;
- latest production build: passed, 3,213 modules transformed, initial JS
  555,484/560,000 bytes and CSS 129,354/150,000 bytes;
- scoped `git diff --check`: passed (line-ending notices only).

Status: CLOSED. P1-C2 may begin.
