# P0 localization and unified onboarding research

Date: 2026-07-28  
Lane: `lane/kimi-mobile`  
Subsystems: TALOS mobile UI, local persistence, Android container

## Local evidence

TALOS currently has two independent fullscreen flows:

- `TalosMobileSetupIntro`: story, PIN and provider/model;
- `TalosMobileAccountWizard`: name, appearance, a duplicate PIN invitation,
  unavailable OAuth and summary.

The second flow is replay-only, but Settings presents both “Workspace setup”
and “Introduction”. The first flow cannot choose a language or capture the
display name. The account store persists a name, and the chat repository
already owns genuine global untrusted memories, but the two are not joined.
There is no localization runtime or locale preference.

## Primary sources

- Android per-app language preferences:
  https://developer.android.com/guide/topics/resources/app-languages
  - follow the system locale by default;
  - expose supported locales to Android Settings;
  - synchronize an in-app picker through `setApplicationLocales`;
  - reset with an empty locale list for “system default”.
- Android `Locale` display names:
  https://developer.android.com/reference/java/util/Locale
- Vue I18n Composition API and fallback:
  https://vue-i18n.intlify.dev/guide/advanced/composition
  https://vue-i18n.intlify.dev/guide/essentials/fallback
- Vue I18n installation:
  https://vue-i18n.intlify.dev/guide/installation
- Unicode CLDR language matching:
  https://unicode.org/cldr/charts/49/supplemental/language_matching.html
- W3C language-tag and selector guidance:
  https://www.w3.org/International/articles/language-tags/
  https://www.w3.org/International/questions/qa-navigation-select
  https://www.w3.org/International/questions/qa-site-conneg
  - use BCP 47;
  - show languages in forms people can recognize;
  - do not use country flags for languages.

## Mature product comparison

- ChatGPT detects the browser/device language for supported languages and also
  exposes Settings > App > Language:
  https://help.openai.com/en/articles/8357869
- Claude exposes a dedicated Language setting and updates the interface
  immediately while keeping conversation language independent:
  https://support.claude.com/en/articles/10769299-how-to-use-claude-in-your-preferred-language
- Gemini localizes menus, notifications and UI through its Language setting,
  while typed conversations may still use any supported language:
  https://support.google.com/gemini/answer/15984485

TALOS can one-up these flows by keeping three choices visibly distinct:

1. UI locale;
2. conversation language, inferred from the user rather than forced;
3. dictation language, handled by its dedicated later slice.

Changing UI language must never silently rewrite prompts, stored user content,
memory content or provider payloads.

## Upstream decision

Adopt `vue-i18n` directly, pinned to `11.4.8`.

- npm integrity:
  `sha512-0ULeHP6Z9CGvAm67S77ZEp41cfGXIREGL8qfhos2BMgcQQewtQcDKuojt6jjasAD/S8GwfTp2ySPmDSpwvrCMQ==`
- license: MIT
- compatibility: Vue 3, Composition API
- provenance:
  https://www.npmjs.com/package/vue-i18n
  https://github.com/intlify/vue-i18n/releases

The runtime and locale catalogs will be dynamically loaded before Vue mounts.
That preserves the initial static-graph budget while preventing a mixed-language
first frame. TALOS owns locale resolution, persistence, Android synchronization,
coverage tests and product copy; vendor APIs stay behind the TALOS adapter.

`i18next-vue` was rejected because it adds a wrapper over a second runtime with
far less direct Vue adoption. A custom formatter was rejected because it would
reproduce plural, fallback and interpolation semantics already maintained by
the upstream project.

On Android, adopt the existing pinned
`androidx.appcompat:appcompat:1.7.1` locale API directly. No new native
dependency is required. A small Capacitor adapter exposes only supported BCP 47
tags and “system”; it is not a second localization engine.

## Locale scope

This release truthfully supports:

- `en` — English fallback;
- `it` — complete Italian UI.

`it-*` resolves to Italian and `en-*` to English. Other system locales fall
back to English until a complete reviewed catalog exists. Android must advertise
only these two languages; listing untranslated languages would make the system
settings lie.

## Security and reliability decisions

- locale values are allowlisted, bounded BCP 47 identifiers;
- interpolation parameters are escaped; translation messages contain no HTML;
- user content, model output and untrusted memory content are never used as
  translation keys;
- Settings persistence and Android locale synchronization are fail-soft, but
  the selected UI locale changes immediately;
- the `<html lang>` attribute follows the resolved locale;
- the name-generated memory remains `trust_level=untrusted`, global in scope,
  and uses a stable idempotency key.

