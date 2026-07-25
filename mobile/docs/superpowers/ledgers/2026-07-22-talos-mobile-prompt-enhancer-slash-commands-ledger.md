# TALOS Mobile Prompt Enhancer and Slash Commands Execution Ledger

Date: 2026-07-22
Owner: Codex mobile lane
Status: COMPLETE - focused product, bundle and human-journey gates green
Research: `docs/superpowers/research/2026-07-22-mobile-prompt-enhancer-slash-commands-research.md`
Design: `docs/superpowers/specs/2026-07-22-talos-mobile-prompt-enhancer-slash-commands-design.md`

## Frozen boundaries

- Writable root: `C:/Users/ninox/Desktop/AVM-lanes/kimi/mobile`
- Read-only desktop: `C:/Users/ninox/Desktop/AVM/control-plane` at `5dd0c0b`
- No dependency installation, Git mutation, desktop/backend/validator/core edit, or
  shared server-port use during the unit TDD loop.

## Exact file inventory

Create:

1. `mobile/src/lib/chat/promptEnhancement.ts`
2. `mobile/tests/unit/chat/promptEnhancement.test.ts`
3. `mobile/src/lib/mobileCommandRegistry.ts`
4. `mobile/tests/unit/chat/mobileCommandRegistry.test.ts`
5. `mobile/src/lib/mobileSlashCommands.ts`
6. `mobile/tests/unit/chat/mobileSlashCommands.test.ts`
7. `mobile/src/components/chat/TalosMobilePromptEnhancerPopover.vue`
8. `mobile/tests/unit/chat/TalosMobilePromptEnhancerPopover.test.ts`
9. `mobile/src/components/chat/TalosMobileSlashCommandMenu.vue`
10. `mobile/tests/unit/chat/TalosMobileSlashCommandMenu.test.ts`
11. `mobile/tests/e2e/mobile-prompt-enhancer-slash-commands.e2e.spec.ts`

Modify:

12. `mobile/src/stores/chatController.ts`
13. `mobile/tests/unit/chat/chatController.test.ts`
14. `mobile/src/components/chat/TalosMobileComposer.vue`
15. `mobile/tests/unit/chat/TalosMobileComposer.test.ts`
16. `mobile/src/screens/ChatScreen.vue`
17. `mobile/tests/unit/screens/chatScreen.test.ts`
18. `mobile/scripts/verify-initial-chunk.mjs`
19. `mobile/tests/unit/build/initialChunkContract.test.ts`
20. `docs/superpowers/plans/2026-07-22-talos-mobile-desktop-parity-master-plan.md`
21. `docs/superpowers/ledgers/2026-07-22-talos-mobile-prompt-enhancer-slash-commands-ledger.md`

Delete: none.

## Amendment PESC-A1 - production bundle evidence

The first production build measured `521484` initial JavaScript bytes. Moving the
command registry/filter and prompt parser behind the approved dynamic component and
domain imports reduced it to `512790`, still `790` bytes above the immutable
`512000` limit. The controller implementation originally planned inline therefore
cannot remain in the initial graph.

Decision: adapt within existing owned files. Add the public domain symbol
`runTalosMobilePromptEnhancement` and its input contract
`TalosMobilePromptEnhancementContext` to
`mobile/src/lib/chat/promptEnhancement.ts`. It owns provider dispatch, validation,
provenance, and credential-safe error normalization. `ChatController.enhancePrompt`
retains only reactive state, secure credential retrieval, and the monotonic revision
fence, and loads the domain symbol dynamically. No file inventory, dependency,
wire contract, or test expectation changes. The build and 512000-byte verifier are
the RED/GREEN evidence for this amendment.

## Amendment PESC-A2 - slash alias activation precedence

The first Chromium journey exposed a real keyboard regression: filtering `/context`
also matched `/file` through its description (`Context Vault`) and `/email` through
its description (`email context`). Registry order therefore kept the disabled
`/file` row active, so Enter could not run the exact `/context` command.

Decision: retain the broad alias/label/description/category/capability search, but
rank an exact slash alias first and slash-prefix matches before descriptive matches.
This adapts the already-recorded WAI-ARIA combobox/listbox type-ahead rule: typed
characters must move the active option to the matching command instead of an earlier
incidental description match. Add the permanent RED scenario
`mobileSlashCommands.test.ts::prioritizes exact and prefix aliases over incidental description matches`.
No file inventory or public API changes.

If inspection requires another product/test path, this inventory must be amended
with the reason before that file changes.

