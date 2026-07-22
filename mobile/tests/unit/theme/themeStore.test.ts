import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const prefs = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
        set: async ({ key, value }: { key: string; value: string }) => { prefs.set(key, value) },
    },
}))

import {
    applyTalosTheme,
    DEFAULT_THEME_STATE,
    parseTalosThemeState,
    TALOS_MOBILE_THEME_KEY,
    useThemeStore,
    __resetThemeStoreForTests,
} from '@/stores/theme'

beforeEach(() => {
    prefs.clear()
    __resetThemeStoreForTests()
})
afterEach(() => {
    __resetThemeStoreForTests()
})

describe('parseTalosThemeState', () => {
    it('accepts a valid persisted theme + mode', () => {
        expect(parseTalosThemeState(JSON.stringify({ theme: 'aurora', mode: 'dark' }))).toEqual({ theme: 'aurora', mode: 'dark' })
    })
    it('falls closed to defaults for null, garbage, or unknown preset/mode', () => {
        expect(parseTalosThemeState(null)).toEqual(DEFAULT_THEME_STATE)
        expect(parseTalosThemeState('{not json')).toEqual(DEFAULT_THEME_STATE)
        expect(parseTalosThemeState(JSON.stringify({ theme: 'nope', mode: 'weird' }))).toEqual(DEFAULT_THEME_STATE)
    })
})

describe('applyTalosTheme', () => {
    it('stamps the full --talos-* set, the shadcn bridge, and preset/mode markers', () => {
        const target = document.createElement('div')
        const resolved = applyTalosTheme('forge', 'dark', target)
        expect(resolved).toBe('dark')
        expect(target.style.getPropertyValue('--talos-background')).not.toBe('')
        expect(target.style.getPropertyValue('--talos-panel')).not.toBe('')
        expect(target.style.getPropertyValue('--background')).not.toBe('') // shadcn bridge
        expect(target.getAttribute('data-theme-preset')).toBe('forge')
        expect(target.getAttribute('data-theme-mode')).toBe('dark')
        expect(target.classList.contains('talos-shell')).toBe(true)
        expect(target.classList.contains('dark')).toBe(true)
    })

    it('produces distinct backgrounds for distinct presets', () => {
        const a = document.createElement('div')
        const b = document.createElement('div')
        applyTalosTheme('aurora', 'light', a)
        applyTalosTheme('ember', 'light', b)
        expect(a.style.getPropertyValue('--talos-background')).not.toBe(b.style.getPropertyValue('--talos-background'))
    })
})

describe('useThemeStore', () => {
    it('hydrates from Preferences and applies the theme', async () => {
        prefs.set(TALOS_MOBILE_THEME_KEY, JSON.stringify({ theme: 'signal', mode: 'light' }))
        const store = useThemeStore()
        await store.hydrate()
        expect(store.state.theme).toBe('signal')
        expect(store.state.mode).toBe('light')
        expect(document.documentElement.getAttribute('data-theme-preset')).toBe('signal')
    })

    it('setTheme / setMode update state and persist', async () => {
        const store = useThemeStore()
        await store.setTheme('violet')
        await store.setMode('dark')
        expect(store.state.theme).toBe('violet')
        expect(store.state.mode).toBe('dark')
        expect(JSON.parse(prefs.get(TALOS_MOBILE_THEME_KEY)!)).toEqual({ theme: 'violet', mode: 'dark' })
    })
})
