# NAV-02 / SET-03 — registry and real command navigation

Continuation of the approved Desktop ledger, not a new plan or showcase. Source bases are recorded by pre/post SHA-256 per path in the transport payload. Unrelated concurrent changes remain untouched. The original branch `refactor/desktop-ledger-v1` is preserved, not overwritten or silently declared merged.

## Product changes

- Typed registry of 30 real commands. Search covers sections, configuration and session operations, Italian/English aliases and accents. Unavailable actions remain discoverable with a reason and are checked again at activation.
- Shared palette renderer is imported by the actual production entry. One owner for filtering, option selection and IME handling; shared modal manager retains Escape, focus return and stacked inert leases. No duplicate legacy filtering handlers.
- Export/fork on an unconfigured standalone session no longer produce simulated results. Sharing opens the existing real export chooser, not a fabricated transcript.
- Real Home, presets and new command metadata have English translations. Workspace observes the language event on its actual emitter (document root, not a non-bubbling window listener).
- Global command shortcut does not steal consumed keyboard events, IME confirmation or xterm input.

## Local evidence

Node 24.18.0 and the project's original lock files: production build succeeds, strict refactor typecheck succeeds, 126 focused regressions pass. 32 tests in the command/shortcut subset pass. These counts do not mean all 57 ledger lots are finished.

The local Chromium policy blocks localhost navigation; no policy is bypassed and no offline fixture is passed off as the product. Real-server tests are included for runner execution: actual palette, context gating, no fake downloads, IME confirmation, empty search, focus return, 390px reflow, automatic accessibility, English language switching, terminal shortcut ownership, plus the recovered Home/navigation/modal/PTY journeys. Their result must be read from CI, not assumed.

## Still open

NAV-02 custom key remapping/conflict editor; global theme/language qualification, every component's states, screen reader/manual checks, the full remaining ledger and final second audit. No paid model inference, merge, tag or release authorized by this changeset.

## Transport

`changes-1.b64` through `changes-4.b64` are the ordered parts of a Brotli-compressed JSON containing a unified source patch and exact pre/post checksums. `apply.mjs` never evaluates its text: it validates a fixed 12-file allowlist, clean worktree, source hashes and all output hashes. It refuses stale sources rather than overwriting concurrent work. The CI commit contains ordinary source changes. Do not reapply after any subsequent source changes.

Reference: W3C WAI-ARIA APG Combobox, https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ (consulted 17 September 2026). DOM focus stays in the input, active option is linked with aria-activedescendant, text-editing keys remain native. Automated checks do not certify global accessibility.
