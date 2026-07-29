# P0 — Streaming motion integrity ledger

Date: 2026-07-28  
Subsystem: TALOS UI  
Lane: `lane/kimi-mobile`  
Status: CLOSED (automated v2) — physical Android/video comparison remains an owner APK gate  
Commit policy: no commit without fresh owner authorization

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p0-streaming-motion-integrity-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-streaming-motion-integrity-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-streaming-motion-integrity-ledger.md`
- `mobile/tests/unit/chat/streamingMotionCss.test.ts`

Modify:

- `mobile/src/style.css`
- `mobile/src/composables/useTalosSmoothReveal.ts`
- `mobile/src/components/chat/TalosMobileStreamingReply.vue`
- `mobile/src/components/chat/TalosMobileMessageList.vue`
- `mobile/src/lib/chat/smoothReveal.ts`
- `mobile/tests/unit/chat/smoothReveal.test.ts`
- `mobile/tests/unit/chat/streamingUi.test.ts`
- `mobile/tests/unit/chat/TalosMobileMessageList.test.ts`
- `mobile/tests/unit/chat/streamingBelongsToItsChat.test.ts`
- `mobile/tests/unit/chat/chatTextScale.test.ts`

Delete:

- none

No other product file is owned by this slice. If inspection requires another
path, this ledger must be amended with a reason before that edit.

## Public and compatibility symbols

No new or removed public symbol.

Stable:

- `createTalosSmoothReveal`
- `useTalosSmoothReveal`
- `useTalosTypewriterReveal`
- `TALOS_COMMIT_INTERVAL_MS`
- streaming CSS class names listed in the design

## Upstream dossier and pin

Research:

- `mobile/docs/superpowers/research/2026-07-28-p0-streaming-motion-integrity-research.md`

Reference pins:

- `ai@7.0.40` — Apache-2.0
- `@convex-dev/agent@0.6.4`
  (`2ac74487d69462b6575e21526e09d52a9371c578`) — Apache-2.0
- `unicode-segmenter@0.15.0` — MIT, Unicode 17.0.0 / UAX #29 revision 47

Decision: adapt the established word-buffer/adaptive-reveal pattern behind
existing AVM-owned Vue/Capacitor code. Adopt the already-pinned
`unicode-segmenter/grapheme` entry directly for extended grapheme boundaries;
do not import either server/React streaming package.

## Reopened regression amendment

The independent R4 review and the owner's device recording exposed a behavior
that the first closure did not test: Fade can reveal a provider chunk in the
middle of its first word. Local tracing found two exact causes in
`smoothReveal.ts`:

1. `wordBoundary()` returns the full arrived buffer whenever the pacing target
   catches that buffer, even when the buffer ends mid-word;
2. before the first whitespace, `commit()` deliberately falls back from the
   missing word boundary to a partial grapheme.

`TalosMobileStreamingReply.appendChars()` then wraps each such partial delivery
in a separate fade span, making the animation visibly start between letters.

The owned paths were amended before product edits because the root cause is in
the pure reveal engine, and the standards implementation must be kept outside
the initial bundle by asynchronously loading the already-isolated streaming
subtree from `TalosMobileMessageList.vue`.

Regression amendment: the ownership test assumed two display frames were enough
to expose a partial first word. With complete-word buffering that timing is no
longer a valid characterization, so its positive case waits for the eventual
owned stream surface; the two negative ownership assertions remain immediate.
The font-scale unit test does not exercise message rendering; its mount helper
now stubs the three async content subtrees so Vitest cannot tear down an
unobserved dynamic import during a parallel suite.

New RED scenarios:

- `never reveals a partial first spaced-language word`
- `holds the partial next word across provider chunks`
- `keeps UAX #29 extended grapheme clusters atomic`
- `keeps the trailing grapheme provisional across provider chunks`
- `keeps progressing for scripts that do not use whitespace word separators`
- `Fade never paints a provider fragment before its word boundary`

Expected pre-fix result: the first two engine scenarios and the Fade DOM
scenario fail because `renderiz` becomes visible without a delimiter; the full
Unicode oracle exposes ZWJ/flag/combining/Indic boundaries not covered by the
surrogate-only assertion.

Observed RED:

```text
smoothReveal + streamingUi
2 files | 4 failed, 25 passed
- expected "" but received "renderiz"
- expected "fine " but received "fine par"
- unsafe boundary 1 for the family ZWJ grapheme
- Fade DOM exposed "renderiz" before a word boundary
```

## Reopened slice GREEN evidence

Focused:

```text
smoothReveal + streamingUi + TalosMobileMessageList
3 files | 37 tests passed
```

Affected regression:

```text
10 files | 79 tests passed
no unhandled Vitest errors
```

Static and production:

