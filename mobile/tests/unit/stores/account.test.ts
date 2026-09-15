import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Preferences } from '@capacitor/preferences'
import { useTalosAccountStore, __resetAccountStoreForTests } from '@/stores/account'

// Owner 2026-07-24: a LOCAL account (name + avatar initial), persisted on
// device. OAuth is predisposed but honestly gated — no fake sign-in.
vi.mock('@capacitor/preferences', () => {
    const memory = new Map<string, string>()
    return {
        Preferences: {
            get: vi.fn(async ({ key }: { key: string }) => ({ value: memory.get(key) ?? null })),
            set: vi.fn(async ({ key, value }: { key: string; value: string }) => { memory.set(key, value) }),
            __memory: memory,
        },
    }
})

beforeEach(() => {
    __resetAccountStoreForTests()
    ;(Preferences as unknown as { __memory: Map<string, string> }).__memory.clear()
})

describe('local account store', () => {
    it('defaults to a local, unnamed workspace with the TALOS initial', () => {
        const store = useTalosAccountStore()
        expect(store.state.display_name).toBe('')
        expect(store.state.auth_provider).toBe('local')
        expect(store.initial.value).toBe('T')
    })

    it('derives the avatar initial from the display name', async () => {
        const store = useTalosAccountStore()
        await store.setDisplayName('  antonio ')
        expect(store.state.display_name).toBe('antonio')
        expect(store.initial.value).toBe('A')
    })

    it('persists the name and survives a fresh hydrate', async () => {
        const store = useTalosAccountStore()
        await store.setDisplayName('Ninozz')
        __resetAccountStoreForTests()
        const fresh = useTalosAccountStore()
        await fresh.hydrate()
        expect(fresh.state.display_name).toBe('Ninozz')
        expect(fresh.initial.value).toBe('N')
    })

    it('exposes the predisposed OAuth providers without faking a session', () => {
        const store = useTalosAccountStore()
        expect(store.oauthProviders.map((p) => p.id)).toEqual(['google', 'apple'])
        // Every provider is gated (local-first, no backend yet) — none signs in.
        expect(store.oauthProviders.every((p) => p.available === false)).toBe(true)
        expect(store.state.auth_provider).toBe('local')
    })
})
