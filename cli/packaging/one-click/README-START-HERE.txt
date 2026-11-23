TALOS CLI — ONE CLICK

1. Extract the ZIP completely.
2. From a terminal, run talos.cmd from the folder you want TALOS to use as its workspace.
   START-TALOS-CLI.cmd remains available for one-click launch or drag-and-drop project selection.
3. The first start downloads the exact pinned Windows x64 Node runtime and TALOS Desktop 0.1.7 runtime, verifies their SHA-256 checksums, installs Ink/React, then opens the CLI in the current project.
4. Later starts reuse the verified cache under %LOCALAPPDATA%\TALOS-CLI\bootstrap.

When talos.cmd is invoked from a terminal, the current terminal directory is the workspace.
To open a specific project explicitly, pass that folder as the first argument or drag it onto START-TALOS-CLI.cmd.
No administrator rights are requested. The first start requires Internet access. TALOS telemetry remains disabled.
