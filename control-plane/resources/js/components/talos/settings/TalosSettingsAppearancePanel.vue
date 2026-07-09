<script setup lang="ts">
import Select from '../../ui/Select.vue'
import Switch from '../../ui/Switch.vue'
import { TALOS_THEME_MOTION_OPTIONS, TALOS_THEME_PRESETS, type TalosThemeId, type TalosThemeMotionMode } from '../../../lib/talosThemes'

type AppearancePreferences = {
    session_header: boolean
    welcome_message: boolean
    thinking_process: boolean
    sensitive_blur: boolean
    compact_sidebar: boolean
}

defineProps<{
    theme: TalosThemeId
    themeMotion: TalosThemeMotionMode
    themeMotionDisabled: boolean
    themeBackgroundDisabled: boolean
    appearance: AppearancePreferences
    appearanceOptions: Array<{ key: keyof AppearancePreferences; label: string }>
}>()

const emit = defineEmits<{
    updateTheme: [theme: TalosThemeId]
    updateThemeMotion: [mode: TalosThemeMotionMode]
    updateThemeMotionDisabled: [disabled: boolean]
    updateThemeBackgroundDisabled: [disabled: boolean]
    updateAppearance: [key: keyof AppearancePreferences, enabled: boolean]
}>()

function selectTheme(value: unknown) {
    emit('updateTheme', value as TalosThemeId)
}

function selectThemeMotion(value: unknown) {
    emit('updateThemeMotion', value as TalosThemeMotionMode)
}
</script>

<template>
    <div class="grid gap-3 md:grid-cols-2">
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Theme preset</span>
            <Select :model-value="theme" class="mt-2" aria-label="Theme preset" @update:model-value="selectTheme">
                <option v-for="preset in TALOS_THEME_PRESETS" :key="preset.id" :value="preset.id">
                    {{ preset.label }}
                </option>
            </Select>
        </label>
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-xs leading-5 text-[var(--talos-muted)]">
            Theme selection updates the same preference used by Theme Engine.
        </div>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Motion mode</span>
            <Select :model-value="themeMotion" class="mt-2" aria-label="Settings theme motion" @update:model-value="selectThemeMotion">
                <option v-for="mode in TALOS_THEME_MOTION_OPTIONS" :key="mode.value" :value="mode.value">
                    {{ mode.label }}
                </option>
            </Select>
        </label>
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-xs leading-5 text-[var(--talos-muted)]">
            Motion mode controls procedural effects only; TALOS does not load theme videos.
        </div>
    </div>
    <div class="grid gap-2 md:grid-cols-2">
        <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">Disable motion</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Freeze the selected procedural background without removing it.</span>
            </span>
            <Switch :model-value="themeMotionDisabled" class="mt-1" aria-label="Settings disable motion" @update:model-value="(value) => emit('updateThemeMotionDisabled', Boolean(value))" />
        </label>
        <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">Disable procedural background</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Remove the animated and static procedural background layers.</span>
            </span>
            <Switch :model-value="themeBackgroundDisabled" class="mt-1" aria-label="Settings disable procedural background" @update:model-value="(value) => emit('updateThemeBackgroundDisabled', Boolean(value))" />
        </label>
    </div>
    <div class="grid gap-2 md:grid-cols-2">
        <label v-for="item in appearanceOptions" :key="item.key" class="flex cursor-pointer items-center justify-between rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            <span>{{ item.label }}</span>
            <Switch :model-value="appearance[item.key]" :aria-label="item.label" @update:model-value="(value) => emit('updateAppearance', item.key, Boolean(value))" />
        </label>
    </div>
</template>
