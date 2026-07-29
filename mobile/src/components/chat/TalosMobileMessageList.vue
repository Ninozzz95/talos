<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { BookMarked, FileText } from '@lucide/vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import TalosMobileMessageActions from '@/components/chat/TalosMobileMessageActions.vue'
import TalosMobileMessageImage from '@/components/chat/TalosMobileMessageImage.vue'
import TalosMobileStatusMessage from '@/components/chat/TalosMobileStatusMessage.vue'
import TalosMobileReasoningBlock from '@/components/chat/TalosMobileReasoningBlock.vue'
import TalosMobileSourcesChip from '@/components/chat/TalosMobileSourcesChip.vue'
import { writeTalosClipboardText } from '@/services/clipboard'
import { talosRelativeTime } from '@/lib/relativeTime'
import { talosChatTextSize } from '@/lib/talosChatLayout'
import type { TalosChatBubbleScale } from '@/lib/talosTypes'

const props = defineProps<{
    messages: readonly TalosMobileMessageView[]
    sending: boolean
    modelLabels?: Record<string, string>
    // Desktop-parity message style (owner: assistant replies are full-width
    // sections by default; bubbles remain a Settings toggle).
    messageStyle?: 'sections' | 'bubbles'
    /** Owner 2026-07-25: real chat text size (was a dead preference). */
    textScale?: TalosChatBubbleScale
    /** Defect #4: true while pages above the window remain unloaded. */
    hasOlderMessages?: boolean
    loadingOlderMessages?: boolean
}>()

const emit = defineEmits<{
    reuse: [messageId: string]
    resend: [messageId: string]
    retry: [messageId: string]
    saveToLibrary: [messageId: string]
}>()

const { t } = useTalosI18n()
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
// The streaming subtree owns the UAX #29 tables used by smooth reveal. Keep it
// isolated from the initial app chunk while preserving its direct store
// subscription and the message-list render boundary.
const TalosMobileStreamingReply = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileStreamingReply.vue'),
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
        article.querySelector<HTMLButtonElement>('[data-message-overflow-trigger]')?.click()
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
    if (hasPreviousUserById.value.get(messageId) === true) return true
    // Defect #4: the window is paged. An assistant message that OPENS the
    // loaded page usually has its prompt on the page above, so hiding Retry
    // there would make the action blink in and out as you scroll.
    return props.hasOlderMessages === true && props.messages[0]?.id === messageId
}

function hasMemoryDisclosure(message: TalosMobileMessageView): boolean {
    return message.role !== 'system'
        && Array.isArray(message.metadata.used_memories)
        && message.metadata.used_memories.length > 0
}

// Owner 2026-07-29: memory provenance remains per-turn, but repeated pills are
// thread noise. Cache one chronological winner for the materialized window;
// prepending an older page deterministically moves, never duplicates, it.
const firstMemoryDisclosureMessageId = computed(
    () => props.messages.find(hasMemoryDisclosure)?.id ?? null,
)

async function copyMessage(message: TalosMobileMessageView): Promise<void> {
    try {
        await writeTalosClipboardText(message.content)
        copyStatus.value = t('chat.messageCopied')
    } catch {
        copyStatus.value = t('chat.messageCopyFailed')
    }
}

/**
 * Images render as images; everything else keeps the chip.
 *
 * Split here rather than branched inside one loop so the two have different
 * markup entirely — a thumbnail is not a chip with a different icon.
 */
function imageAttachments(message: TalosMobileMessageView) {
    return (message.attachments ?? []).filter((entry) => entry.media_type.startsWith('image/'))
}

function fileAttachments(message: TalosMobileMessageView) {
    return (message.attachments ?? []).filter((entry) => !entry.media_type.startsWith('image/'))
}

