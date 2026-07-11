<script setup lang="ts">
import Badge from '../../../ui/Badge.vue'
import Select from '../../../ui/Select.vue'
import {
    TALOS_THEME_MODE_OPTIONS,
    type TalosThemeId,
    type TalosThemeMode,
    type TalosThemePreset,
} from '../../../../lib/talosThemes'

defineProps<{
    theme: TalosThemeId
    themeMode: TalosThemeMode
    presets: readonly TalosThemePreset[]
    disabled: boolean
    saving: boolean
}>()

const emit = defineEmits<{
    'update:themeMode': [value: TalosThemeMode]
    'select-theme': [value: TalosThemeId]
}>()
</script>

<template>
    <section
        id="talos-theme-control-panel-presets"
        role="tabpanel"
        aria-labelledby="talos-theme-control-tab-presets"
        aria-label="Theme presets"
        class="space-y-4"
    >
        <div class="grid gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 md:grid-cols-[minmax(0,240px)_1fr]">
            <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>Color mode</span>
                <Select
                    :model-value="themeMode"
                    aria-label="Theme color mode"
                    :disabled="disabled || saving"
                    @update:model-value="emit('update:themeMode', $event as TalosThemeMode)"
                >
                    <option v-for="mode in TALOS_THEME_MODE_OPTIONS" :key="mode.value" :value="mode.value">
                        {{ mode.label }}
                    </option>
                </Select>
            </label>
            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-xs leading-5 text-[var(--talos-muted)]">
                Every preset has an explicit light and dark runtime variant. System follows the OS preference; Light and Dark force the selected variant.
            </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button
                v-for="preset in presets"
                :key="preset.id"
                type="button"
                data-testid="talos-theme-preset"
                class="talos-theme-preset-card rounded-md border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="theme === preset.id ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)]' : 'border-[var(--talos-border)] bg-[var(--talos-panel-soft)] hover:border-[var(--talos-accent-border)]'"
                :aria-label="preset.label"
                :disabled="disabled || saving"
                @click="emit('select-theme', preset.id)"
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
                    <span v-if="theme === preset.id" class="rounded-sm bg-[var(--talos-accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--talos-accent-text)]">Active</span>
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
</template>
