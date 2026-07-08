<script setup>
import { computed } from 'vue'
import { cn } from '../../lib/utils'

defineOptions({ inheritAttrs: false })

const model = defineModel()
const props = defineProps({
    class: { type: String, default: '' },
})

const classes = computed(() => cn(
    'flex min-h-20 w-full resize-none rounded-md border border-[var(--talos-input)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)] shadow-sm outline-none transition-colors placeholder:text-[var(--talos-muted)] focus-visible:border-[var(--talos-ring)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring-soft)] disabled:cursor-not-allowed disabled:opacity-50',
    props.class,
))
</script>

<template>
    <textarea v-model="model" :class="classes" v-bind="$attrs" />
</template>
