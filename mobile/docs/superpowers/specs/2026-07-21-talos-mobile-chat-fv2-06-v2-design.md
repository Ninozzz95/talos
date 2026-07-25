# TALOS Mobile Chat + FV2-06.0 V2 Design

**Status:** approved by coordinator ticket v2 on 2026-07-21  
**Desktop source revision:** `main@19d854ecae992a31add87915dd6c6ce4efd9b1ac`  
**Mobile implementation base:** `lane/kimi-mobile@844d248392190e1c17faec6e9d22b7b5c8dcc7ef`

## Purpose

Replace the empty mobile Chat surface with a controlled, local-first chat screen that mirrors the current desktop hierarchy and implements the complete visible FV2-06.0 model/effort interaction. This slice builds the screen layer only. Kimi retains routing, persistent repositories, portable contracts, theme identity and secure-secret architecture.

## Approaches considered

### 1. Import desktop components directly

Rejected. The desktop components depend on Laravel-owned composables, desktop window orchestration, server profile endpoints and desktop-only evidence state. Importing them would make the APK depend on the desktop runtime and violate the standalone requirement.

### 2. Port the desktop component contract into controlled mobile views

Adopted. The mobile components preserve desktop labels, information hierarchy, effort semantics, provider identity, accessible selection behavior and token usage. They accept validated view models and emit typed intents. Kimi maps local repositories/contracts to this view boundary and owns the route import.

### 3. Design a separate native-looking mobile chat

Rejected. It would create a second product language, drift from FV2-06.0 and make permanent desktop-to-mobile parity expensive.

## Architecture

The screen is split into small controlled components:

- `TalosMobileChatScreen` composes the thread and composer without owning persistence.
- `TalosMobileMessageList` renders user, assistant and controlled system states from local view models.
- `TalosMobileComposer` owns only transient UI state: draft text and which selector is open.
- `TalosMobileComposerModelPicker` renders configured profiles plus optional Auto routes as one themed listbox.
- `TalosMobileEffortPicker` renders the selected profile's supported effort subset plus implicit Off and conditionally renders Extended thinking.
- `TalosMobileModelCatalog` mirrors Model Lab's catalog cards, search, provider filter, effort disclosure and composer-visibility intent.
- `mobileEffort.ts` is a pure UI utility implementing the frozen FV2-06.0 order and clamp behavior.
- `mobileProviders.ts` is a presentation-only provider registry using the exact desktop labels and checked-in provider marks. It does not hold credentials or execute requests.

All data-changing operations leave the screen as typed events. No screen imports Laravel APIs, calls a desktop server, writes browser storage or persists secrets.

## View contracts

### Model profile

`TalosMobileModelProfileView` contains only fields required to render and select a profile:

```ts
type TalosMobileProviderId = 'anthropic' | 'deepseek' | 'gemini' | 'ollama' | 'openai' | 'openrouter'
type TalosMobileModelStatus = 'untested' | 'healthy' | 'degraded' | 'failed' | 'disabled'

interface TalosMobileModelProfileView {
    id: string
    provider: TalosMobileProviderId
    model: string
    display_name: string
    status: TalosMobileModelStatus
    has_secret: boolean
    effort_levels: string[]
    supports_thinking: boolean
    show_in_composer: boolean
    capabilities: Record<string, unknown> | null
    probe_ok: boolean | null
}
```

Unknown provider IDs are rejected by the architecture mapper before reaching this view. A profile is selectable only when it is not failed/disabled and either does not require a secret or `has_secret` is true.

### Auto route

`TalosMobileRoutingProfileView` contains `id`, `name`, `status` and `lane_count`. It is selectable only when enabled and `lane_count > 0`. Selection emits the route ID; the screen does not implement routing.

### Effort

The canonical vocabulary is `off < minimal < low < medium < high < xhigh < max`. The visible ladder is built from the selected profile's `effort_levels`, deduplicated and canonically ordered, with exactly one implicit `off`. Unsupported desired values clamp to `high` when present, otherwise the highest supported value, otherwise `off`.

### Message

