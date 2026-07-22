# TALOS Dictation Lifecycle and Permission UX - Design and Execution Ledger

## Scope, subsystem, lane, and exact ownership

This slice closes two related frontend regressions:

- `DICTATION-PERMISSION-001`: the browser can wait for or reject microphone permission without sufficiently local, actionable composer feedback.
- `DICTATION-LIFECYCLE-001`: cancellation does not invalidate an unresolved `getUserMedia()` request or an in-flight transcription, and workspace disposal does not release every late resource.
- `DICTATION-BUNDLE-001`: the current permission patch raises the initial application chunk from 511,791 bytes on `main` to 513,591 bytes, above the strict 512,000-byte contract.

Subsystem: `TALOS UI`. Owner: `lane/fable-frontend`. The slice does not edit Kimi/mobile-lane files, backend, core, validator, dependencies, persistence, routes, or shared server policy.

Exact file ownership:

- create `docs/planning/2026-07-22-dictation-permission-ledger.md`;
- create `control-plane/resources/js/lib/talosDictationCapture.ts`;
- create `control-plane/resources/js/lib/talosDictationCapture.test.ts`;
- create `control-plane/resources/js/lib/talosDictationRuntime.ts`;
- create `control-plane/resources/js/components/talos/chat/TalosDictationStatus.vue`;
- create `control-plane/resources/js/components/talos/chat/TalosDictationStatus.test.ts`;
- create `control-plane/resources/js/components/talos/chat/TalosDictationButton.vue`;
- modify `control-plane/resources/js/composables/useTalosDictation.ts`;
- modify `control-plane/resources/js/composables/useTalosDictation.test.ts`;
- modify `control-plane/resources/js/components/talos/workspace/TalosWorkspace.vue`;
- modify `control-plane/resources/js/components/talos/workspace/TalosComposerDock.vue`;
- modify `control-plane/resources/js/components/talos/chat/TalosSlimComposer.vue`;
- modify `control-plane/resources/js/components/talos/chat/TalosSlimComposer.dictation.test.ts`;
- modify `control-plane/tests/e2e/talos.e2e.spec.ts`;
- modify `control-plane/playwright.dictation.config.ts`.

No file is deleted and no dependency is added.

Public and compatibility symbols:

- preserve `TalosDictationStatus`, including `idle`, `requesting`, `recording`, `transcribing`, and `error`;
- preserve every existing `useTalosDictation()` return key and the compatibility `toggle()` behavior;
- add `dispose()` to `useTalosDictation()` for deterministic workspace teardown;
- add the lazy-module exports `TalosDictationCaptureSession`, `requestTalosDictationCapture()`, and `talosMediaCaptureErrorMessage()`;
- add the lazy-module exports `TalosDictationRuntime`, `TalosDictationRuntimeHooks`, and `createTalosDictationRuntime()`;
- preserve `TalosSlimComposer`'s `toggleDictation` event and `data-testid="talos-composer-dictate"`;
- add `dictationError`, `finishDictation`, `cancelDictation`, and `retryDictation` UI contracts through `TalosSlimComposer` and `TalosComposerDock`;
- add the read-only `recordingStartedAt` and `resolvedMode` state returned by `useTalosDictation()` and forwarded through the composer boundary;
- add the internal async `TalosDictationStatus` component contract with `status`, `error`, `recordingStartedAt`, and `resolvedMode` props plus `finish`, `cancel`, and `retry` events;
- add the internal async `TalosDictationButton` component contract with `status` and `supported` props plus the compatibility `toggle` event;
- keep the microphone immediately after Prompt Enhancer in source and visual order.

No schema, migration, route, API, or persistence contract changes.

## Approved product behavior and visual contract

The user approved the compact one-up design on 2026-07-22.

| State | Human-visible composer behavior | Available action | Data behavior |
| --- | --- | --- | --- |
| `idle` | Mic button beside Prompt Enhancer | Start dictation | No audio retained |
| `requesting` | Compact inline status: waiting for browser microphone permission | Cancel | A late stream is immediately stopped and ignored |
| `recording` | Compact local-recording status with elapsed `mm:ss` timer | Finish and transcribe; Cancel | Finish creates one blob; Cancel discards chunks |
| `transcribing` | Compact local/cloud transcription status | Cancel | Late results after cancellation are ignored |
| `error` | Compact precise error with local recovery | Retry | Prompt remains unchanged |

