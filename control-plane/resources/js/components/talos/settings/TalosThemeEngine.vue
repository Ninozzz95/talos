<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import InfoPopover from '../../ui/InfoPopover.vue'
import Input from '../../ui/Input.vue'
import Select from '../../ui/Select.vue'
import Switch from '../../ui/Switch.vue'
import Textarea from '../../ui/Textarea.vue'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import {
    TALOS_BACKGROUND_EFFECTS,
    TALOS_THEME_AREA_OPTIONS,
    TALOS_THEME_AREA_TOKEN_OPTIONS,
    TALOS_THEME_DENSITY_OPTIONS,
    TALOS_THEME_FONT_OPTIONS,
    TALOS_THEME_MOTION_OPTIONS,
    TALOS_THEME_PRESETS,
    TALOS_THEME_RADIUS_OPTIONS,
    TALOS_UI_ANIMATION_EASING_OPTIONS,
    TALOS_UI_ANIMATION_FEEDBACK_OPTIONS,
    TALOS_UI_ANIMATION_HOVER_OPTIONS,
    TALOS_UI_ANIMATION_OPEN_CLOSE_OPTIONS,
    TALOS_UI_ANIMATION_PROFILE_OPTIONS,
    TALOS_UI_ANIMATION_SURFACE_OPTIONS,
    buildTalosThemeExport,
    normalizeTalosTheme,
    parseTalosThemeExport,
    resolveTalosMotionMode,
    resolveTalosUiAnimationProfile,
    sanitizeTalosNamedTheme,
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeCustomization,
    sanitizeTalosThemeLibrary,
    sanitizeTalosUiAnimationCustomization,
    talosUiAnimationStyle,
    talosThemePreset,
    type TalosBackgroundEffect,
    type TalosNamedTheme,
    type TalosThemeAreaId,
    type TalosThemeAreaTokenKey,
    type TalosThemeAreaTokens,
    type TalosThemeCustomization,
    type TalosThemeDensity,
    type TalosThemeFont,
    type TalosThemeId,
    type TalosThemeMotionMode,
    type TalosThemeRadius,
    type TalosUiAnimationCustomization,
    type TalosUiAnimationEasing,
    type TalosUiAnimationFeedback,
    type TalosUiAnimationHover,
    type TalosUiAnimationOpenClose,
    type TalosUiAnimationProfile,
    type TalosUiAnimationSurfaceTransition,
} from '../../../lib/talosThemes'

const props = defineProps<{
    theme: TalosThemeId
}>()

const emit = defineEmits<{
    changeTheme: [theme: TalosThemeId, persist?: boolean]
    themeCustomizationChanged: [settings?: { preferences?: Record<string, unknown> }]
    themeDraftChanged: [customization: TalosThemeCustomization | null]
}>()

type ThemeTab = 'presets' | 'customize' | 'library' | 'motion' | 'advanced'

type ThemeCustomizationForm = {
    background: string
    panel: string
    text: string
    accent: string
    secondary: string
    border: string
    font: TalosThemeFont
    density: TalosThemeDensity
    radius: TalosThemeRadius
    effect: TalosBackgroundEffect
    effect_intensity: number
    scrollbar_track: string
    scrollbar_thumb: string
    scrollbar_thumb_hover: string
    scrollbar_width: number
}

type UiAnimationForm = {
    open_close: TalosUiAnimationOpenClose
    surface_transition: TalosUiAnimationSurfaceTransition
    feedback: TalosUiAnimationFeedback
    hover: TalosUiAnimationHover
    duration_scale: number
    intensity: number
    easing: TalosUiAnimationEasing
    stagger: number
}

type AreaTokenForm = Record<TalosThemeAreaTokenKey, string>

const {
    settings,
    settingsError,
    settingsSavedMessage,
    savingSettings,
    loadSettings,
    updateSettings,
} = useTalosSettings()

const activeTab = ref<ThemeTab>('presets')
const customizationForm = ref<ThemeCustomizationForm>(emptyCustomizationForm())
const themeLibrary = ref<TalosNamedTheme[]>([])
const activeCustomThemeId = ref<string | null>(null)
const newThemeName = ref('')
const renamingThemeId = ref<string | null>(null)
const renameThemeName = ref('')
const exportJson = ref('')
const importJson = ref('')
const localThemeError = ref('')
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
const syncingForm = ref(false)

const activeTheme = computed(() => {
    const storedTheme = settings.value?.preferences?.theme
    return normalizeTalosTheme(storedTheme ?? props.theme)
})

