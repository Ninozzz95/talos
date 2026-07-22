# Composer Dictation Driver — Design and Execution Ledger

## Approved requirement and ownership

The composer microphone control sits immediately to the right of Prompt Enhancer. The acceptance gate records audio through Chromium `getUserMedia()` and `MediaRecorder`, driven by Playwright, rather than replacing either browser API with JavaScript test doubles.

The user's 2026-07-22 instruction selects and approves this design, requests uninterrupted execution, and hands this exact desktop/web slice to `lane/fable-frontend`. Kimi/mobile and backend files remain excluded. The user subsequently gave explicit authorization to commit and integrate this slice after all gates pass.

Owned files:

- `control-plane/resources/js/components/talos/chat/TalosSlimComposer.vue`
- `control-plane/resources/js/components/talos/chat/TalosSlimComposer.dictation.test.ts`
- `control-plane/tests/e2e/talos.e2e.spec.ts`
- `control-plane/playwright.dictation.config.ts`
- `control-plane/package.json`
- `control-plane/tests/e2e/helpers/talosPlaywrightServer.ts`
- `control-plane/scripts/playwright-server-config.test.mjs`
- `docs/planning/2026-07-21-fe-work-order-fable.md`
- `docs/planning/2026-07-22-composer-dictation-driver-ledger.md`

No dependency, migration, route, schema, production public symbol, or physical microphone change is permitted. Existing `toggleDictation`, `dictationStatus`, `dictationSupported`, `toggleDictation` event, and `data-testid="talos-composer-dictate"` remain stable. Test-harness symbols are the default Playwright configuration, existing `createTalosPlaywrightWebServer()`, and new `resolveTalosPlaywrightPhpBin()`; the latter keeps provider/runtime discovery out of the product application.

## Design and alternatives

`TalosSlimComposer.vue` keeps the existing dictation control and event contract, but moves the control from the left capability cluster to the right action cluster immediately after Prompt Enhancer. No dictation-engine or persistence behavior changes.

The dedicated Playwright configuration grants only its test context the `microphone` permission and starts the Playwright-pinned Chromium with its maintained fake media device. The application still calls production `navigator.mediaDevices.getUserMedia({ audio: true })`, constructs the native `MediaRecorder`, receives a native encoded audio `Blob`, and submits it through the production server-whisper adapter. Because the STT worker endpoint does not exist yet, the test intercepts only `/api/talos/stt/transcribe`, measures the real multipart request, and returns the complete current response shape.

Alternatives:

1. Source-only ordering test: retained as a fast focused gate, rejected as final acceptance because it cannot prove visible placement or audio capture.
2. JavaScript `MediaRecorder` shim: retained only in composable unit tests, rejected for browser acceptance because it tests a double.
3. Playwright plus Chromium fake microphone: adopted because it is deterministic and exercises the product's browser recording stack.

The dedicated project never selects the operator's physical microphone and persists no captured audio artifact. Existing permission-error, cancel, stream-release, transcribing, and idle contracts remain unchanged.

## Upstream research dossier and exact pins

- W3C Media Capture and Streams, latest published version inspected 2026-07-22 (`https://www.w3.org/TR/mediacapture-streams/`): `getUserMedia({audio:true})`, secure-context permission, live audio track, and explicit track stop. Adopt directly through the existing composable.
- W3C MediaStream Recording, latest published version inspected 2026-07-22 (`https://www.w3.org/TR/mediastream-recording/`): native `MediaRecorder.start()`, `stop()`, and `dataavailable` Blob. Adopt directly; no AVM imitation.
- Playwright official `BrowserContext.grantPermissions` and `BrowserType.launch` references inspected 2026-07-22 (`https://playwright.dev/docs/api/class-browsercontext#browser-context-grant-permissions`, `https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-args`): adopt context `microphone` permission and `launchOptions.args`; retain package-lock pin `@playwright/test` 1.61.1 (Apache-2.0).
- Playwright official web-server reference inspected 2026-07-22 (`https://playwright.dev/docs/test-webserver`): adopt the supported `webServer.env` boundary for an explicit testing-only Laravel `APP_KEY`; do not copy or expose a developer `.env` secret.
- Node.js v26.5.0 `child_process.execFileSync()` reference inspected 2026-07-22 (`https://nodejs.org/api/child_process.html#child_processexecfilesyncfile-args-options`): adapt its shell-free argv API with `windowsHide: true` only for `git rev-parse --git-common-dir` runtime discovery; never interpolate untrusted input into that discovery call.
- Laravel encryption reference inspected 2026-07-22 (`https://laravel.com/docs/11.x/encryption#configuration`, still the current documented `APP_KEY` contract linked from Laravel 13 documentation): adopt a valid 32-byte base64 test key only under the explicit Playwright `APP_ENV=testing` server environment. Production and developer keys remain untouched.
- Chromium maintained sources inspected 2026-07-22 (`https://chromium.googlesource.com/chromium/src/+/lkgr/media/base/media_switches.cc`, `https://chromium.googlesource.com/chromium/src/+/lkgr/content/public/common/content_switches.cc`): `use-fake-device-for-media-stream` replaces camera/microphone and `use-fake-ui-for-media-stream` selects the default test device. Adapt only in Playwright-bundled Chromium 149.0.7827.55 revision 1228 (BSD-style license); production is unaffected.
- Rejected: Web Audio-generated shims and a locally invented recorder contract because the browser standards and maintained Chromium driver already provide the required behavior.

