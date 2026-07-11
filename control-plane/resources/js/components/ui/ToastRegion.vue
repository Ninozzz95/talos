<script setup lang="ts">
import { X } from '@lucide/vue'
import Button from './Button.vue'

export type TalosToast = {
    id: string
    message: string
    tone?: 'info' | 'success' | 'warning' | 'error'
}

defineProps<{
    items: readonly TalosToast[]
}>()

const emit = defineEmits<{
    dismiss: [id: string]
}>()

function toneClass(tone: TalosToast['tone']) {
    if (tone === 'success') return 'border-[var(--talos-success-border)] bg-[var(--talos-success-soft)]'
    if (tone === 'warning') return 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)]'
    if (tone === 'error') return 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)]'
    return 'border-[var(--talos-border)] bg-[var(--talos-card)]'
}
</script>

<template>
    <div
        v-if="items.length"
        class="pointer-events-none fixed right-3 top-16 z-[100] grid w-[min(24rem,calc(100vw-1.5rem))] gap-2 sm:right-4 sm:top-20"
        aria-label="Notifications"
    >
        <article
            v-for="item in items"
            :key="item.id"
            :role="item.tone === 'error' ? 'alert' : 'status'"
            aria-atomic="true"
            :class="[
                toneClass(item.tone),
                'talos-motion-feedback pointer-events-auto flex min-h-11 items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs leading-5 text-[var(--talos-text)] shadow-lg',
            ]"
            :data-motion-intent="item.tone === 'error' ? 'error-attention' : item.tone === 'success' ? 'success-confirm' : 'surface-enter'"
        >
            <span class="min-w-0 flex-1">{{ item.message }}</span>
            <Button type="button" variant="ghost" size="icon" class="-mr-1 -mt-1 h-8 w-8" aria-label="Dismiss notification" @click="emit('dismiss', item.id)">
                <X class="h-3.5 w-3.5" />
            </Button>
        </article>
    </div>
</template>