const activePreset = computed(() => talosThemePreset(activeTheme.value))
const activeNamedTheme = computed(() => themeLibrary.value.find((theme) => theme.id === activeCustomThemeId.value) ?? null)
const savedCustomization = computed(() => sanitizeTalosThemeCustomization(settings.value?.preferences?.theme_customization))
const savedUiAnimationCustomization = computed(() => sanitizeTalosUiAnimationCustomization(settings.value?.preferences?.ui_animation_customization))
const savedUiAnimationProfile = computed(() => resolveTalosUiAnimationProfile(settings.value?.preferences?.ui_animation_profile))
const themeDraftIsDirty = computed(() => JSON.stringify(customizationForm.value) !== JSON.stringify(formFromCurrentSettings()))
const animationDraftIsDirty = computed(() => (
    uiAnimationProfile.value !== savedUiAnimationProfile.value
    || JSON.stringify(uiAnimationForm.value) !== JSON.stringify(uiAnimationFormFromCustomization(savedUiAnimationCustomization.value))
))
const draftIsDirty = computed(() => themeDraftIsDirty.value || animationDraftIsDirty.value)
const hasAreaDraft = computed(() => Object.values(areaTokenForm.value).some((value) => value.trim() !== ''))
const themePolicyLocked = computed(() => preferencesRecord().theme_policy_locked === true)

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
    if (theme === 'terminal' || theme === 'noir') {
        return 'mono'
    }

    if (theme === 'violet' || theme === 'aurora') {
        return 'display'
    }

    return 'inter'
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
        density: customization.density ?? 'comfortable',
        radius: customization.radius ?? 'balanced',
        effect: customization.effect ?? preset.defaultEffect,
        effect_intensity: customization.effect_intensity ?? 70,
        scrollbar_track: customization.scrollbar_track ?? preset.preview.background,
        scrollbar_thumb: customization.scrollbar_thumb ?? preset.preview.accent,
        scrollbar_thumb_hover: customization.scrollbar_thumb_hover ?? preset.preview.secondary,
        scrollbar_width: customization.scrollbar_width ?? 10,
    }
}

function formFromCurrentSettings(): ThemeCustomizationForm {
    return formFromCustomization(savedCustomization.value)
}

function uiAnimationFormFromCustomization(customization: TalosUiAnimationCustomization): UiAnimationForm {
    return {
        ...emptyUiAnimationForm(),
        ...sanitizeTalosUiAnimationCustomization(customization),
    }
}

function syncCustomizationForm() {
    syncingForm.value = true
    customizationForm.value = formFromCurrentSettings()
    uiAnimationForm.value = uiAnimationFormFromCustomization(savedUiAnimationCustomization.value)
    uiAnimationProfile.value = savedUiAnimationProfile.value
    window.requestAnimationFrame(() => {
        syncingForm.value = false
    })
}

function preferencesRecord() {
    return settings.value?.preferences ?? {}
}

function canWriteTheme() {
    if (!themePolicyLocked.value) {
        return true
    }

    localThemeError.value = 'Theme changes are locked by workspace policy.'
    return false
}

function syncThemeState() {
    const preferences = preferencesRecord()
    themeLibrary.value = sanitizeTalosThemeLibrary(preferences.theme_library)
    activeCustomThemeId.value = typeof preferences.active_custom_theme_id === 'string' ? preferences.active_custom_theme_id : null
    motionMode.value = resolveTalosMotionMode(preferences.theme_motion)
    motionDisabled.value = preferences.theme_motion_disabled === true
    simpleAnimation.value = preferences.theme_simple_animation !== false
    backgroundDisabled.value = preferences.theme_background_disabled === true
    uiAnimationProfile.value = resolveTalosUiAnimationProfile(preferences.ui_animation_profile)
    uiAnimationForm.value = uiAnimationFormFromCustomization(preferences.ui_animation_customization)
    areaTokens.value = sanitizeTalosThemeAreaTokens(preferences.theme_area_tokens)
    syncAreaForm()
}

function activateTab(tab: ThemeTab) {
    activeTab.value = tab

    if (tab === 'customize') {
        syncCustomizationForm()
    }

    if (tab === 'advanced') {
        syncAreaForm()
    }
}

async function chooseTheme(theme: TalosThemeId) {
    if (!canWriteTheme()) {
        return
    }

    emit('themeDraftChanged', null)
    emit('changeTheme', theme, false)
    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme,
            workspace_default_theme: theme,
            theme_customization: {},
            active_custom_theme_id: null,
        },
    }, 'Theme saved through /api/talos/settings.')
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged', nextSettings)
}

function sanitizedForm(): TalosThemeCustomization {
    return sanitizeTalosThemeCustomization({
        background: customizationForm.value.background,
        panel: customizationForm.value.panel,
        text: customizationForm.value.text,
        accent: customizationForm.value.accent,
        secondary: customizationForm.value.secondary,
        border: customizationForm.value.border,
        font: customizationForm.value.font,
        density: customizationForm.value.density,
        radius: customizationForm.value.radius,
        effect: customizationForm.value.effect,
        effect_intensity: customizationForm.value.effect_intensity,
        scrollbar_track: customizationForm.value.scrollbar_track,
        scrollbar_thumb: customizationForm.value.scrollbar_thumb,
        scrollbar_thumb_hover: customizationForm.value.scrollbar_thumb_hover,
        scrollbar_width: customizationForm.value.scrollbar_width,
    })
}

function sanitizedUiAnimationForm(): TalosUiAnimationCustomization {
    return sanitizeTalosUiAnimationCustomization(uiAnimationForm.value)
}

const motionPreviewStyle = computed(() => talosUiAnimationStyle(
    activeTheme.value,
    uiAnimationProfile.value,
    motionMode.value,
    motionDisabled.value,
    sanitizedUiAnimationForm(),
))

