<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/immagini/talos-logo-chiaro.png">
    <img src="docs/immagini/talos-logo.png" alt="TALOS" width="420">
  </picture>
</p>

<p align="center">
  <strong>Your AI. Your phone. Your models. Your rules.</strong>
</p>

<p align="center">
  A local-first AI agent for Android that can reason, remember, research, create, and act across your phone — using a local GGUF model or the cloud model you choose.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache 2.0"></a>
  <a href="https://github.com/Ninozzz95/talos/actions/workflows/ci.yml"><img src="https://github.com/Ninozzz95/talos/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Android-arm64--v8a-3ddc84.svg" alt="Android arm64">
  <img src="https://img.shields.io/badge/local--first-no%20TALOS%20backend-blueviolet.svg" alt="Local first">
  <img src="https://img.shields.io/badge/tools-69-7c3aed.svg" alt="69 typed tools">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#what-talos-can-do-today">Capabilities</a> ·
  <a href="#authority-verification-and-data-safety">Security model</a> ·
  <a href="LOCAL-MODELS.md">Local models</a> ·
  <a href="BUILDING.md">Build</a> ·
  <a href="ROADMAP.md">Roadmap</a>
</p>

---

## Not another chat wrapper

TALOS is an **agentic workspace built around the phone itself**. It runs a frontier model through your own API key, an Ollama endpoint, or a GGUF model inside the Android app, and the same agent can search the web, work with documents, remember things, manage tasks and calendars, create content, inspect device state, control Android features, and act inside other apps.

The harness controls those actions through:

- **69 typed tools** across personal data, Library, web, creation, models and device capabilities;
- **progressive tool disclosure** instead of sending every schema on every turn;
- explicit **`read / write / outbound` authority** with `allow / ask / deny`;
- **postcondition verification** for observable actions;
- **local-first state**, with no required TALOS backend;
- model independence across OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Ollama and local llama.cpp.

> TALOS separates **"the model said it worked"** from **"the system observed that it worked."**

## See it

<img src="docs/immagini/tablet-1-table.png" alt="TALOS comparing live sources on a tablet">

<table>
<tr>
<td width="33%"><img src="docs/immagini/phone-5-assistant-listening.png" alt="TALOS listening over the home screen"></td>
<td width="33%"><img src="docs/immagini/phone-3-assistant-alarm.png" alt="Alarm created by TALOS"></td>
<td width="33%"><img src="docs/immagini/phone-4-assistant-torch.png" alt="Torch controlled and verified by TALOS"></td>
</tr>
<tr>
<td><b>Available over what you are doing</b><br>TALOS surfaces over the current app instead of forcing a separate workflow.</td>
<td><b>Acts on the phone</b><br>Alarms, settings, apps, media and other device capabilities are typed tools.</td>
<td><b>Checks the result</b><br>Where a postcondition is observable, success depends on what actually happened.</td>
</tr>
</table>

## Install

Releases ship a signed APK for **`arm64-v8a` on Android 8.0+**. TALOS is not on the Play Store, so Android asks you to confirm installation from an unknown source.

Verify the file against the release hash, then verify it was built by this repository's workflow:

```bash
sha256sum TALOS-<version>.apk
gh attestation verify TALOS-<version>.apk --repo Ninozzz95/talos
```

Building from source: [BUILDING.md](BUILDING.md).

## What TALOS can do today

| Area | Capabilities |
| --- | --- |
| **Chat & reasoning** | Persistent conversations, streaming, reasoning display, dictation, attachments, model switching |
| **Web & research** | Web search/read and durable research runs that can be listed, read, renamed, paused, resumed, cancelled and deleted |
| **Library / Context Vault** | Keep files on-device, search/read them into context, export, rename/delete and control context access |
| **Memory** | Search, write, update and delete typed personal/project memory |
| **Personal workspace** | Notes, tasks and calendar reads/writes |
| **Creation** | Document creation and configured image generation |
| **Local models** | Discover, inspect, download and run GGUF models through native llama.cpp |
| **Cloud / self-hosted models** | OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter and Ollama |
| **Android control** | Device status, location, torch, media, vibration, volume, alarms, apps, screenshots, settings, speech, wallpaper, wake lock |
| **System controls** | Wi-Fi, Bluetooth, airplane mode, power saving, Do Not Disturb and selected system settings where permitted |
| **Notifications & mail** | Unread-mail state, notification listing, reply and dismiss flows |
| **Cross-app actions** | Accessibility-driven screen understanding and actions inside other Android apps |
| **Voice** | Local wake word, dictation, and replies read back in your own trained voice |
| **Diagnostics** | Runtime capability checks that distinguish unavailable features from successful ones |

