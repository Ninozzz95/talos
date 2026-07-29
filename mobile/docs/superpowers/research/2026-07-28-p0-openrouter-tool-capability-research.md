# Research dossier - OpenRouter tool capability gating

Date: 2026-07-28  
Subsystem: TALOS mobile provider adapter / agent loop  
Incident: OpenRouter returned `No endpoints found that support tool use`

## Local diagnosis

The OpenRouter catalog adapter already preserves each model's
`supported_parameters`, including `tools`. The send path nevertheless offered
the complete TALOS toolset for every selected OpenRouter text model, and the
OpenAI-compatible adapter serialized it whenever `input.tools` was non-empty.
Therefore a model whose own catalog metadata omitted `tools` still received
`tools` plus `tool_choice: auto`.

## Current primary sources

1. OpenRouter, **Models API**, inspected 2026-07-28:
   <https://openrouter.ai/docs/guides/overview/models>
   - `supported_parameters` is the model-level array of supported request
     parameters.
   - `tools` denotes function-calling capability.
   - the official filter for tool-capable models is
     `/api/v1/models?supported_parameters=tools`.
2. OpenRouter, **Tool & Function Calling**, inspected 2026-07-28:
   <https://openrouter.ai/docs/guides/features/tool-calling>
   - tools are valid only for supported models;
   - the official model browser uses the same `supported_parameters=tools`
     capability filter.
3. OpenRouter, **Provider routing**, inspected 2026-07-28:
   <https://openrouter.ai/docs/guides/routing/provider-selection>
   - provider routing can require parameter support, but that does not create
     tool capability for a model and can legitimately leave no endpoint.

Exact upstream pin: OpenRouter Models API `supported_parameters` contract as
documented and retrieved on 2026-07-28. There is no package dependency to pin;
the conformance fixture pins the response field and `tools` token locally.

## Upstream decision

**Adapt behind an AVM-owned capability guard.**

- For OpenRouter only, advertise and serialize TALOS tools iff the selected
  model's preserved catalog metadata contains the exact `tools` token.
- Keep the model usable for ordinary text chat when it lacks tool calling.
- Remove tool-specific system instructions for that turn and explicitly tell
  the model not to claim TALOS actions.
- Repeat the guard at the provider serializer so future callers cannot bypass
  the controller-level decision.

Rejected alternatives:

- **Send tools and rely on routing/parameter ignoring:** rejected because the
  real request already failed when no compatible endpoint existed.
- **Set `provider.require_parameters`:** rejected as the primary fix because it
  only makes routing stricter; it still cannot make a non-tool model callable.
- **Hide every non-tool OpenRouter model:** rejected because those models remain
  valid for ordinary text chat.
- **Infer capability from model name/vendor:** rejected as stale and
  non-conformant when the upstream API exposes the canonical field.

## Security and compatibility

Fail closed when OpenRouter metadata is absent or `tools` is omitted. Do not
apply this metadata rule to other providers, whose catalog contracts do not
expose the same canonical field. Existing Anthropic, Gemini, OpenAI, DeepSeek,
and Ollama tool paths remain unchanged.

