<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import Input from '../../ui/Input.vue'
import Select from '../../ui/Select.vue'
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
    buildTalosThemeExport,
    normalizeTalosTheme,
    parseTalosThemeExport,
    resolveTalosMotionMode,
    sanitizeTalosNamedTheme,
    sanitizeTalosThemeAreaTokens,
    sanitizeTalosThemeCustomization,
    sanitizeTalosThemeLibrary,
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
} from '../../../lib/talosThemes'

const props = defineProps<{
    theme: TalosThemeId
}>()

const emit = defineEmits<{
    changeTheme: [theme: TalosThemeId, persist?: boolean]
    themeCustomizationChanged: []
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
const draftIsDirty = computed(() => JSON.stringify(customizationForm.value) !== JSON.stringify(formFromCurrentSettings()))
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
    }
}

function formFromCurrentSettings(): ThemeCustomizationForm {
    return formFromCustomization(savedCustomization.value)
}

function syncCustomizationForm() {
    syncingForm.value = true
    customizationForm.value = formFromCurrentSettings()
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
    await updateSettings({
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
    emit('themeCustomizationChanged')
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
    })
}

async function saveCustomization() {
    if (!canWriteTheme()) {
        return
    }

    const themeCustomization = sanitizedForm()
    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_customization: themeCustomization,
            active_custom_theme_id: activeCustomThemeId.value,
        },
    }, 'Theme customization saved through /api/talos/settings.')
    emit('themeDraftChanged', null)
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged')
}

function discardChanges() {
    syncCustomizationForm()
    emit('themeDraftChanged', null)
}

async function resetCustomization() {
    if (!canWriteTheme()) {
        return
    }

    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_customization: {},
            active_custom_theme_id: null,
        },
    }, 'Theme customization reset.')
    emit('themeDraftChanged', null)
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged')
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

    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme: theme.base_theme,
            workspace_default_theme: theme.base_theme,
            theme_customization: theme.tokens,
            theme_library: nextLibrary,
            active_custom_theme_id: theme.id,
            theme_area_tokens: theme.area_tokens ?? {},
            theme_motion: theme.motion ?? 'system',
        },
    }, 'Custom theme saved through /api/talos/settings.')
    activeTab.value = 'library'
    newThemeName.value = ''
    emit('themeDraftChanged', null)
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged')
}

async function applyNamedTheme(theme: TalosNamedTheme) {
    if (!canWriteTheme()) {
        return
    }

    emit('themeDraftChanged', null)
    emit('changeTheme', theme.base_theme, false)
    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme: theme.base_theme,
            workspace_default_theme: theme.base_theme,
            theme_customization: theme.tokens,
            theme_area_tokens: theme.area_tokens ?? {},
            theme_motion: theme.motion ?? 'system',
            active_custom_theme_id: theme.id,
        },
    }, 'Custom theme applied.')
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged')
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
    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme: theme.base_theme,
            workspace_default_theme: theme.base_theme,
            theme_customization: theme.tokens,
            theme_library: nextLibrary,
            active_custom_theme_id: theme.id,
            theme_area_tokens: theme.area_tokens ?? {},
            theme_motion: theme.motion ?? 'system',
        },
    }, 'Theme imported.')
    importJson.value = ''
    activeTab.value = 'library'
    emit('changeTheme', theme.base_theme, false)
    emit('themeDraftChanged', null)
    syncThemeState()
    syncCustomizationForm()
    emit('themeCustomizationChanged')
}

async function persistMotionMode() {
    if (!canWriteTheme()) {
        return
    }

    const mode = resolveTalosMotionMode(motionMode.value)
    motionMode.value = mode
    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_motion: mode,
        },
    }, 'Theme motion saved.')
    syncThemeState()
    emit('themeCustomizationChanged')
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

    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_area_tokens: nextTokens,
        },
    }, 'Area tokens saved.')
    areaTokens.value = nextTokens
    syncAreaForm()
    emit('themeCustomizationChanged')
}

async function resetAreaTokens() {
    if (!canWriteTheme()) {
        return
    }

    const nextTokens = { ...sanitizeTalosThemeAreaTokens(areaTokens.value) }
    delete nextTokens[selectedArea.value]
    await updateSettings({
        preferences: {
            ...preferencesRecord(),
            theme_area_tokens: nextTokens,
        },
    }, 'Area tokens reset.')
    areaTokens.value = nextTokens
    syncAreaForm()
    emit('themeCustomizationChanged')
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
                        class="rounded-md border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
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
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Motion mode controls procedural intensity without loading video backgrounds.
                    </p>
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
