import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SF review of debt S1: every one of the four CRITICAL findings lived in this
 * orchestration module, and it had no tests at all. These pin the ORDER of the
 * steps, because the failures were never in the crypto — they were in doing the
 * right things in the wrong sequence, or skipping one silently.
 */
const key = vi.hoisted(() => ({
    mintTalosDatabaseKey: vi.fn(() => 'minted-key'),
    commitTalosDatabaseKey: vi.fn(async () => {}),
    lockTalosDatabaseKey: vi.fn(),
    protectTalosDatabaseKey: vi.fn(async () => {}),
    readTalosDatabaseKeyState: vi.fn(async () => 'absent' as string),
    resolveTalosDatabaseKey: vi.fn(async () => 'device-key'),
    talosDatabaseKeyIsProtected: vi.fn(async () => false),
    unlockTalosDatabaseKey: vi.fn(async () => 'unwrapped'),
    unprotectTalosDatabaseKey: vi.fn(async () => {}),
    disarmTalosBiometricUnlock: vi.fn(async () => {}),
}))
vi.mock('@/services/databaseKey', () => key)

const {
    disableTalosDatabaseProtection,
    enableTalosDatabaseProtection,
    registerTalosSqliteRuntime,
    relockTalosDatabase,
    talosDatabaseLockFailure,
    talosDatabaseLockState,
    unlockTalosDatabase,
} = await import('@/services/databaseProtection')

function runtime(overrides: Record<string, unknown> = {}) {
    return {
        platform: 'native' as const,
        connect: vi.fn(),
        persist: vi.fn(),
        close: vi.fn(),
        forgetSecret: vi.fn(async () => {}),
        adoptManagedSecret: vi.fn(async () => {}),
        ...overrides,
    }
}

beforeEach(() => {
    for (const fn of Object.values(key)) if (typeof fn === 'function') (fn as ReturnType<typeof vi.fn>).mockClear()
    key.readTalosDatabaseKeyState.mockResolvedValue('absent')
    key.talosDatabaseKeyIsProtected.mockResolvedValue(false)
    registerTalosSqliteRuntime(null)
})

describe('enableTalosDatabaseProtection', () => {
    it('legacy install: migrates FIRST and only then stores the key it proved works', async () => {
        const value = runtime()
        registerTalosSqliteRuntime(value as never)
        const outcome = await enableTalosDatabaseProtection('481902')
        expect(outcome.migrated).toBe(true)
        expect(value.adoptManagedSecret).toHaveBeenCalledWith('minted-key')
        // The order is the whole finding: storing before the migration left a
        // key the database had never seen, and the next attempt then skipped
        // the migration entirely and wrapped that dead key.
        expect(key.commitTalosDatabaseKey.mock.invocationCallOrder[0]!)
            .toBeGreaterThan(value.adoptManagedSecret.mock.invocationCallOrder[0]!)
        expect(key.protectTalosDatabaseKey).toHaveBeenCalledWith('481902')
    })

    it('legacy install with no runtime REFUSES instead of wrapping a useless key', async () => {
        await expect(enableTalosDatabaseProtection('481902'))
            .rejects.toThrow(/TALOS_DB_PROTECT_UNAVAILABLE/)
        expect(key.commitTalosDatabaseKey).not.toHaveBeenCalled()
        expect(key.protectTalosDatabaseKey).not.toHaveBeenCalled()
    })

    it('a failed migration stores nothing and arms nothing', async () => {
        const value = runtime({ adoptManagedSecret: vi.fn(async () => { throw new Error('export refused') }) })
        registerTalosSqliteRuntime(value as never)
        await expect(enableTalosDatabaseProtection('481902')).rejects.toThrow(/export refused/)
        expect(key.commitTalosDatabaseKey).not.toHaveBeenCalled()
        expect(key.protectTalosDatabaseKey).not.toHaveBeenCalled()
    })

    it('managed install: wraps the existing key without touching the database', async () => {
        key.readTalosDatabaseKeyState.mockResolvedValue('device')
        const value = runtime()
        registerTalosSqliteRuntime(value as never)
        const outcome = await enableTalosDatabaseProtection('481902')
        expect(outcome.migrated).toBe(false)
        expect(value.adoptManagedSecret).not.toHaveBeenCalled()
        expect(key.protectTalosDatabaseKey).toHaveBeenCalledWith('481902')
    })
})

describe('unlockTalosDatabase', () => {
    it('protected: unwraps with the PIN', async () => {
        key.talosDatabaseKeyIsProtected.mockResolvedValue(true)
        expect(await unlockTalosDatabase('481902')).toBe(true)
        expect(key.unlockTalosDatabaseKey).toHaveBeenCalledWith('481902')
    })

    it('protected: a PIN that does not open the key returns false, so the lock stays up', async () => {
        key.talosDatabaseKeyIsProtected.mockResolvedValue(true)
        key.unlockTalosDatabaseKey.mockRejectedValue(new Error('wrong'))
        expect(await unlockTalosDatabase('000001')).toBe(false)
    })

    it('an install that armed the lock BEFORE this shipped gets protected at the verified PIN', async () => {
        // Otherwise that installed base keeps the original defect forever: a
        // Vue boolean over a database anyone can open, with nothing saying so.
        key.readTalosDatabaseKeyState.mockResolvedValue('device')
        const value = runtime()
        registerTalosSqliteRuntime(value as never)
        expect(await unlockTalosDatabase('481902')).toBe(true)
        expect(key.protectTalosDatabaseKey).toHaveBeenCalledWith('481902')
    })

    it('and a failure while doing so never blocks a legitimate unlock', async () => {
        key.readTalosDatabaseKeyState.mockResolvedValue('absent')
        registerTalosSqliteRuntime(null)
        expect(await unlockTalosDatabase('481902')).toBe(true)
    })
})

