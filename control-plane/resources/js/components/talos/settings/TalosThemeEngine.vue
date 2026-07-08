<script setup lang="ts">
import { computed, onMounted } from 'vue'
import Badge from '../../ui/Badge.vue'
import Card from '../../ui/Card.vue'
import { useTalosSettings } from '../../../composables/useTalosSettings'
import {
    TALOS_THEME_PRESETS,
    normalizeTalosTheme,
    type TalosThemeId,
} from '../../../lib/talosThemes'

const props = defineProps<{
    theme: TalosThemeId
}>()

const emit = defineEmits<{
    changeTheme: [theme: TalosThemeId, persist?: boolean]
}>()

const {
    settings,
    settingsError,
    settingsSavedMessage,
    loadSettings,
    updateSettings,
} = useTalosSettings()

const activeTheme = computed(() => {
    const storedTheme = settings.value?.preferences?.theme
    return normalizeTalosTheme(storedTheme ?? props.theme)
})
const previewReducedMotion = computed(() => settings.value?.preferences?.reduced_motion === true)

async function chooseTheme(theme: TalosThemeId) {
    emit('changeTheme', theme, false)
    await updateSettings({
        preferences: {
            ...(settings.value?.preferences ?? {}),
            theme,
        },
    }, 'Theme saved through /api/talos/settings.')
}

function playPreviewVideo(event: Event) {
    if (previewReducedMotion.value || !(event.target instanceof HTMLVideoElement)) {
        return
    }

    event.target.play().catch(() => {
        // Browser autoplay policy can still reject media; poster remains the fallback.
    })
}

onMounted(async () => {
    const loaded = await loadSettings().catch(() => null)
    const theme = loaded?.preferences?.theme
    if (theme) {
        emit('changeTheme', normalizeTalosTheme(theme), false)
    }
})
</script>

<template>
    <Card>
        <h3 class="text-base font-semibold text-[var(--talos-text)]">Theme Engine</h3>
        <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
            Presets change palette, typography, density, radius and workspace motion through the TALOS settings API.
        </p>

        <div v-if="settingsError" class="mt-3 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            {{ settingsError }}
        </div>
        <div v-if="settingsSavedMessage" class="mt-3 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            {{ settingsSavedMessage }}
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                    class="mb-3 block h-20 overflow-hidden rounded-md border bg-[var(--talos-background)]"
                    :style="{
                        borderColor: preset.preview.line,
                        background: preset.preview.background,
                    }"
                    aria-hidden="true"
                >
                    <video
                        v-if="preset.background"
                        data-testid="talos-theme-preview-video"
                        class="h-full w-full object-cover"
                        :poster="preset.background.poster"
                        :autoplay="!previewReducedMotion"
                        muted
                        loop
                        playsinline
                        preload="metadata"
                        @canplay="playPreviewVideo"
                        @loadedmetadata="playPreviewVideo"
                    >
                        <source :src="preset.background.webm" type="video/webm">
                        <source :src="preset.background.mp4" type="video/mp4">
                    </video>
                    <span v-else class="grid h-full grid-cols-[1fr_1fr]">
                        <span class="m-2 rounded-sm" :style="{ background: preset.preview.accent }"></span>
                        <span class="m-2 rounded-sm" :style="{ background: preset.preview.secondary }"></span>
                        <span class="col-span-2 border-t" :style="{ borderColor: preset.preview.line }"></span>
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
                    <Badge :tone="preset.background ? 'success' : 'neutral'">
                        {{ preset.background ? 'Animated background' : 'Static fallback' }}
                    </Badge>
                </span>
            </button>
        </div>
    </Card>
</template>
