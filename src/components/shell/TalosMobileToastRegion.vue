<script setup lang="ts">
/**
 * F3-T4 — calm toast region. Renders above the composer, announces politely,
 * one optional action per toast (e.g. tone suggestion "Switch"). Dismiss is
 * always available; nothing here ever mutates state on its own.
 */
import { X } from '@lucide/vue'
import { useTalosMobileToasts } from '@/stores/toasts'

const toasts = useTalosMobileToasts()
</script>

<template>
    <div
        data-testid="talos-mobile-toasts"
        aria-live="polite"
        class="pointer-events-none fixed inset-x-0 bottom-[calc(var(--talos-composer-height,180px)+env(safe-area-inset-bottom)+1rem)] z-[60] flex flex-col items-center gap-2 px-4"
    >
        <TransitionGroup
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0 translate-y-2"
        >
            <div
                v-for="toast in toasts.items.value"
                :key="toast.id"
                data-testid="talos-mobile-toast"
                class="pointer-events-auto flex w-full max-w-[420px] items-center gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-card)]/95 px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.14)] backdrop-blur"
            >
                <p class="min-w-0 flex-1 text-sm leading-5 text-[var(--talos-text)]">{{ toast.message }}</p>
                <button
                    v-if="toast.action"
                    type="button"
                    data-testid="talos-toast-action"
                    class="talos-pressable min-h-touch shrink-0 rounded-full bg-[var(--talos-accent,var(--primary))] px-3 text-xs font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="toasts.act(toast.id)"
                >
                    {{ toast.action.label }}
                </button>
                <button
                    type="button"
                    :aria-label="$t('accessibility.dismissNotification')"
                    class="talos-pressable flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="toasts.dismiss(toast.id)"
                >
                    <X class="size-4" aria-hidden="true" />
                </button>
            </div>
        </TransitionGroup>
    </div>
</template>
