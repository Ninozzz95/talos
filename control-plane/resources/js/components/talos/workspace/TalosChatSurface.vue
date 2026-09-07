<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertCircle, FileText, Loader2 } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import TalosBrowserClarificationChoices from '../chat/TalosBrowserClarificationChoices.vue'
import Skeleton from '../../ui/Skeleton.vue'
import TalosMessageContent from '../chat/TalosMessageContent.vue'
import TalosMessageActions from '../chat/TalosMessageActions.vue'
import TalosRunActivity from '../chat/TalosRunActivity.vue'
import TalosAutoReceipt from '../chat/TalosAutoReceipt.vue'
import TalosStatusMessage from '../chat/TalosStatusMessage.vue'
import TalosGuidedStart from './TalosGuidedStart.vue'
import TalosLiveEdgeControl from './TalosLiveEdgeControl.vue'
import { resolveTalosWelcomePrompt } from '../../../lib/talosWelcomePrompts'
import {
    activitiesForBrowserCard,
    buildTalosBrowserCardPlacements,
    unplacedBrowserActivities,
    unplacedBrowserApprovals,
    type TalosBrowserCardPlacement,
} from '../../../lib/talosBrowserCardPlacement'
import type { TalosMessage } from '../../../lib/talosTypes'
import {
    parseTalosMessageMetadata,
    type TalosMessageAttachment,
    type TalosMessageMetadataProjection,
    type TalosToolActivity,
    type TalosVisibleReasoning,
} from '../../../lib/talosMessageMetadata'
import type {
    TalosBrowserActivity as TalosBrowserActivityItem,
    TalosBrowserClarificationChoice,
    TalosBrowserCurrentPage,
    TalosBrowserHmiChallenge,
    TalosBrowserPointerFrame,
    TalosBrowserRefFrame,
    TalosBrowserRefInteraction,
    TalosBrowserScrollFrame,
    TalosBrowserSession,
    TalosBrowserSnapshotPreview,
    TalosBrowserTask,
    TalosMessageStyle,
    TalosMobileWindowPresentation,
    TalosPendingToolApproval,
} from '../../../lib/talosTypes'
import type { TalosChatViewportController } from '../../../composables/useTalosChatViewport'
import type { TalosStreamingChatState } from '../../../composables/useTalosStreamingChat'

const TalosBrowserScreenshotEvidence = defineAsyncComponent(
    () => import('../chat/TalosBrowserScreenshotEvidence.vue'),
)
const TalosBrowserActivity = defineAsyncComponent(
    () => import('../chat/TalosBrowserActivity.vue'),
)
const TalosBrowserCard = defineAsyncComponent(
    () => import('../chat/TalosBrowserCard.vue'),
)
const TalosEvidenceDrawer = defineAsyncComponent(
    () => import('../chat/TalosEvidenceDrawer.vue'),
)
const TalosReasoningDrawer = defineAsyncComponent(
    () => import('../chat/TalosReasoningDrawer.vue'),
)
const TalosMessageImage = defineAsyncComponent(
    () => import('../chat/TalosMessageImage.vue'),
)
const TalosReasoningRow = defineAsyncComponent(
    () => import('../chat/TalosReasoningRow.vue'),
)
const TalosToolActivityRow = defineAsyncComponent(
    () => import('../chat/TalosToolActivityRow.vue'),
)
const TalosStreamingReply = defineAsyncComponent(
    () => import('../chat/TalosStreamingReply.vue'),
)

type MessageSource = {
    context_set_id?: string
    file_id?: string
    chunk_id?: string
    file_name?: string
    preview?: string
}

const props = withDefaults(defineProps<{
    uiError: string | null
    sessionError: string | null
    messageError: string | null
    modelProfileError: string | null
    contextSetError: string | null
    loadingMessages: boolean
    messages: TalosMessage[]
    logoUrl: string
    selectedModelProfileIsUsable: boolean
    contextSelected: boolean
    contextSetsCount: number
    sessionReady: boolean
    messageEvidenceReady: boolean
    sending: boolean
    streamingState?: Readonly<TalosStreamingChatState> | null
    streamingReducedMotion?: boolean
    benchmarkingRunId: string | null
    expandedEvidenceMessageIds: string[]
    welcomePromptId?: string | null
    showWelcomeMessage: boolean
    showMissionPath: boolean
    fullWidthChat: boolean
    sensitiveBlur: boolean
    censorEnabled?: boolean
    messageScale: number
    messageStyle?: TalosMessageStyle
    browserActivities: TalosBrowserActivityItem[]
    browserSnapshot: TalosBrowserSnapshotPreview | null
    activeBrowserSession: TalosBrowserSession | null
    browserInteractionPending: boolean
    browserInteractionLocked: boolean
    browserInteractionError: string | null
    pendingBrowserInteractionApproval: TalosBrowserHmiChallenge | null
    browserRefFrame: TalosBrowserRefFrame | null
    browserRefTargetsLoading: boolean
    browserRefTargetsError: string | null
    pendingToolApprovals: TalosPendingToolApproval[]
    decidingToolApprovalIds: string[]
    browserTasks: TalosBrowserTask[]
    browserTaskBusy: boolean
    browserTaskError: string | null
    browserTaskCommandTargetId: string | null
    devBrowserEvidence: boolean
    developmentMode?: boolean
    activeTalosSessionId: string | null
    mobile: boolean
    mobileWindowPresentation: TalosMobileWindowPresentation
    viewport: TalosChatViewportController
}>(), {
    censorEnabled: true,
    developmentMode: false,
    messageStyle: 'sections',
    streamingReducedMotion: false,
    streamingState: null,
})

