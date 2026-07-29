# P0 — Streaming motion integrity design

Date: 2026-07-28  
Status: approved by the owner's autonomous P-series instruction; implementation
remains serial and uncommitted.

## User-visible contract

### Typewriter

- Text reveal remains paced independently of provider chunk boundaries.
- Newly painted fragments enter with opacity only.
- No blur, shadow, positional offset, or layout-affecting property is animated
  on glyph fragments.
- The caret remains the typewriter activity indicator.

### Fade

- Text remains adaptively buffered and released at the existing mobile-safe
  commit cadence.
- A provider chunk boundary is never treated as a word boundary.
- For space-delimited scripts, no partial word is visible: the first word and
  every subsequent word wait for their trailing whitespace.
- Scripts that conventionally omit word-separating whitespace advance only at
  Unicode extended-grapheme boundaries; they must not stall until completion.
- Emoji ZWJ sequences, flags, keycaps, combining sequences, and Indic conjuncts
  are indivisible paint units.
- The trailing grapheme of a non-whitespace provider chunk remains provisional
  until another grapheme, a delimiter, completion, or abort makes it stable.
- Newly painted fragments use opacity only.
- The fade modifier is declared after the base ink rule so it wins at equal
  specificity without `!important`.
- Fade mode never creates the typewriter caret.

### Markdown and final handoff

- The parsed prefix and raw tail must concatenate to the exact streamed source:
  no duplicated, missing, or reordered text across a parse refresh.
- Finished messages use the normal message body and never replay the
  streaming-only block entrance.

### Reduced motion

- Both reveal composables continue to expose arrived text immediately.
- Character fade/typewriter animations, caret blink, trace pulse, and typing
  pulse are disabled.
- Visible text stays at final opacity; no accessibility preference may hide it.

## Architecture and stable symbols

No public class, composable, function, schema, route, event, or persistence
contract changes.

Compatibility symbols that remain stable:

- `createTalosSmoothReveal`
- `useTalosSmoothReveal`
- `useTalosTypewriterReveal`
- `TALOS_COMMIT_INTERVAL_MS`
- `.talos-stream-char`
- `.talos-stream-char--fade`
- `.talos-stream-caret`
- `.talos-streaming-body`

Implementation boundary:

- `createTalosSmoothReveal` synchronously consumes the pinned
  `unicode-segmenter/grapheme` implementation;
- `TalosMobileStreamingReply` is loaded through Vue `defineAsyncComponent` from
  the message list, keeping the Unicode tables out of the initial bundle;
- loading the isolated subtree changes no persisted state or chat ownership,
  and the component still reads the canonical controller store directly.

## Test design

RED:

- `streamingMotionCss.test.ts::typewriter ink is compositor-safe and never
  animates blur`
- `streamingMotionCss.test.ts::reduced motion disables every streaming glyph
  and activity animation`
- `streamingMotionCss.test.ts::defines the fade keyframes exactly once`
- `streamingMotionCss.test.ts::the fade modifier wins over the base ink
  animation in the cascade`

Characterization/regression:

- `streamingUi.test.ts::never duplicates already-painted text when the markdown
  prefix catches up`
- `smoothReveal.test.ts::never reveals a partial first spaced-language word`
- `smoothReveal.test.ts::holds the partial next word across provider chunks`
- `smoothReveal.test.ts::keeps every visible prefix on a UAX #29 extended
  grapheme boundary`
- `smoothReveal.test.ts::keeps the trailing grapheme provisional across
  provider chunks`
- `smoothReveal.test.ts::continues progressively for non-whitespace scripts`
- `streamingUi.test.ts::Fade holds a provider fragment until the word is
  complete`
- existing smoother, typewriter, markdown block, chat ownership, and streaming
  UI suites.

Human-visible proof:

- physical Android stream in Typewriter and Fade modes;
- a long paragraph plus Markdown paragraph/list transition;
- Android “Remove animations” enabled;
- completion handoff shows one stable copy of the answer.

## Non-goals

- no provider transport rewrite;
- no new dependency;
- no change to output speed tuning without device evidence;
- no CSS animation on persisted messages;
- no APK claim before full verification.
