# F2 — Chat + Composer Calm + Capability Parity · Execution Ledger

Plan §6/§6-ter/§6-quater. Base: `lane/kimi-mobile` @ `7463779` (F1 committed). Zero git ops (owner commits; the F1
one-time authorization is SPENT). Method: research → ledger → RED → GREEN → gates → capture-inspect → APK F2.

## Scope (exact, priority order)

### T0 — Owner feedback quick fixes
- [x] Header height 48→56px (`h-12`→`h-14`, px-3) — owner: "troppo stretto". Verify visually + E2E 44px targets stay green.

### T1 — Research dossiers — **COMPLETE** → `research/2026-07-22-talos-mobile-f2-capability-research.md`
- [x] **Streaming**: matrix (Anthropic✓ header dangerous-direct-browser-access / Gemini✓ alt=sse / OpenRouter✓ /
  OpenAI✗ / DeepSeek? / Ollama✓ con OLLAMA_ORIGINS) + architettura ATTEMPT-AND-FALLBACK (fetch SSE → su errore
  pre-first-byte fallback trasparente al path CapacitorHttp bufferizzato esistente; durable write solo a fine stream;
  stop=abort; hint `stream_capable` non gate) → gli errori di matrice sono innocui by-design.
- [x] **Dictation**: ADOPT `@capacitor-community/speech-recognition@7.0.1` (peer `core>=7` → Cap 8 OK); Android
  SpeechRecognizer nativo; partialResults → draft; unavailable-state onesto su web/permessi negati.
- [x] **Biometric**: CANDIDATE `@aparajita/capacitor-biometric-auth@10.0.0` (peer da verificare al gate install);
  app-lock opt-in in Settings, flag non-segreto in Preferences, unlock a cold-start (+resume opzionale), fallback
  credenziale device; Keystore invariato; niente finta sessione server.
- [x] **Intro modal**: spec v3 desktop letta (claim classification Available/ROADMAP-chip, contratto versionato
  intro-version, replay da Settings); mobile-truth: lista Available riderivata per la build mobile (registrata).
- [x] **Model attribution RISOLTA** (AUD-003): desktop = riga `talos-message-meta` `[label][meta][time]` con
  label 'Tu'/'TALOS'/'Sistema', meta = `metadata.summary` underscore→spazi (fonte del "talos DeepSeek v4 pro"),
  time = formatTime. MOBILE (pari-o-meglio): stampare provider+display_name del modello REALE nel metadata del
  messaggio assistant alla completion → meta row con attribuzione vera + relative time.
- [x] Haptics: ADOPT `@capacitor/haptics@8.0.2`.

### T2 — Thread calm restyle — **CORE COMPLETE** (typecheck 0 · chat+screens 228/228)
- [x] `lib/relativeTime.ts` (Just now/2m ago/3h ago/2d ago ladder, fail-closed) + meta row renders it.
- [x] Same-sender grouping: `data-grouped`, mt-1 vs mt-3 spacing, tail radius + meta row solo a fine gruppo.
- [x] FRIENDLY model attribution: `modelLabels` prop (id→display_name) cablata da ChatScreen (controller.profiles);
  raw id solo come fallback. (Pari-o-meglio del desktop summary.)
- [x] Typing indicator 3 punti 6px staggered (CSS `talos-typing-dot`, reduced-motion safe) + sr-only Processing.
- [x] T6.5 causa #1 applicata: ChatScreen surface `bg-transparent` sopra lo stage motion (parità desktop).
- [ ] Visual capture inspect (in corso) + acceptance T6.5 su device al gate APK.
(Original spec below.)
- Message grouping (consecutive same-sender gap 4px, tail on last), relative timestamps ("Just now", "2m ago"),
  typing indicator 3-dot staggered (replaces static "thinking"), code COPY button + language label (verify present),
  per-message model attribution (T1 contract), calmer bubbles (user accent-soft right, assistant low-container left),
  spacing 16-20px, type roles. Files: `TalosMobileMessageList.vue`, `TalosMobileMessageContent.vue`,
  `TalosMobileStatusMessage.vue`, message meta components. RED per behavior.

