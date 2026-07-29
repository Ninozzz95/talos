# P0 localization and unified onboarding design

Date: 2026-07-28

## Product flow

One fullscreen modal owns first-run and replay:

1. Language — always the first page while the policy flag is enabled.
2. Introduction — the existing honest “what works / what is next” story.
3. Your name — the only current workspace datum.
4. PIN — the existing database-protection journey.
5. Model — the existing provider runtime panel.

The global Skip action remains available throughout. The old replay-only
workspace wizard and its duplicate PIN/OAuth pages are removed. Settings has
one “Run setup again” action.

`TALOS_INTRO_LANGUAGE_PAGE_ENABLED` is the reversible product seam. When false,
the same modal starts on the introduction and still resolves the system locale
automatically. No data migration or component rewrite is required to compare
the two variants later.

## Locale contract

```text
TalosLocaleMode = "system" | "en" | "it"
TalosSupportedLocale = "en" | "it"
```

`resolveTalosLocale(mode, systemTags)` applies exact primary-language matching
and falls back to `en`. `setTalosLocaleMode`:

1. loads the exact locale catalog;
2. updates Vue I18n and `<html lang>`;
3. writes a synchronous non-secret mirror and Capacitor Preferences;
4. asks the native adapter to synchronize Android per-app language state.

The visible selector uses “Segui il sistema / System default”, “Italiano” and
“English”; no flags.

## Global profile memory

The repository gains `upsertMemory(input)`. The SQLite implementation uses a
single `INSERT ... ON CONFLICT(id) DO UPDATE` transaction; the in-memory and
lazy adapters preserve the same contract.

`upsertTalosDisplayNameMemory(name)` writes:

- id: `talos-profile-display-name`;
- scope: `global`;
- kind: `preference`;
- title: `Display name`;
- content: the normalized display name only;
- source: `talos_mobile_workspace_setup`;
- metadata:
  `{ system_memory_key: "profile.display_name", created_from:
  "talos_mobile_workspace_setup" }`;
- trust: always repository-owned `untrusted`.

The stable id makes replay, reload and retry idempotent. Changing the name
updates the one row instead of creating contradictory memories. The modal
persists the account name first, then the memory. A failed memory write is
shown and stays retryable; Skip remains an escape rather than pretending that
the memory exists.

## Rendering and bundle

`createTalosI18n()` dynamically imports `vue-i18n` and the locale catalogs
before `createApp(...).mount(...)`. Both catalogs have the same typed key tree.
The default test adapter is English. UI source uses semantic keys; model/tool
schema descriptions remain canonical English because they are protocol input,
not application chrome.

Every user-facing template label, accessible name, placeholder, menu, setting,
station and ordinary toast/error is localized. Brand names, provider/model
identifiers, filenames, URLs, user content, model output and diagnostic codes
remain unchanged.

## Android boundary

`TalosLocalePlugin` exposes:

- `getState()` — supported application locale and system locale tags;
- `setMode({ mode })` — empty `LocaleListCompat` for system, otherwise one
  allowlisted locale.

`TalosLocalePolicy` is pure Java and owns validation for JVM tests. Android
advertises only `en` and `it` through `locales_config.xml`. `MainActivity`
registers the plugin exactly like existing AVM-owned native adapters.

## Failure and rollback

- Missing or corrupt locale preference resolves to `system`.
- Unsupported tags fall back to English.
- Catalog parity is a build-blocking test.
- A native locale failure cannot prevent JS UI switching or app boot.
- A memory failure cannot be reported as success.
- Rollback removes the locale adapter/catalogs, restores the single English UI
  and restores the old replay-only wizard; no database migration is required.