const emit = defineEmits<{
    openModel: []
    openContext: []
    setPrompt: [prompt: string]
    messageCopied: []
    messageCopyFailed: []
    messageEdited: []
    resendMessage: [message: TalosMessage]
    retryAssistantMessage: [message: TalosMessage]
    openChatMedia: [attachment: TalosMessageAttachment]
    toggleMessageEvidence: [message: TalosMessage]
    benchmarkMessageRun: [message: TalosMessage]
    interactBrowserFrame: [frame: TalosBrowserPointerFrame]
    interactBrowserRef: [interaction: TalosBrowserRefInteraction]
    scrollBrowserFrame: [frame: TalosBrowserScrollFrame]
    confirmBrowserFrameInteraction: [decision: 'approve' | 'reject']
    decideToolApproval: [approval: TalosPendingToolApproval, decision: 'approve' | 'reject']
    cancelBrowserTask: [taskId: string]
}>()

const chatThreadEl = ref<HTMLElement | null>(null)
const welcomePrompt = computed(() => resolveTalosWelcomePrompt(props.welcomePromptId, props.welcomePromptId ?? 'talos'))
const unseenUpdates = computed(() => props.viewport.unseenCount.value)
const visibleStreamingState = computed(() => {
    const state = props.streamingState
    if (!state || !props.activeTalosSessionId || state.ownerSessionId !== props.activeTalosSessionId) {
        return null
    }

    return ['connecting', 'streaming', 'awaiting_approval', 'cancelled', 'failed'].includes(state.status)
        ? state
        : null
})
const emptyMessageMetadata = parseTalosMessageMetadata(null)
const messageMetadataById = computed(() => new Map(
    props.messages.map((message) => [message.id, parseTalosMessageMetadata(message.metadata)]),
))
const selectedReasoningMessageId = ref<string | null>(null)
const selectedReasoning = computed(() => {
    const messageId = selectedReasoningMessageId.value
    return messageId ? messageMetadataById.value.get(messageId)?.visibleReasoning ?? null : null
})

function messageMetadata(message: TalosMessage): TalosMessageMetadataProjection {
    return messageMetadataById.value.get(message.id) ?? emptyMessageMetadata
}

function messageAttachments(message: TalosMessage): readonly TalosMessageAttachment[] {
    return messageMetadata(message).attachments
}

function messageImageAttachments(message: TalosMessage): readonly TalosMessageAttachment[] {
    return messageAttachments(message).filter((attachment) => (
        ['image/png', 'image/jpeg', 'image/webp'].includes(attachment.mime_type ?? '')
        && Boolean(attachment.content_url)
    ))
}

function messageVisibleReasoning(message: TalosMessage): TalosVisibleReasoning | null {
    return message.role === 'assistant' ? messageMetadata(message).visibleReasoning : null
}

function messageToolActivities(message: TalosMessage): readonly TalosToolActivity[] {
    return message.role === 'assistant' ? messageMetadata(message).toolActivities : []
}

function messageBrowserActivities(message: TalosMessage): TalosBrowserActivityItem[] {
    const activities = messageMetadata(message).browserActivities

    return activities.flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
        const activity = candidate as Record<string, unknown>
        if (activity.operation !== 'screenshot' || activity.status !== 'succeeded') return []
        if (typeof activity.id !== 'string'
            || typeof activity.label !== 'string'
            || typeof activity.browser_session_id !== 'string'
            || typeof activity.occurred_at !== 'string'
            || !Array.isArray(activity.artifact_ids)) return []

        const artifactIds = activity.artifact_ids.filter((artifactId): artifactId is string => typeof artifactId === 'string' && artifactId.trim() !== '')
        if (!artifactIds.length) return []

        return [{
            id: activity.id,
            operation: 'screenshot',
            status: 'succeeded',
            label: activity.label,
            run_id: typeof activity.run_id === 'string' ? activity.run_id : null,
            browser_session_id: activity.browser_session_id,
            artifact_ids: artifactIds,
            occurred_at: activity.occurred_at,
        }]
    })
}

