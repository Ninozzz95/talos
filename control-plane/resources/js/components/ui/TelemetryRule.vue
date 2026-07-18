<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = withDefaults(defineProps<{
    label: string
    tone?: 'accent' | 'danger'
    ticks?: number
}>(), {
    tone: 'accent',
    ticks: 12,
})

const slots = useSlots()
const hasReadout = computed(() => Boolean(slots.readout))
const tickCount = computed(() => Math.max(1, Math.trunc(props.ticks)))
</script>

<template>
    <div class="talos-rule" :class="tone === 'danger' && 'talos-rule-danger'" :data-tone="tone">
        <span class="talos-rule-ticks" aria-hidden="true">
            <i v-for="index in tickCount" :key="index" class="talos-rule-tick"></i>
        </span>
        <span class="talos-rule-label">{{ label }}</span>
        <div v-if="hasReadout" class="talos-readout">
            <slot name="readout" />
        </div>
    </div>
</template>
