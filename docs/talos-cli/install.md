# Install TALOS CLI

TALOS CLI is published on npm as **`talos-code`**. It installs one command, **`talos`**, usable from any folder.

## Requirements

- **Node.js 24**, version 24.18 or later in the 24 line. npm warns (`EBADENGINE`) on other lines; TALOS is not tested there.
- Tested on **Windows 11 x64**. macOS and Linux are not tested yet in 0.1.0.

## Install with npm

<!-- test:smoke -->
```powershell
npm i -g talos-code
talos --version
```

The package carries everything it runs: the TALOS kernel, the Context Engine and their dependencies. It reads no file of a
TALOS checkout and needs no environment variable. `TALOS_CLI_RUNTIME_ROOT` remains an advanced development override only.

## First project

From the folder you want TALOS to work on:

<!-- test:smoke -->
```powershell
talos init
```

Then start the interactive terminal UI:

<!-- test:smoke -->
```powershell
talos --project .
```

The first start asks whether to trust the folder and which provider and model to use (see `providers.md`).

## Update and uninstall

<!-- test:smoke -->
```powershell
talos update --check
```

An npm install is updated with npm: `talos update` says whether a newer version exists and prints the command,
`npm i -g talos-code@latest`. It changes nothing by itself.

`npm uninstall -g talos-code` removes the program. Your configuration, sessions, checkpoints and logs stay where they are
(`%APPDATA%\TALOS-CLI` and `%LOCALAPPDATA%\TALOS-CLI` on Windows); delete those folders yourself to remove them too.

## Windows installer

A per-user Windows installer, with a **Start menu** entry and a portable ZIP with a `Start TALOS CLI.cmd` double-click
launcher, is planned. It is **not released** with 0.1.0: install with npm.