The transcript is inserted as editable composer text and is never sent automatically. Cancellation never changes the prompt. Progress uses `role="status"`/polite live semantics; only errors use `role="alert"`. Controls retain visible keyboard focus, meet at least the WCAG 2.2 24-by-24 CSS-pixel minimum on desktop, and target 44 by 44 CSS pixels on touch/mobile. The status row belongs inside the composer card so it cannot create the prior full-width floating banner or a detached desktop layout.

## Blocking standards and competitor research dossier

Research was performed after local root-cause inspection and before this implementation plan. Pages without immutable releases are pinned by canonical URL plus inspection date `2026-07-22`.

### Normative browser and accessibility sources

- W3C Media Capture and Streams, Candidate Recommendation Draft `09 October 2025`, immutable pin `https://www.w3.org/TR/2025/CRD-mediacapture-streams-20251009/`: adopt `getUserMedia({ audio: true })`, user-agent permission ownership, named rejection semantics, and immediate track release.
- W3C MediaStream Recording, Working Draft `16 March 2026`, immutable pin `https://www.w3.org/TR/2026/WD-mediastream-recording-20260316/`: adopt `MediaRecorder.start()`, `stop()`, `dataavailable`, MIME capability queries, and a final `Blob`.
- WCAG 2.2 stable criteria `2.4.7 Focus Visible`, `2.5.8 Target Size (Minimum)`, `2.5.5 Target Size (Enhanced)`, and `4.1.3 Status Messages`, inspected `2026-07-22`: adopt visible focus, 24-pixel minimum targets, 44-pixel touch targets, polite status announcements, and alerts only for urgent errors.

### Current competitor product patterns

- OpenAI Voice Dictation FAQ, canonical pin `https://help.openai.com/en/articles/12168547-voice-dictation-faq`, inspected `2026-07-22`: adopt microphone entry from the composer and editable transcription before send. Reject remote-audio retention semantics for TALOS local mode.
- OpenAI Voice Mode FAQ, canonical pin `https://help.openai.com/en/articles/8400625-voice-mode`, inspected `2026-07-22`: adopt the separation between single-shot dictation and live voice; reject presenting this slice as a live conversation feature.
- Claude Mobile Dictation, canonical pin `https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile`, inspected `2026-07-22`: adopt mic placement on the right of the chat input, explicit send after transcription, cancel-without-send, and post-transcription audio disposal.
- Gemini Live in Chrome, canonical pin `https://support.google.com/gemini/answer/16363185?hl=en`, inspected `2026-07-22`: adapt explicit permission recovery, interruption, and return-to-text patterns. Reject its live-voice surface because TALOS is implementing dictation.

### Maintained repository upstream pins

- `@playwright/test` is lockfile-pinned to `1.61.1`, including its Chromium revision. Adapt Chromium's maintained fake-device and permission-denial switches only in the isolated acceptance config.
- `@huggingface/transformers` resolves to `4.2.0`. Preserve the existing lazy browser-Whisper integration; no new speech implementation or package is introduced.

Upstream decision: **adopt** the W3C APIs directly, **adapt** established composer, cancellation, retry, editable-text, and accessible-status patterns behind TALOS-owned Vue/composable contracts, and **reject** a custom permission protocol, a pre-permission modal, live-voice semantics, auto-send, and remote audio persistence for local mode.

## Selected architecture and rejected alternatives

`useTalosDictation()` remains the Vue state owner. A lazy TALOS runtime owns capture/transcription operations and uses a monotonically increasing operation revision to fence every async boundary. `cancel()` and `dispose()` invalidate the loader and runtime revisions before releasing local resources, so unresolved permission or transcription results cannot resurrect the state or modify the prompt.

Native capture moves behind the dynamic `talosDictationCapture.ts` boundary. `requestTalosDictationCapture()` requests the real browser stream and returns an owned session with `finish()` and `cancel()`. `finish()` resolves exactly once with the recorder blob and releases every track; `cancel()` discards chunks and releases every track. Capture error classification lives in the same lazy chunk. This directly addresses `DICTATION-BUNDLE-001` without deferring the whole composer.

Ledger amendment after the initial capture GREEN: the approved status row contains timer behavior, state copy, action labels, and state icons while the known entry budget has only 2,209 bytes of headroom. `TalosDictationStatus.vue` is therefore loaded through `defineAsyncComponent()` only when dictation leaves `idle`. The row remains visually inside `TalosSlimComposer`, but its implementation joins the on-demand dictation closure. This amendment avoids a fragile string-minification workaround and keeps the always-visible composer static.

