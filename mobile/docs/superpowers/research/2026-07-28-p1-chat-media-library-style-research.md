# P1 Chat-media / global-Library style research

Date: 2026-07-28

## Problem named from current code and owner evidence

The immutable Claude snapshot records the original per-chat media contract:
the surface is scoped to one named chat, unions files born there with Library
files attached there, exposes provenance, and controls whether uploaded files
may be read by chats. Those semantics are correct and remain in scope.

The visual implementation has drifted from the shipped global Library:

- global Library defaults to its `list` view
  (`DEFAULT_SHELL_PREFERENCES.library_view = 'list'`) with a 48px thumbnail,
  name, metadata, and adjacent actions;
- `Media in this chat` always renders large two-column cards with metadata below
  the preview;
- global filter chips have 44px minimum height, `text-sm`, borders on inactive
  items, and an explicit selected fill;
- per-chat filters have 32px minimum height, `text-2xs`, and no inactive border.

The result is not a scoped version of one Library; it looks like a second media
product.

## Current primary sources and pins

Accessed 2026-07-28:

1. [Material Design 3 Lists](https://m3.material.io/components/lists/overview)
   is the maintained upstream list component reference. It treats a row as a
   consistent container for a leading visual, headline/supporting content, and
   trailing actions.
2. [Android Developers: Chip](https://developer.android.com/develop/ui/compose/components/chip)
   defines filter chips as controls that refine content from a set and expose
   selected state. Page last updated 2026-07-14 UTC.
3. [Android Developers: Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)
   recommends at least a 48dp by 48dp focusable touch target for interactive
   elements.
4. [WAI-ARIA APG Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
   requires composite keyboard navigation for an element advertised as an ARIA
   grid. A visual file collection that does not implement that model should
   retain native list semantics.
5. [WAI-ARIA APG Patterns](https://www.w3.org/WAI/ARIA/apg/patterns/)
   distinguishes buttons, switches, lists, and composite grid widgets; native
   semantics remain preferable when they express the interaction.
6. [WCAG 2.2 Understanding SC 1.4.1: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
   says color must not be the only visual means of distinguishing information
   and explicitly recommends adding shape or text. Page updated 2025-09-16.
7. [IANA Media Types](https://www.iana.org/assignments/media-types/media-types.xhtml)
   is the current authoritative registry for media-type names and top-level
   families. Registry last updated 2026-07-22.
8. [Material Symbols guide](https://developers.google.com/fonts/docs/material_symbols)
   documents a maintained, consistent family of symbols optimized for common
   UI platforms. It is a design reference only; TALOS already ships the pinned
   `@lucide/vue@1.25.0` icon family under its ISC license.
9. [WCAG 2.2 Understanding SC 3.2.4: Consistent Identification](https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html)
   requires components with the same function to be identified consistently.
   A PDF cannot be a generic document in one Library and a different visual
   category in the other.

The existing global TALOS Library is the product-specific mature reference.
Its shipped default list view, tokens, and interaction density are the
acceptance baseline; this slice does not copy a competitor skin.

## Upstream decision

**Adapt behind AVM-owned shared components.** Implement one Vue Library row
using native list semantics, existing TALOS tokens, Lucide icons, and the
existing pressable contract. Use it in both the global Library list and the
per-chat media surface.

Add a pure TALOS file-presentation adapter which first uses the filename suffix
for the visible extension and then uses the registered media type as a
classification fallback. Map stable file families to distinct existing Lucide
silhouettes and always render a short text extension beneath/over the icon
region. This adapts IANA categories without making MIME strings or one icon
vendor TALOS's domain model.

No new package is appropriate. Vue, Tailwind, Lucide, and the current shadcn
style primitives already implement every required capability; a third-party
gallery or second icon package would add styling drift and another
accessibility boundary. Color-only file branding and vendor-logo artwork are
rejected: both fail the non-color cue requirement and add maintenance/licensing
surface without improving the extension contract.

## Design critique

Initial direction considered: restyle the existing two-column chat cards to
look closer to the global grid. Rejected because the shipped global default is
a list, because the chat card's below-image switch prevents a truly square
global-grid match, and because duplicated markup would drift again.

Revised direction: a shared list row. This is deliberately restrained:

- Palette: existing `--talos-background`, `--talos-panel`,
  `--talos-border`, `--talos-text`, `--talos-muted`,
  `--talos-accent`; no new colors.
- Type: existing Instrument Sans UI tokens; no new font role.
- Layout: 48px thumbnail/glyph region, flexible name/metadata column, trailing
  action area.
- File identity: image, PDF, word-processing, spreadsheet, presentation, code,
  structured-data, archive, text, and generic families receive different
  silhouettes. The actual normalized suffix (`PDF`, `DOCX`, `JPG`, `MD`, and
  so on) remains visible, so two extensions in the same family are still
  distinguishable without color.
- Image previews keep their content value; their extension is a compact
  high-contrast label inside the bottom of the preview rather than replacing
  the image with decoration.
- Signature: the per-chat row adds a provenance line and the honest
  `Any chat may read it` switch. That is product meaning, not decoration.
- Motion: no new motion. Existing press/focus feedback is sufficient.

The optional global grid view remains a global browsing mode. The per-chat
surface adopts the shipped/default shared list because it must carry contextual
controls legibly at mobile width.
