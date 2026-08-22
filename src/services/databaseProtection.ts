import {
    commitTalosDatabaseKey,
    mintTalosDatabaseKey,
    lockTalosDatabaseKey,
    protectTalosDatabaseKey,
    readTalosDatabaseKeyState,
    resolveTalosDatabaseKey,
    talosDatabaseKeyIsProtected,
    unlockTalosDatabaseKey,
    disarmTalosBiometricUnlock,
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

/**
 * I-09. Every transition below takes the key away from, or gives it back to, a
 * live database. Run two at once and they fight: the shell locked the screen
 * and started the re-lock without waiting, so a PIN entered while the previous
 * close was still in flight produced an unlocked interface over a database
 * still being torn down — which is where
 * `No available connection for database talos_mobile` came from.
 *
 * One lane, FIFO. The state is what the lane last achieved, not what the
 * screen is showing.
 */
export type TalosDatabaseLockState =
    | 'unlocked'
    | 'locked'
    /**
     * The re-lock could not finish. This is not cosmetic: `forgetSecret()`
     * closes the connection and only then clears the plugin's stored
     * passphrase, so a refused close leaves that passphrase behind — and the
     * next launch finds `isSecretStored()` true and opens the database without
     * ever asking for the PIN. Swallowing that made the lock decorative and
     * silent at the same time.
     */
    | 'recovery_required'

let lockState: TalosDatabaseLockState = 'unlocked'
let lockFailure: string | null = null
let transitionTail: Promise<unknown> = Promise.resolve()

/** The lane. Nothing here may run concurrently with anything else here. */
function serializeTransition<T>(run: () => Promise<T>): Promise<T> {
    const operation = transitionTail.then(run, run)
    transitionTail = operation.then(() => undefined, () => undefined)
    return operation
}

/** For the Doctor. Bounded, and never carries a secret. */
export function talosDatabaseLockState(): TalosDatabaseLockState {
    return lockState
}

export function talosDatabaseLockFailure(): string | null {
    return lockFailure
}

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
export function enableTalosDatabaseProtection(pin: string): Promise<TalosProtectionOutcome> {
    return serializeTransition(() => protectExistingDatabase(pin))
}

/**
 * The body of the above, without the queue. Callers that are ALREADY inside a
 * transition use this — re-entering the lane from within it would wait on
 * itself forever.
 */
async function protectExistingDatabase(pin: string): Promise<TalosProtectionOutcome> {
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
export function disableTalosDatabaseProtection(): Promise<void> {
    return serializeTransition(async () => {
        // The biometric copy goes FIRST and unconditionally. It is a wrapping
        // of the same key: leaving it behind would keep a hardware-backed door
        // onto a database the user has just told us to stop protecting, and the
        // Keystore entry would outlive every record explaining what it opens.
        await disarmTalosBiometricUnlock().catch(() => {})
        if (!await talosDatabaseKeyIsProtected()) return
        await unprotectTalosDatabaseKey()
        lockState = 'unlocked'
        lockFailure = null
    })
}

/**
 * Unlock on a cold start. Returns false when the PIN cannot open the key, so
 * the lock screen can stay up instead of revealing an empty workspace.
 */
export function unlockTalosDatabase(pin: string): Promise<boolean> {
    // Queued: a PIN accepted while the previous re-lock is still closing the
    // connection would be handing the key back to a database mid-teardown.
    return serializeTransition(async () => {
        if (!await talosDatabaseKeyIsProtected()) {
            // The lock was armed before the key was managed: this verified PIN
            // is the only moment we can close the original defect, so take it.
            // A failure here must never block a legitimate unlock.
            try {
                await protectExistingDatabase(pin)
            } catch {
                // Stay usable; the app is no worse off than it was before.
            }
            lockState = 'unlocked'
            return true
        }
        try {
            await unlockTalosDatabaseKey(pin)
        } catch {
            return false
        }
        lockState = 'unlocked'
        // A previous re-lock that could not clear the stored secret is moot
        // once the key is legitimately back: the door is open on purpose now.
        lockFailure = null
        return true
    })
}

/**
 * Re-lock. The key leaves memory AND the plugin's own store, otherwise the
 * database stays openable without the PIN — which is the defect this whole
 * change exists to remove.
 */
export function relockTalosDatabase(): Promise<void> {
    // Unconditional, FIRST, and outside the queue: a Keystore hiccup used to
    // leave the key in memory and the lock decorative for the rest of the
    // session. Nothing may delay this, least of all waiting for a turn.
    lockTalosDatabaseKey()
    return serializeTransition(async () => {
        try {
            if (!await talosDatabaseKeyIsProtected()) {
                lockState = 'locked'
                return
            }
            await runtime?.forgetSecret?.()
        } catch (error) {
            // NOT swallowed. `forgetSecret()` closes the connection and only
            // then clears the plugin's stored passphrase, so a refused close
            // leaves that passphrase behind — and the next launch finds
            // `isSecretStored()` true and opens the database without asking for
            // the PIN. The user is still locked out of the interface, so this
            // does not throw at them, but the state stops claiming the lock
            // engaged and the Doctor can say so.
            lockState = 'recovery_required'
            lockFailure = error instanceof Error ? error.message : String(error)
            return
        }
        lockState = 'locked'
        lockFailure = null
    })
}
