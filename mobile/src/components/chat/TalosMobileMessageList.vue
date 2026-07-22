<script setup lang="ts">
import { defineAsyncComponent, defineComponent, h, ref } from 'vue'
import { FileText, Image } from '@lucide/vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import TalosMobileMessageActions from '@/components/chat/TalosMobileMessageActions.vue'
import TalosMobileStatusMessage from '@/components/chat/TalosMobileStatusMessage.vue'
import { writeTalosClipboardText } from '@/services/clipboard'

const props = defineProps<{
    messages: readonly TalosMobileMessageView[]
    sending: boolean
}>()

const emit = defineEmits<{
    reuse: [messageId: string]
    resend: [messageId: string]
    retry: [messageId: string]
}>()

const PlainMessage = defineComponent({
    props: { content: { type: String, required: true } },
    setup(plainProps) {
        return () => h('p', { class: 'whitespace-pre-wrap break-words [overflow-wrap:anywhere]' }, plainProps.content)
    },
})
const TalosMobileMessageContent = defineAsyncComponent({
    loader: () => import('@/components/chat/TalosMobileMessageContent.vue'),
    delay: 0,
    loadingComponent: PlainMessage,
})
const TalosMobileBrowserActivity = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileBrowserActivity.vue'),
)
const copyStatus = ref('')

function hasPreviousUser(messageId: string): boolean {
    const index = props.messages.findIndex((message) => message.id === messageId)
    return index > 0 && props.messages.slice(0, index).some((message) => message.role === 'user')
}

async function copyMessage(message: TalosMobileMessageView): Promise<void> {
    try {
        await writeTalosClipboardText(message.content)
        copyStatus.value = 'Message copied.'
    } catch {
        copyStatus.value = 'Message copy failed.'
    }
}

function formatBytes(value: number): string {
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
    const megabytes = value / (1024 * 1024)
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`
}
</script>

<template>
    <div class="mx-auto flex min-w-0 w-full max-w-[820px] flex-col gap-3 overflow-x-hidden px-3 py-4" data-testid="talos-mobile-message-list">
        <article
            v-for="message in messages"
            :key="message.id"
            :data-message-id="message.id"
            :data-message-kind="message.role"
            :data-state="message.state"
            class="talos-chat-message flex min-w-0 max-w-full flex-col"
            :class="message.role === 'user' ? 'items-end' : 'items-start'"
        >
            <TalosMobileStatusMessage v-if="message.role === 'system'" :message="message" />
            <template v-else>
                <div
                    class="talos-message-bubble min-w-0 max-w-[92%] overflow-hidden px-3.5 py-2 text-sm leading-6"
                    :class="message.role === 'user'
                        ? 'rounded-2xl rounded-br-sm bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]'
                        : 'rounded-2xl rounded-bl-sm border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))] text-[var(--talos-text,var(--foreground))]'"
                    :data-message-kind="message.role"
                >
                    <TalosMobileMessageContent
                        :content="message.content"
                        :sensitive="message.metadata.sensitive === true"
                    />
                    <div
                        v-if="message.attachments?.length"
                        class="mt-2 flex max-w-full flex-wrap gap-1.5"
                        role="list"
                        aria-label="Attached files"
                    >
                        <span
                            v-for="attachment in message.attachments"
                            :key="attachment.id"
                            :data-message-attachment-id="attachment.id"
                            :title="attachment.media_type"
                            role="listitem"
                            class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-[11px] leading-4"
                        >
                            <Image
                                v-if="attachment.media_type.startsWith('image/')"
                                class="size-3.5 shrink-0"
                                aria-hidden="true"
                            />
                            <FileText v-else class="size-3.5 shrink-0" aria-hidden="true" />
                            <span class="max-w-[180px] truncate">{{ attachment.display_name }}</span>
                            <span class="shrink-0 opacity-75">{{ formatBytes(attachment.size_bytes) }}</span>
                            <span v-if="attachment.grant_status === 'revoked'" class="shrink-0">Access revoked</span>
                        </span>
                    </div>
                    <TalosMobileBrowserActivity
                        v-if="message.browserActivities?.length"
                        :activities="message.browserActivities"
                    />
                </div>
                <div class="talos-message-meta flex max-w-[92%] items-center gap-2 px-1 font-mono text-[10px] text-[var(--talos-muted)]">
                    <span>{{ message.role === 'user' ? 'You' : 'TALOS' }}</span>
                    <span v-if="message.model_profile_id">{{ message.model_profile_id }}</span>
                    <span v-if="message.state !== 'persisted'">{{ message.state }}</span>
                </div>
                <TalosMobileMessageActions
                    :message="message"
                    :busy="sending"
                    :can-retry="message.role === 'assistant' && hasPreviousUser(message.id)"
                    @copy="copyMessage"
                    @reuse="emit('reuse', $event.id)"
                    @resend="emit('resend', $event.id)"
                    @retry="emit('retry', $event.id)"
                />
            </template>
        </article>

        <div
            v-if="sending"
            data-testid="talos-mobile-typing"
            class="max-w-[92%] self-start rounded-2xl rounded-bl-sm border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))] px-3.5 py-2 text-sm text-[var(--talos-muted,var(--muted-foreground))]"
            role="status"
            aria-live="polite"
        >
            <span class="talos-typing-dots">Processing</span>
        </div>
        <span data-testid="talos-mobile-message-action-status" class="sr-only" role="status" aria-live="polite">{{ copyStatus }}</span>
    </div>
</template>