Second ledger amendment after the first strict chunk rerun: the normal production build passed, but the contract measured 513,526 bytes, still 1,526 bytes above its immutable threshold. Capture strings and status UI are already dynamic; inspection therefore identifies the remaining static dictation state machine and transcription fault mapping in `useTalosDictation.ts`. They move to `talosDictationRuntime.ts`, statically importing capture and STT only inside that dynamic closure. The Vue composable retains public refs, mode persistence, immediate `requesting` feedback, loader cancellation, and compatibility methods. This is the smallest boundary that removes behavior rather than deleting UX or changing the gate.

Third ledger amendment after the runtime split: the strict contract improved to 512,214 bytes but remained 214 bytes above threshold. A 214-byte pass would also leave no safe evolution margin. The mic's state-dependent tooltip, ARIA copy, icon branch, and styling therefore move to async `TalosDictationButton.vue`. Its placeholder occupies the same right-side control slot after Prompt Enhancer, while all user-visible semantics remain intact. The threshold and copy remain unchanged.

Fourth ledger amendment after independent read-only review: recorder failures can occur before the user presses Finish, and real `MediaRecorder.stop()` queues its final events. The capture contract therefore gains an immediate `onError` hook, an attached rejection observer, and a `stopRequested` fence so repeated Finish calls await the same queued completion. The Vue boundary also exposes the real recording start timestamp and the resolved local/cloud destination. The visible timer is excluded from the polite live region, and the async mic component receives stable loading/error fallbacks. Permission-retry E2E instrumentation may count calls only by forwarding to the untouched native `getUserMedia`; the native implementation and result remain authoritative.

Rejected alternatives:

- Shortening strings or deleting accessibility copy would create fragile byte headroom without fixing lifecycle races.
- Lazy-loading the whole composer would save more bytes but expands interaction and layout risk beyond this slice.
- An app-owned permission modal cannot grant browser permission and adds a redundant click.
- The Permissions API reports state but cannot replace `getUserMedia()` as the authoritative access boundary.
- A single overloaded mic control does not make Finish versus Discard unambiguous.

## RED tests and expected failures

1. `cancels an unresolved permission request and releases the late stream`: currently fails because `cancel()` returns to idle but the late promise creates a recorder and sets `recording`.
2. `ignores a transcription result after cancellation`: currently fails because a late transcriber result updates the prompt.
3. `releases the active microphone when disposed`: currently fails because no public disposal boundary exists.
4. `finishes exactly once and releases every media track`: new capture adapter contract; absent before implementation.
5. `cancels without returning recorded chunks`: new capture adapter contract; absent before implementation.
6. `renders separate finish, cancel, and retry actions with accessible status semantics`: currently fails because the async status component is absent, the mic is overloaded, and the error is a detached dock alert.
7. `dictation driver records browser audio, exposes recording state, and returns editable text without sending`: amended E2E fails until the new Finish action is wired.
8. `dictation cancellation discards audio and keeps the existing prompt`: new E2E fails until cancel is wired end to end.
9. `dictation permission denial remains compact, visible, and retryable`: amended denial E2E fails until the inline status design replaces the detached alert.
10. `initial app chunk remains below 512000 bytes`: currently fails at 513,591 bytes.
11. `waits for queued recorder data when Finish is pressed twice`: fails if a second Finish settles an empty blob while native stop events are queued.
12. `surfaces a recorder failure before Finish without an unhandled rejection`: fails if `MediaRecorder.onerror` only rejects a promise that no consumer has attached yet.
13. `keeps the elapsed timer outside the live status region`: fails if the polite atomic region re-announces every timer tick.
14. `derives elapsed time from the real recording start timestamp`: fails if background-tab throttling makes an incrementing counter lose elapsed time.
15. `shows the engine actually selected by auto mode`: fails if local fallback is displayed as generic or cloud merely because the configured mode is `auto`.
16. `permission denial Retry invokes native capture again`: fails if the error remains visible without a second forwarded call to native `getUserMedia`.
17. `maps TALOS_STT_UNSUPPORTED_FORMAT to actionable copy`: fails if this known control-plane fault collapses to a generic message.
18. `keeps the async microphone slot stable while loading or failed`: fails if its chunk causes layout shift or silently removes the control.

Permanent characterization `DICTATION-NO-DEVICE-001`: `NotFoundError` must remain a visible, retryable instruction to connect or enable a microphone. This reproduces the user's real no-device environment even though the behavior was already correct when the ledger was expanded.

Focused RED/GREEN commands from `control-plane`:

