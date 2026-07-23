import { describe, expect, it } from 'vitest'
import {
    clearAppLock,
    hasAppLockPin,
    setupAppLockPin,
    verifyAppLockPin,
} from '@/services/appLock'
import type { SecureKeyBackend } from '@/services/secureKeyStore'

// F2-T6 — app lock: PIN derivation lives in the OS Keystore (never Preferences),
// derived (never plaintext), verification is fail-closed.
function memoryBackend(): SecureKeyBackend & { dump(): Map<string, string> } {
    const memory = new Map<string, string>()
    return {
        async get(key) { return memory.get(key) ?? null },
        async set(key, value) { memory.set(key, value) },
        async remove(key) { return memory.delete(key) },
        dump: () => memory,
    }
}

describe('appLock service (F2-T6)', () => {
    it('stores a salted derivation — never the plaintext PIN', async () => {
        const backend = memoryBackend()
        await setupAppLockPin('123456', backend)
        const stored = [...backend.dump().values()].join(' ')
        expect(stored).not.toContain('123456')
        expect(stored).toMatch(/"salt"/)
        expect(stored).toMatch(/"hash"/)
    })

    it('verifies the correct PIN and rejects a wrong one', async () => {
        const backend = memoryBackend()
        await setupAppLockPin('123456', backend)
        expect(await verifyAppLockPin('123456', backend)).toBe(true)
        expect(await verifyAppLockPin('654321', backend)).toBe(false)
    })

    it('rejects a too-short PIN at setup', async () => {
        const backend = memoryBackend()
        await expect(setupAppLockPin('123', backend)).rejects.toThrow(/at least 4/i)
    })

    it('verification is fail-closed when no PIN record exists', async () => {
        const backend = memoryBackend()
        expect(await verifyAppLockPin('123456', backend)).toBe(false)
        expect(await hasAppLockPin(backend)).toBe(false)
    })

    it('clearAppLock removes the record', async () => {
        const backend = memoryBackend()
        await setupAppLockPin('123456', backend)
        await clearAppLock(backend)
        expect(await hasAppLockPin(backend)).toBe(false)
        expect(await verifyAppLockPin('123456', backend)).toBe(false)
    })
})
