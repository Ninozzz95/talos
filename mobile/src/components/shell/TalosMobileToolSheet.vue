<script setup lang="ts">
import { ArrowLeft, X } from '@lucide/vue'

// Station sheet presented over the persistent chat base — mirror of the desktop
// TalosMobileToolSheet (window/TalosMobileToolSheet.vue): a bottom drawer with a
// Back-to-chat header, title/description, close, and a scrollable body honoring
// the safe-area insets. Content (the station screen) is provided via the slot.
defineProps<{ title: string; description?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
    <div class="fixed inset-0 z-[70] flex flex-col justify-end">
        <div
            data-testid="talos-mobile-sheet-backdrop"
            class="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            aria-hidden="true"
            @click="emit('close')"
        ></div>
        <section
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            data-testid="talos-mobile-tool-sheet"
            class="relative z-10 flex max-h-[min(88dvh,900px)] flex-col overflow-hidden rounded-t-2xl border-t border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)]"
        >
            <header class="flex shrink-0 items-center gap-2 border-b border-[var(--talos-border)] bg-transparent px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
                <button
                    type="button"
                    aria-label="Back to chat"
                    class="talos-pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--talos-muted)]"
                    @click="emit('close')"
                >
                    <ArrowLeft class="h-4 w-4" aria-hidden="true" />
                </button>
                <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ title }}</p>
                    <p class="truncate text-[11px] text-[var(--talos-muted)]">{{ description || `${title} workspace tools.` }}</p>
                </div>
                <button
                    type="button"
                    :aria-label="`Close ${title}`"
                    class="talos-pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--talos-muted)]"
                    @click="emit('close')"
                >
                    <X class="h-4 w-4" aria-hidden="true" />
                </button>
            </header>
            <div
                data-testid="talos-mobile-sheet-body"
                class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
                <slot />
            </div>
        </section>
    </div>
</template>
