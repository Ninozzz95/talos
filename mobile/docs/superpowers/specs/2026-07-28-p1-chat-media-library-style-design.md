# P1 Chat-media / global-Library style design

Date: 2026-07-28

## Single job

Audience: a TALOS mobile user locating files associated with the current chat.
Job: identify, open, and understand a file's origin/readability without
mistaking this scoped collection for a separate Library product.

## Layout

```text
CHAT LIBRARY                                      [x]
Media
in "Current chat" - 4 items, 1 image

[ All ] [ Images ] [ Files ] [ Sources (2) ]

[48x48]  File name
 [PDF]   provenance / generated status
         Any chat may read it                 [switch]
```

The shared global row uses the same thumbnail/name/meta geometry and places its
Attach/Delete actions in the trailing slot.

The 48px leading region is a shared file glyph. A real image thumbnail remains
visible, with its extension label at the bottom. Other files show a distinct
family silhouette with the actual extension directly below it. The optional
global grid uses the same glyph and extension contract.

## Contract

1. Both surfaces render their list mode through
   `TalosMobileLibraryFileRow`.
2. The row owns shared thumbnail fallback, headline typography, list-item
   semantics, selection affordance, and trailing-action layout.
3. Global Library behavior (selection, attach, delete, open, optional grid)
   remains unchanged.
4. Per-chat behavior (scope union, source filtering, provenance, read switch,
   preview/external open, modal/back handling) remains unchanged.
5. Per-chat filters use the global Library filter-chip visual contract and
   expose `aria-pressed`.
6. Both Libraries derive icon kind and extension label from one pure
   `talosLibraryFilePresentation()` function.
7. The file-type cue always combines shape and text; it never relies on color.
8. The glyph is decorative to assistive technology because the enclosing
   control's accessible name already identifies the complete filename.
9. Existing public component props/events and existing test IDs remain stable.
10. The panel remains usable at 320px with no horizontal document overflow.

## Human-visible acceptance

With the same uploaded file visible in both surfaces:

- thumbnail geometry is identical;
- filename computed font size is identical;
- All-filter target height is identical and at least the TALOS 44px baseline;
- the same file shows the same icon-kind hook and extension text in chat,
  global list, and global grid;
- PDF, DOCX, XLSX, PPTX, image, source-code, and generic fixtures do not collapse
  to one generic document icon;
- list ordering and chat-specific metadata are readable without horizontal
  overflow;
- tapping the row still opens the file, and the read switch remains independent
  from row activation.
