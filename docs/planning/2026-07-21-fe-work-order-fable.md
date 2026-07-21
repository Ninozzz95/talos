# FE work-order → Fable (all outstanding front-end requests)

**Compiled:** 2026-07-21 · **From:** Codex (integration) · **For:** Fable (desktop FE lane).
**Rule for every item:** flag `mobile-relevant: sì/no + cosa` in your delivery report so Codex can relay a mirror ticket to Kimi ([[desktop-mobile-parity-mirror]]). Only the user commits. Items needing visual sign-off are marked **[mockup first]**.

**Suggested order** (user priorities; user can reorder): C (themed-select sweep, quick) → B (composer icon-controls) → A (message rendering) → D (voice/STT) → E (auto-prompt browse) → F/G (browser + upload FE ripple, land when Codex ships the contracts).

---

## A. Message-rendering refactor — bubbles → full-width sections **[mockup first]**
**What:**
- **Default**: assistant messages render as **full-width sections, NO bubble** — and must **always widen to the FULL width of the chat section** (user was explicit: "la risposta si deve allargare sempre a larghezza piena").
- **User (send) messages keep the bubble**; long user messages are **truncated with Espandi/Riduci** (expand/collapse).
- **Settings → Appearance**: a toggle **"Sezioni / Bolle"** — "Bolle" restores today's bubble style for both roles (nothing is lost, it becomes an option).
**Why:** match Claude/ChatGPT reading experience (full-width answers), keep send messages compact.
**Do first:** review competitors (Claude, ChatGPT) and one-up; produce mockups for user approval before building.
**Acceptance:** default = assistant full-width sections; user bubble + collapse on long; Appearance toggle switches both; no regressions in copy/markdown/code rendering.
**mobile-relevant:** SÌ — mirror the section/bubble modes + Appearance toggle.

## B. Composer icon-controls default + custom tooltips
**What:**
- **Settings → Appearance**: the chat composer defaults to **icon controls** (icon-only mode on by default; text-label mode stays available).
- **Custom tooltips on hover** for every composer icon: model picker, reasoning effort, grounding context, attach file, browse, temporary chat, improve prompt, send — clear, human labels.
**Why:** cleaner composer by default; discoverability via tooltips.
**Acceptance:** fresh install shows icon-only composer; each icon has a tooltip with the right label + keyboard/a11y (aria-label unchanged); toggle in Appearance flips label/icon mode.
**mobile-relevant:** SÌ — mobile is already icon-only 44px (FV2-06.0); mirror the tooltips + the Appearance toggle semantics.

## C. TalosThemedSelect sweep — remaining native `<select>` **[approved]**
**What:** replace the remaining **8 native `<select>`** in Settings/Theme with **TalosThemedSelect** (the themed, portalized, keyboard-accessible select already built) — kills the OS-white dropdowns on the dark theme.
**Status:** TalosThemedSelect + the Model Center "Provider" select already shipped in your last drop; this is the sweep of the other 8.
**Acceptance:** zero native `<select>` left in settings/theme surfaces; each themed select keyboard + a11y correct; E2E selectors updated (they use `combobox`/option now, not native `selectOption`).
**mobile-relevant:** SÌ — mirror any themed-select usage (Kimi already uses themed selects, 12/12).

## D. Voice chat / STT — dictate into the composer
**What:** a **mic button** in the composer that records and transcribes speech to text **into the input** (write in chat by voice).
**Why:** parity-or-better with competitors; user asked for it explicitly.
**Do first:** research an **upstreamable** STT lib (Whisper family) — must be **extremely reliable** ([[prefer-upstream-libraries-best-practices]]); propose the approach (in-browser vs server STT) before building. Coordinate the backend/endpoint with Codex.
**Acceptance:** mic → live/near-live transcription into the composer; clear recording state; cancel/retry; a11y; graceful fallback if unsupported.
**mobile-relevant:** SÌ — mirror the mic affordance (native mic permissions handled by Kimi/GPT5 build).

## E. Browsing UX — auto-prompt to enable Browse on a URL
**What:** in a **non-browser** conversation, when the user's message contains a **URL / site**, show a **smooth, prod-ready prompt** asking whether to **enable browsing mode** (one tap to turn Browse on and go).
**Why:** removes the manual step of enabling Browse when the user clearly wants to visit a link.
**Acceptance:** URL detected in composer/message → non-intrusive inline prompt → accepting enables Browse for that turn; dismissable; never fires spuriously on non-URL text; respects the Browse capability gating.
**mobile-relevant:** SÌ — mirror the prompt.

## F. Browser Stage-2 — FE affordances (land when Codex ships the worker contract)
**What (FE side of the Stage-2 rework Codex is building):**
- **Scrollable snapshot**: the browse evidence stage must **scroll** and drive a worker scroll → new frame (today it's a static viewport frame).
- **Retry affordance** in `useTalosBrowse`: for **recoverable** browse states show "Recupera/Riprova" (no full restart); for **terminal** show "Riavvia sessione". (Codex classifies transient vs terminal in the response.)
- Click target moves from x/y to a **ref** (aria-snapshot ref) — FE sends the ref Codex's new contract exposes.
**Depends on:** Codex's Stage-2 worker/control-plane contract (in design now). Fable builds the FE stage/affordance once the contract lands.
**mobile-relevant:** SÌ.

## G. File upload — attachment tray polish (Part 2 FE)
**What:** now that images ingest as **vision-only** attachments (Codex fixed the backend), the composer tray should:
- show an **image thumbnail/preview** for image attachments,
- label vision-only vs text-extracted,
- surface **clear failure reasons** (e.g. malware-quarantined) instead of a generic fail.
**Depends on:** Codex's Part 2 (image → vision content to the model) for the end-to-end; the tray polish is independent and can ship first.
**mobile-relevant:** SÌ.

---

### Already delivered (no action — for context)
- FV2-06.0 composer model + effort selector (themed picker, Auto+Models, effort chip, Extended-thinking toggle) — shipped (C3).
- TalosThemedSelect + Provider Model Center — shipped.
- Prod-gate dev acronyms (rail + window title bar) — shipped.

### Backend already fixed (2026-07-21, so FE can rely on it)
- Browser recovery-lock resolved (SQLite WAL + busy_timeout) — the "could not commit current evidence" lock no longer forces a new session.
- Image upload resolved (vision-passthrough) — png/jpg ingest as `available` instead of failing with `TALOS_OCR_REQUIRED`.
