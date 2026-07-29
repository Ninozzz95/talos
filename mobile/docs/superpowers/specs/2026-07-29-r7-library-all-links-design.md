# R7 design - global Library All includes saved links

Date: 2026-07-29

## Projection

The global Library owns two independent, non-duplicating render branches:

- `filteredFiles`: non-link file records admitted by `All`, `Images` or
  `Files`, then matched by the canonical Library text search;
- `filteredLinkRows`: canonical, deduplicated saved-link rows admitted by
  `All` or `Links`, then matched against row title, host, URL and the retained
  copy's filename/extracted text.

`All` renders both branches. `Links` renders only link rows. `Images` and
`Files` render only their corresponding file branch. A `web_source` backing
record is never a grid/list file item in any tab.

## Search, count and ordering

- Empty search preserves existing newest-first file ordering and newest-copy
  link deduplication.
- Link search uses the existing NFKC, case, whitespace, symbol, emoji and CJK
  normalization boundary.
- A query matching one title/host/URL shows only that logical link row.
- A query matching the retained dossier's filename or extracted text may show
  every matching row projected by that dossier.
- The header count is the number of non-link files plus deduplicated saved-link
  rows. Raw source transcript records do not inflate it.
- Switching chips or view modes does not mutate, re-save or delete anything.

## Selection and accessibility

- The existing filter buttons retain stable labels and `aria-pressed`.
- Saved links keep their semantic row, saved-copy action and system-browser
  action in both `All` and `Links`.
- Bulk selection continues to operate only on visible file IDs. Saved links
  are hidden while file-selection mode is active and reappear unchanged when
  the user exits it.
- Empty states are computed from the branches actually rendered, so a
  link-only `All` view is not falsely reported empty.

## Persistence and security

- No repository, schema, Vault write or migration changes.
- The latest retained encrypted copy remains the target of `open-copy`.
- URL canonicalization and rejection of non-HTTP(S), credentialed or malformed
  addresses remain unchanged.
- Reload recomputes the same logical projection from persisted Vault rows.

## Acceptance

- Unit matrix covers mixed files, images, one-to-many source dossiers,
  duplicate URLs, all four chips, logical count, search by title/host/URL/body,
  selection-mode suppression and remount persistence.
- Browser proof exercises a natural-language web-search tool round through the
  real composer/provider/tool/archive boundary, verifies the default `All`
  row, type filters, search and reload, and proves no source transcript tile is
  exposed.
- Existing global file lifecycle, per-chat media, saved-link, Library Unicode,
  repository and tool-discovery suites remain green.
