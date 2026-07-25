# TALOS Mobile Model Lab Parity Execution Ledger

Date: 2026-07-22
Owner: Codex mobile lane
Status: COMPLETE - focused, regression, build, audit and visual gates green
Research: `docs/superpowers/research/2026-07-22-talos-mobile-model-lab-parity-research.md`
Design: `docs/superpowers/specs/2026-07-22-talos-mobile-model-lab-parity-design.md`

## Exact file inventory

Create:

1. `mobile/src/lib/modelLabContracts.ts`
2. `mobile/tests/unit/lib/modelLabContracts.test.ts`
3. `mobile/src/components/talos/models/TalosMobileModelCatalog.vue`
4. `mobile/tests/unit/models/TalosMobileModelCatalog.test.ts`
5. `mobile/src/components/talos/models/TalosMobileProviderRuntimePanel.vue`
6. `mobile/tests/unit/models/TalosMobileProviderRuntimePanel.test.ts`
7. `mobile/src/components/talos/models/TalosMobileModelAdvancedOptions.vue`
8. `mobile/tests/unit/models/TalosMobileModelAdvancedOptions.test.ts`
9. `mobile/tests/e2e/mobile-model-lab-parity.e2e.spec.ts`

Modify:

10. `mobile/src/components/chat/mobileChatTypes.ts`
11. `mobile/src/lib/chat/providerContracts.ts`
12. `mobile/src/lib/chat/httpTransport.ts`
13. `mobile/tests/unit/chat/httpTransport.test.ts`
14. `mobile/src/lib/chat/providerRegistry.ts`
15. `mobile/tests/unit/chat/providerRegistry.test.ts`
16. `mobile/src/lib/chat/chatCompletion.ts`
17. `mobile/tests/unit/chat/chatCompletion.test.ts`
18. `mobile/src/lib/chat/providers/openAiCompatibleAdapter.ts`
19. `mobile/tests/unit/chat/openAiCompatibleAdapter.test.ts`
20. `mobile/src/lib/chat/providers/anthropicAdapter.ts`
21. `mobile/tests/unit/chat/anthropicAdapter.test.ts`
22. `mobile/src/lib/chat/providers/geminiAdapter.ts`
23. `mobile/tests/unit/chat/geminiAdapter.test.ts`
24. `mobile/src/lib/chat/providers/ollamaAdapter.ts`
25. `mobile/tests/unit/chat/ollamaAdapter.test.ts`
26. `mobile/src/lib/mobileModelCatalog.ts`
27. `mobile/tests/unit/chat/mobileModelCatalog.test.ts`
28. `mobile/src/stores/settings.ts`
29. `mobile/tests/unit/theme/settingsStore.test.ts`
30. `mobile/src/stores/chatController.ts`
31. `mobile/tests/unit/chat/chatController.test.ts`
32. `mobile/src/components/talos/settings/TalosMobileSettingsModelsPanel.vue`
33. `mobile/tests/unit/screens/settingsScreen.test.ts`
34. `mobile/tests/unit/chat/TalosMobileComposerModelPicker.test.ts`
35. `mobile/scripts/verify-initial-chunk.mjs`
36. `mobile/tests/unit/build/initialChunkContract.test.ts`
37. `docs/superpowers/plans/2026-07-22-talos-mobile-desktop-parity-master-plan.md`
38. `docs/superpowers/ledgers/2026-07-22-talos-mobile-model-lab-parity-ledger.md`
39. `mobile/src/lib/chat/promptEnhancement.ts`
40. `mobile/tests/unit/chat/promptEnhancement.test.ts`
41. `docs/superpowers/research/2026-07-22-talos-mobile-model-lab-parity-research.md`

Delete: none. No package, desktop, backend, validator, core or Android file changes.

## Amendments

### ML-A1 - source-contract path under Vitest

The initial ML-02 RED used `new URL(..., import.meta.url)`. In this Vite/Vitest
configuration `import.meta.url` is not guaranteed to retain the `file:` scheme, so
the test failed before evaluating the registry contract. The test now resolves the
owned source from `process.cwd()` and still fails unless provider implementations
are absent from static imports and present behind exactly four dynamic module
boundaries.

### ML-A2 - persisted projection seam

Inspection confirmed that the settings store exposes only subtree-specific write
methods and that provider models need an explicit provenance bit for the Catalog to
distinguish observed metadata from user declarations. The implementation adds one
whole-value, parser-guarded `setModelLabPreferences()` seam and the optional
`capabilityProvenance` provider-model field. No secret or response body enters this
subtree.

### ML-A3 - runtime timeout consumers

The chat controller inspection found a second completion consumer: Prompt Enhancer
builds through `buildChatCompletion()`. The two enhancer files are added to the exact
inventory so one provider timeout applies consistently to discovery, ordinary chat,
model probes and prompt enhancement rather than silently diverging by surface.

### ML-A4 - native form semantics in component tests

Vue Test Utils does not synthesize a browser form submission from a button-only
`trigger('click')`. The Advanced tests dispatch `submit` on the form itself, which
exercises the same native submit contract used by touch, pointer and keyboard users
without adding a product-only click handler.

