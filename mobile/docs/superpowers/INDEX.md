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
| `evidence/model-lab/` | tracked physical-device acceptance evidence for the five Model Lab implementation phases and the mandatory whole-app 5.5 expedition; every phase requires PNGs plus a manifest before it is implemented |
| `COMPETITIVE-ONE-UP-DOCTRINE.md` | **binding** — how competitors are studied and out-built. Run its protocol BEFORE a phase designs anything; add its ledger row before the phase closes. Owner directive 2026-07-27. |
| `progress/` | milestone/handoff state |
| `research/` | audits, competitor analysis, engineering research |
| `references/` | owner-provided reference material |

## Reading order for a new session

0. `../PASSAGGIO-DI-CONSEGNE.md` — the live mobile restart point. For the
   current Model Lab work it links the approved spec, upstream dossier, master
   plan and all five executable ledgers.
1. `plans/2026-08-04-model-lab-mobile-hub-plan.md` — **the active Model Lab
   programme**: five strictly ordered phases. A phase is not implemented until
   its fresh screenshots from the connected physical phone and `manifest.md`
   are tracked under `evidence/model-lab/`.
2. `specs/2026-08-04-model-lab-mobile-hub-design.md` and
   `research/2026-08-04-model-lab-mobile-hub-research.md` — approved information
   architecture, Theme Engine contract, measured Hugging Face/OAuth pins and
   competitor decisions.
3. `ledgers/2026-08-04-model-lab-phase-1-capacity-ledger.md` through
   `ledgers/2026-08-04-model-lab-phase-5-provider-oauth-ledger.md` — exact files,
   public symbols, RED scenarios, commands, visual evidence and rollback.
   Before the final go-out, section 5.5 of the master plan additionally requires
   a tracked whole-app ledger and a read-only reviewer/bug-tester batch before
   physical stress testing.
4. `plans/2026-07-26-talos-tool-catalogue-and-roadmap.md` — **the tool programme**:
   every tool TALOS will ever call, first to last, with the engineering
   constraints applied per row, the risk ladder, what is genuinely feasible on a
   phone (and what the vision document assumes but cannot run there), and the
   phase order F0→F8. Opened on owner instruction 2026-07-26: no tool is built
   before its row here is filled in.
5. `plans/2026-07-24-talos-mobile-remaining-program-roadmap.md` — the wider sequence.
6. `../feature-parity.json` — the machine-readable parity contract. **Treat with
   suspicion**: the audit found entries marked `planned` for features that ship,
   and `test_ids` pointing at files that do not exist. It is being corrected.

## Known gaps this index does not hide

- The older 840K capture archive remains local. The narrow Model Lab exception
  is explicit: the prescribed acceptance PNGs and manifests under
  `evidence/model-lab/` are tracked because the owner made physical visual proof
  a blocking definition-of-done gate for each phase.
- The roadmap header still cites an older reconciliation point; a re-reconcile
  pass follows the current remediation work.
- The tool catalogue supersedes the tool-related lines of the 2026-07-24
  roadmap. Where the two disagree about tools, the catalogue wins — it is the
  newer document and the one the owner asked for.
