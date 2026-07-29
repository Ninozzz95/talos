# Execution ledger - P0 image provider routing

Date: 2026-07-28  
Subsystem: TALOS mobile images / provider integration  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED (automated gates; disposable-key/device gate remains for owner checklist)

## Exact ownership

Create:

- `mobile/src/lib/images/openRouterImageCatalog.ts`
- `mobile/src/lib/images/imageProviderSelection.ts`
- `mobile/docs/superpowers/research/2026-07-28-p0-image-provider-routing-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-image-provider-routing-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-image-provider-routing-ledger.md`

Modify:

- `mobile/src/lib/images/imageGateway.ts`
- `mobile/src/lib/images/imageTools.ts`
- `mobile/src/stores/chatController.ts`
- `mobile/tests/unit/images/imageGateway.test.ts`
- `mobile/tests/unit/chat/chatController.test.ts`

Delete:

- none

## Public symbols and compatibility

- Extend `TalosImageProvider` with `openrouter`.
- Add `TalosImageModelCandidate`.
- Add `planTalosImageCatalogRequest(provider, config)`.
- Add `parseTalosImageModels(provider, payload)`.
- Expand `pickTalosImageModel(provider, models, preferredModel?)` without
  breaking the existing two-argument call.
- Preserve `TalosImageRequest`, `TalosImagePlan`, `TalosGeneratedImage`,
  `planTalosImageRequest`, `parseTalosGeneratedImages`,
  `chooseTalosImageProvider`, and existing OpenAI/Gemini behavior.

## RED scenarios

1. `IMAGE-OR-01 OpenRouter is a selectable configured image provider`.
2. `IMAGE-OR-02 OpenRouter request uses /images, bearer auth, one image, and
   canonical aspect/output format`.
3. `IMAGE-OR-03 dedicated /images/models response is shape-validated`.
4. `IMAGE-OR-04 same-author newest full image model wins`.
5. `IMAGE-OR-05 realistic OpenRouter chat tool round discovers, generates,
   parses, and stores the image`.
6. `IMAGE-GEM-01 Imagen Ultra is never selected for Gemini Interactions`.
7. `IMAGE-MIME-01 b64_json preserves a supported declared media_type`.
8. Existing OpenAI/Gemini plans, error semantics, and image save path remain
   green.

## Focused and regression commands

```powershell
npx vitest run tests/unit/images/imageGateway.test.ts tests/unit/chat/chatController.test.ts
npx vitest run tests/unit/chat/openAiCompatibleAdapter.test.ts tests/unit/chat/geminiAdapter.test.ts tests/unit/chat/streamComplete.test.ts
npm run typecheck
npm run build
git diff --check
```

## Real-upstream gate

On a disposable-key/device test:

- refresh OpenRouter image catalog and record model id without secret;
- generate one square image via `POST /api/v1/images`;
- generate one square Gemini image through Interactions;
- verify non-empty decoded bytes, actual MIME, Vault persistence, chat render,
  reload, and diagnostics on a deliberate invalid model.

Without disposable keys this remains an explicit physical-owner checklist item;
mocks do not substitute for the upstream gate.

## Rollback

Revert only the five product and two test files listed above and remove these
three task documents. No schema migration or stored data rewrite is involved.

## RED evidence

Fresh pre-fix runs on 2026-07-28:

```text
image gateway: 7 expected failures, 17 compatibility tests passed
gateway + realistic controller: 6 expected failures, 55 compatibility tests passed
```

Observed failures match the incident:

- OpenRouter was not selectable and fell through to Gemini's endpoint;
- no dedicated image catalog planner/parser existed;
- `b64_json` discarded `media_type`;
- Imagen Ultra won the broad Gemini name sort;
- OpenRouter author affinity was absent;
- the realistic tool round never called `/images/models` or `/images`.

Product implementation may begin.

## Plan amendment - initial bundle boundary

The first GREEN implementation passed focused tests and typecheck, but the
production build correctly failed:

```text
TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED
636433 bytes > 560000 bytes
```

Cause: importing Zod catalog schemas into the already-bootstrap-reachable image
gateway pulled schema machinery into the initial chunk. The contract is
unchanged, but `parseTalosImageModels` moves to the exact new
`openRouterImageCatalog.ts` module and is dynamically imported only inside an
actual OpenRouter image generation. This preserves typed validation without
charging chat startup.

The first corrected build passed at `559827 / 560000` bytes, leaving only 173
bytes of headroom. That is not a stable closure condition for the remaining
fixes. The synchronous provider-choice helper therefore moves to the exact
lightweight `imageProviderSelection.ts` module; the full gateway becomes
dynamic-only from the controller. No behavior or public gateway export changes.

## GREEN evidence

Fresh post-fix runs on 2026-07-28:

```text
focused gateway + realistic controller: 2 files, 63/63 passed
provider/stream regressions: 3 files, 26/26 passed
npm run typecheck: passed
npm run build: passed; 3222 modules transformed
initial JavaScript: 556126 / 560000 bytes
initial CSS: 129477 / 150000 bytes
feature parity: 9/9 validator tests and ledger verification passed
git diff --check: passed (line-ending notices only)
```

The final split restores 3,874 bytes of startup-budget headroom while keeping
the catalog schema and provider gateway demand-loaded. No production provider
key was used during automated verification, so the exact real-upstream gate
above remains mandatory on the owner's device before the release ticket.
