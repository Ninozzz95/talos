# P0 — Streaming motion integrity research

Date: 2026-07-28  
Subsystem: TALOS UI / mobile chat  
Lane: `lane/kimi-mobile`

## Problem named from local evidence

The owner reported two human-visible failures in the tested APK:

1. the smooth fade remained laggy;
2. the typewriter effect appeared to overlap text that had already rendered.

The current lane already contains the larger architectural fixes added after
that APK: provider cadence is decoupled from paint cadence, markdown is rendered
block by block, the raw tail is kept outside the expensive markdown parse, and
finished messages do not replay the streaming block animation.

Fresh local inspection found two residual defects:

- `talosStreamInk` animates `filter: blur(1.6px)` on adjacent streaming
  fragments. Blur requires pixel painting and creates a visible halo across
  neighbouring glyphs, matching the reported “compenetration”;
- `.talos-stream-char` is declared after `.talos-stream-char--fade` at equal
  specificity. The later base animation therefore overrides the requested fade
  and sends Fade mode through the ink/blur keyframes too;
- an earlier `prefers-reduced-motion` block accidentally duplicates
  `talosStreamFade` and explicitly re-enables fade and an infinite trace pulse
  inside reduced-motion mode.

The focused pre-change suite is green (4 files, 37 tests), proving that these
visual contracts were not covered rather than that they were correct.

## Current primary and maintained upstream evidence

### Vercel AI SDK

- Official reference:
  https://ai-sdk.dev/docs/reference/ai-sdk-core/smooth-stream
- Registry pin inspected: `ai@7.0.40` (`latest` on 2026-07-28), Apache-2.0.
- `smoothStream` buffers and releases complete words by default; its default
  inter-chunk delay is 10 ms. Non-text stream parts pass through immediately.

Applicable decision: retain an AVM-owned, provider-neutral client smoother and
adapt the established “buffer then reveal complete units” contract. TALOS has a
Vue/Capacitor paint boundary and already owns adaptive backlog recovery,
grapheme safety, abort/finish flushing, and markdown-tail integration. Adding
the server-oriented AI SDK package would add bundle and protocol coupling
without replacing those product-specific responsibilities.

### Convex Agent

- Official reference:
  https://docs.convex.dev/agents/streaming
- Registry pin inspected: `@convex-dev/agent@0.6.4`,
  git `2ac74487d69462b6575e21526e09d52a9371c578`, Apache-2.0.
- `useSmoothText` smooths a growing text value and adapts its character rate to
  the observed arrival speed.

Applicable decision: retain the current TALOS adaptive rate implementation
behind `createTalosSmoothReveal`. It already follows this maintained pattern
without importing React-specific code. No upstream source is copied.

### Browser rendering performance

- Primary browser guidance:
  https://web.dev/articles/animations-guide
  https://web.dev/articles/animations-overview
- The rendering guidance limits high-frequency animation to compositor-friendly
  `opacity` and `transform`; blur is specifically identified as more expensive
  to paint.

Applicable decision: remove animated blur from the typewriter ink. Preserve the
light entrance treatment with opacity only. The fade mode is already
opacity-only; the block arrival may keep its bounded 2 px transform.

### Reduced motion

- Current reference:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
- The platform preference asks applications to remove or replace non-essential
  motion. Android 9+ exposes this through the system accessibility setting.

Applicable decision: the existing JS paths keep their immediate reveal. CSS
must not re-enable char fades or infinite pulses under the same preference.

## Competitor boundary

ChatGPT and Claude do not publish an authoritative implementation contract for
their glyph paint cadence. Reproducing claims from visual observation would be
unverifiable and brittle. The maintained, inspectable comparator set for this
slice is therefore Vercel AI SDK plus Convex Agent, with browser-platform
performance and accessibility guidance as the normative rendering boundary.

