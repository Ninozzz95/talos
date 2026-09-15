# Desktop Harness black-box hotfix — 2026-09-15

Base: `80149f1ebe6a1d4c8716e222700c3e3a5e0492d6` (`main`). Scope: desktop Harness UI only. The benchmark kernel (`src/kernel/talosHarness.mjs`) remains byte-identical; desktop launchers select `talosHarness.desktop-hotfix.mjs`, which re-exports the same contract and adapts only the measured boundaries below.

## Findings covered

| Finding | Hotfix |
|---|---|
| T-01 / T-02 search false-negative under scan limits | Incomplete `cerca` results are prefixed as partial and cannot state that absence was established. |
| T-03 8k tool-result truncation | Desktop always supplies a context-hook boundary; the kernel therefore keeps the full tool result. When Context Engine is off, the adapter preserves periodic legacy compaction itself and accounts for its usage. |
| T-04 intermittent stall with weak attribution | A bounded inactivity diagnostic records the last stage (`provider-*`, `tool:*`, output/result gap). Existing provider/tool timeouts remain authoritative. |
| T-05 stdout/stderr ambiguity | Shell results explicitly state that stdout/stderr are combined in arrival order and stream identity is unavailable. |
| T-06 PowerShell diagnostic with exit 0 | Structured PowerShell error diagnostics on an `exit 0` result are marked `NOT VERIFIED`. |
| T-07 `npm test` where no suite exists | Before the default `npm test`, the adapter checks `package.json`; absent/placeholder `scripts.test` becomes an explicit `NO_TEST_SUITE_CONFIGURED` result with exit 2. Explicit non-default test commands are untouched. |
| T-08 `elenca` file vs missing folder | The adapter classifies the requested workspace path and tells the model whether it is a file or is missing. |
| T-09 reflection text appended to a tool result | The desktop context-hook boundary makes the kernel emit the reflection checkpoint as a separate `user` message. |

## Findings already fixed on `main`

- **T-11**: generated documents use `cartellaCreazioni` (the session's original chosen folder), not a drive root reached through Full access. Covered by `tests/documento-non-finisce-nella-radice.test.mjs`.
- **T-12**: Tool Forge already validates `flow.maxTransitions` with a precise diagnostic in `validaManifestForge`.

## External action required

**T-10 is not a repository patch.** Rotate the `KADMOS_API_KEY` found by the black-box run and remove the old value from the Windows profile/environment source that persisted it. Do not copy the old value into an issue, PR, test fixture, log, or commit. After rotation, restart the desktop process so inherited environment blocks cannot retain the old credential.

## Verification

The added regression suite is `tests/desktop-blackbox-hotfix.test.mjs`. The repository gate remains:

```powershell
npm --prefix harness-ui run verify:all
```

The hotfix is activated by the Electron launcher, the double-click browser launcher, and `aggiorna-4174.ps1`. An explicit `TALOS_OWNER_RUNTIME_MODULE` always wins, so custom owner-runtime development is not overridden.
