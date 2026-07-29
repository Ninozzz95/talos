# Execution ledger - R7 localized new-chat welcome library

Date: 2026-07-29  
Subsystem: TALOS UI / mobile chat empty state and localization  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`  
Status: CLOSED - automated slice gates green; physical APK acceptance deferred
to the final owner checklist  
Commit policy: no commit without fresh owner authorization  
Upstream pins: Unicode CLDR `48.2` `release-48-2`; `@lucide/vue@1.25.0`
ISC, integrity
`sha512-hkEetV+v48ScIn3uwqwWQ66sI8foeP2q6OMI09GzLFH4SfvBlfe3JHYlMBdBCqFC7WRlhFsndyDn/awRKRc2OQ==`

## Exact ownership

Create:

- `mobile/docs/superpowers/research/2026-07-29-r7-localized-welcome-library-research.md`
- `mobile/docs/superpowers/specs/2026-07-29-r7-localized-welcome-library-design.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-localized-welcome-library-plan.md`
- `mobile/docs/superpowers/ledgers/2026-07-29-r7-localized-welcome-library-ledger.md`
- `mobile/src/lib/welcome/catalog.ts`
- `mobile/src/lib/welcome/resolver.ts`
- `mobile/src/lib/welcome/runtime.ts`
- `mobile/src/lib/welcome/catalogs/en.json`
- `mobile/src/lib/welcome/catalogs/it.json`
- `mobile/src/composables/useTalosWelcome.ts`
- `mobile/src/components/chat/TalosWelcomeEasterEgg.vue`
- `mobile/src/components/chat/TalosWelcomeTitle.vue`
- `mobile/tests/unit/welcome/welcomeCatalog.test.ts`
- `mobile/tests/unit/welcome/welcomeResolver.test.ts`
- `mobile/tests/unit/welcome/welcomeRuntime.test.ts`
- `mobile/tests/unit/composables/useTalosWelcome.test.ts`
- `mobile/tests/unit/chat/TalosWelcomeEasterEgg.test.ts`
- `mobile/tests/unit/chat/TalosWelcomeTitle.test.ts`
- `mobile/tests/e2e/mobile-welcome-library.e2e.spec.ts`

Modify:

- `mobile/src/screens/ChatScreen.vue`
- `mobile/src/style.css`
- `mobile/src/i18n/locales/en.ts`
- `mobile/src/i18n/locales/it.ts`
- `mobile/tests/unit/screens/chatScreen.test.ts`
- `mobile/scripts/verify-initial-chunk.mjs`
- `mobile/tests/unit/build/initialChunkContract.test.ts`
- `mobile/docs/upstream-provenance.md`
- `mobile/docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

Delete:

- none

No other product, test, Android, package, lockfile, persistence, API, model,
tool, memory, library or session file is owned by this slice.

## Public symbols and compatibility

Create:

- constant `TALOS_WELCOME_SCHEMA_VERSION`;
- constant `TALOS_WELCOME_DAY_PERIOD_IDS`;
- constant `TALOS_WELCOME_SPECIAL_DATE_IDS`;
- constant `TALOS_WELCOME_EASTER_EGG_KINDS`;
- types `TalosWelcomeDayPeriodId`, `TalosWelcomeSpecialDateId`,
  `TalosWelcomeEasterEggKind`, `TalosWelcomeCatalog`,
  `TalosWelcomeSelection`, `TalosWelcomeResolverInput`,
  `UseTalosWelcomeOptions`, `TalosWelcomeState`;
- functions
  `parseTalosWelcomeCatalog(value, expectedLocale)`,
  `loadTalosWelcomeCatalog(locale)`,
  `resolveTalosWelcome(catalog, input)` and
  `loadTalosWelcomeSelection(locale, input)` and
  `useTalosWelcome(options)`;
- component prop `TalosWelcomeEasterEgg.kind`.
- zero-prop component `TalosWelcomeTitle`, consuming existing i18n/chat
  singletons and the `.talos-welcome-title` CSS contract.

Modify only local ChatScreen composition:

- `useTalosI18n()` destructuring adds the existing `locale` ref;
- the fixed title becomes a lazy `TalosWelcomeTitle` with one synchronous,
  localized `h1` fallback;