### T3 — Composer calm restyle
- Pill-style card, controls decluttered (icon row grouping, overflow where sensible), 44px, auto-resize kept,
  popovers calm, mic button placeholder wired to T5. Preserve ALL existing functions (model/effort/attach/context/
  browse/enhancer/slash). Files: `TalosMobileComposer.vue` + pickers/popovers.

### T2b — OWNER (in-flight): assistant = FULL-WIDTH SECTIONS default (desktop parity) + toggle
- [x] `talosChatLayout.ts` + `talosTypes.ts` RE-SYNCED from frozen desktop (lane copy predated freeze: gains
  `message_style: 'sections'|'bubbles'`, default sections, exact options copy).
- [x] MessageList: assistant renders full-width section (no bubble surface) under sections; bubble = opt-in;
  user always bubble. ChatScreen passes persisted `chat_layout.message_style`.
- [x] Appearance: "Chat message style" select (desktop options) + helper union widened.
- [x] **T3.6 IMPLEMENTED**: `stores/settings.ts` +`shell.immersive_header` (parse fail-closed, persisted, setShell);
  NEW `components/shell/TalosMobileImmersiveChrome.vue` (floating pills + top fade + 3-dot options menu New/Rename/
  Delete su sessione attiva con dialoghi, copy parity); `App.vue` conditional header↔chrome; Appearance switch
  "Immersive header". Mocks aggiornati (chatScreen + appearance panel). **typecheck 0 · 302/302 (56 file).**
- [x] T3 composer calm: card rounded-2xl/blur/quiet shadow, send circolare pressable, popover rounded-xl (14/14).

### T3.6 — OWNER (screenshot ChatGPT): IMMERSIVE HEADER toggle
Toggle (Appearance, default OFF = classic header): header bar disappears → floating circular pills over a light
top fade (scroll continuity): LEFT hamburger→sidebar; RIGHT **3-dot chat options** (REPLACES New Chat: menu = New
chat / Rename chat / Delete chat on the ACTIVE session, dialogs reused). New Chat remains in sidebar. Mobile-first
innovation (design-lead): desktop adoption noted in backport ledger. E2E nav contracts unaffected (default OFF).

### T4 — Streaming (capability-gated per T1 matrix)
- Provider adapter streaming path (fetch/SSE) where viable; graceful buffered fallback; stop button; stream-safe
  persistence (chunks → final durable write; no partial-message corruption on kill). RED: stream reducer + fallback.

### T5 — Dictation (mic in composer)
- Plugin pin + permission UX + press-hold or toggle capture → text into draft; honest unavailable state. RED contract.

### T6 — First-run onboarding + Intro modal + App-lock
- Onboarding: welcome → add key → pick model → start (skippable, no fake progress).
- Intro modal mirrored from desktop spec; "seen" persisted locally.
- App-lock: enable in Settings (Account section) — local credential + optional biometric unlock; lock on cold start
  + optional on background; Keystore-backed; fail-closed honest states.
- Haptics: light impact on primary actions (send, session switch) via official plugin, §4.2 record.

### T6.5 — DEVICE DEFECT (owner, APK F1): animated backgrounds don't run — make them work OPTIMALLY
Suspected causes to verify in order:
1. **Layering/opacity**: F1 App puts `TalosMobileBackground` at z-0 with content z-10 — chat/screens set OPAQUE
   `bg-[var(--talos-background)]` on their sections → the stage may be fully covered (desktop keeps surfaces
   translucent over the stage). Fix: content surfaces transparent/soft over the stage like desktop.
2. **Prefs wiring**: wrapper may still resolve with `settingsPreferences: {}` instead of the PERSISTED Motion V6
   subtree Codex's Settings write (Appearance→Motion controls must actually drive the renderer).
3. Calm default has background OFF by design — verify the Appearance toggle path turns it on live, and legacy themes
   (with scenes) animate on device; phone perf caps (fps/dpr per preset profile) honored; reduced-motion respected.
