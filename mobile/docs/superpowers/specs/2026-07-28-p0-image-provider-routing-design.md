# Design - provider-correct image generation

Date: 2026-07-28  
Status: approved by incident evidence and upstream contracts

## Canonical flow

```text
tool-capable chat model
  -> generate_image
  -> choose configured image provider
  -> provider-specific live image catalog
  -> canonical TalosImageRequest
  -> provider-specific request plan
  -> typed response parsing
  -> exact raster bytes
  -> Vault + chat image part
```

Provider behavior:

- OpenAI: existing `/images/generations`.
- Gemini: `/v1beta/interactions`, Gemini image models only.
- OpenRouter: `/api/v1/images/models` then `/api/v1/images`.

## Selection

- Prefer the current chat provider when it has an image API and key.
- On OpenRouter, prefer image models from the same author namespace as the
  current chat model, then prefer non-lite/non-mini models, then newest
  `created`.
- On Gemini, exclude all `imagen-*` ids and require a `gemini-*image*` id.
  Prefer higher parsed Gemini version, with full Flash/Pro models ahead of Lite.
- Fall back only to the single current documented floor when a provider catalog
  is unavailable; do not carry a frozen catalog.

## Failure contract

- catalog HTTP/shape failure is a provider failure, not an empty image;
- non-2xx generation preserves the provider's exact bounded message;
- a 2xx with no supported raster is `TALOS_IMAGE_EMPTY`;
- no automatic cross-provider retry after a billed/ambiguous generation;
- Stop retains the already-documented transport cancellation limitation.

## Human-visible proof

An OpenRouter chat model that declares tool calling can generate through the
same OpenRouter key. A Gemini key never selects an Imagen model for the
Interactions endpoint. The saved item has the actual provider MIME extension
and is visible in chat and both Library surfaces.