## Public symbols

Create or change:

- `TalosMobilePromptEnhancementResult`
- `TalosMobilePromptEnhancementPayload`
- `TalosMobilePromptEnhancementError`
- `TALOS_MOBILE_PROMPT_ENHANCER_SYSTEM_PROMPT`
- `TALOS_MOBILE_PROMPT_MAX_LENGTH`
- `buildTalosMobilePromptEnhancementPayload`
- `parseTalosMobilePromptEnhancement`
- `TalosMobileCommandId`
- `TalosMobileCommandRisk`
- `TalosMobileCommand`
- `TALOS_MOBILE_COMMANDS`
- `isTalosMobileCommandEnabled`
- `findTalosMobileCommand`
- `TalosMobileSlashCommand`
- `toTalosMobileSlashCommands`
- `filterTalosMobileSlashCommands`
- `ChatController.enhancingPrompt`
- `ChatController.promptEnhancement`
- `ChatController.promptEnhancementError`
- `ChatController.enhancePrompt`
- `ChatController.clearPromptEnhancement`

Compatibility symbols that must remain stable:

- `ChatController.send`, `createChatController`, `useChatController`
- `TalosMobileComposer.focusPrompt`
- existing composer emit names for model, effort, thinking, files, context, refresh,
  Model Lab, prompt update, and send
- `ChatScreen` route name and the `/settings?tab=models` deep link
- 512000-byte initial JavaScript budget

## RED -> GREEN scenarios

### PESC-01 - strict enhancement payload and parser

RED:

- `promptEnhancement.test.ts::encodes the original prompt as JSON data separated from trusted instructions`
- `promptEnhancement.test.ts::accepts strict raw and whole-fence results with desktop limits`
- `promptEnhancement.test.ts::rejects arrays unknown keys malformed JSON and every bounded-field violation`

Expected failure: module/symbols do not exist.

GREEN: strict Zod boundary, exact limits, no permissive repair.

### PESC-02 - selected model dispatch without chat persistence

RED:

- `chatController.test.ts::enhances through the selected provider model without persisting a chat turn`
- `chatController.test.ts::fails closed on malformed enhancement and redacts the selected credential`
- `chatController.test.ts::drops a superseded enhancement response after clear or a newer request`

Expected failure: controller has no enhancement state or method.

GREEN: one provider call with captured provider/model, trusted system instruction and
JSON user data; zero repository message writes; revision fence; actionable safe error.

### PESC-03 - command registry honesty

RED:

- `mobileCommandRegistry.test.ts::mirrors every frozen desktop command id and keeps only real mobile owners enabled`
- `mobileSlashCommands.test.ts::maps the frozen aliases and intentionally omits send and shell policy`
- `mobileSlashCommands.test.ts::filters alias label description category and capability case-insensitively`

Expected failure: mobile command modules do not exist.

GREEN: exact registry/alias set with `/new`, `/context`, `/model` enabled and all
other visible aliases carrying concrete disabled reasons.

### PESC-04 - accessible overlay components

RED:

- `TalosMobileSlashCommandMenu.test.ts::renders a named flat listbox with selection and disabled reasons`
- `TalosMobileSlashCommandMenu.test.ts::emits only enabled command selections`
- `TalosMobilePromptEnhancerPopover.test.ts::renders provenance bounded output summary principles and three explicit decisions`

Expected failure: components do not exist.

GREEN: mobile token styling, flat APG rows, bounded preview, exact desktop copy.

### PESC-05 - composer keyboard and decision wiring

RED:

- `TalosMobileComposer.test.ts::opens the lazy slash menu and supports Arrow Home End Escape and Enter`
- `TalosMobileComposer.test.ts::never activates a disabled slash command or breaks normal Enter Shift Enter and IME`
- `TalosMobileComposer.test.ts::exposes the 44px improve control and lazy loading error result and decision states`

Expected failure: no slash/enhancer props, control, state, or emits.

GREEN: async overlays outside initial graph; deterministic keyboard state; exact
icon-only target; existing composer contracts unchanged.

### PESC-06 - final screen workflow

RED:

- `chatScreen.test.ts::keeps Cancel byte-identical and applies Insert and Replace only on explicit choice`
- `chatScreen.test.ts::routes model and context slash commands and creates a durable new session`
- `chatScreen.test.ts::clears enhancement state on send and session ownership changes`

Expected failure: screen does not connect the new controller/commands.

GREEN: draft controller remains sole prompt owner; explicit choices flush/persist;
real routes/session APIs only.

