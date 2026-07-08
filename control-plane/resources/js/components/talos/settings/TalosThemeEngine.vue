<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Badge from '../../ui/Badge.vue'
import Card from '../../ui/Card.vue'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import {
    TALOS_BACKGROUND_EFFECTS,
    TALOS_THEME_DENSITY_OPTIONS,
    TALOS_THEME_FONT_OPTIONS,
    TALOS_THEME_PRESETS,
    TALOS_THEME_RADIUS_OPTIONS,
    normalizeTalosTheme,
    sanitizeTalosThemeCustomization,
    talosThemePreset,
    type TalosBackgroundEffect,
    type TalosThemeCustomization,
    type TalosThemeDensity,
    type TalosThemeFont,
    type TalosThemeId,
    type TalosThemeRadius,
} from '../../../lib/talosThemes'

const props = defineProps<{
    theme: TalosThemeId
}>()

const emit = defineEmits<{
    changeTheme: [theme: TalosThemeId, persist?: boolean]
    themeCustomizationChanged: []
}>()

type ThemeTab = 'presets' | 'customize'

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

const activeTheme = computed(() => {
    const storedTheme = settings.value?.preferences?.theme
    return normalizeTalosTheme(storedTheme ?? props.theme)
})

const activePreset = computed(() => talosThemePreset(activeTheme.value))

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

function themeFontDefault(theme: TalosThemeId): TalosThemeFont {
    if (theme === 'terminal' || theme === 'noir') {
        return 'mono'
    }

    if (theme === 'violet' || theme === 'aurora') {
        return 'display'
    }

    return 'inter'
}

