# F3 — Settings, Stations, Navigation & Polish (Calm UI Refactor, final phase)

**Opened:** 2026-07-23 · **Owner:** Fable (full mobile) · **Mode:** autonomous per the sanctioned modus operandi
(auto-commit at phase end, SF-critic subagent, APK delivered in chat, ultra-critical captures).
**Plan:** `docs/superpowers/plans/2026-07-22-talos-mobile-ui-calm-refactor-plan.md` §F3.
**Inputs:** owner device feedback 11 points (F2 ledger "OWNER FEEDBACK" section) + SF-critic deferred #7/#10/#12 +
entry-budget debt (510,958/512,000 → split required before ANY addition).

## Task order

### T0 — Entry-chunk split (technical prerequisite)
Headroom is ~1KB; F3 adds UI. Move default-hidden shell surfaces out of the entry graph (sidebar, tool sheet —
same pattern as the immersive chrome) and re-audit the entry composition. Target headroom ≥ 15KB. Budget literal
512,000 UNCHANGED.

### T1 — Owner quick wins (device feedback 1, 2, 5, 9, 6, 7)
- **(1) Header height**: still too short → +30–50px (56px → 96px `h-24`), title scale/leading rebalanced.
- **(2) Effort control**: hidden entirely when the selected model has no effort levels (not disabled — hidden).
- **(5) Sidebar full width by default** — verify + enforce (device showed otherwise).
- **(9) Calm default on device** — verify the persisted-theme default path (fresh install → calm).
- **(6) Calm motion scene**: give `calm` a REAL ambient scene (its own drawCalm exists — verify it renders
  visibly ambient, not near-static; tune so enabling Background motion under calm is clearly alive but quiet).
- **(7) Background intensity default → minimum** (defaults change: intensity to the low end; per-user persisted
  values untouched).

### T2 — Drawers & modals (device feedback 3, 4, 8)
- **(4) Fullscreen modal presentation is BROKEN**: the setting does nothing today — root-cause the
  `mobile_window_presentation` consumer chain, FIX it, and make **fullscreen the default**.
- **(8) Drawer heights**: inconsistent and too low → unified height contract (tall, consistent, safe-area aware).
- **(3) Drawer/sheet animations**: enter/exit transitions via the motion-v6 interaction engine (slide+fade,
  200-250ms, reduced-motion guarded) — none exist today.

### T3 — Navigation rework (device feedback 10 + SF-critic #10 + owner #12 "Claude pattern")
Settings/stations internal navigation is confusing: single sheet title, one contextual header with Back,
duplicate eyebrows/headings deleted, list→detail flow obvious, consistent with the calm thesis.
- **Owner #12 (2026-07-23, "alla Claude")**: on MOBILE, tapping the sidebar's Chats entry opens a DEDICATED
  chat-list page (like the Claude app) instead of listing sessions inline in the sidebar; on TABLET (wide
  viewports) the inline sidebar list stays. Apply the standing mandates: competitor research on the pattern
  (Claude/ChatGPT/Gemini chat-list ergonomics), maximum potential, one-up where structurally possible
  (e.g. search/swipe actions in the list page if competitors lack them locally).

### T4 — Tone system (device feedback 11)
- Mobile toast infrastructure (calm, reduced-motion aware, reusable).
- Tone preference in Settings (presets folded into the system prompt; verify the DESKTOP prompt approach first
  for parity guidance; engineering tone remains one of the presets, no longer the only voice).
- Model-driven tone SUGGESTION: detected from the conversation, surfaced as a toast — NEVER auto-applied;
  the user decides (tap to switch or dismiss).

### T4-bis — Claude-style composer drawer (owner #13, 2026-07-23, with screenshots)
Toggle in Settings → Appearance ("come fa Claude"): when ON, the composer's tool buttons (reasoning/effort,
context, browser, attachments, enhancer, slash…) move into an **ultra-organized bottom drawer** in the Claude
style (screenshot: "Aggiungi alla chat" sheet — big action tiles up top [camera/photos/file analogues → our
attach/vault], then clean toggle rows [Browse mode etc.], then chevron rows [tool access]). The composer bar
itself becomes minimal: **"+" button** (opens the drawer) + **model chip** (like "Sonnet 5 Pensiero" — model
name + effort/thinking state) + **microphone** + send — spaced ultra-coherently and harmoniously. Both modes
supported; toggle decides. Apply mandates: competitor fidelity to the screens, maximum potential, one-up.

### T5 — SF-critic deferred (#7, #12) + polish
- **#7**: message actions reveal on tap of the message (mobile-native hover equivalent), meta+actions merged rhythm.
- **#12**: composer icon bar accent discipline (idle glyphs muted, accent only for active states; provider mark
  constrained to the shared optical box).

