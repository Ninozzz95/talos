# Research dossier - generated image persistence failure

Date: 2026-07-29
Subsystem: TALOS mobile image tool / encrypted Vault / chat

## Local diagnosis

- `generate_image` pays the provider and receives typed image bytes before it
  calls `TalosImageToolSources.save`.
- `sources.save` is the only bridge into the encrypted Vault, active authority
  grant, assistant-message attachment, Library, and reload path.
- the current catch converts a rejected Vault save into `ok: true`, sends the
  volatile bytes to the next model round, and tells the model the image exists
  in the conversation;
- the final assistant row persists only canonical `messageAttachments`, so the
  volatile result disappears and cannot render or reload;
- the UI has no honest durable visual fallback outside the Vault. Creating one
  would duplicate storage, policy, encryption, deletion, and authority
  semantics.

The defect is therefore not image generation. It is a false success after the
only durable persistence boundary rejected the write.

## Current primary and mature-reference sources

1. OpenAI, **File storage and Library in ChatGPT**, inspected 2026-07-29:
   <https://help.openai.com/en/articles/20001052-library-for-chatgpt>
   - created and uploaded files are automatically saved to a dedicated secure
     Library before they are offered for later discovery and reuse.
2. OpenAI, **Images in ChatGPT**, inspected 2026-07-29:
   <https://help.openai.com/en/articles/11084440-chatgpt-image-library>
   - created images are saved under Images and can subsequently be opened,
     downloaded, or shared.
3. Android Developers, **Access app-specific files**, inspected 2026-07-29:
   <https://developer.android.com/training/data-storage/app-specific>
   - sensitive app-only data belongs in persistent internal app storage;
   - storage can be bounded or unavailable, so writes need an explicit failure
     path rather than an assumed success.
4. Android Developers, **AtomicFile**, inspected 2026-07-29:
   <https://developer.android.com/reference/android/util/AtomicFile>
   - atomic replacement protects file integrity, but it is not a second store
     or a concurrency lock and cannot turn a rejected write into durable data.
5. OpenRouter, **Image Generation**, inspected 2026-07-29:
   <https://openrouter.ai/docs/guides/overview/multimodal/image-generation>
   - generated image bytes and media type are typed provider output; provider
     success does not imply application persistence.
6. Google, **Gemini API image generation**, inspected 2026-07-29:
   <https://ai.google.dev/gemini-api/docs/image-generation>
   - image output is a typed binary part whose lifecycle remains the client
     application's responsibility.

Exact runtime pin retained:

- `@capacitor-community/sqlite@8.1.0`;
- existing TALOS Vault/file-store adapter and repository schema;
- provider REST conformance as retrieved 2026-07-29.

No dependency is added.

## Upstream decision

**Adapt behind the existing TALOS Vault boundary.**

The tool may report success only after `sources.save` returns a canonical file,
hash, grant-backed attachment, and name. If that boundary rejects, return the
stable failure `TALOS_IMAGE_PERSIST_FAILED`, discard the volatile image result
from the agent-loop payload, and explicitly prohibit automatic regeneration.

Rejected alternatives:

- raw base64 in the assistant message: duplicates bytes in encrypted database
  rows and bypasses the Vault lifecycle;
- a cache-only chat image: it cannot satisfy reload, deletion, authority, or
  low-storage guarantees;
- a second image table/store: duplicates security and retention semantics;
- automatic second save or generation: the save boundary has no idempotency
  token, and regeneration can duplicate billing;
- claiming “conversation only”: false because no durable message attachment
  exists.

## Security and product constraints

- never expose raw storage exceptions, provider payloads, paths, or base64 in
  model-visible failure text;
- never fabricate a file id, hash, attachment, or Library entry;
- never retry generation automatically after the provider has already billed;
- preserve the successful path byte-for-byte and contract-for-contract;
- the visible response must tell the user that the image is unavailable, point
  to local storage/Doctor, and invite a user-controlled retry only after storage
  is healthy.
