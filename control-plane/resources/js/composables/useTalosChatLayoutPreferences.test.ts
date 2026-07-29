import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { TalosWorkspaceSettings, UpdateTalosSettingsPayload } from './useTalosSettings'
import { useTalosChatLayoutPreferences } from './useTalosChatLayoutPreferences'

function settings(preferences: Record<string, unknown> = {}): TalosWorkspaceSettings {
    return {
        id: 'settings-1',
        revision: 1,
        preferences,
    }
}

function setup(preferences: Record<string, unknown> = {}) {
    const workspaceSettings = ref<TalosWorkspaceSettings | null>(settings(preferences))
    const uiError = ref<string | null>(null)
    const updateSettings = vi.fn(async (payload: UpdateTalosSettingsPayload) => settings(payload.preferences ?? {}))
    const layout = useTalosChatLayoutPreferences(workspaceSettings, updateSettings, uiError)
    return { workspaceSettings, uiError, updateSettings, layout }
}

describe('useTalosChatLayoutPreferences numeric scale persistence', () => {
    it('applies canonical UI/message scales and preserves legacy message size until a real save', () => {
        const { layout } = setup()

        layout.apply({ message_scale: 1.25 }, 1.2)
        expect(layout.uiScale.value).toBe(1.2)
        expect(layout.messageScale.value).toBe(1.25)
        expect(layout.messageScaleLabel.value).toBe('125%')

        layout.apply({ bubble_scale: 'compact' }, undefined)
        expect(layout.uiScale.value).toBe(1)
        expect(layout.messageScale.value).toBe(0.875)
        expect(layout.messageScaleLabel.value).toBe('87.5%')
    })

    it('persists canonical scales from direct changes and stepped controls', async () => {
        const { layout, updateSettings } = setup({
            ui_scale: 1,
            chat_layout: {
                message_scale: 1,
                composer_mode: 'full',
                message_style: 'sections',
                advanced_rail_expanded: false,
                mobile_window_presentation: 'drawer',
            },
        })

        await layout.setUiScale(1.2)
        await layout.setMessageScale(0.875)
        await layout.incrementMessageScale()
        await layout.decrementMessageScale()
        await layout.resetMessageScale()

        expect(layout.uiScale.value).toBe(1.2)
        expect(layout.messageScale.value).toBe(1)
        expect(updateSettings).toHaveBeenLastCalledWith({
            preferences: expect.objectContaining({
                ui_scale: 1.2,
                chat_layout: expect.objectContaining({
                    message_scale: 1,
                    composer_mode: 'full',
                    message_style: 'sections',
                    mobile_window_presentation: 'drawer',
                }),
            }),
        })
        const secondPayload = updateSettings.mock.calls[1][0] as UpdateTalosSettingsPayload
        expect((secondPayload.preferences?.chat_layout as Record<string, unknown>).message_scale).toBe(0.9)
    })

    it('restores both scales from the server snapshot when policy locks appearance', async () => {
        const { layout, uiError, updateSettings } = setup({
            theme_policy_locked: true,
            ui_scale: 1.1,
            chat_layout: {
                message_scale: 1.2,
                composer_mode: 'full',
                message_style: 'sections',
                advanced_rail_expanded: false,
                mobile_window_presentation: 'drawer',
            },
        })
        layout.apply({ message_scale: 1.2 }, 1.1)

        await layout.setUiScale(1.25)
        await layout.setMessageScale(1.35)

        expect(layout.uiScale.value).toBe(1.1)
        expect(layout.messageScale.value).toBe(1.2)
        expect(updateSettings).not.toHaveBeenCalled()
        expect(uiError.value).toBe('Chat appearance is locked by workspace policy.')
    })

    it('surfaces persistence failures without silently reporting success', async () => {
        const workspaceSettings = ref<TalosWorkspaceSettings | null>(settings())
        const uiError = ref<string | null>(null)
        const updateSettings = vi.fn(async () => {
            throw new Error('Settings unavailable.')
        })
        const layout = useTalosChatLayoutPreferences(workspaceSettings, updateSettings, uiError)

        await layout.setMessageScale(1.2)

        expect(uiError.value).toBe('Settings unavailable.')
    })

    it('persists Advanced rail without dropping the current visual layout', async () => {
        const { layout, updateSettings } = setup({
            ui_scale: 1.15,
            chat_layout: {
                message_scale: 1.25,
                composer_mode: 'minimal',
                message_style: 'bubbles',
                advanced_rail_expanded: false,
                mobile_window_presentation: 'fullscreen',
            },
        })
        layout.apply({
            message_scale: 1.25,
            composer_mode: 'minimal',
            message_style: 'bubbles',
            advanced_rail_expanded: false,
            mobile_window_presentation: 'fullscreen',
        }, 1.15)

        await layout.toggleAdvancedRail()

        expect(updateSettings).toHaveBeenCalledWith({
            preferences: expect.objectContaining({
                ui_scale: 1.15,
                chat_layout: {
                    message_scale: 1.25,
                    composer_mode: 'minimal',
                    message_style: 'bubbles',
                    advanced_rail_expanded: true,
                    mobile_window_presentation: 'fullscreen',
                },
            }),
        })
    })
})