## Program queue (post-roadmap, owner 2026-07-23)
**Claude functional-parity program**: the owner delivered a MAJOR normative proposal —
`docs/superpowers/specs/2026-07-23-claude-functional-parity-proposal-v2.md` (v2.0, 4791 lines, 275 sections:
agentic platform — run/task/tool-call/approval/artifact state machines, JSON-Schema+TS contracts, resumable event
protocol, durable execution, multi-strategy editing incl. AST/LSP/three-way merge, multi-level sandboxing +
credential broker, web/news/RAG with claim-level provenance, PDF/DOCX/XLSX/PPTX generation+verification pipelines,
secure artifact runtime, Vue/Nuxt integration, OTel observability, eval/fuzz/chaos testing, adopt/adapt/retain/
reject repo matrices). **Sequencing fixed by the owner**: implement AFTER (1) the style refactor completes (F3)
and (2) the mobile app reaches functional completion. Its own directive: audit the existing project FIRST and
adapt — never copy Claude, never swap stable components without verifiable motivation. Full integral read at
program start.

### T6 — Gates + APK F3
Full unit + full E2E (+ new journeys: presentation default/fix, tone suggestion toast, navigation flows),
budget, audit, diff-check, ultra-critical captures both modes → SF-critic subagent (evaluate/implement or
justify) → AUTO-COMMIT F3 → **APK F3 zipped in chat**. Then: roadmap-end desktop FE inspection + dual gap report
(mobile functionality 100%; desktop style alignment plan).

## Status log
- 2026-07-23: ledger opened on the owner's go ("procedi pure autonomamente con la tabella di marcia").
- 2026-07-23: **T0 DONE** — sidebar + tool sheet became async chunks (sidebar lazy-mounts at first hamburger tap):
  entry **437,756/512,000** (~74KB headroom; the sidebar graph alone was ~73KB of first paint). appShell tests
  updated to `vi.waitFor` (async SFC chunks resolve on a macrotask, not microtask flushes — probe-verified).
- 2026-07-23: **T1 DONE (owner 1/2/5/9/6/7)** — header 56→96px (+40, title rebalanced); effort control HIDDEN
  (not disabled) when the model exposes no level beyond 'off' (3 tests); sidebar full-width ROOT CAUSE: vendored
  DrawerContent forces `w-3/4 + sm:max-w-sm` via direction-variant classes that outrank plain `w-full` — overridden
  with the same variants (file is hash-locked, not editable); calm-default one-shot migration (persisted legacy
  'telemetry' default → calm once, `calm_migrated` flag makes re-chosen telemetry stick); calm scene made visibly
  ambient (horizon breathes 3.5%@0.35 + soft drifting veil — 1% drift read as static on device); mobile motion
  default `intensity: 0` (engine contract untouched — override lives in the settings store; scenes floor at 0.5x
  opacity so they stay visible). Motion suite intact 560/560.
- 2026-07-23: **T2 DONE (owner 4/8/3)** — presentation setting was save-only (NO consumer): ToolSheet now honours
  `mobile_window_presentation` (fullscreen = full viewport, no drawer chrome; drawer = FIXED h-[88dvh] so every
  station matches) + slide-up/backdrop-fade 250ms entrance; **fullscreen is the default** with a one-shot
  `presentation_v2` migration (the old 'drawer' persisted value was never a functional choice); model picker
  normalized to min-40dvh/max-70dvh.
