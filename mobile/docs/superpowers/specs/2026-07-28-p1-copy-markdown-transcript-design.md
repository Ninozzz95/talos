# Design - P1 copy Markdown transcript

Date: 2026-07-28

## Contract

`TalosMobileSessionExportSheet` keeps its existing generation workflow. Once
the selected artifact is the Markdown transcript, the generated section shows
an explicit `Copy Markdown transcript` action.

The action:

1. is absent before generation and for JSON/context/benchmark artifacts;
2. writes `generated.content` through `writeTalosClipboardText(...)`;
3. never rebuilds, reformats, strips, or truncates the transcript;
4. disables duplicate activation while the write promise is pending;
5. changes to `Copied Markdown transcript` only after the upstream promise
   resolves;
6. exposes the same success through a polite status region;
7. reports a controlled, actionable alert if the platform rejects the write;
8. resets its success state when another artifact is generated.

Share / Save and Save to Library remain separate actions. Copying does not
write a file, create a Library record, close the sheet, or call a provider.

## UI placement

The copy action lives immediately below the Markdown preview and before
Share / Save. It uses the existing full-width secondary-action grammar and a
Copy icon. The action is intentionally not added to the format card: generation
continues to be the single snapshot boundary, so the user copies exactly what
is visible in the preview.

## Failure behavior

Clipboard rejection leaves the preview and other delivery actions usable. The
alert reads:

`TALOS could not copy the Markdown transcript. Use Share / Save instead.`

Raw `NotAllowedError`, bridge codes, and transcript content are not put in the
error UI or device log.

## Rollback

Remove the copy-specific state, handler, button, and focused tests. The existing
four export formats and both delivery paths remain untouched.

