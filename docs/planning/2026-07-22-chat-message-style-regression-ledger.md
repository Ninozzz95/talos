# Chat message-style regression ledger

Date: 2026-07-22
Status: implemented and verified; two unrelated pre-existing full-suite failures recorded
Subsystems: `control-plane`, `TALOS UI`
User-visible regressions: Settings rejects `message_style`; desktop assistant sections remain width-capped.

## Lane and file ownership

This is a coordinated API-boundary repair. The files are owned exactly as follows:

- Codex / control-plane backend:
  - modify `control-plane/app/Models/TalosWorkspaceSetting.php` in the isolated `lane/codex-message-style` worktree
  - modify `control-plane/tests/Feature/TalosSettingsApiTest.php` in the isolated `lane/codex-message-style` worktree
- Fable / TALOS desktop-web frontend:
  - modify `control-plane/resources/js/components/talos/workspace/TalosChatSurface.vue`
  - modify `control-plane/resources/js/components/talos/workspace/TalosChatSurface.messageStyle.test.ts`
  - modify `control-plane/tests/e2e/talos.e2e.spec.ts`
  - modify `docs/planning/2026-07-21-fe-work-order-fable.md`
- Coordination record:
  - create `docs/planning/2026-07-22-chat-message-style-regression-ledger.md`

No file is deleted. No mobile file is owned by this repair. Kimi's mobile lane is not edited. Full build and Playwright remain single-runner operations coordinated by Codex. The existing uncommitted dictation-driver slice in the Fable worktree is preserved and is outside this repair.

### Ledger amendment after environment inspection

The original physical path for the backend files was invalidated before backend GREEN verification:

- the Fable worktree's local `vendor` is a junction to main, whose generated Composer autoloader resolves `App\\...` from main and therefore cannot exercise backend edits stored only in Fable;
- the persistent `lane/codex-backend` worktree is clean but has two unique toolchain commits and diverges from current main, so a fast-forward is impossible; rewriting or merging that lane would exceed this repair and violate safe lane handling.

Backend ownership is therefore implemented in a new isolated worktree `C:/Users/ninox/Desktop/AVM-lanes/codex-message-style`, branch `lane/codex-message-style`, based exactly on current main `a476dc9`. It receives its own dependency autoloader. The temporary duplicate backend edits/tests used to prove RED in Fable are removed with a scoped patch; the Fable worktree retains only its owned UI/E2E/docs changes.

## Current contract and root cause

- Public JSON setting: `preferences.chat_layout.message_style`.
- Stable frontend type: `TalosMessageStyle = 'sections' | 'bubbles'`.
- Stable frontend sanitizer: `sanitizeTalosChatLayout()`.
- Existing backend boundaries to extend, without adding a new endpoint:
  - private constant `TalosWorkspaceSetting::CHAT_MESSAGE_STYLE_VALUES`
  - private method `TalosWorkspaceSetting::validateChatLayoutForWrite()`
  - private method `TalosWorkspaceSetting::sanitizeChatLayout()`
- Existing render boundary to retain: `messageSurfaceClass(message)`.

Root cause 1: the client legitimately submits `message_style`, but `validateChatLayoutForWrite()` has no matching allowed-key branch and emits `Unknown chat layout key.`; `sanitizeChatLayout()` would also discard the value on read/write sanitization.

Root cause 2: `.talos-message-bubble` applies `max-width: var(--talos-message-max-width, 760px)` to every message surface. The sections branch adds `width: 100%`, but the maximum-size constraint still caps assistant sections on wide desktop chat containers.

## Standards-first research dossier and upstream decision

Exact local pins:

- Laravel Framework `v13.18.1` from `control-plane/composer.lock`.
- `@playwright/test` and `playwright` `1.61.1` from `control-plane/package-lock.json`.
- CSS sizing contract: W3C CSS Box Sizing Module Level 3, section 3.1.3 (`max-width` constrains the maximum used width; initial value `none`).