function previewMotion() {
    motionPreviewOpen.value = false
    window.setTimeout(() => {
        motionPreviewOpen.value = true
    }, 20)
}

async function saveCustomization() {
    if (!canWriteTheme()) {
        return
    }

    const themeCustomization = sanitizedForm()
    const uiAnimationCustomization = sanitizedUiAnimationForm()
    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_customization: themeCustomization,
            ui_animation_profile: uiAnimationProfile.value,
            ui_animation_customization: uiAnimationCustomization,
            active_custom_theme_id: activeCustomThemeId.value,
        },
    }, 'Theme customization saved through /api/talos/settings.')
    emit('themeDraftChanged', null)
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged', nextSettings)
}

function discardChanges() {
    syncCustomizationForm()
    emit('themeDraftChanged', null)
}

async function resetCustomization() {
    if (!canWriteTheme()) {
        return
    }

    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_customization: {},
            ui_animation_profile: 'preset',
            ui_animation_customization: {},
            active_custom_theme_id: null,
        },
    }, 'Theme customization reset.')
    emit('themeDraftChanged', null)
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged', nextSettings)
}

function generateThemeId(name: string) {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'theme'
    return `${slug}-${Date.now().toString(36)}`
}

function currentNamedTheme(name: string, id = generateThemeId(name)): TalosNamedTheme {
    const now = new Date().toISOString()
    return {
        id,
        name: name.trim().slice(0, 80),
        base_theme: activeTheme.value,
        tokens: sanitizedForm(),
        area_tokens: areaTokens.value,
        motion: motionMode.value,
        ui_animation_profile: uiAnimationProfile.value,
        ui_animation_customization: sanitizedUiAnimationForm(),
        created_at: now,
        updated_at: now,
    }
}

async function saveAsNamedTheme() {
    if (!canWriteTheme()) {
        return
    }

    localThemeError.value = ''
    const name = newThemeName.value.trim()
    if (!name) {
        localThemeError.value = 'Theme name is required.'
        return
    }

    const theme = currentNamedTheme(name)
    const nextLibrary = [...themeLibrary.value, theme]

    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme: theme.base_theme,
            workspace_default_theme: theme.base_theme,
            theme_customization: theme.tokens,
            theme_library: nextLibrary,
            active_custom_theme_id: theme.id,
            theme_area_tokens: theme.area_tokens ?? {},
            theme_motion: theme.motion ?? 'system',
            ui_animation_profile: theme.ui_animation_profile ?? 'preset',
            ui_animation_customization: theme.ui_animation_customization ?? {},
        },
    }, 'Custom theme saved through /api/talos/settings.')
    activeTab.value = 'library'
    newThemeName.value = ''
    emit('themeDraftChanged', null)
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged', nextSettings)
}

async function applyNamedTheme(theme: TalosNamedTheme) {
    if (!canWriteTheme()) {
        return
    }

    emit('themeDraftChanged', null)
    emit('changeTheme', theme.base_theme, false)
    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme: theme.base_theme,
            workspace_default_theme: theme.base_theme,
            theme_customization: theme.tokens,
            theme_area_tokens: theme.area_tokens ?? {},
            theme_motion: theme.motion ?? 'system',
            ui_animation_profile: theme.ui_animation_profile ?? 'preset',
            ui_animation_customization: theme.ui_animation_customization ?? {},
            active_custom_theme_id: theme.id,
        },
    }, 'Custom theme applied.')
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged', nextSettings)
}

function startRename(theme: TalosNamedTheme) {
    renamingThemeId.value = theme.id
    renameThemeName.value = theme.name
}

async function saveRename(theme: TalosNamedTheme) {
    if (!canWriteTheme()) {
        return
    }

    const name = renameThemeName.value.trim()
    if (!name) {
        return
    }

    const nextLibrary = themeLibrary.value.map((item) => item.id === theme.id ? { ...item, name, updated_at: new Date().toISOString() } : item)
    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_library: nextLibrary,
        },
    }, 'Theme renamed.')
    renamingThemeId.value = null
    syncThemeState()
}

async function duplicateTheme(theme: TalosNamedTheme) {
    if (!canWriteTheme()) {
        return
    }

    const duplicate = sanitizeTalosNamedTheme({
        ...theme,
        id: generateThemeId(`${theme.name} copy`),
        name: `${theme.name} copy`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    })

    if (!duplicate) {
        return
    }

    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_library: [...themeLibrary.value, duplicate],
        },
    }, 'Theme duplicated.')
    syncThemeState()
}

async function deleteTheme(theme: TalosNamedTheme) {
    if (!canWriteTheme()) {
        return
    }

    const nextLibrary = themeLibrary.value.filter((item) => item.id !== theme.id)
    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_library: nextLibrary,
            active_custom_theme_id: activeCustomThemeId.value === theme.id ? null : activeCustomThemeId.value,
        },
    }, 'Theme deleted.')
    syncThemeState()
}

