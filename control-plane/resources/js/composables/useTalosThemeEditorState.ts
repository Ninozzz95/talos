import { computed, ref, watch, type Ref } from 'vue'
import {
    TALOS_DEFAULT_CHAT_LAYOUT,
    sanitizeTalosChatLayout,
} from '../lib/talosChatLayout'
import type { TalosChatLayoutPreferences } from '../lib/talosTypes'
import {
    normalizeTalosTheme,
    resolveTalosThemeMode,
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeCustomization,
    talosThemePreset,
    type TalosThemeAreaId,
    type TalosThemeAreaTokens,
    type TalosThemeCustomization,
    type TalosThemeId,
    type TalosThemeMode,
    type TalosThemeFont,
} from '../lib/talosThemes'
import type { TalosWorkspaceSettings } from './useTalosSettings'
import type { AreaTokenForm, ThemeCustomizationForm } from '../components/talos/settings/theme-engine/themeEngineTypes'

export type TalosThemeEditorTab = 'presets' | 'customize' | 'library' | 'motion' | 'advanced'

const TALOS_THEME_EDITOR_TABS: readonly TalosThemeEditorTab[] = ['presets', 'customize', 'library', 'motion', 'advanced']

export function normalizeTalosThemeEditorTab(value: string | undefined): TalosThemeEditorTab {
    return TALOS_THEME_EDITOR_TABS.includes(value as TalosThemeEditorTab)
        ? value as TalosThemeEditorTab
        : 'presets'
}

export type TalosThemeEditorStateOptions = {
    theme: Ref<TalosThemeId>
    settings: Ref<TalosWorkspaceSettings | null>
    initialTab?: string
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
        scrollbar_track: '#071017',
        scrollbar_thumb: '#c98b32',
        scrollbar_thumb_hover: '#d99f49',
        scrollbar_width: 10,
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
    const activeTab = ref<TalosThemeEditorTab>(normalizeTalosThemeEditorTab(options.initialTab))
    const customizationForm = ref<ThemeCustomizationForm>(emptyCustomizationForm())
    const newThemeName = ref('')
    const themeMode = ref<TalosThemeMode>('system')
    const areaTokens = ref<TalosThemeAreaTokens>({})
    const selectedArea = ref<TalosThemeAreaId>('composer')
    const areaTokenForm = ref<AreaTokenForm>(emptyAreaTokenForm())
    const chatLayout = ref<TalosChatLayoutPreferences>({ ...TALOS_DEFAULT_CHAT_LAYOUT })
    const syncingForm = ref(false)

    const activeSettings = computed(() => settingsSnapshot.value ?? options.settings.value)
    const activeTheme = computed(() => normalizeTalosTheme(activeSettings.value?.preferences?.theme ?? options.theme.value))
    const activePreset = computed(() => talosThemePreset(activeTheme.value))
    const savedCustomization = computed(() => sanitizeTalosThemeCustomization(activeSettings.value?.preferences?.theme_customization))
    const savedChatLayout = computed(() => sanitizeTalosChatLayout(activeSettings.value?.preferences?.chat_layout))
    const themeDraftIsDirty = computed(() => JSON.stringify(customizationForm.value) !== JSON.stringify(formFromCurrentSettings()))
    const chatLayoutDraftIsDirty = computed(() => JSON.stringify(chatLayout.value) !== JSON.stringify(savedChatLayout.value))
    const draftIsDirty = computed(() => themeDraftIsDirty.value || chatLayoutDraftIsDirty.value)
    const hasAreaDraft = computed(() => Object.values(areaTokenForm.value).some((value) => value.trim() !== ''))

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
            scrollbar_track: customization.scrollbar_track ?? preset.preview.background,
            scrollbar_thumb: customization.scrollbar_thumb ?? preset.preview.accent,
            scrollbar_thumb_hover: customization.scrollbar_thumb_hover ?? preset.preview.secondary,
            scrollbar_width: customization.scrollbar_width ?? 10,
        }
    }

    function formFromCurrentSettings() {
        return formFromCustomization(savedCustomization.value)
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
        areaTokens.value = sanitizeTalosThemeAreaTokens(preferences.theme_area_tokens)
        chatLayout.value = sanitizeTalosChatLayout(preferences.chat_layout)
        syncAreaForm()
    }

    function syncCustomizationForm() {
        syncingForm.value = true
        customizationForm.value = formFromCurrentSettings()
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

    function updateCustomizationForm(value: ThemeCustomizationForm) {
        customizationForm.value = value
    }

    function updateChatLayout(value: TalosChatLayoutPreferences) {
        chatLayout.value = sanitizeTalosChatLayout(value)
    }

    function setThemeMode(value: TalosThemeMode) {
        themeMode.value = resolveTalosThemeMode(value)
    }

    function emitCurrentDraft() {
        options.onDraftChanged?.(draftIsDirty.value ? sanitizedForm() : null)
    }

    watch(options.settings, (value) => {
        settingsSnapshot.value = value
    }, { immediate: true })

    watch(selectedArea, syncAreaForm)

    watch([customizationForm, chatLayout], () => {
        if (syncingForm.value || activeTab.value !== 'customize') return
        emitCurrentDraft()
    }, { deep: true })

    return {
        activeTab,
        customizationForm,
        newThemeName,
        themeMode,
        areaTokens,
        selectedArea,
        areaTokenForm,
        chatLayout,
        activeSettings,
        activeTheme,
        activePreset,
        savedCustomization,
        savedChatLayout,
        themeDraftIsDirty,
        chatLayoutDraftIsDirty,
        draftIsDirty,
        hasAreaDraft,
        preferencesRecord,
        syncFromSettings,
        syncCustomizationForm,
        syncAreaForm,
        activateTab,
        sanitizedForm,
        updateCustomizationForm,
        updateChatLayout,
        setThemeMode,
        emitCurrentDraft,
    }
}
