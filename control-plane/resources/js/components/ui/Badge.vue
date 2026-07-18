<script setup>
import { computed } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps({
    tone: { type: String, default: 'neutral' },
})

const classes = computed(() => cn(
    'inline-flex items-center rounded-md border px-2 py-0.5 font-[family-name:var(--talos-font-chrome)] text-[length:var(--talos-text-caption)] font-medium',
    props.tone === 'success' && 'border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] text-[var(--talos-success)]',
    props.tone === 'danger' && 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]',
    props.tone === 'warning' && 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-warning)]',
    props.tone === 'neutral' && 'border-[var(--talos-border-strong)] bg-[var(--talos-panel-soft)] text-[var(--talos-muted)]',
))
</script>

<template>
    <span :class="classes">
        <slot />
    </span>
</template>