Primary sources inspected on 2026-07-22:

- W3C CSS Box Sizing Level 3: https://www.w3.org/TR/css-sizing-3/
- Laravel 13 validation, nested/allowed array keys and 422 JSON errors: https://laravel.com/docs/13.x/validation
- Playwright screenshot capture: https://playwright.dev/docs/screenshots
- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots

Decision:

- Adapt the existing AVM-owned bounded settings adapter. Add the already-public frontend key and only its two canonical enum values at validation and sanitization boundaries. Do not introduce another package or a second settings contract.
- Adopt the CSS standard directly with a more specific `.talos-message-bubble.talos-message-section { max-width: none; }` override. Do not remove the global cap because user bubbles, bubble-mode assistant messages, browser tasks, and transient surfaces must remain bounded.
- Use Playwright 1.61.1 geometry assertions as the deterministic gate and attach 1920x1080 screenshots for human-visible proof. Do not add a host-dependent golden snapshot baseline for this targeted width contract.

Rejected alternatives:

- Removing the global `.talos-message-bubble` cap: rejected because it changes unrelated established bubble flows.
- Adding another frontend-only persistence key: rejected because Laravel is the product-state owner and the existing canonical API field is correct.
- Trusting the current mocked request-only E2E: rejected because its permissive mock cannot reproduce Laravel's allowlist failure.
- Relying only on a screenshot pixel diff: rejected because browser rendering varies by host; exact DOM geometry plus a reviewable screenshot gives stable and human-visible evidence.

## Lowest-level execution ledger

### RED backend scenarios

Test file: `control-plane/tests/Feature/TalosSettingsApiTest.php`.

Add `test_settings_persist_bounded_message_style_in_both_directions_and_reject_unknown_values`:

1. PATCH `message_style=bubbles`; expected failure before the fix: HTTP 422 at `preferences.chat_layout.message_style` with `Unknown chat layout key.`
2. PATCH `message_style=sections`; after GREEN, verify response and subsequent GET preserve `sections`.
3. PATCH an unsupported value; verify 422 and verify the last valid setting is unchanged.

Focused RED/GREEN command:

`php artisan test --filter=test_settings_persist_bounded_message_style_in_both_directions_and_reject_unknown_values`

### RED frontend source scenario

Test file: `control-plane/resources/js/components/talos/workspace/TalosChatSurface.messageStyle.test.ts`.

Strengthen `renders assistant answers as full-width sections when the preference is sections` to require a scoped selector combining `talos-message-bubble` and `talos-message-section` with `max-width: none`. Expected RED: selector absent while the global 760 px cap remains.

Focused RED/GREEN command:

`npm run test:unit -- TalosChatSurface.messageStyle.test.ts`

### RED real-browser desktop scenario

Test file: `control-plane/tests/e2e/talos.e2e.spec.ts`.

Add `desktop message-style sections persist visually at the full chat-container width`:

1. Chromium viewport exactly 1920x1080; skip the mobile project.
2. Install stateful API mocks with a persistent user+assistant exchange, `full_width_chat=true`, and `message_style=sections`.
3. Open the session and measure the assistant section against its `.talos-chat-message` parent.
4. Expected RED before the fix: section width remains at or below 760 px while the parent is materially wider.
5. After GREEN: the difference between parent and assistant section widths is at most one CSS pixel; computed `max-width` is `none`.
6. Switch Appearance from Sections to Bubbles, save, assert no `Unknown chat layout key.` error, and assert assistant surface is bounded.
7. Switch back to Sections, save, reload, reopen the session, and assert persistence plus full-width geometry.
8. Attach `message-style-bubbles-1920x1080.png`, `message-style-sections-1920x1080.png`, and a JSON geometry record to Playwright evidence.

Focused RED/GREEN command:

`npx playwright test tests/e2e/talos.e2e.spec.ts --project=chromium --workers=1 --grep "desktop message-style sections persist visually"`

