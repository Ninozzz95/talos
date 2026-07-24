<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { BookMarked, FileText, Image } from '@lucide/vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import TalosMobileMessageActions from '@/components/chat/TalosMobileMessageActions.vue'
import TalosMobileStatusMessage from '@/components/chat/TalosMobileStatusMessage.vue'
import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'
import { writeTalosClipboardText } from '@/services/clipboard'
import { talosRelativeTime } from '@/lib/relativeTime'

const props = defineProps<{
    messages: readonly TalosMobileMessageView[]
    sending: boolean
    modelLabels?: Record<string, string>
    // Desktop-parity message style (owner: assistant replies are full-width
    // sections by default; bubbles remain a Settings toggle).
    messageStyle?: 'sections' | 'bubbles'
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

// R1-5 — the in-flight reply lives in TalosMobileStreamingReply, which alone
// subscribes to streamingText: a token burst no longer re-diffs this list.

// R2-11 — ONE row-action grammar (competitor pattern: long-press a message
// for its actions, the same gesture as the chat rows). The hold clicks the
// SAME overflow trigger — no second menu implementation. Trade-off accepted
// per competitor behavior: in-message long-press text selection gives way to
// the actions menu (Copy lives there; code blocks keep their own Copy).
const MESSAGE_HOLD_MS = 500
const MESSAGE_HOLD_SLOP_PX = 10
let messageHoldTimer: ReturnType<typeof setTimeout> | null = null
let messageHoldOrigin: { x: number; y: number } | null = null
let suppressNextMessageClick = false

function clearMessageHold(): void {
    if (messageHoldTimer !== null) clearTimeout(messageHoldTimer)
    messageHoldTimer = null
    messageHoldOrigin = null
}

function onMessagePointerDown(event: PointerEvent): void {
    clearMessageHold()
    messageHoldOrigin = { x: event.clientX, y: event.clientY }
    const article = event.currentTarget as HTMLElement
    messageHoldTimer = setTimeout(() => {
        // Order matters: open the menu FIRST (reka opens on click, proven by
        // TalosMobileMessageActions.test.ts), THEN arm suppression. If we set
        // the flag first, our own programmatic click bubbles through the
        // article's @click.capture guard and gets preventDefault()'d before
        // it reaches reka (root cause of the R2-11 dead menu). Suppression is
        // only for the finger's trailing real click after the hold.
        article.querySelector<HTMLButtonElement>('[aria-label="More message actions"]')?.click()
        suppressNextMessageClick = true
        clearMessageHold()
    }, MESSAGE_HOLD_MS)
}

function onMessagePointerMove(event: PointerEvent): void {
    if (!messageHoldOrigin) return
    if (Math.abs(event.clientX - messageHoldOrigin.x) > MESSAGE_HOLD_SLOP_PX
        || Math.abs(event.clientY - messageHoldOrigin.y) > MESSAGE_HOLD_SLOP_PX) clearMessageHold()
}

function onMessageClickCapture(event: MouseEvent): void {
    // The click that ends the long-press is part of the gesture.
    if (suppressNextMessageClick) {
        suppressNextMessageClick = false
        event.preventDefault()
        event.stopPropagation()
    }
}

// Meta timestamps age honestly: a shared `now` ticks every 30s so "just now"
// does not persist forever on an idle thread.
const now = ref(new Date())
let nowTicker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
    nowTicker = setInterval(() => { now.value = new Date() }, 30_000)
})
onBeforeUnmount(() => {
    if (nowTicker) clearInterval(nowTicker)
})

// F2-T2 calm thread: consecutive same-sender messages group together —
// tighter gap, tail radius and meta row only on the last of the group.
function isGrouped(index: number): boolean {
    const current = props.messages[index]
    const previous = props.messages[index - 1]
    return Boolean(previous && current.role !== 'system' && previous.role === current.role)
}

function isGroupEnd(index: number): boolean {
    const current = props.messages[index]
    const next = props.messages[index + 1]
    return !next || next.role !== current.role
}

function modelLabel(message: TalosMobileMessageView): string {
    // Attribution is assistant-only: a human never answers "with" a model.
    if (message.role !== 'assistant') return ''
    const id = message.model_profile_id
    if (!id) return ''
    return props.modelLabels?.[id] ?? id
}

