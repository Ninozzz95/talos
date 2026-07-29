# R7 design - Android 13 locale migration sentinel

## Goal

Preserve an explicit language selected in a pre-native TALOS build on the first
Android 13+ launch, exactly once, while keeping all subsequent Android Settings
choices authoritative.

## State and reconciliation contract

The existing locale preference stays `talos.mobile.locale`. Add:

```text
talos.mobile.locale.native-migration.v1 = 1
```

Any absent or other value means incomplete. The sentinel contains no locale;
the canonical language remains in the existing app/native stores.

`reconcileTalosNativeLocaleMode(persistedMode, nativeState,
migrationComplete)` returns:

- the effective `mode`;
- an optional `restoreMode`;
- whether the caller may durably mark the migration complete.

Rules:

1. Unknown native storage generation stays fail-closed, never restores and
   never writes the marker.
2. A non-empty native locale always wins. If the marker is absent, it may now
   be completed without changing the locale.
3. Android 12- keeps the existing AppCompat handoff. A successful handoff may
   complete the custom-store migration before a later OS upgrade.
4. Android 13+ with the marker present trusts native empty as System.
5. Android 13+ with no marker and an explicit legacy `en`/`it` value calls
   `setMode()` once, then writes the marker.
6. No marker is written when `setMode()` rejects. A later launch retries.
7. An incomplete migration with both stores at System requires no native write
   and may be marked complete.

Hydration preserves the synchronous localStorage mirror as a paint
optimization. The durable sentinel uses the existing timeout-fenced Preferences
bridge and never enters localStorage.

## Permanent scenarios

- `ANDROID-LOCALE-MIGRATION-01 explicit legacy Android 13 locale is handed off`
- `ANDROID-LOCALE-MIGRATION-02 completed Android 13 empty locale means System`
- `ANDROID-LOCALE-MIGRATION-03 native explicit locale wins and seals handoff`
- `ANDROID-LOCALE-MIGRATION-04 malformed native generation does not seal`
- `ANDROID-LOCALE-MIGRATION-05 failed native handoff leaves migration retryable`
- Existing `ANDROID-LOCALE-RESTORE-01..06` remain green.

## Compatibility and rollback

The native plugin API, locale allowlist, manifest, AndroidX pin, locale config,
visible picker, and current preference key remain unchanged. Rollback removes
the new sentinel branch and tests; an already written sentinel is inert to
older code.
