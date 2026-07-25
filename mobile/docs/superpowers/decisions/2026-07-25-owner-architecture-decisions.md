# Owner architecture decisions — 2026-07-25

**Binding.** The owner asked to close every architectural doubt "dalla prima
implementazione al futuro", one question at a time, each with a recommendation
in front of it. Twenty decisions were taken. They are the plan of record: an
implementation that contradicts one of these is wrong, not creative.

Recorded at `1909c0b`. Source: the decision session of 2026-07-25; the weak
points that prompted it came from a two-agent reconnaissance (documents + code)
plus the SF adversarial reviews of the same day, each item re-verified against
the code.

## Order of work

| # | Decision |
|---|---|
| 1 | **Probe (measurement only) → the six defects → tool block.** The probe touches no product surface and its numbers decide two of the six. |
| 14 | Flagship order after the tools: **response ledger → cross-model dissent → share-to-TALOS**. Offline semantic memory is wanted but later. |

## Security

| # | Decision |
|---|---|
| 2 | **The PIN becomes the real database key.** No recovery path: a forgotten PIN means the data is gone, and the activation flow says so in plain words before it happens. |
| 3 | **PIN on cold start, biometrics for re-entry.** With the device off the key exists nowhere — not even the owner's fingerprint can open it. |
| 4 | The lock stays **optional**, but a disabled lock shows an **honest warning** ("your data on this phone is readable by anyone with the device"). Enabling it re-encrypts the existing database behind a progress screen; nothing is lost. |
| 18 | **Device access (Shizuku): READ ONLY first.** Write/organise only after the read path is proven in the field. |

## Engineering substrate

| # | Decision |
|---|---|
| 5 | Add a **`mobile` job to the existing GitHub CI** (`.github/workflows/ci.yml` covers core/validator/browser-worker/control-plane and has never covered mobile). |
| 17 | **Push the mobile branch as its own branch** (25 commits currently live only on the owner's disk). Check whether the repository is public and say so before pushing. |
| 6 | **Raise the initial-JS ceiling to a reasoned number** (to be proposed with data), keep loading rare surfaces on demand, and start measuring the ~130 KB of CSS the gate ignores today. |
| 7 | **Long chats load progressively upward** — latest messages instantly, older ones as you scroll. In-chat search must then query the store, not the rendered list. |
| 20 | **Realign the program documents now, and keep them true at EVERY commit** — updating the record is part of the commit, not a separate chore that gets skipped. |

## Product

| # | Decision |
|---|---|
| 8 | **Capture model reasoning**: a "Reasoning" block, **collapsed by default**, **persisted** with the message and included in exports. |
| 9 | **Clean the "/" menu**: re-enable the four commands that work while claiming not to (Doctor, export chat, notes, tasks); **remove** the ones that do not exist. |
| 10 | The semantic-search model is **downloaded on first use**, with explicit consent and its size stated; afterwards it works offline forever. |
| 11 | **Tool permissions per ACTION TYPE, user-configurable** in Settings, with safe defaults: read freely, writes ask, anything leaving the device never. |
| 12/13 | **Cross-model dissent**: both models answer in full; where they agree there is one answer, where they diverge the **higher-weighted model's version wins but the point stays marked and openable**. The owner's "70/30" means *who wins a disagreement*, not a division of labour. |
| 15 | The comparison is **triggered by hand, per question**, with the **estimated cost shown first** (it doubles tokens). |

## Coordination

| # | Decision |
|---|---|
| 16 | **Mobile first, then a formal ticket to Codex** to mirror onto the desktop. |
| 19 | **Development builds** (zip in chat + a bare copy on the Desktop) while we build; release signing only when publishing matters. |

## Why these six defects were on the table

Verified, not recited:

1. The app lock protects the screen, not the data — `capacitorSqliteRuntime.ts`
   generates a random SQLCipher key independent of the PIN.
2. Mobile has never been in CI; "tested" meant a hand-run command and the
   owner's thumb.
3. Initial JS sits 5 KB under its ceiling, and the ceiling ignores ~130 KB of
   render-blocking CSS.
4. No message virtualization and `listMessages` has no LIMIT — long threads
   degrade exactly when the product is being used most.
5. Model reasoning arrives in the stream and is discarded.
6. `feature-parity.json` marks six shipped features `planned`, the debt
   register is stale, and 17 of 21 slash commands are disabled — four of them
   lying about features that work.
