<script setup>
import { computed } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps({
    variant: { type: String, default: 'default' },
    size: { type: String, default: 'default' },
})

const classes = computed(() => cn(
    'inline-flex items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
    props.variant === 'default' && 'border-[var(--talos-accent-border)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)] hover:bg-[var(--talos-accent-hover)] focus-visible:outline-[var(--talos-accent)]',
    props.variant === 'secondary' && 'border-[var(--talos-border-strong)] bg-[var(--talos-panel-soft)] text-[var(--talos-text)] hover:bg-[var(--talos-active)] focus-visible:outline-[var(--talos-muted)]',
    props.variant === 'ghost' && 'border-transparent bg-transparent text-[var(--talos-muted)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-[var(--talos-muted)]',
    props.size === 'sm' ? 'h-8 px-3' : 'h-10 px-4',
))
</script>

<template>
    <button :class="classes">
        <slot />
    </button>
</template>
