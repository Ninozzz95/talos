# Design - OpenRouter model-aware tool availability

Date: 2026-07-28  
Status: approved by incident evidence and upstream contract

## Contract

`talosModelSupportsToolCalling(model)` is the single provider-neutral call
site for this decision:

- OpenRouter: true only when `supportedParameters` contains `tools`;
- every other provider: true, preserving its existing adapter contract.

The guard is consumed at three boundaries:

1. controller: an unsupported model receives an empty offered toolset;
2. prompt: no document/export marker or tool instruction is advertised, and a
   bounded no-tools truthfulness instruction is appended;
3. OpenRouter serializer: `tools` and `tool_choice` are omitted even if an
   upstream caller accidentally supplies tools.

Text completion continues normally. TALOS never silently switches model and
never claims that a file, image, search, read, or export action happened.

## Failure behavior

Missing OpenRouter capability metadata fails closed for tools but does not
block plain chat. A tool-capable OpenRouter model retains the existing agent
loop and exact schema serialization.

## Human-visible proof

With a non-tool OpenRouter model selected, an ordinary prompt succeeds without
the provider endpoint error. A request requiring a TALOS action receives an
honest limitation and a suggestion to select a tool-capable model. Selecting a
model whose catalog contains `tools` restores the action without app restart.