- 2026-07-23: **T3 chrome dedup + Chats page DONE** — ToolSheet provides `TALOS_SHEET_CONTEXT_KEY`; screens inside
  the sheet drop their duplicate header (one title per surface), settings category pane's second heading removed;
  NEW `/chats` route + `ChatsScreen` (Claude pattern, owner #12): dedicated list page with instant local search,
  tap-to-open, per-row rename/delete dialogs, New chat — phones get the sidebar "Chats" entry (`md:hidden`),
  tablets keep the inline Recents list (`hidden md:block`). 4 screen tests + shell 75/75, typecheck 0.
  REMAINING: T4 tone system (toast infra + settings tone + suggestion), T5 SF-deferred #7/#12, T6 gates+captures+
  SF-critic+commit+APK F3 (zip in chat), roadmap-end desktop dual gap report.
- 2026-07-23: **T4 TONE SYSTEM DONE (owner #11)**. KEY FINDING: the desktop base prompt is the NEUTRAL "You are
  TALOS. Answer the user's message." — the mobile "precise engineering copilot" was an M2-lite invention and the
  root cause of the whitepaper-for-pancakes tone. Built: `lib/tone.ts` (4 presets — Balanced DEFAULT/Engineering/
  Friendly/Concise — folded into the desktop-parity base + `[TONE_SUGGESTION: id]` final-line protocol, extractor
  fail-closed: unknown ids strip silently, mid-body markers untouched); settings `tone` subtree + `setTone`;
  toast infra (`stores/toasts.ts` singleton + `TalosMobileToastRegion` above the composer, action button +
  dismiss, auto-expire, aria-live polite, 200ms enter); controller: tone-driven system prompt (+browse appendix),
  suggestion stripped from the durable reply → toast "The model suggests the X tone" with Switch — NEVER
  auto-applied; Assistant tone select in AI Defaults.
- 2026-07-23: **T4-bis COMPOSER DRAWER DONE (owner #13, Claude screenshots)**. `shell.composer_drawer` toggle in
  Appearance (default off): minimal bar = "+" (Add to chat) + model CHIP (provider icon + display name +
  effort/Thinking state, opens the existing picker) + mic + send; `TalosMobileComposerDrawer` (lazy chunk, in the
  offline preload): handle + X + "Add to chat", 3 big tiles (Attach/Library/Model Lab — act and close), toggle
  rows (Browse the web, Extended thinking — act and stay), inline effort radiogroup, Improve prompt / Refresh
  models rows; 250ms slide-up + backdrop fade. **CAPTURE-CAUGHT BUG**: the composer card's `backdrop-blur` is a
  containing block for `fixed` — the drawer rendered TRAPPED inside the card (147px, offset); fixed by
  Teleport-to-body (box verified 0,455 → 390x389). 5 drawer tests (teleport stubbed).
- 2026-07-23: **T5 DONE** — SF#7: per-message action rows render only at group end (next to the meta row);
  SF#12: idle composer glyphs muted (accent reserved for active states), provider mark on the shared optical box.
- 2026-07-23: **T6 GATES GREEN** — unit **1201** (139 files), typecheck 0, **E2E 37/37** (contract updates:
  settings heading → sheet-title dedup assertion; sidebar counts → Chats entry; persistence journey migrated to
  the Chats page with scoped selectors; poster test now PROVES the calm migration then the explicit-choice poster
  contract; airplane test exposed a REAL regression — lazily-split shell chunks weren't offline-warm → SHELL_CHUNKS
  added to the route preload), budget **448,656/512,000**, audit 0, diff clean. F3 captures (10) inspected
  ultra-critically → drawer containing-block bug found and fixed. **Owner mid-flight addition integrated**: the
  Claude functional-parity proposal v2.0 → specs + Program queue section above. SF-critic launched; verdicts below
  before the F3 commit.
- 2026-07-23: **SF-CRITIC F3 VERDICTS (12 findings) — 10 implemented, 2 partial with reasons.**
  IMPLEMENTED: #1 (BLOCKER) settings category list peephole — max-h-56 cap removed, pane flex-fills the sheet;
  #3 (light form) Escape + tabindex/-1 initial focus on ToolSheet AND ComposerDrawer (full reka focus-trap rebase
  deferred: invasive at phase close, both surfaces are single-interaction); #4 leave transitions (200ms fade+slide
  wrap in App/Composer; enter kept via entered-ref); #5 header intrinsic height `calc(3.75rem+inset)` + blur (h-24
  swallowed the notch on device); #6 Chats rows: icons muted (red only on the confirm dialog), secondary muted
  relative-time line; #7 fullscreen keeps ONE dismissal (Back) — X drawer-only; filler description fallback
  removed (render only real copy); #8 tone trigger shows the label only; #9 drawer honesty — false-affordance
  grabber removed, Improve prompt gated on canEnhance with honest title, Refresh models removed (Model Lab
  surface concern); #10 toast targets 44px + symmetric leave; #11 phone sidebar spacer pins Settings to the
  bottom edge. PARTIAL/DEFERRED with reasons: #2 switch unification — the unreadable no-thumb Appearance switches
  got real thumbs NOW; full one-Switch-component consolidation across native checkboxes → post-roadmap polish
  (multi-surface regression risk at phase close); #12 calm scene stroke softening — scene primitives are the
  shared 569-test motion engine, default intensity already minimum + hero scrim exists; retune WITH the owner on
  device (subjective ambience call). Re-gates after fixes: unit **1201**, **E2E 37/37** (2 ToolSheet contract
  tests updated to X-drawer-only; persistence row selectors moved to testid+hasText after the timestamp joined
  the accessible name), typecheck 0, budget **448,979/512,000**, diff clean.

