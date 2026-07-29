# P1 Gemini JPEG response format - upstream research (2026-07-28)

## Question

Is the inherited uncommitted change from `image/png` to `image/jpeg` in the
Gemini Interactions request correct, and does it need a broader MIME rewrite?

## Exact upstream

- API: Gemini Interactions REST API, `v1beta`
- Endpoint used by TALOS:
  `https://generativelanguage.googleapis.com/v1beta/interactions`
- Model selection remains runtime catalogue-driven.
- Primary sources:
  - [Gemini Interactions API reference](https://ai.google.dev/api/interactions-api)
  - [Gemini image generation guide](https://ai.google.dev/gemini-api/docs/image-generation)
  - [May 2026 Interactions breaking-change guide](https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026)

## Evidence

1. The current `ImageResponseFormat` schema requires `type: "image"` and
   enumerates only `image/jpeg` for `mime_type`.
2. The same schema accepts `1K`, `2K`, and `4K` image sizes and documents the
   aspect ratios TALOS maps.
3. The owner captured the real endpoint response for the previous payload:
   `HTTP 400: The value 'image/png' is not supported. Supported values:
   'image/jpeg'.`
4. Google's image-generation guide is internally inconsistent: its REST and
   Python examples commonly use JPEG, while some JavaScript snippets still
   show PNG. The normative API enum and the live provider response agree, so
   examples that contradict them are rejected.
5. The output content schema can carry PNG, JPEG, WebP and other input/content
   MIME types. Therefore this is **not** a global ban on PNG. Only the
   Interactions `response_format.mime_type` request field must be JPEG.
6. TALOS already preserves returned `mime_type`, saves JPEG with `.jpg`, and
   permits JPEG through vault and provider attachment contracts.

## Upstream decision

**Adopt the current Interactions contract directly at the provider adapter
edge.**

- Keep the inherited `mime_type: "image/jpeg"` change.
- Keep `type: "image"`, uppercase `1K`, and existing aspect-ratio mapping.
- Keep OpenAI output format PNG.
- Keep parsing of Gemini PNG/JPEG/WebP content; do not replace unrelated PNG
  contracts.
- Pin the exact request shape with a unit conformance fixture.

Rejected alternatives:

- **Follow the stale PNG guide snippets:** contradicted by both normative schema
  and real wire response.
- **Omit `mime_type`:** might use a provider default but loses an explicit,
  versioned contract and does not prove the reported 400 is gone.
- **Convert returned JPEG bytes to PNG locally:** needless CPU/memory work on a
  phone and risks losing metadata/quality.
- **Add Google SDK:** TALOS already has an AVM-owned provider-neutral transport
  adapter; a new SDK is unnecessary for this one-field conformance fix.

## Real-upstream limit

Automated tests prove the request body and downstream MIME handling. They do
not spend the owner's Gemini credits or exercise the live key. One real image
generation on the final APK is the required manual upstream gate.

