<script setup lang="ts">
import { computed, ref } from 'vue'
import Select from '../../ui/Select.vue'
import Switch from '../../ui/Switch.vue'
import {
    TALOS_THEME_MODE_OPTIONS,
    TALOS_THEME_MOTION_OPTIONS,
    TALOS_THEME_PRESETS,
    type TalosThemeId,
    type TalosThemeMode,
    type TalosThemeMotionMode,
} from '../../../lib/talosThemes'
import Button from '../../ui/Button.vue'
import type { TalosAppearanceGroup, TalosAppearanceVisibility } from '../../../lib/talosAppearancePreferences'

const emit = defineEmits<{
    updateTheme: [theme: TalosThemeId]
    updateThemeMode: [mode: TalosThemeMode]
    updateThemeMotion: [mode: TalosThemeMotionMode]
    updateThemeMotionDisabled: [disabled: boolean]
    updateThemeSimpleAnimation: [enabled: boolean]
    updateThemeBackgroundDisabled: [disabled: boolean]
    updateAppearance: [group: TalosAppearanceGroup, key: string, enabled: boolean]
    resetAppearanceGroup: [group: TalosAppearanceGroup]
    resetAllAppearance: []
}>()

const activePane = ref<'design' | 'motion' | 'visibility'>('design')
const panes = [
    { id: 'design', label: 'Design' },
    { id: 'motion', label: 'Motion' },
    { id: 'visibility', label: 'Visibility' },
] as const
const props = defineProps<{
    theme: TalosThemeId
    themeMode: TalosThemeMode
    themeMotion: TalosThemeMotionMode
    themeMotionDisabled: boolean
    themeSimpleAnimation: boolean
    themeBackgroundDisabled: boolean
    appearanceVisibility: TalosAppearanceVisibility
    appearanceGroups: Array<{
        id: TalosAppearanceGroup
        label: string
        description: string
        items: Array<{ key: string; label: string }>
    }>
}>()
const activePreset = computed(() => TALOS_THEME_PRESETS.find((preset) => preset.id === props.theme) ?? TALOS_THEME_PRESETS[0])

function selectTheme(value: unknown) {
    emit('updateTheme', value as TalosThemeId)
}

function selectThemeMode(value: unknown) {
    emit('updateThemeMode', value as TalosThemeMode)
}

function selectThemeMotion(value: unknown) {
    emit('updateThemeMotion', value as TalosThemeMotionMode)
}
</script>

<template>
    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-2">
        <div role="tablist" aria-label="Appearance sections" class="grid grid-cols-3 gap-1">
            <button
                v-for="pane in panes"
                :key="pane.id"
                type="button"
                role="tab"
                class="rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="activePane === pane.id ? 'bg-[var(--talos-accent)] text-[var(--talos-accent-text)]' : 'text-[var(--talos-muted)] hover:bg-[var(--talos-panel)] hover:text-[var(--talos-text)]'"
                :aria-selected="activePane === pane.id"
                @click="activePane = pane.id"
            >
                {{ pane.label }}
            </button>
        </div>
    </div>

    <div v-if="activePane === 'design'" class="grid gap-3 md:grid-cols-2">
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Theme preset</span>
            <Select :model-value="theme" class="mt-2" aria-label="Theme preset" @update:model-value="selectTheme">
                <option v-for="preset in TALOS_THEME_PRESETS" :key="preset.id" :value="preset.id">
                    {{ preset.label }}
                </option>
            </Select>
        </label>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Color mode</span>
            <Select :model-value="themeMode" class="mt-2" aria-label="Theme color mode" @update:model-value="selectThemeMode">
                <option v-for="mode in TALOS_THEME_MODE_OPTIONS" :key="mode.value" :value="mode.value">
                    {{ mode.label }}
                </option>
            </Select>
        </label>
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-xs leading-5 text-[var(--talos-muted)]">
            <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ activePreset.label }}</span>
            <span class="mt-1 block">{{ activePreset.description }}</span>
            <span class="mt-2 block font-mono text-[11px]">{{ activePreset.mood }}</span>
        </div>
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-xs leading-5 text-[var(--talos-muted)]">
            {{ TALOS_THEME_MODE_OPTIONS.find((mode) => mode.value === themeMode)?.description }}
        </div>
    </div>

    <div v-else-if="activePane === 'motion'" class="space-y-3">
        <div class="grid gap-3 md:grid-cols-2">
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
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">Use simple animation</span>
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Default optimized canvas profile for slower devices.</span>
                </span>
                <Switch :model-value="themeSimpleAnimation" class="mt-1" aria-label="Settings use simple animation" @update:model-value="(value) => emit('updateThemeSimpleAnimation', Boolean(value))" />
            </label>
            <div v-if="!themeSimpleAnimation" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-3 text-xs leading-5 text-[var(--talos-text)]">
                Rich animation raises frame rate, DPR and effect complexity. It can slow lower-end devices during long sessions.
            </div>
            <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <span>
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">Disable background motion</span>
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Freeze the selected procedural background without removing it.</span>
                </span>
                <Switch :model-value="themeMotionDisabled" class="mt-1" aria-label="Settings disable background motion" @update:model-value="(value) => emit('updateThemeMotionDisabled', Boolean(value))" />
            </label>
            <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <span>
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">Disable procedural background</span>
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Remove the animated and static procedural background layers.</span>
                </span>
                <Switch :model-value="themeBackgroundDisabled" class="mt-1" aria-label="Settings disable procedural background" @update:model-value="(value) => emit('updateThemeBackgroundDisabled', Boolean(value))" />
            </label>
        </div>
    </div>

    <div v-else class="space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h4 class="text-sm font-semibold text-[var(--talos-text)]">Interface visibility</h4>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    Hide visible controls without removing their command routes. Backend stores only allowlisted boolean preferences.
                </p>
            </div>
            <Button type="button" size="sm" variant="secondary" @click="emit('resetAllAppearance')">Reset all</Button>
        </div>
        <section
            v-for="group in appearanceGroups"
            :key="group.id"
            class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
        >
            <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h5 class="text-sm font-semibold text-[var(--talos-text)]">{{ group.label }}</h5>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ group.description }}</p>
                </div>
                <Button type="button" size="sm" variant="ghost" @click="emit('resetAppearanceGroup', group.id)">Reset group</Button>
            </div>
            <div class="grid gap-2 md:grid-cols-2">
                <label
                    v-for="item in group.items"
                    :key="`${group.id}-${item.key}`"
                    class="flex cursor-pointer items-center justify-between rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-sm text-[var(--talos-text)]"
                >
                    <span>{{ item.label }}</span>
                    <Switch
                        :model-value="Boolean((appearanceVisibility[group.id] as Record<string, boolean>)[item.key])"
                        :aria-label="item.label"
                        @update:model-value="(value) => emit('updateAppearance', group.id, item.key, Boolean(value))"
                    />
                </label>
            </div>
        </section>
    </div>
</template>
