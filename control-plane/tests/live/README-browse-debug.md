# TALOS live browse-debug harness

`browse-debug.mjs` drives the **real running TALOS stack** (default
`http://localhost:8088`) with a headless Chromium and reproduces the browser /
snapshot flow end-to-end, taking **screenshots at every step** and recording the
**real HTTP responses + error codes** — so you can see browser bugs with on-screen
evidence instead of hand-testing.

It only reads the DOM and calls the same public API the UI calls. It **does not
touch app/product code**. On any step failure it still writes the full report +
screenshots (evidence is never thrown away).

---

## Prerequisites

1. **The stack must be up on :8088.** Verify:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8088/readyz   # -> 200
   ```
   (Start it with `./talos up` if needed — the containerized `:8088` app +
   real `browser-worker` + real Chromium.)

2. **Playwright + Chromium are already installed** in `control-plane`
   (`@playwright/test` 1.61.x, cached headless-shell). No install step needed.
   Run the script **from the `control-plane/` directory** so `@playwright/test`
   resolves.

3. **Credentials.** The live `:8088` DB already has an admin (its `/setup` route
   is closed once the first admin exists), so you must provide login credentials —
   see below.

---

## Authentication

The harness reproduces exactly what the E2E suite does
(`tests/e2e/talosBrowserHmi.e2e.spec.ts` → `ensureAuthenticated`):

1. Reuse an existing session cookie (`#talos-workspace-root[data-authenticated="true"]`).
2. If `/setup` still shows the first-run form (`#talos-setup-form`), create the
   first admin (only on a brand-new stack).
3. Otherwise log in at `/login` (`#talos-login-form`, "Sign in").

On the current `:8088` an admin **already exists**, so set:

| Env | Meaning | Default |
|-----|---------|---------|
| `TALOS_USER`  | login email for your `:8088` admin | `test@example.com` |
| `TALOS_PASS`  | login password                     | `password` |

(`TALOS_EMAIL` / `TALOS_PASSWORD` / the E2E `TALOS_E2E_EMAIL` / `TALOS_E2E_PASSWORD`
are also accepted as fallbacks.) For a fresh stack that still offers `/setup`, the
harness auto-creates the admin using `TALOS_USER`/`TALOS_PASS` (password must be
≥12 chars — server rule `Password::min(12)`; a strong default is used if yours is
shorter, override with `TALOS_SETUP_PASS`).

If auth fails, every UI step is skipped fast (~20s total) and the report records
`auth: FAILED` with a message telling you to set the credentials.

---

## Run it

From `control-plane/`:

```bash
# headless (CI-style)
TALOS_USER=you@example.com TALOS_PASS='your-password' \
  node tests/live/browse-debug.mjs

# watch it drive a real browser window
HEADED=1 TALOS_USER=you@example.com TALOS_PASS='your-password' \
  node tests/live/browse-debug.mjs

# different target site
TARGET_URL=https://example.com TALOS_USER=... TALOS_PASS=... \
  node tests/live/browse-debug.mjs
```

### All env knobs

| Env | Default | Purpose |
|-----|---------|---------|
| `TALOS_BASE_URL` | `http://localhost:8088` | app under test |
| `TARGET_URL` | `https://caradero-web.vercel.app/` | site to browse |
| `HEADED` | `0` | `1` = visible browser |
| `MOBILE` | `0` | `1` = Pixel 7 emulation |
| `CLICK_X` / `CLICK_Y` | `0.5` / `0.34` | normalized click point in the snapshot (0..1) — aim at a vehicle card/link |
| `TALOS_USER` / `TALOS_PASS` | see above | login creds |
| `TALOS_SETUP_NAME` / `TALOS_SETUP_EMAIL` / `TALOS_SETUP_PASS` | — | first-run `/setup` only |

---

## What the harness performs (9 steps)

1. **Authenticate** to `:8088` (session → `/setup` → `/login`).
2. **Open/create a chat** (`POST /api/talos/sessions`, surface `chat`).
3. **Enable Browse** in the composer (aria-label `Enable Browse`) → captures the
   real `POST /api/talos/browser/sessions` response (browser-session id +
   `talos_session_id`), waits for Ready/Active, surfaces any setup fault.
4. **Send the target URL**: types `Open and inspect <TARGET_URL>` and Sends
   (`POST /api/talos/chat`), **then** issues a deterministic
   `POST /api/talos/browser/sessions/{id}/navigate` so the visual steps have the
   real page even if no chat model is configured on this stack.
5. **Capture the snapshot**: clicks *Capture browser screenshot*
   (`POST …/screenshot`), opens the on-screen evidence lightbox
   (`browser-evidence-stage`), screenshots that panel, saves the raw preview PNG,
   and **detects the white/blank case** by canvas-sampling the decoded frame
   (mean luminance + variance + non-white ratio).
6. **Scroll the snapshot** via the backend scroll verb: `POST
   …/sessions/{id}/interactions/scroll` with `{ state_version, artifact_id,
   artifact_sha256, delta_y: 800 }` addressing the current frame captured in step 5.
   On `200` it compares the pre-scroll frame sha256 against
   `data.screenshot.sha256` (different = **scrollWorks: true**), decodes
   `data.screenshot.base64` to `06-6-after-scroll.png`, and advances the tracked
   frame. On `4xx/5xx` it records the code/reason (evidence preserved, no throw).
