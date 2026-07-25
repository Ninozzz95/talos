# TALOS Mobile — Guided Account-Creation Wizard (implementation design)

- **Owner:** Antonio Rizzo (Ninozz95) · **Agent:** Fable (`lane/kimi-mobile`) · **Date:** 2026-07-24
- **Status:** DESIGN — awaiting owner GO before implementation (one-step-at-a-time)
- **Phase:** roadmap **N1** (see `plans/2026-07-24-talos-mobile-remaining-program-roadmap.md`)
- **Companion:** `ledgers/2026-07-24-talos-mobile-account-wizard-code-ledger.md` (lowest-level execution)

## 1. Research checkpoint (BLOCKING RULE — logged)
**Web (2026-07-24):**
- Mobile onboarding 2025/26: progressive disclosure, **minimal steps**, ask only the essential up front, reach the
  "aha" in <60s; split into logical stages ("Create account / Set up profile / Connect services"); step count
  scales with complexity; optional personalization; tooltips <140 chars. (UX Design Institute, VWO, NextNative,
  DesignStudio)
- OAuth on Capacitor: `@capgo/capacitor-social-login` (generic OAuth2/OIDC) — **PKCE always** (`pkceEnabled:true`),
  **authorization-code** (`responseType:'code'`, no client secret for public clients), deep-link callback, tokens
  in **Keychain/Keystore**. Local-first + no backend ⇒ the code-for-token exchange still needs a token endpoint,
  so **scaffold + gate honestly** (unchanged from the redesign decision). (Privy, Cap-go, Capgo, Clerk)
**Repo (already owner-sanctioned):** `research/2026-07-22-talos-mobile-competitor-analysis.md`,
`research/2026-07-22-talos-mobile-f2-capability-research.md` (intro/app-lock/first-run patterns).
**Impact on design:** 2-tap minimum happy path; every step after Welcome is skippable; OAuth predisposed + gated
(no fake session); reuse device-proven fullscreen-modal + Keystore patterns already shipped (intro, app-lock).

## 2. Intent & requirements (brainstormed)
**Problem.** Today a local account exists (`stores/account.ts`: name + avatar + predisposed OAuth) but there is **no
guided first-run** that helps the owner set identity, personalize and (optionally) protect the workspace. Settings
expose the pieces à la carte; there is no coherent "set up your TALOS" flow.

**Goals.**
1. A calm, Claude-style **guided wizard** on first run that establishes the local workspace identity in seconds.
2. **Local-first, honest:** no network, no fake auth; OAuth is visibly *predisposed* and gated.
3. **Reuse, don't rebuild:** account store, `TalosAccountAvatar`, `TalosThemedSelect`, app-lock modal, voice service,
   theme store, contextual-back sheet-nav, fullscreen-modal + safe-area patterns.
4. **Skippable & fail-soft:** never blocks boot; default identity `T`; replayable from Settings → Account.
5. Desktop parity **mirror-draft** relayed to Codex (desktop frozen; evaluate when the desktop window opens).

**Non-goals.** Real OAuth token exchange (gated to M2 sync); server accounts; multi-profile; cloud avatar upload.

## 3. UX flow (progressive disclosure, thumb-zone)
Fullscreen wizard, one step per screen, a top progress indicator (dots), primary action bottom (thumb reach),
"Skip" as a quiet secondary. Single contextual **Back** goes one step up (never closes the app).

| # | Step (id) | Content | Skippable | Reuse |
|---|-----------|---------|-----------|-------|
| 1 | `welcome` | Brand mark + one line ("Set up your TALOS"). Primary **Get started**; quiet **Skip setup** | — (soft) | intro tone, brand mark |
| 2 | `identity` | Display-name input + **live avatar** (updates as you type); empty ⇒ default `T` | ✅ (keeps `T`) | `TalosAccountAvatar`, account store |
| 3 | `personalize` | Theme (light/dark/system) + Voice on/off (or pick voice) | ✅ | theme store, `TalosThemedSelect`, voice service |
| 4 | `protect` | Opt-in App-lock PIN (opens the device-proven setup modal) | ✅ | `TalosMobileAppLockModal` (mode=setup) |
| 5 | `signin` | Predisposed OAuth (Google/Apple, **Soon**), honest gate; primary **Continue local-only** | ✅ | `account.oauthProviders`, honest toast |
| 6 | `done` | Summary (name, theme, lock on/off) + **Enter TALOS** | — | — |

**Minimum happy path (aha <60s):** `welcome → identity (type name) → done` = 2 primary taps; optional steps are
one Skip each. A pure "Skip setup" at `welcome` completes immediately with defaults.

## 4. Decisions
- **Wizard is separate from the intro modal.** The intro tells "what TALOS is"; the wizard sets up "your workspace".
  The wizard is gated on its **own** outcome flag and shown once, after the intro completes. No double-gate; no
  overlap (only one fullscreen surface at a time).
- **Persistence is per-outcome, not per-keystroke.** Name persists on the identity step's commit (existing
  `account.setDisplayName`, fenced `talosBridgeCall`). Theme/voice/lock use their existing stores. The wizard only
  writes its own `onboarding.wizard_*` flags.
