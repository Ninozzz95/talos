# Execution ledger - P2-A tool-label Unicode integrity

- Subsystem: TALOS mobile tool activity presentation
- Lane: `C:/Users/ninox/Desktop/AVM-lanes/kimi`
- Branch: `lane/kimi-mobile`
- Baseline HEAD: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`
- Commit: forbidden without fresh explicit owner authorization
- Upstream pin: Unicode Standard 17.0 Chapter 6, inspected 2026-07-28
- Upstream decision: adopt literal `U+2026` directly.

## Exact file ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p2-tool-label-unicode-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p2-tool-label-unicode-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p2-tool-label-unicode-ledger.md`

Modify:

- `mobile/src/lib/tools/toolLabels.ts`
- `mobile/tests/unit/tools/toolLabels.test.ts`

Delete: none.

## Symbols and compatibility

Stable:

- `TALOS_TOOL_LABELS`
- `TALOS_TOOL_ICONS`
- `TalosToolActivity`
- `talosToolIconName`
- `talosToolActivityLabel`
- `talosToolActivityDetail`

No public symbol, schema, persistence, or transport change.

## Named RED scenario

- `TOOL-LABEL-UNICODE-01 long library export uses one canonical ellipsis`

Expected RED: the result ends with `U+00E2 U+20AC U+00A6`, not `U+2026`.

## RED/GREEN commands

`npx vitest run tests/unit/tools/toolLabels.test.ts`

Then:

`npm run typecheck`

`git diff --check -- mobile/src/lib/tools/toolLabels.ts mobile/tests/unit/tools/toolLabels.test.ts mobile/docs/superpowers/research/2026-07-28-p2-tool-label-unicode-research.md mobile/docs/superpowers/specs/2026-07-28-p2-tool-label-unicode-design.md mobile/docs/superpowers/ledgers/2026-07-28-p2-tool-label-unicode-ledger.md`

Final pre-APK closure repeats the complete unit/build/E2E gates.

## Human proof

Trigger a natural-language device-save request with a long filename and confirm
the running tool row ends in one clean ellipsis.

## Rollback

Restore only the exact suffix literal and its regression test.

## Closure record

P1-C1, P1-C2, and P1-C3 are CLOSED.

Status: RED TEST AUTHORIZED. Product implementation has not begun.

RED established on 2026-07-28:

- focused Vitest: 1 expected failure, 12 compatibility tests passed;
- expected and received strings had the same 48-unit prefix;
- the only difference was `U+2026` versus
  `U+00E2 U+20AC U+00A6`.

Status: RED. One-literal product implementation may begin.

GREEN evidence on 2026-07-28:

- focused tool-label Vitest: 13/13 tests passed;
- `npm run typecheck`: passed;
- scoped `git diff --check`: passed (line-ending notices only);
- a direct UTF-8 code-point probe now finds `U+2026` in the export branch and
  no mojibake suffix.

Status: CLOSED. P2-B may begin.
