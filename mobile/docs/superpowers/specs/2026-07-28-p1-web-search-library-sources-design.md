# Design - P1 web-search results in the Library

Date: 2026-07-28

Status: approved by the owner's autonomous sequential-fix instruction.

## Outcome

A successful search-only answer leaves its normalized sources in both places
the user expects:

1. the answer's durable Sources chip;
2. Library > Links, backed by a local Markdown result dossier.

Reading a page remains a separate, explicit `web_read` action and upgrades the
evidence with a full on-device page snapshot.

## Canonical contracts

`webSourceArchive.ts` owns provider-neutral source recording:

- `canonicalTalosWebSourceUrl(value)` parses/serializes credential-free HTTP(S)
  and drops fragments for identity;
- `createTalosWebSourceArchive(options)` creates one per-send recorder;
- `rememberSearch(query, results)` deduplicates, writes one bounded dossier, and
  returns a typed `TalosWebArchiveReport`;
- `rememberPage(page)` writes the existing full-page dossier;
- `sources()` returns the bounded, deduplicated per-answer provenance.

`TalosWebToolSources` adds:

- `rememberSearch(query, results): Promise<TalosWebArchiveReport>`.

`web_search` invokes it only after a non-empty successful search. Its result
text states saved, partial/failed, or provider-retention-restricted status.
`web_read` similarly reports a page-save failure without turning a successful
read into a false network failure.

## Encrypted Library representation

`TalosGeneratedTextInput` adds:

```ts
sourceLinks?: readonly Array<{ url: string; title: string }>
```

The Vault persists this as `metadata.source_links` only for the generated
record. It remains `kind: "web_source"`, `origin: "generated"`, and
`origin_session_id` is unchanged.

One search dossier contains:

- the bounded query;
- an explicit untrusted/search-result-only notice;
- every retained result's title, canonical URL, provider-reported date, and
  bounded snippet.

`talosSavedLinkRows(files)` expands `source_links` into individual rows while
preserving:

- legacy `source_url`;
- legacy `Source:` transcript fallback;
- newest-copy-wins URL deduplication.

## Provider retention

- Tavily, SearXNG, and custom endpoint: archive normalized results.
- Brave: `rememberSearch` returns
  `policy: "provider_retention_restricted"`, performs no save, and retains no
  search-result citation metadata. The tool tells the model to call `web_read`
  for sources it uses.
- `web_read` snapshots remain available with every search provider because the
  page is fetched directly from its publisher by TALOS.

## Failure behavior

- Empty search: no dossier and the existing honest "No results" response.
- Vault failure: search remains successful; tool output says results could not
  be saved. No silent catch.
- Invalid/credentialed/non-HTTP URL: omitted from both dossier links and answer
  provenance.
- Duplicate URL in parallel searches: one link/citation for the answer; each
  search dossier contains only URLs it successfully claimed.
- Generated-file analysis degradation: `source_url` and `source_links` survive
  in metadata just as provenance/kind do.

## No protocol or dependency invention

No SDK, database migration, new network endpoint, or provider-specific domain
model is introduced. Provider wire formats remain in `searchSources.ts`; this
slice extends only the AVM-owned normalized persistence boundary.

## Human-visible acceptance

With Tavily, SearXNG, or a custom endpoint configured:

1. ask in natural language for a current web search;
2. allow the model to issue only `web_search`;
3. verify the answer has a Sources chip;
4. reload the chat and verify the Sources chip persists;
5. open Library > Links and verify every returned unique source is present;
6. open a link in the system browser and open its saved search dossier;
7. run a later `web_read` and verify its full saved copy remains available.

With Brave configured, verify the tool directs the model to read sources and
does not retain raw Brave results.

## Rollback

Remove the recorder and its tests, remove `rememberSearch` from the web-tool
contract, remove `sourceLinks` from generated-text inputs, and restore the
single-source row projection. No migration or existing row rewrite is needed.

