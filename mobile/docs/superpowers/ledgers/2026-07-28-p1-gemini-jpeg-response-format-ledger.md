# Execution ledger - P1 Gemini JPEG response format

- Subsystem: TALOS mobile image gateway
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Inherited dirty files: explicitly preserved.
- Upstream pin: Gemini Interactions REST `v1beta`; normative
  `ImageResponseFormat` enum inspected 2026-07-28.
- Commit: forbidden without fresh explicit owner authorization.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p1-gemini-jpeg-response-format-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p1-gemini-jpeg-response-format-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p1-gemini-jpeg-response-format-ledger.md`

Modify, preserving the inherited behavior:

- `mobile/src/lib/images/imageGateway.ts`
- `mobile/tests/unit/images/imageGateway.test.ts`

Delete: none.

## Symbols and contracts

- Preserve public `planTalosImageRequest(...)`,
  `parseTalosGeneratedImages(...)`, `pickTalosImageModel(...)`,
  `readTalosImageError(...)`, `talosImageErrorIsPermanent(...)`, and
  `chooseTalosImageProvider(...)`.
- Preserve `TalosGeneratedImage.mediaType` and all canonical PNG/JPEG/WebP
  attachment unions.
- Change only Gemini `response_format.mime_type` from PNG to JPEG.
- Keep the exact conformance assertion in
  `asking two different providers for the same picture > speaks Gemini`.

## RED evidence

The production RED is stronger than a double:

- Owner physical device, pre-patch:
  `HTTP 400: The value 'image/png' is not supported. Supported values:
  'image/jpeg'.`
- Git baseline `0e66f3b` and its test fixture both required
  `mime_type: "image/png"`.

The inherited dirty patch already exists, so it must not be reverted merely to
re-enact RED. Its changed unit fixture is the permanent regression guard.

## GREEN and regression commands

Focused:

`npx vitest run tests/unit/images/imageGateway.test.ts`

Affected image/tool/provider path:

`npx vitest run tests/unit/images/imageGateway.test.ts tests/unit/tools/toolImageResults.test.ts tests/unit/chat/imagesOnATextOnlyModel.test.ts tests/unit/chat/chatController.test.ts tests/unit/chat/geminiAdapter.test.ts`

Integration:

`npm run typecheck`

`npm run build`

`git diff --check`

## Real-upstream gate and rollback

- Final APK manual test must perform one Gemini generation with the owner's key.
- Rollback is the two inherited file edits plus these three task documents.
- No stored data, schema, key, or migration change exists.

## Closure record

Automated closure: **CLOSED** on 2026-07-28.

- RED: owner physical-device response and Git baseline recorded above.
- Focused GREEN: `imageGateway.test.ts` passed 17/17.
- Affected regression gate: 5 files passed, 59/59 tests.
- TypeScript gate: `npm run typecheck` passed.
- Production web build: `npm run build` passed (3,203 modules;
  initial JavaScript 551,122/560,000 bytes; CSS 129,159/150,000 bytes).
- Native/web parity gate invoked by the build: 9/9 checks passed.
- Integrity gate: `git diff --check` exited 0. PowerShell reported only the
  repository's non-failing CRLF checkout warnings.
- Live-provider acceptance remains intentionally assigned to the final owner
  checklist because it requires the owner's Gemini credential and quota.
- No Claude acknowledgement ticket may be created until the owner reports that
  this and every other checklist item passed manually.
