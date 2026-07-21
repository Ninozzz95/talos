# AVM / TALOS — Open threads & roadmap (living doc)

**Owner:** Codex (integration lane) · **Started:** 2026-07-21 · **Purpose:** single place that remembers everything the user has asked for, with status + next action, so no thread is lost across context switches.
**Golden rules in force:** one-step-at-a-time · no fragmentation (cohesive units) · **reproduce before claiming a fix** (real feedback, not guesses) · library-first (don't reinvent) · desktop→mobile parity mirror · **only the user commits** · agent-takeover when an agent stalls.

**Priority order (user-stated):** Browser reliability (PROD-CRITICAL) → file-upload bug → voice/STT → composer icon-controls → message-rendering refactor. Mobile runs in parallel (Kimi + Codex). Agent-bus is an enabler.

---

## A. Browser reliability — PROD-CRITICAL 🔴 (in progress)
The user must be able to browse real sites (test set: `https://caradero-web.vercel.app/...`) and click inside the snapshot reliably, with a scrollable snapshot. "In prod non possiamo permetterci un software mezzo buggato."

**Root cause FOUND (from real container logs, 2026-07-21):**
`SQLSTATE[HY000]: General error: 5 database is locked` on `UPDATE talos_browser_tasks` during browsing. The control-plane on :8088 runs on **SQLite** (single writer); the browse flow does many concurrent writes (evidence + audit + task status + lease) → SQLite errors "database is locked" → the commit throws → `recoveryRequired()` fires the *"could not commit current evidence"* message and **sticky-locks the session** (must restart). The earlier Stage-1 `retry()` patch only touched a sub-path and did **not** fix the real (DB-level) cause.

**Fix (standard, library-first):** enable SQLite **WAL journal mode + `busy_timeout`** so concurrent writers wait for the lock instead of erroring immediately. In prod, also use Postgres/MySQL (no single-writer limit). WAL+busy_timeout is the canonical Laravel remedy for "database is locked".

**Open bugs (each must be reproduced on-screen before any fix is claimed):**
1. Recovery lock *"could not commit current evidence / Recovery required"* → can't retry without restarting the browser. (← DB lock; WAL+busy_timeout.)
2. **White/blank snapshot after restart** → likely cascade of the failed evidence commit (snapshot artifact not stored) + bespoke-snapshot fragility. Reproduce.
3. **Snapshot not scrollable** → structural: viewport-only screenshot, coords clamped to viewport, no scroll op exposed. Needs a scroll op / the library-first rework.
4. **Click-in-snapshot unreliable** → bespoke coordinate hit-test (CDP `DOM.getNodeForLocation` + fingerprint), fragile "target changed before dispatch".

**Stage-2 rework (library-first, user is open to redoing it properly):** replace the bespoke HMI snapshot/click machinery with **Playwright built-ins** already in the stack — `page.accessibility` / `@playwright/mcp` aria-snapshot (stable refs), `locator`/`getByRole` click with actionability auto-wait + `scrollIntoViewIfNeeded`, `mouse.wheel` / `fullPage` for scroll. Keeps the security fencing (terminal reasons stay terminal; trusted-event dispatch guard + navigation policy untouched).

**Verification harness (being built):** `control-plane/tests/live/browse-debug.mjs` — a headless Playwright script that drives the LIVE :8088 app on caradero end-to-end and, at every step, saves **screenshots + the real API error codes** (intercepts `/api/talos/browser/**`, prints the 409 `reason`). Goal: Codex verifies on-screen; the user stops hand-testing.

**Competitor research + one-up:** browser-use, Stagehand, Playwright-MCP — adopt proven snapshot/click/scroll patterns, aim at-or-above them.

**Status / next:** harness → reproduce (DB-lock + white snapshot + upload) with screenshots → apply WAL+busy_timeout → re-verify prima/dopo → then Stage-2 (scroll + ref/locator click). Nothing declared "fixed" until shown on screen.

## B. File upload from chat composer — BROKEN 🔴 (investigate)
User: cannot upload files from the chat composer. `TalosBrowserFileUploadService` exists; find where it breaks (possibly same DB-lock origin, possibly its own defect). Reproduce via the harness (it also exercises "Attach a file"). High priority (user is blocked + frustrated it wasn't surfaced).

## C. Browsing UX — auto-prompt to enable browse 🟡 (feature, queued)
In a NON-browser conversation, when a URL / site is detected in the user's message, **auto-prompt** (smooth, prod-ready) asking whether to enable browsing mode. Implement clean after browser stability.

## D. Voice chat / STT 🟡 (queued)
Write in chat by voice (speech-to-text). Research upstreamable libs (Whisper family); must be at or above competitors. Library-first.

## E. Composer icon-controls 🟡 (queued)
Settings → Appearance: composer defaults to **icon controls**, plus **custom tooltips** on hover of the composer icons. (Fable's FV2-06.0 already made composer controls icon-only 44px on mobile; align desktop default + tooltips.)

## F. Message-rendering refactor 🟡 (queued)
Assistant messages = **full-width sections, no bubble, by default** (must always widen to the FULL width of the chat section). User (send) messages keep the bubble; long ones truncate with **Espandi/Riduci**. Keep current bubble style as an **Appearance toggle (Sezioni / Bolle)**. Mirror to mobile. Mockups on approval.

## G. Mobile app (local-first, identical to desktop) 🟢 (active)
Must run **standalone/local-first** by default (mobile-only install, no desktop server); desktop-sync later/optional; style **identical** to desktop. **Step-1 foundation DONE** (Kimi): chrome + 5 empty-state screens + router + native framing + additive `--talos-*` theming (unit 55/55, typecheck 0, build prod green). **Next:** shell rework bottom-nav → icon-rail + tool-sheets (authorized); FV2-06.0 model+effort mirror (step-2). **GPT5 out of credits → Codex takes build/cap-sync/assembleDebug/APK/icons/device-verify** (gated: Android toolchain + ADB absent). Kimi owns lane code + review.

## H. Agent-bus (autonomous ticket exchange) 🟡 (spec drafted)
File-based bus so agents hand off tickets without the user relaying. Spec + ledger drafted: `docs/agent-bus/SPEC.md`, `LEDGER.md` (canonical `.agent-bus/` outside git, Stop-hook auto-pickup, guardrails: human circuit-breaker for commits/deploys, scope fences, anti-loop, kill-switch, audit). Build after browser stability. Codex to review the spec before building.

## I. Desktop→mobile parity mirror (standing rule) 🔵
Every relevant desktop FE change → mirror ticket to Kimi. Live example: FV2-06.0 (model+effort). Fable's TalosThemedSelect + prod-gate acronyms → mirror relayed (mobile largely already aligned).

## J. FV2-06.0 model+effort selector 🟢 (largely done)
C3 composer picker merged; MODEL-P0 E2E 8/8; effort capability + composer visibility done. Pending micro: expose `model_routing_profile_id` in message `metadata.run` for the Auto receipt (non-breaking). Fable next drop: sweep 8 native-select settings/theme → TalosThemedSelect.

---

## Environment blockers (host-owned)
- **Podman VM**: recovered 2026-07-21 (stop→start, no reboot). Runbook: `docs/ops/podman-stack-recovery.md`.
- **Android toolchain / ADB / emulator**: absent; device-verify + APK build gated (needs SDK install or a connected device; emulator needs a host reboot for WHPX). User-owned.
- **Log noise**: `Laravel\Pail\PailServiceProvider not found` spams the prod log ~every 5s (dev provider referenced in a `--no-dev` build) — minor, worth silencing.

## Verification discipline (why this doc exists)
The Stage-1 retry patch was shipped "verified" by code-reading + regression tests but **not reproduced** → it didn't fix the user's bug. New rule: **reproduce with real feedback (screenshots/logs/error codes) → fix → re-verify in the same automation.** Regression tests prove "didn't break", not "fixed". See memory `reproduce-before-claiming-fix`.