Android ROMs expose different capabilities. TALOS treats **unsupported**, **denied**, **failed** and **verified success** as distinct states.

## One agent, many model backends

| Backend | Connection |
| --- | --- |
| **OpenAI · Anthropic · Google Gemini · DeepSeek · OpenRouter** | Your API key |
| **Ollama** | Your endpoint |
| **Local** | GGUF through llama.cpp embedded in the Android app |

Provider adapters are lazy-loaded: a local conversation does not load every cloud-provider implementation.

### Local really means local

With a compatible GGUF loaded, inference happens on-device: native llama.cpp, an OpenCL GPU backend offered only after the device passes a real qualification check (never assumed from a chipset name), device/model-specific runtime tuning, KV-cache selection, persistent prefix-state caching, and progressive tool disclosure for constrained grammars.

**Measured on a OnePlus Pad 3**, `Holo-3.1-4B Q4_K_M` (4.84B parameters), 8 threads:

| | tokens/second |
| --- | ---: |
| prefill, 512 tokens | **65.1** ± 0.7 |
| prefill, 2048 tokens | **58.3** ± 1.2 |
| generation, 128 tokens | **12.2** ± 0.1 |

<img src="docs/immagini/tablet-8-model-detail.png" alt="Model detail page with Quantizations, Model card and Files tabs, and the runtime configuration panel">

Before downloading, TALOS browses Hugging Face from the phone, filters by what **this device** can hold, and shows for every quantisation the **RAM left after loading**, the context length assumed, and the **measured speed**, with a resource ledger that says where each number comes from.

Everything about the engine, the memory ledger and the measurements: [LOCAL-MODELS.md](LOCAL-MODELS.md).

## The harness is the product

TALOS exposes **69 typed tools**. With everything enabled, 68 definitions weigh **45,116 bytes (~12,194 tokens)** per turn. With progressive disclosure, the persistent surface drops to **1,868 bytes (4 tools)**, about **96% less**; revealing a tool costs one extra round trip the first time. Smaller surfaces also help constrained models avoid picking the wrong capability.

Reproduce the measurement:

```bash
npx vitest run tests/unit/tools/pesoDegliSchemi.test.ts
```

## Authority, verification and data safety

**Explicit authority.** Every tool declares which powers it uses, and each power has its own setting:

| Power | Meaning | Default |
| --- | --- | --- |
| **read** | Observe user/device/private state | `ask` |
| **write** | Change local state or cause an action | `ask` |
| **outbound** | Send data or an action across the device boundary | `ask` |

Each can be `allow`, `ask` or `deny`. Approval is bound to validated tool input: choosing a tool and being authorized to execute it are separate decisions.

**Postcondition verification.** A tool returning `"success": true` does not prove the world changed. Tools can define evidence to check (for a cross-app send: input field emptied, message appeared, send control changed state), so a result becomes `VERIFIED SUCCESS`, `FAILED` or `UNABLE TO CONFIRM`. When a request times out after the side effect already happened, TALOS inspects the resulting state instead of retrying blindly and duplicating the action.

**Private and untrusted data.** Content is tagged as `user-direct`, `derived` or `external`, and the agent chain tracks whether it has touched **private data** or **untrusted external content** before a later transmitting capability is allowed. Reading private data, consuming untrusted content and then transmitting outward is treated as more dangerous than any one step alone. Memories and documents are **context, not authority**: stored content cannot override the security policy.

## Local-first by architecture

**There is no TALOS backend today.** Conversations, Library content, memory and settings stay on-device. Cloud-model traffic goes directly to the configured provider. Local inference, the local "Hey TALOS" wake word (a small ONNX model) and all personal state work with no server at all. A future optional backend is intended as replication and execution infrastructure, never as a requirement.

<table>
<tr>
<td width="50%"><img src="docs/immagini/phone-1-memory-write.png" alt="Writing a memory"></td>
<td width="50%"><img src="docs/immagini/phone-2-memory-screen.png" alt="TALOS memory screen"></td>
</tr>
<tr>
<td><b>Teach it in conversation</b><br>Memory writes are agent capabilities, not a hidden side channel.</td>
<td><b>See and control what remains</b><br>Memories are typed, scoped, editable and deletable.</td>
</tr>
</table>

