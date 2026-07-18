<script setup lang="ts">
import { AlertCircle } from '@lucide/vue'
import Button from './Button.vue'

withDefaults(defineProps<{
    message: string
    remedy?: string
    retryLabel?: string
    correlationId?: string
}>(), {
    remedy: '',
    retryLabel: 'Retry',
    correlationId: '',
})

const emit = defineEmits<{
    retry: []
}>()
</script>

<template>
    <div
        role="alert"
        class="talos-error-state flex flex-col gap-2 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-4 py-3"
    >
        <div class="flex items-start gap-2">
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
            <div class="min-w-0">
                <p class="talos-type-body text-[var(--talos-text)]">{{ message }}</p>
                <p v-if="remedy" class="talos-type-body text-[var(--talos-muted)]">{{ remedy }}</p>
            </div>
        </div>
        <div class="flex items-center justify-between gap-2">
            <span v-if="correlationId" class="talos-readout">ID {{ correlationId }}</span>
            <span v-else></span>
            <Button type="button" variant="outline" size="sm" @click="emit('retry')">
                {{ retryLabel }}
            </Button>
        </div>
    </div>
</template>
