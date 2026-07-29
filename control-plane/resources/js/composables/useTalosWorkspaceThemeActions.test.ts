// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTalosWorkspaceThemeActions } from './useTalosWorkspaceThemeActions'
import type { TalosWorkspaceSettings } from './useTalosSettings'

describe('useTalosWorkspaceThemeActions', () => {
    beforeEach(() => localStorage.clear())

    it('changes the theme locally and applies returned settings without losing workspace identity', async () => {
        const theme = ref<'forge' | 'paper'>('forge')
        const workspaceSettings = ref<TalosWorkspaceSettings | null>({
            id: 'settings-1',
            preferences: { theme: 'forge' },
        })
        const applyChatLayoutPreference = vi.fn()
        const updateWorkspaceSettings = vi.fn(async () => workspaceSettings.value as TalosWorkspaceSettings)
        const actions = useTalosWorkspaceThemeActions({
            theme,
            themeDraftCustomization: ref(null),
            workspaceSettings,
            uiError: ref(null),
            updateWorkspaceSettings,
            loadPersistedWorkspaceSettings: vi.fn(async () => undefined),
            applyChatLayoutPreference,
            saveWorkspacePreferences: vi.fn(),
        })

        actions.toggleTheme('paper', false)
        expect(theme.value).toBe('paper')
        expect(localStorage.getItem('talos_theme')).toBe('paper')
        expect(updateWorkspaceSettings).not.toHaveBeenCalled()

        await actions.refreshWorkspaceSettingsAfterThemeUpdate({
            preferences: {
                theme: 'paper',
                ui_scale: 1.2,
                chat_layout: { message_scale: 1.25, composer_mode: 'minimal' },
            },
        })
        expect(workspaceSettings.value?.id).toBe('settings-1')
        expect(applyChatLayoutPreference).toHaveBeenCalledWith(
            { message_scale: 1.25, composer_mode: 'minimal' },
            1.2,
        )
    })
})
