# Execution ledger - P0 Agent Tools control

Date: 2026-07-28

Subsystem: TALOS mobile Settings, tool authorization, and provider integration.

Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`

Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

Status: CLOSED in automated gates; physical-device checklist remains for the
final APK.

## Exact ownership

Create:

1. `mobile/docs/superpowers/research/2026-07-28-p0-agent-tools-control-research.md`
2. `mobile/docs/superpowers/specs/2026-07-28-p0-agent-tools-control-design.md`
3. `mobile/docs/superpowers/ledgers/2026-07-28-p0-agent-tools-control-ledger.md`
4. `mobile/src/lib/tools/toolControls.ts`
5. `mobile/src/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue`
6. `mobile/tests/unit/tools/toolControls.test.ts`
7. `mobile/tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts`
8. `mobile/tests/e2e/mobile-agent-tools.e2e.spec.ts`

Modify:

9. `mobile/src/lib/tools/executor.ts`
10. `mobile/src/lib/tools/toolset.ts`
11. `mobile/src/stores/settings.ts`
12. `mobile/src/stores/chatController.ts`
13. `mobile/src/components/talos/settings/settingsTabs.ts`
14. `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
15. `mobile/src/i18n/locales/en.ts`
16. `mobile/src/i18n/locales/it.ts`
17. `mobile/tests/unit/tools/toolExecutor.test.ts`
18. `mobile/tests/unit/tools/toolsetLibraryDiscovery.test.ts`
19. `mobile/tests/unit/tools/libraryExportTools.test.ts`
20. `mobile/tests/unit/tools/readTools.test.ts`
21. `mobile/tests/unit/search/webTools.test.ts`
22. `mobile/tests/unit/images/imageTools.test.ts`
23. `mobile/tests/unit/documents/failureWording.test.ts`
24. `mobile/tests/unit/documents/pdfUnderRealLoad.test.ts`
25. `mobile/tests/unit/documents/reportEdges.test.ts`
26. `mobile/tests/unit/documents/reportSpec.test.ts`
27. `mobile/tests/unit/theme/settingsStore.test.ts`
28. `mobile/tests/unit/settings/settingsTabs.test.ts`
29. `mobile/tests/unit/settings/TalosMobileSettingsCenter.test.ts`
30. `mobile/tests/unit/chat/chatController.test.ts`

Delete: none.

Build-budget amendment, 2026-07-28:

Create:

31. `mobile/src/lib/tools/toolControlCatalog.ts`

The first GREEN build passed at 559,974 / 560,000 initial JavaScript bytes,
leaving only 26 bytes. This fresh evidence invalidates keeping UI grouping and
action metadata in the boot-loaded persistence module. Before further product
edits, ownership is amended: `toolControls.ts` retains only stable IDs,
explicit defaults, parsing, and the live policy predicate; the Settings-only
`toolControlCatalog.ts` owns groups and action badges and remains in the lazy
Settings chunk. The conformance test covers both lists. The budget is not
raised.

Visual-inspection amendment, 2026-07-28:

The production mobile screenshot proved that a native checkbox with
`role="switch"` remained visually square in Chromium. Add permanent scenario
`AGENT-TOOLS-10` to
`tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts`: the accessible
input remains the control but is visually hidden, with a dedicated pill/knob
surface driven by peer state. Remove the panel sentence that duplicated the
Settings tab description.

Browser amendment, 2026-07-28:

The post-style Playwright run proved that the decorative pill intercepted a
direct click targeted at the native switch. Extend `AGENT-TOOLS-10` to require
`pointer-events-none` on the visual layer, so clicks resolve through the owning
label to the accessible input. The same run exposed an older localization
fixture in `tests/e2e/mobile-settings-parity.e2e.spec.ts` still expecting twelve
tabs; amend Exact ownership to modify that test and align its count/copy with
the already-shipped mobile-only Language and Privacy categories.

Modify:

32. `mobile/tests/e2e/mobile-settings-parity.e2e.spec.ts`

