# Roadmap-end dual gap report — Mobile functionality 100% + Desktop style alignment

**Date:** 2026-07-23 · **Author:** Fable (full mobile owner) · **Mandate:** calm-refactor roadmap end
(mobile-refactor-autonomous-mode §5) · **Inputs:** `mobile/docs/feature-parity.json` (machine truth @ desktop
`5dd0c0be`, generated 2026-07-22 by Codex P1.7 — PRE-F1/F3, corrected below), F1–F3 ledgers, desktop FE
inventory (read-only agent sweep of `control-plane/resources/js`).

---

## Part A — What is missing for 100% mobile FUNCTIONALITY

### A.0 Corrections to the machine truth (work landed after generation)
The parity file predates the calm refactor. Real current status:

- `settings` (was *planned*): **largely implemented** — 12-tab Settings Center, local panels for Models /
  AI Defaults (incl. tone) / Browser / Appearance (theme+motion+layout+visibility) / Shortcuts / Account
  (replay intro + app lock), fail-closed preference stores, one-shot migrations. Remaining: the 6 honestly
  gated tabs (below).
- `theme_engine` (was *planned*): **implemented** — 14 presets (calm default + 13 legacy), shared identity
  tokens, motion-v6 renderer with scenes, Appearance editor, per-preset caps. Remaining: nothing blocking;
  visual matrix per theme is polish.
- Beyond the parity file's scope, F2/F3 added capabilities the desktop contract didn't even list for mobile:
  streaming with honest interrupted partials + Stop, live dictation, versioned intro modal, first-run
  checklist, app lock (PIN PBKDF2-in-Keystore + biometrics), haptics, tone system with model suggestions,
  Claude-style Chats page, composer drawer, toast infrastructure.

### A.1 IMPLEMENTED (machine truth confirmed) — 6/20
`chat`, `files_ingestion`, `context_vault`, `model_profiles` (+ `settings`, `theme_engine` per A.0).

### A.2 BLOCKED — external gates, not mobile-FE work
| Feature | Gate |
|---|---|
| `browser_p0` (full evidence parity) | trusted-node Playwright/HMI + physical device verify (host adb broken 0xC0000135). Local manual Browse + evidence timeline ALREADY works. |
| `models_runtime` (Zethos local models) | Android runtime benchmark (Z10/P3.A) on physical tiers; Rust/NDK toolchain absent on host. |
| `research` (station content) | MREG-010 delta decision — no M-phase assignment yet. |
| `google_workspace` | P6 not authorized (AppAuth decision + fresh OAuth pins). |
| `email_triage` | P6 connector; send disabled even on desktop. |
| `benchmarks` | Z14 harness not started + MREG-010 surface assignment. |
| `kadmos_cli` | P1 AVM Kernel Spec + Rust toolchain; phone CLI out of scope by design. |

### A.3 PLANNED — the actual mobile-FE work list to 100%
Ordered by user value / effort:

1. **Memory station** (`memory`) — local store (M2 schema exists in draft ledger), chat disclosure
   (`used_memories`), untrusted boundary identical to desktop. Highest daily-use value.
2. **Tasks station** (`tasks`) — local persistent tasks with run_id provenance; airplane-mode functional.
3. **Notes station** (`notes`) — local notes as untrusted context with provenance banner.
4. **Doctor** (`doctor`) — hardware capability scan/tier + honest readiness report, offline.
5. **Tools registry viewer** (`tools_registry`) — read-only health view first; actions gated on M7 capability
   gateway.
6. **Calendar drafts** (`calendar`) — local drafts only; external writes stay double-gated (P6).
7. **Skills registry viewer** (`skills`) — local registry; execution gated on M7.
8. Station content for Research/Runs/Cockpit beyond empty-state parity (blocked items above feed these).

Prerequisite thread through 1–3: the **M2 sovereign core decision** (encrypted local DB expansion) — the
draft execution ledger exists (`M2-local-sovereign-core.md`); the security decision is user-gated.

### A.4 Device-verify debt (not features, but promotion gates)
Physical install/launch/logcat pass, dictation on-device grant flow, biometric prompt on real hardware,
animated backgrounds fps on device, APK release signing (currently debug).

---

## Part B — Desktop STYLE alignment plan (mobile = design-lead)

*(Filled from the read-only desktop inventory sweep — see agent report appended in the PR of this doc.)*

