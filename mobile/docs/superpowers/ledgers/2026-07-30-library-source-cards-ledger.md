# Library source cards — favicon, title, preview, grid, grouping, backfill

Date: 2026-07-30
Owner decision: complete scope — rich card (B) + retroactive backfill.
Status: ledger; slices land one at a time, RED first, gate per slice.

## The one-up, stated once

Every competitor unfurls links through a cloud service that sees the URL, and
their previews are live-fetched so they rot. TALOS captures the card ONCE at
save time, through the safe-web boundary it already has, stores the bytes
locally, and renders offline forever. The source that cannot rot is the
structural win — and it is the same object as the file provenance record
(every Library item carries a self-describing card).

## What exists to reuse

- `android/.../TalosSafeWebClient.java` — SSRF-safe fetch: URL validation
  (scheme, credentials, port, hostname, public-IP-only), redirect loop (max 5,
  no downgrade), 2MB bound. Returns the body decoded to a STRING via the
  content-type charset — good for HTML, wrong for image bytes.
- `src/services/safeWebRead.ts` — the JS bridge: `{status, url, body}`.
- `src/lib/search/webSourceArchive.ts` — where links are saved
  (`rememberSearch`, page archive); already has `title`, `canonicalUrl`.
- `src/screens/ContextScreen.vue` — links render in a SEPARATE branch
  (`typeFilter === 'links'`), so grouping and grid never reach them.
- `src/components/chat/TalosMobileSourcesChip.vue` — letter marks, letters ON
  PURPOSE (display-time favicon fetch = a beacon). Save-time capture removes
  that objection.

## Slices

### Slice 1 — the unfurl parser (pure, no network)  ← START HERE
`src/lib/search/unfurl.ts` + test.
HTML string + page URL → `{ title, siteName, imageUrl, iconUrl }`, every URL
resolved absolute against the page. Precedence: og:title → <title>; og:site_name
→ hostname; og:image (+twitter:image) → none; best `<link rel="icon" sizes>` /
apple-touch-icon → `/favicon.ico`. Pure, adversarial tests (missing tags,
relative URLs, protocol-relative, javascript:, data:, huge/hostile HTML).

### Slice 2 — native bytes fetch
Extend `TalosSafeWebClient` with a bytes path that REUSES `validate()` + the
redirect loop, returns `{status, url, base64, contentType}`, bounded to ~512KB
(an icon/preview, not a document). New plugin method on `TalosSafeWebPlugin`;
JS `readTalosSafeWebBytes(url)`. Only image content types accepted; anything
else refused. Java policy test + JS bridge test.

### Slice 3 — capture orchestration (best-effort, async, never blocks save)
At save time: fetch HTML (page archive already does; per-search-result fetch is
bounded and best-effort), parse via slice 1, fetch icon + preview bytes via
slice 2, re-encode/bound the preview (untrusted external image: bounded,
re-encoded small, internal metadata stripped, never executed), store on the
link's vault record. Failure → honest letter fallback, save still succeeds.

### Slice 4 — storage
Card bytes on the link's vault file. Favicon is tiny; preview is a bounded blob.
Reuse the existing image/thumbnail storage path rather than a new column.

### Slice 5 — render unification
Links become the same view element as files (icon/date/origin chat) so grouping
and grid/list apply to both. Grid tile: favicon + title + preview when present,
letter fallback otherwise. SourcesChip: favicon replaces the letter, same
save-time bytes, zero display-time network.

### Slice 6 — retroactive backfill
Best-effort pass on Library open for links lacking a card. Bounded concurrency,
cancellable, never re-fetches a card it already has, logs what it skipped.

## Invariants (no compromise = no hidden cost)

- Zero display-time network. Everything is captured at save/backfill time and
  rendered from local bytes.
- Favicon fetched DIRECT from the site domain, never a favicon proxy (a proxy
  would leak the whole domain list).
- The preview image is untrusted external content: bounded, re-encoded small,
  internal metadata stripped, never executed.
- Storage bounded: one small favicon + one small preview per source.
- Honest degradation: no card → the letter placeholder that ships today.
