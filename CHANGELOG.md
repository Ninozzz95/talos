# Changelog

What changed in each release, written for someone using the app rather than
someone reading the commits. Every version here has a matching tag and a
signed APK under [Releases](../../releases).

Numbers in this file are measured on a device, not estimated.

## v0.1.23

The coding agent moved onto the phone. Until this release "Codice" was a
screen that showed what a session would look like; it now opens real
sessions, runs real commands in a sandboxed terminal on the device itself,
and talks to five model providers instead of one. The personal voice engine
was rebuilt on Pocket, and the Model Lab stopped guessing at what a model
costs.

### Codice: a real coding agent, on the phone

- Sessions are real and they persist. They survive closing the app and
  restarting it, and the list shows what each one is doing right now —
  running, waiting for an approval, finished, or finished with an error —
  instead of a static row.
- A sandboxed terminal runs on the phone. No PC, no tunnel, no server on
  the other side of the room: commands execute on the device, through the
  ADB bridge, and their output comes back into the session.
- Any model from OpenRouter can be picked live. OpenAI, DeepSeek and Ollama
  are wired to real sessions now, not just stored; Anthropic and Gemini are
  recognized and refused with an honest reason — their request shape isn't
  translated yet — instead of either working silently or being hidden.
- Tool calls collapse into groups with a per-file diff, so a long run reads
  as a list of changes instead of a wall of output.
- The permissions pill and the model pill act on a live session instead of
  only looking like they do.
- Long conversations are compacted, and now you can see it happen instead of
  wondering why the run paused.
- The composer got the rest of its work: a Planner picker, a real "improve
  this prompt" that either rewrites it or says why it cannot, and an export
  that produces the actual session report.
- Automations, Doctor, hooks, sub-agent delegation, the review centre and
  workspace files (drag and drop, copy, create file and folder) all came
  across from the desktop build rather than being written twice.
- Deep research, Activities, Memory and the Library are connected to the
  kernel — read-only for research, on purpose.

### Personal voice

- The engine now runs on Pocket end to end: enrolment creates v2 profiles,
  older profiles are migrated instead of being abandoned, and installation
  is observable rather than silent when it fails.
- A model is loaded on demand, when an intent needs it, instead of being
  held resident.
- The Doctor screen reports performance signals from the engine, so a slow
  or stuttering read can be diagnosed from the report instead of guessed at.

### Model Lab

- The KV cache type (F16 or Q8_0) is a setting rather than whatever the
  file's header happened to use, with the resolved type always shown.
- A context-length slider with real reference points, and a provenance
  ledger that says where each number in a memory estimate comes from.
- Every quantization is checked against your device as soon as the page
  opens, instead of waiting for a tap on each one.

### Known, and not hidden

- Local models cannot yet be used for a Codice session. The on-device
  engine is reachable only from the app's web view, while the agent kernel
  runs in a separate process, and the bridge between the two does not exist
  yet. Choosing one is refused with that reason instead of failing halfway
  through an answer.
- Anthropic and Gemini models are recognized in the picker but refused for
  Codice sessions: translating tool calls into their own request format
  isn't done yet. Only OpenAI, DeepSeek, Ollama and OpenRouter route to a
  real call today.
- The "Agents" tab in the context rail is still a mock-up. Delegation
  itself is real — the session tree reads actual child sessions — but that
  one panel is static markup that no code fills in yet, so the names in it
  are examples, not your sub-agents.

## v0.1.22

Browsing models on Hugging Face got a rebuild, and the Doctor screen can
now see the personal voice engine instead of staying silent about it.

### Browsing models on Hugging Face

The model detail page is now three tabs instead of one long scroll:
quantizations, the full model card, and the raw file list. Every
quantization is checked against your device automatically as soon as the
page opens, instead of waiting for a tap on each one.

- A resource ledger shows exactly where the memory estimate for a model
  comes from — weights and file size are exact, the KV cache size is
  exact once the header is read, compute and runtime overhead are the
  app's own safety policy — instead of a single unexplained number.
- The KV cache type (F16 or Q8_0) can be forced globally instead of only
  reading whatever the file's header happened to use, and the resolved
  type is always shown next to the control, even on Automatic.
- A direct link to the model's Hugging Face page, and a button to copy it.
- The context-length slider shows its 2K/32K/64K/128K reference points
  instead of a bare track.
- A rounding bug that showed predicted speed as a fifteen-decimal number
  is fixed.

### Fixed

- The Doctor screen had no way to see the personal voice engine at all —
  only speech recognition was checked, never speech synthesis. It now
  shows whether the engine is installed, whether a usable voice profile
  exists, and a short log of the last few read requests, so a silent
  playback failure can be diagnosed from the report instead of guessed at.

## v0.1.19

The personal voice no longer stutters, and the local model runs faster.
Everything below was measured on the owner's OnePlus Pad 3 and OnePlus 13,
none of it is estimated.

### The voice engine was rebuilt on Pocket TTS

