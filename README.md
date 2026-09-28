<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="mobile/docs/immagini/talos-logo-chiaro.png">
    <img src="mobile/docs/immagini/talos-logo.png" alt="TALOS" width="360">
  </picture>
</p>

# TALOS

**Your AI. Your devices. Your models. Your rules.**

TALOS Mobile is a personal AI agent that reasons, remembers, researches and acts across your Android phone.
TALOS Desktop is a local coding workspace for Windows, with a terminal, file review and persistent agent sessions.

[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

## Mobile (Android)

Use a compatible GGUF model on your device or connect the cloud model you choose with your own API key. Actions pass through explicit permissions; observable outcomes are checked before success is reported.

Install the **signed APK** from [Releases](https://github.com/Ninozzz95/talos/releases), choosing a mobile tag **`v*`** such as `v0.1.30`. Check the release's SHA256 before installing. Keep the existing app installed to preserve its data when updating.

[Mobile guide, requirements and screenshots →](mobile/README.md)

## Desktop (Windows)

A Windows application containing the local service and coding interface, with a choice of model providers. Sessions and project work stay on your computer.

Desktop releases use tags **`desktop-v*`** in the same [Releases](https://github.com/Ninozzz95/talos/releases) page. Choose the **unsigned NSIS installer** `TALOS-Setup-<version>.exe`, or extract the complete `TALOS-<version>-win.zip` and open `TALOS.exe`. Node.js is included. The required platform is **Windows 10 1809+ x64 or Windows 11 x64**; compatibility checks and release readiness are recorded in the desktop guide.

The unsigned installer may trigger Windows SmartScreen. Verify its source and published SHA256 before choosing **More info → Run anyway**.
If your device policy prevents running it, contact its administrator; keep SmartScreen and Defender enabled.

Desktop release automation is prepared; consult the published assets and [desktop guide](harness-ui/desktop/README.md) for availability and remaining validation before installing.

[Desktop installation, development and limitations →](harness-ui/desktop/README.md)

## Local-first, no telemetry

Neither product requires a TALOS account or sends TALOS telemetry. Local models run on your device. Choosing a cloud provider, searching the web or downloading a model uses the network for that action.

The source tree keeps each product in its own place: [`mobile/`](mobile/README.md), [`harness-ui/`](harness-ui/README.md), and the shared desktop context component [`context-engine/`](context-engine/).
Mobile release notes remain in [CHANGELOG.md](CHANGELOG.md); desktop notes are in [harness-ui/desktop/CHANGELOG.md](harness-ui/desktop/CHANGELOG.md).

For mobile contributions and security details, see [its contribution guide](mobile/CONTRIBUTING.md) and [security policy](mobile/SECURITY.md). Report vulnerabilities in either product through this repository's private security reporting. The [Code of Conduct](CODE_OF_CONDUCT.md) applies to the whole project.

## License

TALOS is licensed under **AGPL-3.0-only**, across the monorepo. If you modify TALOS and let users interact with that modified version over a network, you must offer those users its corresponding source code, including your changes, free of charge.

See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party components retain their own licenses: [monorepo notices](THIRD_PARTY_NOTICES.md), [desktop notices](harness-ui/THIRD_PARTY_NOTICES.md), and [context-engine notices](context-engine/THIRD_PARTY_NOTICES.md).
