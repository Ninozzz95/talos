<script setup lang="ts">
import { computed } from 'vue'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import {
    mobileEffortLabel,
    mobileEffortLadderFromLevels,
} from '@/lib/mobileEffort'

const props = defineProps<{
    effortLevels: string[]
    selectedEffort: string
    supportsThinking: boolean
    thinking: boolean
}>()

const emit = defineEmits<{
    selectEffort: [level: TalosMobileEffortLevel]
    selectThinking: [enabled: boolean]
    requestClose: []
}>()

const effortLadder = computed(() => mobileEffortLadderFromLevels(props.effortLevels))

function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    emit('requestClose')
}
</script>

<template>
    <div
        data-testid="talos-mobile-effort-picker"
        class="space-y-3"
        @keydown="onKeydown"
    >
        <div class="text-[0.6875rem] font-semibold uppercase text-[var(--talos-muted,var(--muted-foreground))]">
            Reasoning effort
        </div>
        <div
            class="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Reasoning effort levels"
        >
            <button
                v-for="level in effortLadder"
                :key="level"
                type="button"
                data-testid="talos-mobile-effort-level"
                :data-effort-level="level"
                :aria-pressed="level === selectedEffort"
                class="talos-mobile-effort-level min-h-11 rounded-md border px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))]"
                :data-selected="level === selectedEffort ? 'true' : 'false'"
                @click="emit('selectEffort', level)"
            >
                {{ mobileEffortLabel(level) }}
            </button>
        </div>

        <label
            v-if="supportsThinking"
            class="flex min-h-11 items-center justify-between gap-3 border-t border-[var(--talos-border,var(--border))] pt-2 text-sm text-[var(--talos-text,var(--foreground))]"
        >
            <span class="min-w-0">Extended thinking</span>
            <button
                type="button"
                role="switch"
                data-testid="talos-mobile-thinking-toggle"
                :aria-checked="thinking"
                class="relative h-7 w-12 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))]"
                :class="thinking ? 'bg-[var(--talos-accent,var(--primary))]' : 'bg-[var(--talos-border,var(--border))]'"
                @click="emit('selectThinking', !thinking)"
            >
                <span
                    aria-hidden="true"
                    class="absolute top-1 size-5 rounded-full bg-white transition-transform"
                    :class="thinking ? 'translate-x-6' : 'translate-x-1'"
                />
            </button>
        </label>

        <p
            v-if="effortLadder.length <= 1"
            class="text-[0.6875rem] leading-4 text-[var(--talos-muted,var(--muted-foreground))]"
        >
            This model runs without a reasoning setting.
        </p>
    </div>
</template>

<style scoped>
.talos-mobile-effort-level {
    border-color: var(--talos-border, var(--border));
    background: var(--talos-panel, var(--card));
    color: var(--talos-muted, var(--muted-foreground));
}

.talos-mobile-effort-level[data-selected="true"] {
    border-color: var(--talos-accent-border, var(--border));
    background: var(--talos-accent-soft, var(--accent));
    color: var(--talos-accent-text, var(--accent-foreground));
}
</style>
