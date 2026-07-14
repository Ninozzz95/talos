<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertCircle, Loader2 } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import TalosEvidenceDrawer from '../chat/TalosEvidenceDrawer.vue'
import TalosBrowserActivity from '../chat/TalosBrowserActivity.vue'
import TalosMessageContent from '../chat/TalosMessageContent.vue'
import TalosMessageActions from '../chat/TalosMessageActions.vue'
import TalosRunActivity from '../chat/TalosRunActivity.vue'
import TalosStatusMessage from '../chat/TalosStatusMessage.vue'
import TalosGuidedStart from './TalosGuidedStart.vue'
import TalosLiveEdgeControl from './TalosLiveEdgeControl.vue'
import { resolveTalosWelcomePrompt } from '../../../lib/talosWelcomePrompts'
import type { TalosMessage } from '../../../lib/talosTypes'
import type {
    TalosBrowserActivity as TalosBrowserActivityItem,
    TalosBrowserHmiChallenge,
    TalosBrowserPointerFrame,
    TalosBrowserSession,
    TalosBrowserSnapshotPreview,
    TalosChatBubbleScale,
    TalosPendingToolApproval,
} from '../../../lib/talosTypes'
import type { TalosChatViewportController } from '../../../composables/useTalosChatViewport'

const TalosBrowserScreenshotEvidence = defineAsyncComponent(
    () => import('../chat/TalosBrowserScreenshotEvidence.vue'),
)

type MessageSource = {
    context_set_id?: string
    file_id?: string
    chunk_id?: string
    file_name?: string
    preview?: string
}

const props = defineProps<{
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
    benchmarkingRunId: string | null
    expandedEvidenceMessageIds: string[]
    welcomePromptId?: string | null
    showWelcomeMessage: boolean
    showMissionPath: boolean
    fullWidthChat: boolean
    sensitiveBlur: boolean
    bubbleScale: TalosChatBubbleScale
    browserActivities: TalosBrowserActivityItem[]
    browserSnapshot: TalosBrowserSnapshotPreview | null
    activeBrowserSession: TalosBrowserSession | null
    browserInteractionPending: boolean
    browserInteractionLocked: boolean
    browserInteractionError: string | null
    pendingBrowserInteractionApproval: TalosBrowserHmiChallenge | null
    pendingToolApprovals: TalosPendingToolApproval[]
    decidingToolApprovalIds: string[]
    devBrowserEvidence: boolean
    activeTalosSessionId: string | null
    viewport: TalosChatViewportController
}>()

const emit = defineEmits<{
    openModel: []
    openContext: []
    setPrompt: [prompt: string]
    messageCopied: []
    messageCopyFailed: []
    messageEdited: []
    resendMessage: [message: TalosMessage]
    retryAssistantMessage: [message: TalosMessage]
    toggleMessageEvidence: [message: TalosMessage]
    benchmarkMessageRun: [message: TalosMessage]
    interactBrowserFrame: [frame: TalosBrowserPointerFrame]
    confirmBrowserFrameInteraction: [decision: 'approve' | 'reject']
    decideToolApproval: [approval: TalosPendingToolApproval, decision: 'approve' | 'reject']
}>()

const chatThreadEl = ref<HTMLElement | null>(null)
const welcomePrompt = computed(() => resolveTalosWelcomePrompt(props.welcomePromptId, props.welcomePromptId ?? 'talos'))
const unseenUpdates = computed(() => props.viewport.unseenCount.value)

function messageBrowserActivities(message: TalosMessage): TalosBrowserActivityItem[] {
    const activities = message.metadata?.browser_activities
    if (!Array.isArray(activities)) return []

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

const currentBrowserScreenshotActivity = computed(() => [...props.browserActivities].reverse().find((activity) => (
    activity.operation === 'screenshot'
    && activity.status === 'succeeded'
    && activity.artifact_ids.length > 0
)) ?? null)

const messageScreenshotArtifactIds = computed(() => [...new Set(
    props.messages.flatMap((message) => messageBrowserActivities(message).flatMap((activity) => activity.artifact_ids)),
)])

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
    const mutations = message.metadata?.mutations
    return Array.isArray(mutations) ? mutations : []
}