function formatBytes(value: number): string {
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
    const megabytes = value / (1024 * 1024)
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`
}

function relativeTime(iso: string): string {
    return talosRelativeTime(iso, now.value, {
        justNow: t('chat.justNow'),
        minutesAgo: count => t('chat.minutesAgo', { count }),
        hoursAgo: count => t('chat.hoursAgo', { count }),
        daysAgo: count => t('chat.daysAgo', { count }),
    })
}

function messageStateLabel(state: string): string {
    if (state === 'pending') return t('chat.statePending')
    if (state === 'failed') return t('chat.stateFailed')
    if (state === 'cancelled') return t('chat.stateCancelled')
    return state
}
</script>

<template>
    <div
        class="mx-auto flex min-w-0 w-full max-w-[820px] flex-col overflow-x-hidden px-3 py-4"
        data-testid="talos-mobile-message-list"
        :data-text-scale="props.textScale ?? 'balanced'"
        :style="{ fontSize: talosChatTextSize(props.textScale) }"
    >
        <!-- Defect #4 (SF): paging had no visible state at all — no spinner and
             no affordance, so on a thread whose first page did not overflow
             there was no way to reach the older messages, and no sign the app
             was working when it was. -->
        <div
            v-if="props.hasOlderMessages"
            data-testid="talos-older-messages"
            class="mb-2 flex items-center justify-center gap-2 text-2xs text-[var(--talos-muted)]"
        >
            <span v-if="props.loadingOlderMessages" class="talos-typing-pulse" aria-hidden="true"></span>
            <span>{{ props.loadingOlderMessages ? $t('chat.loadingEarlier') : $t('chat.scrollEarlier') }}</span>
        </div>

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
                    class="talos-message-bubble min-w-0 overflow-hidden leading-6"
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
                    <!-- Defect #5: the model's own reasoning, collapsed, ABOVE
                         the answer — it is how the answer was reached, so
                         putting it after would read backwards. -->
                    <TalosMobileReasoningBlock
                        v-if="message.role === 'assistant' && message.reasoning"
                        :reasoning="message.reasoning"
                    />
                    <TalosMobileMessageContent
                        :content="message.content"
                    />
                    <!-- Owner 2026-07-26: the "Sources" pill, under the answer
                         and never above it — you read the claim, then check what
                         it rests on. -->
                    <TalosMobileSourcesChip
                        v-if="Array.isArray(message.metadata.sources) && message.metadata.sources.length"
                        :sources="message.metadata.sources as never"
                    />
                    <!-- F4 Memory: one calm-thread disclosure; every injected
                         turn still retains its own auditable metadata. -->
                    <div
                        v-if="message.id === firstMemoryDisclosureMessageId"
                        data-testid="talos-used-memories"
                        class="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
                        :title="(message.metadata.used_memories as Array<{ title?: string }>).map((entry) => entry?.title ?? '').join(' · ')"
                    >
                        <BookMarked class="size-3.5 shrink-0" aria-hidden="true" />
                        {{ (message.metadata.used_memories as unknown[]).length === 1
                            ? $t('chat.memoryUsedOne')
                            : $t('chat.memoryUsedMany', { count: (message.metadata.used_memories as unknown[]).length }) }}
                    </div>
                    <!-- Owner 2026-07-25 Library: injected-doc disclosure stays
                         in metadata and is not repeated as visual chrome. -->
                    <div
                        v-if="message.attachments?.length"
                        class="mt-2 flex max-w-full flex-wrap gap-1.5"
                        role="list"
                        :aria-label="$t('chat.attachedFiles')"
                    >
                        <!-- An image is SHOWN. Owner 2026-07-27: a photo
                             rendered as a chip with its filename is the one
                             thing a photo is not. -->
                        <TalosMobileMessageImage
                            v-for="attachment in imageAttachments(message)"
                            :key="attachment.id"
                            :file-id="attachment.vault_file_id ?? attachment.id"
                            :name="attachment.display_name"
                            role="listitem"
                            :data-message-attachment-id="attachment.id"
                        />
                        <span
                            v-for="attachment in fileAttachments(message)"
                            :key="attachment.id"
                            :data-message-attachment-id="attachment.id"
                            :title="attachment.media_type"
                            role="listitem"
                            class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
                        >
                            <FileText class="size-3.5 shrink-0" aria-hidden="true" />
                            <span class="max-w-[180px] truncate">{{ attachment.display_name }}</span>
                            <span class="shrink-0 opacity-75">{{ formatBytes(attachment.size_bytes) }}</span>
                            <span v-if="attachment.grant_status === 'revoked'" class="shrink-0">{{ $t('chat.accessRevoked') }}</span>
                        </span>
                    </div>
                    <TalosMobileBrowserActivity
                        v-if="message.browserActivities?.length"
                        :activities="message.browserActivities"
                    />
                </div>
                <div v-if="isGroupEnd(index)" class="talos-message-meta mt-1 flex max-w-[92%] items-center gap-1.5 px-1 font-mono text-2xs text-[var(--talos-muted)]">
                    <span>{{ message.role === 'user' ? $t('chat.you') : 'TALOS' }}</span>
                    <template v-if="modelLabel(message)">
                        <span aria-hidden="true">·</span>
                        <span>{{ modelLabel(message) }}</span>
                    </template>
                    <span aria-hidden="true">·</span>
                    <span>{{ relativeTime(message.created_at) }}</span>
                    <template v-if="message.state !== 'persisted'">
                        <span aria-hidden="true">·</span>
                        <span>{{ messageStateLabel(message.state) }}</span>
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
                    @save-to-library="emit('saveToLibrary', $event.id)"
                />
            </template>
        </article>

        <!-- R1-5: the streaming tail subscribes to the store on its own — a
             token burst re-renders only that subtree, never this list. -->
        <TalosMobileStreamingReply />
        <span data-testid="talos-mobile-message-action-status" class="sr-only" role="status" aria-live="polite">{{ copyStatus }}</span>
    </div>
</template>