function messageBrowserClarificationChoices(message: TalosMessage): TalosBrowserClarificationChoice[] {
    const followUp = messageMetadata(message).browserFollowUp
    if (message.role !== 'assistant'
        || !followUp
        || typeof followUp !== 'object'
        || Array.isArray(followUp)) return []

    const record = followUp as Record<string, unknown>
    if (record.schema_version !== 'talos_browser_follow_up_v1'
        || record.operation !== 'clarify'
        || !Array.isArray(record.choices)) return []

    return record.choices.flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
        const choice = candidate as Record<string, unknown>
        if (!Number.isInteger(choice.index)
            || typeof choice.url !== 'string'
            || typeof choice.host !== 'string'
            || typeof choice.label !== 'string') return []

        return [{
            index: choice.index as number,
            url: choice.url,
            host: choice.host,
            label: choice.label,
        }]
    }).sort((left, right) => left.index - right.index)
}

const currentBrowserScreenshotActivity = computed(() => [...props.browserActivities].reverse().find((activity) => (
    activity.operation === 'screenshot'
    && activity.status === 'succeeded'
    && activity.artifact_ids.length > 0
)) ?? null)

const browserCardPlacements = computed(() => buildTalosBrowserCardPlacements(props.messages, props.browserTasks))
const persistedMessageBrowserActivityIds = computed(() => props.messages
    .flatMap(messageBrowserActivities)
    .map((activity) => activity.id))
const unplacedCurrentBrowserActivities = computed(() => unplacedBrowserActivities(
    browserCardPlacements.value,
    props.browserActivities,
    persistedMessageBrowserActivityIds.value,
    props.activeBrowserSession?.id ?? null,
))
const unplacedCurrentBrowserApprovals = computed(() => unplacedBrowserApprovals(
    browserCardPlacements.value,
    props.pendingToolApprovals,
    props.activeBrowserSession?.id ?? null,
))
const hasUnplacedBrowserSessionActivity = computed(() => (
    unplacedCurrentBrowserActivities.value.length > 0
    || unplacedCurrentBrowserApprovals.value.length > 0
))
const currentBrowserSessionActivityTime = computed(() => unplacedCurrentBrowserActivities.value.at(-1)?.occurred_at ?? null)

function responseBrowserPlacements(message: TalosMessage): TalosBrowserCardPlacement[] {
    return browserCardPlacements.value.filter((placement) => placement.responseMessage?.id === message.id)
}

function transientBrowserPlacements(message: TalosMessage): TalosBrowserCardPlacement[] {
    return browserCardPlacements.value.filter((placement) => (
        placement.needsTransientAssistantShell && placement.originMessage.id === message.id
    ))
}

function browserActivitiesForPlacement(placement: TalosBrowserCardPlacement): TalosBrowserActivityItem[] {
    const persisted = props.messages
        .filter((message) => message.run_id === placement.originMessage.run_id)
        .flatMap(messageBrowserActivities)
    return activitiesForBrowserCard(placement, [...props.browserActivities, ...persisted])
}

function browserSessionForPlacement(placement: TalosBrowserCardPlacement): TalosBrowserSession | null {
    return props.activeBrowserSession?.id === placement.task.browser_session_id
        ? props.activeBrowserSession
        : null
}

function browserPageForPlacement(placement: TalosBrowserCardPlacement): TalosBrowserCurrentPage | null {
    const session = browserSessionForPlacement(placement)
    const url = session?.current_url?.trim()
    if (!session || !url) return null

    try {
        const parsed = new URL(url)
        return {
            host: parsed.host,
            title: session.current_title?.trim() || parsed.host,
            url,
        }
    } catch {
        return {
            host: 'Current page',
            title: session.current_title?.trim() || 'Current page',
            url,
        }
    }
}

function browserSnapshotForPlacement(placement: TalosBrowserCardPlacement): TalosBrowserSnapshotPreview | null {
    return browserSessionForPlacement(placement) ? props.browserSnapshot : null
}

function pendingApprovalsForPlacement(placement: TalosBrowserCardPlacement): TalosPendingToolApproval[] {
    const runId = placement.originMessage.run_id
    const browserSessionId = placement.task.browser_session_id
    if (!runId || !browserSessionId) return []
    return props.pendingToolApprovals.filter((approval) => (
        approval.run_id === runId && approval.browser_session_id === browserSessionId
    ))
}

function placementOwnsActiveSession(placement: TalosBrowserCardPlacement): boolean {
    return browserSessionForPlacement(placement) !== null
}

function placementOwnsTaskCommand(placement: TalosBrowserCardPlacement): boolean {
    return props.browserTaskCommandTargetId === placement.task.id
}

function scrollToBottom() {
    void props.viewport.followLatest()
}

onMounted(() => props.viewport.registerThread(chatThreadEl.value))
onBeforeUnmount(() => props.viewport.registerThread(null))
watch(() => [props.messages.length, props.browserActivities.length, props.expandedEvidenceMessageIds.length] as const, (counts, previousCounts) => {
    const incoming = counts.some((count, index) => count > (previousCounts?.[index] ?? 0))
    if (!incoming) return
    if (props.viewport.atLiveEdge.value) {
        void props.viewport.followLatest()
    } else {
        props.viewport.noteIncomingContent()
    }
})

