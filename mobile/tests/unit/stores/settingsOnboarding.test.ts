import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    parseTalosMobileSettings,
    useSettingsStore,
    __resetSettingsStoreForTests,
    TALOS_MOBILE_SETTINGS_KEY,
} from '@/stores/settings'
import { Preferences } from '@capacitor/preferences'

// F2-T6 — versioned intro contract (mobile-local mirror of the desktop spec):
// { onboarding: { intro_version, intro_outcome, setup_dismissed } } persisted
// in Preferences, fail-closed parsing, bounded version int.
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

beforeEach(async () => {
    __resetSettingsStoreForTests()
    const memory = (Preferences as unknown as { __memory: Map<string, string> }).__memory
    memory.clear()
})

describe('onboarding parsing (F2-T6)', () => {
    it('defaults to never-seen fail-closed', () => {
        expect(parseTalosMobileSettings(null).onboarding).toEqual({
            intro_version: 0,
            intro_outcome: null,
            setup_dismissed: false,
        })
    })

    it('accepts a valid saved contract', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            onboarding: { intro_version: 1, intro_outcome: 'completed', setup_dismissed: true },
        }))
        expect(parsed.onboarding).toEqual({ intro_version: 1, intro_outcome: 'completed', setup_dismissed: true })
    })

    it('rejects out-of-bounds versions and unknown outcomes fail-closed', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            onboarding: { intro_version: 999999, intro_outcome: 'exploded', setup_dismissed: 'yes' },
        }))
        expect(parsed.onboarding).toEqual({ intro_version: 0, intro_outcome: null, setup_dismissed: false })
    })
})

describe('onboarding persistence (F2-T6)', () => {
    it('setOnboarding persists and survives hydrate', async () => {
        const store = useSettingsStore()
        await store.setOnboarding({ intro_version: 1, intro_outcome: 'skipped' })
        __resetSettingsStoreForTests()
        const fresh = useSettingsStore()
        await fresh.hydrate()
        expect(fresh.state.onboarding.intro_version).toBe(1)
        expect(fresh.state.onboarding.intro_outcome).toBe('skipped')
        expect(fresh.state.onboarding.setup_dismissed).toBe(false)
    })

    it('setOnboarding patches without clobbering the other keys', async () => {
        const store = useSettingsStore()
        await store.setOnboarding({ intro_version: 1, intro_outcome: 'completed' })
        await store.setOnboarding({ setup_dismissed: true })
        expect(store.state.onboarding).toEqual({
            intro_version: 1,
            intro_outcome: 'completed',
            setup_dismissed: true,
        })
    })
})

describe('security preferences (F2-T6 app lock)', () => {
    it('defaults to lock disabled fail-closed', () => {
        expect(parseTalosMobileSettings(null).security).toEqual({
            app_lock_enabled: false,
            app_lock_biometric: false,
        })
    })

    it('rejects non-boolean garbage fail-closed', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            security: { app_lock_enabled: 'yes', app_lock_biometric: 1 },
        }))
        expect(parsed.security).toEqual({ app_lock_enabled: false, app_lock_biometric: false })
    })

    it('setSecurity persists and survives hydrate', async () => {
        const store = useSettingsStore()
        await store.setSecurity({ app_lock_enabled: true, app_lock_biometric: true })
        __resetSettingsStoreForTests()
        const fresh = useSettingsStore()
        await fresh.hydrate()
        expect(fresh.state.security).toEqual({ app_lock_enabled: true, app_lock_biometric: true })
    })
})
