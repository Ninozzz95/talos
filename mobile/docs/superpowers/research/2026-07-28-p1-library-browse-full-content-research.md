# Research dossier - P1 Library browse and full-content retrieval

Date: 2026-07-28

Subsystem: TALOS mobile encrypted Library, provider-neutral read tools, and
cross-chat discovery.

Lane: `<corsia locale>`

Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduction and root cause

The owner reproduced two distinct failures in the current APK:

1. asking the chat to show or inspect the Library returned four files although
   the global Library visibly contained many more;
2. a markdown transcript was present in the Library, but the chat could not
   find it after it had been saved.

The implementation confirms two independent causes:

- the only discovery tool is `library_search`, whose schema requires a
  non-empty keyword query and then removes every score-zero row; there is no
  honest "list/browse all" operation;
- explicit search ranks `listVaultFileSummaries()`, whose searchable
  `text_preview` is `substr(extracted_text, 1, 600)` on SQLite and
  `text.slice(0, 600)` in memory. A term after character 600 is invisible even
  though `library_read` can later read the whole file.

This is not a model-quality defect. The model is currently given neither an
enumeration contract nor the complete searchable corpus.

## Current primary standards and maintained upstreams

### Google AIP-158 Pagination

- Source: `https://google.aip.dev/158`
- Pin: approved AIP-158, updated 2025-07-08.
- Retrieved: 2026-07-28.
- Relevant requirements: collection methods ship pagination from the outset;
  page size is optional and bounded; continuation is an opaque, URL-safe page
  token; end-of-collection is represented only by an absent/empty next token;
  all non-page-size request parameters must remain the same.
- The rationale explicitly permits an initially small implementation to fetch
  the collection in memory and paginate it there.

Decision: **ADAPT** for the local provider-neutral `library_list` tool. TALOS
issues secure random opaque continuation tokens, validates the filter contract
on continuation, bounds every page by both record count and tool-result bytes,
and re-authorizes/re-lists on every call. A token is a position only, never an
authorization grant.

### SQLite FTS5 and FTS3/4

- FTS5 source: `https://www.sqlite.org/fts5.html`
- FTS3/4 source: `https://www.sqlite.org/fts3.html`
- SQLite pin: 3.50.4,
  `sqlite/sqlite@8ed5e7365e6f12f427910188bbf6b254daad2ef6`.
- Retrieved: 2026-07-28.

The shipped runtimes are not feature-equivalent:

- Android uses `@capacitor-community/sqlite@8.1.0`, tag commit
  `f507a1e779688ea72b9d7e8744c647f7b688c568`, which pulls
  `net.zetetic:sqlcipher-android:4.10.0`; its native AAR contains FTS5 and
  `ENABLE_FTS3`;
- web uses `jeep-sqlite@2.8.0` and `sql.js@1.11.0`; the shipped
  `sql-wasm.wasm` contains FTS3/FTS4 and `unicode61`, but no FTS5.

Decision: **REJECT FTS5 FOR THIS SLICE**. A migration would pass on Android and
break the web/E2E database runtime, violating TALOS parity.

Decision: **REJECT FTS4 FOR THIS SLICE**. It is the common compiled subset, but
its `unicode61` tokenizer is based on Unicode 6.1 and would not close the
separate canonical-equivalence, CJK, symbol, and emoji discovery defects. It
would also introduce an indexed-content migration, trigger synchronization,
repair, upgrade, and rollback surface without solving the owner's complete
retrieval contract.

For the current small, encrypted, on-device collection, explicit full-corpus
scanning is the correct compatibility choice. It occurs only after the model
calls `library_search`; the automatic send path continues to transfer bounded
summaries and hydrate only selected uploaded documents. A future FTS adapter is
permitted only after Android and web ship the same pinned extension and pass
cross-runtime conformance fixtures.

### Google Drive and Dropbox collection contracts

- Google Drive v3 `files.list`:
  `https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list`
- Dropbox JavaScript SDK `filesListFolder`:
  `https://dropbox.github.io/dropbox-sdk-js/Dropbox.html`
- Retrieved: 2026-07-28.

Both mature file systems separate listing from continuation. Google Drive
provides filtering plus `nextPageToken` and explicitly marks incomplete search;
Dropbox returns entries, a cursor, and `has_more`, then requires the cursor on
the continuation call.

Decision: **ADAPT THE SEPARATION**, not either provider wire format. TALOS keeps
an AVM-owned canonical pair:

- `library_list` for browse/enumerate/count with filters and an opaque page
  token;
- `library_search` for genuine filename/full-text matches with bounded
  evidence.

### ChatGPT Library competitor behavior

- Source:
  `https://help.openai.com/en/articles/20001052-library-for-chatgpt`
- Retrieved: 2026-07-28.

The documented Library exposes all uploaded and generated files in one browse
surface, a search bar, origin filters (uploaded/generated), file-type filters,
and multi-file download. Browse and search are separate user intents.

Decision: **ADAPT AND ONE-UP**. TALOS exposes the same browse/search
distinction to natural-language chat, adds origin-chat provenance to every
entry, retains encrypted local-first storage, distinguishes archived web links,
and lets the model read a selected result by stable file id.

## Alternatives inspected

### Treat an empty `library_search.query` as "list all"

Rejected. Search and browse have different evidence semantics. Returning
score-zero rows from a search recreated the earlier fabricated-match defect,
while relaxing the schema would leave the model guessing whether an empty
query was intentional.

### Search only filenames plus the 600-character preview

Rejected. It preserves the exact owner regression: valid terms deeper in an
existing document remain undiscoverable.

### Hydrate the whole Library on every chat send

Rejected. That reintroduces the already-fixed native-bridge and context-window
regression. Full text belongs behind an explicit read-only tool invocation.

### Add a new native-only search service

Rejected. TALOS mobile also runs the database through the web/WASM path for
development and E2E. A platform-specific search contract would create silent
behavior drift and leave the final composer dependent on runtime location.

## Upstream decision

No new dependency or migration is introduced.

TALOS will:

1. **adapt** AIP-158's bounded opaque-continuation semantics inside the existing
   AVM-owned tool layer;
2. **adapt** the established browse/search separation used by Google Drive,
   Dropbox, and ChatGPT Library;
3. **reject** FTS5 until the pinned Android and web runtimes have conformance;
4. **reject** FTS4 because it does not close the Unicode retrieval contract and
   adds index lifecycle risk;
5. scan complete extracted text only for explicit `library_search` calls;
6. keep ambient injection on summaries plus bounded winner hydration.

The upstream pin for this implementation is AIP-158 (approved revision updated
2025-07-08). Runtime evidence is pinned to the exact package and commit versions
listed above.
