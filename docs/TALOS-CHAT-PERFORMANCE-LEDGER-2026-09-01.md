# TALOS Chat performance ledger — 2026-09-01

## Scope and owner

Owner subsystem: TALOS mobile UI and local chat repository. User-visible defects:

1. the first chat open waits too long before the persisted conversation is usable;
2. the in-flight chat feels severely janky on the OnePlus 13.

The Fe/mobile contracts remain unchanged: `TalosChatRepository`,
`TalosStreamHandlers`, `TalosMobileMessageView`, and the durable message schema
are compatibility surfaces.

## Evidence and root-cause hypotheses

- `createChatStore.readSnapshot()` loads a 40-message page, then
  `loadMessageView()` issues `listMessageAttachments()` and
  `listMessageToolActivities()` for every row. The session-level activity query
  already exists, while the attachment-message-id query already exists; the
  current path therefore performs avoidable N+1 native bridge calls.
- `TalosMobileStreamingReply` schedules a DOM tail sync after every reveal update.
  `syncTail()` walks the rendered subtree with `querySelector`/`children` on every
  update. This is a repeated DOM read/write path during a growing message.
- The streaming message content is throttled to 110 ms, but block splitting still
  parses the complete growing Markdown document on each throttle tick. The
  existing block HTML cache prevents some renders but cannot avoid this split.

## Upstream research dossier and decision

- Vue official performance guidance recommends profiling, stable props, and
  `v-memo` for large/update-sensitive subtrees; adopt the existing Vue 3
  primitives and keep the change inside the component boundary:
  <https://vuejs.org/guide/best-practices/performance>
- Vue's directive reference documents that `v-memo` skips VNode creation and
  subtree diffing when dependencies are unchanged; retain it as a compatibility
  guard, not as a substitute for eliminating repeated parsing:
  <https://vuejs.org/api/built-in-directives>
- Android's current SQLite guidance says to read only necessary rows/columns,
  push work into SQLite, and use fewer/batched operations; adapt this principle
  through the existing repository API without changing the Fe contract:
  <https://developer.android.com/topic/performance/views/sqlite-performance-best-practices-views>
- Chrome's performance guidance identifies geometry reads after DOM writes as
  forced reflow/layout thrashing; use a frame-bounded tail synchronization and
  avoid repeated subtree walks:
  <https://developer.chrome.com/docs/performance/insights/forced-reflow>

Decision: adapt existing Vue/SQLite patterns behind AVM-owned helpers. No new
upstream dependency or protocol is needed; no Fe contract changes are allowed.

## Exact files and symbols

Implemented modifications:

- `mobile/src/stores/chat.ts`: private `loadMessageView` and new private
  `loadMessageViews` batching helper; `readSnapshot`, `selectSession`, and
  `loadOlderMessages` call sites. Public `createChatStore` and repository
  interfaces remain unchanged.
- `mobile/src/components/chat/TalosMobileStreamingReply.vue`: private tail-sync
  scheduler and lifecycle cleanup only; rendered output and accessibility
  contract remain unchanged.
- `mobile/scripts/verify-initial-chunk.mjs`: the existing startup tripwire is
  raised from 620,000 to 620,500 bytes only after the measured build increase
  is reviewed; the same static/dynamic boundary checks remain unchanged.
- `mobile/tests/unit/chat/chatStore.test.ts`: RED/GREEN regression proving a
  40-message restore uses the two session-level reads plus only attachment-bearing
  message reads, while preserving attachment/activity output.
- `mobile/src/lib/streamingTailScheduler.ts`: AVM-owned frame coalescing helper.
- `mobile/tests/unit/chat/streamingTailScheduler.test.ts`: RED/GREEN regression
  proving reveal bursts coalesce to one tail synchronization per animation frame.

No files are deleted or created outside this ledger row. No migration, public
schema, Fe contract, or generated APK is changed by the source fix itself.

## Verification gates

- RED: run the two named tests before implementation and observe the expected
  failure (extra repository reads / unbounded tail sync).
- GREEN: run the two focused Vitest files.
- Regression: `npm run typecheck`, `npm run test:unit -- tests/unit/chat/chatStore.test.ts tests/unit/chat/streamingUi.test.ts`,
  `npm run build`, and `git diff --check` from `mobile`.
- Real-upstream gate: install the resulting debug APK on the connected Android
  tablet for a smoke pass; OnePlus 13 remains an explicit hardware gate until it
  is physically connected. Do not claim OnePlus validation from the tablet.
- Human-visible proof: cold-open an existing 40-message chat, send a streamed
  answer, and capture first usable paint plus interaction/frame evidence at the
  representative mobile viewport.
