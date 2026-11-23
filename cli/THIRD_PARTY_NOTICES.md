# TALOS CLI Third-Party Notices

The package lock is the authoritative inventory for the complete dependency
graph. The Windows runtime retains dependency package metadata and license
files under `app/node_modules`.

## Microsoft eXecution Containers SDK 0.8.0

- Package: `@microsoft/mxc-sdk` `0.8.0`
- Upstream: https://github.com/microsoft/mxc
- Reviewed tag object: `c0ea508293705ddcc60baaf286aafd3776b42eb8`
- npm integrity: `sha512-pnf5QsASwp+qtRi5uth2GDjwuyG0rHWRpxCf3RbAjQ4wDTNfBX/9l0A+RVZspU2agpF3/11uWB1JisIS7WrNYg==`
- License: MIT

MXC is distributed as a public preview and includes platform-specific native
executables. TALOS checks host capability evidence before use and does not
represent preview isolation as a security boundary unless the requested
AppContainer, Bound File System, network, and process-tree controls have been
verified on that host.

The full upstream MIT license text is retained in
`app/node_modules/@microsoft/mxc-sdk/LICENSE.md` in packaged runtimes.

## jsdiff 9.0.0

- Package: `diff` `9.0.0` (pinned exact, R3 owner decision 2026-09-24)
- Upstream: https://github.com/kpdecker/jsdiff
- npm integrity: `sha512-svtcdpS8CgJyqAjEQIXdb3OjhFVVYjzGAPO8WGCmRbrml64SPw/jJD4GoE98aR7r25A0XcgrK3F02yw9R/vhQw==`
- License: BSD-3-Clause

Used only to compute line differences for the file-change summaries and diffs TALOS shows; it never touches files.
The full upstream BSD-3-Clause license text is retained in `app/node_modules/diff/LICENSE` in packaged runtimes.

## Windows notifications: node-notifier 10.0.1 / SnoreToast 0.7.0

- Package: `node-notifier` **10.0.1**, pinned exactly in the package and lock files.
- Package upstream: https://github.com/mikaelbr/node-notifier/tree/v10.0.1 (MIT).
- npm integrity: `sha512-YX7TSyDukOZ0g+gmzjB6abKu+hTGvO8+8+gIFDsRCU2t8fLV/P2unmt+LGFaIa4y64aX98Qksa97rgz4vMNeLQ==`.
- Executable upstream/source: https://github.com/KDE/snoretoast/tree/v0.7.0 (LGPL-3.0-or-later).
- Source archive: https://github.com/KDE/snoretoast/archive/refs/tags/v0.7.0.tar.gz.
- SnoreToast copyright: Hannah von Reth, 2013–2019.
- Observed SHA-256, x64 (2,519,032 bytes): `42d20792498514562cfd6fd8221b4abb59229e893073fc59fbfc83f884a2401b`.
- Observed SHA-256, x86 (2,065,912 bytes): `7750fab8cb0a513be8e4355f3ed1b6d8d558737504ff8d9d37a6bb941b8c2fca`.

TALOS executes the unmodified `vendor/snoreToast/snoretoast-x64.exe` or `snoretoast-x86.exe` shipped by the
pinned package, through a separate process with fixed argument boundaries, no shell, a hidden window,
cancellation and a 12-second outer timeout (10 seconds for the native process). A one-shot Node helper
without a console prevents SnoreToast's AttachConsole call from writing into the interactive terminal.
Both processes receive the existing allowlist of system environment variables, not provider credentials.
It does not import node-notifier's JavaScript notification wrapper.
The executable can be replaced with an interface-compatible build; TALOS does not prevent modification
or debugging of it. Node-notifier's MIT license and SnoreToast's LGPL license remain in the dependency's
`LICENSE` and `vendor/snoreToast/LICENSE` files. Binary redistributions must retain those notices and provide
the corresponding upstream source and applicable GPL/LGPL license texts with equivalent access.

Upgrade gate: inspect upstream provenance/licenses and executable changes; repeat hidden-process,
argument, timeout, exit-status, focus, terminal-protocol and real Windows delivery checks. Rollback:
restore the preceding package/lock pair and the TALOS notification adapter together. `ui.notifications: off`
disables native delivery immediately on the next CLI launch. The actual Windows toast remains a manual
acceptance gate; successful `-v` execution is only a health check, not proof of desktop delivery.

The package also depends on deprecated `uuid` 8.3.2. TALOS does not execute that dependency through this
adapter; removing the unused wrapper dependency graph remains a distribution optimization to evaluate.

## Device wake-up notifications: web-push 3.6.7

- Package: `web-push` `3.6.7`, pinned exactly in the package and lock files.
- Upstream: https://github.com/web-push-libs/web-push/tree/v3.6.7
- npm integrity: `sha512-OpiIUe8cuGjrj3mMBFWY+e4MMIkW3SVT+7vEIjvD9kejGUypv8GPDf84JdPWskK8zMRIJ6xYGm+Kxr8YkPyA0A==`
- License: MPL-2.0 (Copyright 2015 Marco Castelluccio). Full text: https://mozilla.org/MPL/2.0/

Used by remote control to wake a paired device when a session needs it. TALOS does not modify it: the unmodified
source is inlined into the kernel bundle (`kernel/`) together with its dependencies, whose licences are listed with
it in `kernel/THIRD_PARTY_LICENSES.txt`. The Source Code Form of this exact version is available from the upstream
tag above and from the npm registry tarball `web-push@3.6.7`.

## Other direct runtime dependencies

| Component | Upstream | License |
|---|---|---|
| ink 7.1.1 | https://github.com/vadimdemedes/ink | MIT |
| react 19.3.0 | https://github.com/facebook/react | MIT |
| string-width 8.2.2 | https://github.com/sindresorhus/string-width | MIT |
