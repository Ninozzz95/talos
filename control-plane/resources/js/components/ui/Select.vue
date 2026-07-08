<script setup>
import { computed } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { cn } from '../../lib/utils'

defineOptions({ inheritAttrs: false })

const model = defineModel()
const props = defineProps({
    class: { type: String, default: '' },
})

const classes = computed(() => cn(
    'h-9 w-full appearance-none rounded-md border border-[var(--talos-input)] bg-[var(--talos-background)] py-1 pl-3 pr-9 text-sm text-[var(--talos-text)] shadow-sm outline-none transition-colors focus-visible:border-[var(--talos-ring)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring-soft)] disabled:cursor-not-allowed disabled:opacity-50',
    props.class,
))
</script>

<template>
    <div class="relative w-full">
        <select v-model="model" :class="classes" v-bind="$attrs">
            <slot />
        </select>
        <ChevronDown class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--talos-muted)]" />
    </div>
</template>
