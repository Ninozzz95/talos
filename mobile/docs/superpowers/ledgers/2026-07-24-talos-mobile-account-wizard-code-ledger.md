# TALOS Mobile — Account Wizard · lowest-level code ledger

- **Owner:** Antonio Rizzo (Ninozz95) · **Agent:** Fable (`lane/kimi-mobile`) · **Date:** 2026-07-24
- **Design:** `specs/2026-07-24-talos-mobile-account-wizard-design.md` · **Roadmap:** N1
- **Status:** PLANNED — execute AFTER owner GO. TDD throughout (RED→GREEN), one cohesive commit, no fragmentation.
- **Base:** HEAD `44a3b5c`. **Budget:** initial JS must stay `< 512000` B (wizard is lazy-loaded).

## 0. Preconditions & rollback
- Precondition: owner GO. Skills: brainstorming ✔ (design), TDD (below), frontend-design for the shell chrome.
- Feature-safety: wizard is **first-run + replay only**, async-loaded, fail-soft — if it throws, boot proceeds.
- Rollback: gate is a single predicate; setting `wizard_outcome` unconditionally to `'completed'` (or removing the
  mount in `App.vue`) disables it with zero data migration.

## 1. File inventory
### New
| Path | Kind | Purpose |
|------|------|---------|
| `src/components/onboarding/wizard/wizardSteps.ts` | types+const | step ids, ordered table, accessor |
| `src/composables/useTalosAccountWizard.ts` | composable | step state machine + outcome persistence |
| `src/components/onboarding/TalosMobileAccountWizard.vue` | component | fullscreen shell (progress, nav, focus trap) |
| `src/components/onboarding/wizard/WizardWelcome.vue` | component | step 1 |
| `src/components/onboarding/wizard/WizardIdentity.vue` | component | step 2 (name + live avatar) |
| `src/components/onboarding/wizard/WizardPersonalize.vue` | component | step 3 (theme + voice) |
| `src/components/onboarding/wizard/WizardProtect.vue` | component | step 4 (app-lock opt-in) |
| `src/components/onboarding/wizard/WizardSignIn.vue` | component | step 5 (predisposed OAuth, gated) |
| `src/components/onboarding/wizard/WizardDone.vue` | component | step 6 (summary) |
| `tests/unit/composables/useTalosAccountWizard.test.ts` | test | state machine |
| `tests/unit/onboarding/wizardSteps.test.ts` | test | contract of the step table |
| `tests/unit/onboarding/TalosMobileAccountWizard.test.ts` | test | shell orchestration |
| `tests/unit/onboarding/wizardStepComponents.test.ts` | test | each step renders/emits |
| `tests/e2e/mobile-account-wizard.e2e.spec.ts` | test | first-run + replay journeys |

### Modified
| Path | Change |
|------|--------|
| `src/stores/settings.ts` | `onboarding`: add `wizard_version:number`, `wizard_outcome:'completed'\|'skipped'\|null`; parse/persist/hydrate + `setOnboardingWizard(outcome)`; keep existing fields untouched |
| `src/App.vue` | boot-gate mount of the async wizard after intro; route hardware Back through the wizard when open |
| `src/components/talos/settings/TalosMobileSettingsAccountPanel.vue` | add "Set up workspace" replay row (parity with Replay introduction) |
| `tests/unit/stores/settings*.test.ts` | characterize the two new onboarding fields |

## 2. New-file signatures (lowest level)
### `wizardSteps.ts`
```ts
export type TalosWizardStepId = 'welcome'|'identity'|'personalize'|'protect'|'signin'|'done'
export interface TalosWizardStep { id: TalosWizardStepId; label: string; skippable: boolean }
export const TALOS_WIZARD_STEPS: readonly TalosWizardStep[] = Object.freeze([
  { id:'welcome',     label:'Welcome',     skippable:false },
  { id:'identity',    label:'Your identity',skippable:true },
  { id:'personalize', label:'Personalize', skippable:true },
  { id:'protect',     label:'Protect',     skippable:true },
  { id:'signin',      label:'Sign in',     skippable:true },
  { id:'done',        label:'All set',     skippable:false },
])
export function talosWizardStepAt(i:number): TalosWizardStep   // clamped
```

### `useTalosAccountWizard.ts`
```ts
export interface TalosAccountWizard {
  current: Ref<TalosWizardStep>
  index: Ref<number>
  progress: ComputedRef<number>      // 0..1
  canBack: ComputedRef<boolean>
  isLast: ComputedRef<boolean>
  next(): void
  back(): void
  skip(): void                       // advances; if last-before-done, jumps to done
  complete(outcome:'completed'|'skipped'): Promise<void>   // persists onboarding.wizard_outcome
}
export function useTalosAccountWizard(deps?: { settings?: SettingsStore }): TalosAccountWizard
export function __resetAccountWizardForTests(): void
```
- Pure step machine over `TALOS_WIZARD_STEPS`; `complete()` calls `settings.setOnboardingWizard(outcome)`.
- No listeners; nothing to leak. Injectable settings for tests.