- **OAuth:** render `account.oauthProviders` (already `available:false`), tap ⇒ honest toast (existing
  `gateReason`). No session, no fake state. `auth_provider` stays `local`.
- **Fail-soft:** any store write failure is caught; the wizard still advances (identity keeps `T`). Boot never blocks
  on the wizard.

## 5. State model & persistence
Extend `stores/settings.ts` `onboarding` subtree (already holds `intro_version/intro_outcome/setup_dismissed`):
```
onboarding: {
  intro_version, intro_outcome, setup_dismissed,   // existing — untouched
  wizard_version: number,                          // NEW — current wizard schema (start 1)
  wizard_outcome: 'completed' | 'skipped' | null,  // NEW — gate + replay signal
}
```
Parse/persist/hydrate mirror the existing onboarding fields (same fenced `talosBridgeCall`, same defaults-safe parse).
Gate: show the wizard when `intro_outcome === 'completed'` AND `wizard_outcome === null` (fresh install), OR on
explicit replay from Settings. `wizard_version` lets a future redesign re-show it.

## 6. Contracts / types
`components/onboarding/wizard/wizardSteps.ts`:
```
export type TalosWizardStepId = 'welcome' | 'identity' | 'personalize' | 'protect' | 'signin' | 'done'
export interface TalosWizardStep { id: TalosWizardStepId; label: string; skippable: boolean }
export const TALOS_WIZARD_STEPS: readonly TalosWizardStep[]   // frozen, ordered
export function talosWizardStepAt(index: number): TalosWizardStep
```

## 7. Component & composable architecture
- `composables/useTalosAccountWizard.ts` — the **state machine** (singleton per mount): `current` step, `index`,
  `progress`, `next()`, `back()`, `skip()`, `complete(outcome)`, `canBack`, `isLast`; persists outcome via settings.
  Cleanup-safe (no leaked listeners). Injectable settings/account for tests.
- `components/onboarding/TalosMobileAccountWizard.vue` — fullscreen **shell**: dialog role + focus trap + safe-area
  (reuse the intro/app-lock modal chrome), top progress dots (`aria-current`), body = current step component, bottom
  nav (Back · Skip · primary). Emits `@close` (completed/skipped).
- Step components under `components/onboarding/wizard/`: `WizardWelcome.vue`, `WizardIdentity.vue`,
  `WizardPersonalize.vue`, `WizardProtect.vue`, `WizardSignIn.vue`, `WizardDone.vue` — each dumb-ish, props in /
  events out, so each is unit-testable in isolation.

## 8. Integration points
- **Boot gating:** `App.vue` (or the intro host) — after intro `completed`, if `wizard_outcome === null`, mount the
  wizard once. Uses the same async-component + fail-soft pattern as the intro.
- **Replay:** Settings → Account panel — add a "Set up workspace" / "Rivedi setup" row that re-opens the wizard
  (parity with the existing "Replay introduction" row).
- **Android back:** the wizard consumes hardware Back to go one step up; at `welcome`, Back = skip/close (never exits
  the app abruptly) — wire through the existing `registerNativeAppLifecycle` onBack, mirroring the sheet-nav rule.

## 9. a11y / motion / i18n / safe-area
- Dialog role, focus moves to the step heading on change, focus trap (reuse app-lock modal's proven trap).
- Progress dots `aria-current="step"`; every input labelled; primary/secondary reachable in thumb zone.
- Transitions respect `prefers-reduced-motion` (fade only). Safe-area insets top+bottom.
- Copy centralized (English strings now; owner is Italian — copy kept in one place for easy IT pass later).

## 10. Test strategy (TDD — full list in the code ledger)
- **Unit:** wizard state machine (next/back/skip/complete + persistence + gate); each step renders + emits; shell
  orchestration (progress, nav enable/disable); boot-gating predicate; settings onboarding parse/persist of the two
  new fields.
- **e2e:** first-run wizard appears after intro; happy path persists name + `wizard_outcome=completed`; skip path sets
  `skipped`; wizard does **not** reappear after completion (reload); replay from Settings re-opens it; OAuth tap shows
  the honest gate (no session); PIN opt-in opens the app-lock setup modal; Back inside the wizard goes one step up.

## 11. Risks & open questions
- **Intro vs wizard ordering** — decided: sequential (intro then wizard), single fullscreen surface at a time. If the
  owner prefers merging the intro's last slide into the wizard welcome, that's a 1-step change.
- **Entry-chunk budget** — currently 485.2k/512k. The wizard is **lazy-loaded** (async component, first-run only) so
  it must not inflate the initial JS bundle; verify it lands in its own chunk (the build's `initial_javascript_bytes`
  gate must stay < 512000).
- **Copy language** — ships English first (consistent with current UI); an Italian pass is a trivial follow-up.

## 12. Codex mirror (parity rule)
Formal mirror-draft ticket to relay to Codex (desktop is frozen at `5dd0c0be`): "Evaluate a desktop equivalent of the
guided account-creation wizard (local identity + predisposed OAuth) when the desktop window is next opened; the mobile
implementation is the reference." Ledger records the ticket text for relay.
