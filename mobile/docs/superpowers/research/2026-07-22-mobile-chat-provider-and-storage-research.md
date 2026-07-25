# Mobile Chat Provider and Storage Research

Date: 2026-07-22
Scope: provider discovery/completion, seamless key activation, durable local chat

## Primary sources inspected

- Claude Models and Messages API: `https://platform.claude.com/docs/en/api/models/list`, `https://platform.claude.com/docs/en/api/messages/create`
- OpenAI Models API: `https://platform.openai.com/docs/api-reference/models`
- Gemini Models and content APIs: `https://ai.google.dev/api/models`, `https://ai.google.dev/gemini-api/docs`
- DeepSeek Models and OpenAI-compatible API: `https://api-docs.deepseek.com/api/list-models`, `https://api-docs.deepseek.com/`
- OpenRouter Models and API schema: `https://openrouter.ai/docs/api/api-reference/models/get-models`, `https://openrouter.ai/docs/api/reference/overview`
- Ollama list/chat APIs: `https://docs.ollama.com/api/tags`, `https://docs.ollama.com/api/chat`
- Capacitor SQLite upstream: `https://github.com/capacitor-community/sqlite`, npm release `8.1.0`.

## Decisions

### Provider wire protocols

ADAPT official REST protocols behind one AVM-owned `TalosMobileProviderAdapter` contract. Use the already-established native `CapacitorHttp` transport so the standalone APK does not depend on browser CORS or a desktop proxy.

- Anthropic: `GET /v1/models`, `POST /v1/messages`, `x-api-key`, pinned `anthropic-version`.
- OpenAI: `GET /v1/models`; provider adapter owns request/response normalization and keeps OpenAI-specific wire fields out of chat domain state.
- Gemini: paginated `GET /v1beta/models`, retain only models advertising content-generation support for the callable view while preserving the complete discovered catalog, then call the provider content API.
- DeepSeek: `GET /models` and OpenAI-compatible chat endpoint at `https://api.deepseek.com`; never retain aliases as hardcoded truth because the official docs publish deprecation dates.
- OpenRouter: `GET /api/v1/models` with full metadata and `POST /api/v1/chat/completions`; preserve canonical slug, modalities, supported parameters and expiration date.
- Ollama: configurable device/LAN base URL, `GET /api/tags`, `POST /api/chat`; `localhost` means the phone and is never silently rewritten to a desktop host.

REJECT importing six provider SDKs into the WebView. They increase bundle and update surface, several assume server-side secret handling, and their domain types would leak vendor contracts into TALOS. Direct official REST integration is the stable boundary for Capacitor.

### Model catalogs

ADOPT dynamic provider discovery as source of truth. Static seeds may exist only as offline explanatory fallback and can never be marked verified/callable until the provider returns or a probe succeeds. The UI exposes all discovered model IDs and marks chat compatibility as `supported`, `unsupported`, or `unknown`; it never guesses capability from a marketing name.

### Secrets and seamless refresh

ADOPT existing `@aparajita/capacitor-secure-storage@8.0.0`. Saving/removing a key must perform this single awaited transaction: secure write, provider discovery/probe, canonical catalog state update, selection reconciliation, then success feedback. No reload, delayed watcher, or Settings auto-open is permitted.

### Durable chat

ADOPT `@capacitor-community/sqlite@8.1.0` directly in the next chat persistence slice. It is Capacitor-8 compatible, MIT licensed, supports native SQLite/SQLCipher, and has an explicit web/IndexedDB path for tests. Preferences remains limited to small settings and must not hold message histories or large catalogs.

## Real-upstream gates

- Mocked wire fixtures prove schema/error normalization but do not complete integration.
- A real provider-list/probe gate must run without printing credentials or response bodies containing user data.
- OpenRouter and Gemini credentials supplied by the user may be read only at execution time from the local private file, never copied into source, docs, test output or command history.
- SQLite completion requires real native schema creation/migration and an APK build, not only an in-memory test double.
# Addendum: model selection control

- Primary source: Reka UI Select, current documentation inspected 2026-07-22:
  `https://www.reka-ui.com/docs/components/select`.
- Decision: ADOPT the already pinned Reka UI Select through the existing
  `TalosThemedSelect.vue` adapter. It supplies the WAI-ARIA listbox pattern,
  managed focus, keyboard navigation and typeahead. Model Lab uses this select;
  the composer retains its compact quick picker. Both consume the same
  `ChatController.selectedModelId` and dynamic catalog.
- Rejected: native `<select>` (cannot preserve TALOS provider presentation and
  metadata consistently) and a new hand-rolled popup (duplicates tested Reka
  behavior and creates avoidable accessibility risk).

## Addendum: OpenRouter live response conformance

- Primary sources inspected 2026-07-22:
  `https://openrouter.ai/docs/api/reference/overview` and
  `https://openrouter.ai/docs/api/reference/errors-and-debugging`.
- Live finding: OpenRouter returned HTTP 200 with valid string content and a
  documented `usage` object containing nested token-detail objects. The initial
  AVM schema incorrectly required every `usage` value to be numeric and rejected
  the whole completion.
- Decision: ADAPT behind the AVM adapter. Validate `usage` as an open record,
  retain only finite top-level numeric metrics in `TalosMobileCompletionResult`,
  and keep nested provider-specific details outside the canonical contract for
  this slice. Do not weaken validation of `choices` or message content.
