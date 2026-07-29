# R7 research - Localized new-chat welcome library

Date: 2026-07-29  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## User contract and local diagnosis

`ChatScreen.vue` currently renders one fixed `chat.welcomeHeadline` and one
fixed `chat.welcomeBody`. The subtitle is redundant with the composer and the
first-run setup checklist, while the title neither varies across new chats nor
reflects the resolved TALOS UI locale, local time period, or an approved
special date.

The mobile localization boundary already resolves `system | en | it`, hydrates
the Android application locale, loads the matching Vue i18n catalog
dynamically, reacts to explicit language changes, and falls back to English.
The new welcome library must consume that boundary; it must not create a second
locale setting or infer language independently.

`ChatScreen` is already a lazy route. The main entry is currently within two
raw bytes of its enforced JavaScript ceiling, so the 200-title data set must be
a separately verified dynamic descendant and must never enter the initial
static graph.

The first production-build probe refined this local diagnosis: Vite emits
`ChatScreen.vue` as a dynamic facade, but shared imports cause the screen
implementation to live in the initial entry. Therefore the JSON files alone
being dynamic is insufficient. The parser/resolver runtime and multi-icon
renderer also require explicit dynamic boundaries. This finding replaces the
earlier assumption before the slice can close.

The second production-build probe verified those three boundaries, reducing
the entry from 567,156 to 560,994 bytes. That remains 994 bytes over the
immutable 560,000-byte ceiling. Direct inspection of the minified entry
measured 816 bytes for the still-eager `useTalosWelcome` lifecycle alone; the
complete slice delta from the prior 559,998-byte baseline was 996 bytes.
Neither parser strings nor special-date/icon identifiers remained eager.
Accordingly, the whole welcome-title controller/view must be a fourth dynamic
boundary. Raising the budget or compressing lifecycle logic was rejected
because it would hide, rather than remove, the initial-graph regression.

A first fallback integration through Vue `Suspense` correctly separated the
title into a 1.81 kB dynamic chunk, but increased the entry to 565,047 bytes.
The minified entry no longer contained the welcome composable and did contain
Vue's complete `Suspense` implementation. Current official Vue documentation
also still labels `Suspense` experimental:
<https://vuejs.org/guide/built-ins/suspense.html>. It is therefore rejected for
this single async leaf.

The official async-component contract instead directly supports
`loadingComponent`, `errorComponent` and an explicit delay:
<https://vuejs.org/guide/components/async.html#loading-and-error-states>.
TALOS adopts that established boundary with `delay: 0` and
`suspensible: false`: one local functional fallback renders the localized
`h1` immediately during load and again after an import failure, while the lazy
component owns the composable and nested special-date renderer.

The advanced async fallback then reached 560,206 bytes, only 206 bytes over the
unchanged gate. Its minified eager segment still duplicated four component
props and the complete utility-class list. Those values already have
authoritative owners: the lazy component can consume the existing i18n and
chat-controller singletons, while the parent hero already exposes
`data-composer-expanded`. The final adaptation therefore gives
`TalosWelcomeTitle` no public props and moves its two exact typography states
to `style.css`. The eager screen keeps only the established fallback copy,
one semantic class, and the dynamic loader. This is a boundary correction, not
a general minification exercise.

The first Playwright launch exposed a Node ESM test-oracle incompatibility
before any browser test ran: direct JSON imports require the mandatory
`with { type: 'json' }` attribute in current Node:
<https://nodejs.org/api/esm.html#import-attributes>. Because Playwright's
TypeScript transform did not preserve/provide that attribute, the E2E oracle
adapts through Node's stable `readFileSync` plus `JSON.parse` boundary. It still
reads the exact packaged EN/IT source catalogs and does not duplicate fixtures
or alter production loading.

## Official standards and maintained references

Accessed 2026-07-29.

### Unicode CLDR 48.2

1. Unicode Technical Standard #35, LDML Part 4:
   <https://unicode.org/reports/tr35/tr35-dates.html>
   - the current stable document identifies version 48.2;
   - locale day-period names are associated with supplemental
     `dayPeriodRuleSet` rules.
2. Exact pinned supplemental data:
   <https://raw.githubusercontent.com/unicode-org/cldr/release-48-2/common/supplemental/dayPeriods.xml>
   - English selection rules: morning `00:00-12:00`, afternoon
     `12:00-18:00`, evening `18:00-21:00`, night `21:00-24:00`;
   - Italian selection rules: night `00:00-06:00`, morning
     `06:00-12:00`, afternoon `12:00-18:00`, evening `18:00-24:00`.

**Decision: ADAPT behind an AVM-owned, versioned catalog/parser boundary.**
TALOS copies only the four exact selection intervals into the locale JSON and
strictly checks them against the pinned `release-48-2` contract. It does not
ship the complete CLDR data set or add a runtime package. This keeps offline
startup deterministic while making upstream drift visible in tests and
provenance.

### Platform locale authority

1. Android per-app languages:
   <https://developer.android.com/guide/topics/resources/app-languages?hl=en>
   - Android 13 exposes per-app language selection in system settings;
   - public APIs synchronize an in-app language picker with system settings;
   - AndroidX provides the backward-compatible authority on Android 12 and
     earlier.
