# F2 — Capability Research Dossier (streaming · dictation · biometric · intro · attribution)

## 1. Streaming per-provider (T4 input) — capability matrix + SAFE architecture

WebView facts: Android WebView (Chromium) supports `fetch` + `ReadableStream` (SSE consumable); CORS applies to the
app origin (`https://localhost` per Capacitor default scheme). `CapacitorHttp` bypasses CORS but is buffered-only.

| Provider | Browser-origin viability | Streaming path |
|---|---|---|
| Anthropic | ✓ documented: header `anthropic-dangerous-direct-browser-access: true` enables CORS | fetch SSE |
| Gemini | ✓ API-key REST allows browser CORS; SSE via `:streamGenerateContent?alt=sse` | fetch SSE |
| OpenRouter | ✓ explicitly browser-friendly (BYOK web apps supported) | fetch SSE |
| OpenAI | ✗ no browser CORS policy for api.openai.com | buffered fallback |
| DeepSeek | ? undocumented | runtime attempt → fallback |
| Ollama | ✓ if user sets `OLLAMA_ORIGINS` (LAN server, user-owned) | fetch NDJSON stream |

**Architecture (makes matrix errors HARMLESS): attempt-and-fallback.** Per send: if provider marked streamable →
native `fetch` stream; on ANY pre-first-byte failure (CORS/TypeError/network) → transparent retry via buffered
CapacitorHttp path (existing, tested). Stream chunks render live; the DURABLE write stays single-final (chunks
accumulate in memory; assistant message persisted once complete or once aborted-with-partial → honest `interrupted`
state). Stop button aborts the fetch. Matrix entries live in `providerContracts` as `stream_capable` hints, not gates.
Verification at T4 gate: real-upstream probe where credentials exist (OpenRouter free completion already proven in
lane), E2E with mocked SSE at the HTTP boundary.

## 2. Dictation (T5) — pin decision
- **ADOPT `@capacitor-community/speech-recognition@7.0.1`** — peerDeps `@capacitor/core >=7.0.0` → **Cap 8.4.2 OK**.
  Android native SpeechRecognizer (on-device/Google services), permission `RECORD_AUDIO` + runtime request via plugin.
  UX: mic toggle in composer → partialResults into draft (append-at-cursor), explicit unavailable state when the
  plugin/permission is missing (web dev = unavailable, honest). No cloud key needed. (WebView SpeechRecognition API
  is NOT available in Android WebView — native plugin is the only real path.)

## 3. Biometric app-lock (T6) — pin candidate
- **CANDIDATE `@aparajita/capacitor-biometric-auth@10.0.0`** (same maintained author as our secure-storage 8.0.0).
  peerDeps not declared in registry output → verify on install (author's v10 targets Cap 8; gate: `cap sync` plugin
  registration + typecheck). Fallback: `device credential` mode (PIN/pattern) via the same plugin.
- App-lock design: OPT-IN in Settings (Account) — enable lock → verify biometric/credential → store `app_lock_enabled`
  in Preferences (non-secret flag) — unlock screen on cold start (+ optional on-resume toggle) gating the shell render;
  secrets already live in Keystore (unchanged); NO fake server session. Desktop-parity of EXPERIENCE (login gate +
  branding), local-first truth.

## 4. Intro modal (T6) — spec located, contract adopted
- Source (read-only): main `docs/superpowers/specs/2026-07-19-talos-intro-modal-design.md` (v3, APPROVED copy frozen)
  + ledger `2026-07-19-talos-intro-modal-ledger.md`.
- Adopt: versioned onboarding contract (`intro version` persisted; shown once per version; replayable from Settings),
  claim classification **Available / Roadmap with muted mono ROADMAP chip**, no absolute promises.
- Mobile-truth adjustment (recorded, not silent): the Available list is re-derived for the MOBILE build (BYOK device
  provider profiles + local SQLite chat + attachments/Vault + browse evidence + Model Lab + theme engine); desktop
  server-bound claims (e.g. server-side profiles) are not copied verbatim. Persistence local (Preferences), same
  versioned semantics.

## 5. Model attribution under bubble (T2) — OPEN, resolve at T2 start
- Desktop grep: per-message model label NOT in `TalosChatSurface` props/meta greps so far; evidence drawer shows
  `Model {model_profile_id}`; owner reports seeing "TALOS DeepSeek v4 pro" under their bubble on desktop → locate the
  exact renderer (message status row / metadata line) before implementing the mobile mirror. Mobile data is ready:
  messages persist `model_profile_id`-adjacent metadata via the chat repository.

## 6. Haptics (T6)
- **ADOPT `@capacitor/haptics@8.0.2`** (official, Cap 8). Light impact only on: send, session switch, lock/unlock.