- `npx vitest run resources/js/lib/talosDictationCapture.test.ts resources/js/composables/useTalosDictation.test.ts resources/js/components/talos/chat/TalosDictationStatus.test.ts resources/js/components/talos/chat/TalosSlimComposer.dictation.test.ts`;
- `npm run build` followed by `npm run test:window-chunks`;
- `npx playwright test --config=playwright.dictation.config.ts --workers=1`.

## Regression suites and real-upstream gates

After focused GREEN:

- `npm run test:unit`;
- `npm run build`;
- `npm run test:window-chunks`;
- full dedicated granted/denied Chromium dictation projects with one shared runner;
- `git diff --check` from the Fable worktree.

The real-upstream browser gate keeps native `navigator.mediaDevices.getUserMedia`, native `MediaRecorder`, multipart STT upload in cloud test mode, the lockfile-pinned Chromium fake audio device, and the maintained denial switch. Retry-count instrumentation, when used, is a transparent forwarding wrapper around the original bound native `getUserMedia`; it neither fabricates nor changes its result.

## Human-visible proof matrix

Capture and inspect browser screenshots at:

- desktop `1920x1080`: mic alignment, compact status containment, timer, Finish/Cancel/Retry, prompt-editability, no detached right-side space, and no horizontal overflow;
- mobile `390x844`: 44-pixel touch targets, wrapping without clipping, safe-area placement, and no horizontal overflow;
- permission denial: precise local error and retry;
- recording: active indicator plus Finish and Cancel;
- transcription completion: editable text present and no chat POST;
- cancellation: previous prompt unchanged and no STT request.

Keyboard verification covers Tab focus order and activation of mic, Finish, Cancel, and Retry. Reduced-motion verification requires no essential meaning to depend on pulse/spinner animation. Reload must return to idle with no retained stream or audio.

## Rollback

Rollback removes the lazy capture module/tests, operation revision/disposal additions, separate UI events/status row, and the new E2E scenarios, then restores the prior mic toggle and permission alert. No data migration or backend rollback is required. The pre-slice files are recoverable from the lane diff; no user changes may be discarded wholesale.

## Execution evidence

- [x] Local root cause and existing patch inspected.
- [x] Standards and competitor UI research completed and pinned above.
- [x] User approved the compact one-up design.
- [x] Existing focused unit tests previously passed: 2 files, 9 tests.
- [x] Existing granted/denied Chromium gates previously passed: 2 tests.
- [x] Initial lifecycle and capture RED tests captured.
- [x] Initial focused GREEN tests passed before independent review: 4 files, 18 tests.
- [x] Initial full unit suite passed before the added `NotFoundError` characterization: 177 files, 1380 tests.
- [x] Initial production build passed.
- [x] Initial strict chunk contract passed before independent review: entry chunk 483,900 bytes; limit 512,000.
- [x] Initial desktop and mobile visual evidence captured and inspected at 1920x1080 and 390x844.
- [x] Independent read-only review completed; eight new permanent regression scenarios recorded above.
- [x] Review follow-up RED captured: 11 expected failures plus two recorder unhandled rejections before the fixes.
- [x] Review follow-up focused suite passes: 4 files, 27 tests.
- [x] Review follow-up full unit suite passes: 177 files, 1389 tests.
- [x] Focused TypeScript check for capture, runtime, and composable passes.
- [x] Review follow-up production build passes: 3016 modules transformed.
- [x] Review follow-up strict chunk contract passes: 4 tests; entry chunk 485,466 bytes against the 512,000-byte limit.
- [x] Review follow-up native Chromium gate passes: 3 tests covering fake-device capture, cancel/discard, denial, native retry count, keyboard operation, effective cloud destination, editable transcript, and no auto-send.
- [x] Review follow-up visual evidence captured and inspected at desktop 1920x1080, mobile 390x844, and desktop permission denial; no clipping or horizontal overflow was observed.
- [x] Independent follow-up review found no residual blocker in the eight review scenarios.
- [x] Reversible localhost deployment verified: `talos` is healthy, `talos-queue` is running, both use image `localhost/talos-app:dictation-final-20260722`, `/readyz` is healthy, and the container manifest serves `assets/app-B3Vz10-c.js`.
- [x] Final diff and whitespace gates pass.

The production build retains two upstream warnings: Rolldown ignores misplaced `PURE` annotations in `@vueuse/core`, and the separately lazy `transformers.web` chunk is above Vite's 500 kB warning. Neither warning affects the passing initial-entry contract. An ad hoc repository-wide `tsc --noEmit` is not a project gate and still reports existing declaration/alias failures in upstream Transformers, Reka, motion-v6, and unrelated Vue files; the focused changed TypeScript boundary passes.

This slice is not complete while any unchecked gate remains.
