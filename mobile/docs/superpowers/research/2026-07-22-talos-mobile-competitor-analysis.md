# TALOS Mobile vs Competitors — Weak-Point Analysis (living, F1→F3)

Owner mandate (plan §6-bis-B), method per frozen `docs/superpowers/kadmos-competitor-alignment.md`: match the basics
they nail, be TRULY better on structural axes they cannot follow. Matrix refined each phase; closed with F3 report.

## Matrix v1 (initial pass — refine per phase)

| Surface | Claude app | ChatGPT app | Gemini | Perplexity | Grok | TALOS counter-move |
|---|---|---|---|---|---|---|
| Chat feel (calm, readable) | ✅ best-in-class | ✅ | ◐ busy | ◐ dense | ◐ | F1/F2 calm refactor (this program) |
| Streaming | ✅ | ✅ | ✅ | ✅ | ✅ | ❗gap → F2 (capability-gated per provider) |
| Dictation | ✅ | ✅ (+voice mode) | ✅ | ✅ | ✅ | ❗gap → F2 native STT |
| Model choice | ◐ few own models | ◐ own only | ◐ own only | ◐ limited | ◐ own | ✅ **6 providers BYOK + Model Lab (probe/rename/endpoint) — nobody has this** |
| Offline/local-first | ❌ account+cloud only | ❌ | ❌ | ❌ | ❌ | ✅ **standalone, no account, SQLite local, data ownership** |
| Data ownership/privacy | ❌ cloud | ❌ | ❌ | ❌ | ❌ | ✅ keys in OS keystore, zero middleman, local persistence |
| Attachments | ✅ | ✅ | ✅ | ◐ | ◐ | ✅ local Vault + explicit grants (MORE honest than all) |
| Browsing | ◐ (Claude: none in-app) | ◐ | ✅ deep | ✅ core | ✅ X | ✅ truthful evidence model (no hallucinated page claims) |
| Theming | ❌ light/dark only | ❌ | ❌ | ❌ | ❌ | ✅ 14 presets + motion engine |
| Onboarding | ✅ smooth | ✅ | ✅ | ✅ | ◐ | ❗gap → F2 guided first-run (key needed = friction to design around) |

## Weak points to exploit (each competitor)
- **Claude**: no model diversity, no browsing, cloud-only, no theming → TALOS = same calm + total freedom.
- **ChatGPT**: walled garden (own models), telemetry-heavy → TALOS = BYOK transparency, local data.
- **Gemini**: tied to Google account/ecosystem; busy UI → TALOS = quiet UI, no ecosystem lock.
- **Perplexity**: search-first, weak as general assistant workbench → TALOS = full workbench (runs/vault/models).
- **Grok**: X-tied, no privacy story → TALOS = privacy by architecture.

## Structural thesis
Consumer AI apps compete on model+cloud lock-in. TALOS mobile competes on **sovereignty**: your keys, your models
(any provider), your data (local SQLite), your look (theme engine) — with consumer-grade calm (this refactor) so
sovereignty stops costing polish. The refactor closes the polish gap; the sovereignty axes are already built.

## Basics-parity checklist (from their strengths)
- [x] Streaming feel (F2-T4: live SSE + honest interrupted partials + Stop) · [x] dictation (F2-T5: live on-device
  partials — ≥ record-then-transcribe UX) · [x] first-run onboarding + intro (F2-T6) · [x] calm visual language (F1)
- [x] typing indicator/timestamps/grouping per refinement-brief (F2-T2)
- [x] app lock + biometrics (F2-T6) — sovereignty-plus: no consumer AI app offers a local-first PIN/biometric lock
  with keys in the device Keystore; differentiator, not just parity.

## Chat-list ergonomics (F3, owner #12)
Pattern research: **Claude app** = sidebar "Chats" entry → dedicated full page (search + list, calm); **ChatGPT**
= inline sidebar list w/ search; **Gemini** = inline list, busier. Adopted the Claude page pattern on phones
(clearer reachability, room for actions) while tablets keep the inline list (no extra hop on wide screens).
**One-up**: instant LOCAL search + per-row rename/delete without hidden menus — fully offline (competitors need
their cloud for search/history).
