# Desktop ledger — recovered execution checkpoint

This is the execution record of the approved frontend ledger, not a replacement plan. The required final deliverable remains the actual complete TALOS application ZIP with the agreed refactor applied. No component showcase or source-only package closes that requirement.

## Source continuity

- Approved baseline: `13f65c15cdeaf8986b882993a0773cdeafb867d2`.
- Active implementation branch: `refactor/desktop-ledger-2026-09-17`, draft PR #27.
- The separate earlier branch `refactor/desktop-ledger-v1` is preserved. It has not been force-overwritten or declared merged.
- Recovered source checkpoint: `8c6a076933405332bb6624c55ef4c15dafb8991c`.
- Contextual navigation source: `5ee1c012ee19824a72de8f7cf03001186e897b63`; actual toolbar entry correction: `08878fa2616205069e2d8fce35f77582bc4eeb20`; query pointer ownership: `7bf50a3474e471c7b9241627c1d03451b4f32dca`.
- Concurrent changes to the legacy contract test were preserved. Only the explicitly retired D21 wizard contract was withdrawn; the historical snapshot remains unchanged and is still asserted.

## Applied product scope

| Ledger area | Applied implementation | Closure limit |
|---|---|---|
| BOOT-02 / BOOT-03 | Real Home, no automatic/manual first-run wizard, deterministic startup policy and normal model/workspace access | Full startup acceptance must remain tied to actual source/test receipts |
| NAV-01 / NAV-03 | Workspace toolbar, density, four layout presets and real destination navigation | Not a completed freely dockable/multi-window layout system |
| CORE-01 / CORE-02 / CORE-04 | Incremental strict types, shared lifecycle/request handling and canonical preferences | Remaining legacy state/rendering has not all been extracted |
| DS-04 | Shared modal focus/inert stack, nested closure and restoration | Full assistive-technology audit and all overlays are not yet closed |
| NAV-02 | Thirty real contextual commands, typed registry, actual palette, aliases, disabled reasons, IME and terminal-aware input | User-editable keybinding and conflict UI remains open |
| SET-03 | English coverage for new workspace and command strings | Global localization of every pre-existing surface remains open |
| ISOL-01 / REL-01 | Baked preview identity, separate browser/data/keyring scope, no automatic stable-key import; exact-source Windows ZIP pipeline | Only an uploaded, successfully smoke-tested package counts as verified |

## Recovered and new evidence

The runner qualification against `08878fa2616205069e2d8fce35f77582bc4eeb20` completed with **63 assertions**, 14 real destination checks, real PTY execution, nested dialog restoration, empty/disabled commands, keyboard and English switching, and Home viewports from 320 to 1920 CSS pixels. No application API was mocked. No uncaught page errors were observed. Eight console warning/error entries were retained; this is not a warning-free claim. Automated A/AA scans were limited to the new Home and command surface; they do not certify the entire app.

The next query-pointer correction is separately asserted in `tests/qualification/workspace-real.mjs`. Typecheck, production build and **126 targeted tests** pass locally on the recovered locked Node 24.18.0 toolchain. The complete frontend unit suite on the runner passed **1,164 tests with one skip** for the previous exact source. Results must not be copied onto later commits without rerunning.

Local Chromium refuses localhost navigation by environment policy. That restriction was not bypassed. Product journeys run on GitHub's Linux browser runner, followed by Windows application verification. Screenshots are of the actual built frontend. Images taken before an entry transition finishes are not proof of settled opacity; the next capture waits for the real transition to finish.

## Exact qualification and packaging

`desktop-ledger-preview.yml` receives an explicit source SHA, checks out that SHA on both platforms, and verifies production bundle hashes before and after packaging. The Linux unit and journey steps preserve their logs independently, but their final outcome gate is mandatory. A red journey cannot produce a Windows delivery. Windows gates include server, kernel, kernel identity, frontend, pure desktop and actual Electron tests before packaging.

The preview packager uses the existing original runtime and dependencies; its baked identity is `TALOS Preview`. `ledger-preview-smoke.mjs` opens the packaged executable, verifies authentication and renderer protection, actual terminal output, real preference persistence, coexisting normal/preview shells and isolated browser state. Keyring checks use unique synthetic sentinel services, not personal credentials.

No paid model calls, stable-profile migration, merge, tag or release have been performed as part of this recovery. Credentials and GGUF models are not bundled. The ZIP remains an executable progress build until the remaining approved ledger and second audit are closed.

## Still open — do not replace with an inflated completion count

The full component/state matrix; transcript/composer/delegation/context redesign; richer review/browser/document/model surfaces; all themes and languages; custom keybinding conflicts; manual screen reader/zoom coverage; model-backed journeys with an explicitly authorized budget; performance measurements on the user's hardware; removal of all replaced legacy owners; final polish and the second whole-product audit.

Continue from the branch's real source and commit-specific evidence. Never reconstruct the project from screenshots, never rerun a historical patch against moved sources, and never overwrite concurrent changes. The fixed-path patch transport scripts validate complete pre/post hashes and commit ordinary readable source diffs. They are records of one applied change, not runtime modules.
