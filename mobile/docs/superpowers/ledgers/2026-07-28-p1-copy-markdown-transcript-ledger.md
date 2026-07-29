# Execution ledger - P1 copy Markdown transcript

- Subsystem: TALOS mobile session export UI
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pins:
  - `@capacitor/clipboard@8.0.1`
  - Capacitor Clipboard v8 docs, inspected 2026-07-28
  - W3C Clipboard API Working Draft 2026-06-24
  - Android copy/paste guidance, inspected 2026-07-28
- Upstream decision: adopt the pinned Capacitor write through the existing
  AVM-owned adapter; reject automatic/legacy clipboard paths.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p1-copy-markdown-transcript-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p1-copy-markdown-transcript-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p1-copy-markdown-transcript-ledger.md`
- `mobile/tests/unit/chat/TalosMobileSessionExportSheet.test.ts`

Modify:

- `mobile/src/components/chat/TalosMobileSessionExportSheet.vue`
- `mobile/tests/e2e/mobile-f4-regressions.e2e.spec.ts`

Delete: none.

## Public symbols and compatibility

Create: none.

Private component symbols to add:

- `copyingMarkdown`
- `markdownCopied`
- `copyStatus`
- `copyMarkdownTranscript()`

Stable:

- `buildTalosMobileMarkdownExport(...)`
- `writeTalosClipboardText(...)`
- `deliverTalosSessionExport(...)`
- all four `TalosMobileSessionExportFormat` values
- Share / Save and Save to Library behavior

## Named RED scenarios

- `COPY-MD-01 exact generated preview is copied`
  - Expected failure: no copy action exists.
- `COPY-MD-02 copy is Markdown-only`
  - Expected failure: no conditional action exists.
- `COPY-MD-03 resolved write produces accessible success`
  - Expected failure: no copy status exists.
- `COPY-MD-04 rejected write stays usable and actionable`
  - Expected failure: no copy error path exists.
- `COPY-MD-05 real browser clipboard matches the visible transcript`
  - Expected failure: E2E cannot find the requested action.

## RED commands

Focused:

`npx vitest run tests/unit/chat/TalosMobileSessionExportSheet.test.ts tests/unit/chat/sessionExport.test.ts tests/unit/services/clipboard.test.ts`

Human-visible:

`npx playwright test tests/e2e/mobile-f4-regressions.e2e.spec.ts --grep "#16"`

## GREEN and regression gates

- Repeat both RED commands.
- `npm run typecheck`
- `npm run build`
- `git diff --check`

At final pre-APK closure, rerun the controlled full unit suite and the complete
affected export/thread E2E journeys.

## Real-upstream and human proof

The final APK checklist generates a Markdown transcript containing multiline
Markdown and reasoning, taps Copy, pastes into an external editor, and compares
the pasted start/end and line structure with the preview. It also verifies that
denying/unavailable clipboard access leaves Share / Save usable.

## Closure record

RED established on 2026-07-28.

- Focused command: the 11 existing formatter/clipboard tests passed; both new
  sheet tests failed exactly because
  `[aria-label="Copy Markdown transcript"]` does not exist.
- Human-visible command: the journey configured a real mocked provider,
  generated and rendered the Markdown preview, then timed out exactly while
  waiting for the missing `Copy Markdown transcript` button.

Implementation completed on 2026-07-28.

## GREEN evidence

- Focused unit/compatibility gate:
  - 3 files passed; 13/13 tests passed.
  - The clipboard mock receives the exact `textContent` of the generated
    preview, including multiline Markdown and quoted reasoning.
  - The action is absent before generation and after selecting JSON.
  - A `NotAllowedError` fixture produces only the controlled alert and leaves
    Share / Save enabled.
- Human-visible Playwright gate:
  - `#16` passed in 7.7 seconds.
  - Chromium granted real clipboard read/write permission, generated the
    transcript through the final app UI, copied it from the new button, observed
    the polite success status, and read back content byte-equivalent after
    newline normalization.
- Fresh `npm run typecheck`: passed.
- Fresh `npm run build`: passed.
  - 3,204 modules transformed.
  - Initial JavaScript: 554,336 / 560,000 bytes.
  - Initial CSS: 129,159 / 150,000 bytes.
  - Export sheet remains an async chunk.
  - Parity verifier: 9/9 script tests passed and ledger valid.
- Scoped `git diff --check`: exit 0.

Automated status: **CLOSED**.

The physical Android clipboard/paste comparison remains in the final owner
checklist; no new permission, provider request, or storage write is required.
