# P2-F design - One Library type contract

## Goal

The global Library, Media in this chat, and the chat agent must give every vault
record one stable product type without changing its stored bytes or access
policy.

## Canonical classification

`talosLibraryFileType(file)` returns exactly one type:

1. `metadata.kind === "web_source"` -> `link`, regardless of MIME;
2. otherwise `media_type` beginning with `image/` -> `image`;
3. otherwise -> `document`.

`matchesTalosLibrarySurfaceTab(file, tab)` applies the shared mobile surface
contract:

- `all`: image and document artifacts;
- `images`: image only;
- `files`: document only;
- `links`: link only.

Here `All` is the complete file collection; research addresses have their own
Links projection. The encrypted Markdown retained behind a link remains
available through Open saved copy, but is not duplicated as a document tile.

## Integration

- Global Library applies the shared matcher before text/origin filtering.
- Media in this chat applies the same matcher to its already session-scoped
  available records.
- `library_list` maps repository summaries with the same classifier. Its
  `file_type=all` wire query still returns all three canonical types.
- `TalosLibraryFileType` moves to `vaultLibrary.ts` and is re-exported from
  `readTools.ts`, preserving the existing public import path.
- Header scope counts continue to describe stored vault artifacts across the
  tabs; `Links (n)` continues to count unique projected addresses. Image counts
  use the canonical classifier so a malformed source MIME cannot inflate them.
- Existing `aria-pressed`, labels, touch targets, search, origin filtering,
  retained-copy opening and live-browser opening stay stable.

## Permanent scenarios

- `LIB-FILTER-PARITY-01 global All and Files never render a web-source backing transcript`
- `LIB-FILTER-PARITY-02 source kind wins over an image-looking MIME`
- `LIB-FILTER-PARITY-03 global and chat surfaces produce identical tab membership`
- `LIB-FILTER-PARITY-04 agent Library entries use the same canonical type`
- `LIB-FILTER-PARITY-05 repository file_type=all still returns every canonical type`
- `LIB-FILTER-PARITY-06 link rows retain their encrypted-copy and browser actions`

## Verification

Establish a current-screen RED, implement the pure boundary, then run focused
pure/UI/tool tests, typecheck, the affected Library/chat/tool matrix, production
build, relevant Playwright journeys, and `git diff --check`. Physical Android
inspection remains in the final owner checklist.

