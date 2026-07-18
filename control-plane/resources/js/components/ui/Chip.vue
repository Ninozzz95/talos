<script setup lang="ts">
withDefaults(defineProps<{
    code?: string
    tone?: 'neutral' | 'accent'
}>(), {
    code: '',
    tone: 'neutral',
})
</script>

<template>
    <span class="talos-chip" :class="tone === 'accent' && 'talos-chip-accent'">
        <span v-if="code" class="talos-chip-code talos-type-caption">{{ code }}</span>
        <slot />
    </span>
</template>
