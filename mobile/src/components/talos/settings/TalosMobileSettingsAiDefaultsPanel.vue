<script setup lang="ts">
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import { useSettingsStore, type TalosUtilityModelMode } from '@/stores/settings'

const settings = useSettingsStore()
const modeItems = [
    { value: 'same_as_chat', label: 'Same as chat' },
    { value: 'default_profile', label: 'Use default profile' },
]

function setMode(key: 'utility_model_mode' | 'research_model_mode', value: string): void {
    if (value !== 'same_as_chat' && value !== 'default_profile') return
    void settings.setAiDefaults({ [key]: value as TalosUtilityModelMode })
}

function setVision(event: Event): void {
    void settings.setAiDefaults({ vision_enabled: (event.target as HTMLInputElement).checked })
}
</script>

<template>
    <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Utility model mode</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="settings.state.ai_defaults.utility_model_mode"
                    :items="modeItems"
                    aria-label="Utility model mode"
                    @update:model-value="setMode('utility_model_mode', $event)"
                />
            </label>
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Research model mode</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="settings.state.ai_defaults.research_model_mode"
                    :items="modeItems"
                    aria-label="Research model mode"
                    @update:model-value="setMode('research_model_mode', $event)"
                />
            </label>
        </div>

        <label class="flex min-h-14 cursor-pointer items-start justify-between gap-3 border-y border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">Vision routing preference</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Prefer a vision-capable profile when an image is attached.</span>
            </span>
            <input
                type="checkbox"
                role="switch"
                aria-label="Vision routing preference"
                :checked="settings.state.ai_defaults.vision_enabled"
                class="mt-1 h-5 w-9 accent-[var(--talos-accent)]"
                @change="setVision"
            >
        </label>
    </div>
</template>