### ML-A5 - Reka Tabs pointer semantics in component tests

Current official Reka Tabs documentation confirms automatic activation, full
keyboard navigation and the WAI-ARIA Tabs pattern. Inspection of the pinned
`reka-ui` implementation confirms that a primary pointer selection changes the
controlled value on `mousedown`; a standalone Vue Test Utils `click` does not
exercise that contract. The Settings screen test therefore dispatches primary
`mousedown` with `ctrlKey: false`, waits through Vitest's official
`vi.dynamicImportSettled()` boundary, then verifies the active state and lazy
Catalog mount. No product-only click handler or weakened lazy-load assertion is
added.

### ML-A6 - production typecheck is an affected regression gate

The first post-UI `npm run build` correctly failed under the repository's
`noUnusedLocals` contract because `TalosMobileModelCatalog.vue` retained an unused
`TalosMobileProviderId` type import. TypeScript documents TS6133 as the intended
behavior of this compiler option. The unused import is removed; the build remains a
mandatory ML-08 gate so this failure class cannot be hidden by component tests.

### ML-A7 - Vite synthetic dynamic-entry manifest keys

The real Vite 7.3.6 manifest emitted Settings as
`_SettingsScreen-<hash>.js` with `isDynamicEntry: true`, no `src`, and correct
entry-graph/nested-dynamic edges. Catalog and Advanced remained distinct source-keyed
dynamic entries. Vite documents underscore-prefixed generated keys for non-entry
chunks and requires consumers to traverse `imports`/`dynamicImports` as manifest
keys. A new fixture reproduces this shape. The verifier accepts a unique reachable
synthetic boundary only when both generated key and output-file stem exactly match
the expected source basename; all static-closure, reachability and nested-boundary
checks remain fail-closed.

### ML-A8 - Playwright strict locators and responsive reload state

The first ML-08 run reached the new product UI but exposed two harness defects:
an unscoped `role=status` matched both composer live status and Catalog count, and a
360px reload intentionally returned Settings to its category pane while the test
tried to click a hidden nested tab. Playwright documents strict unique locators and
click actionability. The journey now scopes the count to the Catalog text and
reopens Models through the visible category control after reload. It does not use
`.first()`, forced clicks or hidden-element interaction. The same strictness applies
an exact accessible-name match to the display-name textbox so it cannot collide
with the prefixed `Save display name ...` button label. After a successful rename,
the journey updates its active search from the former display name to the new one;
the temporary zero-result state is the correct Catalog behavior, not a missing
card regression.

### ML-A9 - Model Lab discoverability versus composer visibility

The affected E2E corpus found that `TalosMobileSettingsModelsPanel` filtered
`show_in_composer=false` profiles out of the Model Lab default picker. That filter
belongs only to the Chat quick picker. WAI-ARIA APG explicitly calls out disabled
listbox options as cases where discoverability can matter. A permanent Settings
unit test requires hidden or unsupported profiles to remain present but disabled in
Model Lab; the Chat picker continues to omit them, and `selectModel()` keeps its
existing callable/visible guard.

## Public symbols

- `TalosMobileModelLabPreferences`
- `TalosMobileManualModel`
- `TalosMobileModelOverride`
- `TalosMobileModelProbeRecord`
- `TalosMobileProviderRuntimeOptions`
- `TALOS_DEFAULT_MODEL_LAB_PREFERENCES`
- `parseTalosMobileModelLabPreferences`
- `manualModelToProviderModel`
- `TalosMobileProviderModel.capabilityProvenance`
- `TalosMobileSettingsState.model_lab`
- `SettingsStore.setModelLabPreferences`
- `TalosMobileHttpRequest.connectTimeout`
- `TalosMobileHttpRequest.readTimeout`
- `TalosMobileProviderCredential.timeoutMs`
- `ChatController.endpoints`
- `ChatController.modelLabPreferences`
- `ChatController.probeModel`
- `ChatController.setModelVisibility`
- `ChatController.setModelDisplayName`
- `ChatController.saveManualModel`
- `ChatController.removeManualModel`
- `ChatController.setProviderTimeout`

Compatibility symbols preserved:

- all six provider IDs and adapter exports;
- synchronous `providerAdapterFor()` and `TALOS_MOBILE_PROVIDER_ADAPTERS`;
- `ChatController.refreshProvider`, `probeProvider`, selection and completion API;
- Settings `models` deep-link and Chat quick picker;
- provider wire payloads and 512000-byte initial budget.

## RED -> GREEN scenarios

### ML-01 - versioned local preferences

RED: parser accepts only exact bounded manual models, overrides, timeout and probe
records; malformed/unknown/secret-looking data fails closed and never survives
serialization.

GREEN: `modelLabContracts.test.ts`.

### ML-02 - provider adapters stay outside first paint

RED: registry currently imports every adapter statically.

GREEN: stable lazy proxies, six dynamic manifest entries, unknown provider still
fails synchronously.

### ML-03 - endpoint and timeout are real

