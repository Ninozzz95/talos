import { beforeEach, describe, expect, it, vi } from 'vitest'

const prefs = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
        set: async ({ key, value }: { key: string; value: string }) => { prefs.set(key, value) },
    },
}))

import {
    DEFAULT_SETTINGS_STATE,
    parseTalosMobileSettings,
    TALOS_MOBILE_SETTINGS_KEY,
    useSettingsStore,
    __resetSettingsStoreForTests,
} from '@/stores/settings'
import { createDefaultTalosMotionV6Preferences } from '@/motion-v6/defaults'
import { TALOS_DEFAULT_MODEL_LAB_PREFERENCES } from '@/lib/modelLabContracts'
import { TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES } from '@/lib/browser/browserContracts'

beforeEach(() => {
    prefs.clear()
    __resetSettingsStoreForTests()
})

describe('parseTalosMobileSettings', () => {
    it('returns sane defaults for null / garbage', () => {
        expect(parseTalosMobileSettings(null)).toEqual(DEFAULT_SETTINGS_STATE)
        expect(parseTalosMobileSettings('{bad')).toEqual(DEFAULT_SETTINGS_STATE)
    })
    it('sanitizes each subtree via the desktop resolvers', () => {
        const motion = createDefaultTalosMotionV6Preferences()
        motion.mode = 'complex'
        motion.speed = 150
        const parsed = parseTalosMobileSettings(JSON.stringify({
            chat_layout: { bubble_scale: 'compact', composer_mode: 'minimal', mobile_window_presentation: 'fullscreen', advanced_rail_expanded: true },
            ai_defaults: { utility_model_mode: 'default_profile', research_model_mode: 'nonsense', vision_enabled: false },
            composer_defaults: { model_profile_id: 'openrouter:model-a', effort: 'medium', thinking: true },
            motion_v6: motion,
        }))
        expect(parsed.chat_layout.bubble_scale).toBe('compact')
        expect(parsed.chat_layout.composer_mode).toBe('minimal')
        expect(parsed.ai_defaults.utility_model_mode).toBe('default_profile')
        expect(parsed.ai_defaults.research_model_mode).toBe('same_as_chat') // invalid -> default
        expect(parsed.ai_defaults.vision_enabled).toBe(false)
        expect(parsed.composer_defaults).toEqual({
            model_profile_id: 'openrouter:model-a',
            effort: 'medium',
            thinking: true,
        })
        expect(parsed.motion_v6.mode).toBe('complex')
        expect(parsed.motion_v6.speed).toBe(150)
        // visibility + shortcuts fall back to complete valid maps
        expect(typeof parsed.appearance_visibility.chat_area.session_header).toBe('boolean')
        expect(Object.keys(parsed.keyboard_shortcuts).length).toBeGreaterThan(0)
    })

    it('fails malformed composer defaults closed', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            composer_defaults: {
                model_profile_id: ['not-a-model'],
                effort: 'maximum',
                thinking: 'yes',
            },
        }))

        expect(parsed.composer_defaults).toEqual({
            model_profile_id: null,
            effort: 'high',
            thinking: false,
        })
    })

    it('fails malformed Model Lab preferences closed without retaining secret-like fields', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            model_lab: {
                schema_version: 1,
                manual_models: [],
                model_overrides: {},
                provider_runtime: {},
                probe_results: {},
                api_key: 'must-not-survive',
            },
        }))

        expect(parsed.model_lab).toEqual(TALOS_DEFAULT_MODEL_LAB_PREFERENCES)
        expect(JSON.stringify(parsed.model_lab)).not.toContain('must-not-survive')
    })

    it('parses Browser preferences atomically and rejects stored worker credentials', () => {
        expect(parseTalosMobileSettings(JSON.stringify({
            browser: {
                schema_version: 1,
                hmi_mode: 'confirm_every_interaction',
                presentation: 'system_browser',
                suggest_for_urls: false,
                developer_untrusted_evidence: true,
            },
        })).browser).toEqual({
            schema_version: 1,
            hmi_mode: 'confirm_every_interaction',
            presentation: 'system_browser',
            suggest_for_urls: false,
            developer_untrusted_evidence: true,
        })

        expect(parseTalosMobileSettings(JSON.stringify({
            browser: {
                ...TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES,
                service_token: 'forbidden',
            },
        })).browser).toEqual(TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES)
    })
})