Acceptance: enable background under calm + switch to a legacy theme → visible smooth ambient animation on DEVICE
(and in Chromium capture with animations detectable), no jank, budget intact.

### T7 — Gates + APK F2
- Full unit + full E2E (+ new journeys: streaming fallback, dictation availability, onboarding, app-lock, intro) +
  budget 512000 + audit + diff-check + captures inspected (both modes) + cap sync + assembleDebug → **APK F2**.

## Status log
- 2026-07-22: ledger opened; T0 header fix applied (h-14). Next: T1 research dossiers.
- 2026-07-23: **T4 DONE (TDD end-to-end)**. Attempt-and-fallback shipped: `streamShared.ts` (SSE parser/accumulator
  + NDJSON line accumulator + `talosFetchStream`/`talosStreamText`, all in the LAZY provider graph); store streaming
  lifecycle (`streamingText`, `stopStreaming()`, honest `interrupted:true` partial persisted ONCE, abort ≠ error);
  routing in `buildChatCompletion` (pre-first-byte failure → transparent buffered retry; post-chunk error propagates;
  user abort NEVER refetches); registry lazy `streamComplete` forwarding; adapters: anthropic (SSE +
  `anthropic-dangerous-direct-browser-access`), openai-compatible ×3 (`choices[0].delta.content`; OpenAI CORS-blocks
  → runtime fallback), gemini (`:streamGenerateContent?alt=sse`), ollama (NDJSON). UI: live streaming section replaces
  typing dots once chunks arrive; composer Send→**Stop** while sending (emits `stop` → `chat.stopStreaming()`);
  controller closure forwards stream handlers. Contract updates: composer test now asserts Stop replaces Send;
  chatStore call asserts allow the handlers arg. Gates: typecheck 0, unit corpus **1101 passed** (122 files),
  initial-chunk gate **498,969/512,000 PASS** (T4 entry delta ≈ +2KB; heavy code lazy as mandated). Next: T5 dictation.
- 2026-07-23: **T5 DONE (TDD)**. Pin installed exact `@capacitor-community/speech-recognition@7.0.1` (peer core>=7
  OK; RECORD_AUDIO + RecognitionService queries arrive via plugin manifest-merge — app manifest untouched).
  `src/services/dictation.ts`: guarded engine — native = plugin (LAZY import) with LIVE partialResults; web =
  Web Speech API when present; else honest unsupported (mic hidden). `useTalosMobileDictation`: base draft captured
  AT START (typed text never lost), partials compose live into the draft, permission denied = honest error banner,
  stop/end → idle. Composer: Mic button (hidden unless supported, aria-pressed, pulse while listening) — DELIBERATE
  divergence from desktop's record→Whisper pipeline per T1 §4.2: on-device live STT is ≥ desktop on mobile (no model
  download, offline, live feedback). Gates: typecheck 0, corpus **1111 passed** (124 files), initial-chunk
  **503,077/512,000 PASS**. ⚠️ headroom ~8.9KB → T6 MUST land entirely in lazy chunks. Next: T6 onboarding+intro+lock.
