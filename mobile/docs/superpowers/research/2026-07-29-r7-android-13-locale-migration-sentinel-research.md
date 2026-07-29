# R7 research - Android 13 locale migration sentinel

Date: 2026-07-29
Lane: `lane/kimi-mobile`
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Local diagnosis

TALOS now opts into AppCompat automatic locale storage and correctly treats an
Android 13+ framework locale as authoritative. The remaining upgrade gap is
the older TALOS custom store:

- pre-migration builds persisted `talos.mobile.locale` through Capacitor
  Preferences;
- AppCompat cannot discover that key because it only migrates its own locale
  record;
- on the first Android 13+ launch, an empty framework locale is currently
  interpreted as an intentional System choice;
- therefore an existing explicit `en` or `it` preference is discarded before
  it has ever been handed to `AppCompatDelegate.setApplicationLocales()`.

Always restoring the JS value would be worse: after the user later selects
System in Android Settings, every launch would reapply the stale explicit
locale. The missing state is whether the one-time custom-store handoff has
already been considered.

## Current official sources

Accessed 2026-07-29:

1. Android Developers, Per-app language preferences:
   <https://developer.android.com/guide/topics/resources/app-languages>
   - an app with an existing language picker must call
     `AppCompatDelegate.setApplicationLocales()` the first time it runs on an
     Android 13 device;
   - a custom locale store should perform a one-time handoff to the supported
     API;
   - the empty locale list means follow System and system Settings must remain
     synchronized.
2. AndroidX `AppCompatDelegate` reference:
   <https://developer.android.com/reference/androidx/appcompat/app/AppCompatDelegate>
   - API 33+ storage is owned by the framework;
   - AppCompat auto-storage migrates AppCompat's pre-33 record, while custom
     storage must handle its own transition;
   - `setApplicationLocales()` is the maintained compatibility boundary.
3. AndroidX primary source, `AppCompatDelegate`:
   <https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/appcompat/appcompat/src/main/java/androidx/appcompat/app/AppCompatDelegate.java>
   - upstream uses a durable component-enabled marker so its framework sync is
     one-shot;
   - it never overwrites a non-empty framework locale;
   - the marker is written only after the sync path is considered.
4. Capacitor Preferences:
   <https://capacitorjs.com/docs/apis/preferences>
   - TALOS already pins `@capacitor/preferences@8.0.1`;
   - string keys and values are the supported durable contract.

## Upstream decision

**ADOPT** Android's documented one-time custom-store handoff semantics.

**ADAPT** the upstream marker pattern behind the existing AVM-owned
`nativeLocale` adapter:

- add one namespaced Preferences sentinel,
  `talos.mobile.locale.native-migration.v1`, whose only accepted complete value
  is `1`;
- never replace AppCompat or framework locale storage;
- when native already has an explicit locale, it wins and the handoff can be
  marked complete;
- when native is empty and the sentinel is absent, hand an explicit legacy
  `en`/`it` value to the existing `TalosLocale.setMode()` bridge once;
- write the sentinel only after that native handoff succeeds;
- once complete, an empty Android 13+ locale is authoritative System;
- missing bridge-generation metadata remains fail-closed and does not seal the
  migration, so a healthy later boot may retry.

**REJECT** relying on `autoStoreLocales` alone because it cannot read TALOS's
custom Preferences key. **REJECT** a per-boot restore because it violates the
Android Settings authority contract. **REJECT** a new package or native store:
the existing pinned Preferences and AppCompat boundaries are sufficient.

No dependency, permission, language, backup policy, provider contract, or
initial bundle import is added.
