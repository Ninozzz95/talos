<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
    preset?: 'line' | 'list' | 'card' | 'grid'
    count?: number
}>(), {
    preset: 'line',
    count: 3,
})

const blockCount = computed(() => Math.max(1, Math.trunc(props.count)))
</script>

<template>
    <div class="talos-skeleton" :data-preset="preset" aria-hidden="true">
        <span
            v-for="index in blockCount"
            :key="index"
            class="talos-skeleton-block talos-motion-loader"
        ></span>
    </div>
</template>