- `chat.welcomeHeadline` remains stable as fallback;
- `chat.welcomeBody` is removed from both locale catalogs and the template;
- existing exposed session methods, routes, storage, composer, setup checklist,
  logo and wordmark remain unchanged.

No route, API, database schema, migration, native bridge, stored setting,
session record, dependency or lockfile changes.

## Baseline

Fresh pre-edit command:

```powershell
npx vitest run tests/unit/screens/chatScreen.test.ts tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts tests/unit/build/initialChunkContract.test.ts
```

Result:

```text
4 test files passed
45 tests passed
0 failed
```

## Named RED scenarios and expected failures

- `WELCOME-CATALOG-01`: strict V1 schema and exact key set.
- `WELCOME-CATALOG-02`: CLDR 48.2 EN/IT periods cover all 1,440 minutes once.
- `WELCOME-CATALOG-03`: six exact special dates and icon allowlist.
- `WELCOME-CATALOG-04`: at least ten unique, bounded, emoji-free titles for
  each of ten conditions per locale.
- `WELCOME-CATALOG-05`: EN/IT keys, counts and semantic indices remain exact.
- `WELCOME-RESOLVE-01`: English minute boundaries.
- `WELCOME-RESOLVE-02`: Italian minute boundaries.
- `WELCOME-RESOLVE-03`: every special date overrides the time period.
- `WELCOME-RESOLVE-04`: seed/index determinism and fail-closed null.
- `WELCOME-REACTIVE-01`: fallback then resolved catalog.
- `WELCOME-REACTIVE-02`: rerender/locale change retains captured seed/time.
- `WELCOME-REACTIVE-03`: session change captures a new entry context.
- `WELCOME-REACTIVE-04`: rejected and stale async loads cannot blank or
  overwrite the current heading.
- `WELCOME-EGG-01`: exact six allowlisted Lucide mappings.
- `WELCOME-EGG-02`: null renders no node; icons remain decorative, static and
  non-interactive.
- `WELCOME-SCREEN-01`: empty hero has exactly one non-empty `h1` and zero
  subtitle paragraphs in normal and compact presentations.
- `WELCOME-SCREEN-02`: logo, wordmark, setup checklist and composer remain.
- `WELCOME-CHUNK-01`: both locale JSON modules are reachable dynamic entries
  outside the initial static closure.
- `WELCOME-CHUNK-02`: eager EN or IT catalog fails the build contract.
- `WELCOME-CHUNK-03`: the parser/resolver runtime and six-icon renderer are
  independently reachable dynamic entries; neither can be folded into the
  initial graph.
- `WELCOME-TITLE-01`: the lazy title renders one non-empty heading, consumes
  the reactive welcome selection and preserves compact/expanded typography.
- `WELCOME-TITLE-02`: fallback and resolved headings share the exact
  expanded/compact typography through the existing hero-state CSS contract.
- `WELCOME-CHUNK-04`: the whole title component and composable lifecycle remain
  outside the initial static closure while the fallback heading remains
  immediate.
- `WELCOME-E2E-01`: fixed Christmas phone journey renders one heading, no
  subtitle and one decorative Gift.
- `WELCOME-E2E-02`: explicit EN-to-IT change keeps semantic index and session
  stability through reload.
- `WELCOME-E2E-03`: tablet and reduced-motion presentation remains visible,
  static and usable.

Expected first RED: missing welcome modules/catalogs fail their focused tests;
the existing ChatScreen test also proves the subtitle is still present before
the product edit. The build contract initially fails because it does not yet
enforce either JSON boundary.

## Ledger amendment - production-manifest root cause

The first production build transformed 3,247 modules but failed the immutable
initial JavaScript ceiling:

```text
TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED: 567156 bytes exceeds 560000 bytes
```

Manifest/source inspection showed:

- `src/lib/welcome/catalogs/en.json` and `it.json` are correct independent
  dynamic entries;
- `src/screens/ChatScreen.vue` is a 60-byte dynamic facade whose manifest row
  imports `index.html`, because the shared ChatScreen implementation is folded
  into the initial chunk;
- the initial chunk contains parser error text, special-date IDs, icon IDs and
  the easter-egg test ID, proving the parser/resolver/renderer entered the
  static graph;
- the existing `TalosMobileBrowserActivity` uses `defineAsyncComponent` in the
  same screen and remains a real dynamic entry.

