# TALOS Mobile — Severe Engineering Audit (living, F1→F3)

Owner mandate (plan §6-bis-A): extremely technical, severe-but-fair; bar = every function equal to desktop OR BETTER;
findings cite evidence (file:line) + the canon doc violated (main `docs/`, read-only) + a decision
(fix-in-phase / explicit backlog / reasoned wontfix). Nothing silently dropped.

## Format
`AUD-NNN · severity(S1 blocker/S2 major/S3 minor/S4 nit) · area · finding · evidence · canon ref · decision`

## Findings

- **AUD-001 · S3 · shell/legacy** — `App.vue` still renders the M1 "telemetry poster" div (`--talos-poster-url`,
  20% opacity fixed layer) under every theme; under `calm` the asset 404s silently (calm-poster.webp absent by
  design). Evidence: App.vue poster div; talosThemes `themePoster()`. Canon: ui-refinement-brief (no decorative
  layers without purpose). Decision: **fix in F1-T4** — hide poster layer under calm (and under any theme whose
  poster asset is absent).
- **AUD-002 · S3 · navigation** — Sidebar "Model Lab" entry routes to `settings` route generically instead of
  deep-linking the Models panel (Codex-era deep-link exists for composer). Evidence: App.vue `sidebarNavigate('settings')`
  for open-model-lab. Decision: **F3** settings deep-link param reuse.
- **AUD-003 · S2 · UX-parity** — Per-message model attribution (owner's example: "TALOS DeepSeek v4 pro" under the
  bubble on desktop) — mobile thread renders role/status but model attribution presence/format must be verified
  against desktop `TalosChatSurface` message meta. Decision: **verify + fix in F2** (thread restyle slice).
- **AUD-004 · S2 · streaming** — Chat replies are buffered (CapacitorHttp); desktop/competitors stream. Decision:
  research dossier in F1 (per-provider CORS/WebView constraints) → **implement in F2** capability-gated (plan §6-ter-2).
- **AUD-005 · S2 · input-parity** — Composer lacks mic/dictation; frozen desktop HAS it (commit 754512d). Decision:
  research native STT plugin in F1 → **implement in F2** (plan §6-ter-3).
- **AUD-006 · S3 · tooling** — `capture-ui.mjs` preview cleanup is unreliable on Windows (orphan `vite preview` on
  4173 broke a later run with `--strictPort`). Evidence: task b5nkjdm8i failure; netstat orphan PID 92988. Decision:
  **F1** — harden cleanup (taskkill child tree by port before start).
- **AUD-007 · S4 · vestige** — `ChatScreen` retains `historyOpen` ref assignments with no drawer consumer after the
  shell rework. Decision: **F1-T4 cleanup** (remove ref + assignments).

## Canon reading log (F1)
- [x] ui-refinement-brief / animation-brief (standards folded into plan §2-bis)
- [ ] AVM whitepaper PDF + introduction chapters (scheduled this phase)
- [ ] overview/security-model/failure-policy re-read for audit citations

## Findings (F2 pass, 2026-07-23)

- **AUD-003 · RESOLVED (F2-T2)** — meta row now renders friendly labels + real model display names via
  `modelLabels` (profiles map), relative timestamps, grouping; desktop summary-underscore format matched-or-better.
- **AUD-004 · RESOLVED (F2-T4)** — attempt-and-fallback streaming shipped (native fetch SSE/NDJSON in the lazy
  provider graph, pre-first-byte fallback to CapacitorHttp, honest interrupted partials, Stop control).
- **AUD-005 · RESOLVED (F2-T5)** — live dictation via pinned community plugin (partials into the draft), honest
  unavailable state; deliberate divergence from desktop record→Whisper recorded in T1 §4.2.
- **AUD-008 · S3 · welcome-copy** — ChatScreen welcome is still the desktop-inherited AVM-benchmark hero ("What
  claim should we benchmark?") — wrong register for the mobile chat-first surface, and AVM execution is mobile-ROADMAP
  (intro modal says so honestly on the same screen distance). Decision: **F3 calm polish** — rewrite welcome copy
  chat-first (keep brand hero).
- **AUD-009 · S3 · applock-resume** — App lock arms on cold start only; the dossier notes "optional on background
  resume" as the desktop-plus behaviour. Decision: **F3** — optional `resume` lock via existing nativeAppLifecycle
  hook, opt-in flag.
- **AUD-010 · S4 · lockscreen-attempts** — No attempt throttling on the PIN screen (local-only risk, PBKDF2 cost
  per try is the current brake). Decision: **F3 nice-to-have** — exponential backoff after N failures.
- **AUD-011 · S3 · dictation-language** — Web fallback uses `navigator.language`; the native plugin uses the device
  recognizer default. No user-facing language override (desktop has none either). Decision: parity-neutral, **defer**.
