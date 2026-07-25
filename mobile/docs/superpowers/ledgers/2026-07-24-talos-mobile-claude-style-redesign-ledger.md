# Claude-style redesign batch (owner 2026-07-24, 3 screenshots)

Owner request: chat list + sidebar + settings styled like the Claude mobile app (LAYOUT similar,
TALOS identity kept — calm grey, gold accent, brand mark). Four pieces:

1. **Chat list** (screenshot 1): serif-weight screen title, search, rows, FAB "New chat" bottom-right.
2. **Sidebar** (screenshot 2): FAB "New chat" bottom-right + account avatar bottom-left.
3. **Local account with OAuth predisposed** (screenshot 3 account card): a LOCAL profile (name +
   avatar) stored on-device; "Sign in with Google/Apple" SCAFFOLDED (PKCE-ready) but honestly gated —
   the app is local-first with no backend, so the token exchange waits for M2/sync. No fake auth.
4. **Settings + all related screens** (screenshot 3): account card on top + grouped rounded cards
   (icon + label + sub-label), 8pt spacing, thumb-zone primary actions.

## Web research (rule)
- Claude mobile UI: minimal, primary actions in the lower thumb zone (FAB), grouped cards, 8pt grid,
  60/30/10 color. (claude.com docs, mobile UI guides)
- OAuth mobile: PKCE + authorization-code flow for public clients; `@Cap-go/capacitor-social-login`
  for native Google/Apple. BUT local-first + no backend → real exchange needs a token endpoint, so
  scaffold + gate honestly. (capawesome, capgo, Cap-go/capacitor-social-login)
- Frontend skill: keep TALOS identity; spend boldness in one place; accessible disclosure; quiet
  around the signature.

## Decisions
- Keep TALOS visual identity (Orbitron brand mark for the app name, calm grey, gold). Adopt Claude's
  STRUCTURE (FAB, grouped cards, account card), not its exact typography/colors.
- FAB = shared `TalosMobileNewChatFab` (white/accent pill, + icon, "New chat", bottom-right, shadow,
  safe-area, reduced-motion press). Used by ChatsScreen and the sidebar.
- Local account = `stores/account.ts` (display_name, avatar_initial, optional email, auth_provider),
  persisted in Preferences. OAuth buttons present + gated (`coming with sync`).

## Status log
- 2026-07-24: ledger opened; research done; starting the two FABs.
- 2026-07-24: **MIC ROOT CAUSE FOUND + FIXED (deep debug paid off).** Owner's Doctor (build 809a3a5)
  showed `resolve:FAIL TALOS_SPEECH_STEP_resolve_TIMEOUT` on a STATIC `return SpeechRecognition` —
  impossible in normal JS. Root cause: a Capacitor plugin proxy is THENABLE (get-trap returns a
  caller fn for EVERY prop incl. `then`), so `await proxy`/`return proxy` from an async fn
  assimilates it → calls native "then" → never answers → 4s hang. FIX: `loadPlugin` SYNCHRONOUS,
  callers never await the plugin OBJECT (only its method results), diagnostics `resolve` step is a
  sync read. Characterized with a thenable-proxy mock (RED: 5s test timeout → GREEN). Web-confirmed
  (registerPlugin proxy architecture).
- 2026-07-24: build-stamp process bug noted (delivered R3 APK carried a STALE stamp because
  `cap sync` used a dist from an earlier `npm run build` at a prior HEAD). Rule: `npm run build`
  AFTER the commit, THEN `cap sync`, so `__TALOS_BUILD_ID__` == HEAD.
- 2026-07-24: owner UI: icon RE-CENTERED (square viewBox on the mark bbox → symmetric; node-only,
  no lines, grey); classic header now a SOFT fade (downward shadow) not a hard border.
- 2026-07-24: FABs done — `TalosMobileNewChatFab` shared; ChatsScreen full-page floating FAB
  (bottom-right, gradient lift; embedded/tablet keeps the inline New); sidebar bottom bar =
  account avatar (left) + New chat FAB (right). Gates: tsc 0, unit 1304, e2e 56/56, budget 479.8k.
- 2026-07-24: **MIC aesthetic (Claude/ChatGPT)** — listening state is now a distinct accent pill:
  live pulsing dot + volume-reactive centre-weighted waveform filling the width + "Listening" label
  + a dedicated round Stop control (transcription still flows inline). Waveform polished
  (centre-weighted envelope, smoother easing). 22/22.
