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

describe('mobile motion defaults (F3-T1 owner #7)', () => {
    it('ships background intensity at the range minimum out of the box', () => {
        expect(parseTalosMobileSettings(null).motion_v6.intensity).toBe(0)
    })

    it('persisted user intensity always wins over the mobile default', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            motion_v6: { schema_version: 1, mode: 'simple', background_enabled: true, interface_enabled: true,
                scene_override: null, speed: 100, intensity: 80, glow_intensity: 0, density: 100, depth: 50,
                trails: 35, contrast: 60, parallax: 20, quality: 'adaptive', fps_cap: 30, dpr_cap: 1.25,
                pause_when_hidden: true, respect_data_saver: true,
                interface: { profile: 'preset', duration_scale: 50, intensity: 65, easing: 'precise', stagger: 40,
                    categories: { windows: true, surfaces: true, navigation: true, composer: true, messages: true, feedback: true } } },
        }))
        expect(parsed.motion_v6.intensity).toBe(80)
    })
})

// F3-T2 (owner #4): the presentation setting NEVER worked before F3, so a
// persisted 'drawer' was never a real choice — one-shot migrate to the new
// fullscreen default; explicit post-migration choices stick via the flag.
describe('window presentation default (F3-T2)', () => {
    it('defaults to fullscreen out of the box', () => {
        expect(parseTalosMobileSettings(null).chat_layout.mobile_window_presentation).toBe('fullscreen')
    })

    it('migrates a pre-F3 persisted drawer (never functional) to fullscreen once', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            chat_layout: { mobile_window_presentation: 'drawer' },
        }))
        expect(parsed.chat_layout.mobile_window_presentation).toBe('fullscreen')
    })

    it('respects an explicit drawer choice made after the migration', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            presentation_v2: true,
            chat_layout: { mobile_window_presentation: 'drawer' },
        }))
        expect(parsed.chat_layout.mobile_window_presentation).toBe('drawer')
    })
})

describe('tone preference (F3-T4)', () => {
    it('defaults to balanced and fails closed on garbage', () => {
        expect(parseTalosMobileSettings(null).tone.preset).toBe('balanced')
        expect(parseTalosMobileSettings(JSON.stringify({ tone: { preset: 'sarcastic' } })).tone.preset).toBe('balanced')
    })

    it('setTone persists and survives hydrate', async () => {
        const store = useSettingsStore()
        await store.setTone('friendly')
        __resetSettingsStoreForTests()
        const fresh = useSettingsStore()
        await fresh.hydrate()
        expect(fresh.state.tone.preset).toBe('friendly')
    })
})

describe('composer drawer preference (F3-T4bis owner #13, defaults per owner #15)', () => {
    it('defaults ON and garbage falls closed to the default', () => {
        expect(parseTalosMobileSettings(null).shell.composer_drawer).toBe(true)
        expect(parseTalosMobileSettings(JSON.stringify({ shell: { composer_drawer: 'yes' } })).shell.composer_drawer).toBe(true)
    })

    it('an explicit OFF choice persists through setShell and hydrate', async () => {
        const store = useSettingsStore()
        await store.setShell({ composer_drawer: false })
        __resetSettingsStoreForTests()
        const fresh = useSettingsStore()
        await fresh.hydrate()
        expect(fresh.state.shell.composer_drawer).toBe(false)
    })
})

// Owner #15 (2026-07-23): new out-of-box experience — immersive header,
// composer drawer, compact messages, complex renderer; one-shot migration.
describe('defaults v3 (owner #15)', () => {
    it('fresh installs get immersive+drawer+compact+complex', () => {
        const parsed = parseTalosMobileSettings(null)
        expect(parsed.shell.immersive_header).toBe(true)
        expect(parsed.shell.composer_drawer).toBe(true)
        expect(parsed.chat_layout.bubble_scale).toBe('compact')
        expect(parsed.motion_v6.mode).toBe('complex')
    })

    it('pre-v3 persisted OLD defaults migrate once', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            shell: { immersive_header: false, composer_drawer: false },
            chat_layout: { bubble_scale: 'balanced' },
            motion_v6: null,
        }))
        expect(parsed.shell.immersive_header).toBe(true)
        expect(parsed.shell.composer_drawer).toBe(true)
        expect(parsed.chat_layout.bubble_scale).toBe('compact')
    })

    it('post-v3 explicit choices stick', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            defaults_v3: true,
            shell: { immersive_header: false, composer_drawer: false },
            chat_layout: { bubble_scale: 'expanded' },
        }))
        expect(parsed.shell.immersive_header).toBe(false)
        expect(parsed.shell.composer_drawer).toBe(false)
        expect(parsed.chat_layout.bubble_scale).toBe('expanded')
    })
})