function messageSources(message: TalosMessage): MessageSource[] {
    const sources = message.metadata?.used_context

    if (!Array.isArray(sources)) {
        return []
    }

    return sources.flatMap((source) => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            return []
        }

        return [source as MessageSource]
    })
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
        <div class="mx-auto flex min-h-full min-w-0 w-full flex-col" :class="fullWidthChat ? 'max-w-[min(1120px,calc(100vw-3rem))]' : 'max-w-3xl'">
            <TalosBrowserActivity
                :activities="browserActivities"
                :snapshot="browserSnapshot"
                :talos-session-id="activeTalosSessionId"
                :active-browser-session="activeBrowserSession"
                :interaction-pending="browserInteractionPending"
                :interaction-locked="browserInteractionLocked"
                :interaction-error="browserInteractionError"
                :pending-interaction-approval="pendingBrowserInteractionApproval"
                :pending-tool-approvals="pendingToolApprovals"
                :deciding-tool-approval-ids="decidingToolApprovalIds"
                :dev-browser-evidence="devBrowserEvidence"
                :excluded-screenshot-artifact-ids="messageScreenshotArtifactIds"
                @interact="emit('interactBrowserFrame', $event)"
                @confirm="emit('confirmBrowserFrameInteraction', $event)"
                @decide-tool-approval="(approval, decision) => emit('decideToolApproval', approval, decision)"
            />
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

            <div v-if="loadingMessages" class="flex flex-1 items-center justify-center text-sm text-[var(--talos-muted)]">
                <Loader2 class="mr-2 h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading messages
            </div>

            <div v-else-if="!messages.length" class="flex flex-1 flex-col items-center justify-center text-center">
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
                <article
                    v-for="message in messages"
                    :key="message.id"
                    class="talos-chat-message flex"
                    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                    :data-message-role="message.role"
                    :data-message-id="message.id"
                >
                    <div
                        class="talos-message-bubble min-w-0 max-w-full rounded-md border"
                        :data-message-kind="message.role"
                        :data-bubble-scale="bubbleScale"
                        :class="message.role === 'user'
                            ? 'border-[var(--talos-border-strong)] bg-[var(--talos-user)] text-[var(--talos-user-text)]'
                            : message.role === 'system'
                                ? 'border-[var(--talos-warning-border)] bg-[var(--talos-system)] text-[var(--talos-system-text)]'
                                : 'border-[var(--talos-border)] bg-[var(--talos-assistant)] text-[var(--talos-assistant-text)]'"
                    >
                        <div class="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase opacity-75">
                            <span class="font-semibold">{{ messageLabel(message) }}</span>
                            <span>{{ messageMeta(message) }}</span>
                            <span>{{ formatTime(message.created_at) }}</span>
                        </div>
                        <TalosStatusMessage
                            v-if="message.role === 'system'"
                            :message="message"
                        />
                        <TalosMessageContent
                            v-else-if="message.role === 'assistant'"
                            :content="message.content"
                            :sensitive="sensitiveBlur && messageContainsSensitiveText(message.content)"
                        />
                        <TalosBrowserScreenshotEvidence
                            v-if="message.role === 'assistant'"
                            :activities="messageBrowserActivities(message)"
                            :current-frame-activity="currentBrowserScreenshotActivity"
                            :talos-session-id="activeTalosSessionId"
                            :active-browser-session="activeBrowserSession"
                            :interaction-pending="browserInteractionPending"
                            :interaction-locked="browserInteractionLocked"
                            :interaction-error="browserInteractionError"
                            :pending-interaction-approval="pendingBrowserInteractionApproval"
                            loading-strategy="eager"
                            @interact="emit('interactBrowserFrame', $event)"
                            @confirm="emit('confirmBrowserFrameInteraction', $event)"
                        />
                        <TalosRunActivity
                            v-if="message.role === 'assistant'"
                            :message="message"
                        />
                        <p
                            v-if="message.role !== 'assistant' && message.role !== 'system'"
                            class="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]"
                        >
                            {{ message.content }}
                        </p>
                        <TalosMessageActions
                            v-if="message.role !== 'system'"
                            class="mt-3"
                            :message="message"
                            :busy="sending"
                            :can-retry="canRetryAssistantMessage(message)"
                            :has-evidence="messageHasEvidence(message)"
                            :evidence-open="messageEvidenceOpen(message)"
                            :has-benchmark="Boolean(message.run_id)"
                            :benchmarking="benchmarkingRunId === message.run_id"
                            @copy="copyMessage"
                            @edit="editMessage"
                            @resend="emit('resendMessage', $event)"
                            @retry="emit('retryAssistantMessage', $event)"
                            @toggle-evidence="emit('toggleMessageEvidence', $event)"
                            @benchmark="emit('benchmarkMessageRun', $event)"
                        />
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
                </article>

                <div v-if="sending" class="flex justify-start">
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

.talos-message-bubble[data-message-kind='system'] {
    border: 0;
    background: transparent;
    padding: 0;
}

.talos-chat-message:focus-within,
.talos-chat-message:has([aria-expanded='true']) {
    position: relative;
    z-index: 40;
}
</style>
