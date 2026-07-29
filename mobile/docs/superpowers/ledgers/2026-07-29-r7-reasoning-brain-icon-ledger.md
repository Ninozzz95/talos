# Execution ledger - R7 Reasoning row Brain icon

Date: 2026-07-29
Subsystem: TALOS UI / chat reasoning disclosure
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
Status: CLOSED - automated gates green; physical Android acceptance pending
Commit policy: no commit without fresh owner authorization
Upstream pin: `@lucide/vue@1.25.0`, ISC,
`sha512-hkEetV+v48ScIn3uwqwWQ66sI8foeP2q6OMI09GzLFH4SfvBlfe3JHYlMBdBCqFC7WRlhFsndyDn/awRKRc2OQ==`

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-reasoning-brain-icon-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-reasoning-brain-icon-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-reasoning-brain-icon-ledger.md`

Modify:

- `mobile/src/components/chat/TalosMobileReasoningBlock.vue`
- `mobile/tests/unit/chat/reasoningDrawer.test.ts`
- `mobile/tests/e2e/mobile-f4-regressions.e2e.spec.ts`
- `mobile/docs/upstream-provenance.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

Delete:

- none

## Public symbols and compatibility

- Replace only the local imported/rendered component `Sparkles` with `Brain`.
- Add no public class, function, method, interface, schema, migration,
  translation key, route, setting, event or dependency.
- Preserve `TalosMobileReasoningBlock` props (`reasoning`, `live`), the
  `talos-reasoning-toggle` and `talos-reasoning-drawer` test contracts,
  localized labels, elapsed detail, bottom drawer, trace projection,
  persistence and export.
- Preserve the `TalosMobileTraceRow` icon wrapper's `aria-hidden="true"`
  semantics and every existing row action/state.

## RED and expected failure

Add these permanent assertions before editing product code:

- `REASONING-ICON-01`: a non-empty completed row renders exactly one
  `svg.lucide-brain` and zero `svg.lucide-sparkles`;
- `REASONING-ICON-02`: the icon's immediate wrapper remains decorative via
  `aria-hidden="true"`;
- `REASONING-ICON-03`: live and reloaded rows keep Brain without changing
  their state, drawer or persistence behavior;
- `REASONING-ICON-E2E-01`: the real composer/provider/persistence/export
  journey sees Brain before and after reload and never Sparkles.

Expected pre-fix failure: `lucide-brain` count is zero and
`lucide-sparkles` count is one, while all pre-existing behavior tests remain
green.

Fresh RED evidence, 2026-07-29:

```text
1 file failed
1 test failed, 7 skipped
REASONING-ICON-01: expected one svg.lucide-brain, received zero
```

The failure occurs at the first semantic-glyph assertion. It does not implicate
the existing row action, drawer, live label, empty-state or touch-target
contracts.

## Focused GREEN and affected gates

```powershell
npx vitest run tests/unit/chat/reasoningDrawer.test.ts -t "REASONING-ICON"
npx vitest run tests/unit/chat/reasoningDrawer.test.ts tests/unit/chat/TalosMobileMessageList.test.ts tests/unit/chat/messageReasoning.test.ts tests/unit/chat/reasoningCapture.test.ts tests/unit/chat/chatStoreStreaming.test.ts tests/unit/chat/sessionExport.test.ts
npm run typecheck
npm run build
npx playwright test tests/e2e/mobile-f4-regressions.e2e.spec.ts --grep "persisted reasoning row"
git diff --check
```

## Real-upstream and human-visible proof

The browser test uses the real composer, Gemini-compatible adapter, reasoning
part parsing, encrypted chat persistence, message projection, drawer and export
surface. Only the external provider response is deterministically routed.

On the final Android APK, send a prompt to a reasoning-capable model, observe
one Brain icon on the muted Reasoning row during and after completion, open and
close the drawer, restart the app and repeat. Confirm Sparkles never appears
on this row and the stored reasoning/export remains unchanged.

Manual physical-device proof remains required before the Claude ACK ticket.

## GREEN evidence

Fresh 2026-07-29 results:

- focused semantic-icon RED-to-GREEN gate: 1/1 passed in both completed and
  live states; seven unrelated component scenarios skipped by name;
- complete affected reasoning/message/persistence/export unit matrix: 6 files,
  48/48 tests passed;
- `npm run typecheck`: passed;
- `npm run build`: passed, including parity validation; initial JavaScript is
  558,641 / 560,000 bytes and initial CSS is 133,268 / 150,000 bytes;
- real `REASONING-ICON-E2E-01` journey: 1/1 passed in 11.3 seconds, proving the
  real composer, Gemini-compatible thought part, persistence, Brain before and
  after reload, Sparkles absence, drawer and Markdown export;
- scoped `git diff --check` plus new-document trailing-whitespace scan: passed.

Only the imported/rendered icon changed in product code. Labels, timing,
touch-target geometry, disclosure interaction, trace content, message storage
and export remain on their existing contracts.

## Rollback

Restore only the exact files listed above. No persistence, database, native
resource, package or lockfile rollback is required.
