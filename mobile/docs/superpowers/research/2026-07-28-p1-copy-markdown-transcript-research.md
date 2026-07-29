# Research dossier - P1 copy Markdown transcript

Date: 2026-07-28

## Local problem statement

The immutable owner transcript records this exact request at
`2026-07-28T08:03:49.440Z`:

> bisogna mettere anche il pulsante copia markdown transcript

The next Claude turn was a quota error, so no implementation decision followed.
Current mobile behavior already:

- builds the canonical local Markdown with
  `buildTalosMobileMarkdownExport(...)`;
- previews the generated content in `TalosMobileSessionExportSheet`;
- offers Share / Save and Save to Library;
- writes message/code text through the shared
  `writeTalosClipboardText(...)` boundary.

The missing capability is therefore a user-triggered copy of the already
generated Markdown preview, not a second transcript formatter.

## Current primary sources inspected

### Capacitor Clipboard v8

- Official documentation:
  https://capacitorjs.com/docs/apis/clipboard
- Inspected 2026-07-28.
- The official v8 API exposes `Clipboard.write({ string }) => Promise<void>`.
- Repository pin: `@capacitor/clipboard@8.0.1`.

Decision: adopt directly through the existing TALOS clipboard adapter. No new
plugin, native fork, or duplicate bridge.

### W3C Clipboard API

- Latest published working draft inspected:
  https://www.w3.org/TR/clipboard-apis/
- Published version shown during inspection: 2026-06-24.
- Clipboard writes are a powerful feature subject to permission and user-agent
  policy. The specification expressly treats a trusted user copy action as the
  expected trigger and requires implementations to handle excessive payloads
  gracefully.

Decision: copy only from an explicit button activation. Never write the
transcript during generation, sheet opening, or reactive updates.

### Web platform fallback

- MDN `Clipboard.writeText()`:
  https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
- Inspected 2026-07-28.
- The promise resolves only after the clipboard is updated; web use requires a
  secure context and can reject with `NotAllowedError`.

Decision: keep the existing `navigator.clipboard.writeText` adapter and surface
a controlled action error. Reject a home-grown `execCommand` fallback because
it would duplicate an obsolete path and could report success without the
canonical async contract.

### Android copy feedback

- Android Developers copy/paste guidance:
  https://developer.android.com/develop/ui/views/touch-and-input/copy-paste
- Inspected 2026-07-28.
- Android 13+ supplies standard clipboard confirmation and warns against
  duplicate toast/snackbar feedback. Older Android versions still need app
  feedback.

Decision: use a compact in-control state plus an assistive `role=status`, not a
second toast or snackbar. This remains useful on old Android and does not create
another overlay on Android 13+.

## Adopt / adapt / reject record

- Adopt: pinned Capacitor Clipboard `8.0.1` native write.
- Adapt: the same operation behind AVM-owned
  `writeTalosClipboardText(...)`, which also normalizes the web path and
  propagates rejection.
- Reject: a second transcript builder, automatic copying, clipboard reads,
  `document.execCommand('copy')`, truncation, and silent failure.

## Security and privacy boundary

- The clipboard is system-wide and replaces its previous content.
- The exact preview is copied only after a direct user action.
- No clipboard content is read.
- No provider key, storage path, or hidden app state is appended.
- A platform failure is reported without leaking raw bridge or permission
  details.
- Oversized transcripts fail visibly; TALOS never silently copies a truncated
  transcript.

