<script setup>
import { computed } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps({
    variant: { type: String, default: 'default' },
    size: { type: String, default: 'default' },
})

const classes = computed(() => cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--talos-sidebar)] disabled:pointer-events-none disabled:opacity-50',
    props.variant === 'default' && 'border-[var(--talos-accent-border)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)] shadow-sm hover:bg-[var(--talos-accent-hover)]',
    props.variant === 'secondary' && 'border-[var(--talos-border)] bg-[var(--talos-secondary)] text-[var(--talos-text)] shadow-sm hover:bg-[var(--talos-active)]',
    props.variant === 'outline' && 'border-[var(--talos-border)] bg-transparent text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]',
    props.variant === 'ghost' && 'border-transparent bg-transparent text-[var(--talos-muted)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)]',
    props.variant === 'destructive' && 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger)] hover:bg-[var(--talos-danger-soft)]',
    props.size === 'icon' && 'h-9 w-9 p-0',
    props.size === 'sm' && 'h-8 px-3',
    props.size === 'lg' && 'h-11 px-5',
    props.size === 'default' && 'h-10 px-4',
))
</script>

<template>
    <button :class="classes">
        <slot />
    </button>
</template>