describe('relockTalosDatabase', () => {
    it('wipes the key from memory FIRST, before anything that can fail', async () => {
        key.talosDatabaseKeyIsProtected.mockRejectedValue(new Error('keystore hiccup'))
        await relockTalosDatabase()
        expect(key.lockTalosDatabaseKey).toHaveBeenCalled()
    })

    it('drops the stored passphrase too, or the database stays openable', async () => {
        key.talosDatabaseKeyIsProtected.mockResolvedValue(true)
        const value = runtime()
        registerTalosSqliteRuntime(value as never)
        await relockTalosDatabase()
        expect(value.forgetSecret).toHaveBeenCalled()
    })
})

describe('disableTalosDatabaseProtection', () => {
    it('destroys the biometric copy too, even when there is no PIN protection left', async () => {
        // The fingerprint copy is a second wrapping of the SAME key. Removing
        // the lock while leaving it behind would keep a hardware-backed door
        // onto a database the user just asked us to stop protecting — and the
        // Keystore entry would outlive every record explaining what it opens.
        key.talosDatabaseKeyIsProtected.mockResolvedValue(false)
        await disableTalosDatabaseProtection()
        expect(key.disarmTalosBiometricUnlock).toHaveBeenCalled()
    })

    it('returns the key to device protection', async () => {
        key.talosDatabaseKeyIsProtected.mockResolvedValue(true)
        await disableTalosDatabaseProtection()
        expect(key.unprotectTalosDatabaseKey).toHaveBeenCalled()
    })

    it('is a no-op when there is nothing to unprotect', async () => {
        await disableTalosDatabaseProtection()
        expect(key.unprotectTalosDatabaseKey).not.toHaveBeenCalled()
    })
})

/**
 * I-09. The shell locked the screen and started the re-lock without waiting for
 * it. Nothing ordered the transitions, so a PIN entered while the previous
 * close was still in flight left an unlocked interface sitting on top of a
 * database still being torn down underneath it — the owner's own
 * `No available connection for database talos_mobile`.
 */
describe('lock transitions are serialized', () => {
    it('P1-DB-LOCK-01 an unlock waits for an in-flight relock instead of racing it', async () => {
        let releaseForget!: () => void
        const order: string[] = []
        key.talosDatabaseKeyIsProtected.mockResolvedValue(true)
        const value = runtime({
            forgetSecret: vi.fn(async () => {
                order.push('forget:start')
                await new Promise<void>((resolve) => { releaseForget = resolve })
                order.push('forget:end')
            }),
        })
        registerTalosSqliteRuntime(value as never)
        key.unlockTalosDatabaseKey.mockImplementation(async () => {
            order.push('unlock')
            return 'unwrapped'
        })

        const relock = relockTalosDatabase()
        await Promise.resolve()
        const unlock = unlockTalosDatabase('481902')
        await Promise.resolve()

        // The unlock must not have run yet: the key is still being taken away.
        expect(order).toEqual(['forget:start'])
        releaseForget()
        await Promise.all([relock, unlock])

        expect(order).toEqual(['forget:start', 'forget:end', 'unlock'])
    })

    /**
     * The security half, and worse than an unavailable connection.
     *
     * `forgetSecret()` closes the connection and only then clears the plugin's
     * stored passphrase. If the close throws, the clear never runs — and the
     * failure was swallowed. So the key left memory, the screen showed a PIN
     * pad, and the NEXT launch found `isSecretStored()` true and opened the
     * database without ever asking for the PIN. A lock that reports success
     * while leaving the door open is worse than no lock at all.
     */
    it('P1-DB-LOCK-02 a re-lock that could not clear the stored secret is recorded, not swallowed', async () => {
        key.talosDatabaseKeyIsProtected.mockResolvedValue(true)
        const value = runtime({
            forgetSecret: vi.fn(async () => { throw new Error('connection close refused') }),
        })
        registerTalosSqliteRuntime(value as never)

        await relockTalosDatabase()

        // The key still leaves memory — that part was always right.
        expect(key.lockTalosDatabaseKey).toHaveBeenCalled()
        // But the lock did NOT fully engage, and something has to say so.
        expect(talosDatabaseLockState()).toBe('recovery_required')
        expect(talosDatabaseLockFailure()).toMatch(/close refused/)
    })

    it('P1-DB-LOCK-03 a later re-lock retries the clear and recovers the state', async () => {
        key.talosDatabaseKeyIsProtected.mockResolvedValue(true)
        const forgetSecret = vi.fn()
            .mockRejectedValueOnce(new Error('connection close refused'))
            .mockResolvedValueOnce(undefined)
        registerTalosSqliteRuntime(runtime({ forgetSecret }) as never)

        await relockTalosDatabase()
        expect(talosDatabaseLockState()).toBe('recovery_required')

        await relockTalosDatabase()

        expect(forgetSecret).toHaveBeenCalledTimes(2)
        expect(talosDatabaseLockState()).toBe('locked')
        expect(talosDatabaseLockFailure()).toBeNull()
    })

    it('P1-DB-LOCK-04 a clean relock/unlock cycle reports the states it passed through', async () => {
        key.talosDatabaseKeyIsProtected.mockResolvedValue(true)
        registerTalosSqliteRuntime(runtime() as never)

        await relockTalosDatabase()
        expect(talosDatabaseLockState()).toBe('locked')

        await expect(unlockTalosDatabase('481902')).resolves.toBe(true)
        expect(talosDatabaseLockState()).toBe('unlocked')
        expect(talosDatabaseLockFailure()).toBeNull()
    })
})