## RED evidence

- `places the mic after the prompt enhancer in source order`: failed with `enhancerIndex === -1`, proving the missing enhancer anchor/order; exact visual adjacency remains owned by the browser geometry assertion.
- `dictation driver records browser audio from the mic immediately right of prompt enhancer`: failed because `talos-composer-enhance` was absent before the product edit.
- Linked-worktree bootstrap required the verified primary repo-local PHP runtime, ignored `APP_KEY` loaded into process memory without printing it, and a local vendor junction. These are ignored setup state, not source changes.
- Fresh clean-lane rerun exposed two permanent harness regressions: the Windows default assumed every worktree had its own `../.tools/bin/php.cmd`, then Laravel returned `MissingAppKeyException` when the linked worktree had no `.env`. The first attempt failed before server start; the second started PHP 8.5.8 but Playwright timed out after 120 seconds while readiness probes received HTTP 500.

### Bootstrap remediation RED/GREEN ledger

Modify `control-plane/scripts/playwright-server-config.test.mjs` first with these named RED scenarios:

1. `Playwright PHP resolver falls back from a missing worktree toolchain to the primary git-common-dir toolchain`: expected RED because `resolveTalosPlaywrightPhpBin()` does not exist and the current default is a blind relative string.
2. `Playwright web server provides a deterministic testing APP_KEY when the caller has none`: expected RED because `config.env.APP_KEY` is currently absent.
3. Extend `Playwright web server uses the selected PHP runtime and disables OPcache for the built-in test server` to prove an explicit caller `APP_KEY` remains unchanged.
4. `Playwright PHP resolver rejects shell metacharacters in explicit and derived runtime paths`: expected RED for metacharacters not covered by the current quote/newline-only guard.

Then modify `control-plane/tests/e2e/helpers/talosPlaywrightServer.ts`:

- add exported `resolveTalosPlaywrightPhpBin()` with injectable filesystem/git-common-dir dependencies for deterministic tests;
- add private `readGitCommonDirectory()` using `execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])` without a shell;
- prefer explicit `TALOS_E2E_PHP_BIN`, then the worktree `.tools`, then the primary repository `.tools`; fail immediately with an actionable error when Windows has no compatible repository runtime;
- add a deterministic 32-byte base64 `TALOS_E2E_APP_KEY` used only when `process.env.APP_KEY` is empty and always pass the selected key through `webServer.env`;
- preserve the existing `createTalosPlaywrightWebServer(baseURL, reuseExistingServer)` call contract and all browser-action environment behavior.

Focused RED/GREEN command: `npm run test:playwright-server-config`.

Affected gates: focused composer Vitest, production build, `npm run test:e2e:dictation-driver` from the linked worktree without manually loading `APP_KEY`, human-journey types, full Vitest, and `git diff --check`.

Rollback: remove only the resolver/test-key branches and their four exact assertions; the old explicit `TALOS_E2E_PHP_BIN` override remains the emergency compatibility route.

## GREEN implementation and evidence

- [x] Add `data-testid="talos-composer-enhance"` to Prompt Enhancer.
- [x] Move the unchanged mic Tooltip/button immediately after Prompt Enhancer.
- [x] Focused Vitest: 2 files, 7 tests passed.
- [x] Playwright web-server bootstrap: 6/6 Node tests passed, covering primary-worktree PHP fallback, deterministic 32-byte testing `APP_KEY`, explicit overrides, unsafe path rejection, config-cache removal, and serialized shared-database policy.
- [x] Playwright Chromium media-driver gate: 1 test passed; same-row/right-hand geometry, native `recording`, multipart content type, audio body greater than 1,024 bytes, transcript insertion, final `idle`; success artifacts include cropped composer PNG and JSON capture evidence.
- [x] Full `npm run test:unit`: 175 files, 1,369 tests passed.
- [x] `npm run test:window-chunks`: production build and 4/4 chunk contracts passed; entry chunk 511.79 kB.
- [x] Fresh final `npm run test:e2e:dictation-driver` after bootstrap remediation: production build and Chromium media-driver gate 1/1 passed without manually loading `APP_KEY`; fresh composer screenshot inspected.
- [x] `npm run test:human-journey:types`, `git diff --check`, and exact lane status inspection passed; only the nine declared Fable-lane files are changed, `main` is clean, and Kimi's pre-existing mobile work is untouched.

## Human-visible proof, failure coverage, and rollback

Proof uses the fixed Desktop Chrome viewport: Enhancer then Mic on the same row with no more than an 8 px gap, real browser recording state, non-empty multipart audio, transcript in the composer, and final idle state. Existing unit coverage retains permission-denied behavior and stream cleanup; visible error/cancel/retry remain separately open in work-order D. Reload is exercised before capture to load the cloud-mode preference; the test server/database are recreated per existing Playwright policy. Mobile parity remains excluded because Kimi owns mobile.

Rollback: move the unchanged mic block back to the left capability cluster, remove the enhancer test id, dedicated Playwright config/script/test, and this ledger entry. No data or schema rollback is required.

## Ledger amendment

The initial design/plan paths under `docs/superpowers/` were invalidated during inspection because `.gitignore` excludes new content there. Before closure, both ignored drafts were removed and consolidated here under the repository's tracked `docs/planning/` convention. Product scope and acceptance behavior did not change.