### PESC-07 - permanent bundle boundary

RED:

- `initialChunkContract.test.ts::rejects the prompt enhancer when it enters the static initial graph`
- `initialChunkContract.test.ts::rejects the slash command menu when it enters the static initial graph`

Expected failure: verifier does not know either boundary.

GREEN: manifest requires one reachable dynamic entry for each source and reports
both keys in its success envelope.

### PESC-08 - final human journey

RED/authored:

- `mobile-prompt-enhancer-slash-commands.e2e.spec.ts::uses the selected model to preview cancel insert replace and finally send`
- `mobile-prompt-enhancer-slash-commands.e2e.spec.ts::operates slash commands and disabled reasons at 360px without overflow`
- `mobile-prompt-enhancer-slash-commands.e2e.spec.ts::preserves the draft on malformed provider output and reload`

Expected failure: final controls/workflows are absent.

GREEN: real Settings configuration through UI, strict mocked upstream wire shapes,
full composer interactions, reload, and final rendered message.

### PESC-09 - exact slash alias remains keyboard-operable

RED:

- `mobileSlashCommands.test.ts::prioritizes exact and prefix aliases over incidental description matches`
- the `/context` segment of `mobile-prompt-enhancer-slash-commands.e2e.spec.ts::operates slash commands and disabled reasons at 360px without overflow`

Expected failure: `/file` remains first for `/context` because its description
contains `Context Vault`; Enter activates no command because `/file` is disabled.

GREEN: `/context` ranks first for both `/con` and `/context`, while incidental
description matches remain discoverable after it.

## Commands

Focused RED/GREEN:

```text
npm.cmd run test:unit -- tests/unit/chat/promptEnhancement.test.ts tests/unit/chat/mobileCommandRegistry.test.ts tests/unit/chat/mobileSlashCommands.test.ts tests/unit/chat/TalosMobileSlashCommandMenu.test.ts tests/unit/chat/TalosMobilePromptEnhancerPopover.test.ts tests/unit/chat/chatController.test.ts tests/unit/chat/TalosMobileComposer.test.ts tests/unit/screens/chatScreen.test.ts tests/unit/build/initialChunkContract.test.ts
```

Slice gate:

```text
npm.cmd run test:unit
npm.cmd run build
npx.cmd playwright test tests/e2e/mobile-prompt-enhancer-slash-commands.e2e.spec.ts tests/e2e/mobile-composer-state.e2e.spec.ts --workers=1
npm.cmd audit --audit-level=low
git diff --check
```

APK milestone after affected E2E is green:

```text
npx.cmd cap sync android
gradlew.bat assembleDebug
```

Physical install/launch remains part of P1 promotion and is not claimed by a host-only
APK build.

## Completion evidence

Fresh evidence from `C:/Users/ninox/Desktop/AVM-lanes/kimi/mobile` on 2026-07-22:

- Focused unit gate: 9 files, 79 tests passed.
- Full mobile unit gate: 93 files passed, 1 skipped; 904 tests passed, 2 skipped.
- Production build: passed; initial JavaScript `511823` bytes against immutable
  `512000`-byte maximum. Both enhancer and slash-menu sources are dynamic entries.
- Focused Chromium journeys: 5/5 passed in 25.4 seconds, covering both new journeys
  and the existing durable composer-state regression suite.
- `npm audit --audit-level=low`: zero vulnerabilities.
- `git diff --check`: passed.
- Preview port `127.0.0.1:4173`: free after the gate.

The full unit run emits the pre-existing Vue warning from
`tests/unit/shell/appShell.test.ts` about a missing `#app` mount target; it does not
fail the suite and this slice does not modify that harness.

## Human-visible proof

1. Configure a provider/model in Settings and return to chat without reload.
2. Type a draft, tap Improve, verify provider/model provenance, and prove Cancel,
   Insert below, and Replace.
3. Send the chosen prompt and render the actual provider reply.
4. Type `/`, navigate by keyboard/touch, inspect an unavailable reason, run `/model`,
   `/context`, and `/new` through their real owners.
5. Reload after a provider-format failure and confirm the exact draft survives.
6. Repeat at 390x844 and 360x640 with no clipped overlay or horizontal scroll.

## Rollback

Remove the two domain modules, two async overlay components, and their tests; remove
only the new controller state/methods, composer props/emits/UI, screen handlers, and
two manifest boundaries. Existing chat, draft, model, effort, Settings, persistence,
and provider adapters remain unchanged and require no data migration.