- 2026-07-23: **T6 DONE (TDD end-to-end)**. (1) Settings store: `onboarding` subtree (versioned intro contract
  `{intro_version 0..65535, intro_outcome completed|skipped|null, setup_dismissed}`, fail-closed) + `security`
  subtree (`app_lock_enabled/app_lock_biometric` POLICY flags only). (2) `useTalosMobileIntroState`: mobile mirror
  of the desktop v3 gating — opens once per version AFTER hydration, never over boot logo/lock, session latch,
  idempotent persist, failed write = latch only (re-offered next cold start), replay allows one new outcome write.
  (3) `TalosMobileIntroModal` (async chunk, loads ONLY when gating opens): 6 slides, Back/Next/dots/Arrow nav,
  only current slide mounted, MOBILE-TRUTH claims — AVM = Available-on-desktop + ROADMAP chip on mobile; MODELS =
  keys in device Keystore (server-side claim removed); CONNECTED = real stations (Chat/Research/Runs/Context),
  memory→roadmap; closing one-person note kept, Patreon/Ko-fi hidden (no runtime link config on mobile = spec-honest).
  (4) Replay chain: Account tab became a REAL local panel (was gated) — "Replay introduction" leaves Settings first;
  registry characterization tests updated deliberately. (5) First-run setup checklist in the chat welcome: REAL state
  only (key = any profile has_secret; model = selected), links to Settings→Models, dismiss persists. (6) Haptics pin
  `@capacitor/haptics@8.0.2`: guarded `talosLightImpact` (lazy, decorative, never throws) on send/session switch/unlock.
  (7) App lock: pin `@aparajita/capacitor-biometric-auth@10.0.0` (deps-only, core ^8 OK); `services/appLock.ts` —
  PBKDF2-SHA256 210k + 16B salt in OS Keystore (PIN never stored), constant-time-style compare, fail-closed verify;
  `TalosMobileLockScreen` (async, armed only when flag AND real PIN record; biometric attempt on mount when opted-in;
  NO skip path); Account panel: enable→PIN setup w/ mismatch honesty, disable→record+flags cleared together,
  biometric switch only when device really has it. Gates: typecheck 0, corpus **1154 passed** (131 files),
  initial-chunk **508,107/512,000 PASS** (T6 entry delta +5.0KB: gating+store+async loaders; heavy UI all lazy).
  ⚠️ headroom ~3.9KB. Next: T6.5 device-background acceptance + T7 full gates → APK F2.
- 2026-07-23: **T6.5 ROOT-CAUSED AND FIXED (the device defect)**. The background wrapper fed motion preferences
  under the key `motion_v6`, but the migration contract reads **`theme_motion_v6`** (desktop settings key) — the
  user's settings were SILENTLY ignored and the renderer never left the default `mode:'off'`. Suspect #2 was right
  after all; the earlier clearance was wrong (right object, wrong key). Fixes: (1) wrapper key corrected + permanent
  regression pair `motionV6WorkspaceKey.test.ts` (right key → v6/complex honored; wrong key → default off, documents
  the defect); (2) UX trap removed — `background_enabled` defaults true while `mode` defaults off, so the Appearance
  "Background motion" switch LOOKED on with nothing moving (the exact device symptom): the switch now reflects the
  EFFECTIVE state (`enabled && mode!=='off'`) and turning it on promotes mode→'simple'; legacy panel/background tests
  updated to the new contract. Acceptance (Chromium frame-diff, rebuilt bundle): **calm animated=true, aurora
  animated=true**, canvas 390x844, raf-active, per-preset fps/dpr caps intact (30fps/1.25dpr).
- 2026-07-23: **T7 GATES + capture fixes**. E2E: config-level storageState seeds the intro as seen (existing 31
  journeys untouched by the modal); NEW `mobile-f2-journeys.e2e.spec.ts` — 6 journeys (intro complete/skip persist,
  checklist honest steps+dismiss persist, immersive toggle pills+options, Account replay, app-lock arm→cold-gate→
  wrong-PIN-honest→unlock). Streaming mocks upgraded via shared `completionMock.ts`: `stream:true` requests get REAL
  SSE (openai-compatible + gemini variants) so E2E exercises the native streaming path end-to-end; thread-parity 429
  turn now expects the stream attempt AND its transparent buffered retry (5 wire calls, F2-T4 contract).
  **Full E2E 37/37 GREEN.** Ultra-critical capture inspection (12 shots) found 2 real defects, both fixed TDD:
  (a) USER messages carried model attribution ("You Gemini Live") — semantically wrong, attribution is now
  assistant-only; (b) immersive mode let messages slide under the floating pills — `pt-14` clearance on the scroll
  container when immersive. Final: unit **1161 passed** (133 files), typecheck 0, initial-chunk **508,113/512,000
  PASS**, npm audit 0 vulnerabilities, cap sync 13 plugins (biometric/speech/haptics registered, manifest-merge OK).
  **APK F2 BUILT** (JDK 21 isolated at `%LOCALAPPDATA%\jdk21`, JAVA_HOME required — AGP needs 17+, Capacitor 8
  toolchain needs 21): `android/app/build/outputs/apk/debug/app-debug.apk`, **39,868,713 B**, SHA-256
  `F3A12630316DFE3B64B0C0D60CAEA4EF44B8E8529AD3F76199708046FBBB1037`. SF-critic subagent launched; verdicts to be
  recorded below before the F2 commit.
