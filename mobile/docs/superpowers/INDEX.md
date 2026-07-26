# TALOS mobile — program record (tracked)

**Why this file exists.** A coherence audit (2026-07-25) found that the entire
program source of truth — the roadmap, every ledger, the specs and the research —
lived under a **git-ignored** path (`docs/superpowers/` is listed in `.gitignore`).
71 files on disk, 6 tracked. The record was unreviewable, unrecoverable and
invisible to every other agent. It has been moved into this tracked tree.

**Rule from here on:** program documents for the mobile lane live in
`mobile/docs/superpowers/**` and are committed with the work they describe.
Nothing that governs the program may live only on one machine, and no phase is
"done" until its ledger is here.

## Layout

| Folder | Holds |
|---|---|
| `plans/` | roadmaps and phase plans (the program's sequence) |
| `specs/` | design documents opened BEFORE a phase, closed when it ships |
| `ledgers/` | per-phase execution records: what changed, why, and the gates |
| `progress/` | milestone/handoff state |
| `research/` | audits, competitor analysis, engineering research |
| `references/` | owner-provided reference material |

## Reading order for a new session

0. `plans/2026-07-26-talos-tool-catalogue-and-roadmap.md` — **the tool programme**:
   every tool TALOS will ever call, first to last, with the engineering
   constraints applied per row, the risk ladder, what is genuinely feasible on a
   phone (and what the vision document assumes but cannot run there), and the
   phase order F0→F8. Opened on owner instruction 2026-07-26: no tool is built
   before its row here is filled in.
1. `plans/2026-07-24-talos-mobile-remaining-program-roadmap.md` — the sequence.
2. The newest file in `ledgers/` — what actually shipped last.
3. `../feature-parity.json` — the machine-readable parity contract. **Treat with
   suspicion**: the audit found entries marked `planned` for features that ship,
   and `test_ids` pointing at files that do not exist. It is being corrected.

## Known gaps this index does not hide

- `evidence/` (840K of capture PNGs) is intentionally left out of the tracked
  tree for size; it stays local until a decision is made about where binary
  evidence belongs.
- The roadmap header still cites an older reconciliation point; a re-reconcile
  pass follows the current remediation work.
- The tool catalogue supersedes the tool-related lines of the 2026-07-24
  roadmap. Where the two disagree about tools, the catalogue wins — it is the
  newer document and the one the owner asked for.
