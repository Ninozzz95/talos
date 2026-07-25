# TALOS Mobile — "Calm UI" Refactor · Implementation Plan (Fable)

Date: 2026-07-22 · Owner: Fable (full mobile ownership per CODEX-TO-FABLE-MOBILE-TAKEOVER)
Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi` @ `80b5509a` (clean) · Desktop: READ-ONLY frozen `5dd0c0be`
Source proposal: user-supplied adaptive ticket "Frontend UI/UX Refactor" (audit-first, principles-not-pixels).
Zero git ops (owner commits). Method per takeover §8: ledger → named RED → minimal GREEN → gates → parity docs.

## 1. Locked user decisions (2026-07-22)

| # | Decision | Choice |
|---|---|---|
| D1 | Parity vs refactor | **Mobile = design-lead.** New TALOS visual language defined on mobile; structural/functional parity preserved; desktop will be aligned to the mobile style AFTER (back-port rule: every change token-level/primitive-level so the desktop port is mechanical). Refactor is mostly stylistic but may touch functional components. |
| D2 | Component system | **Keep + refine existing stack** (reka-ui 2.10.1 + vendored shadcn-vue + Tailwind 4 + `--talos-*` tokens). Ticket Option A. Nuxt UI = study reference only (it is Reka-based anyway). No new UI suite. |
| D3 | Identity | **Ribrand soft.** New calm DEFAULT: warm-neutral quiet light + refined calm dark (not current navy), typography/space-driven hierarchy, minimal borders/glow, sober motion. TALOS anchors kept: DAG logo intact; Orbitron ONLY as brand moment (hero/boot); gold survives as sparing signature accent; NO new fonts (Instrument Sans stays); procedural backgrounds OFF by default (re-enable in Appearance); 13 legacy presets remain selectable; new preset `calm` becomes default. |
| D4 | Default mode | **system** (light-warm + dark-calm both first-class). |
| D5 | Navigation | **Top icon rail REMOVED entirely.** New shell: minimal header (hamburger top-left, session title center, new-chat right) + **full-width sidebar drawer** from hamburger. Accepted cost: nav E2E rewrite + `TalosMobileRail` retirement. Note: this is structurally CLOSER to desktop's primary nav (left sidebar) than the rail was — good for the back-port. |
| D6 | Sidebar layout | **Chat-first (Claude pattern):** [New chat] → **Recents** (sessions list, rename/delete inline) → compact **Tools** section (Research, Cockpit, Library, Model Lab) → **Settings** pinned bottom. |
| D7 | Delivery | **3 autonomous phases, APK at each milestone.** F1 foundations+shell → APK; F2 chat+composer → APK; F3 settings/Model Lab/stations/polish → final APK. Full autonomy inside each phase. |

## 2. Hard constraints (inherited, non-negotiable)

- Desktop `control-plane/**` read-only; parity contract (`mobile/docs/feature-parity.json`) updated at phase close.
- Initial JS budget **512,000 bytes** (current 476,034 — headroom ~36KB; sidebar must stay lean, heavy panels stay lazy).
- All 1,057 unit + 31 E2E stay green except tests whose CONTRACT legitimately changes (nav journeys) — those are rewritten, never deleted-without-replacement.
- Every visible control keeps real behavior (no decorative controls); a11y per ticket §10 (WCAG 2.2 AA reference): focus visible, names, contrast, reduced-motion.
- Secrets/keystore, SQLite, provider pipeline: UNTOUCHED by this refactor (style + shell + component surfaces only, plus the small functional UX items listed per phase).
- No new runtime deps without the ticket §4.2 decision record. Expected: **zero new deps**.

## 2-bis. Engineering canon — main `docs/` (BINDING, owner mandate 2026-07-22)

The main AVM `docs/` tree (341 files, mapped in full) is the engineering heart of the project and binds this refactor.
Read-only (main worktree write-prohibited). Mandatory reference matrix:

- **Doctrine core (read in F1 audit):** `architecture/overview.md` (intent-vs-execution, JMP, fail-closed DAG),
  `architecture/security-model.md`, `architecture/failure-policy.md`, `architecture/naming-contract.md` (copy vocabulary),
  `architecture/talos-kadmos-experience-blueprint.md`, `benchmarks/methodology.md`. Conceptual heart:
  `final/AVM_Whitepaper*.pdf` + `introduction/` chapters (read via PDF/docx in F1 — likely source of the
  "maximum potential" engineering doctrine the owner cites).
- **UI engineering standards (BINDING NOW — they anticipate the owner mandates):**
  - `superpowers/talos-ui-refinement-brief.md`: premium bar = ChatGPT/Claude/Linear; **200-250ms ease transition on
    EVERY interactive element**; generous spacing (20-24px containers, 16-20px message gap); type scale
    (16-18/14/11-12/13 code); ONE radius per role applied universally; subtle elevation; auto-resize composer;
    message grouping + typing indicator (3-dot staggered) + relative timestamps + code COPY button. → folded into §4
    and F2 acceptance.
  - `superpowers/talos-animation-brief.md`: TALOS identity = bronze/gold/amber on dark, Greek bronze-giant,
    "serious cybersecurity/DevOps tool — not a cartoon". → confirms D3 gold-as-signature (identity, not decoration).
  - `superpowers/talos-chat-interface-brief.md`, `talos-ui-rebuild-brief.md`, `talos-testing-strategy.md`,
    `talos/theme-engine.md`, `plans/2026-07-18-talos-ui-v7-coherence-restyle-master-plan.md` (desktop's own restyle
    doctrine — coherence rules reused).
- **Feature semantics:** `superpowers/plans/functionality-v2/*` ledgers + `handoffs/2026-07-21-desktop-mobile-parity-map.md`.
- Audit rule: every engineering-audit finding cites the canon doc it violates (when applicable), same as file:line evidence.

## 3. Current-state audit (grounded)

- Stack: Vue 3.5.40, Tailwind 4.3.3, reka-ui 2.10.1, vendored shadcn-vue (24 hash-tracked upstream files), `--talos-*` tokens from ported `lib/talosThemes.ts` (13 presets, seed→~55 vars derivation) + shadcn bridge (`theme/applyDesignTokens.ts`), motion-v6 full engine, 220 src files / 62 SFC / 127 test files.
- Shell today: `App.vue` → `TalosMobileRail` (top) + persistent `ChatScreen` + `TalosMobileToolSheet(RouterView)` for stations; ui-fallback branch; boot logo overlay.
- Chat already has `TalosMobileChatHeader.vue` (compact icon commands) + `TalosMobileSessionDrawer.vue` (sessions list, rename/delete, Drawer upstream) → **the sidebar EXTENDS these, it does not start from zero.**
- Theme plumbing: `stores/theme.ts` (`DEFAULT_THEME_STATE = {theme: TALOS_DEFAULT_THEME('telemetry'), mode:'system'}`); `TALOS_THEME_IDS` frozen 13; **motion constraint**: `TALOS_MOTION_SCENE_IDS` (contracts.ts:18) mirrors the 13 theme ids and `scene_override` is allowlisted against it → adding preset `calm` requires either (a) minimal calm scene defs (simple+static) or (b) a scene-id mapping (calm → an existing quiet scene, e.g. `glacier`) at the `TalosMobileBackground` boundary. Decided in F1 research (bias: (b) mapping — no engine surgery; background is OFF by default under calm anyway).

## 4. Calm design language (spec to encode as tokens in F1)

- **Palette**: light = warm paper neutrals (bg ~oat/ivory family), ink text, warm hairline borders; dark = soft charcoal (NOT current navy), muted warm text; accent = refined TALOS gold (slightly desaturated/warmed), used ONLY for: primary action, active/selected, brand moments, focus ring tint. Status colors kept but quieted. All expressed as a NEW 4-color seed + preset entry so `talosThemeModeVariantStyle` derives the full set (mechanism unchanged → desktop back-port = add one preset row).
- **Surfaces**: fewer cards; grouping by spacing/heading/divider first (ticket §7.5); sheets/drawers get soft large-radius tops, quiet backdrop, no border-glow.
- **Type**: Instrument Sans; clear roles (title/section/body/support/label/code per ticket §6.2); larger line-height in thread for long-form reading; JetBrains Mono confined to code/technical.
- **Radius/elevation**: consistent soft radius scale; shadows minimal (only true overlays); borders hairline.
- **Motion (OWNER MANDATE)**: **every interactive element gets a simple, never-exaggerated animation** — press/tap feedback on buttons/rows/chips, smooth enter/exit for sidebar/sheets/popovers/menus, subtle state transitions (toggle, selection, message arrival, status change). Implementation rule: wire the ALREADY-PORTED motion-v6 interaction engine (`interaction/style.ts` CSS vars + `resolver.ts` intents + `controller.ts` WAAPI) instead of ad-hoc CSS — one system, per-theme tuned, `prefers-reduced-motion` guarded, durations in the 120–250ms micro range. Boot logo stays (brand moment) but shortened/calmer; procedural scenes off by default under `calm`. Per-phase: F1 wires shell intents (sidebar/sheet/header), F2 chat+composer intents (message/composer/popover/menu), F3 the rest (tabs/disclosure/status/success/error).
- **Density**: comfortable in chat/reading, compact in lists/settings (no blanket density).

## 5. Component decision matrix (top-level)

| Area | Today | Decision |
|---|---|---|
| `TalosMobileRail.vue` | top icon rail | **RETIRE** (F1) |
| Header | `TalosMobileChatHeader` (chat-only) | **PROMOTE + restyle** → app-level `TalosMobileHeader` (hamburger/title/new-chat) (F1) |
| Sessions drawer | `TalosMobileSessionDrawer` | **EXTEND** → `TalosMobileSidebar` full-width (New chat + Recents + Tools + Settings) (F1) |
| `TalosMobileToolSheet` | station sheet | **KEEP + restyle calm** (F1); stations still open as sheets from sidebar |
| ChatScreen (thread, empty state) | brand hero + list | **RESTYLE calm** (hero quieter: small logo + greeting; message bubbles → calmer separation, assistant possibly low-container) (F2) |
| Composer + pickers + enhancer/slash/tray | functional, dense | **RESTYLE calm pill-style**, all functions preserved (model chip, effort, attach, context, browse, enhancer, slash) (F2) |
| Settings center 12-tab, Model Lab, Vault, Research/Runs screens | functional | **RESTYLE calm** list-detail, quiet controls (F3) |
| Theme engine / presets | 13 presets | **ADD `calm` preset + flip default**; legacy presets selectable; scene mapping decision (F1) |
| Boot logo | animated overlay | **KEEP**, shorten/calm (F1 polish) |
| ui-fallback branch, a11y semantics, budget verifier | — | KEEP, extend nav contracts |

## 6. Phase roadmap (each = autonomous block → gates → APK)

### F1 — Foundations + Shell (tokens `calm` + hamburger/sidebar/header)
1. Ledger `…-ledger.md` (file/symbol/test exact) + upstream re-check (no new deps expected).
2. RED: calm preset derivation (light+dark full var set, contrast AA checks vs `talosContrast`), default flip, scene-mapping fail-closed, header contract, sidebar contract (open/close, focus trap via Drawer upstream, sections, New chat, session ops preserved, Settings entry), rail-retirement (no dangling refs), Android back closes sidebar first.
3. GREEN: `lib/talosThemes.ts` +`calm` seed row (+`TALOS_DEFAULT_THEME` flip) · `TalosMobileBackground` scene mapping + default-off under calm · new `components/shell/TalosMobileHeader.vue` + `TalosMobileSidebar.vue` (extends SessionDrawer internals) · `App.vue` rewire (header+sidebar, retire rail) · `style.css` calm base (safe-area, quiet backdrop).
4. Rewrite nav E2E journeys (hamburger→sidebar→station sheet→back), keep all other journeys green.
5. Gates: focused + full unit, build+budget, full E2E, audit, `git diff --check`, visual pass 320/360/390 + tablet, light+dark. Parity docs updated. **→ APK F1.**

### F2 — Chat + Composer calm restyle
1. Ledger + RED per surface: thread (bubble/plain hybrid, spacing scale, day/status rows, actions quiet), empty-state calm hero, composer pill (all controls reachable, 44px targets, popovers restyled), pickers/enhancer/slash/tray/browse-evidence visual pass.
2. Functional UX micro-items (allowed by D1): scroll-to-latest pill polish, header title behavior, composer focus/keyboard polish.
3. Gates + visual pass both modes. **→ APK F2.**

### F3 — Settings / Model Lab / stations + system polish
1. Ledger + RED: Settings list-detail calm, Model Lab cards/filters calm, Vault/Library, Research/Runs placeholders coherent, dialogs/toasts/status unified, icon sweep (Lucide coherence), dead-CSS/duplicate-variant cleanup (usage-verified).
2. Full ticket §13 verification battery + before/after evidence + final report (ticket §17 format) + parity contract update. **→ APK F3 (final).**

## 6-bis. CRITICAL owner mandate (added 2026-07-22, during-refactor deliverables)

**A. Severe engineering audit of the current mobile code** — continuous during the refactor, reported in
`docs/superpowers/research/2026-07-22-talos-mobile-engineering-audit.md` (lane — main AVM worktree is write-prohibited).
Extremely technical, severe-but-fair, layered: architecture/boundaries, correctness, performance (bundle, first paint,
SQLite hot paths, reactivity), security (key handling, sanitization, evidence), test quality (what the 1,057 tests do
NOT cover), and **functional gaps vs desktop at detail level** — the bar is "every function equal to desktop OR BETTER"
(owner's example: the per-message model attribution under the bubble, e.g. "TALOS DeepSeek v4 pro" — details of this
grain must be audited for presence/quality on mobile). Copy vocabulary must follow the frozen
`docs/architecture/naming-contract.md` (Kadmos/Talos/AVM/JMP). Each finding: severity, evidence (file:line), fix
decision (in-refactor / backlog / wontfix-reasoned). Findings that are quick + in-scope get fixed inside the phase;
larger ones enter the phase backlog explicitly — nothing silently dropped.

**B. Competitor bar with weak-point exploitation** — deliverable
`docs/superpowers/research/2026-07-22-talos-mobile-competitor-analysis.md`, method mirroring the frozen
`docs/superpowers/kadmos-competitor-alignment.md` (matrix + priorities): Claude, ChatGPT, Gemini, Perplexity, Grok
mobile apps — per surface (chat UX, composer, model selection, attachments, history, browsing, offline, privacy,
theming): what they do well, **where each is weak**, and the TALOS counter-move. TALOS' structural differentiators to
sharpen (not invent): local-first/standalone (no account, no cloud middleman), multi-provider BYOK with real Model Lab
(probe/rename/visibility/endpoints — NO consumer app has this), durable local SQLite with full data ownership,
truthful browse evidence, 13-theme engine + motion. Target: "pari ai competitor" on the basics they nail (feel,
speed, polish) + VERAMENTE MEGLIO on the structural axes they cannot follow.

Both documents are living artifacts: started in F1, enriched each phase, closed with the F3 final report.

## 6-ter. Completeness sweep (owner 1000%-check, 2026-07-22) — gaps found and absorbed

1. **Native splash + status bar vs calm theme** (F1): current Android splash is navy+gold → clashes with warm-light
   default at boot. Regenerate splash coherent with calm (or scheme-aware) + recalibrate `nativeFraming` colors.
2. **Streaming responses** (F1 research → F2 impl): mobile is buffered today; every competitor streams. Research
   real constraints (WebView CORS; Anthropic `anthropic-dangerous-direct-browser-access`; per-provider support;
   fetch ReadableStream in Capacitor WebView) → implement capability-gated streaming per provider; honest fallback
   to buffered where a provider cannot stream from device. Upstream decision record required.
3. **Mic/dictation in composer** (F1 research → F2): frozen desktop HAS composer dictation (commit 754512d) →
   mandatory parity; Android WebView lacks SpeechRecognition → native STT plugin decision (§4.2 record; official/
   maintained Capacitor plugin, on-device preferred). On phone this is higher-value than desktop.
4. **First-run onboarding** (F2): guided welcome → add key → pick model → start, replacing the bare no-key state.
   Calm, skippable, honest (no fake progress).
5. **Haptics** (F2): subtle native feedback paired with the animation mandate (`@capacitor/haptics` official,
   §4.2 decision record; light impact on primary actions only — never buzzy).
6. **Message-style mirror** (F1 audit item): frozen desktop persists chat message style (42cb8ce) + full-width
   sections (9e02a72) — verify the mobile thread honors the same setting semantics; fix in F2 if divergent.
7. **Back-port ledger + BEFORE baseline** (F1 opens both): `…-calm-refactor-backport-ledger.md` records EVERY visual
   change at token/component level so the later desktop alignment is mechanical; BEFORE screenshots of all surfaces
   (light+dark, 360/390) captured before any edit (ticket §3.3/§15).
8. Acceptance refinements: keyboard-open composer behavior (F2), orientation/tablet in gates (already), i18n N/A
   (EN-only parity with desktop).

## 6-quater. F1 owner feedback + F2 additions (2026-07-22, APK F1 tested on device)

Owner verdict on F1 APK: positive ("niente male"). Additions binding for F2:
1. **Header height**: too short on device → raise to the 56px mobile app-bar standard (h-12→h-14), first F2 fix.
2. **Intro modal**: mirror the desktop intro modal exactly (spec: main `docs/superpowers/ledgers/2026-07-19-talos-intro-modal-ledger.md` + its design doc, read-only).
3. **Login like desktop + optional biometrics on mobile**: desktop auth is Laravel-session (server-bound); the
   local-first mobile equivalent is an APP-LOCK with the same UX language: local credential + OPTIONAL biometric
   unlock (official/maintained Capacitor biometric plugin, §4.2 decision record; secrets stay in Keystore).
   Honest boundary: no fake server session — local sovereignty, desktop-identical experience.

## 7. Risks & rollback

- **Budget**: sidebar in initial graph → keep sidebar light (no heavy imports; stations stay lazy); budget verifier already enforces.
- **Nav E2E churn**: contained to journey files; rewritten same-coverage (contract change, not deletion).
- **Scene/theme coupling**: mapping approach avoids motion-engine edits; if mapping proves insufficient → minimal calm simple/static scene defs (F1 amendment).
- **Desktop back-port**: guaranteed by token-level work: `calm` = one preset row + default constant + the new shell components are portable Vue on shared primitives.
- Rollback per phase: revert phase file-set; theme default flip is one constant; legacy presets untouched throughout.

## 8. Visual verification mandate (owner, at F1 GO)

After EVERY implementation step: headless Chromium capture (Playwright against `vite preview`) at 390x844 + 360x640,
light + dark, and the agent INSPECTS the images (opens them, checks harmony/coherence/regressions — not just asserts).
Reusable tool: `mobile/scripts/capture-ui.mjs`; captures under `mobile/test-results/ui-captures/<step>/` (gitignored).
BEFORE baseline captured pre-F1 for all surfaces.

## 9. MODUS OPERANDI (owner-sanctioned, 2026-07-22 — standing authorization)

At every F-phase completion: green gates → ULTRA-CRITICAL capture inspection (demanding, not complacent) →
**SF-level FE critic subagent** (impersonates a high-level frontend engineer at a San Francisco multinational;
critiques the phase, proposes improvements; I evaluate → implement or motivate rejection in the phase ledger) →
**AUTO-COMMIT by the agent** (clean message, staged diff-check first) → **advance ALONE to the next phase** until the
ENTIRE roadmap is complete. At roadmap end (credits permitting): desktop FE inspection + gap report (mobile
functionality to 100%; desktop style alignment plan). Memory: `mobile-refactor-autonomous-mode`.

## Log
- 2026-07-22: decisions D1–D7 locked with owner (one-at-a-time Q&A). Plan frozen.
- 2026-07-22: owner GO for F1 + visual-verification mandate added. F1 begins: ledger → BEFORE captures → RED.
