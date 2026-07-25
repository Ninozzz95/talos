# TALOS Mobile Chat Provider and Model Execution Ledger

Date: 2026-07-22
Owner: Codex mobile lane
Status: IMPLEMENTED AND VERIFIED FOR AVAILABLE UPSTREAM CREDENTIALS
Desktop reference: `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed` read-only

## Objective

Replace the three-model Anthropic-only MVP with real six-provider discovery, probe and completion. Saving a provider key must update Model Lab and the composer in the same user action without reload. This slice does not yet add SQLite sessions, file ingestion or browser tools; those have separate ledgers in P1.

## Public contracts

- `TalosMobileHttpTransport`
- `TalosMobileHttpRequest`
- `TalosMobileHttpResponse`
- `TalosMobileProviderAdapter`
- `TalosMobileProviderModel`
- `TalosMobileProviderCatalog`
- `TalosMobileProviderProbeResult`
- `TalosMobileCompletionInput`
- `TalosMobileCompletionResult`
- `TalosMobileProviderError`
- `TALOS_MOBILE_PROVIDER_ADAPTERS`
- `providerAdapterFor(provider)`
- `ProviderEndpointBackend`
- `getProviderEndpoint(provider, backend)`
- `setProviderEndpoint(provider, endpoint, backend)`
- `clearProviderEndpoint(provider, backend)`
- `talosMobileModelProfiles(models, hasSecret)`
- `ProviderCatalogStatus`
- `ProviderCatalogState`
- `ChatController.selectedProviderModel`
- `ChatController.refreshProvider(provider)`
- `ChatController.saveEndpoint(provider, endpoint)`
- `ChatController.removeEndpoint(provider)`
- `ChatController.probeProvider(provider)`

Implementation amendment (2026-07-22): the controller uses the existing
`TalosMobileProviderAdapter.listModels()` and `.complete()` methods directly;
the earlier prose-only `discoverProviderModels()` and `completeProviderChat()`
names are therefore removed instead of introducing redundant wrappers. Endpoint
storage uses one versioned Preferences JSON map and exposes only canonical
HTTP(S) URLs; provider keys never enter that map.

## Exact file inventory

Create:

1. `mobile/src/lib/chat/httpTransport.ts`
2. `mobile/src/lib/chat/providerContracts.ts`
3. `mobile/src/lib/chat/providerErrors.ts`
4. `mobile/src/lib/chat/providerRegistry.ts`
5. `mobile/src/lib/chat/providers/openAiCompatibleAdapter.ts`
6. `mobile/src/lib/chat/providers/anthropicAdapter.ts`
7. `mobile/src/lib/chat/providers/geminiAdapter.ts`
8. `mobile/src/lib/chat/providers/ollamaAdapter.ts`
9. `mobile/tests/unit/chat/httpTransport.test.ts`
10. `mobile/tests/unit/chat/providerRegistry.test.ts`
11. `mobile/tests/unit/chat/openAiCompatibleAdapter.test.ts`
12. `mobile/tests/unit/chat/anthropicAdapter.test.ts`
13. `mobile/tests/unit/chat/geminiAdapter.test.ts`
14. `mobile/tests/unit/chat/ollamaAdapter.test.ts`
15. `mobile/tests/e2e/mobile-provider-model-refresh.e2e.spec.ts`
16. `mobile/src/services/providerEndpointStore.ts`
17. `mobile/tests/unit/services/providerEndpointStore.test.ts`
18. `mobile/tests/integration/providerUpstream.integration.test.ts`

Modify:

19. `mobile/src/components/chat/mobileChatTypes.ts`
20. `mobile/src/lib/mobileModelCatalog.ts`
21. `mobile/src/lib/chat/anthropicClient.ts`
22. `mobile/src/lib/chat/chatCompletion.ts`
23. `mobile/src/stores/chatController.ts`
24. `mobile/src/components/chat/TalosMobileComposerModelPicker.vue`
25. `mobile/src/components/talos/settings/TalosMobileSettingsModelsPanel.vue`
26. `mobile/tests/unit/chat/chatCompletion.test.ts`
27. `mobile/tests/unit/chat/chatController.test.ts`
28. `mobile/tests/unit/chat/mobileModelCatalog.test.ts`
29. `mobile/tests/unit/chat/TalosMobileComposerModelPicker.test.ts`
30. `mobile/tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`
31. `mobile/tests/unit/screens/settingsScreen.test.ts`
32. `mobile/docs/feature-parity.json` only after all slice gates pass.
33. `docs/superpowers/progress/kimi-mobile/M2-lite-usable-app-execution-ledger.md` only after all slice gates pass.

Amendment rationale: local Ollama discovery cannot assume that `localhost` on an Android device reaches a desktop daemon. The new endpoint store persists only a validated HTTP(S) URL, rejects embedded credentials, and remains separate from Keystore-owned provider secrets.

Delete: none. Existing exported Anthropic symbols remain compatibility wrappers until all call sites migrate.

## TDD scenarios

### CHAT-P01 - canonical fail-closed parsing

RED: each adapter rejects malformed list/completion payloads, non-2xx responses and empty text with provider/status/actionable metadata. Array positions and unchecked casts are forbidden.

