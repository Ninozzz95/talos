# P1 Library overflow and sharing-control execution ledger

Status: CLOSED — RED, focused GREEN, affected regressions, real-upstream E2E,
visual inspection, build, and diff hygiene all verified.

## Owned subsystem

TALOS mobile UI. No backend, desktop, Claude-session, or Git-history writes.

## Exact file ownership

Create:

1. `docs/superpowers/research/2026-07-29-p1-library-overflow-sharing-research.md`
2. `docs/superpowers/specs/2026-07-29-p1-library-overflow-sharing-design.md`
3. `docs/superpowers/ledgers/2026-07-29-p1-library-overflow-sharing-ledger.md`
4. `src/components/talos/library/TalosMobileLibraryActionsMenu.vue`
5. `tests/unit/library/TalosMobileLibraryActionsMenu.test.ts`

Modify:

6. `src/screens/ContextScreen.vue`
7. `src/components/chat/TalosMobileChatMediaPanel.vue`
8. `src/i18n/locales/en.ts`
9. `src/i18n/locales/it.ts`
10. `tests/unit/screens/contextScreen.test.ts`
11. `tests/unit/chat/chatMediaPanel.test.ts`
12. `tests/e2e/mobile-chat-files.e2e.spec.ts`

Delete: none.

If inspection requires another product file, this ledger must be amended with
the reason before that file is edited.

## Public compatibility symbols

- New component: `TalosMobileLibraryActionsMenu`.
- Public props: `label`, `testId`, `items`.
- Item fields: `id`, `label`, `ariaLabel`, `icon`, `disabled`, `tone`, `kind`,
  `checked`, `testId`.
- Public event: `select(id: string, checked?: boolean)`.
- Existing functions kept stable:
  `attachFile`, `saveFileToDevice`, `requestDelete`, `openFile`, `setShared`.
- Existing storage schema kept stable: `metadata.library_shared`.
- Existing UI test ids for viewer Save/Close remain stable.

## RED tests and expected failures

1. `TalosMobileLibraryActionsMenu.test.ts`
   - `LIB-MENU-01`: trigger is a 48 px menu button and opens a Reka menu.
   - `LIB-MENU-02`: ordinary item selection emits its stable action id.
   - `LIB-MENU-03`: a controlled checkbox exposes `menuitemcheckbox`, the
     correct checked state, and emits the requested boolean.
   - `LIB-MENU-04`: destructive and disabled states remain explicit.
   - Expected RED: component does not exist.
2. `contextScreen.test.ts`
   - `LIB-MENU-05`: global list has one file More trigger, not three inline
     controls, and menu actions call Attach/Save/Delete.
   - `LIB-MENU-06`: global grid exposes the identical action menu.
   - `LIB-MENU-07`: delete still requires confirmation.
   - Expected RED: current rows render inline buttons and grid exposes only Save.
3. `chatMediaPanel.test.ts`
   - `LIB-MENU-08`: per-chat row has one More trigger with Open, Save, and a
     controlled global-read checkbox.
   - `LIB-MENU-09`: current access state is visible beside metadata, not as a
     bottom native switch.
   - `LIB-MENU-10`: generated file exposes no fake checkbox.
   - `LIB-MENU-11`: failed persistence restores stored truth and concurrent
     files remain independently actionable.
   - Expected RED: current native switch is below the row and Save is inline.
4. `mobile-chat-files.e2e.spec.ts`
   - `LIB-MENU-12`: realistic per-chat and global-library More flows perform
     Save, permission change, Attach, and confirmed Delete; Escape restores
     focus; the 320 px viewport has no overflow.
   - Expected RED: selectors and UI contract do not exist.

## GREEN commands

Focused:

```powershell
npx vitest run tests/unit/library/TalosMobileLibraryActionsMenu.test.ts
npx vitest run tests/unit/screens/contextScreen.test.ts tests/unit/chat/chatMediaPanel.test.ts
npx playwright test tests/e2e/mobile-chat-files.e2e.spec.ts
```

