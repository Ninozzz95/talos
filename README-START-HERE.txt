TALOS CLI — OWNER INSPECTION PACKAGE
====================================

SOURCE SNAPSHOT
0e47081febc0f6c3732aa96df8c11750fe94ea7f
branch: lane/talos-cli-competitive-upgrade

PURPOSE
This package is for the owner's pre-release inspection only.
It is NOT a signed release and does not claim M11/release readiness.

ONE CLICK
1. Extract the ZIP completely.
2. Double-click START-TALOS-CLI.cmd.
3. The checklist opens in Notepad.
4. Choose a disposable or test project folder.
5. First launch downloads the exact pinned Node 24.18.0 Windows x64 archive,
   verifies SHA-256, installs dependencies from the included lockfiles,
   compiles the CLI, and launches this exact snapshot.
6. Later launches reuse the local bootstrap/dependency/build caches.

TERMINAL MODE
Run talos.cmd from a terminal opened inside the project you want to inspect.

RESET
RESET-INSPECTION-CACHE.cmd removes only the inspection bootstrap/build cache.
It deliberately does not delete normal TALOS user data.

IMPORTANT
The package carries CLI + harness-ui runtime + context-engine runtime from the
same development HEAD. It does not use the old Desktop 0.1.7 runtime.
Internet access is required on first launch for Node/npm dependencies and for
provider/network features you explicitly exercise.