```text
npm run typecheck
PASS

npm run build
PASS — 3,224 modules
initial JS 547,505 / 560,000 bytes
initial CSS 129,477 / 150,000 bytes
unicode grapheme chunk 7,720 bytes
streaming reply chunk 9,640 bytes
parity ledger 9/9

mobile-f4-regressions.e2e.spec.ts
9 passed

git diff --check
PASS (line-ending notices only)
```

Root-cause closure:

1. pacing progress is independent from the committed visible cursor, so a held
   word continues accumulating without leaking letters or stalling;
2. provider chunk ends no longer count as word ends;
3. UAX #29 extended grapheme boundaries come from the pinned upstream;
4. the last non-delimited grapheme remains provisional across provider chunks;
5. scripts without whitespace word separators progress by whole graphemes;
6. the Unicode tables and streaming subtree are production code-split, leaving
   12,495 bytes of initial-JS budget headroom.

## RED

Command:

```powershell
npm run test:unit -- tests/unit/chat/streamingMotionCss.test.ts
```

Expected failures:

1. `talosStreamInk` contains animated `filter: blur(...)`;
2. the later base rule overrides the selected Fade animation;
3. reduced-motion CSS re-enables fade and infinite trace pulse;
4. `talosStreamFade` keyframes are duplicated.

Observed after correcting the test harness:

```text
tests/unit/chat/streamingMotionCss.test.ts
3 tests | 3 failed
- animated filter: blur(1.6px)
- fade and talosPulse active inside reduced motion
- two talosStreamFade keyframe definitions
```

The cascade-order scenario was discovered while tracing the first RED and was
added before product code was edited. Its expected failure is
`.talos-stream-char--fade` appearing before the equal-specificity base rule.

Final RED rerun:

```text
tests/unit/chat/streamingMotionCss.test.ts
4 tests | 4 failed
```

## GREEN

Focused:

```powershell
npm run test:unit -- tests/unit/chat/streamingMotionCss.test.ts tests/unit/chat/streamingUi.test.ts tests/unit/chat/smoothReveal.test.ts tests/unit/chat/typewriterReveal.test.ts tests/unit/chat/typewriterPacing.test.ts tests/unit/chat/markdownBlocks.test.ts tests/unit/chat/streamingBelongsToItsChat.test.ts
```

Affected regression:

```powershell
npm run test:unit -- tests/unit/chat/TalosMobileMessageList.test.ts tests/unit/chat/chatStoreStreaming.test.ts tests/unit/chat/chatTextScale.test.ts
npm run typecheck
npm run build
git diff --check
```

E2E gate:

```powershell
npx playwright test tests/e2e/mobile-f4-regressions.e2e.spec.ts
```

Ledger amendment (2026-07-28): the first invocation included
`--project=chromium`, copied from a different Playwright layout. This
repository's `playwright.config.ts` defines no named projects, so the runner
correctly rejected the command before executing any test. The corrected command
above uses the repository's single configured browser target.

The complete mobile unit/E2E/Android/build gates remain the single-runner final
program gate after P10 closes.

## Fresh GREEN evidence

```text
streamingMotionCss + streamingUi
2 files | 19 tests passed

streamingMotionCss + streamingUi + smoothReveal + typewriterReveal
+ typewriterPacing + markdownBlocks + streamingBelongsToItsChat
7 files | 53 tests passed

TalosMobileMessageList + chatStoreStreaming + chatTextScale
3 files | 20 tests passed

npm run typecheck
PASS

npm run build
PASS — 3,212 modules
initial JS 555,473 / 560,000 bytes
initial CSS 129,399 / 150,000 bytes
parity ledger PASS

mobile-f4-regressions.e2e.spec.ts
9 passed

git diff --check
PASS (line-ending notices only)
```

Implemented root-cause closure:

1. the Fade modifier now follows and overrides the base ink rule;
2. typewriter ink animates compositor-friendly opacity only;
3. the invalid nested reduced-motion copy was removed;
4. glyph, caret, trace, and typing animations settle under reduced motion;
5. a DOM regression proves parse catch-up does not duplicate painted text;
6. a component regression proves Fade has the fade class and no caret.

## Real-upstream gate

No dependency is added. The gate is conformance to the pinned documented
contracts: word/adaptive smoothing, compositor-safe glyph paint, and reduced
motion. A later independent review may reassess upstream versions after APK
delivery; it cannot silently change this implemented slice.

## Human-visible proof

Owner device checklist item:

1. stream a long answer in Typewriter;
2. repeat in Fade;
3. include paragraphs, a list, and a code block;
4. confirm no halo/overlap, no duplicate final text, no caret in Fade;
5. enable Android Remove animations and confirm immediate stable text;
6. finish/Stop and confirm the persisted answer does not replay an entrance.

## Rollback

Revert only the files listed under this ledger's exact ownership. No database,
native permission, provider adapter, or persisted data is involved.