7. **Click an element** inside the snapshot at `CLICK_X/CLICK_Y`
   (`POST …/interactions/pointer`). Captures the real status + body:
   - `428 TALOS_BROWSER_HMI_CONFIRMATION_REQUIRED` → auto-confirms
     (`browser-hmi-confirm` → `…/interactions/{id}/confirm`) to reach the real result.
   - **`409 TALOS_BROWSER_HMI_RECOVERY_REQUIRED`** → **the KEY output** — prints
     `details.reason` (which recovery reason actually fired).
   - `201` → executed, no lock.
8. **Retry after the lock**: re-clicks + re-captures a screenshot and records
   whether the session is **stuck** (needs a brand-new session via *Retry
   browser*) — set only when a recovery lock fired.
9. **File upload** from the composer (*Attach a file* → `POST /api/files/ingest`) —
   a separate reported bug — records status + whether a chip lands in the tray.

Every step is independent and self-bounded; a failure records the error + an
`-error.png` and the run continues.

---

## Output

Written to a timestamped dir under
`control-plane/storage/app/browse-debug/run-<timestamp>/`
(falls back to the scratchpad/temp dir if storage is not writable):

```
report.json                    structured per-step report + keyFindings
api-log.json                   every UI-driven /api/** response (method,path,status,ct,body)
NN-<step>.png                  screenshot per step (panel/stage/composer)
05-snapshot-artifact-*.png     the raw verified frame the user sees
upload-fixture.txt             the file used for the upload step
zz-final.png                   final page state
```

### Reading `report.json`

- `auth` — `{ method: existing-session | setup | login, email }` or `null` if it failed.
- `browserSession` — `{ id, talosSessionId }` bound by Browse.
- `devBrowserEvidence` — whether this build exposes the dev raw-DOM snapshot viewer
  + *Capture page structure* menu item (production `:8088` = `false`; the
  user-visible "snapshot" is the screenshot evidence lightbox).
- **`keyFindings`** — the at-a-glance verdict:
  - `recoveryReason` — **the KEY output**: the `details.reason` string from the
    `409 …RECOVERY_REQUIRED` on the click (`null` = no lock fired). Possible values
    come from the control-plane (`TalosBrowserHmiController::recoveryRequired`,
    e.g. `TALOS_BROWSER_EVIDENCE_COMMIT_FAILED`, `TALOS_BROWSER_AUDIT_COMMIT_FAILED`,
    `TALOS_BROWSER_EXECUTION_OUTCOME_UNKNOWN`, `TALOS_BROWSER_EVIDENCE_BINDING_INVALID`,
    `TALOS_BROWSER_FINAL_URL_DENIED`, …) or, when the worker raises it, the worker
    `reason_code` (`quiescence_timeout`, `navigation_settlement_timeout`,
    `evidence_frame_changed`, `dispatch_guard_rejected`, `new_context_opened`,
    `download_started`, `file_chooser_opened`, `evidence_url_bounds`).
  - `clickFinalStatus`, `recoveryHttpStatus`, `recoveryCode`
  - `blankSnapshot` + `snapshotPixelSummary` (`{width,height,mean,variance,nonWhiteRatio}`)
  - `scrollWorks`, `retryStuck`, `uploadWorks`
- `steps[]` — per step: `{ id, ok, httpStatus, code, reason, note, screenshots[], error }`.
- `consoleErrors` / `pageErrors` — browser-side errors seen during the run.

The console also prints a `BROWSE-DEBUG SUMMARY` block at the end with the same
key findings and the report path.

---

## Companion: `upload-matrix.mjs` (file-type upload matrix)

Reproduces the exact composer upload flow from
`resources/js/composables/useTalosChatAttachments.ts` for a matrix of file types
(small `.txt`, 2x2 `.png`, 1x1 `.jpg`, tiny text `.pdf` — all bytes generated
in-script) to confirm which types the composer upload fails on. Same auth flow +
env as `browse-debug.mjs`.

Per fixture: `POST /api/files/ingest` (multipart `file`) → on `available`,
`POST /api/talos/file-authority/grants` `{scope:'file', permissions:['model.read','browser.upload'], file_ids:[id], label}`.
Captures ingest HTTP + `result.status` + `error_code` + `failure_reason` + grant HTTP;
writes `upload-matrix-report.json` + per-fixture request/response JSON to a
`upload-matrix-<timestamp>/` run dir and prints a per-fixture table.

```bash
TALOS_USER=you@example.com TALOS_PASS='...' node tests/live/upload-matrix.mjs
```

Confirmed on live `:8088` (2026-07-21): `txt` and text-`pdf` → `201 available`
(grant `201`); `png` and `jpg` → **`503 extraction_failed`, `error_code
TALOS_OCR_REQUIRED`** ("This file requires OCR, but the OCR capability is
disabled"), so the composer marks them failed. Hypothesis **confirmed**: the split
is text-extractable vs image (OCR-required) — not image formats being invalid.

## Notes / limitations

- `api-log.json` captures **page-driven** `/api/**` responses (the UI clicks —
  screenshot, pointer, chat, ingest). Direct API calls the harness makes itself
  (chat-session create, `navigate`) run through the shared cookie jar and are
  recorded in the relevant **step's** `httpStatus`/`note` instead.
- Step 6 drives the backend scroll verb (`…/interactions/scroll`) against the
  current frame's `{state_version, artifact_id, artifact_sha256}` identity and
  proves scroll worked by a screenshot-sha256 change — not by client-side wheel.
- Step 4 also drives the chat send; if the stack has no chat model configured that
  POST may be a no-op — the deterministic `navigate` guarantees the later steps
  still exercise the real page.
