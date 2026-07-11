<script setup>
import { computed } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps({
    padded: { type: Boolean, default: true },
})

const classes = computed(() => cn(
    'talos-ui-card rounded-lg border border-[var(--talos-border)] bg-[var(--talos-card)] text-[var(--talos-text)] shadow-sm',
    props.padded && 'p-4',
))
</script>

<template>
    <section :class="classes">
        <slot />
    </section>
</template>
