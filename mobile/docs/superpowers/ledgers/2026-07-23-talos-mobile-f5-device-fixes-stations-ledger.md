# F5 — Device fixes, streaming UX, PIN modal, stations

**Opened:** 2026-07-23 on the owner's "VIA" · **Owner:** Fable (full mobile) · **Mode:** autonomous rite
(TDD, gates, SF-critic at phase end, commit, APK zipped in chat).
**Inputs:** owner F4-APK device feedback #29-#32 + queued #28 + SF-7 + stations (gap report A.3).

## Task order
1. **#29 MIC RECORDING DEAD AT TAP** *(blocking)* — permission granted, button visible, tap does NOTHING
   (no recording, no error). Every branch of the tap path must produce a user-visible state change;
   root-cause against the real plugin source; diagnostics row is the device evidence channel.
2. **#28 STREAMING SCROLL HIJACK + BACK-TO-BOTTOM** — a user scroll ALWAYS wins during streaming; floating
   back-to-bottom pill to rejoin the live edge.
3. **#30 ENHANCER DRAWER LOADER** — TALOS boot-logo line loader in the enhancement progress state.
4. **#31 CHAT ROW STYLE** — less rounded swipe rows; right-edge border bleed fixed.
5. **#32 PIN FULLSCREEN MODAL** — PIN setup/verify as a dedicated fullscreen modal surface.
6. **SF-7 SHEET MODALITY** — focus trap + inert for the composer sheets (deferred from F4).
7. **STATIONS** — Tasks, Notes, Doctor (gap report A.3 order; local-first, honest empty states forbidden —
   real local function).

## Status log
- 2026-07-23: ledger opened; starting #29.
- 2026-07-23: **#29 DONE** — root cause READ FROM THE PLUGIN SOURCE: with `partialResults` the native call
  resolves BEFORE listening; runtime recognizer errors are rejected on the already-released call (lost) and
  `stopListening()` emits no event → tap could die silently. The composable now owns liveness: 'starting'
  state at tap (spinner on the mic), 'listening' only on a REAL signal ('started' event now wired /first
  partial), an 8s watchdog when no signal ever arrives, an honest message when a session ends with zero
  recognized words, tap-again cancels; the dictation error banner moved NEXT TO the composer (was buried at
  the top of the thread). Composable 14/14.
- 2026-07-23: **#28 DONE** — gesture-sovereign live edge (`useTalosChatLiveEdge`, 7/7): active touch blocks
  auto-scroll outright, ANY upward scroll detaches (the old 120px threshold raced the finger against dense
  token bursts), programmatic scrolls are fingerprinted so they never count as gestures, instant (not
  smooth) follow during streaming; floating back-to-bottom pill above the composer rejoins explicitly.
  E2E 1/1 (hold position + pill + rejoin).
- 2026-07-23: **#30 DONE** — boot-logo line loader extracted to `TalosLineLoader.vue`, now carries the
  enhancer drawer's progress state (and the loading bubble reuses it).
- 2026-07-23: **#31 DONE** — rows `rounded-xl`→`rounded-lg`; the right-edge bleed was the TRAY showing
  through the content's rounded corners at rest → tray now exists only while the reveal is in motion/open.
- 2026-07-23: **#32 DONE** — PIN journey extracted to `TalosMobileAppLockModal.vue`: dedicated FULLSCREEN
  modal (setup 6-digit + confirm; verify with legacy 4-8 digit Confirm + biometrics); the Account panel only
  opens it and applies the outcome. Panel 9/9.
- 2026-07-23: **SF-7 DONE** — real modality behind aria-modal on the shared sheet shell: app root `inert`
  while open, Tab wraps inside, focus returns to the opener; the Add-to-chat drawer migrated onto the shared
  shell (DRY) so all four sheets get it. Sheet 3/3, composer suites 26/26.
- 2026-07-23: **F5 core gates** — unit 722/722 (120 files) · e2e 46/46 · TSC 0 · build green.
- 2026-07-23: **STATIONS DONE** — schema v4 (`talos_tasks` status/priority-constrained + `talos_notes`
  untrusted, no destructive migration); CRUD on all 3 repos via the shared contract; controller facades
  `tasks`/`notes`; screens Tasks (create title/description/run_id, todo→doing→done cycle, delete), Notes
  (untrusted banner + badge), Doctor (6 REAL probes: platform, encrypted storage + persistence state,
  recognizer diagnostics, biometrics, share bridge, network — zero invented tiers); routes/sidebar/sheet
  titles (10 tab routes); E2E journey: create → cycle → reload persists (the /notes sheet correctly
  restores over the chat — the test initially fought that and was wrong, not the product) → Doctor report.