`TalosMobileMessageView` contains a stable ID, role, content, timestamp and delivery state. Rich evidence/browser/file payloads remain out of this first slice and are added by their own parity cards; no placeholder evidence controls are shown.

## Visual parity

- Telemetry tokens remain the only palette/type/radius source.
- The composer is a compact bordered surface detached from the screen edge and remains above bottom navigation, safe area and the virtual keyboard.
- Mobile composer actions are icon-only with accessible names and minimum 44x44 CSS-pixel targets.
- The model trigger shows the provider mark and selected display name when space permits.
- The effort trigger shows the Gauge mark and selected effort label.
- Picker rows reproduce desktop primary/secondary text, selected accent state, disabled state and check mark.
- Model catalog reproduces provider filters, search, readiness status, capabilities, effort chips and visibility toggle without desktop multi-column assumptions.
- No decorative card is nested inside another card.

## Accessibility

- The model picker follows the WAI-ARIA single-select listbox pattern: named listbox, `role=option`, `aria-selected`, disabled options excluded from roving focus, Arrow Up/Down wrap, Home/End jump, Escape closes and restores focus to the trigger.
- The effort choices use a named single-choice group with `aria-pressed`; thinking uses `role=switch` and appears only for supported profiles.
- Every icon-only control has an accessible name independent of tooltip/hover.
- Status, loading and controlled errors use textual live-region semantics.
- Reduced-motion behavior is inherited from the existing mobile global contract.

## Local-first and security boundary

- Android's local source of truth must be behind a Kimi-owned repository; the screen never reads network data directly.
- `@capacitor/preferences` is retained only for lightweight shell preferences. It is explicitly rejected for chat history, model catalog or provider secrets.
- Provider credentials require a separately approved secure-secret boundary. Until one exists, secret-requiring profile creation is not surfaced as an active form in this slice.
- A missing model capability disables Send and names the reason. There is no silent provider fallback.
- External sync is absent from this slice and cannot block local rendering.

## Upstream decisions

- **Adopt:** WAI-ARIA APG Listbox keyboard/selection semantics for the model picker.
- **Adapt:** Android official offline-first rule: local repository is the UI source of truth; screen reads local state and emits intents.
- **Retain:** pinned Vue 3, Capacitor 8 and checked-in shadcn-vue primitives already accepted by M1.
- **Reject for domain storage:** Capacitor Preferences, because official Capacitor documentation limits it to lightweight key/value data and states it is not a local database.
- **No new dependency:** the first screen checkpoint uses the accepted dependency set and exact provider SVGs already distributed by the desktop app.

## Failure behavior

- Empty profile list: model selector explains that Model Lab must configure a model; Send remains disabled.
- Selected profile disappears: Kimi mapper selects no profile; effort clamps to Off; screen shows a controlled unavailable state.
- Profile is failed/disabled or lacks required secret: row remains visible but disabled with status text.
- Invalid effort array: pure utility ignores unknown entries, deduplicates known entries and never throws in rendering.
- Sending: draft stays visible, Send becomes disabled and status is announced. The persistence owner decides when to clear the draft after success.
- Repository error: screen receives an explicit error string and renders an alert; it never fabricates empty success.

## Verification

1. Pure utility tests for effort and provider callability.
2. Component tests for empty, selected, disabled, keyboard, effort, thinking and event contracts.
3. Screen composition test at 320px and 375px DOM widths with no horizontal overflow.
4. Kimi route/repository integration test.
5. Production web build, Capacitor sync and `assembleDebug`.
6. Chromium mobile E2E after route wiring.
7. APK signature/hash/package inspection every checkpoint.
8. Physical install/launch/logcat remains gated until ADB hardware or post-reboot acceleration is available.

## Ownership and integration

GPT5 owns only the new screen/component/local-presentation files named in the ledger. Kimi owns the one-line route loader integration and mapping from canonical local repositories/contracts into the view models. Any contract mismatch returns to Codex/Kimi; GPT5 does not patch shared contracts opportunistically.

## Rollback

Remove the new GPT5-owned screen/component/assets/tests. Since GPT5 does not edit routing or persistent schemas, Kimi can point the Chat route back to its prior component without data migration or contract rollback.