### CHAT-P02 - full dynamic catalogs

RED: provider fixtures prove Anthropic, OpenAI, DeepSeek, Gemini, OpenRouter and Ollama model-list pagination/normalization. Every returned ID remains selectable; compatibility and modality metadata are preserved when upstream provides them.

### CHAT-P03 - provider-correct completion

RED: the same canonical multi-turn input produces the exact official wire shape for each provider and extracts text without losing prior conversation context. Unsupported effort/thinking parameters are omitted, not guessed.

### CHAT-P04 - seamless key activation regression

RED: `saveKey(provider,key)` must not resolve until secure storage, discovery/probe, profile replacement and selection reconciliation finish. The composer sees new models immediately, with zero reload and zero Settings navigation side effect. Removing a key revokes callability immediately.

This permanently covers `MODEL BUGFIXES.txt`: Gemini and OpenRouter key save previously required repeated Ctrl+F5 and model selection exposed incomplete static data.

### CHAT-P05 - honest endpoint and readiness states

RED: loading, empty, error, retry, unverified, ready and unavailable states are distinct. Ollama accepts an explicit endpoint and never assumes that phone localhost reaches a desktop daemon.

### CHAT-P06 - credential non-leakage

RED: adapter/catalog/controller snapshots, thrown errors and serialized settings contain no credential bytes. Tests use sentinel keys and scan emitted state/log arguments.

### CHAT-P07 - final human path

RED E2E: open Settings, save a provider key against a routed fixture, observe the complete provider model dropdown without reload, choose a model in Settings, return to Chat, observe the same selection, send two contextual turns and receive provider-normalized replies. Failure leaves the composer usable and never auto-opens Settings.

### CHAT-P08 - OpenRouter nested usage regression

RED: a documented live OpenRouter completion with numeric totals plus nested
`prompt_tokens_details` and `completion_tokens_details` must preserve text and
finite top-level metrics instead of being rejected as malformed. This scenario
was discovered by the real-upstream gate and remains a permanent fixture.

## Focused GREEN commands

- `npm.cmd run test:unit -- tests/unit/chat/httpTransport.test.ts tests/unit/chat/providerRegistry.test.ts tests/unit/chat/openAiCompatibleAdapter.test.ts tests/unit/chat/anthropicAdapter.test.ts tests/unit/chat/geminiAdapter.test.ts tests/unit/chat/ollamaAdapter.test.ts`
- `npm.cmd run test:unit -- tests/unit/chat/chatCompletion.test.ts tests/unit/chat/chatController.test.ts tests/unit/chat/mobileModelCatalog.test.ts tests/unit/chat/TalosMobileComposerModelPicker.test.ts tests/unit/settings/TalosMobileSettingsLocalPanels.test.ts`
- `npm.cmd run build`
- `npx.cmd playwright test tests/e2e/mobile-provider-model-refresh.e2e.spec.ts --workers=1`
- `npm.cmd run test:unit -- tests/integration/providerUpstream.integration.test.ts`

## Regression gates

- Complete `npm.cmd run test:unit`.
- Complete `npx.cmd playwright test --workers=1`.
- `git diff --check`.
- No desktop/backend diff.

## Real-upstream proof

1. Use a private runtime credential without echoing it.
2. List models and print only provider, HTTP status and count.
3. Probe one selected model with a harmless prompt and print only success plus returned model ID.
4. Confirm the key does not appear in source, Git diff, application state or test artifacts.

## Human-visible proof

- Gemini/OpenRouter/other provider key save populates the correct complete searchable list immediately.
- Model Lab and composer share one selected model state.
- Provider icon, display name, raw model ID, readiness and compatibility are readable at 360x640.
- Changing provider/model does not clear the draft or conversation.
- A provider failure stays inside the chat/status surface and exposes Retry without opening unrelated panels.

## Execution evidence

Checkpoint: 2026-07-22.

- Focused adapter, controller, catalog, composer and Settings suites: GREEN.
- Complete mobile unit corpus: 781 passed, 2 live-upstream scenarios skipped when their private credential was absent.
- Production typecheck/build: GREEN; Vite reported an initial-chunk warning at 536.08 kB, retained as an explicit P7 code-splitting debt.
- Complete mobile Playwright corpus: 17/17 GREEN, including the no-reload provider/model journey and contextual second turn.
- Real OpenRouter gate: model discovery and one free-model completion passed through the production adapter. The documented nested `usage` payload regression is covered permanently by CHAT-P08.
- Real Gemini gate: the supplied private credential was rejected by the official API as invalid. No parser or UI failure was observed, and no credential was persisted in source, logs, fixtures or documentation. Gemini remains externally unverified until a valid credential is available.
- `git diff --check`: GREEN. Frozen desktop worktree: clean and untouched.

This closes only provider discovery, probe, selection and buffered completion. Durable SQLite conversations, streaming/cancel, attachments, prompt enhancement and Browser tooling remain separate P1 slices and are not implied by this status.

## Rollback

Restore the existing Anthropic compatibility wrapper as the only registry entry and retain secure keys untouched. Remove new adapters/tests and restore static catalog/controller files. No user messages or credentials are migrated in this slice.
