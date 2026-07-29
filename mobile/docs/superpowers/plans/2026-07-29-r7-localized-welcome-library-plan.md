# Localized New-Chat Welcome Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. This task is
> owner-approved for inline atomic execution; subagents and commits are
> prohibited by the active operating constraints.

**Goal:** Replace the fixed new-chat headline/subtitle with an offline,
localized, session-stable title library containing 200 curated titles and six
accessible special-date decorations.

**Status:** Completed on 2026-07-29 with 96 affected unit tests, production
build/parity gates and the focused phone/reload/tablet Playwright journey
green. Physical Android acceptance remains in the final APK checklist.

**Architecture:** Strict `talos.welcome/1` locale JSON enters through an
AVM-owned parser and dynamic loader. A pure deterministic resolver selects by
special date or pinned CLDR 48.2 period; a Vue composable owns session capture,
locale reactivity, fallback and stale-load fencing. ChatScreen retains one
immediate localized `h1` fallback while an async title component owns the
composable and optional allowlisted Lucide decoration.

**Tech Stack:** Vue 3.5.40, TypeScript 5.9.3, Vite, Vitest 4.1.10, Playwright
1.61.1, Vue i18n 11.4.8, `@lucide/vue@1.25.0`, JSON modules.

## Global Constraints

- Work only in `C:\Users\ninox\Desktop\AVM-lanes\kimi\mobile` on
  `lane/kimi-mobile`.
- Never commit, rewrite, revert or discard existing owner changes.
- Keep the feature offline and free of new dependencies.
- Preserve `chat.welcomeHeadline` as synchronous localized fallback.
- Render no subtitle.
- Provide exactly the four CLDR-backed conditions and six approved dates.
- Provide at least ten titles per condition per locale with EN/IT semantic
  index parity.
- Keep JSON catalogs outside the initial static graph.
- Keep easter eggs decorative, static, theme-safe and allowlisted.
- Do not close the slice without fresh focused, regression, build, browser and
  diff evidence.

---

### Task 1: Catalog schema and curated data

**Files:**

- Create: `src/lib/welcome/catalog.ts`
- Create: `src/lib/welcome/catalogs/en.json`
- Create: `src/lib/welcome/catalogs/it.json`
- Create: `tests/unit/welcome/welcomeCatalog.test.ts`

**Interfaces:**

- Produces `TalosWelcomeCatalog`, `TalosWelcomeDayPeriodId`,
  `TalosWelcomeSpecialDateId`, `TalosWelcomeEasterEggKind`,
  `parseTalosWelcomeCatalog(value, expectedLocale)` and
  `loadTalosWelcomeCatalog(locale)`.

- [ ] Write catalog tests first for schema, exact keys, exact CLDR rules,
  complete minute coverage, six special dates, icon allowlist, 10-title
  minimum, uniqueness, 72-code-point maximum, emoji rejection and exact EN/IT
  semantic index parity.
- [ ] Run:
  `npx vitest run tests/unit/welcome/welcomeCatalog.test.ts`
  and capture the expected RED caused by the missing contract.
- [ ] Implement the strict parser and explicit `import()` branches for
  `catalogs/en.json` and `catalogs/it.json`.
- [ ] Add exactly ten curated titles to each of the ten EN conditions and the
  index-matched Italian translation to each corresponding IT condition.
- [ ] Rerun the focused file and require every catalog scenario GREEN.

### Task 2: Deterministic condition and title resolver

**Files:**

- Create: `src/lib/welcome/resolver.ts`
- Create: `tests/unit/welcome/welcomeResolver.test.ts`

**Interfaces:**

- Consumes `TalosWelcomeCatalog`.
- Produces `TalosWelcomeSelection` and
  `resolveTalosWelcome(catalog, { at: Date, seed: string })`.

- [ ] Write RED tests for all exact English/Italian time boundaries, special
  date precedence, six date mappings, deterministic same-seed selection,
  different-seed variation and null fail-closed behavior.
- [ ] Run the focused test and capture the missing-resolver RED.
- [ ] Implement a deterministic unsigned FNV-1a-style seed hash, exact local
  date/minute matching and selection result.
- [ ] Rerun catalog plus resolver tests to GREEN.

### Task 3: Reactive lifecycle and stale-load fencing

**Files:**

- Create: `src/lib/welcome/runtime.ts`
- Create: `src/composables/useTalosWelcome.ts`
- Create: `tests/unit/composables/useTalosWelcome.test.ts`
- Create: `tests/unit/welcome/welcomeRuntime.test.ts`

**Interfaces:**

- Produces `loadTalosWelcomeSelection(locale, input)` and
  `useTalosWelcome({ locale, sessionId, fallbackTitle, loadSelection?, now?,
  seedFactory? })`.
- Returns readonly `title`, `easterEgg`, `condition` and `index` refs.

- [ ] Write RED tests for initial fallback, successful resolution, same-session
  stability, session recapture, locale translation at the same index,
  rejected-load fallback and out-of-order promise fencing.
- [ ] Run the focused test and capture the missing-composable RED.
- [ ] Implement the dynamically imported runtime, synchronous fallback,
  captured seed/time, locale-only reload, session recapture and monotonic
  request revision. Keep catalog/parser/resolver imports out of the static
  composable graph.
- [ ] Rerun catalog, resolver and composable tests to GREEN.

### Task 4: Decorative allowlisted renderer

**Files:**

