# TALOS Mobile Durable Chat SQLite Research

Date: 2026-07-22
Owner: Codex mobile lane
Desktop reference: `5dd0c0be57f08183d0ab9eb832e808b2c7f1c9ed` (read-only)

## Problem

The current mobile chat keeps one conversation only in Vue memory. A reload or Android process death loses every message, there is no durable active-session pointer, and the New Chat control cannot create a real session. This violates the frozen desktop session contract and the local-first mobile requirement.

## Primary sources inspected

1. `@capacitor-community/sqlite` package and current release metadata:
   - https://www.npmjs.com/package/@capacitor-community/sqlite
   - https://github.com/capacitor-community/sqlite/releases/tag/v8.1.0
2. Official plugin README, supported platform matrix, Android requirements and web setup:
   - https://github.com/capacitor-community/sqlite
3. Official connection wrapper and database connection APIs:
   - https://github.com/capacitor-community/sqlite/blob/master/docs/APIConnection.md
   - https://github.com/capacitor-community/sqlite/blob/master/docs/APIDBConnection.md
4. Official incremental upgrade process:
   - https://github.com/capacitor-community/sqlite/blob/master/docs/UpgradeDatabaseVersion.md
5. Official web implementation guidance:
   - https://github.com/capacitor-community/sqlite/blob/master/docs/Web-Usage.md
6. SQLCipher security and Android support:
   - https://github.com/sqlcipher/sqlcipher
   - https://github.com/sqlcipher/sqlcipher-android
7. Open upstream `executeSet` correctness work, inspected to avoid depending on unsettled behavior for critical transactions:
   - https://github.com/capacitor-community/sqlite/pull/672

## Exact upstream pins

| Package | Version | Integrity | License | Role |
|---|---:|---|---|---|
| `@capacitor-community/sqlite` | `8.1.0` | `sha512-yhKZDAVPDPcM3QE6UGB3LXyV25a6Rve1SjZ1aUpTE0E2isnYTVM0PG9+JOI241f+NdsHzPTE7ESJiYSqKsKnuA==` | MIT | Native/Web Capacitor SQLite API |
| `jeep-sqlite` | `2.8.0` | `sha512-FWNUP6OAmrUHwiW7H1xH5YUQ8tN2O4l4psT1sLd7DQtHd5PfrA1nvNdeKPNj+wQBtu7elJa8WoUibTytNTaaCg==` | MIT | Official Web Component/IndexedDB backend |
| `sql.js` | `1.11.0` | `sha512-GsLUDU3vhOo14Pd5ME0y2te49JQyby6HuoCuadevEV+CGgTUjmYRrm7B7lhRyzOgrmcWmspUfyjNb6sOAEqdsA==` | MIT | Exact WebAssembly engine used to build `jeep-sqlite@2.8.0` |

`@capacitor-community/sqlite@8.1.0` declares `@capacitor/core >=8.0.0`; TALOS pins Capacitor `8.4.2`, so the compatibility contract is satisfied. The plugin uses SQLCipher on native platforms even for unencrypted databases. Its own documentation flags encryption-export obligations; this must remain in release/compliance documentation.

## Decision

### Adopt directly

Integrate the official plugin and its official web backend. Native Android opens an encrypted SQLCipher database. Web preview/E2E uses the upstream `jeep-sqlite` IndexedDB store and is explicitly a development surface; encrypted database methods are not available on Web.

### Adapt behind a TALOS boundary

Provider-specific plugin objects do not enter application stores. `TalosSqliteRuntime` owns platform setup, connection recovery, encryption setup and lifecycle. `TalosChatRepository` owns typed session/message persistence. Vue consumes that repository, not raw SQL or plugin result objects.

The adapter parses every row, JSON field and numeric value fail-closed. Parameterized `run`/`query` calls are used. Multi-statement state changes use `beginTransaction`, `commitTransaction` and `rollbackTransaction`; no transaction is held across a provider network call.

### Reject

- Preferences/localStorage: rejected for relational ordering, atomic session deletion, migrations, process-death durability and sensitive conversation content.
- A custom native SQLite bridge: rejected because the maintained Capacitor 8 plugin already supplies native SQLCipher, migrations, transactions and Web support.
- TypeORM/Kysely in this slice: rejected as unnecessary abstraction and bundle weight over a small, explicit schema.
- Silent memory fallback: rejected because it would make the UI claim persistence while losing data.
- `executeSet` for critical writes: deferred until the current upstream correctness work is released and pinned; explicit transactions are stable and inspectable now.

## Security and lifecycle contract

- Native database encryption is enabled in `capacitor.config.ts`.
- A fresh, cryptographically random database secret is created only when neither a database nor a stored plugin secret exists. Existing database plus missing secret fails closed as `TALOS_CHAT_DB_KEY_MISSING`; it never overwrites the key.
- Android backup and device-transfer extraction exclude root/database/shared-preference/external domains. Chat content must not enter cloud backup implicitly.
- API keys remain in the existing Keystore service and never enter SQLite.
- Native database failure disables sending and exposes an actionable retry; it never silently starts a volatile conversation.
- Connection setup is idempotent and reconciles an existing plugin connection after WebView reload/hot replacement.
- Web writes call the official store persistence path before a successful user action resolves.

