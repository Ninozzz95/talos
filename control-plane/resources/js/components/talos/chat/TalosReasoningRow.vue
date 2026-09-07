<script setup lang="ts">
import { BrainCircuit, ChevronRight } from '@lucide/vue'
import type { TalosVisibleReasoning } from '../../../lib/talosMessageMetadata'

defineProps<{
    reasoning: TalosVisibleReasoning
}>()

const emit = defineEmits<{
    open: []
}>()

function durationLabel(durationMs: number | null) {
    if (durationMs === null) return 'Duration unavailable'
    if (durationMs < 1000) return `${durationMs}ms`
    return `${(durationMs / 1000).toFixed(1)}s`
}
</script>

<template>
    <button
        type="button"
        data-testid="talos-reasoning-trigger"
        class="mt-2 flex min-h-11 w-full items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 text-left text-xs text-[var(--talos-muted)] hover:border-[var(--talos-border-strong)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
        aria-haspopup="dialog"
        @click="emit('open')"
    >
        <BrainCircuit class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
        <span class="min-w-0 flex-1">
            <span class="font-semibold text-[var(--talos-text)]">Reasoning</span>
            <span class="ml-2">{{ durationLabel(reasoning.duration_ms) }}</span>
        </span>
        <span v-if="reasoning.provider" class="hidden truncate font-mono text-[10px] sm:inline">{{ reasoning.provider }}</span>
        <ChevronRight class="h-4 w-4 shrink-0" />
    </button>
</template>