- 2026-07-24: **SINGLE contextual back + header title = subsection** DONE. `useTalosSheetNav`
  (module singleton): a station pushes a sub-view {title, back}; the tool sheet header shows the
  subsection title and its single Back runs the sub-view's back (Account → back → Settings list →
  back → chat). Settings-center drives it (removed the in-body "Categories" arrow + duplicate
  title on mobile). e2e: all 23 "Back to chat" exits became a robust double-back (guarded on the
  sheet count + 320ms settle to dodge the close-animation race). `data-testid="talos-sheet-back"`
  added. Gates: unit 1305, e2e 56/56.
- 2026-07-24: **Settings grouped-cards + local account/OAuth DONE.**
  - `settingsTabs.ts`: `TALOS_MOBILE_SETTINGS_GROUPS` (Intelligence/Connections/Interface) +
    `TALOS_MOBILE_SETTINGS_ACCOUNT_TAB`; contract test (every non-account tab in exactly one group).
  - `TalosMobileSettingsCenter.vue`: category pane = account summary card (avatar initial + name +
    chevron) on top + grouped rounded cards (icon · label · gated hint "Not installed in this
    build" · chevron), uniform rounded-xl. Screenshot matches owner ref 3.
  - `stores/account.ts`: LOCAL account (display_name, avatar initial default 'T', persisted via
    fenced talosBridgeCall) + PREDISPOSED OAuth providers (google/apple, `available:false`, gated,
    NO fake sign-in). 4 tests.
  - Account panel: identity (name input + Save, live avatar) + "Sign in" section with
    Continue-with-Google/Apple marked SOON (tap → honest toast, no session). Local-first messaging
    preserved.
  - Wired the initial into the sidebar avatar + settings card; account hydrated at boot (fail-soft).
  - SF-critic: FIX-FIRST 1 MAJOR (M1) + minors. M1 FIXED: setSubView gated on the SAME 768px md
    media query as the layout (a tablet side-by-side tap was showing a spurious contextual Back +
    wrong header); characterized. Quick minors: focus ring → ring-inset (was clipped by
    overflow-hidden), account card active-state styling, emoji-safe initial (`[...name][0]`).
    Refuted (evidence): nesting TabsTrigger in group divs does NOT break reka roving-focus
    (Collection query is descendant-based). Deferred minors: a11y group labels, hydrate flash.
  - FINAL: tsc 0, unit 1313, e2e 56/56, budget 482.1k/512k.
- 2026-07-24: **All-3 polish batch DONE (owner "vai con tutte e 3").**
  - UNIFORM radius: overrode the Tailwind radius theme in `style.css` (`--radius-sm..3xl` → 12px,
    sm 10px) so every rounded-corner rectangle is ~12px; circles/pills keep `rounded-full`.
    Surgical (one theme block, no 50-file sweep).
  - SERIF titles: `.talos-serif` (system serif stack, zero bundle) on the tool-sheet header title
    and the classic header title — editorial Claude look (Settings Center / Appearance / Account).
  - TTS: `services/speech.ts` (device speechSynthesis, injectable, honest unsupported) + 5 tests;
    `composables/useTalosSpeech.ts` (one-at-a-time speaking id, persisted voice/rate/pitch) + 4
    tests; a Speak/Stop button on assistant messages (Volume2 ↔ Square); Voice sub-tab in
    Appearance (voice select + rate/pitch sliders + Preview). settings `voice` subtree persisted.
    Local-first: device voices = "models", rate/pitch = "tones"; provider-backed neural TTS
    (OpenAI/ElevenLabs) is a future gated extension.
  - Gates: tsc 0, unit 1322, e2e 56/56, budget 484.9k/512k.
- 2026-07-24: **TWO device bugs FIXED (owner report: no scroll in Settings Center + back from a
  subcategory closes the whole menu).**
  - Web research: iOS/Android nested-scroll guidance — a single bounded scroll container per surface;
    `overscroll-contain` on a NESTED scroller that has no room to scroll swallows the touch gesture
    (WebKit/Chromolithic overscroll behaviour, MDN `overscroll-behavior`). Android hardware Back must
    walk the nav stack one level at a time (Material back-nav pattern), not jump to the root.
  - BUG 1 (scroll) — ROOT CAUSE (systematic-debugging, deep probe): `TalosMobileScreen` used
    `min-h-full` so the section grew to content height; the inner `flex-1 overflow-y-auto` had no
    bounded parent, so on mobile the nested settings scroller (`overscroll-contain`) ate the touch
    scroll and the sheet body couldn't move. FIX: section → `h-full min-h-full` (bounded single
    scroller); made ALL overflow/`flex-1`/`min-h-0` coupling in `TalosMobileSettingsCenter` md-only
    (TabsRoot/aside/TabsList/detail-pane) so on the phone content flows naturally inside the ONE
    bounded scroller. Verified: `System` (last item) scrolls into viewport (`toBeInViewport` ✓ +
    screenshot).
  - BUG 2 (back closes menu) — ROOT CAUSE: the Android hardware-Back handler in `App.vue` went
    sidebar → isStation → `navigate('chat')`, so Back from a Settings subsection jumped straight to
    chat (Settings IS a station). FIX: inserted a `sheetNav.subView` check BEFORE `isStation` —
    Back now pops the sub-view one level (Account → Settings list → chat). The header arrow already
    honoured `subView`; added an e2e regression (subsection Back returns to the categories list, the
    sheet stays open; a 2nd Back closes to chat).
  - Gates: tsc 0, unit 1322, e2e 57/57, budget 485.0k/512k.
