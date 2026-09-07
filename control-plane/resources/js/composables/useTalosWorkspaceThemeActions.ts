import type { Ref } from 'vue'
import { normalizeTalosTheme, talosThemeIsLight, type TalosThemeCustomization, type TalosThemeId } from '../lib/talosThemes'
import type { TalosWorkspaceSettings, UpdateTalosSettingsPayload } from './useTalosSettings'

export function useTalosWorkspaceThemeActions(options: {
    theme: Ref<TalosThemeId>
    themeDraftCustomization: Ref<TalosThemeCustomization | null>
    workspaceSettings: Ref<TalosWorkspaceSettings | null>
    uiError: Ref<string | null>
    updateWorkspaceSettings: (payload: UpdateTalosSettingsPayload) => Promise<TalosWorkspaceSettings>
    loadPersistedWorkspaceSettings: () => Promise<void>
    applyChatLayoutPreference: (value: unknown, uiScaleValue?: unknown) => void
    saveWorkspacePreferences: () => void
}) {
    function persistThemePreference(nextTheme: TalosThemeId) {
        options.updateWorkspaceSettings({
            preferences: {
                ...(options.workspaceSettings.value?.preferences ?? {}),
                theme: nextTheme,
            },
        }).catch((error) => {
            options.uiError.value = error instanceof Error ? error.message : 'TALOS could not persist the selected theme.'
        })
    }

    function toggleTheme(nextTheme?: TalosThemeId, persist = true) {
        options.theme.value = nextTheme
            ? normalizeTalosTheme(nextTheme)
            : (talosThemeIsLight(options.theme.value) ? 'forge' : 'paper')
        localStorage.setItem('talos_theme', options.theme.value)
        if (persist) persistThemePreference(options.theme.value)
    }

    async function refreshWorkspaceSettingsAfterThemeUpdate(nextSettings?: { preferences?: Record<string, unknown> }) {
        if (nextSettings?.preferences) {
            options.workspaceSettings.value = {
                ...(options.workspaceSettings.value ?? {
                    id: 'default',
                    created_at: null,
                    updated_at: null,
                    default_model_profile_id: null,
                    default_context_set_id: null,
                }),
                ...nextSettings,
                preferences: nextSettings.preferences,
            }
            options.applyChatLayoutPreference(
                nextSettings.preferences.chat_layout,
                nextSettings.preferences.ui_scale,
            )
            return
        }

        try {
            await options.loadPersistedWorkspaceSettings()
        } catch (error) {
            options.uiError.value = error instanceof Error ? error.message : 'TALOS could not refresh workspace appearance settings.'
        }
    }

    async function handleWorkspaceSettingsSaved() {
        options.saveWorkspacePreferences()
        await refreshWorkspaceSettingsAfterThemeUpdate()
    }

    function handleThemeDraftChanged(customization: TalosThemeCustomization | null) {
        options.themeDraftCustomization.value = customization
    }

    return {
        toggleTheme,
        refreshWorkspaceSettingsAfterThemeUpdate,
        handleWorkspaceSettingsSaved,
        handleThemeDraftChanged,
    }
}