describe('useSettingsStore', () => {
    it('hydrates from Preferences', async () => {
        prefs.set(TALOS_MOBILE_SETTINGS_KEY, JSON.stringify({ chat_layout: { bubble_scale: 'expanded' } }))
        const store = useSettingsStore()
        await store.hydrate()
        expect(store.state.chat_layout.bubble_scale).toBe('expanded')
    })
    it('setChatLayout / setAiDefaults / setVisibility persist and update', async () => {
        const store = useSettingsStore()
        await store.setChatLayout({ composer_mode: 'minimal' })
        await store.setAiDefaults({ vision_enabled: false })
        await store.setVisibility('chat_area', 'session_header', false)
        expect(store.state.chat_layout.composer_mode).toBe('minimal')
        expect(store.state.ai_defaults.vision_enabled).toBe(false)
        expect(store.state.appearance_visibility.chat_area.session_header).toBe(false)
        const saved = JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!)
        expect(saved.chat_layout.composer_mode).toBe('minimal')
    })

    it('sanitizes and persists composer defaults', async () => {
        const store = useSettingsStore()

        await store.setComposerDefaults({
            model_profile_id: 'anthropic:claude-live',
            effort: 'low',
            thinking: true,
        })

        expect(store.state.composer_defaults).toEqual({
            model_profile_id: 'anthropic:claude-live',
            effort: 'low',
            thinking: true,
        })
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).composer_defaults)
            .toEqual(store.state.composer_defaults)
    })

    it('hydrates and persists the versioned Model Lab subtree as one validated value', async () => {
        const modelLab = {
            schema_version: 1 as const,
            manual_models: [{
                id: 'manual-openai-local',
                provider: 'openai' as const,
                model: 'local-model',
                display_name: 'Local model',
                input_modalities: ['text'],
                output_modalities: ['text'],
                supported_parameters: ['reasoning_effort'],
            }],
            model_overrides: {},
            provider_runtime: { openai: { timeout_seconds: 45 } },
            probe_results: {},
        }
        prefs.set(TALOS_MOBILE_SETTINGS_KEY, JSON.stringify({ model_lab: modelLab }))
        const store = useSettingsStore()

        await store.hydrate()
        expect(store.state.model_lab).toEqual(modelLab)

        const updated = {
            ...modelLab,
            model_overrides: { 'openai:local-model': { display_name: 'Local primary', show_in_composer: false } },
        }
        await store.setModelLabPreferences(updated)

        expect(store.state.model_lab).toEqual(updated)
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).model_lab).toEqual(updated)
    })

    it('persists Browser policy as one validated value', async () => {
        const store = useSettingsStore()
        await store.setBrowserPreferences({
            hmi_mode: 'confirm_every_interaction',
            presentation: 'system_browser',
            suggest_for_urls: false,
        })

        expect(store.state.browser).toEqual({
            ...TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES,
            hmi_mode: 'confirm_every_interaction',
            presentation: 'system_browser',
            suggest_for_urls: false,
        })
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).browser).toEqual(store.state.browser)
    })

    it('sanitizes and persists Motion V6 preferences through the canonical parser', async () => {
        const store = useSettingsStore()
        await store.setMotionPreferences({
            mode: 'complex',
            speed: 125,
            interface: { duration_scale: 75 },
        })

        expect(store.state.motion_v6.mode).toBe('complex')
        expect(store.state.motion_v6.speed).toBe(125)
        expect(store.state.motion_v6.interface.duration_scale).toBe(75)
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).motion_v6.mode).toBe('complex')
    })

    it('resets one visibility group and all shortcuts without corrupting sibling groups', async () => {
        const store = useSettingsStore()
        await store.setVisibility('chat_area', 'session_header', false)
        await store.setVisibility('sidebar', 'brand_name', false)
        await store.setShortcut('search_conversations', 'Ctrl+Shift+P')

        await store.resetVisibility('chat_area')
        await store.resetShortcuts()

        expect(store.state.appearance_visibility.chat_area.session_header).toBe(true)
        expect(store.state.appearance_visibility.sidebar.brand_name).toBe(false)
        expect(store.state.keyboard_shortcuts.search_conversations).toBe('Ctrl+K')
    })
})
