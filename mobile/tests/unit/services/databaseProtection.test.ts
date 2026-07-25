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
}))
vi.mock('@/services/databaseKey', () => key)

const {
    disableTalosDatabaseProtection,
    enableTalosDatabaseProtection,
    registerTalosSqliteRuntime,
    relockTalosDatabase,
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