RED: OpenAI-compatible adapters ignore saved endpoints and no request carries
Capacitor timeout fields.

GREEN: canonical base URL plus 5-300 second connect/read timeout reaches list and
completion requests for all adapters; existing default URLs remain byte-compatible.

### ML-04 - profile projection and persistence

RED: hidden/display/manual/probe state does not affect profiles and does not survive
reload.

GREEN: settings and model catalog tests prove bounded round-trip, observed versus
declared capability provenance and stable IDs.

### ML-05 - real per-model test

RED: only provider discovery exists.

GREEN: `probeModel()` calls the exact selected model, requires the sentinel, records
latency/status without response or secret bytes, and handles stale/deleted profiles.

### ML-06 - Catalog UI

RED: no search/provider filters, cards, visibility, probe, compatibility or advanced
controls exist in mobile.

GREEN: component tests cover APG names, 500-row reachability, disabled models,
optimistic fences, failure and no horizontal clipping.

### ML-07 - Provider runtime UI

RED: only keys and Ollama URL are exposed.

GREEN: six provider states, exact key ownership, explicit custom URL/default reset,
timeout, retry and manual-ID recovery all emit real controller commands.

### ML-08 - final human journey

RED/authored: configure Gemini, filter catalog, hide/show a model, run a real mocked
completion probe, select it in Chat without reload, persist through reload; custom
OpenAI-compatible URL and timeout reach the intercepted wire request; 360px has no
horizontal overflow.

GREEN: `mobile-model-lab-parity.e2e.spec.ts` plus existing provider/composer E2E.

### ML-A10 - deterministic catalog stress-test budget

RED: the 500-card Catalog stress test passes alone in 3.58 seconds but reaches 5.22
seconds under the complete jsdom suite and trips Vitest's generic 5-second timeout.
The product behavior and all assertions complete correctly.

GREEN: retain all 500 cards and every search/filter assertion, but give only this
stress scenario a 15-second timeout using Vitest's documented per-test argument.
Do not raise the global timeout and do not create a mobile-only virtualization fork
while the frozen desktop reference renders the complete filtered catalog.

## Commands

```text
npm.cmd run test:unit -- tests/unit/lib/modelLabContracts.test.ts tests/unit/chat/httpTransport.test.ts tests/unit/chat/providerRegistry.test.ts tests/unit/chat/chatCompletion.test.ts tests/unit/chat/openAiCompatibleAdapter.test.ts tests/unit/chat/anthropicAdapter.test.ts tests/unit/chat/geminiAdapter.test.ts tests/unit/chat/ollamaAdapter.test.ts tests/unit/chat/mobileModelCatalog.test.ts tests/unit/chat/chatController.test.ts tests/unit/models/TalosMobileModelCatalog.test.ts tests/unit/models/TalosMobileProviderRuntimePanel.test.ts tests/unit/models/TalosMobileModelAdvancedOptions.test.ts tests/unit/screens/settingsScreen.test.ts tests/unit/chat/TalosMobileComposerModelPicker.test.ts tests/unit/build/initialChunkContract.test.ts
npm.cmd run test:unit
npm.cmd run build
npx.cmd playwright test tests/e2e/mobile-model-lab-parity.e2e.spec.ts tests/e2e/mobile-provider-model-refresh.e2e.spec.ts tests/e2e/mobile-composer-state.e2e.spec.ts --workers=1
npm.cmd audit --audit-level=low
git diff --check
```

## Human proof

At 390x844 and 360x640: configure a provider, inspect all returned models, search and
filter, hide/show, test one model, inspect evidence, change default, return to Chat
without reload, send a turn, reload and verify every non-secret preference. Confirm
custom endpoint/timeout only after inspecting the exact URL and verify failures do
not expose credentials or open another surface.

## Final evidence - 2026-07-22

- Production build: GREEN, Vite 7.3.6 transformed 2799 modules; initial JavaScript
  `443208/512000` bytes. Provider adapters, Catalog, Advanced options, message
  renderer, prompt enhancer and slash menu remain dynamic entries.
- Focused human journeys: `6/6` GREEN in 37.5 seconds across Model Lab parity,
  provider refresh and composer persistence.
- Complete mobile unit corpus: `97` files passed, `1` skipped; `944` tests passed,
  `2` skipped. ML-A10 remains deterministic under the full run.
- Supply chain: `npm audit --audit-level=low` reports `0` vulnerabilities.
- Diff integrity: `git diff --check` GREEN.
- Headless visual proof: inspected Providers and Catalog at `390x844` and `360x640`.
  Search/filter, provider cards, provenance, probe/default/visibility actions and
  internal scrolling are usable; the 360px Catalog card is 292px wide and document
  width equals client width (`360/360`), with no horizontal clipping.
- Preview cleanup: the lane-owned Vite preview child was identified by exact command,
  stopped, and port 4173 verified free.

## Rollback

Remove the three Model Lab components and the versioned preferences subtree; restore
the existing Models panel, static registry imports and adapter default request
options. Existing secure keys, endpoints, chat data and provider catalogs remain
readable and require no migration.
