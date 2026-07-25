import {
    commitTalosDatabaseKey,
    mintTalosDatabaseKey,
    lockTalosDatabaseKey,
    protectTalosDatabaseKey,
    readTalosDatabaseKeyState,
    resolveTalosDatabaseKey,
    talosDatabaseKeyIsProtected,
    unlockTalosDatabaseKey,
    unprotectTalosDatabaseKey,
} from '@/services/databaseKey'
import type { TalosSqliteRuntime } from '@/persistence/sqliteTypes'

/**
 * Debt S1 — the three moments where the lock has to touch the database.
 *
 * Kept in one place because they must agree: enabling protection, unlocking on
 * a cold start, and re-locking. Spread across the settings panel, the lock
 * screen and the shell they would drift, and a drift here means either a lock
 * that protects nothing or a database nobody can open.
 */
let runtime: TalosSqliteRuntime | null = null

/** The production repository registers its runtime here at creation. */
export function registerTalosSqliteRuntime(value: TalosSqliteRuntime | null): void {
    runtime = value
}

export interface TalosProtectionOutcome {
    /** True when a legacy database had to be rebuilt under a managed key. */
    migrated: boolean
}

/**
 * Turn the PIN into the real key.
 *
 * Fresh installs: the key is already ours, so this only wraps 32 bytes — the
 * database is NOT re-encrypted and the operation is instant.
 *
 * Installs from before this shipped: their passphrase was generated inside the
 * plugin and cannot be read, so it cannot be wrapped. Their data is exported,
 * the database is rebuilt under a key we control, and only then wrapped. That
 * path is the slow one and the caller must show progress.
 */
export async function enableTalosDatabaseProtection(pin: string): Promise<TalosProtectionOutcome> {
    let migrated = false
    if (await readTalosDatabaseKeyState() === 'absent') {
        // The database is open under a passphrase only the plugin knows, so it
        // must be rebuilt under a key we can wrap. SF-CRITICAL: a missing
        // runtime used to fall through silently and wrap a key the database had
        // never seen — the first re-lock then destroyed the only working one.
        if (!runtime?.adoptManagedSecret) {
            throw new Error('TALOS_DB_PROTECT_UNAVAILABLE: the database runtime is not ready.')
        }
        const key = mintTalosDatabaseKey()
        await runtime.adoptManagedSecret(key)
        // Only now is the key real: it opens the database that exists on disk.
        await commitTalosDatabaseKey(key)
        migrated = true
    } else {
        await resolveTalosDatabaseKey()
    }
    await protectTalosDatabaseKey(pin)
    return { migrated }
}

/** Turn the lock off: the key returns to device-only protection. */
export async function disableTalosDatabaseProtection(): Promise<void> {
    if (!await talosDatabaseKeyIsProtected()) return
    await unprotectTalosDatabaseKey()
}

/**
 * Unlock on a cold start. Returns false when the PIN cannot open the key, so
 * the lock screen can stay up instead of revealing an empty workspace.
 */
export async function unlockTalosDatabase(pin: string): Promise<boolean> {
    if (!await talosDatabaseKeyIsProtected()) {
        // The lock was armed before the key was managed: this verified PIN is
        // the only moment we can close the original defect, so take it. A
        // failure here must never block a legitimate unlock.
        try {
            await enableTalosDatabaseProtection(pin)
        } catch {
            // Stay usable; the app is no worse off than it was before.
        }
        return true
    }
    try {
        await unlockTalosDatabaseKey(pin)
        return true
    } catch {
        return false
    }
}

/**
 * Re-lock. The key leaves memory AND the plugin's own store, otherwise the
 * database stays openable without the PIN — which is the defect this whole
 * change exists to remove.
 */
export async function relockTalosDatabase(): Promise<void> {
    // Unconditional and FIRST: a Keystore hiccup used to leave the key in
    // memory and the lock decorative for the rest of the session.
    lockTalosDatabaseKey()
    try {
        if (!await talosDatabaseKeyIsProtected()) return
        await runtime?.forgetSecret?.()
    } catch {
        // A failure here must not trap the user in a half-locked shell; the key
        // is already out of memory, and the next launch re-derives it.
    }
}
