<script setup lang="ts">
import { Plus } from '@lucide/vue'

/**
 * Owner 2026-07-24 (Claude-style) — the floating "New chat" pill. Lives in the
 * lower-right thumb zone (research: primary action in the thumb reach), quiet
 * accent surface with a soft lift, safe-area aware, reduced-motion press.
 * Shared by the chat list and the sidebar so the affordance is identical.
 *
 * `label`/`ariaLabel` (28/8): HarnessScreen.vue reuses this SAME pill for
 * "New session" — same shape, same thumb-zone placement, wrong word if
 * hardcoded to "New chat". Defaults keep every existing Chat call site
 * byte-identical; only a caller that passes its own strings sees anything
 * different.
 */
const props = withDefaults(defineProps<{
    disabled?: boolean
    label?: string
    ariaLabel?: string
}>(), { disabled: false })
const emit = defineEmits<{ click: [] }>()
</script>

<template>
    <button
        type="button"
        data-testid="talos-new-chat-fab"
        :aria-label="props.ariaLabel ?? $t('chat.newChat')"
        :disabled="disabled"
        class="talos-pressable inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--talos-accent,var(--primary))] px-5 text-sm font-semibold text-[var(--talos-accent-contrast,var(--primary-foreground))] shadow-[0_8px_24px_rgba(0,0,0,0.22)] outline-none transition-transform focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:opacity-60"
        @click="emit('click')"
    >
        <Plus class="size-5" aria-hidden="true" />
        {{ props.label ?? $t('chat.newChat') }}
    </button>
</template>
