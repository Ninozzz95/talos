<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import Button from '../../ui/Button.vue'

defineProps<{
    title: string
    message: string
}>()

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
    <div class="grid min-h-48 content-center justify-items-start gap-3 px-4 py-8" role="alert" aria-live="assertive">
        <div>
            <div class="text-sm font-semibold text-[var(--talos-text)]">{{ title }} could not be loaded</div>
            <p class="mt-1 max-w-xl text-xs leading-5 text-[var(--talos-muted)]">{{ message }}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" @click="emit('retry')">
            <RotateCcw :size="14" aria-hidden="true" />
            Retry
        </Button>
    </div>
</template>
