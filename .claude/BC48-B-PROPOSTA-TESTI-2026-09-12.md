# BC-48 · mossa B — i due testi che restano da approvare (12/09/2026, ore 19:25)

La tabella è approvata («Tabella ok»). Mancano le due righe che la tabella lasciava aperte: la **sezione 3** riscritta e il nuovo **`harness-ui/AGENTS.md`**. Sono in inglese come il resto dell'`AGENTS.md` (lo leggono anche Codex, Cursor, Copilot). Si applicano con B, dopo P-I…P-L e dopo C e A. **Owner, 12/09/2026 ore 19:30: «Ok»** — entrambi i testi approvati così come sono; entrano nel brief B.

## 1 · Sezione 3, riscritta (resta in radice, su richiesta)

Oggi descrive le lane del 03/09 (Codex backend, Fable frontend Vue, Kimi mobile). Da allora: la lane desktop è `lane/harness-desktop` (Node + JavaScript, non Vue), il mobile è una lane separata senza ownership incrociata, il banco TALOS-BANCO è una terza, e dal 12/09 i lotti delegabili vanno ad Astra (Codex CLI) con review dell'orchestratore. Testo proposto:

```markdown
## Persistent Lanes And Delegation

- Work runs in named lanes with exclusive file ownership: `lane/harness-desktop`
  (TALOS desktop: `harness-ui/`), the mobile lane (`mobile/`, its own owner), and
  the benchmark lane (TALOS-BANCO). A lane never edits another lane's files; a
  cross-lane need is recorded as a file-level handoff first.
- Delegated batches go to an external agent session (Astra via the Codex CLI)
  with a written brief that states what already exists, the files it may touch,
  the forbidden files (diff in the report, never applied), the tests to run and
  the report path. The orchestrator reviews, tests, commits and verifies on the
  live server; the delegate never commits, never pushes, never touches port 4174.
- Concurrent delegates use separate git worktrees; two sessions on the same file
  are not allowed. Full builds, full suites, dependency installs and shared ports
  stay single-runner operations.
```

## 2 · `harness-ui/AGENTS.md` (nuovo, ~1.600 byte; entra per cwd nella catena esistente)

Sorgenti: `MEMORY.md` e le memorie di settembre (sistema di design esistente, niente nomi tecnici a schermo, menu ⋯ + tasto destro, chiaro e scuro sempre, confronto col mockup, CRUD completo, viewport desktop, verifica sul 4174), la sezione 8 (viewport) e 10 (fake feature) della tabella, la sezione 17 (verifica) coi comandi veri di `harness-ui/`.

```markdown
# TALOS desktop (harness-ui) — working rules

This directory is the desktop/web harness: Node server (`server.mjs`, `src/`),
vanilla JavaScript frontend (`frontend/`), shared kernel (`src/kernel/`, also used
by the mobile app: do not change its contracts without a recorded handoff).

## Product rules

- Respect the existing design system (Calm theme, `frontend/src/styles/`): change
  structure, never the visual language. Every surface is verified in BOTH light
  and dark themes, at 1024x800 and 1440x900.
- No technical names on screen: tool ids, event types and provider ids are
  mapped to human labels in one place; the raw name is at most a secondary detail.
- More than two actions on an object go into an overflow menu (`...`) plus a
  right-click menu, never a row of buttons.
- Every entity a user sees (notes, tasks, memory, library, sessions, providers)
  has complete create / open / edit / delete from the product. "There is no route"
  is not an answer: add the route.
- No fake feature: no panel without a real route, worker or persistence behind it;
  an empty or failing state says what happened and what to do next.
- Views that come from a mockup are compared side by side with the mockup
  (same view, theme and width) with a table of explained differences.

## Verification

- Backend: `node --test tests/*.test.mjs` (kernel: `npm run test:kernel`, three
  pre-existing failures are known and listed in the ledger).
- Frontend: `cd frontend && npm run test:unit`; build with `npm run build` from a
  clean worktree and copy `dist/` into `public/`.
- Runtime: after a change, the live server on port 4174 is restarted with the
  new backend, the page is opened and the console read; screenshots in both
  themes are inspected before a task is declared closed. Probes against 4174 are
  GET-only; every POST goes to a bench server on its own port.
- Never print a secret on a command line or in a log; API keys live in the
  keyring or the environment.
```

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane
- **Owner:** sì/no/modifiche ai due testi (anche «ok» secco).
- **Io:** al sì li includo nel brief B per Astra (spostamento delle sezioni secondo la tabella, i nuovi file per `core/`, `validator/`, `control-plane/`, `harness-ui/`, cancello: la catena carica la radice corta + il file della cartella, byte misurati prima/dopo); B parte dopo C e A.
- **Rimane:** `mobile/AGENTS.md` alla lane mobile (segnalazione, non scrittura mia); la sezione 11 (banco) nella cartella del banco, che Astra individua dal repo.