2. ECMA-402:
   <https://tc39.es/ecma402/>
3. `Intl.DateTimeFormat`:
   <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat>

**Decision: ADOPT the existing TALOS locale authority directly.** The selected
UI locale chooses the catalog. The local `Date` captured when a chat becomes
active supplies month, day, hour and minute. No geolocation, remote clock,
profile attribute or language inference is added.

### Conversation-design evidence

1. Google Conversation Design, Greetings:
   <https://developers.google.com/assistant/conversation-design/greetings>
   - a greeting should welcome briefly, set expectations and return control to
     the user;
   - it should avoid long explanations and front-loaded detail;
   - repeat interactions benefit from variation.
2. Google Business Messages, welcome messages:
   <https://developers.google.com/business-communications/business-messages/guides/how-to/design/welcome-message>
3. Microsoft Bot Framework, first interaction:
   <https://learn.microsoft.com/en-us/azure/bot-service/bot-service-design-first-interaction?view=azure-bot-service-4.0>
4. Open WebUI:
   <https://github.com/open-webui/open-webui>
   - its mature chat surface provides varied, action-oriented greeting copy;
   - its established title-plus-subtitle pattern is deliberately not copied
     because the owner requires title-only TALOS presentation.
5. LibreChat configuration:
   <https://github.com/danny-avila/LibreChat/blob/main/librechat.example.yaml>
   - `customWelcome` demonstrates that welcome copy is an explicit product
     contract rather than model-generated runtime content.

**Decision: ADAPT the documented concise, varied and action-oriented patterns
into original TALOS copy.** The catalog is curated offline and focuses on
building, investigating, comparing, deciding and producing evidence. TALOS
does not copy competitor strings in bulk, add name personalization, or claim a
capability that the chat surface does not possess.

### Seasonal visual precedents

1. Halloween 2019:
   <https://doodles.google/doodle/halloween-2019/>
   - friendly spooky animals, surprises and user choice.
2. Valentine's Day 2025:
   <https://doodles.google/doodle/valentines-day-2025/>
   - a restrained heart/confection motif.
3. New Year's Eve 2025:
   <https://doodles.google/doodle/new-years-eve-2025/>
   - sparkles and a midnight countdown.
4. New Year's Day 2024:
   <https://doodles.google/doodle/new-years-day-2024/>
5. Holidays 2016, day 2:
   <https://doodles.google/doodle/holidays-2016-day-2/>
6. Google Santa Tracker:
   <https://blog.google/products-and-platforms/products/maps/tis-season-santa-tracker/>

**Decision: ADAPT the contextual motifs through the existing pinned icon
system.** The exact allowlist is PartyPopper, Heart, Ghost, Snowflake, Gift and
Clock. The visual is a small static decoration adjacent to the heading, not a
new product action or animated scene.

### Accessibility

1. W3C WAI, Decorative Images:
   <https://www.w3.org/WAI/tutorials/images/decorative/>
   - a visual that repeats or merely decorates adjacent text should be ignored
     by assistive technology to avoid audible clutter.
2. WCAG 2.2 Understanding SC 2.3.3:
   <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions>
   - unnecessary motion should be eliminated or disabled through user
     preferences.

**Decision: ADOPT directly.** The easter egg wrapper is `aria-hidden="true"`,
has no focus or pointer behavior, and is static. The title remains the sole
heading and accessible text.

## Exact open-source pin

The implementation directly reuses the installed:

```text
@lucide/vue@1.25.0
license: ISC
integrity: sha512-hkEetV+v48ScIn3uwqwWQ66sI8foeP2q6OMI09GzLFH4SfvBlfe3JHYlMBdBCqFC7WRlhFsndyDn/awRKRc2OQ==
```

No dependency or lockfile change is permitted by this slice.

## Rejected alternatives

- Existing Vue i18n catalog arrays: rejected because they would mix static UI
  messages with a large dynamic editorial library.
- Runtime translation or model generation: rejected because it breaks
  offline determinism, locale parity, reproducibility and startup safety.
- Remote welcome-copy service: rejected because startup must not depend on
  network health, tracking or server state.
- Combinatorial fragments: rejected because cross-locale grammar and editorial
  quality cannot be guaranteed.
- User-name or profile personalization: rejected because it is not requested
  and would couple the greeting to personal data and global-memory readiness.
- Custom SVGs, emoji or a second icon package: rejected because the pinned
  Lucide set already supplies appropriate maintained glyphs.
- Animated fireworks, snow or moving hats: rejected for this slice because the
  requested contextual signal is satisfied by a static decoration and motion
  would add avoidable accessibility and rendering risk.

## Provenance and upgrade gate

- CLDR behavior is pinned to `release-48-2`; exact minute-boundary tests fail
  if catalog data drifts.
- `@lucide/vue` remains pinned by package version and lockfile integrity.
- Catalog schema `talos.welcome/1`, strict key checks, EN/IT parity tests and
  the real build manifest make upstream or editorial drift visible.
- Any later CLDR or icon upgrade requires a new research decision, catalog
  conformance update, affected tests and a physical-device check.