The original assumption that every static import from the nominally lazy
ChatScreen would remain outside the initial graph is therefore invalid.

Amended implementation:

1. create `src/lib/welcome/runtime.ts` as one dynamically imported AVM boundary
   that owns catalog loading plus deterministic resolution;
2. make `useTalosWelcome` statically import types only and call the runtime
   through `import()` unless a test selector is injected;
3. load `TalosWelcomeEasterEgg.vue` through `defineAsyncComponent`, so all six
   Lucide glyphs remain outside the initial graph and load only when a special
   date actually resolves;
4. make the production build contract require runtime, renderer and both JSON
   modules as reachable dynamic entries.

This amendment adds one exact owned file and no dependency, budget increase,
network boundary or visible behavior.

## Ledger amendment - residual eager lifecycle root cause

The next production build proved the runtime, both locale catalogs and
easter-egg renderer as real dynamic entries, but still failed:

```text
TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED: 560994 bytes exceeds 560000 bytes
```

Fresh minified-entry inspection found:

- prior slice-12 entry: 559,998 bytes;
- current entry: 560,994 bytes, a 996-byte delta;
- the eager `useTalosWelcome` lifecycle: 816 measured minified bytes;
- no eager parser error, special-date or icon identifiers.

The remaining regression is therefore the composable lifecycle statically
owned by the shared ChatScreen implementation, not the already-isolated data
or renderer.

Second amended implementation:

1. create `src/components/chat/TalosWelcomeTitle.vue`, owning
   `useTalosWelcome` and the nested async easter-egg renderer;
2. make ChatScreen dynamically load that component and provide one immediate
   localized `h1` while the module loads or fails;
3. add a component RED test plus `WELCOME-CHUNK-04`, requiring the title module
   to remain a reachable dynamic entry;
4. preserve the 560,000-byte budget unchanged.

This amendment adds the exact title component and test files already listed in
ownership. It changes no title-selection semantics, dependency, route,
persistence, session or native boundary.

## Ledger amendment - `Suspense` runtime rejection

The first title-component integration made the component a correct 1.81 kB
dynamic entry, but the production gate then failed at 565,047 bytes. The
minified entry no longer contained `useTalosWelcome`; it did contain Vue's
complete `Suspense` implementation beginning at its `__isSuspense` contract.
This isolated the new 5 kB class to the fallback mechanism.

Current official Vue guidance confirms:

- `Suspense` remains experimental;
- `defineAsyncComponent` natively supports loading and error components plus
  an explicit display delay;
- `suspensible: false` leaves loading-state ownership with the async component.

Final amended implementation:

1. reject `Suspense` for this single async leaf;
2. use one local functional heading as both `loadingComponent` and
   `errorComponent`;
3. set `delay: 0` so the localized fallback is present on the first render;
4. set `suspensible: false` so a future ancestor cannot suppress the local
   loading/error contract;
5. retain the unchanged 560,000-byte build ceiling as the final arbiter.

No ownership, dependency, product behavior or rollback boundary changes.

## Ledger amendment - residual 206-byte context duplication

The stable `defineAsyncComponent` fallback removed the experimental runtime
cost but the immutable gate still reported:

```text
TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED: 560206 bytes exceeds 560000 bytes
```

The minified eager segment showed the fallback duplicating the full utility
class list and the async invocation forwarding `locale`, `sessionId`,
`fallbackTitle` and `compact`. All four have existing authoritative sources.

Final ownership refinement:

1. `TalosWelcomeTitle` becomes zero-prop and reads `useTalosI18n()` plus
   `useChatController()` inside its already-lazy chunk;
2. the existing hero `data-composer-expanded` attribute controls one
   `.talos-welcome-title` rule in `src/style.css`;
3. ChatScreen retains only `t`, a minimal semantic fallback and the zero-prop
   async component;
4. `WELCOME-TITLE-01/02` permanently verify singleton wiring and exact
   expanded/compact CSS values.

`src/style.css` is added to exact modified ownership. No new abstraction,
dependency, route, setting, storage or budget change is introduced.

## Ledger amendment - Playwright JSON oracle

The first focused Playwright command failed before test discovery:

```text
TypeError: .../catalogs/en.json needs an import attribute of "type: json"
Error: No tests found.
```

