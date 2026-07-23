<script setup lang="ts">
import { ref } from 'vue'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'

/**
 * F5.2 — device-proven dialog shell. reka-ui Dialogs never appear on the
 * owner's WebView while every hand-rolled Teleport surface (hold menu, PIN
 * modal, sheets) renders fine — critical confirmations now use the same
 * proven pattern: manual Teleport + shared modality (inert, trap, restore).
 */
defineProps<{
    title: string
    description?: string
}>()

const emit = defineEmits<{ close: [] }>()

const root = ref<HTMLElement | null>(null)
const { trapTab } = useTalosModalSurface(root)
</script>

<template>
    <Teleport to="body">
    <div class="fixed inset-0 z-[85] flex items-center justify-center px-6" data-testid="talos-confirm-dialog">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-hidden="true" @click="emit('close')" />
        <div
            ref="root"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            tabindex="-1"
            class="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-window-bg,var(--talos-background))] p-4 text-[var(--talos-text)] shadow-[0_12px_40px_rgba(0,0,0,0.25)] outline-none"
            @keydown.escape="emit('close')"
            @keydown="trapTab"
        >
            <h2 class="text-base font-semibold">{{ title }}</h2>
            <p v-if="description" class="mt-1 text-sm leading-5 text-[var(--talos-muted)]">{{ description }}</p>
            <div class="mt-3 flex flex-col gap-2">
                <slot />
            </div>
            <div class="mt-4 flex justify-end gap-2">
                <slot name="footer" />
            </div>
        </div>
    </div>
    </Teleport>
</template>
