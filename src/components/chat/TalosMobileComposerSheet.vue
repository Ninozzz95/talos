<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'

/**
 * F4-#26 — shared bottom-sheet shell for the composer drawers (Add to chat /
 * Model & reasoning / Improve prompt). Teleported to body: the composer
 * card's backdrop-blur creates a containing block that would trap a fixed
 * overlay inside the card. Modal semantics: initial focus, Escape, backdrop
 * tap to close.
 */
defineProps<{
    title: string
    testid: string
}>()

const emit = defineEmits<{ close: [] }>()

const entered = ref(false)
const closing = ref(false)
const root = ref<HTMLElement | null>(null)

// SF-7 / SF5-4: shared real modality — inert app root (ref-counted), Tab
// trap, opener focus restore.
const { trapTab } = useTalosModalSurface(root)

// Owner 2026-07-24: (1) close ANIMATES out — reuse the enter transform, then
// emit close so the parent unmounts; (2) the system Back gesture closes THIS
// drawer instead of exiting the app (overlay-back registry). Reduced-motion
// zeroes the delay honestly. `closing` drives a FULL slide-out (not the tiny
// 24px enter offset, which looked like it stalled then vanished).
function requestClose(): void {
    if (closing.value) return
    closing.value = true
    entered.value = false
    const reduce = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => emit('close'), reduce ? 0 : 300)
}
useTalosOverlayBack(requestClose)

onMounted(() => {
    requestAnimationFrame(() => { entered.value = true })
})
</script>

<template>
    <Teleport to="body">
    <div class="pointer-events-auto fixed inset-0 z-[75] flex flex-col justify-end">
        <div
            class="absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-250"
            :class="entered && !closing ? 'opacity-100' : 'opacity-0'"
            aria-hidden="true"
            @click="requestClose"
        />
        <section
            ref="root"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            tabindex="-1"
            :data-testid="testid"
            class="relative z-10 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border-t border-[var(--talos-border)] bg-[var(--talos-window-bg)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-[var(--talos-text)] outline-none transition-transform duration-300 ease-in-out md:mx-auto md:w-[clamp(480px,50vw,600px)] md:border-x"
            :class="closing ? 'translate-y-full' : (entered ? 'translate-y-0' : 'translate-y-6')"
            @keydown.escape="requestClose"
            @keydown="trapTab"
        >
            <header class="flex shrink-0 items-center gap-2 px-3 py-2">
                <button
                    type="button"
                    :aria-label="$t('common.close')"
                    class="talos-pressable flex min-h-touch min-w-touch items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="requestClose"
                >
                    <X class="size-5" aria-hidden="true" />
                </button>
                <h2 class="flex-1 text-center text-base font-semibold">{{ title }}</h2>
                <span class="min-w-touch" aria-hidden="true" />
            </header>

            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pt-1">
                <slot />
            </div>
        </section>
    </div>
    </Teleport>
</template>
