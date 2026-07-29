<script setup lang="ts">
import { onMounted, provide, ref } from 'vue'
import { ArrowLeft, X } from '@lucide/vue'
import { TALOS_SHEET_CONTEXT_KEY } from '@/lib/sheetContext'
import { useTalosSheetNav } from '@/composables/useTalosSheetNav'

// Station sheet presented over the persistent chat base — mirror of the desktop
// TalosMobileToolSheet (window/TalosMobileToolSheet.vue): Back-to-chat header,
// title/description, close, scrollable body honoring the safe-area insets.
// F3-T2 (owner #4/#8/#3): honours the `mobile_window_presentation` preference —
// fullscreen (default) covers the viewport; drawer keeps ONE fixed tall height
// so every station matches — and animates in (slide-up + backdrop fade, 250ms,
// globally zeroed under reduced-motion).
withDefaults(defineProps<{
    title: string
    description?: string
    presentation?: 'fullscreen' | 'drawer'
}>(), {
    presentation: 'fullscreen',
})
const emit = defineEmits<{ close: [] }>()

const { subView } = useTalosSheetNav()

const entered = ref(false)
const root = ref<HTMLElement | null>(null)
onMounted(() => {
    requestAnimationFrame(() => { entered.value = true })
    // SF-critic F3 #3: modal semantics need at least initial focus + Escape.
    root.value?.focus()
})

// F3-T3 chrome dedup: the sheet titles the surface — screens inside drop
// their own duplicate header via this context.
provide(TALOS_SHEET_CONTEXT_KEY, true)
</script>

<template>
    <!-- F6: on tablet the sheet covers only the CONTENT area — the persistent
         chat panel stays usable (--talos-tablet-rail is 0 on phones). -->
    <div class="pointer-events-auto fixed inset-y-0 right-0 z-[70] flex flex-col justify-end" :style="{ left: 'var(--talos-tablet-rail, 0px)' }">
        <div
            data-testid="talos-mobile-sheet-backdrop"
            class="absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-250"
            :class="entered ? 'opacity-100' : 'opacity-0'"
            aria-hidden="true"
            @click="emit('close')"
        ></div>
        <section
            ref="root"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            tabindex="-1"
            data-testid="talos-mobile-tool-sheet"
            :data-presentation="presentation"
            class="relative z-10 flex flex-col overflow-hidden border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)] outline-none transition-transform duration-250 ease-out"
            @keydown.escape="emit('close')"
            :class="[
                presentation === 'fullscreen'
                    ? 'h-[100dvh] max-h-none rounded-none border-0'
                    : 'h-[88dvh] max-h-[900px] rounded-t-2xl border-t',
                entered ? 'translate-y-0' : 'translate-y-6',
            ]"
        >
            <!-- Owner 2026-07-24: ONE contextual back. When a station pushes a
                 sub-view, the header shows the subsection title and Back returns
                 to the station (not a second in-body arrow). -->
            <header class="flex shrink-0 items-center gap-2 border-b border-[var(--talos-border)] bg-transparent px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
                <button
                    type="button"
                    data-testid="talos-sheet-back"
                    :aria-label="subView ? 'Back' : 'Back to chat'"
                    class="talos-pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--talos-muted)]"
                    @click="subView ? subView.back() : emit('close')"
                >
                    <ArrowLeft class="h-4 w-4" aria-hidden="true" />
                </button>
                <div class="min-w-0 flex-1">
                    <p class="talos-title truncate text-md font-semibold text-[var(--talos-text)]">{{ subView ? subView.title : title }}</p>
                    <p v-if="!subView && description" class="truncate text-2xs text-[var(--talos-muted)]">{{ description }}</p>
                </div>
                <button
                    v-if="presentation === 'drawer'"
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
