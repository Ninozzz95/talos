# labs/ — what is not part of the product yet

Skeleton created on 2026-09-04 (row W0-04 of `.claude/LEDGER-ROADMAP-DESKTOP-2026-09-03.md`).
Everything the plan marks `LABS` lives here: the Electron shell (W1-10, W2-13…17), the
advanced Execution Fabric (W4-01), computer use (W4-02), code intelligence (W4-03), the
remote node (W4-04), memory providers (W4-05), the ACP adapter (W4-07).

## Rules

1. **Off by default.** Every lab has a flag in `feature-flags.json`, all `false`. A lab is
   switched on only with `TALOS_LABS=name,other-name` when the server starts
   (`src/config.mjs`, `parseLabs`): a name not declared in the file is `CONFIG_INVALID`
   and the server does not start — never a flag invented on the fly.
2. **Separate stores.** A lab keeps its data in `labs/stores/<name>/`, never in the stable
   stores (`.sessions-store/`, `.automations/`, `.memory-store/`…). A lab writing outside
   its own folder is a defect, not a shortcut.
3. **`NOT_LIVE_VALIDATED` until proven.** Doctor lists the labs that are on; each lab
   declares in its own `README.md` what it does, what it does NOT do, how to try it for
   real and how to switch it off. The state becomes `LIVE_CONNECTION_PASSED` only with a
   real run written in the ledger, with date and machine.
4. **No code from the empirical version.** Labs attach only to stable contracts (routes in
   `http-app.mjs`, AG-UI events, `execution-backend-contract` once it exists). If a new
   contract is needed, the ledger row comes first.
5. **No wider permissions.** A lab cannot raise a session's level and never touches the
   kernel (`AVM-harness`, mobile lane).

## Switching a lab on

```powershell
$env:TALOS_LABS = "electron-shell"
node harness-ui/server.mjs
```

Doctor (Settings → Account, Doctor and backup) then reports "Labs on: electron-shell".
Without the variable: "Labs on: none".