function formatTime(value: string) {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function messageIsGrouped(index: number) {
    const current = props.messages[index]
    const previous = props.messages[index - 1]

    return Boolean(previous && current.role !== 'system' && previous.role === current.role)
}

function messageIsGroupEnd(index: number) {
    const current = props.messages[index]
    const next = props.messages[index + 1]

    return !next || next.role !== current.role
}

// Assistant answers render as full-width sections (no bubble) unless the operator
// opted back into bubbles; user and system messages are unaffected by this choice.
function messageSurfaceClass(message: TalosMessage) {
    if (message.role === 'user') {
        return 'max-w-[min(720px,100%)] border border-transparent bg-[var(--talos-user)] text-[var(--talos-user-text)]'
    }
    if (message.role === 'system') {
        return 'w-full max-w-full border border-transparent bg-transparent text-[var(--talos-text)]'
    }
    if (props.messageStyle === 'sections') {
        return 'talos-message-section w-full max-w-full border border-transparent bg-transparent text-[var(--talos-text)]'
    }
    return 'max-w-[min(720px,100%)] border border-[var(--talos-border)] bg-[var(--talos-assistant)] text-[var(--talos-assistant-text)]'
}

// Long user messages collapse by default with an explicit Expand/Reduce control,
// keeping the thread scannable without ever silently truncating content.
const expandedUserMessages = ref<Set<string>>(new Set())
function userMessageIsLong(message: TalosMessage) {
    if (message.role !== 'user') return false
    const content = message.content ?? ''
    return content.length > 320 || content.split('\n').length > 6
}
function userMessageCollapsed(message: TalosMessage) {
    return userMessageIsLong(message) && !expandedUserMessages.value.has(message.id)
}
function toggleUserMessageExpanded(id: string) {
    const next = new Set(expandedUserMessages.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedUserMessages.value = next
}

function messageLabel(message: TalosMessage) {
    if (message.role === 'user') {
        return 'Tu'
    }

    if (message.role === 'assistant') {
        return 'TALOS'
    }

    return 'Sistema'
}

function messageMeta(message: TalosMessage) {
    if (message.role === 'user') {
        return 'persisted prompt'
    }

    const summary = message.metadata?.summary
    if (typeof summary === 'string' && summary.trim()) {
        return summary.replaceAll('_', ' ')
    }

    const faultType = message.metadata?.fault_type
    if (typeof faultType === 'string' && faultType.trim()) {
        return faultType.replaceAll('_', ' ')
    }

    return message.role === 'assistant' ? 'persisted answer' : 'system note'
}

function messageMutations(message: TalosMessage) {
    const mutations = messageMetadata(message).raw.mutations
    return Array.isArray(mutations) ? mutations : []
}

function messageSources(message: TalosMessage): MessageSource[] {
    return messageMetadata(message).usedContext as readonly MessageSource[] as MessageSource[]
}

function messageHasEvidence(message: TalosMessage) {
    return message.role === 'assistant'
        && (Boolean(message.run_id) || messageMutations(message).length > 0 || messageSources(message).length > 0)
}

function messageEvidenceOpen(message: TalosMessage) {
    return props.expandedEvidenceMessageIds.includes(message.id)
}

function previousUserMessageFor(message: TalosMessage) {
    const index = props.messages.findIndex((item) => item.id === message.id)

    if (index <= 0) {
        return null
    }

    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const candidate = props.messages[cursor]
        if (candidate.role === 'user') {
            return candidate
        }
    }

    return null
}

function canRetryAssistantMessage(message: TalosMessage) {
    return message.role === 'assistant' && Boolean(previousUserMessageFor(message))
}

function fallbackCopyText(value: string) {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()

    try {
        return document.execCommand('copy')
    } finally {
        document.body.removeChild(textarea)
    }
}

async function copyMessage(message: TalosMessage) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(message.content)
        } else if (!fallbackCopyText(message.content)) {
            throw new Error('Clipboard API unavailable.')
        }
    } catch {
        if (!fallbackCopyText(message.content)) {
            emit('messageCopyFailed')
            return
        }
    }

    emit('messageCopied')
}

function editMessage(message: TalosMessage) {
    if (message.role !== 'user') {
        return
    }

    emit('setPrompt', message.content)
    emit('messageEdited')

    nextTick(() => {
        document.querySelector<HTMLTextAreaElement>('[aria-label="Message TALOS"]')?.focus()
    })
}

function sourceLabel(source: MessageSource, index: number) {
    return source.file_name || source.chunk_id || source.file_id || `Source ${index + 1}`
}

function sourcePreview(source: MessageSource) {
    return source.preview || 'Context source attached to this answer.'
}

function openReasoning(message: TalosMessage) {
    if (!messageVisibleReasoning(message)) return
    selectedReasoningMessageId.value = message.id
}

function closeReasoning() {
    selectedReasoningMessageId.value = null
}

function messageContainsSensitiveText(value: string) {
    return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)
        || /\b(?:sk|pk|tok|key|secret)[-_][A-Za-z0-9._-]{8,}\b/i.test(value)
        || /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password)\b/i.test(value)
}

defineExpose({ scrollToBottom })
</script>