// R1-5 — precomputed once per messages change (was findIndex+slice+some PER
// assistant row inside the render: O(n²) each pass).
const hasPreviousUserById = computed(() => {
    const map = new Map<string, boolean>()
    let seenUser = false
    for (const message of props.messages) {
        map.set(message.id, seenUser)
        if (message.role === 'user') seenUser = true
    }
    return map
})

function hasPreviousUser(messageId: string): boolean {
    return hasPreviousUserById.value.get(messageId) ?? false
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
    <div class="mx-auto flex min-w-0 w-full max-w-[820px] flex-col overflow-x-hidden px-3 py-4" data-testid="talos-mobile-message-list">
        <article
            v-for="(message, index) in messages"
            :key="message.id"
            :data-message-id="message.id"
            :data-message-kind="message.role"
            :data-state="message.state"
            :data-grouped="isGrouped(index) ? 'true' : undefined"
            class="talos-chat-message flex min-w-0 max-w-full flex-col"
            :class="[message.role === 'user' ? 'items-end' : 'items-start', isGrouped(index) ? 'mt-1' : 'mt-3 first:mt-0']"
            @pointerdown="message.role === 'user' && onMessagePointerDown($event)"
            @pointermove="onMessagePointerMove($event)"
            @pointerup="clearMessageHold()"
            @pointercancel="clearMessageHold()"
            @click.capture="onMessageClickCapture($event)"
        >
            <TalosMobileStatusMessage v-if="message.role === 'system'" :message="message" />
            <template v-else>
                <div
                    class="talos-message-bubble min-w-0 overflow-hidden text-sm leading-6"
                    :class="[message.role === 'assistant' && (props.messageStyle ?? 'sections') === 'sections'
                        ? 'w-full max-w-full px-1 py-1 text-[var(--talos-text,var(--foreground))]'
                        : 'max-w-[92%] px-3.5 py-2', message.role === 'user'
                        ? 'bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]'
                        : ((props.messageStyle ?? 'sections') === 'sections'
                            ? ''
                            : 'border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))] text-[var(--talos-text,var(--foreground))]'),
                    message.role === 'assistant' && (props.messageStyle ?? 'sections') === 'sections'
                        ? ''
                        : (isGroupEnd(index)
                            ? (message.role === 'user' ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm')
                            : 'rounded-2xl')]"
                    :data-message-kind="message.role"
                >
                    <TalosMobileMessageContent
                        :content="message.content"
                    />
                    <!-- F4 Memory: disclosure of injected untrusted memories -->
                    <div
                        v-if="Array.isArray(message.metadata.used_memories) && message.metadata.used_memories.length"
                        data-testid="talos-used-memories"
                        class="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-[11px] leading-4"
                        :title="(message.metadata.used_memories as Array<{ title?: string }>).map((entry) => entry?.title ?? '').join(' · ')"
                    >
                        <BookMarked class="size-3.5 shrink-0" aria-hidden="true" />
                        {{ message.metadata.used_memories.length }}
                        {{ message.metadata.used_memories.length === 1 ? 'memory' : 'memories' }} used
                    </div>
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
                <div v-if="isGroupEnd(index)" class="talos-message-meta mt-1 flex max-w-[92%] items-center gap-1.5 px-1 font-mono text-[11px] text-[var(--talos-muted)]">
                    <span>{{ message.role === 'user' ? 'You' : 'TALOS' }}</span>
                    <template v-if="modelLabel(message)">
                        <span aria-hidden="true">·</span>
                        <span>{{ modelLabel(message) }}</span>
                    </template>
                    <span aria-hidden="true">·</span>
                    <span>{{ talosRelativeTime(message.created_at, now) }}</span>
                    <template v-if="message.state !== 'persisted'">
                        <span aria-hidden="true">·</span>
                        <span>{{ message.state }}</span>
                    </template>
                </div>
                <!-- SF-critic #7: the action row renders only where the group
                     ends (next to the meta row) — calmer per-turn chrome. -->
                <TalosMobileMessageActions
                    v-if="isGroupEnd(index)"
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

        <!-- R1-5: the streaming tail subscribes to the store on its own — a
             token burst re-renders only that subtree, never this list. -->
        <TalosMobileStreamingReply />
        <span data-testid="talos-mobile-message-action-status" class="sr-only" role="status" aria-live="polite">{{ copyStatus }}</span>
    </div>
</template>