- Failure/recovery: storage read failure still shows the existing controlled
  persistence error; stream cancellation still leaves the existing durable
  partial/interrupt semantics; reload restores attachments and browser activity.
- Rollback: revert only the files listed above; no data migration or persisted
  format change exists.

## Recorded verification (2026-09-01)

- Focused chat/performance suite: 67 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; initial JavaScript 620,325 bytes, CSS 216,802 bytes,
  parity ledger and harness sync passed. Existing Rollup/plugin warnings remain
  informational.
- `git diff --check`: passed.
- Android: `npx cap sync android` and `gradlew assembleDebug -PtalosSideBySide`
  passed (BUILD SUCCESSFUL, 51s). APK SHA-256:
  `3A6C18AE0CA79C4A99EA2A1AD1472060C56A3582376C71809987930A7685E122`.
- Artifact copied to `C:\Users\Antonino\Downloads\talos-chat-perf-fix-debug-2026-09-01.apk`
  (92,527,125 bytes) and installed successfully on Pad serial the owner's tablet as
  `ai.talos.dev`. The activity resumed and native SQLite/llama libraries loaded;
  no `FATAL EXCEPTION` appeared in the post-launch log sample.
- OnePlus 13 physical runtime/per-frame proof: **OPEN** (not connected).

The source fix removes the 40-row restore's per-message tool-activity calls and
coalesces streaming tail work to one animation frame. A per-message attachment
read remains only for rows listed by the existing session attachment index, so
the Fe repository and durable message contracts do not change.

## Pass 2 — scroll/render and loader regression (2026-09-01)

Status: active; harness plan frozen. This pass is limited to the mobile
worktree. Fe contracts remain unchanged.

### Evidence collected before edits

- Pad CDP reports `prefers-reduced-motion: false`; therefore the missing loader
  animation is not explained by the OS reduced-motion preference on the tested
  device. The loader was not present because the Pad was on the setup overlay;
  its source CSS still declares the infinite SVG sweep. A live-stream test must
  still pin the loader DOM and computed animation contract.
- Pad CDP reports `[data-testid=talos-motion-background]` with
  `data-performance-raf-active="true"` while the chat route is open. The
  procedural canvas therefore consumes a frame loop during chat scrolling even
  when the thread is the active surface.
- `ChatScreen.onChatScroll()` forwards every native scroll event directly to
  `createTalosChatLiveEdge().onScroll()`, which mutates two reactive refs. The
  scroll path has no frame coalescing.
- `TalosMobileStreamingReply` instantiates both reveal engines on every stream;
  only one result is rendered (`fade` or `typewriter`). The inactive engine can
  still own a requestAnimationFrame loop.
- `TalosMobileMessageList` renders every loaded row and has no update memo at
  the row boundary. The row subtree is large and parent updates can be caused by
  live-edge scroll state.

### Upstream research and decisions

- Adopt Vue's official `v-memo` guidance for the message-row boundary, with a
  complete dependency vector so message/state changes remain visible:
  <https://vuejs.org/guide/best-practices/performance>
- Adopt the documented browser containment option only after measuring support;
  `content-visibility:auto` preserves accessibility but needs an accurate
  intrinsic size and can shift scroll geometry, so it is not enabled blindly:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility>
- Adapt the existing frame scheduler for scroll and reveal work; no new
  dependency, protocol, schema, or Fe contract is introduced.

### Exact files/symbols for this pass

- `mobile/src/components/chat/TalosMobileStreamingReply.vue`: make only the
  selected reveal engine active; preserve `revealed`, caret, markdown, and
  accessibility output.
- `mobile/src/composables/useTalosTypewriterReveal.ts` and
  `mobile/src/composables/useTalosSmoothReveal.ts`: add an internal enabled
  boundary so inactive mode has no animation loop; public chat/store contracts
  are untouched.
- `mobile/src/screens/ChatScreen.vue`: coalesce `onChatScroll` handling to one
  frame while preserving older-page loading and live-edge semantics.
- `mobile/src/App.vue`: pause the procedural background while a non-empty chat
  thread is visible; retain the animated empty-chat presentation.
- `mobile/src/components/chat/TalosMobileMessageList.vue`: add a complete
  `v-memo` dependency vector at the `v-for` row boundary; no markup contract
  changes.
- `mobile/scripts/verify-initial-chunk.mjs`: measured gate amendment from
  620,500 to 621,500 bytes. The optimized entry measures 621,051 bytes; the
  726-byte delta buys frame coalescing, the message-row memo boundary and the
  chat-background pause signal. Dynamic import boundaries remain unchanged.
