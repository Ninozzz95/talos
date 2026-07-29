# Execution ledger - P1 image result durability

Date: 2026-07-29  
Subsystem: TALOS mobile tools / chat / Vault  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED (automated; real-provider/device gate remains for owner)  
Commit policy: no commit without fresh owner authorization

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-p1-image-result-durability-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-p1-image-result-durability-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-p1-image-result-durability-ledger.md`

Modify:

- `mobile/src/composables/useTalosMobileAttachments.ts`
- `mobile/src/lib/images/imageTools.ts`
- `mobile/src/lib/tools/agentLoop.ts`
- `mobile/src/lib/tools/registry.ts`
- `mobile/src/stores/chat.ts`
- `mobile/src/stores/chatController.ts`
- `mobile/tests/unit/chat/chatController.test.ts`
- `mobile/tests/unit/chat/chatStoreStreaming.test.ts`
- `mobile/tests/unit/composables/useTalosMobileAttachments.test.ts`
- `mobile/tests/unit/tools/toolImageResults.test.ts`

Delete:

- none

## Public symbols and compatibility

- Overload `TalosMobileAttachmentsController.saveGeneratedBinary` with an
  explicit `forMessage: true` result contract.
- Add `TalosToolResult.messageAttachments`.
- Add `TalosAgentLoopOutcome.messageAttachments`.
- Add `ChatCompletionResult.attachments`.
- Extend the image tool save result with an optional canonical message
  attachment and verified SHA-256.
- Preserve `saveGeneratedBinary`, `TalosMobileInputPart`,
  `runTalosAgentLoop`, `ChatCompletion`, provider adapters, repository schemas,
  and all existing upload flows.

## RED scenarios

1. `IMAGE-DUR-01 controller forwards generated image parts into the immediate
   provider follow-up`.
2. `IMAGE-DUR-02 a successful generated image is bound to the durable assistant
   message and survives controller reload`.
3. `IMAGE-DUR-03 a later user turn does not auto-replay the generated assistant
   attachment to the provider`.
4. `IMAGE-DUR-04 the message-aware binary save retains its grant while the
   Library-only save still revokes it`.
5. `IMAGE-DUR-05 the agent loop preserves image parts and message bindings in
   tool-call order`.
6. Existing image gateway, user attachment, Vault, renderer, and provider-wire
   tests remain green.

Expected pre-fix failures:

- controller second request contains no generated image part;
- assistant row has no image attachment before or after reload;
- no message-aware generated-binary save overload exists;
- agent-loop outcome has no binding payload.

## Focused GREEN commands

```powershell
npx vitest run tests/unit/tools/toolImageResults.test.ts tests/unit/composables/useTalosMobileAttachments.test.ts tests/unit/chat/chatStoreStreaming.test.ts tests/unit/chat/chatController.test.ts
npx vitest run tests/unit/images/imageGateway.test.ts tests/unit/chat/openAiCompatibleAdapter.test.ts tests/unit/chat/geminiAdapter.test.ts tests/unit/chat/TalosMobileMessageList.test.ts tests/unit/services/talosVaultService.test.ts
npm run typecheck
npm run build
git diff --check
```

## Real-upstream and human-visible gate

With a disposable image-capable provider key on a physical device:

- generate one raster image through natural language;
- verify a non-empty image appears in the final chat message;
- open the per-chat and global Library entries;
- close/reopen the chat and verify the image remains;
- send a plain text follow-up and confirm diagnostics show no automatic image
  upload;
- delete/revoke through the normal Library flows and confirm the UI fails
  visibly rather than showing stale bytes.

Mocks prove the internal contract but do not substitute for this device and
real-provider gate.

## Rollback

Revert only the seven product files and four test files listed above, then
remove these three task documents. No schema rollback or stored-data rewrite is
required.

## RED evidence

Fresh pre-fix command on 2026-07-29:

```text
npx vitest run tests/unit/tools/toolImageResults.test.ts tests/unit/composables/useTalosMobileAttachments.test.ts tests/unit/chat/chatStoreStreaming.test.ts tests/unit/chat/chatController.test.ts

4 test files failed
4 expected failures
60 compatibility tests passed
```

Observed boundaries:

- `IMAGE-DUR-01`: the immediate OpenRouter follow-up had no
  `data:image/png;base64` part;
- `IMAGE-DUR-02`: the assistant message had no persisted attachment;
- `IMAGE-DUR-04`: `saveGeneratedBinaryForMessage` did not exist;
- `IMAGE-DUR-05`: the loop outcome discarded message bindings.

The failures match the ledger and product implementation may begin.

## Plan amendment - vision-capable controller fixture

The first GREEN run reached 63/64. The remaining controller assertion expected
an image-bearing second provider request, but its historical OpenRouter catalog
fixture declared the selected model as `input_modalities: ['text']`. The
adapter correctly refused to send an image to that text-only profile before a
second HTTP request existed.

`IMAGE-DUR-01` is specifically the visual follow-up contract, so the exact
catalog fixture in `chatController.test.ts` is amended to declare
`['text', 'image']`, matching the vision-capable scenario under test. No
production capability bypass or fallback is introduced.

## Plan amendment - initial bundle budget

The first behaviorally GREEN implementation passed 64/64 focused tests, 61/61
affected regressions, and typecheck. Vite compiled 3,239 modules, but the
repository budget gate correctly rejected:

```text
TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED: 560273 bytes exceeds 560000 bytes
```

The initial design added a second generated-binary helper whose persistence
body duplicated `saveGeneratedBinary`. It is replaced by a typed
`forMessage: true` overload on that existing helper. The default call and
return type remain source-compatible and still revoke their unused grant.
Controller output also carries the loop's always-present attachment array
directly instead of emitting an equivalent conditional spread.

The 560,000-byte limit is unchanged.

The first compaction reduced the measured entry chunk to 560,069 bytes. A
second behavior-neutral compaction interns the identical
`TALOS_CHAT_SESSION_NOT_FOUND` value already emitted four times by the owned
chat-store file. Error identity and every call site remain unchanged.

## GREEN evidence

Fresh post-fix evidence on 2026-07-29:

```text
focused durability/controller matrix: 4 files, 64/64 passed
gateway/adapters/renderer/Vault/executor regressions: 6 files, 61/61 passed
vue-tsc typecheck: passed
Vite production build: passed, 3,239 modules
initial JavaScript: 559,947 / 560,000 bytes
initial CSS: 132,986 / 150,000 bytes
feature parity: 9/9
git diff --check (exact owned files): passed
```

The realistic controller test now proves all four boundaries in one flow:

- generated base64 reaches the immediate vision-capable provider follow-up;
- verified Vault bytes and the active grant become a durable assistant binding;
- the image attachment is projected again after controller reload;
- a later text-only user turn does not resolve or upload the assistant image.

No provider key was used by automation. The real-upstream and physical-device
gate remains open for the owner's final checklist, so no Claude ACK ticket may
be produced yet.