Affected regression:

```powershell
npx vitest run tests/unit/library tests/unit/screens/contextScreen.test.ts tests/unit/chat/chatMediaPanel.test.ts tests/unit/lib/chatMediaFilter.test.ts tests/unit/services/vaultLibrarySharing.test.ts tests/unit/services/saveVaultFileToDevice.test.ts
npm run typecheck
npm run build
git diff --check
```

Cross-cutting closure is deferred to the final APK gate:

```powershell
npm test
npx cap sync android
Set-Location android
.\gradlew.bat testDebugUnitTest assembleDebug
```

## RED evidence

Fresh run on 2026-07-29:

```text
npx vitest run tests/unit/library/TalosMobileLibraryActionsMenu.test.ts \
  tests/unit/screens/contextScreen.test.ts \
  tests/unit/chat/chatMediaPanel.test.ts --reporter=verbose
exit 1
14 integration assertions failed on the absent talos-*-actions-* contract;
the new component suite could not resolve
TalosMobileLibraryActionsMenu.vue before it was created.
```

The rendered failure evidence showed the old three inline global controls and
the old per-chat Save button plus native bottom switch. No unrelated baseline
failure appeared in the focused run.

## GREEN evidence

Fresh runs on 2026-07-29:

```text
npx vitest run tests/unit/library/TalosMobileLibraryActionsMenu.test.ts
1 file, 4/4 passed

npx vitest run tests/unit/library/TalosMobileLibraryActionsMenu.test.ts \
  tests/unit/screens/contextScreen.test.ts \
  tests/unit/chat/chatMediaPanel.test.ts
3 files, 42/42 passed

npx vitest run tests/unit/library \
  tests/unit/screens/contextScreen.test.ts \
  tests/unit/chat/chatMediaPanel.test.ts \
  tests/unit/lib/chatMediaFilter.test.ts \
  tests/unit/services/vaultLibrarySharing.test.ts \
  tests/unit/services/saveVaultFileToDevice.test.ts
9 files, 73/73 passed

npm run typecheck
exit 0

npm run build
exit 0; 3238 modules transformed
initial JS 559301/560000 bytes
initial CSS 132986/150000 bytes
feature parity 9/9; ledger validation passed

npx playwright test tests/e2e/mobile-chat-files.e2e.spec.ts --reporter=line
3/3 passed in 29.2 seconds

git diff --check
exit 0
```

The first E2E attempt exposed a stale preview build and a stale accessible-name
selector (`All` instead of the shipped `Show All`). Rebuilding `dist` and
aligning the selector made the test exercise the real menu implementation.
A strict-selector collision between two legitimate shared-state labels was
resolved by scoping the assertion to the intended release row.

Visual captures were inspected at 390×844 and 320×568. That inspection exposed
truncated provenance competing with the access state on phones, so phone
layouts now preserve the complete access state and hide only redundant origin
prose. A final rebuilt E2E run verified the refined layout, viewport collision,
menu actions, persisted permission state, Escape focus return, and confirmed
delete path.

## Real-upstream gate

- Exercise the actual `reka-ui@2.10.1` components in mounted tests and
  Playwright; no mocked menu semantics.
- Assert menu roles, controlled checkbox state, keyboard Escape/focus return,
  collision-safe rendering, and 48 px targets.
- Exercise the real device-export boundary through the existing Playwright web
  download fallback and later the physical Android APK checklist.

## Human-visible proof

At 390×844 and 320×568:

1. Global grid and list each show one More trigger per file.
2. More exposes Attach, Save, Delete and keeps delete confirmation.
3. Per-chat rows show compact AI access state next to provenance.
4. More exposes Open, Save, and a checkable global-read action only for
   uploaded files.
5. Menus stay within the viewport; keyboard/Back/Escape dismiss safely.

## Rollback

Remove the new menu component and test, restore the existing inline action slots
and native checkbox, revert only the new locale keys and this slice’s test
changes. Storage, repository, export, attach, open, and delete implementations
remain untouched.
