# Execution ledger - P0 tablet keyboard continuity and Settings detail

- Subsystem: TALOS mobile shell and Settings UI
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Upstream decision: adapt Capacitor Keyboard `8.0.5`, Android adaptive-layout
  guidance, and Tailwind's 768 px `md` contract in the AVM composable.
- Commit: forbidden without fresh explicit owner authorization.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p0-tablet-keyboard-settings-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-tablet-keyboard-settings-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-tablet-keyboard-settings-ledger.md`

Modify:

- `mobile/src/lib/tabletLayout.ts`
- `mobile/src/composables/useTalosTabletLayout.ts`
- `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
- `mobile/tests/unit/composables/useTalosTabletLayout.test.ts`
- `mobile/tests/unit/settings/TalosMobileSettingsCenter.test.ts`
- `mobile/tests/e2e/mobile-f6-tablet.e2e.spec.ts`

Delete: none.

## Symbols and compatibility contracts

- Preserve `TALOS_TABLET_MEDIA_QUERY` as the initial qualification query.
- Add public constant `TALOS_TABLET_WIDTH_MEDIA_QUERY`.
- Preserve public `TalosTabletLayout`, `useTalosTabletLayout()`, and
  `__resetTalosTabletLayoutForTests()`.
- Add private `hasQualified` and private `sync()` inside the composable
  singleton initialization.
- Preserve tablet sidebar width constants and clamping.
- Preserve Settings `activeTab`, `mobilePane`, `openDetail()`,
  `backToCategories()`, and phone sheet-navigation behavior.
- Add only responsive `md:block` to `settings-detail-pane`.

## RED scenarios

1. `P0 tablet keeps split view across a height-only resize while md width
   remains`
   - Expected current failure: `isTablet` flips false.
2. `P0 tablet exits when width drops below md`
   - Expected current failure: the composable does not observe a width-only
     continuity query.
3. `P0 tablet Settings exposes the initial active detail beside categories`
   - Expected current failure: detail section lacks `md:block`.
4. Playwright `keyboard-height resize keeps the persistent panel mounted`
   - Start 1024x768, shrink to 1024x420.
   - Expected current failure: panel and divider are removed.
5. Playwright `tablet Settings shows categories and Models detail immediately`
   - Expected current failure: detail is hidden.
6. Preserve existing Playwright `wide-but-short viewport has no panel`.

## GREEN edit

- Add the width-only query constant.
- Make tablet classification remember a valid qualification only while the
  window remains at `md` width.
- Add `md:block` to the detail pane.
- Do not change native keyboard configuration, App shell structure, sidebar,
  divider, Settings navigation state, or phone breakpoints.

## Commands

RED unit:

`npx vitest run tests/unit/composables/useTalosTabletLayout.test.ts tests/unit/settings/TalosMobileSettingsCenter.test.ts`

RED browser:

`npx playwright test tests/e2e/mobile-f6-tablet.e2e.spec.ts`

Focused GREEN:

`npx vitest run tests/unit/composables/useTalosTabletLayout.test.ts tests/unit/settings/TalosMobileSettingsCenter.test.ts tests/unit/lib/tabletLayout.test.ts tests/unit/shell/talosTabletDivider.test.ts`

`npx playwright test tests/e2e/mobile-f6-tablet.e2e.spec.ts`

Affected regression:

`npm run typecheck`

`npm run build`

`git diff --check`

## Real-upstream and human-visible gate

The browser resize test reproduces the documented WebView geometry change but
does not synthesize Android's IME. The final APK and the owner's physical
tablet keyboard checklist are therefore required acceptance evidence. That
manual gate is deferred to the single final build, before any Claude ACK
ticket.

## Rollback

Revert the six modified files and remove these three task documents. No
persisted setting or native state needs rollback.

## Closure record

Automated implementation slice: **CLOSED 2026-07-28**.

- RED unit: 2 files, 11 tests; 3 expected failures and 8 passes.
  - Height-only resize changed tablet to phone.
  - Width-only loss was not observed.
  - Settings detail lacked `md:block`.
- RED Playwright against the pre-fix production build: 2 expected failures,
  7 passes.
  - 1024x420 removed the divider.
  - Initial Models detail was hidden.
- Focused GREEN unit: 11/11 passed.
- `npm run build`: exit 0; 3203 modules transformed; initial JS
  551122/560000 bytes; initial CSS 129159/150000 bytes; parity 9/9 and ledger
  verification green.
- GREEN Playwright: 9/9 passed, including the new height-only transition,
  initial Settings detail, portrait phone, and permanent 915x412
  wide-but-short phone regression.
- Affected layout/Settings/divider unit regression: 4 files, 26/26 passed.
- `git diff --check`: exit 0.
- Native keyboard configuration, phone navigation flow, persisted sidebar
  width, data, and commits: unchanged.

Physical Android IME acceptance remains in the final one-APK owner checklist,
as declared before implementation. It does not reopen this automated slice and
must pass before any Claude ACK ticket is created.
