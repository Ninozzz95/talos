# Execution ledger - P0 OpenRouter tool capability

Date: 2026-07-28  
Subsystem: TALOS mobile provider adapter / chat controller  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED

## Exact ownership

Create:

- `mobile/src/lib/chat/modelToolCapabilities.ts`
- `mobile/docs/superpowers/research/2026-07-28-p0-openrouter-tool-capability-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-openrouter-tool-capability-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-openrouter-tool-capability-ledger.md`

Modify:

- `mobile/src/lib/chat/chatCompletion.ts`
- `mobile/src/lib/chat/providers/openAiCompatibleAdapter.ts`
- `mobile/src/stores/chatController.ts`
- `mobile/tests/unit/chat/chatCompletion.test.ts`
- `mobile/tests/unit/chat/openAiCompatibleAdapter.test.ts`
- `mobile/tests/unit/chat/chatController.test.ts`

Delete:

- none

## Public symbols and compatibility

- Add `talosModelSupportsToolCalling(model)`.
- Preserve `buildChatCompletion`, every provider adapter, tool schemas, agent
  loop, model catalog shape, manual-model contract, and text-only completion.
- Do not change model selection or silently route to another model.

## RED scenarios

1. `OPENROUTER-TOOLS-01 serializer omits tools for an unsupported model`
   - model has `supportedParameters: []`;
   - request has neither `tools` nor `tool_choice`.
2. `OPENROUTER-TOOLS-02 serializer retains tools for a capable model`
   - model has `supportedParameters: ['tools']`;
   - request contains the canonical tool schema and `tool_choice: auto`.
3. `OPENROUTER-TOOLS-03 completion boundary fails closed`
   - a caller supplies tools for an unsupported OpenRouter model;
   - the real request remains a plain completion.
4. `OPENROUTER-TOOLS-04 controller advertises no fake action`
   - real send with a manual non-tool OpenRouter model;
   - no tool schema, no export/document marker, and an explicit no-tools
     truthfulness instruction.
5. Existing Anthropic/OpenAI-compatible agent loops remain green.

## Focused and regression commands

```powershell
npx vitest run tests/unit/chat/chatCompletion.test.ts tests/unit/chat/openAiCompatibleAdapter.test.ts tests/unit/chat/chatController.test.ts
npx vitest run tests/unit/chat/streamComplete.test.ts tests/unit/chat/geminiOllamaTools.test.ts tests/unit/tools/providerSchemaDialects.test.ts
npm run typecheck
npm run build
git diff --check
```

## Real-upstream gate

With a configured OpenRouter key, refresh the live catalog and exercise:

- one model without `supported_parameters: tools`: plain chat succeeds and the
  request contains no tool schema;
- one model with the token: a benign Library list/read request enters the real
  tool loop.

Store provider/status evidence without secrets. This live gate is reserved for
the owner's configured physical-device test if no disposable key is available.

## Rollback

Remove only the capability helper and revert the six listed product/test
integration files. No database migration or stored user data is involved.

## RED evidence

Fresh pre-fix run on 2026-07-28:

```text
3 test files failed
3 expected failures
50 compatibility tests passed
```

At the serializer, canonical completion boundary, and realistic controller
send, the request contained `tools` and `tool_choice: auto` although the
selected OpenRouter model reported `supported_parameters: []`. The controller
also lacked the no-tools truthfulness instruction. Product implementation may
begin.

## GREEN and regression evidence

Fresh post-fix evidence on 2026-07-28:

```text
npx vitest run tests/unit/chat/chatCompletion.test.ts
  tests/unit/chat/openAiCompatibleAdapter.test.ts
  tests/unit/chat/chatController.test.ts

3 files passed
53 tests passed
```

```text
npx vitest run tests/unit/chat/streamComplete.test.ts
  tests/unit/chat/geminiOllamaTools.test.ts
  tests/unit/tools/providerSchemaDialects.test.ts

3 files passed
26 tests passed
```

Additional gates:

```text
npm run typecheck
PASS

npm run build
3220 modules transformed
initial JavaScript 557582 / 560000 bytes
initial CSS 129477 / 150000 bytes
feature parity 9 / 9

git diff --check
PASS (line-ending notices only)
```

## Closure decision

Closed. OpenRouter models without the exact upstream `tools` capability remain
usable for ordinary chat, but receive no tool schema, no `tool_choice`, no
legacy save marker, and an explicit truthfulness constraint. Models declaring
`tools` retain the existing agent path. The same guard is enforced at
controller, canonical completion, and serializer boundaries.
