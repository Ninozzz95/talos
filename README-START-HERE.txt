TALOS CLI — OWNER INSPECTION PACKAGE
====================================

SOURCE SNAPSHOT
58c103643a57ea49b5ffc3c6c1c1da9d5352d581
branch: lane/talos-cli-competitive-upgrade

PURPOSE
This package is for the owner's pre-release inspection only.
It is NOT a signed release and does not claim M11/release readiness.

CRITICAL PROJECT RULE
The extracted TALOS inspection package is NOT a project.
Choose a SEPARATE disposable/test project folder outside this package.
The launcher now refuses either direction of path overlap, including a project
folder that contains this package.

ONE CLICK
1. Extract the ZIP completely.
2. Double-click START-TALOS-CLI.cmd.
3. The checklist opens in Notepad.
4. Choose a SEPARATE disposable/test project folder outside the extracted ZIP.
5. First launch downloads exact Node 24.18.0 Windows x64, verifies SHA-256,
   installs the committed lockfiles, runs mandatory zero-error typecheck + build,
   then launches this exact snapshot from the selected project's cwd.
6. Any non-zero npm/typecheck/build gate stops preparation. Emitted JS never
   overrides a failed compiler gate.
7. Later launches reuse only verified dependency/build caches for this snapshot.

DEVELOPMENT LOGS
A DEVELOPMENT-LOGS folder is created beside this README/launcher.
It contains:
- bootstrap-*.log: PowerShell/bootstrap/install/typecheck/build/launch transcript;
- talos-dev-*.jsonl: structured UI/controller/checkpoint/runtime/backend timeline.
On ANY FAIL, send the whole DEVELOPMENT-LOGS directory.
Raw prompt/tool text and known credential values are redacted/fingerprinted by
TALOS development logging; still inspect the files before sharing externally.

TERMINAL MODE
Open a terminal INSIDE the separate project and run talos.cmd.
Running talos.cmd from this inspection package is deliberately rejected.

RESET
RESET-INSPECTION-CACHE.cmd removes only inspection bootstrap/build cache and
local inspection development logs. It deliberately does not delete normal
TALOS user data.

IMPORTANT
The package carries CLI + harness-ui runtime + context-engine runtime from the
same development HEAD. Internet access is required on first launch for pinned
Node/npm dependencies and for provider/network features you explicitly exercise.
