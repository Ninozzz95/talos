<script setup>
import { computed } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps({
    class: { type: String, default: '' },
})

const classes = computed(() => cn('min-h-0 overflow-y-auto', props.class))
</script>

<template>
    <div :class="classes">
        <slot />
    </div>
</template>
