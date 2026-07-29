# P0 — Vitest PDF load stability ledger

Date: 2026-07-28  
Subsystem: verification infrastructure  
Lane: `lane/kimi-mobile`  
Status: CLOSED — default complete command is green  
Commit policy: no commit without fresh owner authorization

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-28-p0-vitest-pdf-load-stability-research.md`
- `mobile/docs/superpowers/specs/2026-07-28-p0-vitest-pdf-load-stability-design.md`
- `mobile/docs/superpowers/ledgers/2026-07-28-p0-vitest-pdf-load-stability-ledger.md`

Modify:

- `mobile/vitest.config.ts`

Delete:

- none

No PDF implementation, fixture, package, or test timeout file is owned.

## RED evidence

Default command:

```text
npm run test:unit
248 files
4 PDF tests timed out at the fixed 5-second ceiling
```

Isolation:

```text
reportSpec.test.ts alone: 9/9 passed
four affected PDF files together: 31/31 passed, tests 3.09 s
```

Historical same-host control already recorded in the storage ledger:

```text
npm run test:unit -- --maxWorkers=4
237 files passed, 2 skipped; 1,985 passed, 5 skipped
```

## Upstream dossier and pin

- `vitest@4.1.10`, MIT.
- Research:
  `mobile/docs/superpowers/research/2026-07-28-p0-vitest-pdf-load-stability-research.md`
- Decision: direct use of supported `test.maxWorkers`, pinned to 4 by measured
  repository evidence.

## GREEN

```powershell
npm run test:unit
npm run typecheck
git diff --check
```

The first command must pass without an extra CLI option; otherwise the
recurrence remains unfixed.

## Fresh closure evidence

```text
npm run test:unit
Test Files  246 passed | 2 skipped (248)
Tests       2053 passed | 5 skipped (2058)
Duration    239.47 s
Exit        0
```

The four jsdom `HTMLCanvasElement.getContext()` notices remained non-fatal.
They do not replace or weaken the passing real PDF generation, verification,
and Library read-back assertions.

## Human-visible proof

None: this slice changes only automated resource governance. The generated PDF
and Library read-back paths remain covered by the real-byte unit tests and the
later owner APK checklist.

## Rollback

Remove the one `maxWorkers` config entry and the three task documents. No data
or product state rollback exists.
