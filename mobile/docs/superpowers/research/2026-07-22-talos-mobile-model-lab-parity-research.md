# TALOS Mobile Model Lab Parity Research

Date: 2026-07-22
Owner: Codex mobile lane
Frozen desktop reference: `<repo desktop>` at `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed`
Status: COMPLETE

## Local findings

The mobile runtime already has six real provider adapters, secure key storage,
dynamic model discovery, a shared composer selection and an explicit Ollama URL.
The current Models settings panel does not yet implement the complete desktop
Model Lab contract:

- no provider/search-filtered catalog grid;
- no persisted composer visibility or display-name overrides;
- no completion-level per-model probe or durable probe evidence;
- no advanced provider timeout or OpenAI-compatible base URL controls;
- no manual model-ID recovery path when discovery is empty or unavailable;
- no compatibility/capability provenance in the final UI.

Desktop `TalosModelCenter.vue`, `TalosModelCatalog.vue`,
`TalosProviderModelCombobox.vue`, and `TalosModelAdvancedOptions.vue` are the frozen
behavioral references. They cannot be imported directly because they depend on
Laravel profile APIs and desktop window state.

## Current primary sources

Retrieved successfully on 2026-07-22:

- W3C APG Tabs: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- W3C APG Listbox: https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
- W3C APG keyboard interface and disabled discoverability: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
- Reka UI Tabs: https://www.reka-ui.com/docs/components/tabs
- Vue Test Utils trigger API: https://test-utils.vuejs.org/api/#trigger
- Vitest `vi.dynamicImportSettled`: https://vitest.dev/api/vi#vi-dynamicimportsettled
- TypeScript `noUnusedLocals`: https://www.typescriptlang.org/tsconfig/diagnostics.html#no-unused-locals---nounusedlocals
- Vite manifest graph: https://vite.dev/guide/backend-integration.html
- Playwright locators: https://playwright.dev/docs/locators
- Playwright actionability: https://playwright.dev/docs/actionability
- Vitest asynchronous-test timeout API: https://main.vitest.dev/guide/learn/async
- Vue large-list performance guidance: https://vuejs.org/guide/best-practices/performance
- OpenAI list models: https://developers.openai.com/api/reference/resources/models/methods/list
- Anthropic list models: https://docs.anthropic.com/en/api/models-list
- Gemini models: https://ai.google.dev/api/models
- DeepSeek list models: https://api-docs.deepseek.com/api/list-models
- Ollama list models: https://docs.ollama.com/api/tags
- OpenRouter real catalog boundary: https://openrouter.ai/api/v1/models
- Capacitor HTTP request options: https://capacitorjs.com/docs/apis/http#httprequestoptions
- OWASP SSRF prevention: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

The OpenRouter documentation page closed the connection during this research run;
the provider's real public model endpoint returned HTTP 200 and remains covered by
the existing adapter fixtures and credential-gated upstream integration test.

## Findings applied

- Provider model lists are heterogeneous. Preserve the existing canonical
  `TalosMobileProviderModel` adapter boundary rather than exposing vendor payloads.
- Model discovery is not a completion probe. A user-triggered model test must call
  the selected model and store only bounded status, time and latency evidence.
- Model Lab keeps hidden or unsupported profiles discoverable as disabled options;
  only the Chat quick picker removes `show_in_composer=false` profiles.
- APG tabs use a named tablist and paired tabpanels. Large model collections need a
  named, keyboard-operable list/filter surface; disabled models remain discoverable.
- Reka Tabs implements the APG pattern, automatic activation and controlled
  `update:modelValue`. Its pinned trigger selects on primary `mousedown`; Vue Test
  Utils documents `trigger()` as a single native DOM event rather than a complete
  browser pointer sequence. Component tests therefore dispatch the upstream-owned
  selection event instead of adding product-only click behavior. Vitest's official
  `vi.dynamicImportSettled()` API closes the asynchronous module boundary before
  asserting the lazy Catalog mount.
- The production typecheck deliberately treats unused locals and imports as errors;
  component-test success cannot replace the `vue-tsc -b` build gate.
- Vite manifest `imports` and `dynamicImports` are keys into the manifest graph;
  underscore-prefixed generated keys represent non-entry chunks. Build policy must
  follow those graph edges and validate a bounded synthetic-key fallback rather than
  assuming every reachable split chunk retains its source-path key.
- Playwright locators are strict and user actions wait for visibility, stability and
  hit testing. Model Lab journeys use unique semantic scope and explicitly traverse
  the mobile category-to-detail interaction after reload rather than forcing hidden
  controls.
- The 500-card catalog stress test completes in 3.58 seconds in isolation and 5.22
  seconds under the complete 98-file jsdom run. Vitest explicitly supports a local
  timeout for a legitimately long-running test; use 15 seconds on this one stress
  scenario rather than weakening the global timeout. Vue recommends virtualization
  for large lists, but the frozen desktop Model Catalog currently renders the whole
  filtered collection. Virtualization is therefore deferred to a coordinated
  desktop-mobile parity change instead of creating a mobile-only behavioral fork.
- Capacitor HTTP directly supports `connectTimeout` and `readTimeout` in
  milliseconds. Provider timeout settings can therefore be real rather than visual.
- Custom base URLs can redirect provider credentials. URLs remain explicit,
  credential-free HTTP(S) bases; the UI warns before remote secrets use a custom
  endpoint. TALOS never silently rewrites phone localhost to a desktop host.

## Upstream decision

### ADOPT

- Keep the six official provider model-list/completion protocols behind the existing
  mobile adapters.
- Use Capacitor HTTP 8.4.2 timeout fields directly.
- Use W3C APG tab/listbox semantics directly.

### ADAPT

- Port desktop Model Center/Catalog semantics into mobile-owned local-first
  components and a versioned Preferences contract.
- Use adapter-reported metadata as observed capability evidence. Manual overrides
  are labelled user-declared and never presented as probe-verified.
- Load provider implementations and the catalog surface dynamically to protect the
  immutable initial JavaScript budget.

### REJECT

- No Laravel profile API or server dependency in the standalone APK.
- No new command-menu, catalog or state package.
- No fake probe based only on `GET /models`; discovery and completion health remain
  separate states.
- No storage of keys, response bodies or probe prompts in Preferences.
- No silent custom endpoint, permissive URL repair or embedded URL credentials.
