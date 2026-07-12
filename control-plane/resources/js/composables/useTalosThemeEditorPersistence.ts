import { computed, nextTick, ref, type Ref } from 'vue'
import {
    sanitizeTalosChatLayout,
} from '../lib/talosChatLayout'
import {
    resolveTalosThemeMode,
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeCustomization,
    type TalosThemeAreaTokens,
    type TalosThemeCustomization,
    type TalosThemeId,
    type TalosThemeMode,
} from '../lib/talosThemes'
import {
    resetTalosCustomizationPreferences,
    resetTalosThemePreferences,
    validateTalosThemeStateForSave,
} from '../components/talos/settings/theme-engine/themeEngineState'
import type { TalosWorkspaceSettings, UpdateTalosSettingsPayload } from './useTalosSettings'
import type { TalosThemeEditorState } from './useTalosThemeEditorState'

export type TalosThemeEditorPersistenceOptions = {
    theme: Ref<TalosThemeId>
    settings: Ref<TalosWorkspaceSettings | null>
    editor: TalosThemeEditorState
    updateSettings: (payload: UpdateTalosSettingsPayload, message?: string) => Promise<TalosWorkspaceSettings>
    emitChangeTheme: (theme: TalosThemeId, persist?: boolean) => void
    emitThemeCustomizationChanged: (settings: TalosWorkspaceSettings) => void
    emitThemeDraftChanged: (customization: TalosThemeCustomization | null) => void
}

export type PersistThemePreferencesOptions = {
    syncEditor?: boolean
    syncForm?: boolean
    notify?: boolean
}

export type TalosThemeEditorPersistence = ReturnType<typeof useTalosThemeEditorPersistence>