- `mobile/tests/unit/chat/streamingUi.test.ts` and new focused scheduler tests:
  RED/GREEN coverage for the loader, inactive reveal loop, and scroll/frame
  coalescing. Existing chat/store and Fe tests remain regression gates.

### Gates and rollback

- RED first: focused tests must fail for inactive reveal scheduling and the
  missing loader animation contract before implementation.
- GREEN: focused Vitest tests, then chat suite, typecheck, build, diff check.
- Runtime: rebuild/sync/install APK on Pad; verify computed loader animation,
  background `data-performance-raf-active`, and scroll interaction. OnePlus 13
  remains open until physically connected.
- Human-visible proof: loader animates in the waiting state; a long chat scrolls
  without background RAF competition or avoidable row updates.
- Rollback: revert only the exact files above; no persisted data or Fe contract
  changes are involved.

## Regression found and fixed before Pass 2 closed (2026-09-02)

Owner instruction on resuming: finish Pass 2, the chat is already smooth —
be careful not to make it worse. `tests/unit/chat/streamingUi.test.ts`
(`DEBT-MOBILE-003 RED: a streaming table never gets the prompt caret`) failed
1/18 on the Pass 2 working tree. Verified against clean `de2545c0` with a
reversible `git stash -u` / `git stash pop`: 18/18 pass at that commit, 1
failure with the uncommitted Pass 2 diff applied — a real regression, not a
pre-existing debt.

Root cause, found by temporary `console.error` instrumentation in
`ensureTail`/`syncTail`/the `parsedMarkdown` watcher (removed before this
commit, never shipped): `syncTail()` read
`target?.lastElementChild?.tagName` to decide whether the tail sits inside a
"structural" block (a table) that must never grow a caret. Once `ensureTail`
appends the tail `<span>` to `target`, that span itself becomes
`target.lastElementChild` on the FOLLOWING call — so the very next `syncTail`
read the tail's own tag instead of the real last content element, and a
table mid-row could read as non-structural for one frame. Pass 2's reveal
timing shifted which frame lands inside a test's `vi.waitFor` window often
enough to expose it; the flaw itself predates Pass 2 and was always latent
(`tailTarget()` already filters `tailHost` out the same way — `syncTail`'s
own `lastTag` read did not).

Fix: `syncTail()` now walks `target.children` from the end and skips
`tailHost` explicitly, the same filter `tailTarget()` already applies,
instead of trusting `lastElementChild` directly.

### Recorded verification (2026-09-02)

- `tests/unit/chat/streamingUi.test.ts`: 1/18 red on the Pass 2 tree before
  the fix; 18/18 green after, confirmed against a clean-HEAD stash
  comparison (AL CONTRARIO — same test, both states, not assumed).
- `npx vitest run tests/unit/chat tests/unit/theme`: 146 files / 1108 tests
  passed.
- `npx vitest run` (full mobile suite): 699 passed / 3 skipped test files,
  6845 passed / 10 skipped tests — no failures.
- `npm run typecheck`: passed (`vue-tsc -b --force`, no diagnostics).
- `npm run build`: passed. `initial_javascript_bytes: 621051` against the
  raised gate `621500` (449-byte margin, matches the measurement already
  recorded above); `initial_css_bytes: 216802` against `220000`.
  `verify:parity` and `sync:harness-ui-mobile` both green.
- Android: `npx cap sync android` + `gradlew installDebug -PtalosSideBySide`
  — BUILD SUCCESSFUL (1m 3s), installed on Pad serial the owner's tablet.
- Human-visible proof, tablet portrait (native 2400×3392, forced —
  `accelerometer_rotation` was 1 with the tablet physically lying in
  landscape; set to 0 with `user_rotation 0` for the verification, restored
  to 1 afterward): cold-opened the existing "Ciao bello" chat (real prior
  history, not empty), sent a live message that produces a wide 5-column
  streaming table plus a numbered explanation. Screenshots taken DURING the
  stream, not only at the end: the animated loader dots while waiting, the
  table streaming mid-row with the raw tail visible below it and no stray
  caret anywhere, the settled multi-section reply, and a scroll pass over
  the finished answer — no jank, no crash, no visual artifact. This is the
  exact DEBT-MOBILE-003 scenario (a table streaming in typewriter mode),
  exercised live, not only in Vitest's jsdom.
- OnePlus 13 physical runtime/per-frame proof: still **OPEN** (not
  connected this turn either) — unchanged from Pass 1.

Pass 2 is closed: the loader/RAF-pause/scroll-coalescing/row-memo work
described above, plus this regression and its fix, are all in the commit
that follows this ledger entry.