- 2026-07-23: **SF-CRITIC VERDICTS (15 findings) — 12 implemented in F2, 3 deferred to F3 with reasons.**
  IMPLEMENTED: #1 scroll anchoring (anchor to newest on hydration/session switch, smooth-follow during streaming,
  120px "reader scrolled up" guard); #2 dead `font-brand` → `talos-orbitron-brand` on the TALOS eyebrow/wordmark
  ONLY (brand-moments rule: slide titles and "…is locked" back to UI font); #3 textarea NEVER disabled while
  sending (keyboard/focus preserved; contract test updated deliberately) + Send↔Stop is now ONE persistent shell
  with a 150ms glyph crossfade; #4 immersive safe-area (`calc(3.5rem+inset)` content clearance, `calc(4rem+inset)`
  fade); #5 immersive 3-dot menu: outside-tap scrim, Escape, `role=menu/menuitem`, focus-on-open, 150ms
  origin-top-right transition; #6 streaming live region → static sr-only "Receiving response" only (token spam
  removed); #8 meta row: `·` separators, "just now" lowercase, 11px, shared 30s `now` ticker so labels age;
  #9 44px targets (checklist X, both app-lock switches with expanded hit areas, rename input); #11 intro pager:
  200ms directional slide-fade, pointer swipe (≥48px), Back slot always reserved (footer never jumps), pager dots
  `aria-hidden`; #13 radial scrim behind the hero when a motion scene runs; #14 lock screen: autofocus (PIN-only),
  `maxlength=8/pattern/enterkeyhint`, spinner while verifying; #15 (partial) markdown chunk preloaded at first
  stream token (no plain→formatted flash). DEFERRED→F3 with reasons: #7 actions reveal-on-tap (interaction-model
  change, belongs in F3 thread polish; grouped-only render considered but kept for message-level actions parity);
  #10 settings chrome dedup (F3 IS the settings/stations calm phase — owner feedback below confirms);
  #12 composer icon accent discipline (F3 composer polish, cosmetic). Budget after fixes: entry crept to 516,754 →
  recovered by making the immersive chrome an async chunk (default-off toggle): **510,958/512,000 PASS** (⚠️ ~1KB
  headroom — F3 must start with an entry-split plan). Re-gates: unit **1161**, E2E **37/37**, typecheck 0.
- 2026-07-23: **OWNER FEEDBACK (APK F2 on device) — F3 backlog, ACKed:** (1) header still too short: +30–50px;
  (2) hide the composer effort button when the model has no effort support; (3) drawer animations missing;
  (4) fullscreen-modal presentation BROKEN (setting does nothing) — fix AND make fullscreen the default;
  (5) sidebar full-width by default; (6) calm theme has NO motion scene — give calm a real ambient scene;
  (7) background intensity default to minimum; (8) drawers have inconsistent and too-low heights — unify taller;
  (9) verify calm is the default theme on device; (10) sidebar-station internal navigation (Settings etc.) is
  confusing/unintuitive — rework against our UI thesis (matches SF-critic #10);
  (11) **TONE SYSTEM (owner, 2026-07-23)**: the hardcoded mobile system prompt ("precise engineering copilot")
  makes EVERY reply engineering-grade — wrong for casual asks (pancake recipe ≠ whitepaper); desktop does not
  behave this way (verify desktop's prompt approach for parity during implementation). Build in F3: a dynamic
  tone preference in Settings (selectable presets folded into the system prompt); the model detects from the
  conversation when the active tone fits poorly and SUGGESTS a switch — NEVER auto-changes — surfaced to the
  user as a toast notification; the user alone decides. Prerequisite: mobile toast infrastructure (F3 brings it
  for other notifications too).