- 2026-07-24: **FINAL CLEANUP + COHERENCE PASS (owner "una passata finale di pulizia e
  congruenza coerenza").** Ran `/simplify` — 4 parallel reviewers (reuse / simplification /
  efficiency / altitude) over the redesign changeset (`5b3b238..HEAD`); deduped their findings
  (avatar/matchMedia/double-New-chat converged) and applied 10, skipped 5 with rationale.
  - REUSE + DEDUP: extracted `TalosAccountAvatar` (size sm/md/lg) — the accent-initial chip was
    copy-pasted 3× (sidebar/settings-card/account-panel) and already drifting; now one component
    (TDD, 3 tests). Voice picker was the ONLY Settings dropdown using a raw native `<select>` →
    switched to the shared `TalosThemedSelect` (`none-label="Device default"`), matching every
    sibling panel (portal, keyboard nav, dark/accent surface).
  - COHERENCE (serif): `.talos-serif` was on only 2 of many surface titles → added it to the shared
    `TalosMobileScreen` H1 (every tablet station title) and the settings md `<h3>`, so "surface
    title = serif" is a shell rule, not ad hoc (the exact gap the owner named).
  - COHERENCE (New chat): the sidebar showed TWO identical New-chat controls (legacy top outline
    Button + new bottom FAB). Removed the top button; the single affordance is the bottom FAB —
    matching the owner's reference screenshot (avatar left + FAB right). Updated the sidebar unit
    test (section order + emit now from the FAB).
  - SIMPLIFICATION: dropped the contradictory `md:min-h-0 md:min-h-[540px]` pair (same breakpoint);
    dropped the leftover `min-h-full` beside `h-full` (its own comment said "not min-h-full");
    `accountTab` computed→const; resolved each grouped tab ONCE (`resolvedGroups`) instead of the
    twice-per-row linear `settingsTab()` lookup; removed the redundant `!disabled &&` guard on the
    FAB's native disabled button.
  - EFFICIENCY: waveform regression — `Math.sin`/envelope were recomputed for every bar on every
    level tick (~8×/s while listening); hoisted the per-bar weights to a `bars`-keyed computed so the
    hot path is just multiply+round (identical output).
  - ALTITUDE: extracted `useTalosMediaQuery(query)` (scope-bound cleanup via `onScopeDispose`) and
    replaced SettingsCenter's hand-rolled matchMedia/listener/onBeforeUnmount boilerplate (TDD, 3
    tests incl. leak + SSR guard).
  - SKIPPED (noted): `account.auth_provider` (owner-intended OAuth predisposition, not dead cruft);
    `dictation.ts` defensive branches (device-critical Doctor resilience — a Doctor that can't throw
    is a feature); clamp-range constants + `getVoices` memo (defensible boundary / negligible,
    user-action path); composer `rounded-xl→2xl` no-op (both 12px, harmless diff noise).
  - Gates: tsc 0, unit 1328 (+6), e2e (running).
- REMAINING/backlog: provider-backed neural TTS (keys+network, near functional-parity v2.0);
  optional pill→12px flatten if owner wants pills uniform too; guided account-creation wizard PLAN
  (next deliverable — a structured proposal, OneApp/Maximum-Potential/web-research constrained).
