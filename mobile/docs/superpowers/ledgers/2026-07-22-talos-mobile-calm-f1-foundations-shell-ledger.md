# F1 — Calm Foundations + Shell · Execution Ledger

Plan: `docs/superpowers/plans/2026-07-22-talos-mobile-ui-calm-refactor-plan.md` (D1-D7 + mandates A-E frozen).
Lane `lane/kimi-mobile` @ `80b5509a` clean · desktop frozen `5dd0c0be` read-only · zero git ops.

## Scope (exact)

### T1 — BEFORE baseline + capture tool
- NEW `mobile/scripts/capture-ui.mjs` — Playwright chromium headless vs `vite preview`; args: `--out <dir>`
  `--routes chat,settings` `--viewports 390x844,360x640` `--schemes light,dark`; writes PNG per combo.
- Captures → `mobile/test-results/ui-captures/00-before/` (gitignored via test-results). Agent inspects each.

### T2 — `calm` preset (tokens)
- EDIT `mobile/src/lib/talosThemes.ts`: +`'calm'` in `TALOS_THEME_IDS`; +preset row in `TALOS_THEME_PRESETS`
  (seed: warm-paper light bg, soft charcoal dark bg, refined gold accent, warm hairline line; `isLight:false`→uses
  mode; `defaultMotion:'subtle'`, `defaultEffect:'none'`); flip `TALOS_DEFAULT_THEME = 'calm'`.
- EDIT `mobile/src/motion-v6/themeIdentity.ts` ONLY IF identity table requires explicit row (verify: it derives from
  TALOS_THEME_PRESETS — expected no edit).
- Scene mapping: EDIT `mobile/src/components/talos/workspace/TalosMobileBackground.vue` — map `calm`→`glacier`
  sceneId before resolver (calm not in `TALOS_MOTION_SCENE_IDS`); background default OFF under calm (respect
  Appearance override).
- RED `mobile/tests/unit/theme/calmPreset.test.ts`: id registered; derivation yields full var set light+dark;
  AA contrast via `talosContrast` for text/bg + accent pairs; default theme = calm; parse fail-closed keeps legacy ids.
- RED extend `mobile/tests/unit/theme/mobileBackground.test.ts`: calm maps to allowlisted scene; no throw.

### T3 — Shell: header + sidebar (rail retirement)
- NEW `mobile/src/components/shell/TalosMobileHeader.vue` — hamburger (aria-label "Open menu"), session title
  (truncate, center), new-chat (right); 44px targets; motion intent wired (header/menu).
- NEW `mobile/src/components/shell/TalosMobileSidebar.vue` — full-width drawer (Drawer upstream, direction start);
  sections: [New chat] → Recents (sessions via chatController: list/select/rename/delete — REUSE
  `TalosMobileSessionDrawer` internals) → Tools (research/runs/context + Model Lab deep-link) → Settings pinned
  bottom; focus trap + Escape + backdrop via upstream; motion intent sidebar.
- EDIT `mobile/src/App.vue`: header+sidebar replace `TalosMobileRail`; stations still open `TalosMobileToolSheet`
  via sidebar navigation; Android back closes sidebar first, then sheet, then history (extend existing handler).
- RETIRE `mobile/src/components/shell/TalosMobileRail.vue` + its test; retire/absorb
  `mobile/src/components/chat/TalosMobileChatHeader.vue` usages in `ChatScreen.vue` (header becomes app-level;
  chat-specific commands preserved — verify each command has a home: history→sidebar, new-chat→header, model/…→composer).
- RED `mobile/tests/unit/shell/TalosMobileHeader.test.ts` (5+: render, hamburger emits, title, new-chat, a11y names)
- RED `mobile/tests/unit/shell/TalosMobileSidebar.test.ts` (8+: opens, sections order chat-first, session ops
  forwarded, tools navigate, settings entry, focus/escape, full-width geometry class, New chat creates session)
- RED edit `mobile/tests/unit/shell/*` existing rail tests → replaced by header/sidebar contracts (no orphan refs).
- RED `mobile/tests/unit/shell/appShell.test.ts` (existing App tests): rail gone, header present, back-order.

### T4 — Calm base styling pass on shell surfaces
- EDIT `mobile/src/style.css`: calm base (hairline borders var, radius scale usage, quiet backdrop token).
- EDIT `TalosMobileToolSheet.vue`: calm restyle (soft top radius, quiet header, no glow) + motion intent sheet.
- Interaction motion wiring (shell): consume `talosInteractionMotionStyleV6` vars on header/sidebar/sheet
  open/close + press feedback utility class (120-250ms).