### B.1 What desktop adopts from the mobile calm language
1. **Calm preset as desktop default** — port the 14th preset (identity tokens already shared via
   `TALOS_THEME_IDENTITIES_V6`; desktop scenes need a calm mapping like mobile's drawCalm) + the one-shot
   `calm_migrated` default migration pattern.
2. **Neutral base prompt + tone system** — desktop already has the neutral base; port the tone presets,
   the `[TONE_SUGGESTION]` protocol and a toast surface (desktop Sonner cutover is already on its roadmap —
   the mobile toast contract can inform it).
3. **Meta-row grammar** — `You · just now` separators, lowercase relative time with 30s ticker,
   assistant-only attribution, actions at group end (desktop hover-reveal already exists; the grammar is
   the part to unify).
4. **Composer drawer option** — the Claude-style minimal bar + organized drawer as an optional desktop
   composer mode (maps naturally to the slim composer).
5. **Sections-default message style** with the bubbles toggle (already shared lib `talosChatLayout`) —
   verify desktop default matches mobile's `sections`.
6. **Micro-craft imports**: 44px minimum targets audit, switch anatomy (track+thumb) unification,
   one-accent discipline (idle glyphs muted), honest empty/disabled states language, enter+leave motion
   symmetry (150–250ms), safe-area/intrinsic-height header pattern.
7. **Intro modal** — the mobile implementation is live and spec-faithful (mobile-truth claims); desktop's
   INTRO-1 can reuse the slide structure/motion decisions (its own spec was the source — feedback loop).
8. **Immersive header** — optional ChatGPT-style chrome is mobile-first; desktop counterpart = optional
   compact window chrome (evaluate, not mandatory).

### B.2 Mechanics of the port
- Tokens/identities are already shared (`--talos-*`, theme identities) — the calm port is data + scene
  mapping, not a rewrite.
- Shared libs re-sync direction REVERSES for style files (mobile → desktop) once the desktop freeze lifts:
  `talosChatLayout` defaults, tone lib, relativeTime, meta-row markup patterns.
- Desktop freeze at `5dd0c0be` stays until the user lifts it (standing rule: no control-plane writes).

### B.3 Suggested sequencing (when the user opens the desktop window)
1. Calm preset + default migration (biggest visual payoff, lowest risk).
2. Meta-row grammar + message-style default check.
3. Tone system port (with the Sonner/toast cutover it already plans).
4. Composer drawer option + micro-craft audit sweep.
5. Immersive/compact chrome evaluation.

---

## Next programs after this report
1. **Icon+splash calm rework** (owner #14) — first task of the next mobile block.
2. **Mobile functional completion** (Part A.3 list; M2 security decision user-gated).
3. **Claude functional-parity program v2.0** (owner spec, after functional completion).

---

## Appendix — Desktop inventory findings (read-only sweep, 2026-07-23)

### Corrections/confirmations from the live desktop code
- **Desktop has NO token streaming** — chat is a single-shot POST to `/api/talos/chat` with a spinner.
  The mobile attempt-and-fallback streaming (F2) is AHEAD of desktop: Part B gains a reverse-parity item —
  **port mobile streaming semantics to desktop** (SSE + honest interrupted partials + Stop).
- **`calm` does not exist on desktop** (13 presets, default `telemetry`) — confirms B.1 item 1 as real work.
- **Desktop composer is an inline bar** (slim composer, full/minimal density) — the drawer option (B.1 item 4)
  is genuinely new to desktop.
- **Desktop dictation** = record→whisper (browser-transformers or cloud) vs mobile live on-device STT — two
  valid engines; a shared mode contract could offer both on both platforms eventually.
- 15 registry windows on desktop, ALL server-coupled through `/api/talos/*` (no local-first fallback except
  browser dictation) — every mobile port in Part A.3 is therefore a local-first REDESIGN of a server feature,
  not a transplant (consistent with how chat/vault/model-profiles were already done).

### A.3-bis — Chat-surface features desktop has that mobile still lacks
(These were NOT in the parity file's 20 features; discovered by the sweep. Ordered by value.)
1. **Session export** (evidence pack / transcript / context manifest / benchmark scenario) — local-first
   export to file/share-sheet is very feasible.
2. **Per-message evidence drawer** (sources, used_context provenance, mutation badges) — mobile shows browser
   evidence but has no per-message drawer.
3. **Temporary chat toggle** (session not persisted) — small, high privacy value.
4. **Command palette** (mobile has hardware-shortcut bindings but no palette surface; on phones a palette is
   arguably the Chats/slash surface — evaluate rather than port blindly).
5. **Live-edge "return to latest" pill** with unseen count (pairs naturally with the F3 scroll anchoring).
6. **Sensitive-text blur** toggle; **welcome prompt library** (mobile welcome is static copy — also flagged
   in AUD-008); **benchmark-this-run** message action (gated on benchmarks feature); **edit-prompt action**
   (mobile "reuse" covers most of it); **session folders/favorites/archive** (mobile has flat Recents/Chats).
7. **Stations depth seen on desktop** to inform future mobile ports: Memory also carries Skills + Skill-Audit
   sections; Calendar has NLP quick-add; Tasks bundles Email triage; Doctor bundles policy/backup/audit panels.
