<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

defineProps<{
    messages: readonly TalosMobileMessageView[]
    sending: boolean
}>()
</script>

<template>
    <div class="mx-auto flex w-full max-w-[820px] flex-col gap-3 px-3 py-4" data-testid="talos-mobile-message-list">
        <template v-for="message in messages" :key="message.id">
            <!-- user: right-aligned accent bubble -->
            <div
                v-if="message.role === 'user'"
                data-role="user"
                class="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-[var(--talos-accent,var(--primary))] px-3.5 py-2 text-sm leading-6 text-[var(--talos-accent-contrast,var(--primary-foreground))]"
            >{{ message.content }}</div>

            <!-- assistant: left-aligned panel bubble -->
            <div
                v-else-if="message.role === 'assistant'"
                data-role="assistant"
                class="max-w-[92%] self-start whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))] px-3.5 py-2 text-sm leading-6 text-[var(--talos-text,var(--foreground))]"
            >{{ message.content }}</div>

            <!-- system / failed: centered warning chip -->
            <div
                v-else
                data-role="system"
                :data-state="message.state"
                class="mx-auto flex max-w-[92%] items-start gap-2 rounded-md border border-[var(--talos-danger-border,var(--destructive))] bg-[var(--talos-danger-soft,transparent)] px-3 py-2 text-xs leading-5 text-[var(--talos-danger,var(--destructive))]"
            >
                <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span class="whitespace-pre-wrap break-words">{{ message.content }}</span>
            </div>
        </template>

        <div
            v-if="sending"
            data-testid="talos-mobile-typing"
            class="max-w-[92%] self-start rounded-2xl rounded-bl-sm border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))] px-3.5 py-2 text-sm text-[var(--talos-muted,var(--muted-foreground))]"
            role="status"
            aria-live="polite"
        >
            <span class="talos-typing-dots">TALOS is thinking…</span>
        </div>
    </div>
</template>