## Schema strategy

Database: `talos_mobile`, schema version `1`.

Tables:

1. `talos_chat_sessions`: desktop-compatible session identity, title, surface, mode, persistence mode, active model, metadata and timestamps.
2. `talos_chat_messages`: ordered role/content/state rows with model/run metadata and cascade delete.
3. `talos_chat_attachments`: durable file metadata and grant/status fields; no file bytes or provider secrets.
4. `talos_chat_tool_activities`: durable typed tool/evidence activity envelopes for later Browser/AVM rendering.
5. `talos_chat_state`: versioned local pointers such as active session ID.

Version upgrades are registered through `addUpgradeStatement` before opening the target version. The upstream upgrade process backs up the database, runs each incremental version transactionally and restores the backup on failure.

## Verification contract

- Unit: schema, row parsing, transaction rollback, active pointer, cascade behavior, repository/store failure paths and secret scans.
- Real upstream Web: Playwright creates two sessions, sends contextual turns, reloads, restores the active thread, switches sessions, renames and deletes, then reloads again.
- Native integration: production build, `npx cap sync android`, Gradle `assembleDebug`, and APK/device persistence gate when a device is available.
- Regression: provider/model no-reload journey, full unit corpus, full E2E, `git diff --check`, desktop clean status.

Playwright's current official locator, auto-waiting and isolation guidance was
rechecked before authoring the durable human journey:

- https://playwright.dev/docs/locators
- https://playwright.dev/docs/actionability
- https://playwright.dev/docs/browser-contexts

Decision: the journey uses one isolated test BrowserContext, semantic
role/label locators and retrying web assertions. Reload occurs inside that same
context so IndexedDB continuity is exercised; a second test gets a clean store
from Playwright isolation. Fixed sleeps, forced clicks and DOM-structure XPath
selectors are rejected because they would hide readiness or accessibility
failures rather than proving the final-user flow.

## Bundle delivery amendment (2026-07-22)

Current primary sources inspected:

1. Vite official Features guide, dynamic imports and async chunk loading:
   - https://vite.dev/guide/features.html#dynamic-import
   - https://vite.dev/guide/features.html#async-chunk-loading-optimization
2. Vite official Build Options, production manifest contract:
   - https://vite.dev/config/build-options.html#build-manifest

The first production build with the SQLite integration raised the initial
JavaScript entry from the pre-slice baseline of approximately 536 KB to
617,506 bytes. The official Vite contract states that a dynamic import is
emitted as a separate lazy chunk and that Vite optimizes loading of that chunk's
static dependencies. Vite's production manifest exposes entry, static-import
and dynamic-import relationships for a deterministic gate.

Decision: **adopt directly** Vite's native dynamic-import splitting and
production manifest. TALOS adds only a typed lazy `TalosChatRepository` adapter
that preserves the existing repository contract, coalesces concurrent startup,
and discards a failed repository instance so the existing explicit Retry action
can perform a clean second initialization. The concrete Capacitor SQLite
repository is loaded immediately when chat initialization starts, but it is not
part of the first parsed JavaScript graph.

Rejected:

- increasing `chunkSizeWarningLimit`: it hides the regression and provides no
  machine-enforced boundary;
- a bundler-specific manual chunk table without a dynamic application boundary:
  it may download or preload SQLite before chat storage is initialized;
- delaying chat initialization until the first message: it would weaken the
  current fail-closed startup and restoration contract;
- a volatile fallback while the chunk loads: it violates durable-chat honesty.

The build gate reads `.vite/manifest.json`, walks the complete static JavaScript
closure of the HTML entry, enforces a 512,000-byte ceiling shared with the
frozen desktop entry contract, and proves that
`productionChatRepository.ts` is a dynamic entry excluded from that closure.
This ceiling prevents the SQLite regression while leaving the already-recorded
whole-app P7 reduction as a separate task.

The first real manifest gate confirmed that SQLite moved to a 27,330-byte
dynamic chunk, but the initial graph remained 591,646 bytes. Inspection found
that `mobileRoutes.ts` statically imported every station screen and wrapped each
one in `Promise.resolve`. The current official Vue Router lazy-loading guide
states that route records accept dynamic-import functions directly, recommends
dynamic imports for routes, and explicitly warns not to wrap route records in
Vue `defineAsyncComponent`:

- https://router.vuejs.org/guide/advanced/lazy-loading

Amended decision: **adopt directly** Vue Router's route-level dynamic-import
contract for Research, Runs, Context and Settings. These emitted chunks are
files packaged inside the Capacitor application; loading one does not contact an
external server and therefore preserves native local-first behavior. Chat stays
the eager base surface because it is always visible behind station sheets. The
manifest gate also proves all four station screens are dynamic entries outside
the initial static graph. Eager route imports and `defineAsyncComponent` route
wrapping are rejected as contrary to the upstream router contract. The amended
real build produced a 485,100-byte initial graph, leaving 26,900 bytes of
measured headroom under the shared 512,000-byte ceiling.