## Your own voice, not a stock one

<img src="docs/immagini/phone-6-voice-training.png" alt="Voice training wizard mid-recording, with a live waveform and the phrase to read" width="320">

Record twelve short phrases once, on-device, and replies are read back in *your* voice. A quiet-room check runs before the wizard starts; recordings are encrypted with a key in the hardware keystore and destroyed once the profile is built. Synthesis is [Kyutai's Pocket TTS](https://github.com/kyutai-labs/pocket-tts) (MIT) through ONNX Runtime, fully on-device. Measured on production streaming: **-23.2 LUFS**, true peak **-0.8 dBFS**, time to first audio **449–537 ms** warm. Italian speech recognition on a 6-sentence reference set: **6/6 exact, zero word error rate**.

## Android is an agent environment

```text
status        location       torch
media         vibration      volume
alarms        open app       screenshots
settings      speech         wallpaper
wake lock     Wi-Fi          Bluetooth
airplane mode power saving   Do Not Disturb
app usage     installed apps notifications
notification reply/dismiss   calendar
screen driving               file sharing
```

Some operations require Android system permissions, Accessibility or the optional ADB bridge. Availability is checked at runtime.

## Architecture

```text
┌───────────────────────────────────────────────────────┐
│                    Android / Vue UI                   │
│ Chat · Overlay · Library · Memory · Settings · Doctor│
└──────────────────────────┬────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────┐
│                     Agent Harness                     │
│                                                       │
│ model adapter       progressive tools                 │
│ permissions         authorization binding             │
│ security chain      dedup / recovery                  │
│ tool execution      postcondition verification        │
└───────────────┬───────────────────────┬───────────────┘
                │                       │
                ▼                       ▼
┌──────────────────────────┐  ┌─────────────────────────┐
│      Model backends      │  │      Capabilities       │
│ Local llama.cpp          │  │ Library / Research      │
│ OpenAI / Anthropic       │  │ Personal / Creation     │
│ Gemini / DeepSeek        │  │ Android / Other apps    │
│ OpenRouter / Ollama      │  │ Model management        │
└──────────────────────────┘  └─────────────────────────┘
```

## Permissions

Powerful Android permissions are requested only when the corresponding feature needs them.

| Permission / capability | Why TALOS may need it |
| --- | --- |
| **Microphone** | Dictation and local wake word |
| **Accessibility** | Read actionable UI structure and interact with other apps |
| **Location** | Location-specific requests |
| **Contacts** | Resolve a person for an explicit communication action |
| **Calendar** | Read or modify calendar state |
| **Camera** | Capture an attachment through the system camera |
| **Notifications** | Inspect, reply to or dismiss notification state where allowed |
| **ADB bridge** | Selected system operations Android apps cannot normally perform |

Android permissions are only one layer: agent tools must still pass TALOS's own `read / write / outbound` policy.

## What's next

A coding agent on the same rules (typed tools, explicit authority, checked results) already runs against real projects on the desktop and is being brought into the phone; the engine, the harness and the device profile keep evolving on measurements, not hunches. Directions and what is **not** shipped yet: [ROADMAP.md](ROADMAP.md).

## What TALOS is not

- **Not a TALOS-hosted SaaS proxy.** There is no required TALOS cloud backend today.
- **Not tied to one model company.** The user selects the model.
- **Not a blind macro engine.** Tools have typed contracts, security metadata and, where possible, postconditions.
- **Not "local" only because the UI is local.** TALOS has a native local inference path.
- **Not finished.** Android behavior remains partly device/OEM-specific; this is a young, actively used project and should be treated as **experimental software**.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The codebase contains extensive comments explaining **the measured failure behind guards and architectural decisions**. Many comments are in Italian; identifiers and APIs are English. Issues and pull requests in English are welcome.

TALOS was written with heavy use of AI coding editors. The vision, architecture, testing and every decision came from one human mind; every measured number in this README comes from a real-device test. More in [ROADMAP.md](ROADMAP.md#on-how-this-was-built).

> If TALOS claims that something happened in the real world, there should be a way to demonstrate why it believes that.

## License

[Apache License 2.0](LICENSE). Third-party components and shipped-binary provenance are documented in [NOTICE](NOTICE).
