# Execution ledger - R7 first-bubble memory disclosure

Date: 2026-07-29
Subsystem: TALOS UI / chat memory disclosure
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED - automated gates green; physical Android acceptance pending
Commit policy: no commit without fresh owner authorization
Upstream pins: OpenAI Memory FAQ, Claude Memory Help, Gemini Apps Help and
W3C WCAG 2.2 SC 3.2.4 inspected 2026-07-29

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-memory-disclosure-first-bubble-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-memory-disclosure-first-bubble-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-memory-disclosure-first-bubble-ledger.md`

Modify:

- `mobile/src/components/chat/TalosMobileMessageList.vue`
- `mobile/tests/unit/chat/TalosMobileMessageList.test.ts`
- `mobile/tests/e2e/mobile-f4-regressions.e2e.spec.ts`
- `mobile/docs/upstream-provenance.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

Delete:

- none

## Public symbols and compatibility

- Add no exported class, function, component prop, event, route, schema,
  translation key, setting or persistence field.
- Add internal computed `firstMemoryDisclosureMessageId`.
- Add internal predicate `hasMemoryDisclosure`.
- Preserve `TalosMobileMessageList`, `talos-used-memories`, all localized
  labels, `used_memories` metadata, controller injection, repository ordering
  and keyset pagination.

## Baseline

Fresh 2026-07-29:

```text
3 files passed
33 tests passed
```

The message template currently renders one pill for every message with a
non-empty `used_memories` array.

## RED and expected failure

Add permanent scenarios first:

- `MEMORY-PILL-01`: two memory-bearing user turns render exactly one pill on
  the first relevant message while both metadata arrays remain intact;
- `MEMORY-PILL-02`: prepending an older memory-bearing message keeps one pill
  and moves it to the newly earliest relevant message;
- `MEMORY-PILL-03`: no non-empty array means no disclosure;
- `MEMORY-PILL-E2E-01`: two natural-language sends both contain
  `TALOS_MEMORY_CONTEXT`, the thread and its reload contain one pill, and a
  send after disabling memory contains no injected block.

Expected pre-fix failure: `MEMORY-PILL-01`, `MEMORY-PILL-02` and the multi-turn
browser assertion observe two or three pills because the template evaluates
each row independently.

Fresh RED evidence, 2026-07-29:

```text
1 file failed
2 tests failed, 8 passed
MEMORY-PILL-01: expected 1 pill, received 2
MEMORY-PILL-02: expected 1 pill, received 2
```

`MEMORY-PILL-03` and all seven pre-existing tests passed, isolating the defect
to repeated presentation rather than malformed-provenance handling or adjacent
message behavior.

## Focused GREEN and affected gates

```powershell
npx vitest run tests/unit/chat/TalosMobileMessageList.test.ts tests/unit/chat/TalosMobileMessageList.calm.test.ts
npx vitest run tests/unit/chat/memoryContext.test.ts tests/unit/chat/chatController.test.ts tests/unit/chat/chatStore.test.ts
npm run build
npx playwright test tests/e2e/mobile-f4-regressions.e2e.spec.ts --grep "Memory station"
npm run typecheck
git diff --check
```

## GREEN evidence

Fresh 2026-07-29 results:

- message-list focused and calm-thread unit suites: 2 files, 16/16 tests
  passed;
- memory context, controller and paginated chat-store regressions: 3 files,
  69/69 tests passed on the confirming run;
- one unrelated consent timing assertion failed once in the first concurrent
  run, then passed alone and again inside the complete 69-test gate; no
  production path or assertion was weakened;
- exact multi-turn Memory browser journey: 1/1 passed, proving two provider
  payloads retained memory, the rendered and reloaded thread retained one pill,
  and the disabled third turn had no memory block;
- complete F4 regression browser suite: 9/9 passed;
- `npm run typecheck`: passed;
- `npm run build`: passed, including parity verification; initial JavaScript
  remained inside budget at 557,822 / 560,000 bytes;
- `git diff --check`: passed, with line-ending notices only.

`firstMemoryDisclosureMessageId` is computed once from the chronological
materialized window. Later message metadata remains byte-for-byte referenced
by the original fixture arrays, and prepending an older page relocates the
single pill without duplication.

## Real-upstream and human-visible proof

No live provider is required: the E2E route captures the real Gemini adapter
payload at the network boundary while responding locally and the repository
persists/reloads the actual chat data.

On the final Android APK, create one active memory, send two prompts in the
same chat, confirm the memory pill appears only on the first relevant user
bubble, close/reopen the chat, and confirm one pill remains. Disable memory and
confirm the next send adds no new disclosure.

Manual proof remains required before the Claude ACK ticket.

## Rollback

Restore only the component, two test files, provenance/plan entries and three
slice documents listed above. No message, memory or setting migration is
needed.