### T5 — Native framing coherence
- EDIT `mobile/src/services/nativeFraming.ts` call site (main.ts) — colors from calm vars (both schemes).
- Splash: regenerate `drawable*/splash.png` scheme-coherent (dark splash stays; verify light boot path via boot
  overlay covers pre-paint — decide + record; if regen needed reuse `scratchpad/gen-launcher-icons.mjs` approach).

### T6 — E2E nav rewrite + gates
- EDIT `mobile/tests/e2e/mobile-shell.e2e.spec.ts` (+ any journey using rail selectors): hamburger→sidebar→station
  →back journeys; offline preload journey intact.
- Gates: focused units → full unit corpus → build+budget(512000) → full E2E corpus → audit → `git diff --check`
  → AFTER captures (`01-f1-shell/`) inspected vs BEFORE → cap sync → assembleDebug → **APK F1** → parity docs update.

## Audit + competitor docs (mandates A/B) — opened this phase
- NEW `docs/superpowers/research/2026-07-22-talos-mobile-engineering-audit.md` (running, severe).
- NEW `docs/superpowers/research/2026-07-22-talos-mobile-competitor-analysis.md` (matrix skeleton + first pass).
- NEW `docs/superpowers/ledgers/2026-07-22-talos-mobile-calm-refactor-backport-ledger.md` (every visual change).
- F1 canon reading: whitepaper PDF + introduction chapters + doctrine core (log key constraints into audit doc).
- F1 upstream research: streaming per-provider (CORS/WebView), native STT plugins (for F2 decision records).

## Rollback
- T2: remove calm rows + restore `TALOS_DEFAULT_THEME='telemetry'` (legacy presets untouched throughout).
- T3: restore App.vue rail wiring (rail file kept in git history); header/sidebar are additive files.
- T5: splash assets restorable from HEAD.

## Status log
- [x] T1 BEFORE captures — tool `capture-ui.mjs` works; 8 PNGs in `00-before/`; build green 476034/512000.
  Inspection notes: light=cool cyan telemetry (not warm), TWO stacked top bars (rail+chat header) waste vertical
  space (validates D5 consolidation), composer icon row 7 icons developer-grade, hero heavy. Dark not yet inspected
  (do at T4 comparison).
- [x] T2 calm preset RED→GREEN — 5/5 (`tests/unit/theme/calmPreset.test.ts`): 'calm' in TALOS_THEME_IDS (14th),
  default flipped to calm, seed `{bg:#211f1a, accent:#c08b3c refined bronze, secondary:#8a8578, line:#3a382f}`,
  defaultEffect none / radius soft / motion subtle, AA contrast both modes, telemetry byte-stable. RED was 3fail/2pass.
  REGRESSION RESOLVED (supersedes the mapping plan): the engine's 1:1 theme↔scene contract made external mapping
  impossible — calm is now a FULL engine citizen instead: +`calm` in `TALOS_MOTION_SCENE_IDS` (14);
  `scenes/simple/calm.ts` (distinct quiet geometry, glacier CSS roles) + `AMBIENT_GLYPHS.calm` (3 low-opacity slow
  fields, quietest in library); `scenes/complex/calm.ts` (distinct primitive grammar) + authored `drawCalm`
  (delegates to drawGlacier + slow horizon line → own op fingerprint); `PROFILE_RENDERING_DEFAULTS.calm`
  (simple/low/24fps/dpr1); `interaction/profiles.ts` calm row (quietest: no rotation, micro travel);
  `interaction/style.ts` calm row (soft-fade/fade/pulse/lift). Contract updates 13→14 (NOT weakened) in:
  themeIdentity.test (+oracle pinned to legacy-13 fixture ids), presetMotionRegistry.test, simpleScenes.test,
  complexScenes.test, profiles.test, productRegistry.test (39→42). **Full motion+theme corpus 569/569 GREEN.**
  Poster asset calm-poster.webp missing by design (hide poster div under calm in T4). Backport note: desktop needs
  the same rows + contract updates at style alignment.
