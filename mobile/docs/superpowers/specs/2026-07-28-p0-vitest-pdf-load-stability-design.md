# P0 — Vitest PDF load stability design

Date: 2026-07-28  
Status: approved under the owner's serial P-series and no-regression mandate.

## Contract

- `npm run test:unit` must be the reliable complete mobile unit gate.
- Every individual test retains Vitest's 5-second default.
- Test files retain isolation and may still run in parallel.
- At most four file workers may contend for CPU/memory.
- PDF generation, verification, parsing, schemas, fixtures, and production
  timeouts remain unchanged.

## Public/config symbols

No product symbol changes.

Configuration:

- `vitest.config.ts::test.maxWorkers = 4`

## RED

```text
npm run test:unit
4 PDF integration tests timed out at 5,000 ms under full host load
the same four files passed 31/31 in 3.09 s
```

## GREEN

```powershell
npm run test:unit
```

Acceptance requires the complete suite to pass through the default repository
command; a focused rerun alone cannot close this infrastructure slice.