### Product changes after RED

`control-plane/app/Models/TalosWorkspaceSetting.php`:

- add private `CHAT_MESSAGE_STYLE_VALUES` containing only `sections` and `bubbles`;
- validate `message_style` through `validateThemeEnum()` with a field-specific error;
- preserve a valid `message_style` in `sanitizeChatLayout()`.

`control-plane/resources/js/components/talos/workspace/TalosChatSurface.vue`:

- retain the existing global bubble cap;
- add the section-only scoped maximum-width override;
- do not change mobile breakpoints or unrelated message roles.

`docs/planning/2026-07-21-fe-work-order-fable.md`:

- amend item A and the closing audit with the backend persistence and desktop 1920x1080 visual-regression evidence; do not leave the visual gate described as open.

## Regression suites and completion gates

Focused:

- named Laravel feature test above;
- `TalosChatSurface.messageStyle.test.ts`;
- named Chromium 1920x1080 Playwright scenario above.

Affected regression suites:

- complete `TalosSettingsApiTest.php`;
- complete frontend Vitest suite;
- frontend production build and window chunk contract;
- human-journey TypeScript contract;
- `git diff --check`.

Real-upstream gate:

- Laravel v13.18.1 handles the actual PATCH/GET round trip in the feature test.
- Chromium driven by Playwright 1.61.1 computes the final CSS geometry and captures both UI states.

Human-visible proof:

- inspect both fresh 1920x1080 Playwright screenshots; Sections must reach the assistant message parent right edge, while Bubbles remains visibly bounded.
- verify no visible `Unknown chat layout key.` after both transitions and after reload.

Rollback:

- remove only the new backend enum/validation/sanitization branches and the section-specific CSS rule, together with their exact new assertions and ledger update.
- do not touch the pre-existing dictation-driver changes or any Kimi/mobile file.

## Discovered permanent regression scenarios

- `message_style` accepted by frontend but omitted at backend allowlist/sanitizer boundary.
- a semantic `width: 100%` UI branch silently defeated by an older shared `max-width` rule at desktop widths.
- a mocked E2E that asserts request shape without pairing it with a real backend round-trip contract.

## Recorded RED/GREEN evidence

- Backend RED: HTTP 422 with exact field `preferences.chat_layout.message_style` and message `Unknown chat layout key.`
- Frontend source RED: section-specific `max-width: none` selector absent.
- Chromium RED at 1920×1080: parent 1120 px, assistant section 760 px, right gap 360 px, computed `max-width: 760px`.
- Backend GREEN: focused message-style test 1/1, 11 assertions; complete `TalosSettingsApiTest.php` 74/74, 920 assertions.
- Backend cross-cutting GREEN: benchmark/evidence tests 15/15, 124 assertions, after the isolated lane was aligned to the repository-pinned PHP 8.5.8 runtime.
- Full Laravel suite: 1,445 tests; 1,440 passed, 3 skipped, 2 failed. Both failures (`TalosFileExtractionPipelineTest::test_required_ocr_fails_explicitly_when_capability_is_disabled` and `TalosModelCenterTest::test_dashboard_mounts_a_real_model_center_backed_by_profile_apis`) reproduce unchanged on the untouched main worktree and are outside this repair; no failure involves settings or message style.
- Frontend GREEN: focused message-style Vitest 4/4; complete Vitest 175/175 files, 1369/1369 tests.
- Production build GREEN; entry chunk 511.79 kB. Existing Rolldown third-party PURE-comment and chunk-size warnings remain warnings, not new failures.
- Chromium GREEN: Sections→Bubbles→Sections→reload 1/1; sections have right gap ≤1 CSS px and computed `max-width: none`; bubble mode remains more than 100 px narrower than the parent.
- Human-visible evidence: three fresh 1920×1080 screenshots attached to the Playwright report and visually inspected (initial Sections, bounded Bubbles, restored Sections).
