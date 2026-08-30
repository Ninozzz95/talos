# TALOS Harness UI

Local backend and UI for Harness Desktop — real coding sessions (chat,
terminal, review, automations, the six big systems — Library/Notes/Tasks/
Memory/Deep Research/Tool Forge — plus hooks/MCP/skills/plugins) driven by
a real model over OpenRouter.

⛔ 2026-08-30 — this tool **no longer reads TALOS-BANCO**: until this date
the Board tab showed TALOS-BANCO's JSONL campaign data (an external
measurement tool, separate from the product) — an accidental coupling from
the original 2026-08-24 integration, never a deliberate product decision.
Removed entirely (plan "Board — from TALOS-BANCO campaigns to a session
dashboard"): the server no longer knows what TALOS-BANCO is, never reads
its directory, never imports its modules. The Board now shows Harness
Desktop's own sessions.

Harness UI does not depend on Vue, Vite, npm, or the mobile lane.

## Requirements

- Windows with PowerShell for the Chrome verification script.
- Node.js 24.18.0 for the server and tests.
- Google Chrome installed for local visual verification.

No `package.json` for the frontend, no lockfile, nothing to install there —
the backend (`harness-ui/src/*.mjs`) has its own `package.json` with a few
targeted dependencies (see its header comment for why each one is there).

## Quick start

From the repository root:

```powershell
node harness-ui/server.mjs
```

Open `http://127.0.0.1:4174/`. The server binds to a loopback host only and
prints the local address.

### Recommended startup with the Permission Model

This variant lets Node read only Harness UI's own code. It grants no write,
child-process, worker, or addon permissions beyond what the server itself
needs at runtime (the project workspace, `.sessions-store/`,
`.automations/`, the PTY terminal). The loopback bind is still enforced by
the application's own configuration.

```powershell
node --permission `
  --allow-fs-read="$PWD\harness-ui" `
  harness-ui/server.mjs
```

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `OPENROUTER_API_KEY` | no | Without it the server still starts, read-only — starting a session fails per-request with `CONFIG_INVALID`. |
| `TALOS_HARNESS_UI_HOST` | no | Defaults to `127.0.0.1`; loopback only. |
| `TALOS_HARNESS_UI_PORT` | no | Defaults to `4174`; range `1024..65535`. |
| `TALOS_HARNESS_UI_PROJECT_DIRS` | no | Allowed project folders for the "allowlist" session flow, separated by `;`. Absent = zero registered folders (fail-closed) — "Full access" with a free-form path stays available regardless. |

The rest of the variables (web search, receipt signing, images) are
documented in the header comment of `src/config.mjs`, not duplicated here to
avoid a second copy that drifts out of sync.

## What is real and what is demo

⛔ This section was written on 2026-08-24, when most of the surfaces listed
below really were mockup only. Since then, chat, tool activity,
review/diff, the terminal (a real PTY), automations, doctor, the six big
systems, and extensibility (hooks/MCP/skills/plugins) have each become
real, one at a time, each verified live — see the history in
`.claude/elegant-spinning-dongarra.md` (the master plan) for the
phase-by-phase detail. This README has not been rewritten in full to
reflect every phase: **this note says so, rather than hiding it**. The
one part of this section rewritten as part of this same change
(2026-08-30):

The Board now shows Harness Desktop's own real sessions — title, model,
an honest three-value status (concluded/interrupted/in progress) — no
longer the campaigns of an external measurement tool.

## Local API

Only `GET`/`HEAD` are available for resources, plus `POST` for session
actions — the complete, up-to-date list lives in `src/http-app.mjs` (the
source code, not duplicated here to avoid a second list that goes stale).
The server does not enable CORS for requests without an `Origin`, and does
not expose directory listings.

## Automated tests

```powershell
node --test harness-ui/tests/*.test.mjs
```

## Chrome verification

Start the server first, then run in a second PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File harness-ui/scripts/qa-chrome.ps1 `
  -BaseUrl 'http://127.0.0.1:4174' `
  -OutputDirectory "$PWD\harness-ui\.artifacts\qa"
```

The script does not start the server. It uses the installed Chrome to
capture the six canonical states: desktop `1440×900`, laptop `1024×800`,
tablet `768×1024`, mobile `390×844`, narrow mobile `320×720`, and
capability `390×844`. Screenshots and `qa-summary.json` are written only to
the given directory, gitignored. For deeper CDP scenarios (multi-step
flows, a real end-to-end session), see
`harness-ui/scripts/qa-visual-pipeline.mjs`.

## Intentional limits

- Internal, owner-only tool, in a single Chrome browser.
- No offline support or service worker.
- No blocking WCAG or performance gate in this scope.
- No arbitrary ordering or path supplied freely by the browser beyond what
  "Full access" already accepts explicitly.

## Common problems

- `The local server does not respond`: start Harness UI and reload the page.
- Port already in use: set `TALOS_HARNESS_UI_PORT` to a free loopback port.
- Chrome not found: pass `-ChromePath` to the QA script.
