# TALOS Desktop changelog

Format: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versions follow
[SemVer](https://semver.org/): in 0.y.z anything may still change. The version lives in
`package.json` and in the `desktop-vX.Y.Z` tag.

## Unreleased

## desktop-v0.1.13 — 2026-09-16

Same product as `desktop-v0.1.12`, which never published: its release job died building the
installer, and a published tag is never rewritten, so this attempt gets a new number.

### Fixed
- The installer now builds. The uninstall-page work added an NSIS variable used only by the
  uninstaller, but the installer build compiles the uninstaller in a separate pass (the template
  includes it only when `BUILD_UNINSTALLER` is defined); the variable was declared in both passes
  and used in one, and in this build every NSIS warning is an error — so the declaration now lives
  only in the pass that uses it. The 0.1.12 run died exactly there: the uninstaller stub compiled
  clean, then the main compile failed on `warning 6001` treated as an error.
- A failed build no longer masquerades as success. The build script printed its failure and kept
  going with a zero exit, so the release job's build step passed and the install smoke failed
  seconds later against a truncated installer, reporting the smoke's confusion instead of the real
  cause. Measured locally: the deep build failure loads `signal-exit@3.0.7` (via
  `proper-lockfile`), which replaces `process.reallyExit` and zeroes the exit code with
  `code || 0` when the process ends by draining the event loop — an instrumented run showed the
  code at 1 in `beforeExit` and 0 at process exit. The script now exits non-zero explicitly at
  the moment of the failure.

## desktop-v0.1.12 — 2026-09-16

Same product as `desktop-v0.1.11`, which never published: its release job stopped at the
version-coherence gate (the package version was bumped without the lockfile), and a published
tag is never rewritten, so this attempt gets a new number.

Cure of the three findings from the engineering review of the keys work — no new features.

### Fixed
- With the desktop keyring scope, the installed app no longer falls back to the
  `OPENROUTER_API_KEY` environment seed: a provider without a key in the app's own keyring
  stays disconnected. Development from source keeps both paths.
- Two test files wrote scratch folders to real disk paths through the research orchestrator's
  disk-write ports; they now inject no-op ports.
- Coming from 0.1.10 or earlier, the first launch copies (never moves) your provider and
  search keys from the old keyring services into the app's `-desktop` namespace, pool and
  priorities included. Keys already in the app — or deleted there — are never touched: the
  copy happens once per machine (a marker file), providers with any trace in the new
  namespace are skipped, and a deaf keyring retries next boot instead of burning the marker.

## desktop-v0.1.10 — 2026-09-16

Same product as `desktop-v0.1.9`, which never published: its release job stopped at the
gates, and a published tag is never rewritten, so this attempt gets a new number.

### Fixed
- The gate that refused `desktop-v0.1.9` was the critical-tools hotfix transformer itself,
  failing closed exactly as its own guard test demands. Its last patch was anchored to a
  dispatch-ladder shape the kernel does not have: it sought `if (nome === 'leggi')` as the
  head of the chain, but the kernel dispatches `elenca` and `cerca` first, so `leggi` has
  been an `else if` at every commit the transformer ever existed in. That test lives in
  `test:puri`, which only the release job executes, so this release run was its first CI
  execution — the mismatch reached the tag undetected. Nothing unsafe shipped.
- The `prova` refusal now inserts as an intermediate branch of the chain the kernel
  actually has, still ahead of the legacy `prova` branch it must refuse; `elenca` and
  `cerca` never capture `prova`, so nothing about the refusal changes.

### Verification
- Full `test:puri` locally, 60 tests, 0 failures, 4 declared-premise skips, with the
  desktop dependencies installed the way the runner does; the transformer test applies
  the four HIGH findings to the real kernel, 2/2.

## desktop-v0.1.9 — 2026-09-15 (tag only, no release published)

### Added
- **Built-in assistance.** A new `/api/v1/assistenza` route answers questions about the product from
  the `docs/assistenza` corpus shipped with the repository, returning quoted sources for every claim.
  A question outside the corpus gets an explicit "I don't know" rather than an invented answer.
  Requests accept a single bounded `domanda` field (1–500 characters), and the route is listed in the
  HTTP inventory. The corpus carries its own adversarial verification script (`verifica-ancore.mjs`)
  that checks every quoted anchor against the page it cites.
- **Multiselect with one batch delete.** Library, notes, tasks, memory and research lists support
  selecting several entries and deleting them with a single confirmation. Partial outcomes stay
  visible — which items were deleted, which failed and why — and the failed ones can be retried.

### Changed
- Streaming renders smoother: the cursor and the fade reach the DOM on the next frame instead of
  accumulating, and the `desktop-streaming-red` workflow now also runs the STREAMING-LIVE-SMOOTH-03
  coverage.
- The improve-prompt panel gained clipboard copy; the voice module and the detail-list section were
  adjusted for the batch selection flow.

### Verification
- Full server suite (3028 tests) green on a fresh install; kernel suite 597/597; the fused parity
  spec runs the phase-3 flows (assistance against the real corpus, batch selection, smooth streaming)
  6/6 against a fresh build; the lab suite runs 135/135.
- The batch response keeps the refined #9 shape: counts live in `riepilogo`, per-item outcomes in
  `esiti[]`; the frontend reads exactly that shape, not the older flat draft.

## desktop-v0.1.8 — 2026-09-14

### Fixed
- Desktop response streaming now renders received text without the artificial fade/typewriter backlog. Embedded hosts retain their own animation preference.
- Prompt Enhance now uses the provider and model selected by the current session. Direct-provider sessions no longer require an unrelated OpenRouter credential.

### Verification
- Browser coverage checks streaming order and completeness, a final drain within two frames, embedded isolation, and the Prompt Enhance flow through the real HTTP route to explicit replacement in the composer.
- Provider responses in the browser integration test are deterministic fixtures; no live-provider quality benchmark is claimed.

## desktop-v0.1.7 — 2026-09-14

Same product as `desktop-v0.1.6`, which never published: its release job died at the gates. For the
seventh time in a row, not one of the failures was the product — all three were tests describing the
machine they were written on.

### Fixed
- A test handed a session the **system temp folder** as its workspace, and the registry puts a real
  watcher on a session's workspace. On a GitHub runner that folder has a short 8.3 name, libuv then
  fails an internal assertion and **aborts the process**, taking the whole file down with it — while
  the same file ran green locally. The fixture now lives inside the repository, under a folder git
  already ignores, which always has a long name. It is the same cure the watcher's own tests took on
  13/09; it had simply never been applied here.
- Two guard tests asserted as a hard premise that `/Users` and `src` answer yes to the disk. That is
  true on the machine where they were written and false on a runner working from `D:`. The premise is
  now declared, and the case is skipped with its reason when it does not hold. What those tests
  actually watch — a malformed folder is refused and no child process starts — is unchanged.
- One cache test relied on a new file moving the containing folder's mtime. It does on this machine's
  NTFS; it did not on the runner. The test now moves the mtime itself, so it measures the cache
  rather than the timestamp resolution of whatever disk it runs on.

## desktop-v0.1.6 — 2026-09-14 (tag only, no release published)

Everything below it was prepared and never reached anyone: `desktop-v0.1.5` was written but never
tagged, and the five tags before it stopped at the gates. This one carries all of that work plus
what the product gained since.

### Added
- **A message queue that belongs to the session, not to the window.** Type while a run is going and
  the message waits its turn; open the same session in another window, or reload, and the queue is
  still there with its position. After you stop a run the queue says it is paused instead of
  promising to send at the end of a turn that is no longer running.
- **The model can edit a file** instead of rewriting it whole, and that edit asks for its own
  permission.
- While the model is thinking you now see **one** indicator, and it says what the model is thinking
  about. That reasoning is **compressed rather than hidden**, and it survives a reload — reopening a
  session no longer loses how much the model reasoned.
- `TALOS_MCP_STARTUP_CONCURRENCY` (1..8, default `1`): how many trusted MCP servers start at once
  when a session begins. Starting a server is waiting, not computing, so raising it shortens
  startup when you trust several servers. Off by default, and any malformed value falls back to `1`
  rather than refusing to start.

### Fixed
- Changing your mind mid-run is no longer treated as a failure: no red card, no error wording, and
  pressing Enter twice does not redirect the run any more.
- A session that is still alive reopens as alive, phantom turns no longer appear in the list, and a
  stopped run does not colour its tick red.
- The terminal kept its whole output in memory when a single burst was larger than the declared
  200,000-byte cap — a `cat` of a big file, for instance. The cap now holds in that case too, and
  the trim never splits a UTF-8 character, so nothing the shell never wrote can appear on screen.
- A terminal watched from a second window was treated as abandoned and killed ten minutes later.
  "Orphaned" now means nobody is watching it.
- Two overlapping scheduler ticks could start the same automation twice — two real, paid sessions.
  One turn at a time now.

### Security
- File names coming from the model can no longer step outside the Notes, Tasks and Memory folders.
  Confirmed live before it was fixed: a delete removed a file outside the store.
- `.mcp-trust` and `.plugin-trust` are control files, like `.hooks-trust` already was. Without that,
  a write tool could grant itself trust for MCP servers and plugins with no approval.
- Exporting a Library file into the workspace now reads bytes as bytes. A `.docx`, a `.pdf` or any
  other binary used to arrive irreversibly corrupted while the tool reported success with a byte
  count that was not the file's.

### Changed
- Release notes are now written in English, like everything else that gets published, and they
  carry this changelog section. A tag whose version has no section in this file is refused before
  the build starts.

## desktop-v0.1.5 — 2026-09-13 (never tagged, no release published)

Carries everything below. The five tags before it published nothing, and not once was the product
at fault: every time a test or a build script described the developer's machine instead of the
software.

### Fixed
- The release smoke test could not start on a clean CI machine. It asked the system for the Node
  executable and passed the answer straight to the process launcher, but a machine with more than
  one Node on its path answers with a list, not a single path. The developer's machine has exactly
  one, so the fault was invisible here. It now takes the first match, the one the path would pick,
  and refuses to continue if there is none.

  Worth recording: the run that found this had already installed the application in 81 seconds,
  started it, closed it and uninstalled it, leaving no stray processes, no shortcuts and the user
  data intact. The product passed. Only the script that watches it did not.

## desktop-v0.1.4 — 2026-09-13 (tag only, no release published)

Carries everything below. The four tags before it published nothing: their release jobs stopped at
the gates, and a published tag is never rewritten, so each attempt gets a new number. Not once was
the product at fault: every time it was a test describing something other than the software.

### Fixed
- Two browser tests that had been failing for days. The first refused an image the app serves at
  runtime, because the test's bundler read the address as a path on disk; addresses are now left to
  the network, exactly as fonts already were. The second waited for a message the product no longer
  writes: the component's wording changed twice after the test was written, so the test hung for
  thirty seconds and reported only a timeout. It now expects what the product actually says, still
  as an exact match, so it fails again if that path stops working.
- Both of those gates now name what they refuse and what they saw instead of failing silently.
  The silent version cost two release attempts before the cause was visible.

## desktop-v0.1.3 — 2026-09-13 (tag only, no release published)

Carried everything below it at the time:

### Fixed
- Test teardown on Windows. A test deleted its temporary folder and the deletion failed with
  "directory not empty", because a file handle closes a few milliseconds after the test ends. The
  same test passed locally and had passed on the previous CI run, which is what a race looks like.
  The deletions in that file now retry briefly, using the options the runtime provides for exactly
  this case, and still fail loudly if the folder never empties. The rest of the suite does the same
  unretried deletion in many other files and is recorded as open work.

## desktop-v0.1.2 — 2026-09-13 (tag only, no release published)

Carried everything below it at the time:

### Fixed
- A test wrote into the drive root and, on a machine where that succeeds (a CI runner running as
  administrator), reached a cleanup path that used a function it had never imported. It now
  imports it, and says out loud that the premise about drive-root permissions does not hold there.
- The folder watcher tests no longer build their fixture inside the system temp folder. On GitHub
  runners that folder has a short 8.3 name, and libuv then fails an internal assertion and
  **aborts the process** instead of failing a test, taking the whole suite down with it. The first
  attempted cure was wrong and is documented as such in the test: resolving the real path does not
  expand short names on Windows. The fixture now lives inside the repository, under a folder git
  already ignores, which always has a long name.

## desktop-v0.1.1 — 2026-09-13 (tag only, no release published)

Compared with the `desktop-v0.1.0` tag:

### Fixed
- Release pipeline: tests that measure the development repository (per-folder agent
  instructions, mockup fidelity, a benchmark against an old commit) now declare themselves
  skipped in the public tree instead of failing; tests that assumed the owner's machine
  (short 8.3 temp paths, a non-writable drive root, Italian PowerShell messages) now hold on a
  GitHub runner too.
- `labs/feature-flags.json` ships with the package: it is product configuration read by the
  server (`TALOS_LABS`).
- First-run: with the local engine selected and no model on disk, the setup screen listed the
  cloud catalogue; it now lists only local models and says when there are none.
- Downloading a model without a licence field answered "Internal error"; the request is now
  rejected up front with the missing field named.
- The session list showed the raw local model identifier (`local:…-gguf`); it now shows a
  readable name.

## desktop-v0.1.0 — 2026-09-13 (tag only, no release published)

**What it does not do yet:** it is not code-signed (Windows shows SmartScreen), it does not
update itself, it ships no GGUF models (download them from the app), and it has not been tested on
Windows 10 1809 nor on a machine without a Vulkan driver. With very small models a run that uses
a tool may stop at the second turn.

### Added
- **Electron 44.3.0** shell of the same TALOS interface, with Node included, local service,
  kernel and context engine.
- **Per-user NSIS installer**, no administrator rights, **unsigned**, plus a complete zip; user
  data is kept after uninstall.
- **llama.cpp b10517** engine, CPU and Vulkan builds, bundled and verified by SHA-256; GGUF
  models are not bundled.
- The local engine is chosen from the machine: Vulkan only if it lists a device; if the card is
  missing or lost while loading, the model restarts once on the processor; **Local engine** menu
  (Automatic · Graphics card · Processor); engine state in the Model Lab.
- Windows release workflow for `desktop-vX.Y.Z` tags: regression gates, build, silent install /
  start / reload / uninstall smoke test, SHA-256 sums and provenance attestations.

### Changed
- Project licence: **AGPL-3.0-only** across the monorepo; third-party components keep their own
  licences.
- The public repository is a monorepo: the mobile app in `mobile/`, the desktop in `harness-ui/`
  and `context-engine/`.

### Security
- No telemetry. Remote providers and model downloads use the network only for that action.
- Renderer without Node or preload, context isolation and sandbox on, navigation and new windows
  outside the local origin blocked (official Electron security checklist).

### Measured (owner's machine: Windows 11 Pro 26200 x64, Ryzen 7 7800X3D, ~32 GB RAM)

| Measure | Value |
| --- | --- |
| Installer | **145.0 MiB** (152,067,178 bytes) |
| RAM at rest, shell + service | **611 MiB**, 10 s after the page is ready |
| First visible window | **3.82 s** from the instrumented launch of the installed executable |
| Download of a 639 MB GGUF from Hugging Face, checksum verified | 15 s |
| Model load on Vulkan (0.6B, Q8_0) | 2.1 s |
| First response token, local model, no tools | 125 ms |

Times are measured with Playwright and do not include a manual double-click or SmartScreen;
they are not a guarantee on other machines.
