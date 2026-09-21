# TALOS Context Engine

Internal desktop-first package. Original records are immutable; summaries and search indexes are derived data. Publication requires a validated summary and a transactional revision check. Implementation is in progress; passing unit tests does not qualify a model or a provider.

Contracts and execution ledger: `.claude/CONTRATTI-TALOS-CONTEXT-ENGINE-2026-09-08.md` and `.claude/LEDGER-TALOS-CONTEXT-ENGINE-2026-09-08.md` at the checkout root.

Run focused checks with `node --test tests/contracts.test.mjs tests/compaction-planner.test.mjs tests/summary.test.mjs`. Runtime must support Node 24.18.0 or later within the supported major range.
