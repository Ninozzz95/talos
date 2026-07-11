<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{
    content: string
    align?: 'start' | 'center' | 'end'
}>(), {
    align: 'center',
})

const tooltipId = `talos-tooltip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const positionClass = computed(() => {
    if (props.align === 'start') {
        return 'left-0'
    }

    if (props.align === 'end') {
        return 'right-0'
    }

    return 'left-1/2 -translate-x-1/2'
})
</script>

<template>
    <span class="group/talos-tooltip relative inline-flex">
        <slot v-bind="{ describedBy: tooltipId }" />
        <span
            :id="tooltipId"
            role="tooltip"
            :class="[
                positionClass,
                'pointer-events-none invisible absolute top-full z-[90] mt-2 w-max max-w-56 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-2 py-1 text-xs leading-5 text-[var(--talos-text)] opacity-0 shadow-lg transition-[opacity,visibility] duration-150 group-hover/talos-tooltip:visible group-hover/talos-tooltip:opacity-100 group-focus-within/talos-tooltip:visible group-focus-within/talos-tooltip:opacity-100',
            ]"
        >
            {{ content }}
        </span>
    </span>
</template>
