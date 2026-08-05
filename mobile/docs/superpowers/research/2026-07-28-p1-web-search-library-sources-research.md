# Research dossier - P1 web-search results in the Library

Date: 2026-07-28

Subsystem: TALOS mobile web tools, chat provenance, encrypted Library.

Lane: `<corsia locale>`

Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduction and root cause

The owner's physical-device transcript asked TALOS to research Italian luxury
concierge companies. Diagnostics recorded two successful, parallel
`web_search` calls and zero `web_read` calls. The answer used the returned
titles and snippets, but the Library's Links tab remained empty.

The code has the same deterministic gap:

- `web_search` returns `TalosSearchResult[]` to the model and performs no
  persistence;
- only `web_read` calls `TalosWebToolSources.remember(page)`;
- `chatController.ts` saves a `web_source` only from that `remember(page)`
  callback;
- the current `catch(() => {})` also hides a page-snapshot save failure.

This is not a Links-screen filtering defect. Search-only evidence is discarded
before the Library can render it.

## Current official upstream contracts

### Tavily Search REST

Source inspected:
`https://docs.tavily.com/documentation/api-reference/endpoint/search`

The current `/search` response exposes `results[]` with `title`, `url`,
`content`, and related metadata. Tavily documents these results as
LLM/RAG-ready and describes the product as supporting persistent search
results. TALOS already normalizes that wire shape behind
`TalosSearchResult`; no SDK or new package is needed.

Decision: **adapt behind the existing AVM-owned adapter**. Persist the bounded
canonical result snapshot that TALOS already gave the model.

### Brave Search REST and retention

Sources inspected:

- `https://api-dashboard.search.brave.com/documentation/quickstart`
- `https://api-dashboard.search.brave.com/documentation/resources/help-feedback`

The current response uses `web.results[]` with `title`, `url`, `description`,
and `age`. The current official FAQ states that retaining data received through
the Brave Search API is prohibited unless an agreement is obtained from Brave.
It also now documents configurable spending limits, invalidating the
repository's older "no spending cap" UI text.

Decision: **reject retention of Brave search-result payloads by default**.
Search still works. The tool result explicitly tells the model to call
`web_read` for pages used; those page snapshots come directly from the
publisher, not from retained Brave API data. The Settings note must state this
constraint instead of promising behavior TALOS may not perform.

### SearXNG HTTP API

Source inspected:
`https://docs.searxng.org/dev/search_api.html`

Pinned documentation build: `2026.7.26+b060c780d`.

SearXNG supports GET/POST search and requires `format=json` to request JSON;
instances may disable that format. TALOS already uses the documented endpoint
and keeps this provider self-hosted.

Decision: **retain the existing direct integration**. A user-controlled
instance may archive its normalized results locally.

### WHATWG URL Standard

Source inspected: `https://url.spec.whatwg.org/`

The URL Standard defines parse/serialize behavior and URL equivalence through
serialized values, including comparison with fragments excluded.

Decision: **adopt directly through the platform `URL` implementation**.
For one-source identity, parse and serialize HTTP(S), reject embedded
credentials, and exclude the fragment. Preserve the query string: TALOS must
not invent provider-specific tracking-parameter rules.

## Storage shape decision

Saving one Markdown file for every result would repeat file analysis and a full
Library refresh five to ten times per search. Instead, one `web_search` call
creates one bounded Markdown result dossier and stores a typed
`metadata.source_links` array. The Links projection expands that array into one
openable row per canonical URL. A later `web_read` still stores the full page
snapshot and becomes the newest saved copy for that URL.

The snapshot states that titles/snippets are untrusted search-result evidence,
not a fetched page. It is never ambient Library context because generated
`web_source` records remain excluded from automatic injection. A later explicit
user-driven `library_search` may retrieve it under the Library switch,
per-file opt-out, read-only permission, and executor untrusted-data wrapper.

## Rejected alternatives

- **Force `web_read` after every search result:** violates the established D6
  boundary, fetches pages the model did not select, increases injection
  exposure, radio use, and latency.
- **Prompt-only instruction to call `web_read`:** the physical trace proves a
  model may answer from search snippets without doing so.
- **One vault file per result:** correct but unnecessarily multiplies local
  analysis and Library refresh work.
- **Persist Brave results anyway because storage is local:** directly conflicts
  with the provider's current published retention rule.
- **Aggressively remove tracking query parameters:** no provider-neutral
  standard identifies which query parameters are semantic.

## Security and compatibility requirements

- Search-result URLs and titles are untrusted.
- Only credential-free HTTP(S) URLs enter `source_links`.
- Control/bidi characters and unsafe filename characters are removed; all
  stored fields and dossier size are bounded.
- Search never fetches result pages as a persistence side effect.
- A storage failure does not erase a successful search, but it is visible in
  the tool result instead of being swallowed.
- Legacy single `source_url` rows and transcript-header fallback remain valid.
- Results from parallel searches are deduplicated within the current answer
  before persistence and citation metadata.
