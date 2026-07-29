# P1 dictation locale and diagnostic-severity design

## Outcome

Settings > Appearance > Voice exposes a speech-input language independent from
the application UI and text-to-speech voice:

- Follow device (default);
- English;
- Italiano.

The choice persists, survives reload, and is supplied to the real native or web
recognizer at the start of every new dictation session. Changing it never
changes UI locale, conversation language, stored prompts, or synthesis voice.

A healthy Doctor speech probe:

- reports `error: null`;
- retains its bounded step chain in `trace`;
- creates no `Recent issues` row;
- may include the trace in debug-enabled copied diagnostics.

A failed step remains visible and actionable, with the raw bounded detail
confined to diagnostics.

## Pure policy boundary

`dictationPolicy.ts` owns:

- `TalosDictationLanguageMode = "system" | "en" | "it"`;
- `TalosDictationErrorCode`;
- `parseTalosDictationLanguageMode(value)`;
- `resolveTalosDictationLanguageTag(mode)`.

Unknown persisted values fail to `system`. System returns `undefined`, which is
the upstream plugin contract for the device language. Explicit values resolve
to fixed BCP 47 tags.

## Adapter boundary

`TalosDictationEngine.start(events, options?)` gains an optional bounded
`language`. Native passes it to Capgo `start`; web assigns it to
`SpeechRecognition.lang`, falling back to `navigator.language`.

The adapter maps platform failures to TALOS error codes. Raw plugin codes and
messages are written only to the existing redacted device-issue path. The
composable maps codes and its own liveness failures through a caller-supplied
localized message function. `ChatScreen` supplies the live locale translator,
so a language change does not require recreating the app or recognizer.

## Settings UI

The dictation-language control remains visible even when text-to-speech is not
supported. Synthesis voice/rate/pitch/preview remain conditional on the device
synthesizer and retain their existing behavior.

No first-use blocker is added. “Follow device” gives correct zero-configuration
behavior; the explicit override is available for multilingual users and
recognition corrections.

## Compatibility and rollback

- Existing settings JSON remains valid; the new field defaults safely.
- Existing engine callers remain valid because options are optional.
- Existing mic visibility, partial transcript composition, liveness
  watchdogs, waveform, cancel and stop behavior remain unchanged.
- No dependency, permission, Android manifest, database, or schema migration is
  introduced.
- Rollback removes the added preference/control and restores the optional
  adapter argument. Stored unknown data is ignored by older builds.

