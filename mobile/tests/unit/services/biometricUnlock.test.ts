import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    armTalosBiometricUnlock,
    disarmTalosBiometricUnlock,
    talosBiometricUnlockIsArmed,
    unlockTalosDatabaseKeyWithBiometrics,
} from '@/services/databaseKey'

/**
 * Owner 2026-07-26: reopening the app asked only for the PIN even with a
 * fingerprint enrolled. The database key is wrapped by a PIN-derived KEK, and a
 * fingerprint has no material to derive one — so it is wrapped a SECOND time by
 * a hardware Keystore key that only a live scan releases.
 *
 * These tests own the rules that a native prompt cannot be asked about:
 * what happens when the scan is refused, when Android destroys the key because
 * the enrolment changed, and — the one that matters most — that the PIN stays
 * the only authority.
 */
function backend() {
    const store = new Map<string, string>()
    return {
        store,
        get: vi.fn(async (key: string) => store.get(key) ?? null),
        set: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
        remove: vi.fn(async (key: string) => { store.delete(key) }),
    }
}

const BIO_KEY = 'talos.db.key.biometric.v1'

beforeEach(() => {
    vi.restoreAllMocks()
})

describe('biometric unlock', () => {
    it('is not armed until the user asks for it', async () => {
        expect(await talosBiometricUnlockIsArmed(backend())).toBe(false)
    })

    it('arming stores ONLY the sealed blob — never the key itself', async () => {
        const bio = backend()
        const wrap = vi.fn(async () => ({ iv: 'aXY=', sealed: 'c2VhbGVk' }))
        await armTalosBiometricUnlock('the-database-key', bio, { wrap })

        expect(wrap).toHaveBeenCalledWith('the-database-key')
        const stored = bio.store.get(BIO_KEY)
        expect(stored).toBeTruthy()
        // The whole point: the readable record must not contain the secret.
        expect(stored).not.toContain('the-database-key')
        expect(JSON.parse(stored!)).toMatchObject({ iv: 'aXY=', sealed: 'c2VhbGVk' })
        expect(await talosBiometricUnlockIsArmed(bio)).toBe(true)
    })

    it('a successful scan returns the same key the PIN would have', async () => {
        const bio = backend()
        await armTalosBiometricUnlock('the-database-key', bio, {
            wrap: async () => ({ iv: 'aXY=', sealed: 'c2VhbGVk' }),
        })
        const key = await unlockTalosDatabaseKeyWithBiometrics(bio, {
            unwrap: async () => 'the-database-key',
        })
        expect(key).toBe('the-database-key')
    })

    it('a refused scan leaves the arming intact, because the user just changed their mind', async () => {
        const bio = backend()
        await armTalosBiometricUnlock('k', bio, { wrap: async () => ({ iv: 'a', sealed: 'b' }) })

        await expect(unlockTalosDatabaseKeyWithBiometrics(bio, {
            unwrap: async () => { throw new Error('TALOS_BIO_KEY_CANCELLED') },
        })).rejects.toThrow(/CANCELLED/)

        expect(await talosBiometricUnlockIsArmed(bio)).toBe(true)
    })

    it('an INVALIDATED key is dropped, so the app stops offering a scan that cannot work', async () => {
        // Android destroys the key when a fingerprint is enrolled or removed —
        // a thief who can add their own finger must not inherit the data. The
        // sealed copy is undecryptable from that moment, so keeping it would
        // mean offering the user a button that always fails.
        const bio = backend()
        await armTalosBiometricUnlock('k', bio, { wrap: async () => ({ iv: 'a', sealed: 'b' }) })

        await expect(unlockTalosDatabaseKeyWithBiometrics(bio, {
            unwrap: async () => { throw new Error('TALOS_BIO_KEY_INVALIDATED') },
        })).rejects.toThrow(/INVALIDATED/)

        expect(await talosBiometricUnlockIsArmed(bio)).toBe(false)
        expect(bio.store.has(BIO_KEY)).toBe(false)
    })

    it('refuses to unlock when nothing was ever armed, instead of prompting for nothing', async () => {
        const unwrap = vi.fn()
        await expect(unlockTalosDatabaseKeyWithBiometrics(backend(), { unwrap }))
            .rejects.toThrow(/TALOS_BIO_KEY_ABSENT/)
        expect(unwrap).not.toHaveBeenCalled()
    })

    it('disarming removes the copy, so only the PIN opens the database again', async () => {
        const bio = backend()
        const forget = vi.fn(async () => {})
        await armTalosBiometricUnlock('k', bio, { wrap: async () => ({ iv: 'a', sealed: 'b' }) })
        await disarmTalosBiometricUnlock(bio, { forget })

        expect(await talosBiometricUnlockIsArmed(bio)).toBe(false)
        // The Keystore entry goes too: leaving it would keep a key alive that
        // can open a blob we claim to have deleted.
        expect(forget).toHaveBeenCalled()
    })

    it('a corrupt stored record reads as NOT armed rather than throwing at boot', async () => {
        const bio = backend()
        bio.store.set(BIO_KEY, 'not json')
        expect(await talosBiometricUnlockIsArmed(bio)).toBe(false)
    })
})
