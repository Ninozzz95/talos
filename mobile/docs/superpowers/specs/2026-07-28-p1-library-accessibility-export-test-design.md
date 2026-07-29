# Design - P1 Library accessibility and native export testing

Date: 2026-07-28

Status: approved by the owner's autonomous sequential-fix instruction.

## Slice C1 - 48dp Library interaction targets

Only the global Library and chat-scoped media Library are changed.

- Icon buttons use a 48px target while retaining the current 16/20px icon.
- filter chips, search, menu entries, row filename buttons, and switch labels
  have a minimum 48px height;
- list/grid/viewer actions have a minimum 48px width and height;
- the shared row thumbnail already uses `size-12` and remains unchanged.

Unit tests lock the utility-class contract. The real
`mobile-chat-files.e2e.spec.ts` journey measures representative bounding boxes
in both rendered surfaces and checks 48px minimum plus 320px no-overflow.

## Slice C2 - one selection state on both row controls

`TalosMobileLibraryFileRow` adds a stable
`data-talos-library-name-button` hook. Its filename button receives:

- `aria-label=openLabel`;
- `aria-pressed=selected` only when `selectionMode` is true.

The existing thumbnail button keeps the same values. Both emit the existing
`open` event; parents and bulk-selection state remain unchanged.

## Slice C3 - runtime post-picker export guard

`TalosFileExportPolicy` adds:

- package-private failure-code constants;
- `stagedSourceFailure(cache, source, expectedBytes)`;
- `postPickerSourceFailure(cache, source, expectedBytes, deletePartial)`.

The second method invokes the supplied cleanup exactly once for an untrusted
source or size mismatch and never for a valid source. The plugin invokes this
method after the picker and rejects with its returned stable code.

The Java test deletes the source-inspection scenario and executes the actual
production method with:

- an outside/untrusted temporary file;
- a trusted file whose size changed;
- a trusted file with the exact byte count.

Existing byte-copy, path, filename, MIME, TypeScript adapter, and physical SAF
tests remain.

## Human-visible acceptance

1. At 320px-equivalent portrait width, open both Libraries and verify no
   horizontal scroll.
2. Use Android Accessibility Scanner/TalkBack and verify the close, filters,
   filename, save, attach, delete, switch, menu, and viewer controls have
   comfortable focus/touch targets.
3. Enter global bulk selection and focus both the thumbnail and filename of one
   row; both must announce the same Select label and selected/not-selected
   state.
4. Save a Library file, cancel once, then save it; verify cancellation leaves
   no claimed copy and success produces the exact bytes.
5. Keep the system picker open briefly before completing to exercise the
   post-picker revalidation boundary.

## Rollback

Restore prior target classes, remove the filename state attributes, and restore
the inline plugin guards plus old test. No stored data or user file is changed.

