# P2-G research - Android locale restoration

Date: 2026-07-29  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Local diagnosis

TALOS calls `AppCompatDelegate.setApplicationLocales()` through
`TalosLocalePlugin`, but its manifest does not opt into AndroidX locale
storage. Consequently an explicit app locale is not restored natively after
process death on Android 12/API 32 and lower.

The JavaScript layer separately persists `talos.mobile.locale`, so the WebView
can still paint in the remembered language. That masks the native failure and
does not repair AppCompat state. Merely adding the AndroidX opt-in would protect
new choices but would not migrate an explicit preference written by an older
TALOS APK. Current hydration also treats an empty native locale as
non-authoritative on every Android version, so clearing the app language to
System in Android 13+ Settings can leave the old JavaScript preference active.

## Current official sources

Accessed 2026-07-29:

1. Android Developers, Per-app language preferences:
   <https://developer.android.com/guide/topics/resources/app-languages>
   - Android 12/API 32 and lower require AndroidX `autoStoreLocales=true`;
   - the metadata holder service must be disabled and non-exported;
   - an app with an existing custom store must hand its pre-existing requested
     locales to `AppCompatDelegate.setApplicationLocales()`;
   - Android 13+ system settings and the app picker must stay synchronized;
   - setting an empty locale list means follow System.
2. AndroidX `AppLocalesMetadataHolderService` reference:
   <https://developer.android.com/reference/androidx/appcompat/app/AppLocalesMetadataHolderService>
   - the service is a never-invoked metadata holder;
   - it was added in AppCompat 1.6.0 and the `autoStoreLocales` boolean is the
     explicit opt-in to persistence.
3. AndroidX `AppCompatDelegate` reference:
   <https://developer.android.com/reference/androidx/appcompat/app/AppCompatDelegate>
   - `setApplicationLocales()` and `getApplicationLocales()` are the supported
     compatibility boundary and must be called on the main thread.

TALOS already pins `androidx.appcompat:appcompat:1.7.1`, compiles/targets API
36, has `MainActivity -> BridgeActivity -> AppCompatActivity`, advertises
exactly `en` and `it`, and invokes the setter on the UI thread.

## Upstream decision

**ADOPT directly** AndroidX automatic locale storage with the exact official
manifest service. This is the maintained solution for Android 12 and lower;
building another native preference store would duplicate AppCompat semantics
and require an earlier Activity lifecycle bridge that JavaScript Preferences
cannot safely provide.

**ADAPT** the official custom-store handoff behind `TalosLocale`:

- native state reports whether the platform uses AndroidX legacy storage;
- on API 32 and lower only, an empty native locale plus an explicit existing
  TALOS preference triggers one `setApplicationLocales()` handoff;
- once AndroidX contains a locale, it is authoritative;
- on Android 13+, native state is always authoritative, including an empty list
  selected from system Settings.

No new dependency, language, permission, backup capability or provider
contract is introduced. The documented small blocking AndroidX read/write is
accepted for this two-value startup preference; it is preferable to silently
losing locale state.