The previous engine produced stutter and hardware underruns during real
playback, and sentences that followed one another too closely would overlap
or get their start clipped. The voice engine is now built on
[Kyutai's Pocket TTS](https://github.com/kyutai-labs/pocket-tts) (MIT), run
fully on-device through ONNX Runtime — no change to what stays local: your
recordings never leave the phone.

- Stutter and the measured hardware underruns are gone. Overlaps and
  clipped sentence starts between concatenated replies are fixed.
- Sentence starts are stabilized without making the technical lead-in
  audible.
- Measured on production streaming: **-23.2 LUFS**, true peak **-0.8 dBFS**,
  Pocket gain **+12 dB** with a limiter at **-1 dBFS**.
- Time to first audio, warm: **449–537 ms**; the engine now enforces a
  **600 ms** honest cutoff rather than reporting a number it cannot back.
- Italian speech recognition against 6 reference sentences: **6/6 exact,
  zero word error rate**, no dropped first or last word.
- The AudioTrack buffer grew to **1.205 s** to absorb the timing variance
  that caused the underruns, without delaying playback start — the initial
  threshold that controls when audio starts did not change.
- Existing voice profiles migrate to the new engine automatically; nothing
  needs to be re-recorded.

### The local model runs faster

Continuing work on the on-device engine (llama.cpp):

- A persistent OpenCL kernel cache removes a multi-second first-generation
  recompile that ran every time the app started.
- The microbatch size for prompt processing moved from 192 to 512 tokens,
  measured to shorten prompt processing without changing output quality.
- The static parts of the system prompt are now pre-computed once (AOT)
  instead of on every message, including a fix for models that need more
  than a system turn alone to accept it correctly.
- A native thread pool replaces manual thread lifecycle management. CPU
  core affinity was measured explicitly (paired A/B campaign) and found to
  make no measurable difference on this hardware (≤1%, inside the ~2.4%
  run-to-run noise) — the mechanism ships as tested infrastructure, but
  default behavior is unchanged rather than switched on speculation.

### Fixed

- The instruction telling a local model which language to answer in was
  being skipped in one case, so a tool result in another language could
  pull the reply into that language even when everything else was in
  Italian. The instruction now always names the exception, in both the
  short local-model prompt and the full one, and stays within the prompt's
  measured size budget.
- The background scene now follows the selected motion complexity on its
  own, instead of being tied to the color theme.

## v0.1.18

The app can speak in your own voice. You record a set of phrases once, the
device learns from them, and from then on a message can be read back in that
voice instead of the stock one. Everything below was measured on the owner's
OnePlus Pad 3, on a real tablet layout, and none of it is estimated.

### Teaching it your voice

The wizard walks you through twelve phrases in three styles, shows a real
waveform that moves with your voice while you speak, and checks the recording
quality before accepting it. The quiet-room screen before the wizard now shows
a live microphone level too, so you can tell whether the room is actually quiet
before you start. The level meter is on only on that screen and switches off
the moment you leave it.

Your recordings never leave the device. They are encrypted with a key held in
the phone's hardware keystore, and once the voice profile is built the raw
audio is destroyed.

### It no longer dies while learning

The first real run with twelve phrases killed the app. Not "ran slowly" —
Android's low-memory killer terminated it, and said "process memory is
leaking": about 5.8 GB resident and 5.3 GB of swap.

The first attempt at a fix — turning off ONNX's memory arena, which is the
official recommendation for small models — brought it down to 3.5 GB and still
died. That was reported as insufficient rather than shipped as a fix.

The real cause is that the encoder's attention costs memory in proportion to
the *square* of how much audio you hand it, which matches the memory climbing
steadily throughout the encode rather than spiking at load. Twelve phrases
concatenated is twenty to forty seconds of audio, and that is past what the
model is built for: its own documentation puts the sweet spot at three to ten
seconds and warns that clips beyond about fifteen "may introduce noise
artifacts or degrade quality".

So the reference is now built from the four normal-voice phrases rather than
all twelve, with a hard twelve-second ceiling behind it that holds no matter
what reaches it. A shorter reference is not a compromise for the sake of
memory — it is the better recording. Measured after the change: the encode
finishes in 5.4 seconds and the app survives.

The quality gate still runs on all twelve phrases. Only the audio that reaches
the encoder changed.

### If it crashes, you do not start over

Each accepted phrase is written to disk encrypted as you go. If the app is
killed halfway through — or crashes — reopening the wizard picks up at the next
missing phrase instead of asking for all twelve again, and it does not make you
redo the consent screen or the microphone check. Verified twice: once with a
forced stop, and once with a genuine crash that happened while chasing the bug
above.

### A personal voice can now actually be chosen — and it works

Recording a voice, and reading with it, used to be two separate stories. The
voice showed up in "Voice personale" with rename and delete, and that was the
end of it: nothing let you pick it as the voice that reads replies, and there
was no way to hear it again once the wizard closed.

Both are fixed. A recorded voice now appears at the top of the same picker
that lists the device's own voices — pick it and it becomes the one that
reads, exactly like picking any other voice. Every profile also gets its own
"Listen" button, independent of which voice is currently active, and the one
actually in use is marked so on its card. Verified on the owner's Pad with a
real recorded voice, not a mock: selecting it writes to the real settings
store, and pressing "Listen" or the speaker icon on a real chat reply both
measurably load and run the neural engine (a resident-memory jump from about
560 MB to about 1.9 GB, the same jump either way). That memory jump alone
turned out to prove only that synthesis had started, not that it finished —
two of the fixes below were found this same way, by listening to what the
device actually said rather than trusting the jump as success. With those
closed, the chain now runs end to end for real.

A voice you record is now also tagged with the phone's actual system
language rather than whatever language the app's interface happened to be
set to at the time — those can differ, and only the system one is what
should be on the label.

### Fixes

**Talking to it used the stock voice even with a personal voice chosen.**
When a reply is read aloud automatically because you spoke to it — the
"you talk, it answers back in voice" path — the app always used the stock
system voice, even with a personal voice selected. Deliberate at the time:
that path speaks sentence by sentence as the reply streams in, queuing each
one behind the last, and the personal engine had no real queue to speak
into — a second sentence sent there would have cut the first one off
instead of following it. It now waits for the reply to finish streaming
and reads the whole thing in one call to the personal engine, the same way
pressing the speaker icon on a finished message already did. You lose the
word-by-word start; you gain that the voice you actually chose is the one
you hear, which matters more.

**A file name or code term with an underscore was read as
"underscore".** `documento_complesso` came out as "documento underscore
complesso" — a known symptom of handing a TTS engine raw text straight from
a markdown-formatted reply. Underscores, `**bold**`, `*italics*`, and
`` `inline code` `` markers are stripped before anything reaches either
voice engine now; the words themselves are never touched.

**A voice that had been renamed since you picked it read nothing.** If
the personal voice your settings pointed at no longer matched a saved
profile — renamed, or replaced by a new recording — pressing the
speaker icon produced only a generic error instead of reading the
reply. It now falls back to the stock voice silently, the same way it
already did when no personal voice had ever been chosen.

**The device voice you actually heard could be a different one than the
one you chose.** Applying a chosen voice to the system engine can be
refused — most often a network voice when the network is not reachable
at that instant — and that refusal was never checked: reading went
ahead anyway, on whichever voice the engine happened to have already. A
refusal now retries once against a voice that does not depend on the
network. Separately, the very first reading of a fresh app launch could
run before the device's own voice list had finished loading, silently
skipping the choice altogether — reading always landed correctly from
the second attempt in the same session, never the first. Both were
real, found by listening to the device rather than trusting a memory
measurement that had only confirmed the engine started, not that it
finished successfully.

**The voice engine's files were showing up as chat models.** After
installing the voice engine, its two files sat forever in the same on-device
folder the chat's own model downloader uses, so both the settings' "Local
models" list and the model picker in the chat composer offered them
alongside real language models — selecting one there could not have worked.
They are cleaned up now, immediately, including on a phone that installed
the voice engine before this fix (~800 MB reclaimed on the owner's Pad,
automatically, at the next launch, no reinstall needed).

**The voice wizard filled only half a tablet screen.** On a real tablet the
setup dialog stayed trapped inside the settings panel, with the category list
still showing beside it and an empty strip below the footer. It looked correct
on a phone, and on a tablet shrunk to phone size, which is why it survived this
long.

**The voice picker showed "Select an option" while a voice was selected.**
When network voices were available they crowded the list, and the local voice
the app had actually chosen was not in it. The setting was right; the label was
wrong.

**Markdown documents are readable again.** Files shared into a chat now render
formatted instead of as raw text, and their card opens the document.

**The voice you hear when you press play is the voice in your settings.** The
two could disagree; now they cannot.

**The selection icon in the chat sidebar is gone.** Press and hold already did
the same thing.

### What this release does not do yet

Read-aloud does not yet stream ahead of the text it is reading with a personal
voice — it waits for the whole reply, where the stock voice can start mid-
stream. The stock system voice remains the fallback and is unchanged: if you
never set up a personal voice, nothing about the app sounds different.

On a long reply the personal voice can still stutter — measured, not a
guess: on the owner's Pad, a roughly two-hundred-word reply produced
audible glitches once every one to two seconds for its whole length, on a
device that was not thermally throttled at the time. Isolated to the
generation step itself running behind real time, not to the playback
buffer, batch size, or CPU thread count — all three were measured and
ruled out one at a time. A short reply is unaffected. Fixing the
generation step itself is bigger work than this release; it is not
started yet.

## v0.1.17

The local engine can use the GPU. Everything here was measured on the owner's
OnePlus Pad 3 — an Adreno 830 on Android 16 — and none of it is estimated.

### Stop now stops

Pressing stop during a long prompt used to wait out the whole prefill. It was
not slow; it did not work at all. The engine kept going and quit when it would
have quit anyway: press at 1,500 ms and stop "took" 155; press at 200 ms and it
took 1,458. The sum was 1,655 against 1,658 — three milliseconds apart across
two opposite experiments, which is the signature of a stop that never happened.

The cause was a callback llama.cpp's own header describes as CPU-only. Metal
implements it, the OpenCL backend did not, and the generic per-backend lookup
was quietly finding nothing.

**1,425–1,440 ms → 32 ms**, with a p95 of 36 and a worst case of 36 across nine
runs. That p95 matches the CPU floor's own 36 ms exactly: on this axis the GPU
is no longer distinguishable from the processor. Stopping mid-answer costs
**42 ms at the median, 50 at p95**.

Generation pays nothing for it: 16.43 tokens per second before, 16.43 after.
Prompt processing pays 6–7%.

### The first message stops costing five seconds

Flash Attention was on because nothing had ever chosen it — the setting defaulted
to automatic and nobody had measured what it did on this chip. Compiling its
kernels cost **4.7 to 6.6 seconds on the first message of every session**, and
that cost was invisible because it was being discarded as a warm-up.

With it off on OpenCL targets the first message lands in 1.7 seconds instead of
6.2, and generation after a long prompt runs roughly **twice as fast**. The same
sign held on three different model families. Nothing the model says changes: the
semantic suite reads identically, 7 of 7.

### The GPU is asked to prove itself, once

The engine ships an OpenCL backend now, with Adreno kernels compiled from
source. But shipping it is not the same as using it, and a GPU is not
automatically faster than the processor on a phone.

So the app runs one short qualification the first time you pick a local model —
and it **asks first**, with a plain yes or no and an option never to ask again.
Saying no is remembered and is not the end of it: there is a command in settings
to run it later, or to change your mind. Saying no leaves the app exactly as it
was.

The result is evidence, not an opinion. A backend is chosen only if it beats the
processor's time-to-first-token by a factor of two — a margin taken from the
worst case actually measured, 43.2 seconds against 11.0. Without evidence, or
when the device is running hot, the processor wins by default.

### Under the hood

Every native library in the release build is aligned to 16 KB pages — 75 of 75,
checked with `llvm-readobj` rather than trusted. The abort fix is carried as a
patch file rather than a commit in the vendored engine, so a fresh clone still
builds.

### What this does not do yet

The qualification runs once and records what it saw. It does not re-run when the
phone gets hotter or colder, and it does not yet compare a third backend.

## v0.1.16

The Deep Research rework, drawn from the approved mockup and measured on the
owner’s OnePlus Pad.

### The disagreement, in the open

When sources contradict each other, the passage for and the passage against
now sit side by side **on the report itself** — no tap, no hunting. Nobody
reading a report at 86% has a reason to open that one row out of twelve, and
that row is the one that matters.

It could not happen before. The rule that marks a claim contested had tests
and no caller: a run could never produce one, so neither the card nor the
standing bar could ever show it. The GGUF report said in its own prose "the
sources do not formally name a single maintainer" while the bar above it read
7 of 7 supported, 0 contested — the disagreement lived in the summary and
never in the data.

Now the judge gets a second question: does this passage, from a **different**
source, contradict the claim? One candidate per claim, chosen by word overlap
and never by a model — a model picking what to judge is a second judgement
paid for to move the first.

Three things are refused before the judge is paid, each found on the device:

- **An echo is not a disagreement.** Two sites carrying one sentence had the
  judge saying "yes, it contradicts" about a sentence it had just approved.
- **A frame is not a difference.** The next one had "says no" *containing*
  "says yes" plus a paragraph of context. The comparison runs in the shorter
  direction now.
- **A table is not a passage.** An infobox scraped without spaces between
  cells — "0x46Developed byGeorgi Gerganov and communityInitial releaseAugust
  22, 2023" — was called a contradiction while the text actually *confirmed*
  the date.

### How a report holds over time

Every re-check has been writing its document to the Library for weeks, in
prose: readable and impossible to compare. It now carries a block that reads
back exactly, and the report lines the checks up with the drop between them.

Counted on the **quoted passages**, not on the pages. Reference decay has two
halves — the address dies, or the page answers and no longer says what was
cited — and among links that still resolve, published studies find only about
30% still contain the cited material. A page that changed elsewhere took
nothing away from this report. We can ask that question because we kept the
text; everyone else kept a URL.

### Fixed

- **Reports were graded on verdicts the judge never gave.** Asked to answer
  "SI | PARZIALE | NO — reason", the on-device judge copied the menu instead
  of choosing from it, and the first word was taken as the verdict. Those
  100% reports were inflated. The menu is gone from the question — three
  words, one per line, with an example — and coverage on the next run went
  from 25% to 100%, honestly this time.
- **Six pages counted as ten.** Two branches of a plan can land on the same
  page; the report listed it twice. The model saw it as [1] and [6], so two
  claims "from different sources" could come from one; and "6 of 10
  independent" had an inflated numerator *and* denominator. Same question on
  the Pad, before and after: 10 sources / 6 of 10 → **7 sources / 7 of 7**.
- **Two sources, one name.** Both rows read "GGUF", both "same site as another
  source". The domain is on the row now, where the mockup had it.
- **The raw protocol reached the screen**: "| PARZIALE |" printed as the
  reason, under a verdict that said "contested".
- **Two bells with the same badge** on tablet, and the badge was clipped in
  landscape. The panel owns the hamburger, the bell and the downloads — not
  the chat options, which is why they had gone missing from the tablet pane in
  the first place.
- **"1 contese".** Italian agrees its adjectives and that line carries five in
  a row, so any value of 1 broke one. The counts are labelled now.
- **The list card left the contested count out**, so a four-claim report read
  "75% · 3 supported · 0 in part · 0 contradicted" — the missing one was the
  one explaining the 75%.
- **"Deep Research V3"** put an internal version number on screen.
- **A failure that named nothing.** Asking for a search, granting the consent,
  and then reading "Did not work: reading a web page" — with no reason, right
  after a search that had in fact succeeded. The consent is not the cause: it
  is the gate, and the tool can only run, and fail, once it opens. Underneath
  was a page redirecting https → http, refused by the native client. TALOS did
  the right thing and said nothing about it. Failures now carry a stable code
  alongside the sentence, and the notice reads the code: **"That page
  redirected to an unprotected connection, so TALOS did not follow it. The
  other sources it found still stand."** Eleven refusals have a sentence now.
- **A link in your own message was invisible.** Measured on the device: link
  colour rgb(192, 139, 60), bubble background rgb(192, 139, 60) — identical,
  contrast 1:1. The address was there, underlined, and unreadable. Every
  address you type or paste.
- **"2 richiesta di autorizzazione"** — Italian agreement, in the third place
  it turned up today.

### Added

- **Sources export as BibTeX and RIS**, for Zotero, Mendeley, EndNote or a
  LaTeX bibliography. Nothing about the research leaves in them — not the
  question, not the judge, not the identifiers: a bibliography file ends up in
  a shared folder, which is the least controlled place a personal detail can
  land.
- **The header line carries sources and tokens**, and tokens only when an
  engine actually reported some.

### Also, from before the tag

- **The report says what its own percentage is worth.** The four benchmark
  measures now sit under the standing figure, each with the plain line that
  says what it means, and the score carries its date because cited pages die.
- **Contested claims reach the surface**: listed in the standing line, counted
  as zero toward solidity like a contradiction, and a single one marks a run as
  worth a second look.
- **The accessibility-service description is readable in any language.** It
  existed only in Italian, in the fallback file, so a phone set to German or
  Spanish showed an Italian sentence on the one screen that grants reading the
  whole display. English is the fallback now, Italian sits in its own file, and
  the Android lint gate — red since 19 August, including on the v0.1.14 push —
  is green again.

## v0.1.15

The honesty release: three things TALOS used to say with confidence that were
not true, plus the groundwork for the deep-research rework. Every number below
was measured on the owner's OnePlus Pad running Android 16.

### Fixed

- **Location is precise, and when it cannot be, TALOS says so.** TALOS reported
  Rome to an owner sitting in Catania, 500 km away. The phone knew better — its
  own providers had the right position to 43 m — but TALOS held only approximate
  location permission and settled for it silently, producing output identical to
  a GPS fix. It now asks for precise location, and when that stays denied it
  still reads the approximate one but declares it and names the switch to turn
  on. Measured: ~2 km with the warning, 16 m without.
- **Local models call their tools instead of inventing the answer.** Asked for
  the phone's coordinates, Gemma 3 4B produced Milan, then "I am in a chat with
  a user", then narrated "I am reading the phone's location" without reading
  anything — three phrasings, no tool call. Four causes, each measured: the
  tool-lookup result looked like an answer, a correct direct call was discarded
  for skipping the lookup step, the protocol sat too far from where the model
  reads last, and an emptied code fence stayed in the reply. Gemma now calls on
  all three phrasings and returns the true coordinates on two; Qwen3-1.7B calls
  and answers correctly.
- **The answer comes back in the language of the interface.** A local model
  handed an English tool result answered in English to an Italian question. The
  reminder now also follows the tool data, where the model reads last, instead
  of living only at the top of the prompt.
- **PDFs attach again.** Attaching one failed every time with "TALOS could not
  examine this file". pdf.js needs its worker and ours was never configured; in
  Node it silently fell back, so the tests said nothing about the phone.
- **A PDF opens inside TALOS instead of Android's share sheet.** "Open" in the
  Library handed the file to the system share dialog — with the owner's own
  contacts in the first row, one tap from sending it. It now opens in the
  built-in viewer, and the whole page fits in either orientation instead of
  running off the bottom.
- **The pending-authorization notice is said once.** It appeared up to three
  times in one reply and outlived the request it described, because it was
  written into the message text as well as shown on its own card. Only the card
  carries it now, and it moves from pending to settled on its own.

### Added

- **Independent sources are counted, not URLs.** Three sites carrying the same
  press release are one piece of evidence, not three. Computed from the
  registrable domain and the origins a source itself cites, with no extra
  network request — and a source that cites several origins stays independent,
  because penalising that would punish the best sources.
- **Fidelity measures are computed, each with its date** — coverage, citation
  faithfulness, claim groundedness and distinct proofs. A run nobody judged
  returns "unverified" rather than a percentage, because a percentage reads as
  a measurement and would be a measurement of nothing. They reach the report
  screen in the next version.
- **Citations export as BibTeX and RIS**, for Zotero, Mendeley and EndNote. A
  citation describes a page, so the query, the judging model and the run id
  never leave with it.
- **A contested claim is now its own outcome**, separate from partial. One
  source saying yes and another saying no is not "nearly supported": it is the
  world disagreeing, and both passages are kept so they can be shown side by
  side.

## v0.1.14

The local-model parity and tool-boundary release, verified on the owner's
OnePlus Pad running Android 16.

### Fixed

- **Qwen3-1.7B and Gemma 3 local chats now keep the same direct-turn contract
  as API providers.** Exact replies, explicit no-tool requests and contextual
  last-word follow-ups no longer trigger a spurious tool call, leak an internal
  tool envelope or add a model-generated lead-in.
- **Local tool transport is selected from the GGUF template capabilities.**
  Native templates with tool-call support use the embedded contract; templates
  without it use the AVM-owned prompt JSON protocol, including system-role
  compatibility and untrusted tool-result boundaries.
- **OpenRouter image generation remains fully executable.** The progressive
  catalog gate is restricted to local models, so API providers still run
  `generate_image`, persist the generated binary and report storage failures
  correctly.

### Changed

- **Doctor and parity diagnostics now expose the measured local template
  capabilities and selected tool transport**, making GGUF compatibility
  inspectable instead of inferred from a model name.
- **Local parity probes cover native and prompt-JSON paths**, with persistent
  fingerprints, failure stages and regression fixtures for reloads, tool
  results and system-role handling.
- **The mobile harness keeps the initial JavaScript chunk within its budget** by
  loading non-bootstrap tool-result sanitization and direct-turn policy only
  when a chat send is already in progress.

### Verification

- Full Vitest suite: `5643 passed`, `10 skipped`.
- Typecheck, web build, initial-chunk and parity gates: passed.
- Android debug/native instrumentation on the owner's device: `OK (9 tests)`
  with only fixture-dependent assumptions skipped.
- Real Gemma and Qwen prompts, reload persistence, portrait layout and final
  logcat were exercised on the reference tablet.

## v0.1.13

The voice and local-model usability release, verified on the owner's OnePlus
Pad running Android 16.

### Fixed

- **Waking TALOS from a locked device no longer puts the assistant above the
  lock screen.** Android keeps its normal authentication surface in front;
  TALOS stays silent and hidden until the keyguard has really disappeared.
  Immediately after unlock, the assistant is handed the microphone and enters
  listening mode. The cold and warm paths were exercised on the real Pad,
  including the short visual transition after authentication.
- **Barge-in now stops TALOS while it is speaking and starts listening again**
  through the wake-word path, without opening a second recognition session.
- **Voice permission and accessibility state are represented by their real
  Android state.** Non-actionable permissions are not presented as toggles in
  onboarding, while actionable settings remain available in Settings.
- **Local-model and permission flows no longer leak internal tool labels or
  crash while reading native permission metadata.** The affected native and
  web paths have focused regression coverage and were rebuilt into the final
  APK.

## v0.1.12

A permission-fix release, verified on the owner's OnePlus Pad.

### Fixed

- **Granting a runtime permission no longer crashes the release build.** R8 was
  removing the Capacitor permission metadata that TALOS reads when it asks for
  microphone, notifications, contacts, location, camera, calendar or mail
  access. The release now retains that contract, and the real Android artifact
  gate checks the aliases and platform permission strings before publication.
  The grant, denial, permanent-denial and system-settings paths were exercised
  on a OnePlus Pad running Android 16 without an application FATAL.

## v0.1.11

<!-- v0.1.9 and v0.1.10 were tagged but never produced a signed APK: their builds
     failed (packaging, then a stale test delimiter). This is the release that
     ships the work, under a clean version. -->

<!-- v0.1.9 was tagged but never produced a signed APK: its first build failed in
     packaging. This is the release that ships that work, under a clean version. -->

Another crash-fix release, found on the owner's own device.

### Fixed

- **Opening Diagnostics crashed the app.** Every time. The diagnostics screen
  checks whether dictation has microphone access, and that check read a
  permission whose state the phone answered with "nothing" — the same class of
  bug as the OnePlus 13 startup crash in the last release, but this time inside
  the third-party dictation component, on a thread no JavaScript safety net can
  reach.
  - Fixed at the native layer: TALOS now wraps that component with a safe version
    that reports **unknown** instead of falling over. Verified on a real device —
    Diagnostics opens, shows its report, and stays up.

### Changed

- **The local model is no longer thrown away the moment you switch apps.**
  Before, leaving TALOS for a second discarded the model even with memory to
  spare, and coming back paid the full cold-open cost — measured at four seconds
  warm, nearly nine cold, all of it in the loading. TALOS now keeps the model for
  a short grace period and only releases it under real memory pressure, so a
  quick glance at another app doesn't cost you the wait when you return.

- **Long replies from the local model stream more smoothly.** Watching a reply
  arrive used to recopy the whole answer from scratch on every refresh, so the
  longer the reply, the more work each update cost — growing with the square of
  the length. TALOS now passes only the newly written text, keeping long answers
  as light as short ones.

## v0.1.8

A crash-fix release. The headline is a startup crash on the OnePlus 13, found on
the owner's own phone and fixed against it.

### Fixed

- **TALOS crashed on launch on the OnePlus 13.** The app died before it could
  draw anything, every time. The cause was a permission-state read that Android
  is allowed to answer with "nothing" — and on this device it does. TALOS read
  that "nothing" as a value and fell over.
  - It no longer does. A permission whose state cannot be read is now reported as
    **unknown** rather than crashing — because guessing "denied" would be
    inventing a fact, showing an "Allow" button for something perhaps already
    granted, or hiding a feature that is actually there.
  - Verified on the OnePlus 13 itself: zero crashes, launch in 1.3 seconds, the
    screen drawn. Not deduced from an exit code — looked at.

- **The local model wasted its own warm-up.** TALOS remembers the best
  thread setup for each phone and model, so it doesn't re-measure every time. But
  it wasn't noticing when the engine underneath changed — this release ships a
  new build of the local engine, and a setup measured with the old one would have
  been reused with the new. The memory now knows which engine it was measured
  with.

### Changed

- **"Always allow" is back on web search.** It had quietly disappeared: after a
  search, the safety chain would rise to its highest level and drop the "always"
  option — on the one action people use ten times a day. Searching the web is now
  an explicit exception, so the choice you make can hold for next time. The
  question still appears the first time, and still says why.

- **The local engine runs on the right cores.** On Android, the code that pins
  work to specific CPU cores was being compiled out entirely — every thread ran
  everywhere. This release picks up the upstream fix. On the owner's tablet, the
  engine now measurably prefers **six threads over eight**, where eight was not
  only slower but wildly inconsistent — one run in three collapsing to a third of
  its speed.

### Internal

- Android, the native C++ engine and the browser tests now run on every proposed
  change. A whole class of defect — including a native crash and this release's
  OnePlus 13 crash — lived in the layer the old checks never touched.

## v0.1.7

An external engineering review went through the whole codebase and found
twenty-two issues. This release closes thirteen of them, plus one the review had
missed. Every fix below was reproduced with a failing test before it was written,
and the build was installed and used on a real tablet before this went out.

### Fixed

- **A local model could have sent your conversation to a stranger.** TALOS lets
  you point it at a model running on your own machine, over plain HTTP. It
  checked that address carefully — it even refuses host *names*, because a name
  is resolved later and by someone else. But it only checked the **first hop**.
  A server answering `302 Location: https://somewhere-else` would have carried
  your prompt, and the authorization header with it, straight out of the network
  you had allowed.
  - Redirects are now refused outright, on both the streaming path and the native
    bridge, and the boundary cannot be switched off by the code that calls it.
  - The test for this stands up **two real servers** and checks whether the body
    reaches the second one. Before the fix, it did.

- **"I could not check" was being reported as "done".** When an action succeeded
  but the check that would confirm it failed, TALOS kept the success and dropped
  the doubt. For anything that changes the world — sending a message, writing a
  file — that is the wrong half to keep.
  - There are now four outcomes instead of two, and the new one refuses to become
    either neighbour. Calling it a failure is worse than calling it a success: a
    failure is an instruction to try again, and trying again is how the same
    message gets sent twice.

- **The database migration wrote a full copy of your data in the clear.** When an
  older installation moves onto a managed key, TALOS exports everything, writes
  it to disk, destroys the original and imports it back. That intermediate file
  was readable — for a few seconds, data that spends the rest of its life behind
  a PIN was plain text on the filesystem.
  - It is now encrypted, and it is written to a temporary name, read back and
    compared, and only then renamed. The old file is destroyed after that, never
    before.
  - **Journals written by an older version are still readable.** If your app was
    killed mid-migration and you update before reopening it, the new code finds
    the old file and resumes from it. Without that, an update meant to protect
    your data would have destroyed it.

- **Your PIN now protects the key with Argon2id.** The previous protection was
  PBKDF2 at 210,000 iterations, which is no longer what current guidance
  recommends. Existing PINs keep working and are upgraded silently the next time
  you unlock — and if that upgrade fails for any reason, you still get in.
  - The record now states which protection it uses, and that statement is
    authenticated: a record altered to claim weaker protection simply will not
    open.

- **A malformed backup file could freeze the app.** Backup files declare the cost
  of the protection they were written with, and TALOS obeyed that declaration
  without limits. A file claiming four gigabytes of memory would have asked a
  phone for four gigabytes. The test that found this ran for **five minutes**
  before being killed; it now finishes in milliseconds.
  - A file says what it was written with. It does not decide how much work your
    device is willing to do.

- **Any app on your phone could start TALOS's internal profiler.** A diagnostic
  tool, meant for hunting a startup problem, could be triggered from outside with
  a single command. It is now absent from release builds entirely — not disabled,
  absent, verified by reading the compiled bytecode.

- **A crash in the local engine, under the right timing.** Preparing a prompt and
  generating a reply could touch the same piece of memory from two different
  threads, one freeing it while the other read it. Everything that touches the
  engine now runs in a single ordered sequence, and anything that breaks that
  order fails immediately with a message naming both threads instead of crashing
  silently.
  - Calling the engine after closing it now reports a clear error too. Before, it
    handed the closed engine's address back to the native layer.

### New

- **A security policy for the app's own web layer.** TALOS's interface runs in a
  web view that can reach the phone's native features, so an injected script
  there would not steal a session — it would use the device. The app now declares
  what it is allowed to load and execute, and an injected script does not run.
  - The policy is checked by loading the real app in a real browser and asking it
    whether it had to block anything. That test caught a first version of the
    policy that would have prevented **everyone from unlocking their database**.

### Changed

- **The app is 6.4 MB smaller** — 42.6 MB down to 36.2 MB, measured on the same
  build twice. Unused code and resources are now removed at build time.

### Internal

- Android, the C++ engine and the browser tests now run on every proposed change.
  They did not before, and that is how the engine crash reached this codebase.
  - The browser suite turned out to be **completely broken** — all fifty-two
    tests — because a language screen loads late and covers the button the tests
    press. Nobody knew, because nothing ran them.
- Build actions are pinned to exact commits rather than moving tags, the build
  toolchain verifies its own download against a published checksum, and automatic
  updates keep those pins current.

## v0.1.6

### Fixed

- **"Hey TALOS" not answering on a tablet.** Ten attempts in a real room, at
  normal speaking volume, produced **zero** activations — the highest score was
  0.383 against a 0.50 threshold. The wake word now answers **10 out of 10** on
  the same device, in the same room, with the same voice.
  - The cause was not the model, the microphone, the room noise or the volume.
    Each of those was ruled out by measurement: attenuating the audio by 18 dB
    still scored 0.951, and at the room's real 16 dB signal-to-noise ratio the
    model still hit 0.967. It was the build that was installed.
  - The threshold stays at **0.50**, and that is a decision made from data
    rather than instinct. The ten real detections land between **0.544 and
    0.949**; the loudest thing in the room that is not the wake word reaches
    **0.319**. Raising the threshold to 0.60 would lose two detections in ten
    and prevent nothing, because there is nothing to prevent.

### New

- **TALOS no longer asks you to approve something that cannot work.** Before a
  permission card appears, TALOS now checks whether what the action assumes
  actually exists — a contact, a file, an app. If it does not, nothing is asked
  and nothing runs, and TALOS tells you what is missing instead.
  - It answers in **three** states, not two, and the third is the one that
    matters: "I could not tell". A denied contacts permission means TALOS does
    not know whether your contact exists — so it proceeds rather than claiming
    the contact is not there. Treating "I don't know" as "no" is the same
    mistake seen from the other side.

### Internal

- Two diagnostic switches for the wake word, **off by default** and turned on by
  creating a file: one writes the raw audio the model receives, the other swaps
  the microphone source. From now on "it doesn't work on my phone" is settled by
  pulling the bytes and replaying them, rather than by guessing.

## v0.1.5

### New

- **PDFs open inside TALOS.** A document TALOS generates now shows its pages in
  the app — swipe through them, close, and the conversation is still where you
  left it. Until now the card showed the name and the size and tapping it did
  nothing.
  - It renders through Android's own PDF engine, so it adds **no library to the
    app**: 31 bytes to the startup path, against the ~16 MB of native code a
    PDF library would have brought.

### Fixed

- **"Done." said out loud to a task TALOS had just given up on.** When TALOS
  drives the screen for you it ends the run by saying what happened — and it
  said "Done" whether it had finished or abandoned, because those were the same
  outcome internally. They are now two, and there is a third: if TALOS does not
  say which, you are told that too, rather than being told it worked.
- **A pending permission request swallowed the answer.** When TALOS needed your
  approval mid-task, the notice was glued onto the reply and the whole thing was
  drawn inside the notice's box — so the answer lost its formatting and the box
  filled the screen. The answer is now an answer, and the notice is a small chip
  under it.
- **"I have no web search" — said while the capability existed.** With no search
  provider key set, the two web tools are not built at all, so the model could
  not see them and concluded it had none. TALOS now says the search key is
  missing and where to add it, instead of leaving you to conclude it cannot
  search.

### Known limits

- Unchanged from v0.1.4: verified on one device, a OnePlus Pad 3 running Android
  16 with ColorOS.

## v0.1.4

Everything below is one story: TALOS presses "send" for you, and this release is
about it never lying to you about whether it did.

### Fixed

- **TALOS said "the message was sent ✓" and, in the next line, "it was not
  sent".** Both in the same answer, about a message still sitting in the WhatsApp
  input box. Four written rules told it not to, and none of them worked — because
  the sentence was not written after the send. It was written *before* the call,
  as a preamble, and the app glued the preamble and the conclusion together.
  A false opening now disappears when the tool reports it changed nothing. A true
  one stays: if the message really went, the line you already read stays where it
  was.
- **"The accessibility settings are already open" — while WhatsApp was on
  screen.** Measured from the phone's own activity log: TALOS opened them 37
  milliseconds after opening WhatsApp, and WhatsApp went on launching four more
  windows over the next 850 milliseconds and buried them. The sentence was true
  for 37 thousandths of a second. TALOS no longer races: the card carries a
  button, and the screen changes when you tap it.
- **That button used to land on a page where TALOS was not listed.** On
  OPPO/OnePlus phones the downloaded services live one level down, under
  "Downloaded apps", so "find TALOS in the list" pointed at a list without TALOS.
  It now opens the page TALOS is actually on, and falls back to the general list
  everywhere else.
- **Sending a file had the same holes, and one more.** It said "sent" on a single
  check where messages had required three since v0.1.1; it drew no card at all;
  and it told the model to open a settings page, which twice opened
  *notification access* instead — a permission that reads every notification from
  every app, offered for sending one message.
- **"That file is not in your Library" — about a file that was there, twice
  over.** When TALOS could not read the Library it reported an empty one. Not
  being able to look and there being nothing to find are two different answers,
  and only one of them was ever true.
- **Two files with the same name were a dead end.** TALOS correctly asked which
  one you meant, and then could not accept any answer you gave: it matched files
  by name, and two identical names stay identical. Answering "the first one" led
  back to the same question.
- **"Send file X to Y" often never called the send tool at all.** TALOS searched
  your Library, described what was in the files, and stopped — and once claimed,
  with no basis, that it could only send files stored on the phone. Measured
  against the real set of tools: the send tool was chosen 8 times out of 12, and
  for "write to X on WhatsApp attaching Y" it was chosen 0 times out of 3. It is
  now 12 out of 12.

### Changed, for new installs only

These are the values a phone gets when it installs TALOS for the first time.
Nothing moves on a phone that already has the app: a default is what you get
before you choose, and changing it is not permission to change your mind for
you.

- Interface text now starts at **Default** instead of Large. Every larger step
  is still one tap away in Settings, and the phone's own text-size setting keeps
  applying underneath.
- The composer starts as the **compact** bar.
- The app icon **follows the theme** you have on, without being asked.
- Choosing **"Always"** in the one-tap autonomy screen now also turns on "Let
  chats use the Library". Saying yes to everything in one gesture and then
  finding your own Library disconnected reads as a fault, not a choice.

### New

- **A card under the answer says whether it left.** "WhatsApp — NOT sent · screen
  reading is off", in words and not only in colour, with the reason when we know
  it. It is drawn by the app from what the phone reported, so it stands even when
  the sentence next to it says something else.
- **When two files share a name, you pick one with your finger.** The list comes
  from your Library to the screen and each row is a button — no id to retype, no
  number to guess.

### Known limits

- Verified on one device: a OnePlus Pad 3 running Android 16, ColorOS. The
  settings page that contains TALOS is found by asking the phone, with a fallback
  everywhere else — but nobody has seen that fallback on a non-OPPO phone yet.
- Unchanged from v0.1.1: opening an app that is already running resumes it where
  you left it, so a screen task can land inside the wrong screen. TALOS says it
  could not get there rather than claiming it did.

## v0.1.2

### New

- **You can make TALOS your assistant without plugging anything in.** Until now,
  if Android did not show the "become the assistant" dialog, the only way left
  was the ADB bridge — a cable or wireless debugging. And Android never shows
  that dialog: the assistant role is declared non-requestable in AOSP itself, so
  the request opens and closes in 53 milliseconds with nothing on screen.
  Measured on device. TALOS now takes you straight to the system page where you
  pick your assistant, with TALOS in the list. The bridge is still there, but
  last.
- The button that used to promise "one tap and Android asks you" now says what
  actually happens. A prompt nobody will ever see is worse than no promise.

### Fixed

- **Two of the ten permission rows never said whether they were granted.** "Where
  you are" and "Files you choose" showed a dashed circle and no words, while the
  other eight said "Allowed" — so the absence of a word was doing the work of a
  word, on a page whose only job is answering "do you have it or not?". Anyone
  using a screen reader had no way to tell at all.
  - Location is a real permission and the app simply never asked the system
    about it. It does now — and it checks approximate location only, because
    Android 12 lets you grant approximate without precise, and checking both
    would have reported "not granted" to someone who had just granted it.
  - Files has no permission behind it — you grant access by picking the file —
    so the row now says so instead of looking like something you forgot.

### Known limits

- Unchanged from v0.1.1: opening an app that is already running resumes it where
  you left it, so a screen task can land inside the wrong screen. TALOS says it
  could not get there rather than claiming it did.

## v0.1.1

### New

- **The screen is read in the order you see it.** Numbering used to follow the
  accessibility tree, which is the order Android *built* the screen in, not the
  order it is drawn. On three real screens, only 0 of 19, 1 of 18 and 2 of 32
  indices matched what was actually on the glass. "Tap the first item" now
  means the first item from the top.
- **Controls with no text of their own get a name.** An icon-only button used
  to be anonymous, so there was no way to refer to it. It now borrows the first
  text found inside it, with a bounded search. The sticker button in a keyboard
  is addressable; before, it was a blank.
- **Three more ways to act:** long press, set a slider to a value, and open the
  recents screen — six actions in total, up from three.
- **Sliders are recognised by the range they expose,** not by their class name.
  This is why the previous build could describe a volume slider and not move
  it: the control reports itself as neither clickable nor scrollable, so every
  name-based check missed it.
- **Setting a value is checked by reading it back.** If the value did not move,
  TALOS says so — and distinguishes a control that refused, one that moved
  somewhere else, and one that moved partway.
- **First run says more and reads shorter.** The opening story covers eight
  things instead of five, including the three that were true in the README but
  missing from the first screen anyone sees: that TALOS acts inside other apps,
  that "done" is a verified state, and that it hears you with the screen off.
  Each is a line you open if you want it, so the page fits one screen instead
  of being a wall to scroll.

### Fixed

- **"Wi-Fi" and "wifi" did not match.** The hyphen became a space, so the most
  common word on an Android settings screen could not be found by the way
  people actually type it. Same class of miss for "E-mail", "Play Store" and
  "Non disturbare".
- **Automatic saving of generated documents was off, and nothing could turn it
  on.** A migration from a security review switched it off on every install —
  new ones included — while the default next to it still said on. A document
  the model made and you did not save scrolled away with the chat. It is on
  again, and turning it off on purpose now sticks.

### Known limits

- Opening an app that is already running resumes it where you left it, exactly
  as tapping its icon does. So "open Settings and tap the first item" can land
  inside whichever Settings screen was open last. TALOS notices and says it
  could not get there, rather than claiming it did — but it does not yet find
  its own way back to an app's starting screen. Forcing the app to restart
  would fix the navigation and throw away your half-written message with it, so
  it doesn't.

## v0.1.0

First public build. Signed APK, arm64-v8a, Android 8.0 or later, with build
provenance you can verify from the release page.
