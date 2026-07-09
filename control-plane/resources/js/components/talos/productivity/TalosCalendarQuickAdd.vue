<script setup lang="ts">
import { Plus } from '@lucide/vue'
import Button from '../../ui/Button.vue'

const props = defineProps<{
    modelValue: string
    disabled: boolean
    error: string | null
}>()

const emit = defineEmits<{
    'update:modelValue': [value: string]
    submit: []
}>()
</script>

<template>
    <form class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3" @submit.prevent="emit('submit')">
        <div class="flex flex-col gap-2 md:flex-row md:items-center">
            <label class="sr-only" for="talos-calendar-quick-add">Quick add event</label>
            <input
                id="talos-calendar-quick-add"
                :value="props.modelValue"
                aria-label="Quick add event"
                class="h-9 min-w-0 flex-1 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:border-[var(--talos-ring)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring-soft)]"
                placeholder='Try "crew muster 10am daily"'
                @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
            >
            <Button type="submit" size="sm" :disabled="props.disabled">
                <Plus class="h-4 w-4" />
                Quick add
            </Button>
        </div>
        <p v-if="props.error" class="mt-2 text-xs leading-5 text-[var(--talos-warning)]">{{ props.error }}</p>
    </form>
</template>
