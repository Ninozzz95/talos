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

### Slice 6 — retroactive backfill  ← DONE
Best-effort pass on Library open for links lacking a card. Bounded concurrency,
cancellable, never re-fetches a card it already has, logs what it skipped.

**Web research checkpoint (2026-07-30, before implementation).**

| Query | What it changed here |
|---|---|
| idempotent background backfill, negative caching, permanent vs transient failures | Split the failure kinds. A pass that only knows "no card" cannot tell *never tried* from *this site has no favicon*, so a dead link is a page fetch on every Library open forever. Added the miss mark. |
| browser favicon cache: failed fetch, negative cache, retry interval | Browsers keep favicons in a dedicated store, refreshed on their own schedule (days), not per page view — and negative entries EXPIRE. So the mark carries its timestamp and stops counting after 7 days, instead of being a permanent tombstone that would rob an offline phone of that favicon forever. |
| AbortController + Vue scope disposal | The pass takes an `AbortSignal`, checked between items and before starting; the composable aborts on unmount. Leaving the Library abandons the pass rather than finishing it into a component that is gone. |
| requestIdleCallback in Android WebView | Available (Blink), timeout strongly recommended. NOT adopted: the pass is already async, budgeted and abortable, so idle scheduling would add a second timing mechanism for no gain. Recorded so the decision is a decision. |

**Built:** `src/lib/search/sourceCardQueue.ts` — one runner for the save path and
the backfill, since they are the same job with different numbers. Concurrency 2,
budget (12 for the backfill), dedupe, cancellation, and a report naming the urls
it attempted. The device-log line carries counts only — which pages a user saved
is not device-log material, and that log is readable from the Doctor export.

**Negative index:** `<digest>-miss.txt` holds the attempt time. `settled(url)` is
one function — an icon, or a recent mark — so capture and the backfill can never
disagree about what counts as done.

**Two defects found and fixed while wiring this:**
1. The settled check looked only for `-icon.png`, so every site serving an `.ico`
   favicon was re-fetched on every pass forever, having stored a perfectly good
   icon each time. The candidate type list is now in one place.
2. The writer canonicalised the url before hashing and the readers did not, so a
   link stored as `https://example.org` looked for a card written under
   `https://example.org/` and never found it. Canonicalisation moved into
   `digest()`, which both sides go through.

**Also landed:** the sources chip shows the captured favicon behind its letter —
READ-ONLY, no backfill. Opening a months-old chat must not reach out to every
site it cited, which is the beacon the letters existed to avoid. One card store,
so old chats gain marks as the Library fills those cards in.

**Honest cost:** the backfill makes requests to sites the user visited in the
past, at a moment they did not choose. Direct to the site, never a proxy, ≤12
per Library open, once per url ever. Stated rather than hidden.

**Known ceiling, not a defect:** presence is `stat` per candidate extension, so a
very large Library probes proportionally. A single `readdir` of the cards
directory would make it one call regardless of size. Not built: it needs a new
guarded store method, and the in-memory card cache already removes the
per-component multiplier that made this visible.

## Invariants (no compromise = no hidden cost)

- Zero display-time network. Everything is captured at save/backfill time and
  rendered from local bytes.
- Favicon fetched DIRECT from the site domain, never a favicon proxy (a proxy
  would leak the whole domain list).
- The preview image is untrusted external content: bounded, re-encoded small,
  internal metadata stripped, never executed.
- Storage bounded: one small favicon + one small preview per source.
- Honest degradation: no card → the letter placeholder that ships today.