function exportActiveTheme() {
    const theme = activeNamedTheme.value ?? currentNamedTheme(`${activePreset.value.shortLabel} custom`, `current-${activeTheme.value}`)
    exportJson.value = JSON.stringify(buildTalosThemeExport(theme), null, 2)
}

async function importTheme() {
    if (!canWriteTheme()) {
        return
    }

    localThemeError.value = ''
    let parsed: unknown

    try {
        parsed = JSON.parse(importJson.value)
    } catch {
        localThemeError.value = 'TALOS rejected this theme import.'
        return
    }

    const theme = parseTalosThemeExport(parsed)
    if (!theme) {
        localThemeError.value = 'TALOS rejected this theme import.'
        return
    }

    const nextLibrary = [...themeLibrary.value.filter((item) => item.id !== theme.id), theme]
    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme: theme.base_theme,
            workspace_default_theme: theme.base_theme,
            theme_customization: theme.tokens,
            theme_library: nextLibrary,
            active_custom_theme_id: theme.id,
            theme_area_tokens: theme.area_tokens ?? {},
            theme_motion: theme.motion ?? 'system',
            ui_animation_profile: theme.ui_animation_profile ?? 'preset',
            ui_animation_customization: theme.ui_animation_customization ?? {},
        },
    }, 'Theme imported.')
    importJson.value = ''
    activeTab.value = 'library'
    emit('changeTheme', theme.base_theme, false)
    emit('themeDraftChanged', null)
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged', nextSettings)
}

async function persistMotionMode() {
    if (!canWriteTheme()) {
        return
    }

    const mode = resolveTalosMotionMode(motionMode.value)
    motionMode.value = mode
    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_motion: mode,
        },
    }, 'Theme motion saved.')
    syncThemeState()
    emit('themeCustomizationChanged', nextSettings)
}

async function persistMotionDisabled() {
    if (!canWriteTheme()) {
        motionDisabled.value = preferencesRecord().theme_motion_disabled === true
        return
    }

    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_motion_disabled: motionDisabled.value,
        },
    }, motionDisabled.value ? 'Theme motion disabled.' : 'Theme motion enabled.')
    syncThemeState()
    emit('themeCustomizationChanged', nextSettings)
}

async function persistSimpleAnimation() {
    if (!canWriteTheme()) {
        simpleAnimation.value = preferencesRecord().theme_simple_animation !== false
        return
    }

    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_simple_animation: simpleAnimation.value,
        },
    }, simpleAnimation.value ? 'Simple animation enabled.' : 'Rich animation enabled.')
    syncThemeState()
    emit('themeCustomizationChanged', nextSettings)
}

async function persistBackgroundDisabled() {
    if (!canWriteTheme()) {
        backgroundDisabled.value = preferencesRecord().theme_background_disabled === true
        return
    }

    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_background_disabled: backgroundDisabled.value,
        },
    }, backgroundDisabled.value ? 'Procedural background disabled.' : 'Procedural background enabled.')
    syncThemeState()
    emit('themeCustomizationChanged', nextSettings)
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

function sanitizeAreaTokenForm(): TalosThemeAreaTokens {
    return sanitizeTalosThemeAreaTokens({
        [selectedArea.value]: areaTokenForm.value,
    })
}

async function saveAreaTokens() {
    if (!canWriteTheme()) {
        return
    }

    const current = sanitizeTalosThemeAreaTokens(areaTokens.value)
    const nextForArea = sanitizeAreaTokenForm()[selectedArea.value] ?? {}
    const nextTokens = {
        ...current,
        [selectedArea.value]: nextForArea,
    }

    if (Object.keys(nextForArea).length === 0) {
        delete nextTokens[selectedArea.value]
    }

    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_area_tokens: nextTokens,
        },
    }, 'Area tokens saved.')
    areaTokens.value = nextTokens
    syncAreaForm()
    emit('themeCustomizationChanged', nextSettings)
}

async function resetAreaTokens() {
    if (!canWriteTheme()) {
        return
    }

    const nextTokens = { ...sanitizeTalosThemeAreaTokens(areaTokens.value) }
    delete nextTokens[selectedArea.value]
    const nextSettings = await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_area_tokens: nextTokens,
        },
    }, 'Area tokens reset.')
    areaTokens.value = nextTokens
    syncAreaForm()
    emit('themeCustomizationChanged', nextSettings)
}

watch(customizationForm, () => {
    if (syncingForm.value || activeTab.value !== 'customize') {
        return
    }

    emit('themeDraftChanged', draftIsDirty.value ? sanitizedForm() : null)
}, { deep: true })

watch(selectedArea, () => {
    syncAreaForm()
})

onMounted(async () => {
    const loaded = await loadSettings().catch(() => null)
    const theme = loaded?.preferences?.theme
    if (theme) {
        emit('changeTheme', normalizeTalosTheme(theme), false)
    }
    syncThemeState()
    syncCustomizationForm()
})
</script>

