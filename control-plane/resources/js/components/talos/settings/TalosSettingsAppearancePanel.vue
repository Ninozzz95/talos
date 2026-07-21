<script setup lang="ts">
import { computed, ref } from 'vue'
import TalosThemedSelect from '../ui/TalosThemedSelect.vue'
import Switch from '../../ui/Switch.vue'
import {
    TALOS_THEME_MODE_OPTIONS,
    TALOS_THEME_PRESETS,
    type TalosThemeId,
    type TalosThemeMode,
} from '../../../lib/talosThemes'
import Button from '../../ui/Button.vue'
import Tabs from '../../ui/Tabs.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import type { TalosAppearanceGroup, TalosAppearanceVisibility } from '../../../lib/talosAppearancePreferences'
import {
    TALOS_CHAT_BUBBLE_SCALE_OPTIONS,
    TALOS_CHAT_COMPOSER_MODE_OPTIONS,
    TALOS_CHAT_MESSAGE_STYLE_OPTIONS,
    TALOS_MOBILE_WINDOW_PRESENTATION_OPTIONS,
} from '../../../lib/talosChatLayout'
import type {
    TalosChatBubbleScale,
    TalosChatLayoutPreferences,
    TalosComposerMode,
    TalosMessageStyle,
    TalosMobileWindowPresentation,
} from '../../../lib/talosTypes'

const emit = defineEmits<{
    updateTheme: [theme: TalosThemeId]
    updateThemeMode: [mode: TalosThemeMode]
    openThemeEngine: []
    updateChatBubbleScale: [scale: TalosChatBubbleScale]
    updateChatComposerMode: [mode: TalosComposerMode]
    updateChatMessageStyle: [style: TalosMessageStyle]
    updateAdvancedRailExpanded: [expanded: boolean]
    updateMobileWindowPresentation: [presentation: TalosMobileWindowPresentation]
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
    chatLayout: TalosChatLayoutPreferences
    themePolicyLocked: boolean
    appearanceVisibility: TalosAppearanceVisibility
    appearanceGroups: Array<{
        id: TalosAppearanceGroup
        label: string
        description: string
        items: Array<{ key: string; label: string }>
    }>
}>()
const activePreset = computed(() => TALOS_THEME_PRESETS.find((preset) => preset.id === props.theme) ?? TALOS_THEME_PRESETS[0])
const themePresetOptions = computed(() => TALOS_THEME_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })))

function selectTheme(value: unknown) {
    emit('updateTheme', value as TalosThemeId)
}

function selectThemeMode(value: unknown) {
    emit('updateThemeMode', value as TalosThemeMode)
}

</script>

<template>
    <Tabs
        v-model="activePane"
        :items="panes"
        label="Appearance sections"
        tab-id-prefix="talos-appearance-tab"
        panel-id-prefix="talos-appearance-panel"
    />

    <div
        v-if="activePane === 'design'"
        id="talos-appearance-panel-design"
        role="tabpanel"
        aria-labelledby="talos-appearance-tab-design"
        class="grid gap-3 md:grid-cols-2"
    >
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Theme preset</span>
            <TalosThemedSelect :model-value="theme" class="mt-2" :items="themePresetOptions" aria-label="Theme preset" @update:model-value="selectTheme" />
        </label>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Chat message size</span>
            <TalosThemedSelect
                :model-value="chatLayout.bubble_scale"
                class="mt-2"
                :items="TALOS_CHAT_BUBBLE_SCALE_OPTIONS"
                aria-label="Chat message size"
                :disabled="themePolicyLocked"
                @update:model-value="(value) => emit('updateChatBubbleScale', value as TalosChatBubbleScale)"
            />
        </label>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Chat composer</span>
            <TalosThemedSelect
                :model-value="chatLayout.composer_mode"
                class="mt-2"
                :items="TALOS_CHAT_COMPOSER_MODE_OPTIONS"
                aria-label="Chat composer mode"
                :disabled="themePolicyLocked"
                @update:model-value="(value) => emit('updateChatComposerMode', value as TalosComposerMode)"
            />
        </label>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Message style</span>
            <TalosThemedSelect
                :model-value="chatLayout.message_style"
                class="mt-2"
                :items="TALOS_CHAT_MESSAGE_STYLE_OPTIONS"
                aria-label="Message style"
                :disabled="themePolicyLocked"
                @update:model-value="(value) => emit('updateChatMessageStyle', value as TalosMessageStyle)"
            />
        </label>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Mobile tool windows</span>
            <TalosThemedSelect
                :model-value="chatLayout.mobile_window_presentation"
                class="mt-2"
                :items="TALOS_MOBILE_WINDOW_PRESENTATION_OPTIONS"
                aria-label="Mobile tool window presentation"
                @update:model-value="(value) => emit('updateMobileWindowPresentation', value as TalosMobileWindowPresentation)"
            />
        </label>
        <label class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 md:col-span-2">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">Expand Advanced by default</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Keep the lower-frequency workspace tools visible after reload.</span>
            </span>
            <Switch
                :model-value="chatLayout.advanced_rail_expanded"
                class="mt-1"
                aria-label="Expand Advanced by default"
                @update:model-value="(value) => emit('updateAdvancedRailExpanded', Boolean(value))"
            />
        </label>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Color mode</span>
            <TalosThemedSelect :model-value="themeMode" class="mt-2" :items="TALOS_THEME_MODE_OPTIONS" aria-label="Theme color mode" @update:model-value="selectThemeMode" />
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

    <div
        v-else-if="activePane === 'motion'"
        id="talos-appearance-panel-motion"
        role="tabpanel"
        aria-labelledby="talos-appearance-tab-motion"
        class="space-y-3"
    >
        <div class="flex flex-col gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div class="text-sm font-semibold text-[var(--talos-text)]">Theme Motion Engine V6</div>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    Background, interface motion, performance policy and preview are managed from one canonical editor.
                </p>
            </div>
            <Button type="button" size="sm" variant="secondary" @click="emit('openThemeEngine')">Open Theme Engine</Button>
        </div>
    </div>

    <div
        v-else
        id="talos-appearance-panel-visibility"
        role="tabpanel"
        aria-labelledby="talos-appearance-tab-visibility"
        class="space-y-3"
    >
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
                    <div class="flex items-center gap-1.5">
                        <h5 class="text-sm font-semibold text-[var(--talos-text)]">{{ group.label }}</h5>
                        <TalosGuideInfoButton
                            :guide-id="`settings.appearance.${group.id}`"
                            compact
                            side="bottom"
                        />
                    </div>
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
