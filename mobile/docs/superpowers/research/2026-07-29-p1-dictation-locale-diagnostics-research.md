# P1 dictation locale and diagnostic-severity research

Date: 2026-07-29  
Lane: `lane/kimi-mobile`  
Subsystems: TALOS mobile speech input, Settings, Doctor diagnostics

## Local evidence

The owner-provided `talos.diagnostics/1` payload reports a healthy native
recognizer:

- plugin registered and resolved synchronously;
- `@capgo/capacitor-speech-recognition` version `8.0.10` on that APK;
- microphone permission granted;
- recognizer available.

Despite that, every successful deep probe is appended to `Recent issues` under
`TALOS_SPEECH_DEEP`. The diagnostics object also stores the complete successful
step trace in its field named `error`, so the Account panel prefixes a healthy
probe with “Error”. This is a classification defect, not a speech-plugin
failure.

The current dictation runtime also:

- lets the native plugin/device choose a language implicitly;
- pins the web recognizer to `navigator.language`;
- has no persisted speech-input language distinct from UI language;
- sends several English-only runtime error strings directly to the Italian UI.

## Primary sources

### Maintained plugin contract

- Capgo Speech Recognition:
  https://capgo.app/docs/plugins/speech-recognition/
- Capgo generated API reference:
  https://capgo.app/docs/plugins/speech-recognition/getting-started/
- pinned package source of truth:
  `node_modules/@capgo/capacitor-speech-recognition/dist/esm/definitions.d.ts`

The installed and package-lock-pinned `8.1.7` contract accepts a BCP 47
`language` on `start`; omitting it uses the device language. It also exposes
`getSupportedLanguages`, but the maintained documentation warns that Android
13+ may return an empty list. TALOS therefore must not claim that this call is
a complete device-language catalog.

### Platform language contract

- Android `RecognizerIntent`:
  https://developer.android.com/reference/android/speech/RecognizerIntent

Android identifies recognizer languages with IETF/BCP 47 locale tags. Explicit
language models may need to exist on the device, so a safe default must continue
to omit the override and let the platform choose.

### Diagnostic severity

- OpenTelemetry Logs Data Model:
  https://opentelemetry.io/docs/specs/otel/logs/data-model/

OpenTelemetry distinguishes informational records from erroneous situations.
It recommends INFO for non-errors and ERROR only for erroneous events. A UI
named “Recent issues” must therefore not receive a successful capability
probe. TALOS retains the success trace in the diagnostic result while logging
only failed steps to its issue ring.

## Mature product comparison

- ChatGPT Voice:
  https://help.openai.com/en/articles/20001274
  - exposes Settings > Voice > Language;
  - states that selecting the language spoken most often improves recognition.
- Claude Mobile dictation:
  https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile
  - keeps dictation distinct from voice conversation;
  - asks for a speech-input language and allows changing it later in Settings;
  - lists Italian and English among supported choices.

Both mature products treat speech-input language as different from interface
language. TALOS should preserve that separation, already recorded in the
localization research, without adding another mandatory onboarding page.

## Upstream decision

Adopt the pinned Capgo `language` option directly behind the existing
`TalosDictationEngine` adapter.

- Version: `@capgo/capacitor-speech-recognition@8.1.7`.
- License/provenance: already pinned and recorded by the mobile project.
- Default: `system`, represented by omitting `language`.
- Explicit choices in this reviewed release: `en` -> `en-US`,
  `it` -> `it-IT`.
- Persistence: existing bounded `voice` Settings subtree.

The explicit list intentionally matches the two fully reviewed TALOS UI
languages. A device configured for another recognizer language remains
supported through `system`; TALOS does not fabricate a complete language list
from the unreliable Android 13+ enumeration API.

Adapt OpenTelemetry severity semantics rather than adding an observability
package: keep the bounded AVM issue ring for failures, keep a separate
successful trace in `TalosDictationDiagnostics.trace`, and make
`TalosDictationDiagnostics.error` nullable and truthful.

Normalize plugin failures to bounded TALOS-owned error codes before they reach
UI. Preserve raw native detail only in the redacted diagnostic issue channel.
This prevents arbitrary recognizer messages from bypassing localization or
appearing as application chrome.

