<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
    label: string
    value: unknown
    suffix?: string
}>()

const displayValue = computed(() => {
    if (props.value === null || props.value === undefined || props.value === '') {
        return 'unknown'
    }

    if (typeof props.value === 'number') {
        const normalized = props.label.toLowerCase().includes('completion') || props.label.toLowerCase().includes('replay')
            ? Math.round(props.value * 100)
            : props.value

        return `${normalized}${props.suffix ?? ''}`
    }

    return String(props.value)
})
</script>

<template>
    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
        <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">{{ label }}</div>
        <div class="mt-1 truncate text-sm font-semibold text-[var(--talos-text)]">{{ displayValue }}</div>
    </div>
</template>