- [x] T3 shell RED→GREEN — hamburger shell LIVE. NEW `components/shell/TalosMobileHeader.vue` (hamburger "Open menu" /
  centered title / New Chat; 4/4) + `TalosMobileSidebar.vue` (full-width left Drawer, chat-first: New chat → Recents
  with rename/delete dialogs → Tools (Research/Cockpit/Library/Model Lab) → Settings pinned; 6/6 incl. dialog flows).
  `App.vue` rewired: header+sidebar replace the rail; sessions/title read from chatController singleton; session
  actions delegate to ChatScreen's EXPOSED orchestrated methods (`defineExpose` newSession/selectSession/renameSession/
  deleteSession/sessionActionBusy — attachment revocation + draft scoping stay in one place); Android back order =
  sidebar → sheet → history. `ChatScreen.vue` slimmed: local ChatHeader+SessionDrawer render removed. RETIRED (4+1):
  `TalosMobileRail.vue`, `TalosMobileChatHeader.vue`, `TalosMobileSessionDrawer.vue` + their tests (dialog-flow
  coverage MIGRATED into sidebar tests). Contract updates: appShell test rail→header; 3 chatScreen tests → exposed-
  interface equivalents. Model Lab/Settings sidebar entries → settings route (deep-link refinement = F3 audit item).
  **typecheck 0 · shell+screens+chat corpus 246/246 (42 files).**
  VISUAL VERIFIED (02-t3-shell captures, inspected light+dark 390x844): single minimal header replaces the double
  bar; warm paper light / warm charcoal dark; bronze signature on logo/actions; hierarchy calm and coherent. Build
  477,009/512,000 (shell rework net -0.6KB). F2 notes: composer icon row still dense (7), hero size can shrink.
- [x] T4 calm styling + motion wiring — AUD-001 poster layer hidden under calm (App.vue v-if theme!=='calm');
  AUD-007 historyOpen vestige removed; ToolSheet calm restyle (rounded-t-2xl, border-t hairline, transparent header,
  backdrop black/30+blur); ANIMATION MANDATE wired engine-first: App root binds `talosInteractionMotionStyleV6`
  (theme-tuned `--talos-motion-*` vars, default V6 prefs, matchMedia reduced-motion) + `.talos-pressable` utility in
  style.css consuming the vars (transform/bg/opacity, scale .97 active, reduced-motion none) applied to sidebar rows
  + toolsheet buttons (shared Button already has transition-all + active:translate-y). typecheck 0; 95/95.
- [x] T5 native framing — DECISION RECORDED: `main.ts` applies calm sync BEFORE `configureNativeFraming`, so status
  bar/keyboard colors are already calm-driven per scheme. Native splash stays the dark navy+gold brand frame
  (constant, scheme-neutral): the boot overlay covers first paint, so no light-mode clash; regenerating a
  scheme-aware splash deferred to F3 polish (backport note added).
- [~] T6 E2E + gates + APK F1 — nav rewrite DONE for 8 journey files (mechanical: RAIL const → MENU+SIDEBAR,
  `rail [aria-label=Settings]` → hamburger→sidebar Open Settings; settings-parity inline pair updated).
  `mobile-shell.e2e.spec.ts` FULLY REWRITTEN (12 tests) + 8 journey files nav-patched. Gate iterations caught and
  fixed 6 REAL regressions: (1) header buttons 36px (icon-lg=size-9) → min-h-11/min-w-11 (a11y, caught by the new
  44px E2E); (2-4) retired-control selectors in persistence/slash journeys → hamburger flow; (5) sidebar missing the
  drawer's conversation-count line + aria-current='page' → ADDED to sidebar (parity kept, tests not weakened);
  (6) dialog copy parity (Delete chat? / rename description) restored from the committed drawer. Appearance panel
  contract 13→14 presets (calm appears automatically in the theme selector). INCIDENT: a port-4173 orphan wedged the
  first gate chain ~35min at the capture step → capture-ui.mjs REWRITTEN hang-proof (pre-kill orphan, bounded 'load'
  navigation never networkidle, process watchdog + tree-kill) + gate discipline memorized (full logs, no tails,
  no inline node -e for regex code).
  **F1 CERTIFICATION (2026-07-22 22:48): unit 1073/1075 pass (2 declared skips, 0 fail) · E2E 31/31 · captures 8/8
  (04-f1-cert) · audit 0 vuln · `git diff --check` clean · assembleDebug BUILD SUCCESSFUL ·
  APK 36,321,761 B SHA-256 `76dafa76844a06678ae7851bf4a747c884f4353b7e5c9b5f88d58385bcd9f7d7`.**
  F1 COMPLETE — uncommitted (owner commits). F2 next: chat+composer calm restyle + streaming/dictation/onboarding/
  haptics + refinement-brief standards (grouping/typing-indicator/timestamps/copy-code) + model attribution parity.
