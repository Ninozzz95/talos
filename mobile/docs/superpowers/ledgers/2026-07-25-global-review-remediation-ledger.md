# Ledger — global review + remediation (2026-07-25)

Commits: `dc2d139` (round 1) · `58068f4` (round 2) · this ledger closes the record.
Gates at close: tsc 0 · unit 1442 · e2e 63 · build 504.8k/512k.

## Why this ledger exists

A coherence audit found that the two most consequential commits in the lane —
they reversed a security default, fixed a ReDoS on the streaming path, and proved
that *three headline claims of the previous commit were false in the shipped
code* — existed **only as commit messages**. That is the exact debt this file
removes.

## What was reviewed

Four adversarial reviewers ran over the whole app on separate axes (architecture,
security/privacy, test quality, product/UX/perf), each required to verify every
claim against the code. Two re-reviews then audited the remediation itself.

## DECISIONS OF RECORD

### D1 — Library context and generated-file autosave are OPT-IN (reversal)

Previously `library_context_enabled` shipped **ON**, with a migration that
force-enabled it for existing installs, and `library_autosave_generated` shipped
**ON**. Both are now **false** by default and no migration turns them on
(`src/stores/settings.ts`).

Reason (security review, CRITICAL): the injection path read *every* available
vault file and sent up to 8 docs × 4 000 chars to the provider **on every
message**, bypassing the `TalosLocalFileAuthorityGrant` system that every other
model-read path enforces. A document uploaded in one chat was transmitted while
the user asked about something unrelated in another. This contradicted the
product's core promise (local-first, BYOK, data stays on device).

### D2 — Generated documents are never re-injected

`prepareLibraryInjection` filters `origin === 'uploaded'`. Reason: with generated
files eligible for injection, a poisoned document could get the model to write a
file whose content was then re-asserted into **every future chat** — prompt
injection that survives restarts, model switches and chat deletion. Breaking that
loop is what makes the marker feature safe to ship at all.

### D3 — Marker handling is bounded, stripped and undoable

- Caps: 3 blocks / 256 KB per reply (`librarySave.ts`).
- Stripping happens at the **persistence boundary** and on the streaming tail, on
  every path — success, autosave-off, and interrupted. Previously raw markers
  reached the durable message and were replayed to the provider as history,
  teaching the syntax back to the model.
- The save toast carries a real **Undo**.
- Filenames from model output are NFKC-normalised and stripped of C0/C1, DEL,
  zero-width and bidi-override characters (an `invoice<U+202E>fdp.exe` rendered
  reversed in the Library list).

### D4 — Cold start: mount first, warm later

`main.ts` awaited the preload of all route + shell chunks before `mount()`:
**792 KB** boot-blocking instead of the 505 KB the budget gate measured, with
nothing painted — and a unit test *enforced* that order. It now mounts first and
warms on idle, exposing `__TALOS_ROUTES_WARM__` (set only on success) for the
offline journey test. The boot logo's fixed 2.32 s hold was trimmed to ~0.9 s,
which was eating the entire win.

### D5 — Deletions (37 controls that did nothing)

The 34 Interface-Visibility switches, the "Chat composer" select and "Expand
Advanced by default" had **no consumer anywhere in `src/`**. They animated,
persisted and lied. `bubble_scale` — also dead, and carrying a migration that
migrated nothing — became the real **chat text size**. Research and Cockpit stubs
no longer phrase absence as an empty backend result.

## Findings the re-reviews caught in the remediation itself

Recorded because they are the reason a single review pass is not enough:

1. Chat text size was **still** dead after round 1: the list set an inline
   `fontSize` while every child re-declared an absolute size.
2. The bounded-marker regex introduced a **ReDoS** on the streaming hot path
   (measured 32k spaces = 930 ms; ~256 k ≈ 60 s of frozen WebView, with Stop on
   the same thread).
3. `library_view: 'list'` never shipped — the parser hardcoded a `'grid'`
   fallback, so the documented default was dead code.
4. The `defaults_v3` migration forced `bubble_scale = 'compact'`, which — once
   that key became the user-facing text size — shipped "Small" pre-selected and
   overwrote an explicit choice.

## Test debt closed alongside

The behavioural repository contract only ever ran against the in-memory fake, and
the schema migrations were asserted as **substrings of SQL nothing executed**.
`tests/unit/repositories/sqlJsConnection.ts` + `sqliteChatRepository.engine.test.ts`
now run the shipped SQLite repository and the real v1→v4 upgrade chain on a real
engine (sql.js, already pinned; wasm already vendored). The harness found two
real defects in its first run.

## Still open (tracked, not silently dropped)

- `vision_enabled` is an inert switch that promises vision routing.
- `appearance_visibility` (~250 lines) survives in the store with no UI.
- `composer_mode` / `advanced_rail_expanded` persist with no consumer.
- `scripts/verify-parity-ledger.mjs` is never executed; `feature-parity.json`
  marks shipped features `planned` and cites 4 test files that do not exist.
- App lock: the PIN does not derive the SQLCipher key, there is no `FLAG_SECURE`,
  and re-lock happens on resume rather than pause.
- Vault file bodies are stored unencrypted while the DB is encrypted.
