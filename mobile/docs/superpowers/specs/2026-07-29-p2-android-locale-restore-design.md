# P2-G design - Native locale restoration

## Goal

An explicit English/Italian choice must survive process death natively on
Android 12 and lower, existing installations must migrate once, and Android
13+ system Settings must remain authoritative.

## Native storage contract

Declare the official disabled, non-exported
`androidx.appcompat.app.AppLocalesMetadataHolderService` with
`autoStoreLocales=true` inside `<application>`.

`TalosLocalePlugin.getState()` and `setMode()` add:

- `usesAppCompatStorage: true` on API 32 and lower;
- `usesAppCompatStorage: false` on API 33 and higher.

The existing application/system locale arrays and setter stay stable.

## Hydration reconciliation

`reconcileTalosNativeLocaleMode(persistedMode, nativeState)` returns the UI
mode plus an optional native handoff:

1. Android 13+: native explicit locale or native empty/System always wins.
2. Android 12- with a restored explicit AppCompat locale: native wins.
3. Android 12- with empty AppCompat locale and explicit legacy JS preference:
   keep that mode and call `setMode(mode)` once; AndroidX stores it.
4. Android 12- with both stores empty/System: follow System.
5. Missing/malformed storage-generation metadata fails closed as modern:
   never overwrite a potentially intentional Android Settings choice.

The native handoff runs during existing pre-mount locale hydration. Failure
leaves the deterministic JS preference active and is handled by the existing
bridge error boundary.

## Permanent scenarios

- `ANDROID-LOCALE-RESTORE-01 manifest opts into official AndroidX storage`
- `ANDROID-LOCALE-RESTORE-02 explicit Android 12 legacy preference is handed off`
- `ANDROID-LOCALE-RESTORE-03 restored AndroidX locale overrides stale JS`
- `ANDROID-LOCALE-RESTORE-04 Android 13 empty locale means System`
- `ANDROID-LOCALE-RESTORE-05 malformed native generation never overwrites Settings`
- `ANDROID-LOCALE-RESTORE-06 en/it allowlist and empty-System mapping remain stable`

## Verification

Establish manifest RED, implement reconciliation and tests, run focused
TypeScript/JVM suites, merged-manifest/resource/Java gates, localization
regressions, production build, locale E2E and `git diff --check`. Cold process
death on physical Android 12 remains a final owner acceptance item.

