# Ledger — tool suite + SF flattening (2026-07-26)

Commits: `5a1c276`…`8d72254` (the suite) · this commit (the flattening).
Owner instruction that opened the round: *"fai una re review, risolvi possibili
issues e vai direttamente al blocco tool, apk approvato"*, closed by *"alla fine
super review professionale ultra precisa in modo da appiattire tutto"*.

## Why this ledger exists

Two ultra-reviews (correctness/lifecycle, program coherence) ran over the whole
tool block. The coherence one found that **17 commits had shipped that day with
zero ledger entries**, a debt register three commits stale with four wrong
numbers, and a parity ledger that described the feature shipped that morning as
`"status": "planned"`. Decision #20 says the record is kept true *at every
commit*. It was the most violated decision on the list; this file starts paying
it back.

## Web research checkpoint (binding rule)

Two wire formats were about to be written from memory. They were not:

| Query | Source | Impact on the code |
|---|---|---|
| Gemini `functionResponse` role in `contents` for `generateContent` | Gemini function-calling reference / cookbook | Results are a **`user`** turn carrying `functionResponse`, matched **by name** — Gemini has no call id. Drove `ChatTurn.toolName`. |
| Ollama `/api/chat` tools, `tool_calls`, role `tool` | Ollama tool-calling docs + tool-support blog | Results use **`tool_name`**, not `tool_call_id`; arguments are an **object**, not a JSON string. |
| Anthropic extended thinking + tool use | anthropics/claude-code#14264, vercel/ai#7729, Bedrock extended-thinking docs | Signed `thinking` blocks must be replayed on the assistant turn preceding a `tool_result`, else 400. |
| OpenAI `content: null` on tool-calling turns | OpenAI chat-completions reference, vercel/ai#12389 | `content` is *required unless `tool_calls` is specified* — our schema demanded a string. |

Had these been assumed, three of the four would have shipped wrong.

## CRITICAL fixed

### C1 — OpenAI and DeepSeek could not use a tool at all
`completionSchema` declared `message.content` required and non-nullable, so the
documented `content: null` of a tool-calling turn was rejected as **malformed
before the tool calls were read** — making the "a tool turn legitimately has no
text" guard below it dead code. This is the *production* path: both providers
block browser-origin calls, so streaming fails pre-first-byte and the router
falls back to buffered CapacitorHttp. Every OpenAI/DeepSeek question needing a
tool answered "The provider request failed".
Reproduced with a failing test first (`tests/unit/chat/bufferedToolCalls.test.ts`),
then fixed. No test had ever exercised `complete()` with a tool response.

### C2 — Anthropic + thinking + tools was a guaranteed 400 on round two
Anthropic requires the complete, **signed** thinking blocks to be replayed on the
assistant turn preceding a `tool_result`. We cannot produce them: the reasoning
channel is a flat string and `signature_delta` is never captured. Every Anthropic
model advertises `thinking` and the composer toggle is one tap away.
**Decision:** thinking is dropped for exactly the requests that carry a tool
result. Round one still thinks and the user still sees the block; follow-up
rounds do not. Losing thinking on round two beats an error where the answer
should be. *Capturing and replaying signed blocks is now debt T6.*

### C3 — Tool results reached the model unmarked
Results were handed over as a bare `tool` turn — the highest-trust non-system
channel — while `readTools.ts` and the design spec both claimed they were wrapped
like Library documents. They were not. The same document arrived fenced via
ambient injection and naked via `library_read`. Wrapping is now applied in
`executor.ts`, at the one point every result passes, so write tools inherit it.
**Our own refusals are deliberately not wrapped**: teaching the model to distrust
TALOS's own rules would defeat the gate.

### C4 — Tool permissions did not survive a restart
`settings.hydrate()` assigned `shell`, `onboarding`, `security`, `tone` and
skipped `state.tools`. A user who set "never read my things" got "always allow"
back on the next launch — a silent privilege escalation on the exact axis
decision #11 defines. One missing line; 1,580 tests passed over it.

### C5 — Tools walked around the Library opt-out
With "let chats use your Library" OFF (the default) the ambient injection reads
nothing while `library_search` read everything. The toolset now honours the
switch, evaluated **per send** rather than at construction, because the toolset
is memoised and a setting changed a minute ago must govern this message.

## MAJOR fixed

