# P1 Gemini JPEG response format - approved design

## Failure

Gemini image generation returned HTTP 400 before drawing any pixels because
TALOS requested `response_format.mime_type: "image/png"`. The live endpoint
reported that only `image/jpeg` is supported.

## Scope

This slice inherits two already-uncommitted owner-lane edits:

- `mobile/src/lib/images/imageGateway.ts`
- `mobile/tests/unit/images/imageGateway.test.ts`

They are preserved and audited rather than reverted and recreated.

## Required behavior

1. Gemini Interactions requests use:
   - `type: "image"`
   - `mime_type: "image/jpeg"`
   - mapped `aspect_ratio`
   - uppercase `image_size: "1K"`
2. API keys remain in the `x-goog-api-key` header, never the URL.
3. OpenAI continues requesting PNG.
4. Returned MIME types remain shape-preserving.
5. JPEG saves use `.jpg` and remain accepted by vault and canonical image
   attachment contracts.
6. HTTP 400 remains permanent/non-retryable and its provider text remains
   visible in diagnostics.

## Non-goals

- No live provider call from automated tests.
- No model hardcoding, SDK addition, transcoding, or global MIME replacement.
- No change to safety policy, billing consent, provider choice, or timeout.

## Human-visible proof

On the final APK, with the owner's Gemini key:

1. Ask for one simple square image.
2. Confirm the tool does not return the previous PNG HTTP 400.
3. Confirm one image appears, can be opened, and is saved to Library as `.jpg`.
4. Open the image from Library after app reload.
5. Confirm the model can see the generated image in the following round.

