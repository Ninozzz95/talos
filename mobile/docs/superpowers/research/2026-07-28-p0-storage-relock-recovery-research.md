# P0 storage relock recovery - upstream research (2026-07-28)

## Question

Why can TALOS unlock successfully and then receive
`No available connection for database talos_mobile`, and which layer should
restore the connection without risking chat data or replaying writes?

## Exact upstream

- Package: `@capacitor-community/sqlite`
- AVM pin: `8.1.0` in `mobile/package.json` and `mobile/package-lock.json`
- Upstream release: `v8.1.0`, commit `f507a1e`, published 2026-03-30
- License: MIT
- Primary sources:
  - [official v8.1.0 release](https://github.com/capacitor-community/sqlite/releases/tag/v8.1.0)
  - [official plugin repository and supported connection APIs](https://github.com/capacitor-community/sqlite)
  - [pinned TypeScript source](https://github.com/capacitor-community/sqlite/blob/v8.1.0/src/definitions.ts)
  - [pinned Android connection registry](https://github.com/capacitor-community/sqlite/blob/v8.1.0/android/src/main/java/com/getcapacitor/community/database/sqlite/CapacitorSQLite.java)
- Lifecycle source:
  - Package: `@capacitor/app`, AVM pin `8.1.1`
  - [official Capacitor v8 App API](https://capacitorjs.com/docs/apis/app)

## Findings

1. The plugin's supported API includes `closeConnection`,
   `isConnection`, `retrieveConnection`, and
   `checkConnectionsConsistency`; native storage is backed by SQLCipher.
2. In the pinned wrapper, `closeConnection()` closes the native connection
   and removes its JavaScript wrapper from the plugin connection dictionary.
3. In the pinned Android implementation, `closeConnection()` removes the
   database from `dbDict`. A later query through an old wrapper looks up that
   dictionary and throws the exact owner-reported error when the entry no
   longer exists.
4. AVM correctly calls the official close and secret-clear APIs during relock.
   The defect is above the plugin: `createSqliteChatRepository()` separately
   caches the old `TalosSqlConnection` and its `initialize()` returns before it
   asks the runtime for the post-unlock connection.
5. Capacitor documents that Android `appStateChange` follows Activity
   `onResume`/`onStop`. That confirms the observed background/relock/foreground
   sequence is a normal supported lifecycle path, not an exceptional database
   corruption case.

## Upstream decision

**Adapt behind the existing AVM-owned adapter.**

Keep the pinned upstream package and its official close/retrieve/create
semantics. Make the repository reacquire the current connection from
`TalosSqliteRuntime` whenever a repository operation enters `db()`. The runtime
already deduplicates establishment and returns its cached connection without a
native bridge call while it remains valid; after relock it has deliberately
cleared that cache, so the same call establishes the replacement.

Rejected alternatives:

- **New dependency or home-grown connection registry:** no missing upstream
  capability; it would duplicate the plugin and AVM runtime registries.
- **Repository invalidation callback from the lock service:** couples security
  orchestration to a concrete repository instance and still leaves other
  runtime resets unsafe.
- **Retry on the error string:** unsafe for writes because the caller cannot
  prove whether a failed native call took effect. Recovery must happen before
  the operation, not by replaying it.
- **Delete/recreate/import the database:** the database and key are valid. This
  would introduce data-loss risk for a stale-wrapper defect.

## Security and rollback

- No schema, database file, encryption key format, or migration changes.
- No read or write is automatically replayed.
- Relock continues to close SQLCipher and clear the plugin-held secret.
- Rollback is the scoped repository reacquisition change plus the Doctor
  formatter; no stored data needs conversion.