<template>
    <section ref="chatThreadEl" class="talos-chat-thread relative z-10 min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 md:px-6" aria-label="TALOS chat thread">
        <Teleport to="body">
            <TalosLiveEdgeControl
                v-if="unseenUpdates > 0"
                :unseen-updates="unseenUpdates"
                :composer-height="viewport.composerHeight.value"
                @return-to-latest="viewport.followLatest()"
            />
        </Teleport>
        <TalosReasoningDrawer
            v-if="selectedReasoning"
            :open="true"
            :reasoning="selectedReasoning"
            @update:open="closeReasoning"
        />
        <div class="mx-auto flex min-h-full min-w-0 w-full flex-col" :class="fullWidthChat ? 'max-w-[min(1120px,calc(100vw-3rem))]' : 'max-w-3xl'">
            <div v-if="uiError || sessionError || messageError" class="mb-4 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                <span>{{ uiError || sessionError || messageError }}</span>
            </div>
            <div v-if="modelProfileError" class="mb-4 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                <span>{{ modelProfileError }}</span>
            </div>
            <div v-if="contextSetError" class="mb-4 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                <span>{{ contextSetError }}</span>
            </div>

            <div v-if="loadingMessages" role="status" aria-label="Loading messages" class="flex flex-1 flex-col justify-center gap-3 py-6">
                <span class="sr-only">Loading messages</span>
                <Skeleton preset="list" :count="3" />
            </div>

            <div v-else-if="!messages.length && !hasUnplacedBrowserSessionActivity" class="flex flex-1 flex-col items-center justify-center text-center">
                <div data-testid="talos-empty-brand" class="talos-chat-empty-brand mb-4 flex items-center justify-center gap-3" aria-label="TALOS">
                    <span class="talos-short-logo talos-short-logo-hero talos-chat-brand-logo" aria-hidden="true">
                        <span class="talos-short-logo-mark"></span>
                    </span>
                    <span class="talos-orbitron-brand text-4xl font-semibold text-[var(--talos-text)] sm:text-5xl">TALOS</span>
                </div>
                <template v-if="showWelcomeMessage">
                    <h2 class="text-2xl font-semibold text-[var(--talos-text)]">{{ welcomePrompt.headline }}</h2>
                    <p class="mt-3 max-w-[560px] text-sm leading-6 text-[var(--talos-muted)]">
                        {{ welcomePrompt.body }}
                    </p>
                </template>
                <TalosGuidedStart
                    v-if="showMissionPath"
                    class="mt-5"
                    :model-ready="selectedModelProfileIsUsable"
                    :context-selected="contextSelected"
                    :context-available="contextSetsCount > 0"
                    :session-ready="sessionReady"
                    :evidence-ready="messageEvidenceReady"
                    @open-model="emit('openModel')"
                    @open-context="emit('openContext')"
                />
                <div v-if="showWelcomeMessage" class="mt-5 flex flex-wrap justify-center gap-2">
                    <button type="button" class="rounded-md border border-[var(--talos-border)] px-3 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="emit('setPrompt', 'Create a verified workflow for checking an external API.')">
                        Verify API
                    </button>
                    <button type="button" class="rounded-md border border-[var(--talos-border)] px-3 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="emit('setPrompt', 'Analyze these logs and build a replayable plan.')">
                        Analyze logs
                    </button>
                    <button type="button" class="rounded-md border border-[var(--talos-border)] px-3 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="emit('setPrompt', 'Generate a DAG for reading and validating a CSV dataset.')">
                        Generate DAG
                    </button>
                </div>
            </div>

            <div v-else class="space-y-5">
                <template v-for="(message, index) in messages" :key="message.id">
                    <article
                        class="talos-chat-message flex flex-col"
                        :class="message.role === 'user' ? 'items-end' : 'items-start'"
                        :data-message-role="message.role"
                        :data-message-id="message.id"
                        :data-grouped="messageIsGrouped(index) ? 'true' : undefined"
                    >
                    <div
                        class="talos-message-bubble min-w-0 rounded-md"
                        :data-message-kind="message.role"
                        :data-message-scale="messageScale"
                        :data-message-style="messageStyle"
                        :class="messageSurfaceClass(message)"
                    >
                        <TalosStatusMessage
                            v-if="message.role === 'system'"
                            :message="message"
                        />
                        <TalosReasoningRow
                            v-if="messageVisibleReasoning(message)"
                            :reasoning="messageVisibleReasoning(message)!"
                            @open="openReasoning(message)"
                        />
                        <div
                            v-if="messageToolActivities(message).length"
                            class="mt-2 space-y-1"
                            aria-label="Tool activity"
                        >
                            <TalosToolActivityRow
                                v-for="activity in messageToolActivities(message)"
                                :key="activity.id"
                                :activity="activity"
                            />
                        </div>
                        <TalosMessageContent
                            v-if="message.role === 'assistant'"
                            :content="message.content"
                            :sensitive="sensitiveBlur && messageContainsSensitiveText(message.content)"
                            :censor-enabled="censorEnabled"
                        />
                        <TalosBrowserClarificationChoices
                            v-if="messageBrowserClarificationChoices(message).length"
                            :choices="messageBrowserClarificationChoices(message)"
                            @select="emit('setPrompt', $event)"
                        />
                        <TalosBrowserCard
                            v-for="placement in responseBrowserPlacements(message)"
                            :key="placement.task.id"
                            :task="placement.task"
                            :activities="browserActivitiesForPlacement(placement)"
                            :snapshot="browserSnapshotForPlacement(placement)"
                            :talos-session-id="activeTalosSessionId"
                            :current-page="browserPageForPlacement(placement)"
                            :active-browser-session="browserSessionForPlacement(placement)"
                            :interaction-pending="placementOwnsActiveSession(placement) && browserInteractionPending"
                            :interaction-locked="placementOwnsActiveSession(placement) && browserInteractionLocked"
                            :interaction-error="placementOwnsActiveSession(placement) ? browserInteractionError : null"
                            :pending-interaction-approval="placementOwnsActiveSession(placement) ? pendingBrowserInteractionApproval : null"
                            :ref-frame="placementOwnsActiveSession(placement) ? browserRefFrame : null"
                            :ref-targets-loading="placementOwnsActiveSession(placement) && browserRefTargetsLoading"
                            :ref-targets-error="placementOwnsActiveSession(placement) ? browserRefTargetsError : null"
                            :pending-tool-approvals="pendingApprovalsForPlacement(placement)"
                            :deciding-tool-approval-ids="decidingToolApprovalIds"
                            :browser-task-busy="placementOwnsTaskCommand(placement) && browserTaskBusy"
                            :browser-task-error="placementOwnsTaskCommand(placement) ? browserTaskError : null"
                            :browser-task-command-pending="browserTaskBusy"
                            :dev-browser-evidence="devBrowserEvidence"
                            :mobile="mobile"
                            :mobile-window-presentation="mobileWindowPresentation"
                            @interact="emit('interactBrowserFrame', $event)"
                            @interact-ref="emit('interactBrowserRef', $event)"
                            @scroll="emit('scrollBrowserFrame', $event)"
                            @confirm="emit('confirmBrowserFrameInteraction', $event)"
                            @decide-tool-approval="(approval, decision) => emit('decideToolApproval', approval, decision)"
                            @cancel-task="emit('cancelBrowserTask', $event)"
                        />
                        <TalosBrowserScreenshotEvidence
                            v-if="message.role === 'assistant' && responseBrowserPlacements(message).length === 0"
                            :activities="messageBrowserActivities(message)"
                            :current-frame-activity="currentBrowserScreenshotActivity"
                            :talos-session-id="activeTalosSessionId"
                            :active-browser-session="activeBrowserSession"
                            :interaction-pending="browserInteractionPending"
                            :interaction-locked="browserInteractionLocked"
                            :interaction-error="browserInteractionError"
                            :pending-interaction-approval="pendingBrowserInteractionApproval"
                            :ref-frame="browserRefFrame"
                            :ref-targets-loading="browserRefTargetsLoading"
                            :ref-targets-error="browserRefTargetsError"
                            :mobile="mobile"
                            :mobile-window-presentation="mobileWindowPresentation"
                            loading-strategy="eager"
                            @interact="emit('interactBrowserFrame', $event)"
                            @interact-ref="emit('interactBrowserRef', $event)"
                            @scroll="emit('scrollBrowserFrame', $event)"
                            @confirm="emit('confirmBrowserFrameInteraction', $event)"
                        />
                        <TalosRunActivity
                            v-if="message.role === 'assistant'"
                            :message="message"
                            :development-mode="developmentMode"
                        />
                        <TalosAutoReceipt
                            v-if="message.role === 'assistant'"
                            :message="message"
                        />
                        <template v-if="message.role !== 'assistant' && message.role !== 'system'">
                            <p
                                class="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]"
                                :class="userMessageCollapsed(message) ? 'max-h-[7.5em] overflow-hidden [mask-image:linear-gradient(#000_65%,transparent)]' : ''"
                            >
                                {{ message.content }}
                            </p>
                            <button
                                v-if="userMessageIsLong(message)"
                                type="button"
                                data-testid="talos-user-message-toggle"
                                class="mt-1.5 text-xs font-semibold text-[var(--talos-accent)] hover:underline"
                                @click="toggleUserMessageExpanded(message.id)"
                            >
                                {{ userMessageCollapsed(message) ? 'Expand' : 'Reduce' }}
                            </button>
                        </template>
                        <div v-if="messageImageAttachments(message).length" class="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                            <TalosMessageImage
                                v-for="attachment in messageImageAttachments(message)"
                                :key="attachment.file_id"
                                :attachment="attachment"
                                @open="emit('openChatMedia', $event)"
                            />
                        </div>
                        <div v-if="messageAttachments(message).length > 0" class="mt-2 flex flex-wrap gap-1.5">
                            <span
                                v-for="attachment in messageAttachments(message)"
                                :key="attachment.file_id"
                                data-testid="talos-message-attachment"
                                class="inline-flex min-w-0 max-w-56 items-center gap-1.5 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 py-0.5 text-xs text-[var(--talos-text)]"
                                :title="attachment.name"
                            >
                                <FileText class="h-3 w-3 shrink-0 text-[var(--talos-accent)]" />
                                <span class="truncate">{{ attachment.name }}</span>
                            </span>
                        </div>
                        <div v-if="message.role === 'assistant'" class="mt-3 flex flex-wrap gap-2">
                            <Badge v-if="messageMutations(message).length" tone="success">{{ messageMutations(message).length }} JMP</Badge>
                            <Badge tone="neutral">Persisted</Badge>
                        </div>
                        <TalosEvidenceDrawer
                            v-if="message.role === 'assistant' && messageEvidenceOpen(message)"
                            :message="message"
                        />
                        <div v-if="message.role === 'assistant' && messageSources(message).length" class="mt-3 min-w-0 max-w-full overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Source provenance</div>
                            <div class="mt-2 space-y-2">
                                <article
                                    v-for="(source, index) in messageSources(message)"
                                    :key="`${source.context_set_id ?? 'context'}-${source.chunk_id ?? source.file_id ?? index}`"
                                    class="min-w-0 max-w-full overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2"
                                >
                                    <div class="truncate text-xs font-semibold text-[var(--talos-text)]">{{ sourceLabel(source, index) }}</div>
                                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ sourcePreview(source) }}</p>
                                </article>
                            </div>
                        </div>
                    </div>
                    <div v-if="message.role !== 'system' && messageIsGroupEnd(index)" class="talos-message-meta mt-1 flex max-w-full flex-wrap items-center gap-2 px-1 text-[var(--talos-muted)]">
                        <span class="font-semibold">{{ messageLabel(message) }}</span>
                        <span>{{ messageMeta(message) }}</span>
                        <span>{{ formatTime(message.created_at) }}</span>
                    </div>
                    <TalosMessageActions
                        v-if="message.role !== 'system' && messageIsGroupEnd(index)"
                        class="talos-message-actions mt-1"
                        :message="message"
                        :busy="sending"
                        :can-retry="canRetryAssistantMessage(message)"
                        :has-media="messageImageAttachments(message).length > 0"
                        :has-evidence="messageHasEvidence(message)"
                        :evidence-open="messageEvidenceOpen(message)"
                        :has-benchmark="Boolean(message.run_id)"
                        :benchmarking="benchmarkingRunId === message.run_id"
                        @copy="copyMessage"
                        @edit="editMessage"
                        @open-media="emit('openChatMedia', messageImageAttachments($event)[0]!)"
                        @resend="emit('resendMessage', $event)"
                        @retry="emit('retryAssistantMessage', $event)"
                        @toggle-evidence="emit('toggleMessageEvidence', $event)"
                        @benchmark="emit('benchmarkMessageRun', $event)"
                    />
                    </article>

                    <article
                        v-for="placement in transientBrowserPlacements(message)"
                        :key="`browser-task-${placement.task.id}`"
                        class="talos-chat-message flex justify-start"
                        data-message-role="assistant"
                        :data-browser-task-id="placement.task.id"
                    >
                        <div
                            class="talos-message-bubble min-w-0 max-w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-assistant)] text-[var(--talos-assistant-text)]"
                            data-message-kind="assistant"
                            :data-message-scale="messageScale"
                        >
                            <div class="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase opacity-75">
                                <span class="font-semibold">TALOS</span>
                                <span>browser task</span>
                                <span>{{ formatTime(placement.task.updated_at ?? placement.task.created_at ?? message.created_at) }}</span>
                            </div>
                            <TalosBrowserCard
                                :task="placement.task"
                                :activities="browserActivitiesForPlacement(placement)"
                                :snapshot="browserSnapshotForPlacement(placement)"
                                :talos-session-id="activeTalosSessionId"
                                :current-page="browserPageForPlacement(placement)"
                                :active-browser-session="browserSessionForPlacement(placement)"
                                :interaction-pending="placementOwnsActiveSession(placement) && browserInteractionPending"
                                :interaction-locked="placementOwnsActiveSession(placement) && browserInteractionLocked"
                                :interaction-error="placementOwnsActiveSession(placement) ? browserInteractionError : null"
                                :pending-interaction-approval="placementOwnsActiveSession(placement) ? pendingBrowserInteractionApproval : null"
                                :ref-frame="placementOwnsActiveSession(placement) ? browserRefFrame : null"
                                :ref-targets-loading="placementOwnsActiveSession(placement) && browserRefTargetsLoading"
                                :ref-targets-error="placementOwnsActiveSession(placement) ? browserRefTargetsError : null"
                                :pending-tool-approvals="pendingApprovalsForPlacement(placement)"
                                :deciding-tool-approval-ids="decidingToolApprovalIds"
                                :browser-task-busy="placementOwnsTaskCommand(placement) && browserTaskBusy"
                                :browser-task-error="placementOwnsTaskCommand(placement) ? browserTaskError : null"
                                :browser-task-command-pending="browserTaskBusy"
                                :dev-browser-evidence="devBrowserEvidence"
                                :mobile="mobile"
                                :mobile-window-presentation="mobileWindowPresentation"
                                @interact="emit('interactBrowserFrame', $event)"
                                @interact-ref="emit('interactBrowserRef', $event)"
                                @scroll="emit('scrollBrowserFrame', $event)"
                                @confirm="emit('confirmBrowserFrameInteraction', $event)"
                                @decide-tool-approval="(approval, decision) => emit('decideToolApproval', approval, decision)"
                                @cancel-task="emit('cancelBrowserTask', $event)"
                            />
                        </div>
                    </article>
                </template>

                <TalosStreamingReply
                    v-if="visibleStreamingState"
                    :state="visibleStreamingState"
                    :reduced-motion="streamingReducedMotion"
                    :sensitive-blur="sensitiveBlur"
                />

                <article
                    v-if="hasUnplacedBrowserSessionActivity"
                    class="talos-chat-message flex justify-start"
                    data-message-role="browser"
                    data-browser-session-activity
                    data-testid="talos-browser-session-activity"
                    aria-label="Current Browser session activity"
                >
                    <div
                        class="talos-message-bubble min-w-0 max-w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-assistant)] text-[var(--talos-assistant-text)]"
                        data-message-kind="browser"
                        :data-message-scale="messageScale"
                    >
                        <div class="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase opacity-75">
                            <span class="font-semibold">TALOS</span>
                            <span>current Browser session</span>
                            <span v-if="currentBrowserSessionActivityTime">{{ formatTime(currentBrowserSessionActivityTime) }}</span>
                        </div>
                        <TalosBrowserActivity
                            embedded
                            :activities="unplacedCurrentBrowserActivities"
                            :snapshot="browserSnapshot"
                            :talos-session-id="activeTalosSessionId"
                            :active-browser-session="activeBrowserSession"
                            :interaction-pending="browserInteractionPending"
                            :interaction-locked="browserInteractionLocked"
                            :interaction-error="browserInteractionError"
                            :pending-interaction-approval="pendingBrowserInteractionApproval"
                            :ref-frame="browserRefFrame"
                            :ref-targets-loading="browserRefTargetsLoading"
                            :ref-targets-error="browserRefTargetsError"
                            :pending-tool-approvals="unplacedCurrentBrowserApprovals"
                            :deciding-tool-approval-ids="decidingToolApprovalIds"
                            :dev-browser-evidence="devBrowserEvidence"
                            :mobile="mobile"
                            :mobile-window-presentation="mobileWindowPresentation"
                            @interact="emit('interactBrowserFrame', $event)"
                            @interact-ref="emit('interactBrowserRef', $event)"
                            @scroll="emit('scrollBrowserFrame', $event)"
                            @confirm="emit('confirmBrowserFrameInteraction', $event)"
                            @decide-tool-approval="(approval, decision) => emit('decideToolApproval', approval, decision)"
                        />
                    </div>
                </article>

                <div v-if="sending && !visibleStreamingState" class="flex justify-start">
                    <div class="inline-flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-4 py-3 text-sm text-[var(--talos-muted)]">
                        <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                        Processing
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>

