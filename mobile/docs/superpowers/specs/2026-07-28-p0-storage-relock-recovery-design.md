# P0 storage relock recovery - approved design

## Owner-visible failure

After TALOS relocks its encrypted chat database and the owner unlocks again,
chat hydration can fail with:

`Local chat storage is unavailable. Query: No available connection for database talos_mobile`

Doctor then reports only `SQLCipher native - error`, which confirms failure but
does not distinguish a closed connection from a locked key or another storage
fault.

## Root cause

There are two intentional caches:

1. `createCapacitorSqliteRuntime()` owns the current upstream connection and
   clears it during `forgetSecret()`.
2. `createSqliteChatRepository()` owns a convenience reference to the
   connection returned during its first initialization.

The first cache is reset during relock; the second is not. The lazy production
repository remains alive, so `retryPersistence()` reaches its old wrapper after
unlock. The upstream Android registry has already removed that wrapper's native
database entry and returns the exact reported error.

## Required behavior

1. Every repository operation must obtain the runtime's current connection
   before touching SQLite.
2. Concurrent obtains must remain coalesced.
3. A healthy connection must not cause a new native connection per query.
4. Relock must still close the connection and erase the plugin-held secret.
5. Unlock/retry must establish a replacement without deleting, recreating,
   migrating, or replaying data.
6. Doctor must retain the engine/status summary and add a bounded,
   non-secret-bearing recovery hint for known connection-loss and locked-key
   states.

## Design

`createSqliteChatRepository.initialize()` no longer treats its local
`connection` reference as authoritative. It always asks
`TalosSqliteRuntime.connect()` for the authoritative current wrapper and stores
the returned value. Its existing `initializing` promise continues to coalesce
concurrent calls. `createCapacitorSqliteRuntime.connect()` remains unchanged:
it immediately returns its cached wrapper while healthy and establishes a new
one only after `forgetSecret()` has nulled it.

`talosStorageDoctorRow()` becomes a pure formatter in
`doctorSections.ts`. It maps only two known error families to controlled hints:
connection registry loss and a protected-but-locked key. Other failures remain
an honest generic retry instruction; arbitrary native error text is not copied
into the visible row.

## Non-goals

- No automatic retry of a query or mutation after it was sent to SQLite.
- No database repair, destructive recreation, or key migration.
- No change to app-lock timing or PIN/biometric policy.
- No change to the lazy repository lifecycle.

## Human-visible proof

On the physical Android device:

1. Open an existing chat and note its last message.
2. Background TALOS until the lock is armed, return, and unlock.
3. Confirm the same chat and messages load without the connection error.
4. Send one new message, relock/unlock again, and confirm it persists once.
5. Open Doctor: encrypted local storage is `ready`.
6. Repeat once with a wrong PIN first; no database opens until the correct PIN.

