<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight } from '@lucide/vue'

/**
 * Owner 2026-07-25 (defect #5): "i modelli mandano anche il proprio
 * ragionamento, oggi lo buttiamo." Decision: a "Reasoning" block, COLLAPSED by
 * default, persisted with the message so it is still there tomorrow and in the
 * export.
 *
 * Collapsed because reasoning is routinely longer than the answer — open by
 * default would bury the thing that was actually asked for. Rendered as plain
 * text, never as markdown: a live trace is full of half-written syntax, and
 * parsing it produces broken headings mid-thought.
 */
const props = defineProps<{
    reasoning: string
    /** True while it is still arriving, so the label can say so. */
    live?: boolean
}>()

const open = ref(false)
const words = computed(() => props.reasoning.trim().split(/\s+/).filter(Boolean).length)
</script>

<template>
    <div
        v-if="reasoning.trim()"
        data-testid="talos-reasoning-block"
        class="mb-1.5 overflow-hidden rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/60"
    >
        <button
            type="button"
            data-testid="talos-reasoning-toggle"
            class="talos-pressable flex min-h-10 w-full items-center gap-2 px-3 text-left text-2xs font-medium uppercase tracking-wide text-[var(--talos-muted)]"
            :aria-expanded="open"
            @click="open = !open"
        >
            <ChevronRight
                class="size-3.5 shrink-0 transition-transform duration-200"
                :class="open ? 'rotate-90' : ''"
                aria-hidden="true"
            />
            <span>{{ live ? 'Reasoning…' : 'Reasoning' }}</span>
            <span v-if="!live" class="ml-auto normal-case tracking-normal">{{ words }} words</span>
        </button>
        <p
            v-if="open"
            data-testid="talos-reasoning-text"
            class="whitespace-pre-wrap break-words border-t border-[var(--talos-border)] px-3 py-2 text-xs leading-5 text-[var(--talos-muted)] [overflow-wrap:anywhere]"
        >{{ reasoning }}</p>
    </div>
</template>
