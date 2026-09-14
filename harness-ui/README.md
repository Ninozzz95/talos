# TALOS Harness Desktop

**A local coding agent that keeps receipts.** A real terminal, review and
diff, automations, hooks, MCP, skills and plugins, driven by any model over
OpenRouter. Every session is a replayable event log; every operation with
side effects leaves a signed receipt. The server binds to `127.0.0.1` only.

<img src="docs/immagini/harness-desktop.png" alt="Harness Desktop after a run: the agent read the files, added a boundary test and ran the suite; the tool strip and the diff sit in the conversation, the touched files and the folder tree on the right">

## Quick start

Node.js 24 and Google Chrome. No `package.json` for the frontend, no
lockfile, nothing to install there.

**Windows, double-click**: run `harness-ui/scripts/avvia-talos.cmd`. It
starts the server on the first free port from `4174` up, waits for it to
answer, and opens your browser. Nothing to set first: on the first run a
four-step intro asks for what TALOS cannot start without — a provider key
(saved in the OS keyring, never in the browser) or a local engine, a default
model, how much it may do on its own — and then opens the folder picker. It
does not come back once completed or skipped. Set `TALOS_INTRO=0` to disable
it; the launcher then opens the Doctor screen when no access is configured.

**From a terminal**, from the repository root:

```powershell
node harness-ui/server.mjs
```

Open `http://127.0.0.1:4174/` (or the next free port, printed on start; set
`TALOS_HARNESS_UI_PORT` to require an exact one). Set `OPENROUTER_API_KEY` to
start sessions; without it the server still starts, read-only, and starting
a session fails
per request with `CONFIG_INVALID`.

## What you get

- **Chat and tool activity** — streamed events, per-tool approval
  (`allow / ask / deny`), the run's permission shown under the user bubble.
- **Terminal** — a real PTY, not a transcript.
- **Review** — diff of what the session changed, before you accept it.
- **Automations** — scheduled runs with their own history.
- **Six systems** — Library, Notes, Tasks, Memory, Deep Research, Tool Forge.
- **Extensibility** — hooks (sha256-trusted), MCP servers, skills, plugins.
- **Board** — Harness Desktop's own sessions: title, model, and an honest
  three-value status (concluded / interrupted / in progress).
- **Doctor** — a read-only readiness report of the local setup.

Harness UI does not depend on Vue, Vite, npm, or the mobile lane. The
backend (`src/*.mjs`) has its own `package.json` with a few targeted
dependencies, each explained in its header comment.

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `OPENROUTER_API_KEY` | no | Without it the server starts read-only. |
| `TALOS_HARNESS_UI_HOST` | no | Defaults to `127.0.0.1`; loopback only. |
| `TALOS_HARNESS_UI_PORT` | no | Defaults to `4174`; range `1024..65535`. |
| `TALOS_HARNESS_UI_PROJECT_DIRS` | no | Additional project folders for the session picker, separated by `;`. When absent, the server exposes its own desktop project workspace by default; `Full access` still allows an explicitly chosen folder. |
| `TALOS_OWNER_RUNTIME_MODULE` | no | Absolute path to the agent kernel. **Defaults to the kernel shipped in this repo** (`src/kernel/talosHarness.mjs`), so a fresh clone runs real turns with no configuration. Point it elsewhere only to develop the kernel outside this repo. |
| `TALOS_HARNESS_UI_SESSIONS_DIR` | no | Where sessions are stored. Defaults to `.sessions-store/` next to the server. Use a separate folder when you run a second instance, or the two share history. |
| `TALOS_HARNESS_UI_PUBLIC_DIR` | no | Folder served as the UI. Defaults to `public/`, the built app. |
| `TALOS_MCP_STARTUP_CONCURRENCY` | no | How many trusted MCP servers are started at once when a session begins. Defaults to `1` — serial, the behaviour this server has always had. Values `1..8`; anything else falls back to `1` rather than failing to start. Starting a server is waiting, not computing, so raising this shortens startup when you trust several servers (measured on four echo servers: 121 ms serial, 46 ms at four). |
| `TALOS_INTRO` | no | `0` skips the first-run introduction. |

