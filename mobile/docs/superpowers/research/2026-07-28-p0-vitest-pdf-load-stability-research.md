# P0 — Vitest PDF load stability research

Date: 2026-07-28  
Subsystem: mobile verification infrastructure  
Lane: `lane/kimi-mobile`

## Reproduction and root cause

The default complete unit command ran 248 files on a 72-logical-processor host.
Four real PDF integration tests exceeded Vitest's generic 5-second timeout,
finishing around 7–8 seconds while the host was saturated.

The identical four files then passed together:

```text
4 files | 31 tests passed
test time 3.09 s
```

This is not a PDF product regression. It is an unbounded file-worker
configuration making a per-test wall clock depend on unrelated concurrent
files. The same class had already been observed earlier in the current program:
`npm run test:unit -- --maxWorkers=4` passed the complete suite, but that
controlled runner setting was never persisted and the failure recurred.

The `HTMLCanvasElement.getContext()` jsdom notices are not the failure: the
focused real generator, verifier, and Library re-analysis paths all pass without
installing or invoking a replacement canvas implementation.

## Current official upstream evidence

Pin: `vitest@4.1.10`, MIT.

- Test timeout:
  https://vitest.dev/config/testtimeout.html
  The Node default is 5,000 ms.
- File parallelism:
  https://v4.vitest.dev/guide/parallelism
  Vitest runs files across workers by default; `maxWorkers` controls concurrent
  workers, and more workers consume more CPU and memory.
- Performance guidance:
  https://vitest.dev/guide/improving-performance
  Vitest documents limiting or disabling file parallelism where host/resource
  contention makes parallel execution counterproductive.

## Upstream decision

**Adopt Vitest's supported `maxWorkers` option directly.**

- Keep the meaningful 5-second default timeout.
- Keep file isolation and parallelism.
- Cap file workers at 4, the setting already proven green on this exact suite.
- Do not add retries, globally weaken timeouts, install `canvas`, or change PDF
  product code.

This is a runner resource-governance fix, not a test suppression.

## Rollback

Remove only `maxWorkers: 4` from `vitest.config.ts`. Rollback would restore the
known host-dependent default-suite failure and is not safe without a different
measured concurrency policy.

