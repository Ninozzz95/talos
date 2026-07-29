# P1 Library overflow and sharing-control design

## Outcome

Every available file in the global Library has one 48 px More trigger in both
grid and list views. It opens Attach to message, Save to phone, and Delete.
Delete continues through the existing confirmation dialog.

Every file in the per-chat Library has one 48 px More trigger. It opens Open and
Save to phone. Uploaded files also receive a checkable “Any chat may read it”
item. Generated files keep an honest visible non-reuse status and receive no
ineffective checkbox.

## Owned menu boundary

`TalosMobileLibraryActionsMenu.vue` accepts:

- an accessible trigger label;
- a stable trigger test id;
- a list of action records (`id`, visible label, optional accessible label,
  icon, disabled state, tone);
- checkable records with a controlled `checked` value.

It emits `select(id, checked?)`. Callers retain all product behavior and
persistence. The component owns Reka primitives, visual styling, 48 px targets,
menu roles, focus restoration, viewport collision, and destructive color.

## Readability state

The stored `metadata.library_shared` value remains the only source of truth.
Uploaded rows show a compact visible status beside provenance:

- shared: any chat may read the file;
- private: only chats where it is explicitly attached may read it.

On selection, the requested boolean is passed to `setShared`. The item is
disabled only for that file while its write is in flight. Concurrent changes to
different files remain possible. A refusal reports the existing actionable
error, and reopening the menu reflects unchanged stored metadata.

At phone widths up to 639 px, origin prose may yield space to the
model-access state; the filename, file glyph, More trigger, and access state
remain available. Tablet layouts retain both provenance and access state.

## Compatibility contracts

- Thumbnail and filename still open/select the row.
- Bulk-selection mode shows no per-file More triggers.
- Existing viewer Save/Close controls remain available.
- External-open formats retain the existing app handoff.
- Failed/pending files do not gain live actions.
- Generated files remain excluded from model context.
- Device export, attach, and delete call the existing implementations.
- No dependency or bundle-budget increase is authorized.
