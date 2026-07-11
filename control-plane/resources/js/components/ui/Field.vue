<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
    id: string
    label: string
    description?: string
    error?: string | null
    required?: boolean
}>(), {
    description: '',
    error: null,
    required: false,
})

const descriptionId = computed(() => `${props.id}-description`)
const errorId = computed(() => `${props.id}-error`)
const describedBy = computed(() => [
    props.description ? descriptionId.value : '',
    props.error ? errorId.value : '',
].filter(Boolean).join(' ') || undefined)
</script>

<template>
    <div class="talos-field grid min-w-0 gap-1.5" :data-field-id="id">
        <label :for="id" class="text-xs font-medium text-[var(--talos-text)]">
            {{ label }}
            <span v-if="required" class="text-[var(--talos-danger)]" aria-hidden="true">*</span>
        </label>
        <p v-if="description" :id="descriptionId" class="text-xs leading-5 text-[var(--talos-muted)]">
            {{ description }}
        </p>
        <slot v-bind="{
            controlId: id,
            descriptionId: description ? descriptionId : undefined,
            errorId: error ? errorId : undefined,
            describedBy,
            invalid: Boolean(error),
            required,
        }" />
        <p v-if="error" :id="errorId" role="alert" class="text-xs leading-5 text-[var(--talos-danger)]">
            {{ error }}
        </p>
    </div>
</template>