E2E target amendment: after the visual layer became correctly non-interactive,
Playwright still attempted to click the one-pixel `sr-only` input directly.
That is not the human path. `AGENT-TOOLS-09` now taps the visible owning row
(the label) and continues to assert state on the native `role="switch"` input.
This is test-target alignment, not a product relaxation.

## Public symbols

Add:

- `TalosAgentToolId`
- `TalosAgentToolEnabled`
- `TALOS_AGENT_TOOL_IDS`
- `TALOS_DEFAULT_AGENT_TOOL_ENABLED`
- `parseTalosAgentToolEnabled(value)`
- `isTalosAgentToolId(value)`
- `isTalosAgentToolEnabled(name, enabled)`
- `TalosAgentToolGroup`
- `TalosAgentToolControl`
- `TALOS_AGENT_TOOL_CONTROLS`
- `TalosMobileSettingsState.agent_tools`
- `SettingsStore.setAgentToolEnabled(id, enabled)`
- `TalosToolExecutionDeps.isToolEnabled(name)`

Modify compatibly:

- `TalosToolset.offer(permissions, enabledTools)` gains a required second
  argument.

Stable:

- all twelve tool wire names;
- `TalosToolDefinition`;
- `executeTalosTool`;
- `TalosToolPermissions`;
- provider schema adapters;
- Preferences key `talos.mobile.settings`.

No migration, provider-specific schema, Android manifest, or database symbol.

## RED scenarios

1. `tests/unit/tools/toolControls.test.ts::AGENT-TOOLS-01 catalog exactly matches every executable factory`
   - Expected RED: no catalog module exists.
   - Focused GREEN:
     `npx vitest run tests/unit/tools/toolControls.test.ts`

2. `tests/unit/tools/toolControls.test.ts::AGENT-TOOLS-02 parser fills explicit defaults and strips malformed or unknown keys`
   - Expected RED: no parser or persisted contract exists.
   - Focused GREEN: same command.

3. `tests/unit/theme/settingsStore.test.ts::AGENT-TOOLS-03 one toggle hydrates and persists without retaining unknown tools`
   - Expected RED: state and setter do not exist.
   - Focused GREEN:
     `npx vitest run tests/unit/theme/settingsStore.test.ts`

4. `tests/unit/tools/toolsetLibraryDiscovery.test.ts::AGENT-TOOLS-04 disabled tools are absent before provider schema adaptation`
   - Expected RED: `offer()` ignores per-tool controls.
   - Focused GREEN:
     `npx vitest run tests/unit/tools/toolsetLibraryDiscovery.test.ts`

5. `tests/unit/tools/toolExecutor.test.ts::AGENT-TOOLS-05 live revocation fails closed before parse, consent, or body`
   - Expected RED: a stale offered tool runs.
   - Focused GREEN:
     `npx vitest run tests/unit/tools/toolExecutor.test.ts`

6. `tests/unit/chat/chatController.test.ts::AGENT-TOOLS-06 a natural-language request sends only enabled schemas`
   - Expected RED: disabled tool definitions are present in the genuine provider
     request.
   - Focused GREEN:
     `npx vitest run tests/unit/chat/chatController.test.ts`

7. `tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts::AGENT-TOOLS-07 panel renders all tools and persists an accessible switch`
   - Expected RED: the component does not exist.
   - Focused GREEN:
     `npx vitest run tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts`

8. `tests/unit/settings/settingsTabs.test.ts::AGENT-TOOLS-08 tab is a genuine available local panel`
   - Expected RED: registry says `gated`.
   - Focused GREEN:
     `npx vitest run tests/unit/settings/settingsTabs.test.ts tests/unit/settings/TalosMobileSettingsCenter.test.ts`

9. `tests/e2e/mobile-agent-tools.e2e.spec.ts::AGENT-TOOLS-09 switch and enabled count survive reload`
   - Expected RED: the gated placeholder has no switch.
   - Focused GREEN:
     `npx playwright test tests/e2e/mobile-agent-tools.e2e.spec.ts`

10. `tests/unit/settings/TalosMobileSettingsAgentToolsPanel.test.ts::AGENT-TOOLS-10 switch is visually a pill, not a square checkbox`
    - Expected RED: the native input is visible and no owned toggle surface
      exists.
    - Focused GREEN: same command as `AGENT-TOOLS-07`.

