import { beforeEach, describe, expect, it } from 'vitest'
import {
    __resetTalosDatabaseKeyForTests,
    lockTalosDatabaseKey,
    readTalosDatabaseKeyState,
    resolveTalosDatabaseKey,
    talosDatabaseKeyIsProtected,
    protectTalosDatabaseKey,
    unlockTalosDatabaseKey,
    unprotectTalosDatabaseKey,
} from '@/services/databaseKey'
import type { SecureKeyBackend } from '@/services/secureKeyStore'

/**
 * Debt S1 — the app lock protected a screen, not the data: the SQLCipher key
 * was a random value stored beside the database, so "locked" was a Vue boolean
 * over a database anyone could open. Owner decision 2026-07-25: the PIN becomes
 * the real key, with no recovery path.
 *
 * The design is envelope encryption (the pattern every disk encryptor uses, and
 * what the web research confirmed): a random 256-bit DATABASE key that never
 * changes, wrapped by a key derived from the PIN. Changing the PIN re-wraps 32
 * bytes; it never re-encrypts the database.
 */
function memoryBackend(): SecureKeyBackend & { dump(): Map<string, string> } {
    const memory = new Map<string, string>()
    return {
        async get(key) { return memory.get(key) ?? null },
        async set(key, value) { memory.set(key, value) },
        async remove(key) { return memory.delete(key) },
        dump: () => memory,
    }
}

beforeEach(() => {
    __resetTalosDatabaseKeyForTests()
})

describe('TALOS database key (debt S1)', () => {
    it('without a PIN the key is device-held: it resolves, and nothing is derived', async () => {
        const backend = memoryBackend()
        const first = await resolveTalosDatabaseKey(backend)
        const second = await resolveTalosDatabaseKey(backend)
        expect(first).toHaveLength(64)
        expect(second).toBe(first)
        expect(await talosDatabaseKeyIsProtected(backend)).toBe(false)
    })

    it('protecting with a PIN keeps the SAME database key — the data is never re-encrypted', async () => {
        const backend = memoryBackend()
        const before = await resolveTalosDatabaseKey(backend)
        await protectTalosDatabaseKey('481902', backend)
        __resetTalosDatabaseKeyForTests()
        const after = await unlockTalosDatabaseKey('481902', backend)
        expect(after).toBe(before)
    })

    it('once protected, the plaintext key is GONE from storage', async () => {
        const backend = memoryBackend()
        const key = await resolveTalosDatabaseKey(backend)
        await protectTalosDatabaseKey('481902', backend)
        const stored = [...backend.dump().values()].join(' ')
        expect(stored).not.toContain(key)
        expect(await talosDatabaseKeyIsProtected(backend)).toBe(true)
    })

    it('a wrong PIN cannot unwrap it — and the failure is a rejection, never a wrong key', async () => {
        const backend = memoryBackend()
        await resolveTalosDatabaseKey(backend)
        await protectTalosDatabaseKey('481902', backend)
        __resetTalosDatabaseKeyForTests()
        await expect(unlockTalosDatabaseKey('000001', backend)).rejects.toThrow(/TALOS_DB_KEY_UNLOCK_FAILED/)
    })

    it('resolving while protected and locked REFUSES instead of inventing a key', async () => {
        const backend = memoryBackend()
        await resolveTalosDatabaseKey(backend)
        await protectTalosDatabaseKey('481902', backend)
        __resetTalosDatabaseKeyForTests()
        // A silent new key here would look like a working app with an empty,
        // permanently unreadable database — the worst possible failure.
        await expect(resolveTalosDatabaseKey(backend)).rejects.toThrow(/TALOS_DB_KEY_LOCKED/)
    })

    it('locking wipes the key from memory: reading it again needs the PIN', async () => {
        const backend = memoryBackend()
        await resolveTalosDatabaseKey(backend)
        await protectTalosDatabaseKey('481902', backend)
        const unlocked = await unlockTalosDatabaseKey('481902', backend)
        expect(unlocked).toHaveLength(64)
        lockTalosDatabaseKey()
        await expect(resolveTalosDatabaseKey(backend)).rejects.toThrow(/TALOS_DB_KEY_LOCKED/)
        expect(await unlockTalosDatabaseKey('481902', backend)).toBe(unlocked)
    })

    it('changing the PIN re-wraps the same key (no re-encryption, no data loss)', async () => {
        const backend = memoryBackend()
        const key = await resolveTalosDatabaseKey(backend)
        await protectTalosDatabaseKey('481902', backend)
        await unlockTalosDatabaseKey('481902', backend)
        await protectTalosDatabaseKey('720184', backend)
        __resetTalosDatabaseKeyForTests()
        expect(await unlockTalosDatabaseKey('720184', backend)).toBe(key)
        await expect(unlockTalosDatabaseKey('481902', backend)).rejects.toThrow()
    })

    it('turning the lock off puts the key back under device protection', async () => {
        const backend = memoryBackend()
        const key = await resolveTalosDatabaseKey(backend)
        await protectTalosDatabaseKey('481902', backend)
        await unlockTalosDatabaseKey('481902', backend)
        await unprotectTalosDatabaseKey(backend)
        __resetTalosDatabaseKeyForTests()
        expect(await resolveTalosDatabaseKey(backend)).toBe(key)
        expect(await talosDatabaseKeyIsProtected(backend)).toBe(false)
    })

    it('reports its state so the shell can decide whether to ask for the PIN', async () => {
        const backend = memoryBackend()
        expect(await readTalosDatabaseKeyState(backend)).toBe('absent')
        await resolveTalosDatabaseKey(backend)
        expect(await readTalosDatabaseKeyState(backend)).toBe('device')
        await protectTalosDatabaseKey('481902', backend)
        expect(await readTalosDatabaseKeyState(backend)).toBe('unlocked')
        lockTalosDatabaseKey()
        expect(await readTalosDatabaseKeyState(backend)).toBe('locked')
    })
})