- 2026-07-23: **SF-CRITIC (subagent) — 7 findings, all adjudicated, ALL FIXED:**
  - **SF5-1 BLOCKER**: the Android plugin's `stop()` NEVER resolves its call → tap-to-stop deadlocked
    dictation forever. Fixed: the UI goes idle immediately, engine teardown is fire-and-forget, session
    epochs make late events from dead sessions inert. Characterized IN-SUITE with a never-settling stop
    fake (reproduce-before-claiming).
  - **SF5-2 MAJOR**: recognizer death DURING listening was invisible (documented plugin behavior) — 15s
    inactivity watchdog re-armed on every partial ends the session honestly.
  - **SF5-3 MAJOR**: send-while-dictating resurrected sent text and the mic was un-stoppable while
    `sending` — `dictation.cancel()` on send (late partials dropped via epoch) and the mic button stays
    enabled whenever it is the STOP control.
  - **SF5-4 MAJOR**: the new PIN modal violated the SF-7 modality shipped the same phase — modality
    extracted to `useTalosModalSurface` (ref-counted inert, Tab trap, opener restore) and applied to the
    sheets AND the PIN modal.
  - **SF5-5**: inert now ref-counted; dead `<Transition>` around the Teleport-rooted drawer removed.
  - **SF5-6**: `normalizeStationTitle` (trim, 1..255) in BOTH repos for tasks/notes + maxlength on all
    station title inputs (device CHECK constraint can no longer diverge from the green gates).
  - **SF5-7**: web dictation stop→start race fixed with per-instance guards.
  - Dictation suite 17/17 (incl. the three SF characterizations).
- 2026-07-23: **F5 FINAL GATES** — unit 725/725 (120 files) · e2e 47/47 · TSC 0 · entry 462.8k/512k ·
  4 captures in `docs/superpowers/evidence/f5-captures/` (PIN modal + Doctor visually verified).

## F5.1 HOTFIX (owner F5-APK device report, 2026-07-23)
Symptoms: (a) mic tap still does NOTHING (not even the starting spinner); (b) Doctor stuck forever on
"Scanning device capabilities"; (c) the Model & reasoning drawer stays open after entering Model Lab;
(d) rename/delete chat dead and UNARCHIVE dead while archive worked once.
Reading: (a)+(b) share `loadPlugin()` — the dynamic import of the speech plugin never settles on device
(the spinner comes AFTER `await requestPermission()` → silent hang; Doctor awaits the same path);
(d) smells like the SF-6 write queue jammed behind ONE never-settling native transaction (reads keep
working, every later write pends silently). (c) is a plain bug reproducible in web.
Plan: 1) close the model drawer on Model Lab navigation; 2) timeout-fence `loadPlugin` (mic tap answers
within 4s, honestly); 3) timeout-fence every DB transaction (20s → visible error, queue survives);
4) per-probe timeouts in Doctor + in-app device issue log (ring buffer surfaced in Doctor) so the next
APK carries the exact evidence.
5) OWNER DIRECTIVE (mid-hotfix): replace slide-to-archive/delete with TAP-AND-HOLD → dropdown menu on the
   chat rows ("vedo sia molto meglio"). Swipe tray + SortableJS hold-drag REMOVED (hold now owns the
   dropdown; manual reorder deferred to an explicit mode later — sort_index model stays); row actions live
   in the long-press menu (Open, Rename, Archive/Unarchive, Delete).
6) OWNER (mid-hotfix): the enhancer RESULT panel is too verbose — compact the summary text and the
   applied-principles badges aggressively.
7) OWNER (mid-hotfix): the line loader is too big — bubble version sized like the old dots, enhancer
   version smaller too.
8) OWNER (mid-hotfix, BLOCKING RULE): markdown must render PROGRESSIVELY during streaming (today the text
   is plain until the message completes) — competitor pattern (Claude/ChatGPT). AND: from now on, EVERY
   implementation/bugfix starts with a web search for competitor best practices (rule saved to persistent
   memory `web-research-before-implementation`).
9) OWNER (screenshot): identity hallucination — DeepSeek answering "built by OpenAI (GPT lineage)". Not an
   app bug: the neutral system prompt declares no identity. Fix: identity grounding in the system prompt
   (TALOS = AVM local-first interface; underlying model = the ACTIVE profile provider/model; never claim a
   different lineage). Standard competitor practice (Claude/ChatGPT both self-identify via system prompt).

### F5.1 status (2026-07-23)
- FIX 1 DONE: Model & reasoning drawer closes on Model Lab navigation.
- FIX 2 DONE: `loadPlugin` timeout-fenced (4s) via new `talosDeviceLog.talosWithTimeout` — mic tap and
  Doctor can never hang on a never-settling dynamic import; failures land in the in-app issue log.