function formFromCurrentSettings(): ThemeCustomizationForm {
    const preset = activePreset.value
    const customization = sanitizeTalosThemeCustomization(settings.value?.preferences?.theme_customization)

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

function syncCustomizationForm() {
    customizationForm.value = formFromCurrentSettings()
}

function activateTab(tab: ThemeTab) {
    activeTab.value = tab

    if (tab === 'customize') {
        syncCustomizationForm()
    }
}

async function chooseTheme(theme: TalosThemeId) {
    emit('changeTheme', theme, false)
    await updateSettings({
        preferences: {
            ...(settings.value?.preferences ?? {}),
            theme,
        },
    }, 'Theme saved through /api/talos/settings.')
    syncCustomizationForm()
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
    const themeCustomization = sanitizedForm()
    await updateSettings({
        preferences: {
            ...(settings.value?.preferences ?? {}),
            theme_customization: themeCustomization,
        },
    }, 'Theme customization saved through /api/talos/settings.')
    syncCustomizationForm()
    emit('themeCustomizationChanged')
}

async function resetCustomization() {
    await updateSettings({
        preferences: {
            ...(settings.value?.preferences ?? {}),
            theme_customization: {},
        },
    }, 'Theme customization reset.')
    syncCustomizationForm()
    emit('themeCustomizationChanged')
}

onMounted(async () => {
    const loaded = await loadSettings().catch(() => null)
    const theme = loaded?.preferences?.theme
    if (theme) {
        emit('changeTheme', normalizeTalosTheme(theme), false)
    }
    syncCustomizationForm()
})
</script>

<template>
    <Card>
        <div class="flex flex-col gap-4">
            <div>
                <h3 class="text-base font-semibold text-[var(--talos-text)]">Theme Engine</h3>
                <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                    Presets and personal overrides are persisted through the TALOS settings API.
                </p>
            </div>

            <div v-if="settingsError" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                {{ settingsError }}
            </div>
            <div v-if="settingsSavedMessage" class="rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                {{ settingsSavedMessage }}
            </div>

            <div role="tablist" aria-label="Theme controls" class="grid grid-cols-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-1 text-sm">
                <button
                    type="button"
                    role="tab"
                    :aria-selected="activeTab === 'presets' ? 'true' : 'false'"
                    class="rounded-sm px-3 py-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    :class="activeTab === 'presets' ? 'bg-[var(--talos-accent)] text-[var(--talos-accent-text)]' : 'text-[var(--talos-muted)] hover:text-[var(--talos-text)]'"
                    @click="activateTab('presets')"
                >
                    Presets
                </button>
                <button
                    type="button"
                    role="tab"
                    :aria-selected="activeTab === 'customize' ? 'true' : 'false'"
                    class="rounded-sm px-3 py-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    :class="activeTab === 'customize' ? 'bg-[var(--talos-accent)] text-[var(--talos-accent-text)]' : 'text-[var(--talos-muted)] hover:text-[var(--talos-text)]'"
                    @click="activateTab('customize')"
                >
                    Customize
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
                        @click="chooseTheme(preset.id)"
                    >
                        <span
                            data-testid="talos-theme-preview-swatch"
                            class="mb-3 grid h-20 grid-cols-[1fr_1fr] overflow-hidden rounded-md border"
                            :style="{
                                borderColor: preset.preview.line,
                                background: preset.preview.background,
                            }"
                            aria-hidden="true"
                        >
                            <span class="m-2 rounded-sm" :style="{ background: preset.preview.accent }"></span>
                            <span class="m-2 rounded-sm" :style="{ background: preset.preview.secondary }"></span>
                            <span class="col-span-2 border-t" :style="{ borderColor: preset.preview.line }"></span>
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

            <section v-else aria-label="Theme customization" class="space-y-4">
                <div>
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">Workspace customization</h4>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        Override the active preset with controlled TALOS tokens.
                    </p>
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Accent color</span>
                        <input v-model="customizationForm.accent" type="color" class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-1" aria-label="Accent color">
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Background color</span>
                        <input v-model="customizationForm.background" type="color" class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-1" aria-label="Background color">
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Panel color</span>
                        <input v-model="customizationForm.panel" type="color" class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-1" aria-label="Panel color">
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Text color</span>
                        <input v-model="customizationForm.text" type="color" class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-1" aria-label="Text color">
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Secondary color</span>
                        <input v-model="customizationForm.secondary" type="color" class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-1" aria-label="Secondary color">
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Border color</span>
                        <input v-model="customizationForm.border" type="color" class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-1" aria-label="Border color">
                    </label>
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Background effect</span>
                        <select v-model="customizationForm.effect" class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)]" aria-label="Background effect">
                            <option v-for="effect in TALOS_BACKGROUND_EFFECTS" :key="effect.value" :value="effect.value">
                                {{ effect.label }}
                            </option>
                        </select>
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Font</span>
                        <select v-model="customizationForm.font" class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)]" aria-label="Font">
                            <option v-for="font in TALOS_THEME_FONT_OPTIONS" :key="font.value" :value="font.value">
                                {{ font.label }}
                            </option>
                        </select>
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Density</span>
                        <select v-model="customizationForm.density" class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)]" aria-label="Density">
                            <option v-for="density in TALOS_THEME_DENSITY_OPTIONS" :key="density.value" :value="density.value">
                                {{ density.label }}
                            </option>
                        </select>
                    </label>
                    <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                        <span>Corner radius</span>
                        <select v-model="customizationForm.radius" class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)]" aria-label="Corner radius">
                            <option v-for="radius in TALOS_THEME_RADIUS_OPTIONS" :key="radius.value" :value="radius.value">
                                {{ radius.label }}
                            </option>
                        </select>
                    </label>
                </div>

                <label class="space-y-2 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Effect intensity</span>
                    <input
                        v-model.number="customizationForm.effect_intensity"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)]"
                        aria-label="Effect intensity"
                    >
                </label>

                <div class="flex flex-wrap gap-2">
                    <button
                        type="button"
                        class="inline-flex h-9 items-center rounded-md bg-[var(--talos-accent)] px-3 text-sm font-semibold text-[var(--talos-accent-text)] transition hover:bg-[var(--talos-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="savingSettings"
                        @click="saveCustomization"
                    >
                        Save customization
                    </button>
                    <button
                        type="button"
                        class="inline-flex h-9 items-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm font-medium text-[var(--talos-text)] transition hover:border-[var(--talos-accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="savingSettings"
                        @click="resetCustomization"
                    >
                        Reset customization
                    </button>
                </div>
            </section>
        </div>
    </Card>
</template>
