# Execution ledger - P1 persisted reasoning row and drawer

- Subsystem: TALOS mobile chat persistence/view/export integration
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pins:
  - Claude Platform extended-thinking documentation, inspected 2026-07-28
  - Gemini thinking documentation, inspected 2026-07-28
  - WAI-ARIA APG modal dialog pattern, inspected 2026-07-28
  - WAI-ARIA 1.2 and WCAG 2.2
- Upstream decision: adopt only provider-returned readable thinking text;
  adapt it behind one AVM-owned typed projection; reuse the existing modal
  primitives; reject reconstruction and new UI packages.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p1-persisted-reasoning-row-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p1-persisted-reasoning-row-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p1-persisted-reasoning-row-ledger.md`
- `mobile/src/lib/chat/messageReasoning.ts`
- `mobile/tests/unit/chat/messageReasoning.test.ts`

Modify:

- `mobile/src/components/chat/mobileChatTypes.ts`
- `mobile/src/components/chat/TalosMobileMessageList.vue`
- `mobile/src/stores/chat.ts`
- `mobile/src/lib/chat/sessionExport.ts`
- `mobile/tests/unit/chat/TalosMobileMessageList.test.ts`
- `mobile/tests/unit/chat/chatStoreStreaming.test.ts`
- `mobile/tests/unit/chat/sessionExport.test.ts`
- `mobile/tests/e2e/mobile-f4-regressions.e2e.spec.ts`

Delete: none.

## Public symbols and compatibility

Create:

- `talosMessageReasoning(metadata)`

Extend:

- `TalosMobileMessageView.reasoning`

Stable:

- provider adapter contracts and wire formats
- `TalosLocalChatMessage.metadata`
- SQLite schema
- `buildTalosMobileMarkdownExport(...)`
- `TalosMobileReasoningBlock`
- `TalosMobileTraceRow`
- `TalosMobileComposerSheet`

## Named RED and characterization scenarios

- `REASONING-ROW-01 canonical metadata extraction`
  - Expected RED: the canonical module does not exist.
- `REASONING-ROW-02 store exposes persisted reasoning as a typed view value`
  - Expected RED: `assistant.reasoning` is undefined.
- `REASONING-ROW-03 completed assistant row opens exact plain-text drawer`
  - Expected RED: a fixture with typed reasoning and empty metadata renders no
    row because the component still reads the metadata bag.
- `REASONING-ROW-04 no row for empty or non-assistant reasoning`
  - Expected RED/characterization: role restriction is not explicit.
- `REASONING-ROW-05 export and view use one canonical acceptance rule`
  - Expected RED: export still owns a duplicate direct metadata check.
- `REASONING-ROW-06 realistic Gemini thought survives completion and reload`
  - Characterization gate: the final UI row and drawer must work before and
    after a browser reload.

## RED commands

Focused:

`npx vitest run tests/unit/chat/messageReasoning.test.ts tests/unit/chat/TalosMobileMessageList.test.ts tests/unit/chat/chatStoreStreaming.test.ts tests/unit/chat/sessionExport.test.ts`

Human-visible:

`npx playwright test tests/e2e/mobile-f4-regressions.e2e.spec.ts --grep "reasoning row"`

## GREEN and regression gates

- Repeat both focused commands.
- Run existing reasoning/provider suites:
  - `tests/unit/chat/reasoningDrawer.test.ts`
  - `tests/unit/chat/reasoningCapture.test.ts`
  - `tests/unit/chat/streamComplete.test.ts`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

At final pre-APK closure, rerun the controlled full unit suite and the complete
affected chat E2E journeys.

## Real-upstream and human proof

The provider wire behavior is covered using real adapter fixtures for Anthropic,
Gemini, DeepSeek/OpenAI-compatible, and Ollama. No paid provider call is needed
for this renderer fix.

The final APK checklist uses a model/turn that returns visible reasoning,
confirms the muted row above the answer, opens the drawer, closes it with system
Back, reloads/reopens the chat, repeats the check, and verifies the same text is
present in the Markdown export.

## Closure record

RED established on 2026-07-28.

- The focused store/list run kept 12 existing scenarios green and failed only
  the three new assertions:
  - the newly appended assistant view had `reasoning === undefined`;
  - the reloaded assistant view had `reasoning === undefined`;
  - a completed-message fixture with typed reasoning and empty metadata had no
    reasoning row.
- The canonical extractor test failed at import because
  `@/lib/chat/messageReasoning` did not exist.

Implementation completed on 2026-07-28.

## GREEN evidence

- Focused projection/render/export gate:
  - 4 files passed; 31/31 tests passed.
- Affected provider/reasoning regression gate:
  - 7 files passed; 56/56 tests passed.
  - Includes Anthropic, Gemini, DeepSeek/OpenAI-compatible, and Ollama
    reasoning fixtures, stream separation, persisted reload, drawer semantics,
    and export.
- Human-visible Playwright gate:
  - the realistic Gemini thought-summary journey passed in 10.4 seconds;
  - the muted row appeared on the completed assistant message;
  - the drawer contained the exact multiline summary as plain text;
  - the answer did not contain the summary;
  - the row/drawer survived browser reload;
  - the Markdown export contained the same reasoning text.
- Fresh `npm run typecheck`: passed.
- Fresh `npm run build`: passed.
  - 3,205 modules transformed.
  - Initial JavaScript: 554,461 / 560,000 bytes.
  - Initial CSS: 129,159 / 150,000 bytes.
  - Parity verifier: 9/9 script tests passed and ledger valid.
- Full working-tree `git diff --check`: exit 0.

Automated status: **CLOSED**.

The physical Android row/drawer/reopen/export comparison remains in the final
owner checklist. No schema migration, provider write, or commit was performed.