Assistant UI was inspected as a mature production chat surface
(https://github.com/assistant-ui/assistant-ui), but its public product overview
does not define a transferable glyph-animation algorithm. It is retained as a
later independent-review comparator, not treated as a source of facts it does
not publish.

## Upstream decision

**Adapt behind AVM-owned code.**

- Keep `createTalosSmoothReveal` and `useTalosTypewriterReveal`.
- Keep the current 40 ms Vue commit interval for fade: it is deliberately
  conservative for a mobile markdown DOM. Vercel's 10 ms transform runs at a
  different upstream boundary; Convex confirms adaptive client smoothing.
- Remove only the paint-heavy blur and the invalid reduced-motion duplication.
- Add source-contract coverage plus a DOM non-duplication regression.

No new package, protocol, permission, persistence change, or provider-specific
wire format is introduced.

## Follow-up: word-fragment and Unicode boundary failure

The first pass removed the paint/cascade defects, but R4 and the owner's
physical-device recording exposed a second, independent failure class: the
pure smoother emits the first few letters of a provider chunk before a word is
complete. Each incremental prefix becomes a separately fading inline span, so
the animation appears to render *inside* a word instead of at its end.

Fresh source inspection shows this is deterministic, not refresh-rate noise:

- `wordBoundary()` treats `target >= arrived.length` as permission to expose
  all arrived text, although a provider chunk boundary says nothing about a
  linguistic boundary;
- when no whitespace has arrived, `commit()` chooses the partial grapheme on
  purpose;
- the hand-written grapheme fallback covers surrogate pairs, some ZWJ cases,
  and one variation selector, but not the full Unicode extended-grapheme
  algorithm.

### Unicode Standard Annex #29

- Current normative reference:
  https://www.unicode.org/reports/tr29/
- Pin: Unicode 17.0.0, UAX #29 revision 47 (2025-08-17).
- Extended grapheme clusters are the user-perceived character unit and higher
  boundaries must not split them.
- The standard explicitly says reliable word segmentation for Chinese,
  Japanese, Thai, and Lao requires dictionary lookup or documented tailoring.

Applicable decision: use UAX29-C1-1 extended grapheme boundaries exactly, then
apply a documented TALOS word-reveal profile. Space-delimited scripts are
buffered until whitespace; Han, Hiragana, Katakana, Thai, Lao, Khmer, and
Myanmar text may advance by whole extended grapheme clusters so those languages
do not stall waiting for a delimiter they normally do not provide. Finish,
abort, and reduced-motion still expose the exact full source immediately.

### `unicode-segmenter`

- Maintained upstream:
  https://github.com/cometkim/unicode-segmenter
- Existing project pin: `unicode-segmenter@0.15.0`, MIT.
- The upstream identifies Unicode 17.0.0 / UAX #29 revision 47, validates
  against the official Unicode suite, and exposes the allocation-light
  `splitGraphemes()` generator from `unicode-segmenter/grapheme`.
- Its published minified grapheme entry is 4,876 bytes.

Applicable decision: adopt the already-pinned upstream directly rather than
extend TALOS's incomplete Unicode imitation. Because the initial JS budget has
less margin than that module, load `TalosMobileStreamingReply` through Vue's
existing async-component boundary. Vite's official dynamic-import contract
keeps the streaming engine and Unicode tables in their own production chunk.
No dependency or version change is needed.

### Upstream disposition

- **Adopt directly:** `unicode-segmenter@0.15.0` for extended grapheme
  segmentation.
- **Adapt behind AVM:** Vercel's complete-word buffering and Convex's adaptive
  cadence remain expressed by `createTalosSmoothReveal`.
- **Reject for this slice:** a CLDR/dictionary word breaker. It would add a
  materially larger locale/data surface merely to decide animation cadence;
  the documented per-grapheme tailoring for non-whitespace scripts preserves
  correct text and forward progress without claiming linguistic tokenization.

The exact source string remains unchanged. This affects only when a safe prefix
becomes visible and cannot issue tools, parse untrusted instructions, or cross
the markdown sanitizer boundary.

## Security, compatibility, and rollback

- No untrusted content gains a new DOM or tool path.
- The existing markdown sanitizer/render boundary is unchanged.
- Text content, copying, accessibility text, and stream ownership are unchanged.
- Rollback is the bounded CSS/comment/test patch in the P0 ledger; the adaptive
  streaming engine remains untouched.
