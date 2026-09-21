<script setup lang="ts">
import { Plus } from '@lucide/vue'

/**
 * Owner 2026-07-24 (Claude-style) — the floating "New chat" pill. Lives in the
 * lower-right thumb zone (research: primary action in the thumb reach), quiet
 * accent surface with a soft lift, safe-area aware, reduced-motion press.
 * Shared by the chat list and the sidebar so the affordance is identical.
 */
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ click: [] }>()
</script>

<template>
    <button
        type="button"
        data-testid="talos-new-chat-fab"
        :aria-label="$t('chat.newChat')"
        :disabled="disabled"
        class="talos-pressable inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--talos-accent,var(--primary))] px-5 text-sm font-semibold text-[var(--talos-accent-contrast,var(--primary-foreground))] shadow-[0_8px_24px_rgba(0,0,0,0.22)] outline-none transition-transform focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:opacity-60"
        @click="emit('click')"
    >
        <Plus class="size-5" aria-hidden="true" />
        {{ $t('chat.newChat') }}
    </button>
</template>
