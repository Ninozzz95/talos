// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import type { TalosModelProfile } from '../../../lib/talosTypes'
import TalosSettingsCenter from './TalosSettingsCenter.vue'

const settingsHarness = vi.hoisted(() => ({
    loaded: {} as Record<string, unknown>,
    updateSettings: vi.fn(),
}))

vi.mock('../../../composables/useTalosSettings', () => ({
    useTalosSettings: () => ({
        settings: ref(settingsHarness.loaded),
        loadingSettings: ref(false),
        savingSettings: ref(false),
        settingsError: ref(null),
        settingsSavedMessage: ref(''),
        loadSettings: () => Promise.resolve(settingsHarness.loaded),
        updateSettings: async (payload: Record<string, unknown>) => {
            settingsHarness.updateSettings(payload)
            return {
                ...settingsHarness.loaded,
                ...payload,
            }
        },
    }),
}))

if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
}

let app: ReturnType<typeof createApp> | undefined

beforeEach(() => {
    settingsHarness.updateSettings.mockClear()
    settingsHarness.loaded = {
        id: 'settings-prompt-cache',
        default_model_profile_id: 'profile-openai',
        default_context_set_id: null,
        preferences: {
            theme: 'forge',
            theme_mode: 'dark',
            prompt_cache: {
                mode: 'automatic',
                ttl: null,
            },
        },
    }
})

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

function firePointer(element: Element, type: 'pointerdown' | 'pointerup') {
    const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
    element.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button: 0 }))
}

function modelProfile(): TalosModelProfile {
    return {
        id: 'profile-openai',
        provider: 'openai',
        model: 'gpt-5.6',
        display_name: 'GPT-5.6',
        timeout_seconds: 120,
        status: 'healthy',
        capabilities: {},
        probe_result: null,
        has_secret: true,
        effort_levels: ['medium'],
        supports_thinking: true,
        show_in_composer: true,
        prompt_cache_capability: {
            contract: 'talos.prompt_cache.capability.v1',
            supported: true,
            minimum_input_tokens: 1024,
            modes: ['provider_default', 'automatic', 'explicit', 'disabled'],
            ttls: ['30m'],
            breakpoints: ['system', 'message'],
            usage_metrics: {
                read: true,
                write: true,
                miss: false,
            },
        },
        created_at: '2026-07-28T00:00:00Z',
        updated_at: '2026-07-28T00:00:00Z',
    }
}

describe('TalosSettingsCenter prompt cache persistence', () => {
    it('saves the server-supported mode selected through the Models settings UI', async () => {
        const portalRoot = document.createElement('div')
        portalRoot.id = 'talos-portal-root'
        const container = document.createElement('div')
        document.body.append(portalRoot, container)

        app = createApp({
            render: () => h(TalosSettingsCenter, {
                modelProfiles: [modelProfile()],
                contextSets: [],
                selectedModelProfileId: 'profile-openai',
                selectedContextSetId: '',
                focusedTab: 'models',
                focusedTabRevision: 1,
            }),
        })
        app.mount(container)
        await settle()

        const modeTrigger = document.querySelector<HTMLElement>('[aria-label="Prompt cache mode"]')
        expect(modeTrigger?.textContent).toContain('Automatic')
        if (modeTrigger) firePointer(modeTrigger, 'pointerdown')
        await settle()

        const explicitOption = document.querySelector<HTMLElement>('[data-value="explicit"]')
        expect(explicitOption).not.toBeNull()
        explicitOption?.focus()
        explicitOption?.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
        }))
        await settle()

        Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Save settings'))
            ?.click()
        await settle()

        expect(settingsHarness.updateSettings).toHaveBeenCalledTimes(1)
        expect(settingsHarness.updateSettings.mock.calls[0][0]).toMatchObject({
            preferences: {
                prompt_cache: {
                    mode: 'explicit',
                    ttl: null,
                },
            },
        })
    })
})
