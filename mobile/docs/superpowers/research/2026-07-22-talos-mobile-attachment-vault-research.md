# TALOS Mobile Attachment and Local Vault Research

Date: 2026-07-22
Owner: Codex mobile lane
Frozen desktop reference: `C:/Users/ninox/Desktop/AVM`
Status: COMPLETE - implementation decisions frozen for P1.6

## Local findings

The mobile app already has a durable SQLite chat schema and a real provider
adapter boundary, but attachments are not wired end to end:

- `TalosMobileComposer.vue` exposes a disabled HTML file input and emits raw
  `File[]`; `ChatScreen.vue` does not consume that event.
- `talos_chat_attachments` exists in schema version 1, but no repository method
  reads or writes it.
- `ChatTurn` and all six adapters currently accept text only.
- `ContextScreen.vue` is an inert placeholder and cannot list or reattach files.
- the full encrypted Rust Vault described in the older M2 draft remains gated
  and must not be presented as implemented.

The frozen desktop behavior in `useTalosChatAttachments.ts` is the parity
reference: ingest into the Vault, create an explicit per-file authority grant,
show uploading/available/failed state in the composer, block unsafe sends, bind
file and grant IDs to the message, and preserve a reusable Vault entry.

## Current primary sources

Retrieved successfully on 2026-07-22:

- Capawesome File Picker 8: https://capawesome.io/docs/plugins/file-picker/
- Capacitor Filesystem 8: https://capacitorjs.com/docs/apis/filesystem
- Android storage overview: https://developer.android.com/training/data-storage/
- Android app-specific storage: https://developer.android.com/training/data-storage/app-specific
- Android Storage Access Framework: https://developer.android.com/training/data-storage/shared/documents-files
- Android Auto Backup: https://developer.android.com/identity/data/autobackup
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- `file-type`: https://github.com/sindresorhus/file-type
- Web Crypto digest: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
- PDF.js: https://mozilla.github.io/pdf.js/getting_started/
- Mammoth browser and security contract: https://github.com/mwilliamson/mammoth.js
- OpenAI images and vision: https://developers.openai.com/api/docs/guides/images-vision
- OpenAI file inputs: https://developers.openai.com/api/docs/guides/file-inputs
- Anthropic vision: https://platform.claude.com/docs/en/build-with-claude/vision
- Anthropic PDF support: https://platform.claude.com/docs/en/build-with-claude/pdf-support
- Gemini image understanding: https://ai.google.dev/gemini-api/docs/generate-content/image-understanding
- Ollama vision: https://docs.ollama.com/capabilities/vision
- Ollama model capabilities: https://docs.ollama.com/api-reference/show-model-details

## Frozen upstream pins

| Package | Pin | License | Registry integrity |
|---|---:|---|---|
| `@capawesome/capacitor-file-picker` | `8.0.3` | MIT | `sha512-/PdujysNnbY82LXXM1XthRdgNr5wodgLNgbo2pgarJskiQYvy/+QPKsuzFPUZd/4pi3dLxXjZMZVVyYy2Wm05A==` |
| `@capacitor/filesystem` | `8.1.2` | MIT | `sha512-doaaMfGoFR2hWU6aV6u83I+5ZsGyJVq+Gz4r9lMpJzUKMm1eMu0hLnFdV1aXZlU9FlK/RndFrVD8oRZfNOqWgQ==` |
| `file-type` | `22.0.1` | MIT | `sha512-ww5Mhre0EE+jmBvOXTmXAbEMuZE7uX4a3+oRCQFNj8w++g3ev913N6tXQz0XTXbueQ5TWQfm6BdaViEHHn8bhA==` |
| `pdfjs-dist` | `6.1.200` | Apache-2.0 | `sha512-o8MolyzirkkLrcdsae/HEOiIcXWI7DS5zGpvqW8xTC2YUsW30rltFw2bDGvw/fskUdEMrQm2br68jzDS5BH2vw==` |
| `mammoth` | `1.12.0` | BSD-2-Clause | `sha512-cwnK1RIcRdDMi2HRx2EXGYlxqIEh0Oo3bLhorgnsVJi2UkbX1+jKxuBNR9PC5+JaX7EkmJxFPmo6mjLpqShI2w==` |