### The agent kernel

Real turns run through a kernel that lives in this repo at
`src/kernel/talosHarness.mjs` (one file, `node:*` only, plus its compiled
`dist/kernelPerIlBanco.js`). Its own suite runs with `npm run test:kernel`
(538 tests) and is part of `npm run verify:all`.

Two things are worth knowing:

- the kernel's **semantic gate** — the check that refuses to write code calling
  a function that does not exist — reads TypeScript's `lib.*.d.ts` from
  `node_modules/typescript/lib`. That is why `typescript` is a devDependency
  here and why the kernel lives under `src/`: from anywhere else those two
  tests fail (measured: 536/538);
- the kernel is also developed outside this repo. `npm run kernel:controlla`
  compares the copy in the repo with that source and **says** when they differ;
  it never copies anything on its own. On a machine that only has this repo the
  source is unreachable and the check simply says so, exit 0.

The rest of the variables (receipt signing, images) are documented in the
header comment of `src/config.mjs`, not duplicated here to avoid a second copy
that drifts out of sync.

**Web search** is configured from Settings → Agent tools ("Origine della
ricerca web"), as on the phone: Tavily, Brave, a SearXNG instance of yours, a
custom endpoint — key in the OS keyring, address in `.search-source.json`
next to the server — plus **DuckDuckGo without a key**, the default when
nothing is configured (it reads DuckDuckGo's public results page, not an
official API: under heavy use it may refuse, and the result says so). The
`TALOS_HARNESS_SEARCH_*` variables remain the seed until you choose in the UI.

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

### Windows Explorer development integration

After starting the desktop server, register the per-user development
commands from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File harness-ui/scripts/windows/register-open-with-talos.ps1
```

Explorer then offers **Apri cartella con TALOS** for a selected directory and
**Apri questa cartella in TALOS** for a directory background. On Windows 11,
this development-only legacy verb can appear under **Show more options**. The
command opens a new-session draft with that directory selected; it does not
silently grant `Full access`. Remove both commands with the same script and
`-Unregister`.

The final installer must own a stable executable and the modern Windows 11
`IExplorerCommand` integration. It must not register a path into a source
checkout. See
`.claude/DOSSIER-RICERCA-OPEN-WITH-TALOS-WINDOWS-2026-09-01.md`.

## Local API

Only `GET`/`HEAD` are available for resources, plus `POST` for session
actions — the complete, up-to-date list lives in `src/http-app.mjs` (the
source code, not duplicated here to avoid a second list that goes stale).
The server does not enable CORS for requests without an `Origin`, and does
not expose directory listings.

## Tests and verification

One command, from `harness-ui/`, runs everything that bites: the backend suite, the lab
tests and the frontend `verify` (unit, contract snapshot, build):

```powershell
npm run verify:all
```

Read its exit code, not the last line of output. The backend suite alone:

```powershell
node --test harness-ui/tests/*.test.mjs
```

Chrome verification, with the server already running, in a second
PowerShell:

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
flows, a real end-to-end session), see `scripts/qa-visual-pipeline.mjs`.

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

## History notes

Kept here, at the end, so the record stays honest without being the first
thing a reader sees.

- **2026-08-24 — most surfaces were mockup only.** Since then chat, tool
  activity, review/diff, the terminal (a real PTY), automations, doctor, the
  six systems and extensibility have each become real, one at a time, each
  verified live. The phase-by-phase detail is in
  `.claude/elegant-spinning-dongarra.md` (the master plan).
- **2026-08-30 — this tool no longer reads TALOS-BANCO.** Until that date
  the Board tab showed TALOS-BANCO's JSONL campaign data (an external
  measurement tool, separate from the product), an accidental coupling from
  the original integration. Removed entirely: the server never reads its
  directory, never imports its modules. The Board now shows Harness
  Desktop's own sessions.
