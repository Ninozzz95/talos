<script setup lang="ts">
import { ref } from 'vue'
import { Info } from '@lucide/vue'

withDefaults(defineProps<{
    label?: string
}>(), {
    label: 'More information',
})

const open = ref(false)
</script>

<template>
    <span class="relative inline-flex">
        <button
            type="button"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] text-[var(--talos-muted)] transition hover:border-[var(--talos-accent-border)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            :aria-label="label"
            :aria-expanded="open"
            @click="open = !open"
            @keydown.escape="open = false"
        >
            <Info class="h-3.5 w-3.5" />
        </button>
        <span
            v-if="open"
            role="tooltip"
            class="absolute right-0 top-full z-50 mt-2 w-72 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-3 text-xs leading-5 text-[var(--talos-muted)] shadow-xl"
        >
            <slot />
        </span>
    </span>
</template>
