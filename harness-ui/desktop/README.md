# TALOS Desktop for Windows

TALOS Desktop wraps the same web interface as the TALOS server in an Electron 44.3.0 shell, with
Node.js included: nothing else to install. The package contains the local service, the built
interface, the agent kernel, the context engine and the llama.cpp b10517 engine (CPU and Vulkan
builds). GGUF models are **not** included: you download them from inside the app, with their
checksum verified.

Version 0.1.x is early development (SemVer 0.y.z): anything may change between releases.

## Requirements

- Windows 10 1809 or later, x64, or Windows 11 x64. Declared from the `node-pty` requirement;
  not yet tested on Windows 10.
- No Node.js installation and no administrator rights.
- For GPU acceleration, a Vulkan-capable driver. Without one the app runs the model on the CPU.
  Not yet tested on a machine without a Vulkan driver.

## Install

Download `TALOS-Setup-<version>.exe` from the
[Releases page](https://github.com/Ninozzz95/talos/releases) (tags `desktop-v*`) and double-click
it. The installer is a per-user NSIS one-click setup: it installs under
`%LOCALAPPDATA%\Programs\talos-desktop`, adds a "TALOS" shortcut and starts the app. It never asks
for administrator rights and does not show a folder chooser.

Alternatively download `TALOS-<version>-win.zip`, extract it **completely** into a writable folder
and start `TALOS.exe`, keeping `resources` and the DLLs next to the executable. The zip uses the
same user profile as the installer; it is not a portable mode with data next to the zip.

No automatic updates and no telemetry. The network is used only when you choose a remote
provider, search the web, or download a model.

### SmartScreen warning

The installer is **not code-signed**. Windows may show "Windows protected your PC" with an unknown
publisher. After checking the published SHA-256 and provenance (see below): choose **More info**,
verify the file name `TALOS-Setup-<version>.exe`, then **Run anyway**. If the option is missing
because of a device policy, ask its administrator. Do not disable SmartScreen or Defender.

## Verify what you downloaded

Compare both files with `SHA256SUMS.txt` attached to the release:

```powershell
Get-FileHash -Algorithm SHA256 .\TALOS-Setup-<version>.exe
Get-FileHash -Algorithm SHA256 .\TALOS-<version>-win.zip
```

Every release asset carries a GitHub provenance attestation; with the GitHub CLI installed:

```powershell
gh attestation verify .\TALOS-Setup-<version>.exe --repo Ninozzz95/talos
gh attestation verify .\TALOS-<version>-win.zip --repo Ninozzz95/talos
```

## Local models

The app picks the engine from your machine: the Vulkan build only if it lists at least one
device, otherwise the CPU build. If the graphics card is missing or lost while a model loads,
the model is restarted once on the CPU and the Model Lab says so, with a "Retry on the graphics
card" action. When the card runs out of memory the app does not switch by itself: it suggests
choosing "Processor" from the **Local engine** menu (Automatic · Graphics card · Processor),
which restarts the service and stays until you change it.

Models are downloaded from the app (Model Lab) with size and SHA-256 checked before they are
registered; a file whose bytes or checksum differ from the manifest is rejected.

## Data and uninstall

Window geometry, the shell log and the service data (sessions, downloaded models, notes, tasks,
memory, automations, provider settings) live in `%APPDATA%\TALOS` (Electron's
`userData`, which Electron names after the product, not the package). The menu can open the log. For isolated tests set `TALOS_DESKTOP_DATA_DIR` to an
absolute path.

To uninstall: close TALOS (also from the tray), open **Settings → Apps → Installed apps → TALOS →
Uninstall** (Windows 10: **Apps & features**), or run `Uninstall TALOS.exe` from the program
folder. Your data folder is kept; delete it yourself only if you also want to remove sessions,
settings and models.

## Building from source

From `harness-ui/desktop` on Windows x64, with the frontend already built into `harness-ui/public`:

```powershell
npm ci
npm run dist
```

`npm run prepara` builds `.staging/` from an explicit inclusion list (server, `src/`, `public/`,
production dependencies via `npm ci --omit=dev`, the context engine, the kernel), verifies the
native addons under Electron, downloads the official llama.cpp b10517 zips and checks their
pinned SHA-256, and writes `.staging/MANIFEST.json` (every file with size and hash). `npm run dist`
then produces `dist/TALOS-Setup-<version>.exe` and `dist/TALOS-<version>-win.zip` with
electron-builder 26.16.1. Official builder tools (NSIS, 7zip) are downloaded only when
`TALOS_R02_BUILDER_NETWORK=1` is set, otherwise they must be present in the verified cache
(`ELECTRON_BUILDER_CACHE`, default `.cache-r02/builder`). The build is reproducible in its tree
(same locks, same manifest), not byte-for-byte.

Tests:

```powershell
npm run test:puri        # pure tests (paths, lifecycle, window state, contracts, licence)
npm run test:guscio      # Playwright _electron: real window, cookie, PTY, no orphan process
$env:TALOS_R02_INSTALLER = '1'; npm run test:installer   # really installs and uninstalls
```

`test:installer` installs the built package silently, starts the installed executable with a
temporary data folder, checks `/api/v1/health` with and without the cookie, closes it and
uninstalls, then checks for leftover processes, files, shortcuts and registry keys. Measurements
and screenshots land in `.prove/`.

## How a release is made

The desktop version lives in `package.json` and in the tag `desktop-vX.Y.Z`; there is no separate
`VERSION` file. Pushing a `desktop-vX.Y.Z` tag runs the `desktop` job of
`.github/workflows/release.yml` on `windows-latest`: it installs from the lock files, builds the
frontend, runs the server, kernel, frontend and Electron tests, builds the installer and the zip,
installs the executable silently, starts it, checks the health endpoint with the cookie, closes and
uninstalls it, writes `SHA256SUMS.txt` and the release notes, attests both artifacts with
`actions/attest`, and creates the GitHub release with exactly three assets. Any failing step stops
the publication. The `apk` job handles mobile tags (`v*`) only.

## Security notes

The renderer runs without Node integration and without a preload script, with context isolation
and the Chromium sandbox enabled; navigation and new windows outside the local origin are blocked.
The local service listens on 127.0.0.1 only and requires a session cookie (`HttpOnly`,
`SameSite=Strict`) that the shell sets through a one-time redirect; the token never appears in
command lines or in the log. "Open in browser" reuses that redirect: the URL handed to the system
browser contains the credential, so the browser's history may keep it.

Licence: AGPL-3.0-only (see `LICENSE` at the repository root). Third-party components keep their
own licences: `../THIRD_PARTY_NOTICES.md` and `assets/llama-LICENSE.txt`.
