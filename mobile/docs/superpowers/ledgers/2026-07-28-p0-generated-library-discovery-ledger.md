# P0 generated-Library discovery execution ledger

Date: 2026-07-28
Subsystem: TALOS mobile agent tools + chat integration
Lane: `lane/kimi-mobile`
Baseline build observed by owner: `0e66f3b`
Status: CLOSED - focused and affected automated gates complete; owner APK acceptance pending

## Evidence amendment

The earlier cross-chat Library design correctly requires both uploaded and
generated files to be reusable across chats. Later tool hardening copied the
ambient-injection predicate into explicit tools and narrowed it to uploaded
rows. Current inspection therefore invalidates the comment that both paths
must have identical origin filters.

They must share availability, global enablement, and per-file opt-out, but not
origin policy:

- ambient automatic injection stays uploaded-only;
- an explicit user-driven read tool may search/read uploaded and generated
  rows, with all content wrapped as untrusted data.

The owner transcript additionally proves a second regression: score-zero
uploaded images were returned as matches for a generated `ds4` PDF query.

## Exact ownership

Create:

- `mobile/tests/unit/tools/toolsetLibraryDiscovery.test.ts`
- `mobile/docs/superpowers/research/2026-07-28-p0-generated-library-discovery-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-generated-library-discovery-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-generated-library-discovery-ledger.md`

Modify:

- `mobile/src/lib/tools/toolset.ts`
- `mobile/src/lib/tools/readTools.ts`
- `mobile/tests/unit/tools/readTools.test.ts`
- `mobile/tests/unit/chat/chatController.test.ts`

Delete: none.

## Public contracts and compatibility

Extended stable tool input:

- `library_search.offset: integer >= 0`, default `0`;
- `library_search.limit` maximum increases from `10` to `20`.

Additive result/evidence facts:

- origin on each result;
- positive `matched_total`;
- returned count and current offset;
- `next_offset` when more results exist.

No exported TypeScript class/function, tool name, Vault schema, setting,
permission default, provider wire adapter, or UI hook is removed or renamed.

## RED

Named regressions:

- `toolsetLibraryDiscovery.test.ts::finds and reads a generated document while excluding withdrawn and unavailable rows`
- `readTools.test.ts::does not return score-zero Library rows as matches`
- `readTools.test.ts::reports a bounded page and a deterministic next offset`
- `chatController.test.ts::finds a generated PDF from a typoed natural-language Library request without inventing uploaded matches`

Expected RED:

- the generated `ds4` row is absent from `library_search`;
- unrelated uploaded images are returned despite score zero;
- `offset` is rejected by the current Zod schema;
- the realistic controller round receives no generated id to read.

RED command:

```powershell
npm run test:unit -- tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/tools/readTools.test.ts tests/unit/chat/chatController.test.ts
```

## GREEN

- replace the explicit tool's uploaded-only predicate with available +
  `isTalosLibraryFileShared`, retaining both origins;
- preserve the uploaded-only ambient-injection predicate;
- filter positive search scores before paging;
- expose bounded offset pagination, origin, totals, and continuation facts;
- exercise search then read through a real Anthropic tool round and the
  executor's untrusted-result boundary.

Focused GREEN command is the RED command above.

## Affected regression gates

```powershell
npm run test:unit -- tests/unit/tools/toolsetLibraryDiscovery.test.ts tests/unit/tools/readTools.test.ts tests/unit/tools/toolExecutor.test.ts tests/unit/tools/agentLoop.test.ts tests/unit/tools/agentLoopConcurrency.test.ts tests/unit/tools/libraryExportTools.test.ts tests/unit/lib/libraryContext.test.ts tests/unit/chat/chatController.test.ts tests/unit/chat/anthropicClient.test.ts
npm run typecheck
git diff --check
```

Final program gates remain the complete mobile unit suite, affected Playwright
journeys, Android unit/build tasks under the repository JDK 21 pin, production
APK build, checksum, and Desktop copy.

## Real path and human-visible proof

Automated integration must cover:

1. a global Vault containing unrelated uploaded images, one generated `ds4`
   PDF, one withdrawn generated file, and one unavailable file;
2. the natural-language request with realistic typo:
   `cerca ancora il pdf ds4 nella libreria`;
3. provider `library_search`, then `library_read`, then a grounded answer;
4. tool evidence naming only the generated PDF id;
5. executor-delivered content marked `TALOS_TOOL_RESULT (untrusted data...)`.

Owner APK acceptance:

1. create a PDF from chat and verify it appears in the global Library;
2. start another chat and ask to find it by a distinctive filename term;
3. confirm TALOS names the existing generated file and does not list unrelated
   images;
4. ask it to read/summarize the same file;
5. disable sharing for that file and confirm the chat can no longer find/read
   it;
6. re-enable sharing, reload, and repeat.

## Rollback

Rollback removes the offset/result metadata and restores the explicit tool
predicate. No persisted data or migration is involved. Restoring the old
uploaded-only predicate intentionally restores the documented defect, so the
new regression tests are the rollback alarm.

## Upstream pin and decision

- Adapt OpenAI's documented uploaded/generated unified Library behavior.
- Adapt the bounded-page plus continuation semantics documented by the current
  Google and OpenAI file-list APIs.
- Retain the existing Zod/tool/executor implementation and dependency pins.
- Apply OWASP's separation, least-privilege, and untrusted-output guidance at
  the existing executor boundary.
- Reject automatic generated-file injection and unbounded result dumps.

## Closure evidence

RED captured on 2026-07-28:

- 4/44 named tests failed while 40 adjacent tests remained green;
- the real controller payload returned exactly the four unrelated
  `uploaded-photo-*` rows and omitted `vault-ds4`;
- the pure read tool returned both unrelated fixture documents for a zero-score
  `ds4` query;
- the generated-only toolset fixture returned `uploaded-photo` and omitted the
  generated PDF;
- the offset contract and result-count disclosure were absent.

Fresh GREEN:

- focused toolset/read/controller matrix: 3 files, 44/44 tests;
- affected executor/agent/export/context/controller/client matrix: 9 files,
  99/99 tests;
- provider schema/wire/Anthropic/Gemini/Ollama streaming matrix: 5 files,
  44/44 tests;
- `npm run typecheck`: passed;
- scoped `git diff --check`: passed (line-ending notice only).

The integration proof confirms all of the following in one realistic tool
journey: the generated PDF is the only positive match, unrelated uploads are
absent, the generated body is readable, both tool activities succeed with
grounded evidence, tool content carries the untrusted-data boundary, and the
same generated row is still absent from automatic ambient context.

No commit was created. Physical-device owner acceptance remains part of the
final APK checklist and does not authorize a Claude ACK ticket.
