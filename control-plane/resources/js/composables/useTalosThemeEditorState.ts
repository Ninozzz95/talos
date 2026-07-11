import { computed, ref, watch, type Ref } from 'vue'
import {
    TALOS_DEFAULT_CHAT_LAYOUT,
    sanitizeTalosChatLayout,
} from '../lib/talosChatLayout'
import type { TalosChatLayoutPreferences } from '../lib/talosTypes'
import {
    normalizeTalosTheme,
    resolveTalosMotionMode,
    resolveTalosThemeMode,
    resolveTalosUiAnimationProfile,
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeCustomization,
    sanitizeTalosUiAnimationCustomization,
    talosThemePreset,
    talosUiAnimationStyle,
    type TalosThemeAreaId,
    type TalosThemeAreaTokens,
    type TalosThemeCustomization,
    type TalosThemeId,
    type TalosThemeMode,
    type TalosThemeMotionMode,
    type TalosThemeFont,
    type TalosUiAnimationCustomization,
    type TalosUiAnimationProfile,
} from '../lib/talosThemes'
import type { TalosWorkspaceSettings } from './useTalosSettings'
import type { AreaTokenForm, ThemeCustomizationForm, UiAnimationForm } from '../components/talos/settings/theme-engine/themeEngineTypes'

export type TalosThemeEditorTab = 'presets' | 'customize' | 'library' | 'motion' | 'advanced'

export type TalosThemeEditorStateOptions = {
    theme: Ref<TalosThemeId>
    settings: Ref<TalosWorkspaceSettings | null>
    onDraftChanged?: (customization: TalosThemeCustomization | null) => void
}

export type TalosThemeEditorState = ReturnType<typeof useTalosThemeEditorState>

function emptyCustomizationForm(): ThemeCustomizationForm {
    return {
        background: '#080b11',
        panel: '#10161f',
        text: '#edf2f7',
        accent: '#c98b32',
        secondary: '#6ad4d4',
        border: '#27313e',
        font: 'inter',
        density: 'comfortable',
        radius: 'balanced',
        effect: 'dag-flow',
        effect_intensity: 70,
        scrollbar_track: '#071017',
        scrollbar_thumb: '#c98b32',
        scrollbar_thumb_hover: '#d99f49',
        scrollbar_width: 10,
    }
}

function emptyUiAnimationForm(): UiAnimationForm {
    return {
        open_close: 'standard',
        surface_transition: 'slide-fade',
        feedback: 'pulse',
        hover: 'edge-glow',
        duration_scale: 100,
        intensity: 70,
        easing: 'precise',
        stagger: 40,
    }
}

function emptyAreaTokenForm(): AreaTokenForm {
    return {
        background: '',
        surface: '',
        text: '',
        muted: '',
        border: '',
        accent: '',
    }
}

function themeFontDefault(theme: TalosThemeId): TalosThemeFont {
    const declaredFont = talosThemePreset(theme).fontUi
    if (declaredFont === 'JetBrains Mono') return 'mono'
    if (declaredFont === 'Manrope') return 'manrope'
    if (declaredFont === 'Sora') return 'display'
    if (declaredFont === 'Source Serif 4') return 'serif'
    return 'inter'
}

