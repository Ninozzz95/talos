# TALOS Desktop changelog

Format: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versions follow
[SemVer](https://semver.org/): in 0.y.z anything may still change. The version lives in
`package.json` and in the `desktop-vX.Y.Z` tag.

## Unreleased

## desktop-v0.1.1 — 2026-09-13

First published release. Compared with the `desktop-v0.1.0` tag (whose release job failed on its
first run on GitHub runners and published nothing):

### Fixed
- Release pipeline: tests that measure the development repository (per-folder agent
  instructions, mockup fidelity, a benchmark against an old commit) now declare themselves
  skipped in the public tree instead of failing; tests that assumed the owner's machine
  (short 8.3 temp paths, a non-writable drive root, Italian PowerShell messages) now hold on a
  GitHub runner too.
- `labs/feature-flags.json` ships with the package: it is product configuration read by the
  server (`TALOS_LABS`).
- First-run: with the local engine selected and no model on disk, the setup screen listed the
  cloud catalogue; it now lists only local models and says when there are none.
- Downloading a model without a licence field answered "Internal error"; the request is now
  rejected up front with the missing field named.
- The session list showed the raw local model identifier (`local:…-gguf`); it now shows a
  readable name.

## desktop-v0.1.0 — 2026-09-13 (tag only, no release published)

**What it does not do yet:** it is not code-signed (Windows shows SmartScreen), it does not
update itself, it ships no GGUF models (download them from the app), and it has not been tested on
Windows 10 1809 nor on a machine without a Vulkan driver. With very small models a run that uses
a tool may stop at the second turn.

### Added
- **Electron 44.3.0** shell of the same TALOS interface, with Node included, local service,
  kernel and context engine.
- **Per-user NSIS installer**, no administrator rights, **unsigned**, plus a complete zip; user
  data is kept after uninstall.
- **llama.cpp b10517** engine, CPU and Vulkan builds, bundled and verified by SHA-256; GGUF
  models are not bundled.
- The local engine is chosen from the machine: Vulkan only if it lists a device; if the card is
  missing or lost while loading, the model restarts once on the processor; **Local engine** menu
  (Automatic · Graphics card · Processor); engine state in the Model Lab.
- Windows release workflow for `desktop-vX.Y.Z` tags: regression gates, build, silent install /
  start / reload / uninstall smoke test, SHA-256 sums and provenance attestations.

### Changed
- Project licence: **AGPL-3.0-only** across the monorepo; third-party components keep their own
  licences.
- The public repository is a monorepo: the mobile app in `mobile/`, the desktop in `harness-ui/`
  and `context-engine/`.

### Security
- No telemetry. Remote providers and model downloads use the network only for that action.
- Renderer without Node or preload, context isolation and sandbox on, navigation and new windows
  outside the local origin blocked (official Electron security checklist).

### Measured (owner's machine: Windows 11 Pro 26200 x64, Ryzen 7 7800X3D, ~32 GB RAM)

| Measure | Value |
| --- | --- |
| Installer | **145.0 MiB** (152,067,178 bytes) |
| RAM at rest, shell + service | **611 MiB**, 10 s after the page is ready |
| First visible window | **3.82 s** from the instrumented launch of the installed executable |
| Download of a 639 MB GGUF from Hugging Face, checksum verified | 15 s |
| Model load on Vulkan (0.6B, Q8_0) | 2.1 s |
| First response token, local model, no tools | 125 ms |

Times are measured with Playwright and do not include a manual double-click or SmartScreen;
they are not a guarantee on other machines.
