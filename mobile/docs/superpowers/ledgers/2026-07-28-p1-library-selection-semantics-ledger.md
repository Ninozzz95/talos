# Execution ledger - P1-C2 Library row selection semantics

- Subsystem: TALOS mobile canonical Library row
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pin: W3C WAI-ARIA APG Button Pattern, inspected 2026-07-28
- Upstream decision: adopt stable accessible names and `aria-pressed` on every
  independently focusable button that performs the row selection toggle.

## Exact file ownership

Create:

- `mobile/docs/superpowers/ledgers/2026-07-28-p1-library-selection-semantics-ledger.md`

Modify:

- `mobile/src/components/talos/library/TalosMobileLibraryFileRow.vue`
- `mobile/tests/unit/library/TalosMobileLibraryFileRow.test.ts`
- `mobile/tests/e2e/mobile-chat-files.e2e.spec.ts`

Delete: none.

## Symbols and compatibility

Private DOM hook added:

- `data-talos-library-name-button`

Stable public props/emits:

- `file`
- `thumbnailUrl`
- `selectionMode`
- `selected`
- `openLabel`
- `openTestId`
- `testId`
- `open`

## Named RED scenarios

- `LIB-SELECT-01 selected thumbnail and filename both announce pressed`
- `LIB-SELECT-02 unselected thumbnail and filename both announce not pressed`
- `LIB-SELECT-03 normal open mode omits toggle state on both`
- `LIB-SELECT-04 filename activation emits the canonical open/select event`

## RED and GREEN command

`npx vitest run tests/unit/library/TalosMobileLibraryFileRow.test.ts`

Then:

`npx vitest run tests/unit/screens/contextScreen.test.ts tests/unit/chat/chatMediaPanel.test.ts`

`npm run typecheck`

`git diff --check -- mobile/src/components/talos/library/TalosMobileLibraryFileRow.vue mobile/tests/unit/library/TalosMobileLibraryFileRow.test.ts mobile/docs/superpowers/ledgers/2026-07-28-p1-library-selection-semantics-ledger.md`

## Human proof

TalkBack must announce the same stable Select label and pressed state on both
focus stops before and after selecting a real persisted file.

## Rollback

Remove the filename DOM hook and its ARIA bindings/tests. No state or data
migration.

## Closure record

P1-C1 closed on 2026-07-28 with 35/35 focused unit tests and 3/3 rendered
Playwright journeys green.

RED established on 2026-07-28:

- focused Vitest: 4 expected failures, 1 compatibility test passed;
- all four failures identified the missing filename-button hook and therefore
  could not observe its missing accessible name/state or activation.

Status: RED. Minimal product implementation may begin.

GREEN evidence on 2026-07-28:

- focused component Vitest: 5/5 tests passed;
- adjacent Context/Chat Media regressions: 34/34 tests passed;
- `npm run typecheck`: passed;
- scoped `git diff --check`: passed.

The filename control now exposes the same stable `openLabel` and conditional
`aria-pressed` value as the thumbnail, and retains the canonical `open` event.

Status: CLOSED. P1-C3 may begin.

## Full-gate amendment

The first complete post-P2 Playwright run passed 73/74 tests. The realistic
chat/Library journey failed before interaction because its thumbnail query used
the accessible name alone. P1-C2 intentionally gives the thumbnail and filename
the same stable name, so strict-mode Playwright correctly reported two matches.

The E2E ownership list is amended to include that journey. Its visual parity
checks now select the canonical `data-talos-library-thumbnail` hook plus the
accessible name in both Library surfaces. Product behavior is unchanged.

Status: REOPENED FOR E2E GATE. Focused and complete Playwright must pass before
P1-C2 returns to CLOSED.

Amendment evidence on 2026-07-28:

- focused chat/Library Playwright: 3/3 passed;
- complete Playwright suite: 74/74 passed;
- no product file changed for this amendment.

Status: CLOSED.
