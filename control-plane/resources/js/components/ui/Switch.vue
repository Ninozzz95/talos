<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '../../lib/utils'

defineOptions({ inheritAttrs: false })

const model = defineModel<boolean>({ default: false })
const props = withDefaults(defineProps<{
    class?: string
    disabled?: boolean
}>(), {
    class: '',
    disabled: false,
})
const emit = defineEmits<{
    change: [value: boolean]
}>()

function handleChange(event: Event) {
    const nextValue = (event.currentTarget as HTMLInputElement).checked
    model.value = nextValue
    emit('change', nextValue)
}

const classes = computed(() => cn(
    'relative h-6 w-11 shrink-0 appearance-none rounded-full border border-[var(--talos-border-strong)] bg-[var(--talos-panel-soft)] transition before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-[var(--talos-text)] before:shadow-sm before:transition-transform checked:border-[var(--talos-accent-border)] checked:bg-[var(--talos-accent)] checked:before:translate-x-5 checked:before:bg-[var(--talos-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--talos-sidebar)] disabled:cursor-not-allowed disabled:opacity-50',
    props.class,
))
</script>

<template>
    <input
        :checked="model"
        type="checkbox"
        role="switch"
        :disabled="disabled"
        :class="classes"
        v-bind="$attrs"
        @change="handleChange"
    >
</template>
