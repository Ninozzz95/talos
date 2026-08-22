import { beforeEach, describe, expect, it, vi } from 'vitest'

const backing = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: vi.fn(async ({ key }: { key: string }) => ({ value: backing.has(key) ? backing.get(key)! : null })),
        set: vi.fn(async ({ key, value }: { key: string; value: string }) => { backing.set(key, value) }),
    },
}))

import {
    __resetPreferencesStoreForTests,
    DEFAULT_MOBILE_PREFERENCES,
    parseMobilePreferences,
    TALOS_MOBILE_PREFERENCES_KEY,
    usePreferencesStore,
} from '@/stores/preferences'

beforeEach(() => {
    backing.clear()
    __resetPreferencesStoreForTests()
})

describe('parseMobilePreferences', () => {
    it('invalid or future preference payloads fail closed to defaults without deleting raw bytes', () => {
        expect(parseMobilePreferences(null)).toEqual(DEFAULT_MOBILE_PREFERENCES)
        expect(parseMobilePreferences('not json {')).toEqual(DEFAULT_MOBILE_PREFERENCES)
        expect(parseMobilePreferences(JSON.stringify({ schema_version: 2, presentation: 'drawer', last_route: null }))).toEqual(DEFAULT_MOBILE_PREFERENCES)
        expect(parseMobilePreferences(JSON.stringify({ schema_version: 1, presentation: 'drawer', last_route: null, rogue: true }))).toEqual(DEFAULT_MOBILE_PREFERENCES)
        expect(parseMobilePreferences(JSON.stringify({ schema_version: 1, presentation: 'holographic', last_route: null }))).toEqual(DEFAULT_MOBILE_PREFERENCES)
        expect(parseMobilePreferences(JSON.stringify({ schema_version: 1, presentation: 'fullscreen', last_route: 'mission_path' }))).toEqual(DEFAULT_MOBILE_PREFERENCES)
    })

    it('accepts a canonical payload', () => {
        expect(parseMobilePreferences(JSON.stringify({ schema_version: 1, presentation: 'fullscreen', last_route: 'settings' }))).toEqual({
            schema_version: 1,
            presentation: 'fullscreen',
            last_route: 'settings',
        })
    })

    it('hydrate leaves illegible stored bytes intact while using defaults', async () => {
        backing.set(TALOS_MOBILE_PREFERENCES_KEY, 'corrupt-not-json{')
        const store = usePreferencesStore()
        await store.hydrate()
        expect(store.state).toEqual(DEFAULT_MOBILE_PREFERENCES)
        expect(backing.get(TALOS_MOBILE_PREFERENCES_KEY)).toBe('corrupt-not-json{')
    })
})

describe('preferences store persistence', () => {
    it('applies the persisted presentation preference to the next module and round-trips', async () => {
        const store = usePreferencesStore()
        await store.setPresentation('fullscreen')
        await store.setLastRoute('research')

        __resetPreferencesStoreForTests()
        const next = usePreferencesStore()
        await next.hydrate()
        expect(next.state.presentation).toBe('fullscreen')
        expect(next.state.last_route).toBe('research')
    })
})
