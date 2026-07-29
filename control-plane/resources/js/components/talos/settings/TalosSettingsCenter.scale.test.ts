// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { TALOS_DEFAULT_CHAT_LAYOUT } from '../../../lib/talosChatLayout'
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

const mounted: Array<ReturnType<typeof createApp>> = []

beforeEach(() => {
    settingsHarness.updateSettings.mockClear()
    settingsHarness.loaded = {
        id: 'settings-scale',
        default_model_profile_id: null,
        default_context_set_id: null,
        preferences: {
            theme: 'forge',
            theme_mode: 'dark',
            ui_scale: 1.15,
            chat_layout: {
                ...TALOS_DEFAULT_CHAT_LAYOUT,
                message_scale: 1.25,
            },
        },
    }
})

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

async function settle() {
    await nextTick()
    await Promise.resolve()
    await nextTick()
}

async function mountSettings() {
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    const container = document.createElement('div')
    document.body.append(portalRoot, container)
    const app = createApp({
        render: () => h(TalosSettingsCenter, {
            modelProfiles: [],
            contextSets: [],
            selectedModelProfileId: '',
            selectedContextSetId: '',
            focusedTab: 'appearance',
            focusedTabRevision: 1,
        }),
    })
    mounted.push(app)
    app.mount(container)
    await settle()

    return container
}

describe('TalosSettingsCenter numeric scale persistence', () => {
    it('loads and saves independent canonical UI and message scales from the rendered controls', async () => {
        const container = await mountSettings()
        const uiRange = container.querySelector<HTMLInputElement>('input[type="range"][aria-label="Interface scale"]')
        const messageRange = container.querySelector<HTMLInputElement>('input[type="range"][aria-label="Message scale"]')
        expect(uiRange?.value).toBe('1.15')
        expect(messageRange?.value).toBe('1.25')

        if (uiRange) {
            uiRange.value = '1.2'
            uiRange.dispatchEvent(new Event('input', { bubbles: true }))
        }
        if (messageRange) {
            messageRange.value = '1.3'
            messageRange.dispatchEvent(new Event('input', { bubbles: true }))
        }
        await settle()
        Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Save settings'))
            ?.click()
        await settle()

        expect(settingsHarness.updateSettings).toHaveBeenCalledTimes(1)
        const payload = settingsHarness.updateSettings.mock.calls[0][0] as {
            preferences: Record<string, unknown> & {
                chat_layout: Record<string, unknown>
            }
        }
        expect(payload.preferences.ui_scale).toBe(1.2)
        expect(payload.preferences.chat_layout.message_scale).toBe(1.3)
        expect(payload.preferences.chat_layout).not.toHaveProperty('bubble_scale')
    })

    it('adapts a legacy bubble label on read and canonicalizes it only on a real save', async () => {
        settingsHarness.loaded = {
            ...settingsHarness.loaded,
            preferences: {
                theme: 'forge',
                theme_mode: 'dark',
                chat_layout: {
                    bubble_scale: 'expanded',
                    composer_mode: 'full',
                    message_style: 'sections',
                    advanced_rail_expanded: false,
                    mobile_window_presentation: 'drawer',
                },
            },
        }
        const container = await mountSettings()

        expect(settingsHarness.updateSettings).not.toHaveBeenCalled()
        expect(container.querySelector<HTMLInputElement>('[aria-label="Message scale"]')?.value).toBe('1.15')

        Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Save settings'))
            ?.click()
        await settle()

        const payload = settingsHarness.updateSettings.mock.calls[0][0] as {
            preferences: { chat_layout: Record<string, unknown> }
        }
        expect(payload.preferences.chat_layout.message_scale).toBe(1.15)
        expect(payload.preferences.chat_layout).not.toHaveProperty('bubble_scale')
    })
})
