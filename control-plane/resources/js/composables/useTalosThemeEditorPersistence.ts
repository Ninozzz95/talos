import { computed, nextTick, ref, type Ref } from 'vue'
import {
    sanitizeTalosChatLayout,
} from '../lib/talosChatLayout'
import {
    resolveTalosMotionMode,
    resolveTalosThemeMode,
    sanitizeTalosThemeAreaTokens,
    type TalosThemeAreaTokens,
    type TalosThemeCustomization,
    type TalosThemeId,
    type TalosThemeMode,
    type TalosThemeMotionMode,
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
                ...preferencesRecord(),
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

        await persistPreferences({
            ...preferencesRecord(),
            theme_customization: themeCustomization,
            ui_animation_profile: options.editor.uiAnimationProfile.value,
            ui_animation_customization: options.editor.sanitizedUiAnimationForm(),
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
        await persistPreferences(resetTalosThemePreferences(preferencesRecord()), 'Theme customization reset.', { syncForm: true })
        options.emitThemeDraftChanged(null)
    }

    async function resetCustomization() {
        if (!canWriteTheme()) return
        localThemeError.value = ''
        await persistPreferences(resetTalosCustomizationPreferences(preferencesRecord()), 'Theme customization reset.', { syncForm: true })
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
            await persistPreferences({ ...preferencesRecord(), theme_mode: mode }, 'Theme color mode saved.')
        } catch {
            await nextTick()
            options.editor.setThemeMode(previous)
            bumpThemeControlRevision()
        }
    }

    function setMotionMode(value: TalosThemeMotionMode) {
        options.editor.setMotionMode(value)
    }

    async function persistMotionMode() {
        if (!canWriteTheme()) return
        const previous = resolveTalosMotionMode(preferencesRecord().theme_motion)
        const mode = resolveTalosMotionMode(options.editor.motionMode.value)
        options.editor.setMotionMode(mode)
        try {
            await persistPreferences({ ...preferencesRecord(), theme_motion: mode }, 'Theme motion saved.')
        } catch {
            await nextTick()
            options.editor.setMotionMode(previous)
            bumpThemeControlRevision()
        }
    }

    async function persistMotionDisabled() {
        if (!canWriteTheme()) {
            options.editor.motionDisabled.value = preferencesRecord().theme_motion_disabled === true
            return
        }
        const previous = preferencesRecord().theme_motion_disabled === true
        try {
            await persistPreferences({ ...preferencesRecord(), theme_motion_disabled: options.editor.motionDisabled.value }, options.editor.motionDisabled.value ? 'Theme motion disabled.' : 'Theme motion enabled.')
        } catch {
            options.editor.motionDisabled.value = previous
            bumpThemeControlRevision()
        }
    }

    async function persistSimpleAnimation() {
        if (!canWriteTheme()) {
            options.editor.simpleAnimation.value = preferencesRecord().theme_simple_animation !== false
            return
        }
        const previous = preferencesRecord().theme_simple_animation !== false
        try {
            await persistPreferences({ ...preferencesRecord(), theme_simple_animation: options.editor.simpleAnimation.value }, options.editor.simpleAnimation.value ? 'Simple animation enabled.' : 'Rich animation enabled.')
        } catch {
            options.editor.simpleAnimation.value = previous
            bumpThemeControlRevision()
        }
    }

    async function persistBackgroundDisabled() {
        if (!canWriteTheme()) {
            options.editor.backgroundDisabled.value = preferencesRecord().theme_background_disabled === true
            return
        }
        const previous = preferencesRecord().theme_background_disabled === true
        try {
            await persistPreferences({ ...preferencesRecord(), theme_background_disabled: options.editor.backgroundDisabled.value }, options.editor.backgroundDisabled.value ? 'Procedural background disabled.' : 'Procedural background enabled.')
        } catch {
            options.editor.backgroundDisabled.value = previous
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

        await persistPreferences({ ...preferencesRecord(), theme_area_tokens: nextTokens }, 'Area tokens saved.')
        options.editor.areaTokens.value = nextTokens
        options.editor.syncAreaForm()
    }

    async function resetAreaTokens() {
        if (!canWriteTheme()) return
        const nextTokens = { ...sanitizeTalosThemeAreaTokens(options.editor.areaTokens.value) }
        delete nextTokens[options.editor.selectedArea.value]
        await persistPreferences({ ...preferencesRecord(), theme_area_tokens: nextTokens }, 'Area tokens reset.')
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
        setMotionMode,
        persistMotionMode,
        persistMotionDisabled,
        persistSimpleAnimation,
        persistBackgroundDisabled,
        saveAreaTokens,
        resetAreaTokens,
    }
}
