# TALOS Mobile Model Lab Parity Design

Date: 2026-07-22
Owner: Codex mobile lane
Research: `docs/superpowers/research/2026-07-22-talos-mobile-model-lab-parity-research.md`
Status: APPROVED BY THE MOBILE ABSOLUTE-PARITY PROGRAM

## User-visible contract

The Models detail in Settings becomes the standalone mobile Model Lab with two APG
tabs:

1. **Providers** owns secure key rotation/removal, real discovery state, custom
   OpenAI-compatible/Ollama base URLs, timeout, retry and manual model-ID recovery.
2. **Catalog** owns search, provider filters, compatibility and capability metadata,
   default selection, composer visibility, display-name overrides and a real
   completion probe for each callable model.

The quick picker in Chat and Model Lab consume one shared projection. Changes apply
without reload and survive relaunch. Hiding the active model selects the next
callable visible model; it never leaves a hidden stale selection behind.

## Local-first state

`modelLabContracts.ts` defines a versioned, bounded, fail-closed Preferences value:

- manual model definitions;
- per-model display-name and visibility overrides;
- per-provider timeout seconds;
- bounded completion-probe evidence.

Provider keys remain exclusively in secure storage. Base URLs remain in the
existing endpoint store. No prompt, response body or credential enters Model Lab
preferences.

## Real probe

`ChatController.probeModel(profileId)` performs one non-streaming completion through
the same adapter, credential, endpoint and timeout used by Chat. The request asks for
the sentinel `TALOS_PROBE_OK`; success requires that exact normalized sentinel. The
stored record contains provider/model, boolean status, timestamp, latency and a
bounded safe message only. Failures redact the credential and update the card without
opening another surface.

Discovery remains `refreshProvider(provider)` and is never relabelled as a model
probe.

## Provider runtime options

- Ollama, OpenAI, DeepSeek and OpenRouter expose an optional explicit base URL.
- Empty remote base URL means the adapter's official default.
- Ollama still requires an explicit device-reachable endpoint.
- Timeout is 5-300 seconds and reaches Capacitor HTTP as connect/read milliseconds.
- URLs accept HTTP(S), reject embedded credentials and are shown before save.

## Manual model recovery

An Advanced disclosure accepts provider, model ID, display name and user-declared
capability switches. It is a real local profile consumed by the adapter, not a mock
catalog row. It remains unavailable until its provider credential/endpoint exists.
Discovered metadata always retains observed provenance; manual capability values are
visibly labelled declared.

## Bundle and regression boundaries

Provider modules become dynamic adapter entries behind stable synchronous registry
proxies. Model Lab catalog/advanced components are async descendants of the already
dynamic Settings route. The 512000-byte initial JavaScript maximum is unchanged.
Existing chat, enhancer, model picker, effort, persistence and provider wire tests
remain mandatory.