- Create: `src/components/chat/TalosWelcomeEasterEgg.vue`
- Create: `tests/unit/chat/TalosWelcomeEasterEgg.test.ts`

**Interfaces:**

- Prop: `kind: TalosWelcomeEasterEggKind | null`.
- Renders one of `PartyPopper`, `Heart`, `Ghost`, `Snowflake`, `Gift`, `Clock`
  or no DOM.

- [ ] Write RED tests for all six mappings, null rendering,
  `aria-hidden="true"`, pointer-event suppression, 20 px sizing and absence of
  accessible text/action semantics.
- [ ] Run the focused test and capture the missing-component RED.
- [ ] Implement the exhaustive static Lucide renderer without animation.
- [ ] Rerun the component test to GREEN.

### Task 5: ChatScreen title-only integration

**Files:**

- Create: `src/components/chat/TalosWelcomeTitle.vue`
- Create: `tests/unit/chat/TalosWelcomeTitle.test.ts`
- Modify: `src/screens/ChatScreen.vue`
- Modify: `src/style.css`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/it.ts`
- Modify: `tests/unit/screens/chatScreen.test.ts`

**Interfaces:**

- `TalosWelcomeTitle` has no public props. It consumes the established i18n and
  chat-controller singletons, calls `useTalosWelcome()` using the active
  session ID and owns the nested async easter-egg renderer.
- ChatScreen retains the existing `t` fallback, loads `TalosWelcomeTitle` with
  `defineAsyncComponent`, and supplies one local functional `h1` as both
  zero-delay loading and error fallback. The async wrapper owns its state with
  `suspensible: false`.
- `style.css` maps the existing parent `data-composer-expanded` state to the
  exact compact/expanded typography of `.talos-welcome-title`.
- Preserve `chat.welcomeHeadline`; remove both unused `chat.welcomeBody`
  catalog leaves.

- [ ] Add the title component test before the component exists and capture the
  missing-module RED.
- [ ] First change the existing empty-state tests to require one non-empty
  `h1`, no subtitle paragraph in expanded or compact layout, and no regression
  to logo/composer/setup behavior.
- [ ] Run the named ChatScreen tests and capture the expected RED: the current
  subtitle paragraph still exists.
- [ ] Integrate the lazy title component and nested easter-egg renderer; remove
  the subtitle node and its two translation leaves.
- [ ] Rerun ChatScreen, setup, i18n parity and localization coverage tests.

### Task 6: Real lazy-build boundary

**Files:**

- Modify: `scripts/verify-initial-chunk.mjs`
- Modify: `tests/unit/build/initialChunkContract.test.ts`

**Interfaces:**

- Add manifest boundaries for
  `src/lib/welcome/catalogs/en.json` and
  `src/lib/welcome/catalogs/it.json`,
  `src/lib/welcome/runtime.ts` and
  `src/components/chat/TalosWelcomeEasterEgg.vue` and
  `src/components/chat/TalosWelcomeTitle.vue`.
- Add output keys `welcome_en_dynamic_entry` and
  `welcome_it_dynamic_entry`, `welcome_runtime_dynamic_entry` and
  `welcome_easter_egg_dynamic_entry` and
  `welcome_title_dynamic_entry`.

- [ ] Extend the manifest fixture first and add RED scenarios that reject
  either catalog, runtime, renderer or title component when statically
  reachable.
- [ ] Run the focused build-contract test and capture the missing-boundary RED.
- [ ] Add both boundaries at the end of the existing ordered contract, extend
  JSON matching to `.json`, and report both entries.
- [ ] Rerun the complete build-contract file to GREEN.

### Task 7: Human-visible browser proof and closure

**Files:**

- Create: `tests/e2e/mobile-welcome-library.e2e.spec.ts`
- Modify: `docs/upstream-provenance.md`
- Modify:
  `docs/superpowers/ledgers/2026-07-29-r7-localized-welcome-library-ledger.md`
- Modify:
  `docs/superpowers/plans/2026-07-29-r7-review-remediation-plan.md`

**Interfaces:**

- E2E imports the packaged catalogs only as test oracles.

- [ ] Write the E2E before product integration is declared complete. Fix time
  to Christmas Day, create a persisted empty chat, assert one heading/no
  subtitle/Gift decoration on phone, switch EN to IT and verify the same
  semantic index, reload, then verify tablet and reduced-motion behavior.
- [ ] Run focused unit, typecheck and production build gates.
- [ ] Run the focused Playwright file against the freshly built bundle.
- [ ] Run the affected locale/chat/build regression matrix and
  `git diff --check`.
- [ ] Record exact fresh counts, sizes, failures if any, rollback and physical
  Android checklist in the ledger; mark slice 13 closed only if every automated
  gate is green.
- [ ] Do not commit. Do not begin final APK/review slice 14 until slice 13 is
  closed.

## Self-review

- Spec coverage: every title-count, locale, time/date, precedence, fallback,
  stable seed, race, subtitle, icon, accessibility, lazy-load and regression
  requirement maps to a named task and gate.
- Placeholder scan: no task defers an interface, file, condition, command or
  acceptance requirement.
- Type consistency: catalog IDs flow unchanged through parser, resolver,
  composable, component and ChatScreen. `TalosWelcomeEasterEggKind | null` is
  the only visual-selection boundary.
- Commit steps from the generic workflow are intentionally removed because the
  owner and repository explicitly forbid agent commits.
