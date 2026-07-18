<script setup lang="ts">
import Button from './Button.vue'

withDefaults(defineProps<{
    title: string
    description?: string
    actionLabel?: string
}>(), {
    description: '',
    actionLabel: '',
})

const emit = defineEmits<{
    action: []
}>()
</script>

<template>
    <section class="talos-empty-state flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <div v-if="$slots.icon" class="text-[var(--talos-muted)]" aria-hidden="true">
            <slot name="icon" />
        </div>
        <h3 class="talos-type-title text-[var(--talos-text)]">{{ title }}</h3>
        <p v-if="description" class="talos-type-body max-w-96 text-[var(--talos-muted)]">{{ description }}</p>
        <Button v-if="actionLabel" type="button" size="sm" class="mt-2" @click="emit('action')">
            {{ actionLabel }}
        </Button>
    </section>
</template>