export function useTalosThemeEditorState(options: TalosThemeEditorStateOptions) {
    const settingsSnapshot = ref<TalosWorkspaceSettings | null>(options.settings.value)
    const activeTab = ref<TalosThemeEditorTab>('presets')
    const customizationForm = ref<ThemeCustomizationForm>(emptyCustomizationForm())
    const newThemeName = ref('')
    const themeMode = ref<TalosThemeMode>('system')
    const motionMode = ref<TalosThemeMotionMode>('system')
    const motionDisabled = ref(false)
    const simpleAnimation = ref(true)
    const backgroundDisabled = ref(false)
    const uiAnimationProfile = ref<TalosUiAnimationProfile>('preset')
    const uiAnimationForm = ref<UiAnimationForm>(emptyUiAnimationForm())
    const motionPreviewOpen = ref(false)
    const areaTokens = ref<TalosThemeAreaTokens>({})
    const selectedArea = ref<TalosThemeAreaId>('composer')
    const areaTokenForm = ref<AreaTokenForm>(emptyAreaTokenForm())
    const chatLayout = ref<TalosChatLayoutPreferences>({ ...TALOS_DEFAULT_CHAT_LAYOUT })
    const syncingForm = ref(false)

    const activeSettings = computed(() => settingsSnapshot.value ?? options.settings.value)
    const activeTheme = computed(() => normalizeTalosTheme(activeSettings.value?.preferences?.theme ?? options.theme.value))
    const activePreset = computed(() => talosThemePreset(activeTheme.value))
    const savedCustomization = computed(() => sanitizeTalosThemeCustomization(activeSettings.value?.preferences?.theme_customization))
    const savedUiAnimationCustomization = computed(() => sanitizeTalosUiAnimationCustomization(activeSettings.value?.preferences?.ui_animation_customization))
    const savedUiAnimationProfile = computed(() => resolveTalosUiAnimationProfile(activeSettings.value?.preferences?.ui_animation_profile))
    const savedChatLayout = computed(() => sanitizeTalosChatLayout(activeSettings.value?.preferences?.chat_layout))
    const themeDraftIsDirty = computed(() => JSON.stringify(customizationForm.value) !== JSON.stringify(formFromCurrentSettings()))
    const animationDraftIsDirty = computed(() => (
        uiAnimationProfile.value !== savedUiAnimationProfile.value
        || JSON.stringify(uiAnimationForm.value) !== JSON.stringify(uiAnimationFormFromCustomization(savedUiAnimationCustomization.value))
    ))
    const chatLayoutDraftIsDirty = computed(() => JSON.stringify(chatLayout.value) !== JSON.stringify(savedChatLayout.value))
    const draftIsDirty = computed(() => themeDraftIsDirty.value || animationDraftIsDirty.value || chatLayoutDraftIsDirty.value)
    const hasAreaDraft = computed(() => Object.values(areaTokenForm.value).some((value) => value.trim() !== ''))
    const motionPreviewStyle = computed(() => talosUiAnimationStyle(
        activeTheme.value,
        uiAnimationProfile.value,
        motionMode.value,
        uiAnimationProfile.value === 'off',
        sanitizedUiAnimationForm(),
    ))

    function preferencesRecord(): Record<string, unknown> {
        return activeSettings.value?.preferences ?? {}
    }

    function formFromCustomization(customization: TalosThemeCustomization, preset = activePreset.value): ThemeCustomizationForm {
        return {
            background: customization.background ?? preset.preview.background,
            panel: customization.panel ?? preset.preview.background,
            text: customization.text ?? (preset.isLight ? '#17202a' : '#edf2f7'),
            accent: customization.accent ?? preset.preview.accent,
            secondary: customization.secondary ?? preset.preview.secondary,
            border: customization.border ?? preset.preview.line,
            font: customization.font ?? themeFontDefault(preset.id),
            density: customization.density ?? preset.defaultDensity,
            radius: customization.radius ?? preset.defaultRadius,
            effect: customization.effect ?? preset.defaultEffect,
            effect_intensity: customization.effect_intensity ?? 70,
            scrollbar_track: customization.scrollbar_track ?? preset.preview.background,
            scrollbar_thumb: customization.scrollbar_thumb ?? preset.preview.accent,
            scrollbar_thumb_hover: customization.scrollbar_thumb_hover ?? preset.preview.secondary,
            scrollbar_width: customization.scrollbar_width ?? 10,
        }
    }

    function formFromCurrentSettings() {
        return formFromCustomization(savedCustomization.value)
    }

    function uiAnimationFormFromCustomization(customization: TalosUiAnimationCustomization): UiAnimationForm {
        return { ...emptyUiAnimationForm(), ...sanitizeTalosUiAnimationCustomization(customization) }
    }

    function syncAreaForm() {
        const tokens = areaTokens.value[selectedArea.value] ?? {}
        areaTokenForm.value = {
            background: tokens.background ?? '',
            surface: tokens.surface ?? '',
            text: tokens.text ?? '',
            muted: tokens.muted ?? '',
            border: tokens.border ?? '',
            accent: tokens.accent ?? '',
        }
    }

    function syncFromSettings(snapshot?: TalosWorkspaceSettings | null) {
        if (snapshot !== undefined) settingsSnapshot.value = snapshot
        else if (options.settings.value) settingsSnapshot.value = options.settings.value

        const preferences = preferencesRecord()
        themeMode.value = resolveTalosThemeMode(preferences.theme_mode)
        motionMode.value = resolveTalosMotionMode(preferences.theme_motion)
        motionDisabled.value = preferences.theme_motion_disabled === true
        simpleAnimation.value = preferences.theme_simple_animation !== false
        backgroundDisabled.value = preferences.theme_background_disabled === true
        uiAnimationProfile.value = resolveTalosUiAnimationProfile(preferences.ui_animation_profile)
        uiAnimationForm.value = uiAnimationFormFromCustomization(preferences.ui_animation_customization)
        areaTokens.value = sanitizeTalosThemeAreaTokens(preferences.theme_area_tokens)
        chatLayout.value = sanitizeTalosChatLayout(preferences.chat_layout)
        syncAreaForm()
    }

    function syncCustomizationForm() {
        syncingForm.value = true
        customizationForm.value = formFromCurrentSettings()
        uiAnimationForm.value = uiAnimationFormFromCustomization(savedUiAnimationCustomization.value)
        uiAnimationProfile.value = savedUiAnimationProfile.value
        chatLayout.value = { ...savedChatLayout.value }

        const complete = () => {
            syncingForm.value = false
        }
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(complete)
        } else {
            setTimeout(complete, 0)
        }
    }

    function activateTab(tab: TalosThemeEditorTab) {
        activeTab.value = tab
        if (tab === 'customize') syncCustomizationForm()
        if (tab === 'advanced') syncAreaForm()
    }

    function sanitizedForm(): TalosThemeCustomization {
        const customization = sanitizeTalosThemeCustomization(customizationForm.value)
        const defaults = sanitizeTalosThemeCustomization(formFromCustomization({}, activePreset.value))

        return Object.fromEntries(
            Object.entries(customization).filter(([key, value]) => value !== defaults[key as keyof TalosThemeCustomization]),
        ) as TalosThemeCustomization
    }

    function sanitizedUiAnimationForm(): TalosUiAnimationCustomization {
        return sanitizeTalosUiAnimationCustomization(uiAnimationForm.value)
    }

    function updateCustomizationForm(value: ThemeCustomizationForm) {
        customizationForm.value = value
    }

    function updateUiAnimationProfile(value: TalosUiAnimationProfile) {
        uiAnimationProfile.value = resolveTalosUiAnimationProfile(value)
    }

    function updateUiAnimationForm(value: UiAnimationForm) {
        uiAnimationForm.value = value
    }

    function updateChatLayout(value: TalosChatLayoutPreferences) {
        chatLayout.value = sanitizeTalosChatLayout(value)
    }

    function setThemeMode(value: TalosThemeMode) {
        themeMode.value = resolveTalosThemeMode(value)
    }

    function setMotionMode(value: TalosThemeMotionMode) {
        motionMode.value = resolveTalosMotionMode(value)
    }

    function previewMotion() {
        motionPreviewOpen.value = false
        window.setTimeout(() => {
            motionPreviewOpen.value = true
        }, 20)
    }

    function emitCurrentDraft() {
        options.onDraftChanged?.(draftIsDirty.value ? sanitizedForm() : null)
    }

    watch(options.settings, (value) => {
        settingsSnapshot.value = value
    }, { immediate: true })

    watch(selectedArea, syncAreaForm)

    watch([customizationForm, uiAnimationForm, uiAnimationProfile, chatLayout], () => {
        if (syncingForm.value || activeTab.value !== 'customize') return
        emitCurrentDraft()
    }, { deep: true })

    return {
        activeTab,
        customizationForm,
        newThemeName,
        themeMode,
        motionMode,
        motionDisabled,
        simpleAnimation,
        backgroundDisabled,
        uiAnimationProfile,
        uiAnimationForm,
        motionPreviewOpen,
        motionPreviewStyle,
        areaTokens,
        selectedArea,
        areaTokenForm,
        chatLayout,
        activeSettings,
        activeTheme,
        activePreset,
        savedCustomization,
        savedUiAnimationCustomization,
        savedUiAnimationProfile,
        savedChatLayout,
        themeDraftIsDirty,
        animationDraftIsDirty,
        chatLayoutDraftIsDirty,
        draftIsDirty,
        hasAreaDraft,
        preferencesRecord,
        syncFromSettings,
        syncCustomizationForm,
        syncAreaForm,
        activateTab,
        sanitizedForm,
        sanitizedUiAnimationForm,
        updateCustomizationForm,
        updateUiAnimationProfile,
        updateUiAnimationForm,
        updateChatLayout,
        setThemeMode,
        setMotionMode,
        previewMotion,
        emitCurrentDraft,
    }
}