<style scoped>
.talos-chat-thread {
    scrollbar-gutter: stable;
    padding-top: calc(1.75rem + var(--talos-chat-focus-top, 0px));
    padding-bottom: calc(var(--talos-composer-height, 168px) + env(safe-area-inset-bottom) + 48px);
}

.talos-message-bubble {
    max-width: var(--talos-message-max-width, 760px);
    padding-inline: var(--talos-message-padding-inline, 1rem);
    padding-block: var(--talos-message-padding-block, 0.75rem);
    font-size: var(--talos-message-font-size, 0.875rem);
    line-height: var(--talos-message-line-height, 1.5rem);
}

.talos-message-bubble.talos-message-section {
    max-width: none;
}

.talos-message-bubble[data-message-kind='system'] {
    border: 0;
    background: transparent;
    padding: 0;
}

.talos-chat-message[data-grouped='true'] {
    margin-top: 0.25rem !important;
}

.talos-chat-message:focus-within,
.talos-chat-message:has([aria-expanded='true']) {
    position: relative;
    z-index: 40;
}

/*
 * Message actions live below the bubble and stay reachable without a pointer:
 * hovering the message reveals them, keyboard focus-within surfaces them, and
 * on touch (no hover) they are always visible. They remain in the tab order
 * while dimmed so Tab can reach and reveal them.
 */
.talos-message-actions {
    opacity: 0;
    transition: opacity 120ms ease;
}

.talos-chat-message:hover > .talos-message-actions,
.talos-chat-message:focus-within > .talos-message-actions,
.talos-message-actions:focus-within {
    opacity: 1;
}

@media (hover: none) {
    .talos-message-actions {
        opacity: 1;
    }
}

@media (prefers-reduced-motion: reduce) {
    .talos-message-actions {
        transition: none;
    }
}
</style>
