# P1 Library device-export design

Date: 2026-07-28

## Single job

Audience: a TALOS mobile user who owns a file in the encrypted Library.
Job: create an explicit, durable copy at a user-chosen device location without
mistaking TALOS-private retention, cache, sharing, or an unverified attempt for
a successful save.

## Human flow

```text
Library row / viewer                  Chat request
        |                                  |
   Save to device                  "save report.pdf
        |                           on my phone"
        |                                  |
        |                         write-consent sheet
        +---------------+------------------+
                        |
              Android system Save-As
                        |
              user chooses destination
                        |
      verified copy count == Vault byte count
                        |
             cache removed; success shown
```

Cancellation ends at the picker and reports that no copy was saved. It never
becomes a success toast or a successful tool audit row.

## Manual surface contract

1. Global Library list rows show a 44px `Save <name> to device` action.
2. Global Library grid tiles show the same action without nesting it inside the
   Open/Select button.
3. Global image and document viewers retain a Save action while open.
4. `Media in this chat` rows and its viewer expose the same action.
5. The action is available only for `status === available`.
6. One export may own the system picker at a time; repeat taps do not open
   multiple activities.
7. Success/cancellation is announced through the existing toast region; read
   or export failures remain visible in the owning surface's error region.
8. Open, attach, select, delete, share/readability, and Back behavior remain
   unchanged.

## Native byte contract

`saveTalosVaultFileToDevice(input)` is the single JavaScript entry point.

Native path:

1. normalize the suggested display name and MIME type;
2. write the bytes to a random direct child of `Directory.Cache/talos-export`;
3. resolve its `file://` URI;
4. call `TalosFileExport.saveFile` with URI, name, MIME type, and expected byte
   count;
5. native policy canonicalizes the path and accepts only a direct child of
   `<app-cache>/talos-export`;
6. launch `ACTION_CREATE_DOCUMENT` with `CATEGORY_OPENABLE`, MIME, and
   `EXTRA_TITLE`;
7. on success, copy on the Capacitor worker executor, count bytes, and require
   exact equality; delete a partial destination on failure;
8. return only `saved`, final display name, and bytes written;
9. remove the private staged file in `finally`.

Web development/E2E falls back to a Blob download and reports `started`, not a
native verified save. Android cancellation returns `cancelled`.

Stable native/JavaScript error codes:

- `TALOS_FILE_EXPORT_BUSY`
- `TALOS_FILE_EXPORT_INVALID_INPUT`
- `TALOS_FILE_EXPORT_UNTRUSTED_SOURCE`
- `TALOS_FILE_EXPORT_SOURCE_MISSING`
- `TALOS_FILE_EXPORT_SIZE_MISMATCH`
- `TALOS_FILE_EXPORT_FAILED`

## Natural-language contract

New tool: `library_export`.

- Action: `write`; existing permission settings and consent queue govern it.
- Input: one `reference`, either an exact Library id or exact visible filename.
- It is offered only when Library context is enabled, byte access exists, the
  save adapter exists, and `write` is not denied.
- Candidates are available generated files plus uploaded files whose
  `library_shared` flag is not false.
- Id wins over name; case-insensitive exact filename matching is allowed.
- No fuzzy matching. Duplicate exact filenames fail as ambiguous rather than
  exporting the wrong bytes.
- The file is re-authorized immediately before bytes are read.
- A user request that creates then exports a file must use a later tool round
  and the id/name returned by the creation tool; it must not guess in parallel.
- The system prompt distinguishes private Library retention from device
  export. It may offer a phone copy once after creation when useful, but it
  never invokes the picker unless the user asked or accepted.
- Success evidence contains Library id, display name, delivery mode, and byte
  count. It contains no file body or destination URI.

## Compatibility and accessibility

- Existing component props/events/test ids remain stable.
- New buttons have complete accessible names and at least the existing 44px
  TALOS target.
- Button actions are siblings, never nested interactive elements.
- The Android system owns destination focus/navigation.
- No new permission or Android manifest storage declaration is added.
- No Vault schema, file metadata, or chat transcript format changes.
- A shared copy is independent: deleting it in Files does not alter the TALOS
  Library, and deleting the Library item does not revoke an already exported
  copy.

