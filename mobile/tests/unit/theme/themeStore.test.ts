// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const prefs = new Map<string, string>()
const nativeFraming = vi.hoisted(() => ({
    configure: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
        set: async ({ key, value }: { key: string; value: string }) => { prefs.set(key, value) },
    },
}))
vi.mock('@/services/nativeFraming', () => ({
    configureNativeFraming: (options: unknown) => nativeFraming.configure(options),
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
    nativeFraming.configure.mockClear()
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

    it('reapplies Model Lab spacing and radius live when identity and mode change', () => {
        const target = document.createElement('div')
        applyTalosTheme('paper', 'light', target)
        const paper = {
            page: target.style.getPropertyValue('--talos-space-page'),
            card: target.style.getPropertyValue('--talos-space-card'),
            radius: target.style.getPropertyValue('--talos-radius-card'),
            background: target.style.getPropertyValue('--talos-background'),
        }

        applyTalosTheme('terminal', 'dark', target)

        expect(target.style.getPropertyValue('--talos-space-page')).not.toBe(paper.page)
        expect(target.style.getPropertyValue('--talos-space-card')).not.toBe(paper.card)
        expect(target.style.getPropertyValue('--talos-radius-card')).not.toBe(paper.radius)
        expect(target.style.getPropertyValue('--talos-background')).not.toBe(paper.background)
        expect(target.style.getPropertyValue('--talos-touch-target')).toBe('3rem')
        expect(target.getAttribute('data-theme-preset')).toBe('terminal')
        expect(target.getAttribute('data-theme-mode')).toBe('dark')
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
        // calm_migrated marks the one-shot pre-calm default migration as done.
        expect(JSON.parse(prefs.get(TALOS_MOBILE_THEME_KEY)!)).toEqual({ theme: 'violet', mode: 'dark', calm_migrated: true })
    })

    // F2-RED-19 — physical Android 16 proof: Paper/light changed the WebView
    // background but left white status icons because native framing only ran at
    // boot. Every live theme application must project the resolved scheme and
    // the newly-applied canonical background into the native chrome.
    it('synchronizes native framing whenever the resolved theme changes live', async () => {
        const store = useThemeStore()
        await store.setTheme('paper')
        nativeFraming.configure.mockClear()

        await store.setMode('light')

        expect(nativeFraming.configure).toHaveBeenCalledOnce()
        expect(nativeFraming.configure).toHaveBeenCalledWith(expect.objectContaining({
            scheme: 'light',
            background: document.documentElement.style.getPropertyValue('--background'),
            onError: expect.any(Function),
        }))
    })
})

// F3-T1 (owner #9): installs that persisted the PRE-calm default ('telemetry')
// migrate once to calm; any explicitly re-chosen theme sticks afterwards.
describe('calm default migration (F3-T1)', () => {
    it('migrates a persisted legacy telemetry default to calm exactly once', () => {
        const first = parseTalosThemeState(JSON.stringify({ theme: 'telemetry', mode: 'system' }))
        expect(first.theme).toBe('calm')

        // After migration the flag persists; a deliberate telemetry choice sticks.
        const rechosen = parseTalosThemeState(JSON.stringify({ theme: 'telemetry', mode: 'system', calm_migrated: true }))
        expect(rechosen.theme).toBe('telemetry')
    })

    it('never touches other persisted themes', () => {
        const aurora = parseTalosThemeState(JSON.stringify({ theme: 'aurora', mode: 'dark' }))
        expect(aurora.theme).toBe('aurora')
    })
})