### `TalosMobileAccountWizard.vue`
- Props: none (reads stores). Emits: `close: ['completed'|'skipped']`.
- Structure: fullscreen dialog (role=dialog, aria-modal, focus trap reused from app-lock modal), safe-area insets;
  header = progress dots (`aria-current="step"`); body = `<component :is="STEP_COMPONENT[current.id]">`; footer nav:
  `Back` (v-if canBack), `Skip` (v-if current.skippable), primary (`Get started`/`Continue`/`Enter TALOS`).
- `data-testid`: `talos-account-wizard`, `talos-wizard-back`, `talos-wizard-skip`, `talos-wizard-primary`,
  `talos-wizard-progress`.
- Wires step events: identity→persist name; protect→open `TalosMobileAppLockModal` mode=setup; signin→gated toast;
  done→`complete('completed')` then `emit('close','completed')`.

### Step components (props in / events out)
- `WizardWelcome.vue` — emits `start`, `skip`.
- `WizardIdentity.vue` — local `name` model; renders `<TalosAccountAvatar size="lg"/>` (live) + name input; emits
  `commit:[string]` on continue (caller calls `account.setDisplayName`). `data-testid="talos-wizard-name"`.
- `WizardPersonalize.vue` — theme via existing theme store; voice on/off via voice service/settings; emits `continue`.
- `WizardProtect.vue` — button "Set a PIN" emits `setupPin`; "Not now" emits `continue`. (Modal owned by shell.)
- `WizardSignIn.vue` — v-for `account.oauthProviders`, tap emits `oauth:[id]` (shell shows honest toast); primary
  "Continue local-only" emits `continue`. `data-testid="talos-wizard-oauth-<id>"`.
- `WizardDone.vue` — props `{ name:string; theme:string; lock:boolean }`; primary emits `enter`.

## 3. Modified-file edits
### `stores/settings.ts`
- Extend the `onboarding` default with `wizard_version: 1, wizard_outcome: null`.
- `parseOnboarding`: read the two fields defensively (`wizard_outcome ∈ {'completed','skipped'}` else `null`;
  `wizard_version` number else 1). Keep existing fields byte-identical.
- Persist them inside the existing onboarding persist payload (fenced `talosBridgeCall`).
- Add `async setOnboardingWizard(outcome:'completed'|'skipped'){ state.onboarding.wizard_outcome = outcome; await persist() }`.
- Add a boot-gate helper (or compute in App): `shouldShowAccountWizard = intro_outcome==='completed' && wizard_outcome===null`.

### `App.vue`
- Import the wizard as an **async component** (`defineAsyncComponent`) so it lands in its own chunk.
- After intro completes (existing intro host flow), `v-if="showAccountWizard"` mounts `<TalosMobileAccountWizard @close="onWizardClose">`; `onWizardClose` clears the local flag (outcome already persisted by the wizard).
- `registerNativeAppLifecycle` onBack: **before** the sidebar/sheet checks, if the wizard is open, route Back to the
  wizard's `back()` (one step up); at `welcome`, Back = skip/close. (Mirror of the sheet-nav one-level rule added in `d51099e`.)

### `TalosMobileSettingsAccountPanel.vue`
- Add a row under Identity: button `data-testid="talos-wizard-replay"` "Set up workspace" → sets a provide/emit that
  re-opens the wizard (same mechanism as "Replay introduction": leave Settings first, then open). Reuses
  `TalosAccountAvatar`/account store already imported.

## 4. TDD execution order (RED→GREEN, watch each fail first)
1. `wizardSteps.test.ts` → freeze/order/skippable + `talosWizardStepAt` clamp. → impl `wizardSteps.ts`.
2. `useTalosAccountWizard.test.ts` → next/back bounds; `skip` on skippable advances; `progress`/`isLast`/`canBack`;
   `complete('completed')` persists via injected settings; `skip` at last-optional jumps to `done`. → impl composable.
3. `settings*.test.ts` (new cases) → parse defaults both fields; round-trip persist/hydrate; `setOnboardingWizard`
   flips outcome; existing onboarding fields untouched. → impl settings edits.
4. `wizardStepComponents.test.ts` → each step renders its testids and emits its event; Identity shows live avatar and
   emits `commit` with the typed name; SignIn renders gated providers and emits `oauth`. → impl step components.
5. `TalosMobileAccountWizard.test.ts` → mounts at `welcome`; primary advances; `skip` hidden on non-skippable; Back
   hidden at first step; reaching `done` + primary calls `complete('completed')` and emits `close`; Protect opens the
   app-lock modal; SignIn tap surfaces the honest toast (no session). → impl shell.
6. Boot-gate predicate test (in settings or a small `appGating.test.ts`) → true only when intro done + outcome null.
   → wire `App.vue`.
7. `mobile-account-wizard.e2e.spec.ts` (see §5). → wire replay row + finalize.