## Web loader runtime amendment (2026-07-22)

The first real provider journey against the production bundle failed before a
message could be sent with `Local chat storage is unavailable. s is not a
function`. Inspection of the exact pinned package proved a declaration/runtime
drift in `jeep-sqlite@2.8.0`:

- `loader/index.d.ts` still declares deprecated `applyPolyfills()`;
- `dist/esm/loader.js` exports `defineCustomElements` and `setNonce` only;
- the official `capacitor-community/sqlite` issue #592 reproduces the same
  missing export with `jeep-sqlite@2.8.0` and initializes Web by calling only
  `defineCustomElements(window)` before `initWebStore()`;
- the current plugin README confirms that Web persistence is owned by
  `jeep-sqlite`/IndexedDB and that Vue must package the pinned
  `sql-wasm.wasm` under `public/assets`.

Primary sources:

1. https://github.com/capacitor-community/sqlite/issues/592
2. https://github.com/capacitor-community/sqlite#web-quirks
3. https://github.com/jepiqueau/jeep-sqlite

Decision: **adapt the exact upstream initialization boundary**, without a
polyfill shim. TALOS calls and awaits the runtime export
`defineCustomElements(window)`, waits for `jeep-sqlite` registration, mounts one
element and then lets the official plugin call `initWebStore()`. The bootstrap
accepts a narrow loader seam so its ordering/idempotency can be tested without
asking jsdom to render a Stencil component; the same test separately imports
the real pinned module namespace and verifies its runtime exports. Real Stencil
rendering and IndexedDB persistence remain Chromium Playwright gates. Recreating the
missing deprecated export, suppressing the exception, or falling back to memory
is rejected: each would conceal upstream drift and violate durable-chat
honesty. A permanent unit gate imports the real pinned loader rather than a
mock; the production Playwright provider journey remains the final integration
proof.

The next Chromium trace exposed an independent glue/WASM mismatch. The browser
downloaded `/assets/sql-wasm.wasm` successfully, then aborted with
`WebAssembly.instantiate(): Import #34 ... function import requires a callable`.
The `jeep-sqlite@2.8.0` manifest allows `sql.js ^1.11.0`, so npm had resolved the
application's direct dependency to `1.14.1`; however, the official lockfile at
the exact upstream tag commit
`3f3c8f273d72bb93b0bba099ffe4bc17a08866d6` proves the published component was
built against `sql.js@1.11.0`. Its registry integrity is the value in the pin
table above and its `dist/sql-wasm.wasm` is 652,953 bytes with SHA-256
`083460b3e9d428ebbbbaa03918ba55da33d810e0fb3470d4b5d8677b462b2c2b`.

Decision: pin `sql.js@1.11.0` exactly and copy that package's WASM byte for byte.
Using a newer range-compatible WASM is rejected because Emscripten glue/WASM is
one compiled artifact and semver compatibility does not imply binary import
compatibility. The asset hash is a permanent conformance test and the Chromium
journey must fail on any future mismatch.

The first durable-chat Playwright run then exposed the visible copy
`1 models available`. ECMA-402 defines `Intl.PluralRules` as the standard
locale-sensitive plural-category primitive:

- https://tc39.es/ecma402/#sec-intl-pluralrules-constructor

Decision: do not add a dependency or instantiate a locale engine for this one
English status noun. Keep one private formatter at the Models-panel boundary
that emits `model` only for exactly one and `models` otherwise, and lock both
branches with a component-level test plus the real Playwright journey. When
mobile localization opens, replace that private seam with the existing
platform `Intl.PluralRules` contract rather than spreading count conditionals
through templates.

The same journey reached active-session deletion and exposed a repository
contract mismatch. The pinned `jeep-sqlite@2.8.0` implementation computes
`run().changes` by subtracting SQLite `total_changes()` before and after the
statement. SQLite's official contract states that `total_changes()` includes
foreign-key actions:

- https://www.sqlite.org/c3ref/total_changes.html

Deleting a chat with persisted messages therefore reports the parent session
plus every cascaded child row, not exactly one. Decision: adapt the repository
guard to accept any positive upstream change count while preserving fail-closed
behavior for zero. Replacing the check with an existence-free success path is
rejected because a stale/nonexistent session must still produce
`TALOS_CHAT_SESSION_NOT_FOUND`. A repository unit test uses a multi-row cascade
count and the Chromium journey proves the real `jeep-sqlite` behavior.

## Rollback

Remove the repository wiring and plugin registration while leaving the database file untouched. Restore the previous in-memory store only as an explicit rollback build, never as a runtime fallback. Package removal must also remove the copied upstream WASM asset and native plugin sync output. No rollback step deletes user conversations.