Current Node ESM documentation makes `type: 'json'` mandatory. The E2E remains
an external oracle rather than adding loader-specific syntax: it reads the two
exact source JSON files with `readFileSync`, parses them once, and retains the
same semantic-index assertions. No product file or runtime contract changes.

## Focused GREEN and affected gates

```powershell
npx vitest run tests/unit/welcome/welcomeCatalog.test.ts
npx vitest run tests/unit/welcome/welcomeResolver.test.ts
npx vitest run tests/unit/composables/useTalosWelcome.test.ts
npx vitest run tests/unit/chat/TalosWelcomeEasterEgg.test.ts
npx vitest run tests/unit/screens/chatScreen.test.ts
npx vitest run tests/unit/build/initialChunkContract.test.ts
npx vitest run tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts tests/unit/i18n/localizationImportBoundary.test.ts tests/unit/screens/chatScreen.test.ts tests/unit/onboarding/setupProgress.test.ts
npm run typecheck
npm run build
npx playwright test tests/e2e/mobile-welcome-library.e2e.spec.ts
git diff --check
```

## Real-upstream and human-visible proof

The production build must resolve manifest rows for both locale JSON modules as
dynamic entries reachable through the real lazy ChatScreen route. No fixture
or mock substitutes for that build-manifest gate.

The Playwright journey uses the actual UI locale controller, local encrypted
chat repository path, session creation, reload, packaged JSON import and
rendered component. Time is the only deterministic test control.

On the final physical Android APK:

1. set the app to System, English and Italian in turn;
2. open multiple new chats in each time band and verify title variation without
   changes during focus, rotation or ordinary rerender;
3. set/test each approved special date when a test clock/device permits;
4. confirm one title, no subtitle, appropriate small decoration, readable
   theme contrast and no overlap at phone/tablet text scales;
5. enable reduced motion and verify the decoration remains static;
6. restart the app and verify the active empty chat retains its title;
7. verify composer, setup checklist, chat creation and message sending remain
   operational.

Physical proof remains mandatory before the Claude ACK ticket.

## Failure, recovery and rollback

- Catalog import/validation failure: immediate localized fallback title, no
  decoration, composer unaffected.
- Locale race: a monotonic request revision discards stale completion.
- Unsupported locale: normalize to English through the existing supported
  locale contract.
- Missing condition: resolver returns null and composable keeps fallback.
- Reload: persisted session ID reproduces the same index.
- Rollback: restore only the exact owned files, reattach
  `chat.welcomeHeadline`, remove the new dynamic-boundary assertions and leave
  every persisted/native contract untouched.

## GREEN evidence

Fresh 2026-07-29 evidence:

```text
npx vitest run <12 affected files>
Test Files  12 passed (12)
Tests       96 passed (96)

npm run build
vue-tsc -b                         passed
Vite modules transformed          3250
initial JavaScript                 559912 / 560000 bytes
initial JavaScript gzip            182363 bytes
initial CSS                        134866 / 150000 bytes
initial CSS gzip                   31991 bytes
welcome title dynamic chunk        1.68 kB
welcome easter-egg dynamic chunk   2.66 kB
welcome runtime dynamic chunk      3.86 kB
English catalog dynamic chunk      5.04 kB
Italian catalog dynamic chunk      5.25 kB
parity script tests                9 passed
feature parity ledger              ok

npx playwright test tests/e2e/mobile-welcome-library.e2e.spec.ts
Tests       1 passed (14.4s)
Journey     phone 390x844; Christmas/Gift; EN-to-IT same semantic index;
            reload persistence; tablet 1024x768; reduced motion
```

The build retained the existing non-fatal Vite mixed-import and large optional
chunk warnings. No new dependency, package/lockfile, route, persistence,
native, API, session or model contract changed. No commit was created.

RED history retained as evidence:

```text
missing title module                       focused component RED
missing/eager title manifest boundary      build-contract RED
initial implementation                     567156 > 560000
runtime/icon split                          560994 > 560000
experimental Suspense fallback              565047 > 560000
stable advanced async fallback              560206 > 560000
zero-prop/CSS-owned final boundary           559912 <= 560000
Playwright direct JSON import                test discovery blocked
Playwright fallback timing/sheet/locale      test-helper regressions
```

Physical Android proof is intentionally not claimed. It remains mandatory in
the final APK checklist, and the Claude ACK ticket remains blocked until the
owner manually completes every requested check and gives explicit approval.
