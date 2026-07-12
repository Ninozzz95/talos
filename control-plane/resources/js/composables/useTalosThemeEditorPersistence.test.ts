import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { TalosThemeId } from '../lib/talosThemes'
import type { TalosWorkspaceSettings, UpdateTalosSettingsPayload } from './useTalosSettings'
import { useTalosThemeEditorPersistence } from './useTalosThemeEditorPersistence'
import { useTalosThemeEditorState } from './useTalosThemeEditorState'

function settings(preferences: Record<string, unknown> = {}): TalosWorkspaceSettings {
    return {
        id: 'theme-persistence-settings',
        preferences: {
            theme: 'forge',
            theme_customization: {},
            theme_mode: 'dark',
            ...preferences,
        },
    }
}

function createHarness(preferences: Record<string, unknown> = {}) {
    const settingsRef = ref(settings(preferences))
    const theme = ref<TalosThemeId>('forge')
    const editor = useTalosThemeEditorState({ theme, settings: settingsRef })
    editor.syncFromSettings()
    const updateSettings = vi.fn(async (payload: UpdateTalosSettingsPayload) => {
        const next = {
            ...settingsRef.value!,
            preferences: {
                ...settingsRef.value!.preferences,
                ...payload.preferences,
            },
        }
        settingsRef.value = next
        return next
    })
    const changeTheme = vi.fn()
    const persistence = useTalosThemeEditorPersistence({
        theme,
        settings: settingsRef,
        editor,
        updateSettings,
        emitChangeTheme: changeTheme,
        emitThemeCustomizationChanged: vi.fn(),
        emitThemeDraftChanged: vi.fn(),
    })

    return { settingsRef, theme, editor, updateSettings, changeTheme, persistence }
}

describe('useTalosThemeEditorPersistence', () => {
    it('rejects unsafe draft state before making a settings write', async () => {
        const harness = createHarness()
        harness.editor.customizationForm.value = {
            ...harness.editor.customizationForm.value,
            background: '#000000',
            panel: '#000000',
            text: '#010101',
        }

        await harness.persistence.saveCustomization()

        expect(harness.updateSettings).not.toHaveBeenCalled()
        expect(harness.persistence.localThemeError.value).toContain('contrast')
    })

    it('rolls an optimistic theme-mode change back after a rejected write', async () => {
        const harness = createHarness()
        harness.updateSettings.mockRejectedValueOnce(new Error('settings rejected'))
        harness.editor.themeMode.value = 'light'

        await harness.persistence.persistThemeMode()

        expect(harness.editor.themeMode.value).toBe('dark')
        expect(harness.persistence.themeControlRevision.value).toBe(1)
    })

    it('blocks theme writes and reports the workspace policy', async () => {
        const harness = createHarness({ theme_policy_locked: true })
        harness.editor.themeMode.value = 'light'

        await harness.persistence.persistThemeMode()

        expect(harness.updateSettings).not.toHaveBeenCalled()
        expect(harness.persistence.localThemeError.value).toBe('Theme changes are locked by workspace policy.')
    })

    it('rolls the emitted theme back when selecting a preset is rejected', async () => {
        const harness = createHarness()
        harness.updateSettings.mockRejectedValueOnce(new Error('settings rejected'))

        await harness.persistence.chooseTheme('paper')

        expect(harness.changeTheme).toHaveBeenNthCalledWith(1, 'paper', false)
        expect(harness.changeTheme).toHaveBeenNthCalledWith(2, 'forge', false)
    })

    it('persists only the owned preset delta and leaves unrelated preferences server-merged', async () => {
        const harness = createHarness({ account_locale: 'it', keyboard_shortcuts: { command_palette: 'mod+k' } })

        await harness.persistence.chooseTheme('paper')

        const payload = harness.updateSettings.mock.calls[0]?.[0]?.preferences as Record<string, unknown>
        expect(Object.keys(payload).sort()).toEqual([
            'active_custom_theme_id',
            'theme',
            'theme_area_tokens',
            'theme_customization',
            'theme_mode',
            'workspace_default_theme',
        ])
        expect(payload).not.toHaveProperty('account_locale')
        expect(payload).not.toHaveProperty('keyboard_shortcuts')
        expect(harness.settingsRef.value.preferences).toMatchObject({ account_locale: 'it', theme: 'paper' })
    })

    it('uses a narrow delta for reset customization', async () => {
        const harness = createHarness({
            theme_customization: { font: 'manrope' },
            theme_area_tokens: { composer: { background: '#111827' } },
            account_locale: 'it',
            active_custom_theme_id: 'custom-theme',
        })

        await harness.persistence.resetCustomization()

        expect(harness.updateSettings.mock.calls[0]?.[0]?.preferences).toEqual({
            theme_customization: {},
            active_custom_theme_id: null,
        })
        expect(harness.settingsRef.value.preferences).toMatchObject({
            account_locale: 'it',
            theme_area_tokens: { composer: { background: '#111827' } },
        })
    })
})