## Post-F3 backlog (owner)
- **(#14, 2026-07-23) LAUNCHER ICON + SPLASH → CALM SEAMLESS BOOT**: the current icon/splash still use the
  pre-calm navy (#04070e) background — the "old icon on black" the owner sees. Rework: icon = the STATIC first
  frame of the boot logo (gold DAG-in-hexagon mark, NOT animated) on the CALM default background, and the native
  splash regenerated to the same calm ground, so icon → splash → animated boot logo reads as one seamless
  transition. Constraints: reuse the existing brand assets verbatim (logo-short.svg/png — never re-author the
  mark, standing owner rule); adaptive-icon safe zone as in the M1 icon pass (mark ~45%, foreground padded 80%);
  regenerate the 26 res PNGs + 11 splash PNGs via a sharp one-off (M1 precedent in scratchpad); consider the
  Android 13+ monochrome themed-icon layer as a bonus. Scheduled: FIRST task of the next mobile work block
  (after the roadmap-end desktop gap report).
- 2026-07-23: **#14 DONE — calm launcher icon + seamless splash.** Existing brand mark reused VERBATIM
  (logo-short.svg, currentColor→gold rasterization; never re-authored). Icon = gold mark on calm charcoal
  #211f1a (the preset's official signature pair — best launcher contrast); adaptive foreground mark 45%
  safe-zone, legacy 58%, round circle-masked. Splash rebuilt on BOTH grounds: light #f5f4f2 (drawable*) +
  dark #211f1a (drawable-night*, qualifier order fixed to land/port-night-density) with the gold mark at 24%
  — with mode=system the icon→splash→boot-overlay sequence is seamless in both light and dark. 37 assets
  regenerated size-preserving via sharp one-off (tools/android-assets sharp reused). Verified by extracting
  the compiled icon from the APK. Colors sourced from the REAL runtime tokens
  (`talosThemeModeVariantStyle('calm', …)`): light bg = color-mix 5% gold over #f8fafc → #f5f4f2.
- **(#15, 2026-07-23) NEW DEFAULTS (owner)**: immersive header ON, composer drawer ON, chat message size
  compact, renderer mode complex — all default; fullscreen modal already default (F3). One-shot `defaults_v3`
  migration (old persisted defaults were not choices); explicit post-migration choices stick.
- **(#16, 2026-07-23) CHAT EXPORT in the immersive 3-dot menu (owner)**: add "Export chat" to the chat options
  dropdown with ALL desktop export functions (evidence pack / transcript / context manifest / benchmark
  scenario — desktop `TalosExportDialog` + `/sessions/{id}/export`; on mobile = local-first generation + system
  share sheet). Matches gap report A.3-bis item 1. Scheduled: next mobile block, before/with Memory station.
- **(mic report, 2026-07-23)**: dictation mic missing on device — availability probe raced Android's
  RecognitionService at cold start and a single early false hid the mic forever; FIXED with retry/backoff
  (1s/3s/8s), honestly hidden only if genuinely unavailable.
- **(#17, 2026-07-23) Launcher icon zoom (owner, not urgent)**: enlarge the mark further in the app icon
  (beyond the 58% safe-zone foreground — evaluate cropping the faint hexagon padding or a tighter viewBox
  crop of the first-frame so the glyph reads bigger under launcher masks). Next phase.
- **(#18, 2026-07-23) MIC STILL MISSING on device (owner: "even with permissions granted manually") — NEXT
  PHASE, incorporated**: the backoff retry did NOT fix it → not (just) timing. Fix plan: (1) INVERT the
  pattern — on native the mic button is ALWAYS visible; unavailability is reported honestly AT TAP (the
  hide-if-unsupported design created an undiagnosable blind spot); (2) permission prompt at the RIGHT moment
  (intro CTA end or first mic tap), never at cold start; (3) in-app diagnostics row (Settings→Account:
  "Dictation: available/unavailable + raw plugin error") so the owner can report exact evidence without adb
  (host adb broken); (4) STRONG SUSPECT: plugin @capacitor-community/speech-recognition@7.0.1 targets
  Capacitor 7 while the app runs Capacitor 8 — verify runtime registration, migrate to a Capacitor-8-ready
  release if one exists.
- **(#19, 2026-07-23) PASTED LINK DISAPPEARS FROM THE MESSAGE (owner) — F4**: pasting a URL into the composer
  and sending strips it from the visible message. Preliminary triage: the browse-suggestion pipeline only READS
  the prompt (extractTalosBrowserUrls) and never mutates it — suspicion moves to the message RENDERING chain
  (markdown-it + DOMPurify config for user/assistant content) or the send path. MUST be reproduced with a
  failing E2E first (paste URL → send → text intact), then fixed. NOT related to missing browser function —
  the link text must survive regardless.
- **(#20, 2026-07-23) PROMPT ENHANCER BUTTON DISABLED (owner) — F4**: the feature IS implemented
  (provider-backed enhancement); on device the button reads disabled. Verify the gating chain
  (`canRequestEnhancement` = selected profile + non-empty prompt + not busy) against the real flow — esp. the
  drawer row with an empty prompt (honest but unclear UX) vs a genuine bug with text present. Reproduce, fix,
  and make the disabled reason VISIBLE (title/toast) so it never reads as "not implemented".