- **The round bound silenced the model.** The loop's own docstring promised that
  both bounds *tell* the model; only the call bound did. The round bound broke
  out and returned the tool-requesting completion — whose text is legitimately
  empty — so the user watched five rounds of chips and received a **blank
  bubble**. It now answers every pending call id and asks once more for a final
  answer. The existing test asserted `rounds` and `stoppedByLimit` and nothing
  about the text, so it rubber-stamped the defect.
- **The preamble the user watched being streamed was thrown away.** Models
  routinely speak before calling; that text streams to the screen, but only the
  last completion was returned, so the durable message replaced the stream with
  strictly *less* text than had just been on it. The loop now returns the whole
  transcript. What is persisted equals what was rendered.
- **Gemini and Ollama shipped mute.** Three helpers were written *and unit
  tested* and imported by neither adapter: the model was never offered a tool,
  the loop exited at round 0, and the user was told "I don't have access to your
  files" with no error and no chip. Green tests over dead code. Both are wired,
  with `ChatTurn.toolName` added because both match results by name.
- **Denied tools were still advertised.** "Never" meant the model called a tool,
  was refused, and tried again — up to five billed round trips for one message
  that could never succeed. A tool the policy always denies is no longer offered.
- **The consent sheet rendered above the lock screen**, arguments visible and
  *Allow* live, because `useTalosModalSurface` inerts `#app` and both surfaces
  are teleported outside it. Lock raised to `z-[120]`; a pending request is now
  denied on relock.
- **Stop left the sheet open and the send stuck.** `askToolConsent` now takes the
  abort signal and resolves to a refusal.
- **A relock mid-send kept talking to the provider** while the screen showed a
  PIN pad, lost the answer, and fed `TALOS_DB_KEY_LOCKED` to the model as a tool
  result. The send is now stopped *before* the key is taken away, and a locked
  database maps to a neutral, non-internal message.
- **The `[TALOS_SAVE_LIBRARY]` marker write bypassed the permission gate**
  entirely while Settings said "create or change things: ask me every time". One
  setting now governs every write, whether it arrives as a tool call or a marker.
  (`'busy'` is deliberately not truthy-tested: it would have saved the file on a
  refusal.)

## Gates and the record

- `verify-initial-chunk.mjs` had **no boundary at all** for the tool suite —
  nothing stopped zod and six tool bodies drifting into the boot graph, which is
  how the permission types once cost 25KB of startup. Three true dynamic entries
  are now enforced (`toolset.ts`, `agentLoop.ts`, the consent sheet); `registry`
  and `readTools` are deliberately *not* listed, being static imports Rollup
  folds into the toolset chunk. Verified against a real build, not assumed.
- The same script printed `"ok": true` next to exit code 1 on an invalid CSS
  ceiling, because `fail()` only sets `process.exitCode` and does not stop.
- `verify-parity-ledger.mjs` accepted `implemented` with **no evidence**, and
  since there are zero `verified` entries its strictest rule was dead code.
  `implemented` now costs at least one cited test. Seven features that had
  shipped long ago (settings, theme_engine, doctor, tasks, notes, memory,
  tools_registry) were still `planned`; all seven are flipped with real,
  runnable test ids.
- `scripts/verify-parity-ledger.test.mjs` — the differential test the parity
  script's own header calls mandatory — was run by nothing. Wired into
  `verify:parity`.
- DEBT-REGISTER said "19 items remain" over a table listing **22**, and cited
  `chatController.ts` at 1256 lines when it is **1412**. Both corrected.

## Gates at close

tsc 0 · unit 1597 passed / 2 skipped · build 516,062 / 560,000 JS · 125,993 /
150,000 CSS · parity ok.

## Debt opened, not hidden

- **T6 — Anthropic signed thinking blocks are not captured**, so extended
  thinking is disabled on tool follow-up rounds (C2). The real fix is to carry
  raw provider content blocks with block identity on the assistant turn.
- **T7 — tool rounds are not persisted.** `appendDurable` still takes only
  `user|assistant|system` although the DB schema, the row parser, the `ChatTurn`
  IR, the history filter and all four adapters already accept `tool`. So the
  model re-calls the same tools for every follow-up about the same document, and
  the `role === 'tool'` branch in the history rebuild is unreachable code.
- **T8 — the audit trail is written and never shown.** Rows land as
  `tool.<name>` but `toBrowserActivityView` allow-lists ten browser operations
  and returns null for everything else. The owner's Claude-style reasoning
  drawer (requested 2026-07-26) is the natural home for it.
