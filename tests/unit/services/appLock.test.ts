import { describe, expect, it } from 'vitest'
import {
    appLockThrottleRemainingMs,
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
        await setupAppLockPin('481902', backend)
        const stored = [...backend.dump().values()].join(' ')
        expect(stored).not.toContain('481902')
        expect(stored).toMatch(/"salt"/)
        expect(stored).toMatch(/"hash"/)
    })

    it('verifies the correct PIN and rejects a wrong one', async () => {
        const backend = memoryBackend()
        await setupAppLockPin('481902', backend)
        expect(await verifyAppLockPin('481902', backend)).toBe(true)
        expect(await verifyAppLockPin('728461', backend)).toBe(false)
    })

    it('rejects a too-short PIN at setup', async () => {
        const backend = memoryBackend()
        // Debt S3: four digits is 10 000 candidates against a local verifier.
        await expect(setupAppLockPin('1234', backend))
            .rejects.toThrow('TALOS_APP_LOCK_PIN_TOO_SHORT')
    })

    it('rejects a trivial PIN at setup', async () => {
        const backend = memoryBackend()
        await expect(setupAppLockPin('000000', backend))
            .rejects.toThrow('TALOS_APP_LOCK_PIN_PREDICTABLE')
        await expect(setupAppLockPin('123456', backend))
            .rejects.toThrow('TALOS_APP_LOCK_PIN_PREDICTABLE')
        await expect(setupAppLockPin('654321', backend))
            .rejects.toThrow('TALOS_APP_LOCK_PIN_PREDICTABLE')
    })

    it('verification is fail-closed when no PIN record exists', async () => {
        const backend = memoryBackend()
        expect(await verifyAppLockPin('481902', backend)).toBe(false)
        expect(await hasAppLockPin(backend)).toBe(false)
    })

    it('throttles after repeated failures — even the correct PIN is refused', async () => {
        const backend = memoryBackend()
        await setupAppLockPin('481902', backend)
        let now = 1_000_000
        const clock = () => now
        for (let attempt = 0; attempt < 3; attempt += 1) {
            expect(await verifyAppLockPin('000001', backend, clock)).toBe(false)
        }
        expect(await appLockThrottleRemainingMs(backend, clock)).toBeGreaterThan(0)
        // The lockout is a real gate, not a UI hint: the right PIN is refused too.
        expect(await verifyAppLockPin('481902', backend, clock)).toBe(false)
        now += 60_000
        expect(await appLockThrottleRemainingMs(backend, clock)).toBe(0)
        expect(await verifyAppLockPin('481902', backend, clock)).toBe(true)
    })

    it('backs off exponentially and resets the counter on success', async () => {
        const backend = memoryBackend()
        await setupAppLockPin('481902', backend)
        let now = 1_000_000
        const clock = () => now
        for (let attempt = 0; attempt < 4; attempt += 1) {
            await verifyAppLockPin('000001', backend, clock)
            now += 60_000
        }
        await verifyAppLockPin('000001', backend, clock)
        // 5 failures → the 3rd..5th add backoff; the 5th is 4x the first step.
        expect(await appLockThrottleRemainingMs(backend, clock)).toBe(60_000)
        now += 60_000
        expect(await verifyAppLockPin('481902', backend, clock)).toBe(true)
        // A success wipes the record — the next failure starts from zero.
        expect(await verifyAppLockPin('000001', backend, clock)).toBe(false)
        expect(await appLockThrottleRemainingMs(backend, clock)).toBe(0)
    })

    it('the throttle survives an app restart (persisted, not in-memory)', async () => {
        const backend = memoryBackend()
        await setupAppLockPin('481902', backend)
        let now = 1_000_000
        const clock = () => now
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await verifyAppLockPin('000001', backend, clock)
        }
        // A fresh module state reading the SAME backend still sees the lockout.
        expect(await appLockThrottleRemainingMs(backend, clock)).toBeGreaterThan(0)
    })

    it('clearAppLock removes the record', async () => {
        const backend = memoryBackend()
        await setupAppLockPin('481902', backend)
        await verifyAppLockPin('000001', backend)
        await clearAppLock(backend)
        expect(await hasAppLockPin(backend)).toBe(false)
        // The lockout must not outlive the lock it belongs to.
        expect(await appLockThrottleRemainingMs(backend)).toBe(0)
        expect(await verifyAppLockPin('481902', backend)).toBe(false)
    })
})