- FIX 3 DONE: every DB transaction timeout-fenced (20s) — a jammed native call now surfaces a REAL error
  (existing dialog/toast surfacing) and the write queue moves on.
- FIX 4 DONE: Doctor probes individually fenced (5-6s) + "Recent issues" ring-buffer section (device
  evidence channel, no adb needed).
- **#29 TRUE ROOT CAUSE (web research per the new blocking rule)**: Android 11+ package visibility — the
  app never declared `<queries><intent action=android.speech.RecognitionService>` so the recognizer binding
  dies silently on modern Android (plugin known broken on 13+; the fix is the documented Android manifest
  declaration). Added to AndroidManifest + contract test.
- 5 DONE: hold-dropdown replaces the swipe tray (unit 8/8, e2e migrated: f4-regressions + persistence);
  SortableJS removed; backdrop-dismiss guarded against the gesture-ending click (device-real bug).
- 6 DONE: enhancer result panel compacted (2-line clamped summary, tiny inline principle chips).
- 7 DONE: line loader shrunk (bubble 44px, enhancer 72px).
- 8 DONE: PROGRESSIVE STREAMING MARKDOWN — researched (Streamdown/markstream patterns), implemented
  in-stack: same renderer as final messages, ~120ms trailing throttle, unterminated fences auto-closed;
  extracted to dependency-free `streamingMarkdown.ts` after the static import dragged markdown-it into the
  entry (601k > budget; now 464k).
- 9 DONE: identity grounding in the system prompt — TALOS/AVM created by Antonio Rizzo (Ninozz95), active
  session model+provider declared; the model may no longer claim a foreign lineage.
- Final gates: unit 718/718 (120 files) · e2e 47/47 · TSC 0 · entry 464.2k/512k.
F5.2 plan (researched): migrate to @capgo/capacitor-speech-recognition 8.1.7 (maintained fork, real error
events with code/message, finite listeningState, forceStop/readyForNextSession — the community plugin is
natively broken on modern Android per Doctor evidence). Waveform: the fork exposes NO rms — ship a
partial-rate-driven reactive waveform now (spike on incoming speech, breathing while listening) and file an
upstream ticket (CODEX-F5-01) to contribute an `rms` event (Android onRmsChanged exists exactly for this).
Tablet sidebar fixed+resizable (Claude pattern) => F6.

### F5.2 status (2026-07-23)
- MIC: migrated to @capgo/capacitor-speech-recognition 8.1.7 (maintained fork; real `error` events with
  code+message, finite listeningState, crash fixes) after Doctor-ring evidence proved the community
  plugin's native available() never settles. Every plugin call fenced; runtime errors now land in JS and
  in the Doctor ring.
- WAVEFORM (owner): TalosMicWaveform strip in the composer while starting/listening — bars react to the
  incoming-speech level (spike on partials, decay to a breathing floor); the fork exposes no RMS →
  upstream ticket CODEX-F5-01 (contribute an `rms` event from Android onRmsChanged).
- DIALOGS (owner: hold→Delete/Rename did nothing): every hand-rolled Teleport surface renders on the
  owner's WebView while reka-ui Dialogs never appear → critical confirmations (Chats rename/delete,
  immersive rename/delete) moved to the device-proven `TalosMobileConfirmDialog` (manual Teleport + shared
  modality).
- Queued F6: tablet sidebar FIXED width + RESIZABLE (Claude pattern, competitor research first).
- Gates: unit 719/719 (120 files) · e2e 47/47 · TSC 0 · entry 466.3k/512k.

### F6 design input (owner screenshot, 2026-07-23)
Tablet sidebar reference: persistent LEFT chat panel (search + chat list + bottom "New chat" pill),
content on the right, VERTICAL DRAGGABLE divider (resizable width). Claude-tablet pattern confirmed by the
owner's screenshot.

### F5.3 status (2026-07-23)
- Doctor speech diagnostics v2 (owner: "debug più esplicativo"): per-STEP probes, each fenced and ring-
  logged — registered-in-native-runtime (sync, the killer question), import, getPluginVersion,
  checkPermissions, available; the Doctor speech row now prints the full step chain verbatim.
- RECORD_AUDIO declared EXPLICITLY in the app manifest (merged manifest already had it via the plugin,
  now independent of merging).
- requestTalosDictationPermission fenced + ring-logged (intro/first-tap path).
- Verified INSIDE the built APK: capgo plugin classes in dex, old community classes gone, plugins.json
  correct, RECORD_AUDIO + RecognitionService in the merged manifest.
- Gates: unit 719/719 · e2e 47/47 · TSC 0 · entry 467.2k/512k.
- OWNER (one-time): after these fixes, DO NOT stop — proceed automatically with F6.
