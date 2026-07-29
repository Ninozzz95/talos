# R7 design - Reasoning row Brain icon

Date: 2026-07-29

## Scope

Only the leading glyph in `TalosMobileReasoningBlock` changes:

- import `Brain` from the existing pinned `@lucide/vue` package;
- render `<Brain class="size-3.5" />` in the existing icon slot;
- remove the local `Sparkles` import and rendered instance.

No label, detail, live state, timing, row geometry, drawer, trace content,
message projection, persistence or export behavior changes.

## Accessibility and visual contract

- Exactly one `lucide-brain` SVG is rendered for a non-empty Reasoning row.
- No `lucide-sparkles` SVG remains in that row.
- The existing icon wrapper remains `aria-hidden="true"` because the localized
  Reasoning text already names the action.
- The SVG retains the existing `size-3.5` dimensions, muted row styling and
  44 px minimum touch target.
- Empty reasoning still renders no row or icon.
- Live and completed states use the same semantic glyph and cannot reshape the
  row.

## Acceptance

- A focused component test fails before the product edit and proves glyph type,
  single-icon count and the decorative wrapper.
- The existing drawer, live-state, empty-state and touch-target matrix remains
  green.
- The persisted real-provider browser journey sees Brain before and after
  reload, never sees Sparkles, still opens/closes the drawer and still exports
  the persisted reasoning.
- Typecheck, production build and scoped diff hygiene remain green.

## Rollback

Restore only the import and icon component in
`TalosMobileReasoningBlock.vue`, the permanent assertions, provenance/plan
entries and the three slice documents. No stored data, schema, setting or
native resource needs rollback.