## 5. e2e scenarios (`mobile-account-wizard.e2e.spec.ts`)
- **First-run:** storageState with `intro_outcome:'completed'`, `wizard_outcome:null` → wizard appears; type name →
  Continue through → **Enter TALOS**; assert chat reachable, sidebar avatar shows the initial, reload → wizard does
  **not** reappear (`wizard_outcome:'completed'`).
- **Skip:** at Welcome tap Skip → completes with `skipped`; avatar shows `T`; no reappear on reload.
- **Replay:** from Settings → Account → "Set up workspace" → wizard opens again.
- **OAuth gated:** on Sign-in step, tap Continue-with-Google → honest toast, no session, `auth_provider` stays local.
- **PIN opt-in:** Protect → "Set a PIN" opens the app-lock setup modal (device-proven dialog renders).
- **Back one level:** inside the wizard, header Back goes step→step; at Welcome, Back does not hard-exit.

## 6. Gates (run in order, all must pass before commit)
1. `npx vue-tsc --noEmit -p tsconfig.app.json` → 0
2. `npx vitest run` → all green (expect +~20 tests)
3. `npx playwright test` → all green (expect +1 spec)
4. `npm run build` → `"ok":true`, `initial_javascript_bytes < 512000` (verify the wizard is a **separate** chunk)

## 7. Delivery
1. Commit (one cohesive commit), trailer:
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` + `Claude-Session: …`
2. `npm run build` **after** commit (stamp == HEAD) → verify short-SHA in `dist/assets/index-*.js`.
3. `npx cap sync android`.
4. `JAVA_HOME=…jdk-21.0.11+10 ./gradlew.bat assembleDebug --no-daemon --console=plain`.
5. Python: copy bare → `C:/Users/ninox/Desktop/talos-mobile-R8.apk`; zip → scratchpad; `testzip` + inner-SHA == src;
   deliver zip in chat + bare on Desktop.
6. Update the redesign ledger / this ledger status log with final gate numbers.

## 8. Codex mirror ticket (relayable, formal)
```
TO: Codex (integration lane)
RE: [MIRROR-DRAFT] Guided account-creation wizard (mobile → desktop)
CONTEXT: Mobile lane lane/kimi-mobile shipped a guided first-run wizard (local identity + avatar,
  optional theme/voice/PIN, predisposed+gated OAuth, replayable from Settings). Local-first, no fake auth.
ASK: When the desktop window is next opened (currently frozen at 5dd0c0be), evaluate a desktop equivalent for
  onboarding parity; the mobile implementation (spec 2026-07-24-talos-mobile-account-wizard-design.md) is the reference.
BLOCKING: none for mobile; desktop side is freeze-gated. No backend needed until M2 sync (OAuth stays predisposed).
```

## 9. Status log
- 2026-07-24: ledger created (design + lowest-level plan). Awaiting owner GO to execute step 1 (TDD `wizardSteps`).
- 2026-07-24: **OWNER GO — IMPLEMENTED (TDD, one cohesive change).** Web research logged in the spec. Built:
  `wizardSteps.ts`, `useTalosAccountWizard` (pure step machine), `useTalosMobileWizardState` (first-run gate mirroring
  the intro contract + hardware-Back registry), `lib/wizardInjection.ts`, the shell `TalosMobileAccountWizard.vue`,
  6 step components, App.vue gating+provide+Android-Back, the Settings→Account "Set up workspace" replay row.
  Settings onboarding extended with `wizard_version`/`wizard_outcome` (reused `setOnboarding`, no new setter).
  `TalosAccountAvatar` gained an `initial` override + a shared `talosAccountInitialFrom` helper for the live preview.
  Reconciled every e2e storageState (returning users seeded `wizard_version:1`; the 3 fresh-install intro journeys
  dismiss the wizard that now follows the intro).
- 2026-07-24: **SF-critic pass (fix-first).** Applied MAJOR M1 (wizard z-index `z-[68]→z-[72]` above the tool sheet
  z-70 + `await router.push` before replay so it never mounts behind a station sheet), M2 (Android Back at the first
  step dismisses the wizard instead of a dead key), M3 (Back closes the child app-lock modal first, not the hidden
  wizard beneath), M4 (Skip on identity still commits the typed name — the live avatar preview never lies). Applied
  minors m5 (sr-only "Step N of N" live region), m6 (closing ON Done records `completed`, not `skipped`), m10
  (dropped the dead `goToDone`; hint uses `talosAccountInitialFrom('')`), m11 (avatar `||` guard). Deferred with
  rationale: m7 (focus-trap/inert — consistent with the existing intro; a shared a11y pass upgrades both later), m8
  (wizard after intro-skip = deliberate product choice; wizard is one-tap skippable), m9 (mic-permission timing —
  minor). Refuted by SF and re-confirmed: no-fake-auth, persist idempotency/no-reopen-loop, no intro-field clobber,
  setup-checklist non-race, avatar reuse. Added 5 regression tests for the SF fixes.
- 2026-07-24 GATES: **tsc 0 · unit 1371 · e2e 63/63 · build ok (wizard chunk 12.4 kB lazy, initial
  486,516/512,000)**. Committed `5d27efa`. Stamp==HEAD verified. Building APK R8.