<template>
    <Card>
        <div class="flex flex-col gap-4">
            <div>
                <h3 class="text-base font-semibold text-[var(--talos-text)]">Theme Engine</h3>
                <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                    Presets, custom themes, motion and area tokens are persisted through the TALOS settings API.
                </p>
            </div>

            <div v-if="settingsError || localThemeError || settingsSavedMessage || themePolicyLocked" class="sticky top-0 z-20 grid gap-2 bg-[var(--talos-card)]/95 py-1 backdrop-blur">
                <div v-if="settingsError" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                    {{ settingsError }}
                </div>
                <div v-if="localThemeError" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                    {{ localThemeError }}
                </div>
                <div v-if="settingsSavedMessage" class="rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                    {{ settingsSavedMessage }}
                </div>
                <div v-if="themePolicyLocked" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                    Theme changes are locked by workspace policy.
                </div>
            </div>

            <div role="tablist" aria-label="Theme controls" class="grid grid-cols-5 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-1 text-xs">
                <button
                    v-for="tab in [
                        { id: 'presets', label: 'Presets' },
                        { id: 'customize', label: 'Customize' },
                        { id: 'library', label: 'Library' },
                        { id: 'motion', label: 'Motion' },
                        { id: 'advanced', label: 'Advanced' },
                    ]"
                    :key="tab.id"
                    type="button"
                    role="tab"
                    :aria-selected="activeTab === tab.id ? 'true' : 'false'"
                    class="rounded-sm px-2 py-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    :class="activeTab === tab.id ? 'bg-[var(--talos-accent)] text-[var(--talos-accent-text)]' : 'text-[var(--talos-muted)] hover:text-[var(--talos-text)]'"
                    @click="activateTab(tab.id as ThemeTab)"
                >
                    {{ tab.label }}
                </button>
            </div>

            <section v-if="activeTab === 'presets'" aria-label="Theme presets">
                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <button
                        v-for="preset in TALOS_THEME_PRESETS"
                        :key="preset.id"
                        type="button"
                        data-testid="talos-theme-preset"
                        class="talos-theme-preset-card rounded-md border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                        :class="activeTheme === preset.id ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)]' : 'border-[var(--talos-border)] bg-[var(--talos-panel-soft)] hover:border-[var(--talos-accent-border)]'"
                        :aria-label="preset.label"
                        :disabled="themePolicyLocked || savingSettings"
                        @click="chooseTheme(preset.id)"
                    >
                        <span
                            data-testid="talos-theme-preview-swatch"
                            class="relative mb-3 block h-20 overflow-hidden rounded-md border bg-[var(--talos-background)]"
                            :style="{ borderColor: preset.preview.line, background: preset.preview.background }"
                            aria-hidden="true"
                        >
                            <img
                                data-testid="talos-theme-preview-poster"
                                class="absolute inset-0 h-full w-full object-cover"
                                :src="preset.poster"
                                alt=""
                                loading="lazy"
                            >
                            <span class="absolute inset-0 bg-gradient-to-t from-[var(--talos-background)]/70 via-transparent to-transparent"></span>
                            <span class="absolute bottom-2 left-2 right-2 grid h-3 grid-cols-4 gap-1">
                                <span class="rounded-sm" :style="{ background: preset.preview.background }"></span>
                                <span class="rounded-sm" :style="{ background: preset.preview.accent }"></span>
                                <span class="rounded-sm" :style="{ background: preset.preview.secondary }"></span>
                                <span class="rounded-sm" :style="{ background: preset.preview.line }"></span>
                            </span>
                        </span>
                        <span class="flex items-center justify-between gap-2">
                            <span class="font-semibold text-[var(--talos-text)]">{{ preset.label }}</span>
                            <span v-if="activeTheme === preset.id" class="rounded-sm bg-[var(--talos-accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--talos-accent-text)]">Active</span>
                        </span>
                        <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ preset.description }}</span>
                        <span class="mt-3 grid gap-1 text-[11px] text-[var(--talos-muted)]">
                            <span>Font: {{ preset.fontUi }}</span>
                            <span>Feel: {{ preset.mood }}</span>
                            <span>Motion: {{ preset.motion }}</span>
                        </span>
                        <span class="mt-3 flex flex-wrap gap-2">
                            <Badge tone="success">Procedural effect</Badge>
                            <Badge tone="neutral">{{ preset.defaultEffect }}</Badge>
                        </span>
                    </button>
                </div>
            </section>

            <section v-else-if="activeTab === 'customize'" aria-label="Theme customization" class="space-y-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h4 class="text-sm font-semibold text-[var(--talos-text)]">Workspace customization</h4>
                        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                            Draft edits preview immediately. Saving persists controlled TALOS tokens.
                        </p>
                    </div>
                    <Badge v-if="draftIsDirty" tone="warning">Unsaved changes</Badge>
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Accent color</span>
                        <Input v-model="customizationForm.accent" type="color" class="h-10 p-1" aria-label="Accent color" :disabled="themePolicyLocked" />
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Background color</span>
                        <Input v-model="customizationForm.background" type="color" class="h-10 p-1" aria-label="Background color" :disabled="themePolicyLocked" />
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Panel color</span>
                        <Input v-model="customizationForm.panel" type="color" class="h-10 p-1" aria-label="Panel color" :disabled="themePolicyLocked" />
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Text color</span>
                        <Input v-model="customizationForm.text" type="color" class="h-10 p-1" aria-label="Text color" :disabled="themePolicyLocked" />
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Secondary color</span>
                        <Input v-model="customizationForm.secondary" type="color" class="h-10 p-1" aria-label="Secondary color" :disabled="themePolicyLocked" />
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Border color</span>
                        <Input v-model="customizationForm.border" type="color" class="h-10 p-1" aria-label="Border color" :disabled="themePolicyLocked" />
                    </label>
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Background effect</span>
                        <Select v-model="customizationForm.effect" aria-label="Background effect" :disabled="themePolicyLocked">
                            <option v-for="effect in TALOS_BACKGROUND_EFFECTS" :key="effect.value" :value="effect.value">
                                {{ effect.label }}
                            </option>
                        </Select>
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Font</span>
                        <Select v-model="customizationForm.font" aria-label="Font" :disabled="themePolicyLocked">
                            <option v-for="font in TALOS_THEME_FONT_OPTIONS" :key="font.value" :value="font.value">
                                {{ font.label }}
                            </option>
                        </Select>
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Density</span>
                        <Select v-model="customizationForm.density" aria-label="Density" :disabled="themePolicyLocked">
                            <option v-for="density in TALOS_THEME_DENSITY_OPTIONS" :key="density.value" :value="density.value">
                                {{ density.label }}
                            </option>
                        </Select>
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Corner radius</span>
                        <Select v-model="customizationForm.radius" aria-label="Corner radius" :disabled="themePolicyLocked">
                            <option v-for="radius in TALOS_THEME_RADIUS_OPTIONS" :key="radius.value" :value="radius.value">
                                {{ radius.label }}
                            </option>
                        </Select>
                    </label>
                </div>

                <label class="space-y-2 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Effect intensity</span>
                    <Input
                        v-model.number="customizationForm.effect_intensity"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        aria-label="Effect intensity"
                        :disabled="themePolicyLocked"
                    />
                </label>

                <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                    <div class="text-sm font-semibold text-[var(--talos-text)]">Scrollbar tokens</div>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Applies to chat, settings, window bodies and long evidence panels.
                    </p>
                    <div class="mt-3 grid gap-3 sm:grid-cols-2">
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Scrollbar track</span>
                            <Input v-model="customizationForm.scrollbar_track" aria-label="Scrollbar track" placeholder="#071017" :disabled="themePolicyLocked" />
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Scrollbar thumb</span>
                            <Input v-model="customizationForm.scrollbar_thumb" aria-label="Scrollbar thumb" placeholder="#31d6c8" :disabled="themePolicyLocked" />
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Scrollbar hover</span>
                            <Input v-model="customizationForm.scrollbar_thumb_hover" aria-label="Scrollbar hover" placeholder="#b4f06f" :disabled="themePolicyLocked" />
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Scrollbar width</span>
                            <Input
                                v-model.number="customizationForm.scrollbar_width"
                                type="number"
                                min="6"
                                max="18"
                                step="1"
                                aria-label="Scrollbar width"
                                :disabled="themePolicyLocked"
                            />
                        </label>
                    </div>
                </div>

                <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h4 class="text-sm font-semibold text-[var(--talos-text)]">Interface motion</h4>
                            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                                Controls how TALOS panels, messages and command surfaces move. Reduced motion can still disable nonessential animation.
                            </p>
                        </div>
                        <Badge tone="neutral">{{ uiAnimationProfile }}</Badge>
                    </div>

                    <div class="mt-3 grid gap-3 md:grid-cols-3">
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Animation profile</span>
                            <Select v-model="uiAnimationProfile" aria-label="Animation profile" :disabled="themePolicyLocked">
                                <option v-for="profile in TALOS_UI_ANIMATION_PROFILE_OPTIONS" :key="profile.value" :value="profile.value">
                                    {{ profile.label }}
                                </option>
                            </Select>
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Open/close style</span>
                            <Select v-model="uiAnimationForm.open_close" aria-label="Open/close style" :disabled="themePolicyLocked || uiAnimationProfile !== 'custom'">
                                <option v-for="option in TALOS_UI_ANIMATION_OPEN_CLOSE_OPTIONS" :key="option.value" :value="option.value">
                                    {{ option.label }}
                                </option>
                            </Select>
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Surface transition</span>
                            <Select v-model="uiAnimationForm.surface_transition" aria-label="Surface transition" :disabled="themePolicyLocked || uiAnimationProfile !== 'custom'">
                                <option v-for="option in TALOS_UI_ANIMATION_SURFACE_OPTIONS" :key="option.value" :value="option.value">
                                    {{ option.label }}
                                </option>
                            </Select>
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Feedback style</span>
                            <Select v-model="uiAnimationForm.feedback" aria-label="Feedback style" :disabled="themePolicyLocked || uiAnimationProfile !== 'custom'">
                                <option v-for="option in TALOS_UI_ANIMATION_FEEDBACK_OPTIONS" :key="option.value" :value="option.value">
                                    {{ option.label }}
                                </option>
                            </Select>
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Hover/focus style</span>
                            <Select v-model="uiAnimationForm.hover" aria-label="Hover/focus style" :disabled="themePolicyLocked || uiAnimationProfile !== 'custom'">
                                <option v-for="option in TALOS_UI_ANIMATION_HOVER_OPTIONS" :key="option.value" :value="option.value">
                                    {{ option.label }}
                                </option>
                            </Select>
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Motion easing</span>
                            <Select v-model="uiAnimationForm.easing" aria-label="Motion easing" :disabled="themePolicyLocked || uiAnimationProfile !== 'custom'">
                                <option v-for="option in TALOS_UI_ANIMATION_EASING_OPTIONS" :key="option.value" :value="option.value">
                                    {{ option.label }}
                                </option>
                            </Select>
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Duration scale</span>
                            <Input
                                v-model.number="uiAnimationForm.duration_scale"
                                type="number"
                                min="50"
                                max="150"
                                step="1"
                                aria-label="Duration scale"
                                :disabled="themePolicyLocked || uiAnimationProfile !== 'custom'"
                            />
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Motion intensity</span>
                            <Input
                                v-model.number="uiAnimationForm.intensity"
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                aria-label="Motion intensity"
                                :disabled="themePolicyLocked || uiAnimationProfile !== 'custom'"
                            />
                        </label>
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Motion stagger</span>
                            <Input
                                v-model.number="uiAnimationForm.stagger"
                                type="number"
                                min="0"
                                max="120"
                                step="1"
                                aria-label="Motion stagger"
                                :disabled="themePolicyLocked || uiAnimationProfile !== 'custom'"
                            />
                        </label>
                    </div>

                    <div class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div
                            data-testid="talos-motion-preview-surface"
                            class="talos-motion-preview-surface rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3"
                            :data-preview-state="motionPreviewOpen ? 'open' : 'closed'"
                            :style="motionPreviewStyle"
                        >
                            <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Preview surface</div>
                            <div class="mt-2 text-sm font-semibold text-[var(--talos-text)]">Command panel transition</div>
                            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Uses the same action-motion tokens as TALOS windows and command surfaces.</p>
                        </div>
                        <Button type="button" variant="secondary" :disabled="themePolicyLocked" @click="previewMotion">Preview motion</Button>
                    </div>
                </div>

                <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                    <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Theme name</span>
                            <Input v-model="newThemeName" aria-label="Theme name" placeholder="Ninox Dark" :disabled="themePolicyLocked" />
                        </label>
                        <Button type="button" :disabled="savingSettings || themePolicyLocked" @click="saveAsNamedTheme">Create theme</Button>
                    </div>
                </div>

                <div class="flex flex-wrap gap-2">
                    <Button type="button" :disabled="savingSettings || themePolicyLocked" @click="saveCustomization">Save customization</Button>
                    <Button type="button" variant="secondary" :disabled="savingSettings || themePolicyLocked" @click="saveAsNamedTheme">Save as theme</Button>
                    <Button type="button" variant="ghost" :disabled="savingSettings || !draftIsDirty || themePolicyLocked" @click="discardChanges">Discard changes</Button>
                    <Button type="button" variant="outline" :disabled="savingSettings || themePolicyLocked" @click="resetCustomization">Reset to preset</Button>
                    <Button type="button" variant="outline" :disabled="savingSettings || themePolicyLocked" @click="resetCustomization">Reset customization</Button>
                </div>
            </section>

            <section v-else-if="activeTab === 'library'" aria-label="Custom theme library" class="space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h4 class="text-sm font-semibold text-[var(--talos-text)]">Custom theme library</h4>
                        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                            Saved themes are personal preference objects, not executable assets.
                        </p>
                    </div>
                    <Button type="button" variant="secondary" @click="exportActiveTheme">Export active theme</Button>
                </div>

                <div v-if="themeLibrary.length" class="space-y-2">
                    <article
                        v-for="themeItem in themeLibrary"
                        :key="themeItem.id"
                        class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
                    >
                        <div class="flex flex-wrap items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-2">
                                    <h5 class="font-semibold text-[var(--talos-text)]">{{ themeItem.name }}</h5>
                                    <Badge v-if="themeItem.id === activeCustomThemeId" tone="success">Active</Badge>
                                    <Badge tone="neutral">{{ themeItem.base_theme }}</Badge>
                                </div>
                                <p class="mt-1 text-xs text-[var(--talos-muted)]">{{ themeItem.id }}</p>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <Button size="sm" type="button" :disabled="themePolicyLocked" @click="applyNamedTheme(themeItem)">Apply</Button>
                                <Button size="sm" variant="ghost" type="button" :disabled="themePolicyLocked" @click="startRename(themeItem)">Rename</Button>
                                <Button size="sm" variant="ghost" type="button" :disabled="themePolicyLocked" @click="duplicateTheme(themeItem)">Duplicate</Button>
                                <Button size="sm" variant="destructive" type="button" :disabled="themePolicyLocked" @click="deleteTheme(themeItem)">Delete</Button>
                            </div>
                        </div>
                        <div v-if="renamingThemeId === themeItem.id" class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <Input v-model="renameThemeName" aria-label="Rename theme" :disabled="themePolicyLocked" />
                            <Button size="sm" type="button" :disabled="themePolicyLocked" @click="saveRename(themeItem)">Save name</Button>
                        </div>
                    </article>
                </div>
                <div v-else class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 text-sm text-[var(--talos-muted)]">
                    No custom themes saved yet.
                </div>

                <div class="grid gap-3 lg:grid-cols-2">
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Exported theme JSON</span>
                        <Textarea v-model="exportJson" data-testid="talos-theme-export-json" class="min-h-40 font-mono text-xs" readonly aria-label="Exported theme JSON" />
                    </label>
                    <div class="space-y-2">
                        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                            <span>Import theme JSON</span>
                            <Textarea v-model="importJson" class="min-h-40 font-mono text-xs" aria-label="Import theme JSON" :disabled="themePolicyLocked" />
                        </label>
                        <Button type="button" :disabled="savingSettings || themePolicyLocked" @click="importTheme">Import theme</Button>
                    </div>
                </div>
            </section>

            <section v-else-if="activeTab === 'motion'" aria-label="Motion controls" class="space-y-4">
                <div>
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">Motion controls</h4>
                    <div class="mt-1 flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                        <p>
                            Motion mode controls procedural intensity without loading video backgrounds.
                        </p>
                        <InfoPopover label="Motion and background policy">
                            Disable motion freezes the selected procedural scene. Disable procedural background removes the scene entirely.
                        </InfoPopover>
                    </div>
                </div>
                <div class="grid gap-3 md:grid-cols-2">
                    <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                        <span>
                            <span class="block text-sm font-semibold text-[var(--talos-text)]">Use simple animation</span>
                            <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Default optimized canvas profile for slower devices and long sessions.</span>
                        </span>
                        <Switch
                            v-model="simpleAnimation"
                            class="mt-1"
                            aria-label="Use simple animation"
                            :disabled="savingSettings || themePolicyLocked"
                            @change="persistSimpleAnimation"
                        />
                    </label>
                    <div v-if="!simpleAnimation" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-3 text-xs leading-5 text-[var(--talos-text)]">
                        Rich animation raises frame rate, DPR and effect complexity. It can slow lower-end devices.
                    </div>
                    <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                        <span>
                            <span class="block text-sm font-semibold text-[var(--talos-text)]">Disable motion</span>
                            <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Keep the selected background visible, but freeze canvas and DOM animation.</span>
                        </span>
                        <Switch
                            v-model="motionDisabled"
                            class="mt-1"
                            aria-label="Disable motion"
                            :disabled="savingSettings || themePolicyLocked"
                            @change="persistMotionDisabled"
                        />
                    </label>
                    <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                        <span>
                            <span class="block text-sm font-semibold text-[var(--talos-text)]">Disable procedural background</span>
                            <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Remove canvas, grids, trace streams and procedural layers from the workspace.</span>
                        </span>
                        <Switch
                            v-model="backgroundDisabled"
                            class="mt-1"
                            aria-label="Disable procedural background"
                            :disabled="savingSettings || themePolicyLocked"
                            @change="persistBackgroundDisabled"
                        />
                    </label>
                </div>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Theme motion</span>
                    <Select v-model="motionMode" aria-label="Theme motion" :disabled="themePolicyLocked" @change="persistMotionMode">
                        <option v-for="mode in TALOS_THEME_MOTION_OPTIONS" :key="mode.value" :value="mode.value">
                            {{ mode.label }}
                        </option>
                    </Select>
                </label>
                <div class="grid gap-2 md:grid-cols-2">
                    <article v-for="mode in TALOS_THEME_MOTION_OPTIONS" :key="mode.value" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                        <div class="text-sm font-semibold text-[var(--talos-text)]">{{ mode.label }}</div>
                        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ mode.description }}</p>
                    </article>
                </div>
            </section>

            <section v-else aria-label="Advanced theme tokens" class="space-y-4">
                <div>
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">Advanced area tokens</h4>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Override specific interface zones through explicit, safe CSS variables.
                    </p>
                </div>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Area</span>
                    <Select v-model="selectedArea" aria-label="Area" :disabled="themePolicyLocked">
                        <option v-for="area in TALOS_THEME_AREA_OPTIONS" :key="area.value" :value="area.value">
                            {{ area.label }}
                        </option>
                    </Select>
                </label>
                <div class="grid gap-3 sm:grid-cols-2">
                    <label v-for="token in TALOS_THEME_AREA_TOKEN_OPTIONS" :key="token.value" class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>{{ token.label }}</span>
                        <Input
                            v-model="areaTokenForm[token.value]"
                            placeholder="#111827"
                            :aria-label="`Area ${token.value}`"
                            :disabled="themePolicyLocked"
                        />
                    </label>
                </div>
                <div class="flex flex-wrap gap-2">
                    <Button type="button" :disabled="savingSettings || !hasAreaDraft || themePolicyLocked" @click="saveAreaTokens">Save area tokens</Button>
                    <Button type="button" variant="outline" :disabled="savingSettings || themePolicyLocked" @click="resetAreaTokens">Reset area</Button>
                </div>
            </section>
        </div>
    </Card>
</template>
