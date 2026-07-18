<script setup>
import { computed } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps({
    padded: { type: Boolean, default: true },
})

const classes = computed(() => cn(
    'talos-ui-card rounded-lg border border-[var(--talos-border)] bg-[var(--talos-surface-1)] text-[var(--talos-text)]',
    props.padded && 'p-4',
))
</script>

<template>
    <section :class="classes">
        <slot />
    </section>
</template>