## Affected regression suites

- every file in Exact ownership that contains tests;
- `tests/unit/tools/toolRegistry.test.ts`;
- `tests/unit/tools/toolLabels.test.ts`;
- `tests/unit/tools/agentLoop.test.ts`;
- `tests/unit/chat/toolContract.test.ts`;
- `tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`;
- complete `npm run test:unit`;
- complete `npm run typecheck`;
- complete `npm run build`;
- Android unit/resource/Java compile gates;
- relevant mobile Settings and chat Playwright suites;
- complete `git diff --check`.

The current initial-JavaScript budget is 560,000 bytes with only 1,657 bytes of
headroom. The lightweight catalog must not import Zod or another lazy executor
dependency, and the build budget must not be raised.

## Real-upstream gate

No upstream runtime is added. The real integration gate exercises:

1. sanitized Preferences JSON through installed
   `@capacitor/preferences@8.0.1`;
2. genuine tool factories and provider adapters;
3. a natural-language chat request through the real controller and captured
   Anthropic/OpenAI-compatible request;
4. the central executor with a switch revoked after offer time.

Primary current sources and the ADAPT decision are pinned in the paired
research dossier.

## Human-visible proof

1. Open Settings > Agent Tools.
2. Verify all twelve real tools are present and the enabled count is correct.
3. Disable `Search the Library`, leave Library sharing and read permission on.
4. Close Settings, ask naturally with a typo:
   `cerac nella mia libreria il contratto`.
5. Verify TALOS does not run `library_search` and explains that the capability
   is disabled rather than claiming a search.
6. Re-enable it and retry; verify the tool activity appears and real matches are
   returned.
7. Disable `Create a document`, ask for a Markdown file, and verify no
   `document_create` execution or duplicate fallback artifact.
8. Reload the app and verify both switch choices persist.
9. Start a tool call, revoke it before approval/execution where timing permits,
   and verify no side effect occurs.

## Rollback

Revert only files listed in Exact ownership. No schema migration, dependency,
secret, or Android resource needs removal. Older code ignores the persisted
`agent_tools` JSON member. Retain RED scenarios as regression evidence.

## Closure evidence

Fresh 2026-07-29 evidence:

- initial named RED: 6 Agent Tools behavior failures while 73 adjacent tests
  stayed green; missing catalog/component modules also failed independently;
- focused Agent Tools GREEN: 8 files, 82/82 tests;
- affected tool/settings/chat GREEN: 21 files, 203/203 tests;
- localization/conformance closure regression: 17 files, 110/110 tests;
- production build and parity budget:
  3,236 modules, 559,199/560,000 initial JavaScript bytes,
  131,976/150,000 CSS bytes, parity 9/9;
- Settings parity Playwright: 4/4;
- Agent Tools natural interaction/persistence Playwright: 1/1;
- visual production inspection at 375 x 812 confirmed readable grouped rows,
  action badges, enabled count and pill switches without overlap;
- `vue-tsc -b --force`: passed;
- complete unit gate: 258 files evaluated, 2,180 passed, 5 declared skips,
  0 failed, 0 unhandled errors;
- `git diff --check`: exit 0.

The complete gate first found six stale localization/conformance regressions.
They were not waived: all were reproduced, researched, permanently covered and
closed under the localization ledger before this status changed to CLOSED.

Owner-requested completeness revalidation, 2026-07-29:

- source inventory: 12/12 `defineTalosTool()` definitions have one catalog row,
  localized EN/IT copy and an explicit `true` upgrade default;
- no non-executable approval/trace symbol was promoted into a fake toggle;
- focused persistence/offer/executor/settings/chat matrix: 13 files,
  129/129 tests;
- production human-path toggle/count/reload Playwright: 1/1;
- the latest production build containing the panel and enforcement remains
  within the initial graph budget at 555,764/560,000 JavaScript bytes;
- no additional product-code edit was necessary: the current lane implementation
  already satisfies the owner's complete-inventory/default-enabled request.
