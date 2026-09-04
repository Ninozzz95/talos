# electron-shell — LAB (W1-10, spike 57.1)

A thin Electron window around the real Harness UI server. Nothing of the product moves
into Electron: `server.mjs` keeps running as a **separate Node child** (so `node-pty` and
every native addon stay exactly the ones already proven in the browser flow), and the
window is a plain web page talking to it over loopback.

## What it does

1. Generates a random 64-character token.
2. Starts `node harness-ui/server.mjs` with `TALOS_HARNESS_UI_TOKEN=<token>` and the R-01
   handshake file (`TALOS_HARNESS_UI_REPORT_FILE`), so the shell learns the real port
   without guessing it.
3. Waits for `GET /api/v1/health` to answer 200 **with the cookie**.
4. Opens one `BrowserWindow` on `http://127.0.0.1:<port>/?token=<token>`: the server sets the
   `talos_token` cookie (HttpOnly, SameSite=Strict) and redirects to `/`, so the token never
   stays in the address bar or history.
5. On quit, kills the child.

Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no preload.
GPU: `ignore-gpu-blocklist` is on (the 2026-09-02 lag lesson); W2-17 measures whether it stays.

## Lifecycle (W2-13)

- **One instance.** `app.requestSingleInstanceLock()`: a second launch exits at once and the
  first window comes to the front.
- **The child is governed by a state machine** (`lifecycle.mjs`, pure, tested without Electron):
  `fermo → avvio → pronto → in-chiusura → chiuso`; an unexpected exit is `crash` and the shell
  restarts the child with a growing backoff (500 ms → 8 s, five attempts); after five
  consecutive failures it gives up (`arreso`), warns in a dialog and stops trying. An exit we
  asked for is never a crash. A restart that succeeds resets the counter.
- **After a restart the window reloads on the new child** (new port/cookie), only then.
- **Sleep and wake.** `powerMonitor` suspend/resume: on wake the shell probes `/api/v1/health`
  instead of assuming; a child that died during sleep is treated as a crash.
- **Window bounds** are saved to `labs/stores/electron-shell/window-state.json` (debounced) and
  restored on the next launch, only if they still fall on a connected display.
  `windowStatePersistence` does not exist in Electron 44 (checked in the official docs on
  2026-09-04), so this is ours.

Proven live on 2026-09-04 (Playwright `_electron`): child killed by pid → `crash` → restart →
window reloaded, health 200 again in 7 s with a new pid; second instance exits 0; bounds set,
app closed, relaunched with the same bounds. Not proven live: suspend/resume (cannot be
simulated; covered by the state-machine tests).

## What it does NOT do

No tray, no native notifications, no `talos://` protocol (W2-14); no installer (W2-15); no
updater (W2-16); no hardening review (W2-17). Browser-first stays the default: without this
lab nothing changes.

## Try it

```powershell
cd harness-ui/labs/electron-shell
npm install          # electron 44.2.0, pinned
npm start
```

While the window is open, from another terminal:

```powershell
curl -i http://127.0.0.1:<port>/api/v1/health      # 401 AUTH_REQUIRED: no cookie
```

The port is printed by the shell on start. The Terminal tab inside the window must open a
real PTY: that proves `node-pty` runs in the child without a rebuild.

## Switch it off

Close the window (the child server dies with it), or simply keep using
`node harness-ui/server.mjs` in the browser: the token gate is active only when
`TALOS_HARNESS_UI_TOKEN` is set.

State: `LABS_EXECUTABLE`. `LIVE_CONNECTION_PASSED` only after a real run written in the
ledger with date and machine.
