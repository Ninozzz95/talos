<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="mobile/docs/immagini/talos-logo-chiaro.png">
    <img src="mobile/docs/immagini/talos-logo.png" alt="TALOS" width="360">
  </picture>
</p>

# TALOS

**Your AI. Your devices. Your models. Your rules.**

TALOS is an open-source AI agent ecosystem with three public surfaces:

- **CLI** — a terminal-first coding agent with persistent conversations, tools, permissions and workspace checkpoints.
- **Desktop** — a local coding workspace for Windows, with a terminal, file review and persistent agent sessions.
- **Android** — a personal AI agent that reasons, remembers, researches and acts across your phone, including compatible GGUF models running on-device through llama.cpp.

<p>
  <a href="https://www.talos-code.com/"><strong>Website</strong></a>
  ·
  <a href="https://github.com/Ninozzz95/talos/releases"><strong>Releases</strong></a>
</p>

[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

## CLI

Install the terminal agent from npm:

```bash
npm i -g talos-code
talos
```

CLI releases use tags **`talos-cli-v*`** on the shared [Releases](https://github.com/Ninozzz95/talos/releases) page. Release notes document the supported platform, verification results and known limits for each version.

The CLI is built for repository work from the terminal: persistent conversations, tool use, explicit permission changes and workspace checkpoints around mutations.

## Desktop (Windows)

A Windows application containing the local service and coding interface, with a choice of model providers. Sessions and project work stay on your computer.

Desktop releases use tags **`desktop-v*`** in the same [Releases](https://github.com/Ninozzz95/talos/releases) page. Choose the **unsigned NSIS installer** `TALOS-Setup-<version>.exe`, or extract the complete `TALOS-<version>-win.zip` and open `TALOS.exe`. Node.js is included. The required platform is **Windows 10 1809+ x64 or Windows 11 x64**; compatibility checks and release readiness are recorded in the desktop guide.

The unsigned installer may trigger Windows SmartScreen. Verify its source and published SHA256 before choosing **More info → Run anyway**.
If your device policy prevents running it, contact its administrator; keep SmartScreen and Defender enabled.

Desktop release automation is prepared; consult the published assets and [desktop guide](harness-ui/desktop/README.md) for availability and remaining validation before installing.

[Desktop installation, development and limitations →](harness-ui/desktop/README.md)

## Android

Use a compatible GGUF model on your device or connect the cloud model you choose with your own API key. Actions pass through explicit permissions; observable outcomes are checked before success is reported.

Install the **signed APK** from [Releases](https://github.com/Ninozzz95/talos/releases), choosing a mobile tag **`v*`**. Check the release's SHA256 before installing. Keep the existing app installed to preserve its data when updating.

[Android guide, requirements and screenshots →](mobile/README.md)

## Local-first, no telemetry

The documented Desktop and Android products do not require a TALOS account or send TALOS telemetry. Local models run on your device. Choosing a cloud provider, searching the web or downloading a model uses the network for that action.

Across the ecosystem, TALOS is designed around model choice rather than a single provider: use local models where supported, connect Ollama, or use a cloud provider when that is the better fit.

## Source and development

The public repository contains the Android product under [`mobile/`](mobile/README.md), the Desktop harness under [`harness-ui/`](harness-ui/README.md), and the shared Desktop context component under [`context-engine/`](context-engine/).

CLI distributions are published as **`talos-code`** on npm and tracked through **`talos-cli-v*`** release tags on this repository.

Mobile release notes remain in [CHANGELOG.md](CHANGELOG.md); desktop notes are in [harness-ui/desktop/CHANGELOG.md](harness-ui/desktop/CHANGELOG.md). CLI release notes are published with the corresponding GitHub release.

For mobile contributions and security details, see [its contribution guide](mobile/CONTRIBUTING.md) and [security policy](mobile/SECURITY.md). Report vulnerabilities through this repository's private security reporting. The [Code of Conduct](CODE_OF_CONDUCT.md) applies to the whole project.

## License

TALOS is licensed under **AGPL-3.0-only**, across the monorepo. If you modify TALOS and let users interact with that modified version over a network, you must offer those users its corresponding source code, including your changes, free of charge.

See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party components retain their own licenses: [monorepo notices](THIRD_PARTY_NOTICES.md), [desktop notices](harness-ui/THIRD_PARTY_NOTICES.md), and [context-engine notices](context-engine/THIRD_PARTY_NOTICES.md).