All pins are compatible with the lane's Capacitor 8 and Node 24 contract.

## Findings applied

### Picker and storage

- Android's Storage Access Framework gives user-scoped access through the
  system picker without broad storage permission.
- The picked URI is not retained as the authoritative copy. TALOS immediately
  copies the file to an application-generated path in internal app storage.
- Internal app storage is private to the application, needs no storage
  permission, is reliable for application data, and is encrypted by Android on
  Android 10 and later. This is honest platform protection, not the future M2
  encrypted Vault claim.
- `Directory.Documents`, external storage and `MANAGE_EXTERNAL_STORAGE` are
  rejected. Attachment bytes are excluded from cloud backup/device transfer.
- Capawesome `readData` is rejected for arbitrary files because its own docs
  warn about memory pressure. The picker returns path and metadata; Capacitor
  Filesystem owns the bounded read after the private copy.
- The installed 8.0.3 type contract documents only `limit: 0` (multiple) and
  `limit: 1`. TALOS therefore requests `limit: 0` with `readData: false`, then
  rejects more than six returned files before any source URI or Blob is read.

### Validation and extraction

- User filenames and MIME declarations are untrusted. TALOS generates the
  internal filename, enforces count/individual/aggregate limits, checks an
  extension allowlist, checks binary signatures with `file-type`, and handles
  text formats separately because `file-type` explicitly does not detect them.
- `file-type` is a best-effort hint, not a security proof. Signature, extension,
  MIME, decoder and parser decisions must agree before a file is available.
- SHA-256 uses Web Crypto. Its API is non-streaming, so the hard file cap is also
  a memory-safety boundary.
- PDF.js and Mammoth are dynamically imported only inside a dedicated worker.
  The worker has an execution timeout and is terminated on overrun. Mammoth is
  used only for `extractRawText({arrayBuffer})`; generated HTML is never rendered.
- Extracted text is bounded and is labelled untrusted source material before it
  enters a model prompt.

### Provider multipart mapping

- AVM owns one canonical part contract; vendor wire shapes stay inside adapters.
- OpenAI-compatible chat requests use text parts and base64 data-URL image parts.
  Local document extraction is sent as bounded text, avoiding hidden provider
  uploads and retention.
- Anthropic uses `image` base64 blocks and text blocks. Its direct PDF block is
  not required for P1.6 because the local extraction contract is provider-neutral.
- Gemini uses `inlineData` image parts and text parts. The official 20 MB inline
  request boundary reinforces TALOS's smaller aggregate cap.
- Ollama uses the per-message `images` base64 array. `/api/show` capability data
  is the observed source for the `vision` modality.
- DeepSeek remains text/document-extraction only unless its model metadata
  explicitly declares image support. TALOS never guesses vision capability.

## Upstream decision

### ADOPT

- Directly integrate the five pinned packages above.
- Use the Android system picker through Capawesome and private file storage
  through Capacitor Filesystem.
- Use provider-native image shapes exactly as documented.

### ADAPT

- Place picker, storage, extraction, grants and provider parts behind AVM-owned
  typed adapters.
- Preserve desktop grant semantics (`model.read`, `browser.upload`) as explicit
  per-file records. P1.7 may consume `browser.upload`; P1.6 only creates and
  displays the authority.
- Keep a reusable local Vault record independent from a chat session, then bind
  file/grant pairs atomically when the user message is persisted.

### REJECT

- No broad storage permission, raw user path, original filename as storage key,
  unchecked MIME, archive extraction, generated DOCX HTML, or silent file repair.
- No hidden provider file upload or provider-owned durable file ID in P1.6.
- No claim that platform-private storage equals the future M2 encrypted Vault.
- No image payload to a model whose capability is absent or unknown.