export function useTalosThemeEditorPersistence(options: TalosThemeEditorPersistenceOptions) {
    const localThemeError = ref('')
    const themeControlRevision = ref(0)
    const themePolicyLocked = computed(() => preferencesRecord().theme_policy_locked === true)

    function preferencesRecord(): Record<string, unknown> {
        return options.editor.activeSettings.value?.preferences ?? options.settings.value?.preferences ?? {}
    }

    function canWriteTheme() {
        if (!themePolicyLocked.value) return true
        localThemeError.value = 'Theme changes are locked by workspace policy.'
        return false
    }

    function rejectUnsafeThemeState(
        customization: TalosThemeCustomization,
        baseTheme: TalosThemeId,
        nextAreaTokens: TalosThemeAreaTokens = options.editor.areaTokens.value,
    ) {
        const result = validateTalosThemeStateForSave({
            baseTheme,
            customization,
            areaTokens: nextAreaTokens,
        })
        if (result.valid) return false

        localThemeError.value = `Theme contrast rejected: ${result.errors[0]?.message ?? 'normal-text contrast is unsafe.'}`
        return true
    }

    function bumpThemeControlRevision() {
        themeControlRevision.value += 1
    }

    async function persistPreferences(
        preferences: Record<string, unknown>,
        message: string,
        persistOptions: PersistThemePreferencesOptions = {},
    ) {
        const nextSettings = await options.updateSettings({ preferences }, message)
        if (persistOptions.syncEditor !== false) {
            options.editor.syncFromSettings(nextSettings)
        }
        if (persistOptions.syncForm) {
            options.editor.syncCustomizationForm()
        }
        if (persistOptions.notify !== false) {
            options.emitThemeCustomizationChanged(nextSettings)
        }
        return nextSettings
    }

    async function chooseTheme(theme: TalosThemeId) {
        if (!canWriteTheme()) return
        localThemeError.value = ''
        options.emitThemeDraftChanged(null)
        const previousTheme = options.editor.activeTheme.value
        options.emitChangeTheme(theme, false)

        try {
            await persistPreferences({
                theme,
                theme_mode: options.editor.themeMode.value,
                workspace_default_theme: theme,
                theme_customization: {},
                theme_area_tokens: {},
                active_custom_theme_id: null,
            }, 'Theme saved through /api/talos/settings.', { syncForm: true })
        } catch {
            options.emitChangeTheme(previousTheme, false)
            options.editor.syncFromSettings()
            options.editor.syncCustomizationForm()
            bumpThemeControlRevision()
        }
    }

    async function saveCustomization() {
        if (!canWriteTheme()) return
        localThemeError.value = ''
        const themeCustomization = options.editor.sanitizedForm()
        if (rejectUnsafeThemeState(themeCustomization, options.editor.activeTheme.value)) return

        const savedCustomization = sanitizeTalosThemeCustomization(preferencesRecord().theme_customization)
        const nextCustomization: TalosThemeCustomization = { ...themeCustomization }
        if (savedCustomization.effect !== undefined) nextCustomization.effect = savedCustomization.effect
        if (savedCustomization.effect_intensity !== undefined) nextCustomization.effect_intensity = savedCustomization.effect_intensity

        await persistPreferences({
            theme_customization: nextCustomization,
            chat_layout: sanitizeTalosChatLayout(options.editor.chatLayout.value),
            active_custom_theme_id: preferencesRecord().active_custom_theme_id ?? null,
        }, 'Theme customization saved through /api/talos/settings.', { syncForm: true })
        options.emitThemeDraftChanged(null)
    }

    function discardChanges() {
        options.editor.syncCustomizationForm()
        options.emitThemeDraftChanged(null)
    }

    async function resetToPreset() {
        if (!canWriteTheme()) return
        localThemeError.value = ''
        const reset = resetTalosThemePreferences(preferencesRecord())
        await persistPreferences({
            theme_customization: reset.theme_customization,
            theme_area_tokens: reset.theme_area_tokens,
            theme_mode: reset.theme_mode,
            theme_motion_v6: reset.theme_motion_v6,
            active_custom_theme_id: reset.active_custom_theme_id,
            chat_layout: reset.chat_layout,
        }, 'Theme customization reset.', { syncForm: true })
        options.emitThemeDraftChanged(null)
    }

    async function resetCustomization() {
        if (!canWriteTheme()) return
        localThemeError.value = ''
        const reset = resetTalosCustomizationPreferences(preferencesRecord())
        await persistPreferences({
            theme_customization: reset.theme_customization,
            active_custom_theme_id: reset.active_custom_theme_id,
        }, 'Theme customization reset.', { syncForm: true })
        options.emitThemeDraftChanged(null)
    }

    function setThemeMode(value: TalosThemeMode) {
        options.editor.setThemeMode(value)
    }

    async function updateAndPersistThemeMode(value: TalosThemeMode) {
        setThemeMode(value)
        await persistThemeMode()
    }

    async function persistThemeMode() {
        if (!canWriteTheme()) {
            options.editor.setThemeMode(resolveTalosThemeMode(preferencesRecord().theme_mode))
            return
        }
        const previous = resolveTalosThemeMode(preferencesRecord().theme_mode)
        const mode = resolveTalosThemeMode(options.editor.themeMode.value)
        options.editor.setThemeMode(mode)
        try {
            await persistPreferences({ theme_mode: mode }, 'Theme color mode saved.')
        } catch {
            await nextTick()
            options.editor.setThemeMode(previous)
            bumpThemeControlRevision()
        }
    }

    function invalidAreaTokenDraft() {
        return Object.entries(options.editor.areaTokenForm.value).find(([, value]) => {
            const token = value.trim()
            return token !== '' && !/^#[0-9a-f]{6}$/i.test(token)
        })
    }

    function nextAreaTokens() {
        const current = sanitizeTalosThemeAreaTokens(options.editor.areaTokens.value)
        const nextForArea = sanitizeTalosThemeAreaTokens({
            [options.editor.selectedArea.value]: options.editor.areaTokenForm.value,
        })[options.editor.selectedArea.value] ?? {}
        const nextTokens = { ...current, [options.editor.selectedArea.value]: nextForArea }
        if (Object.keys(nextForArea).length === 0) delete nextTokens[options.editor.selectedArea.value]
        return nextTokens
    }

    async function saveAreaTokens() {
        if (!canWriteTheme()) return
        localThemeError.value = ''
        const invalidToken = invalidAreaTokenDraft()
        if (invalidToken) {
            localThemeError.value = `Area ${invalidToken[0]} must be a six-digit hex color such as #111827.`
            return
        }
        const nextTokens = nextAreaTokens()
        const validation = validateTalosThemeStateForSave({
            baseTheme: options.editor.activeTheme.value,
            customization: options.editor.savedCustomization.value,
            areaTokens: nextTokens,
        })
        if (!validation.valid) {
            localThemeError.value = `Area token contrast rejected: ${validation.errors[0]?.message ?? 'normal-text contrast is unsafe.'}`
            return
        }

        await persistPreferences({ theme_area_tokens: nextTokens }, 'Area tokens saved.')
        options.editor.areaTokens.value = nextTokens
        options.editor.syncAreaForm()
    }

    async function resetAreaTokens() {
        if (!canWriteTheme()) return
        const nextTokens = { ...sanitizeTalosThemeAreaTokens(options.editor.areaTokens.value) }
        delete nextTokens[options.editor.selectedArea.value]
        await persistPreferences({ theme_area_tokens: nextTokens }, 'Area tokens reset.')
        options.editor.areaTokens.value = nextTokens
        options.editor.syncAreaForm()
    }

    return {
        localThemeError,
        themeControlRevision,
        themePolicyLocked,
        preferencesRecord,
        canWriteTheme,
        rejectUnsafeThemeState,
        bumpThemeControlRevision,
        persistPreferences,
        chooseTheme,
        saveCustomization,
        discardChanges,
        resetToPreset,
        resetCustomization,
        setThemeMode,
        updateAndPersistThemeMode,
        persistThemeMode,
        saveAreaTokens,
        resetAreaTokens,
    }
}
