<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { AlertCircle, BarChart3, Loader2, ShieldCheck } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import TalosEvidenceDrawer from '../chat/TalosEvidenceDrawer.vue'
import TalosMessageActions from '../chat/TalosMessageActions.vue'
import TalosGuidedStart from './TalosGuidedStart.vue'
import { resolveTalosWelcomePrompt } from '../../../lib/talosWelcomePrompts'
import type { TalosMessage } from '../../../lib/talosTypes'

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
    fullWidthChat: boolean
    sensitiveBlur: boolean
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
}>()

const chatThreadEl = ref<HTMLElement | null>(null)
const welcomePrompt = computed(() => resolveTalosWelcomePrompt(props.welcomePromptId, props.welcomePromptId ?? 'talos'))

function scrollToBottom() {
    const el = chatThreadEl.value
    if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
}

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
    <section ref="chatThreadEl" class="talos-chat-thread relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-48 pt-7 md:px-6 lg:pb-52" aria-label="TALOS chat thread">
        <div class="mx-auto flex min-h-full w-full flex-col" :class="fullWidthChat ? 'max-w-[min(1120px,calc(100vw-3rem))]' : 'max-w-3xl'">
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
                <div data-testid="talos-empty-brand" class="mb-4 flex items-center justify-center gap-3" aria-label="TALOS">
                    <span class="talos-short-logo" aria-hidden="true">
                        <span class="talos-short-logo-mark"></span>
                    </span>
                    <span class="talos-orbitron-brand text-3xl font-semibold text-[var(--talos-text)] sm:text-4xl">TALOS</span>
                </div>
                <template v-if="showWelcomeMessage">
                    <h2 class="text-2xl font-semibold text-[var(--talos-text)]">{{ welcomePrompt.headline }}</h2>
                    <p class="mt-3 max-w-[560px] text-sm leading-6 text-[var(--talos-muted)]">
                        {{ welcomePrompt.body }}
                    </p>
                </template>
                <TalosGuidedStart
                    v-if="showWelcomeMessage"
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
                >
                    <div
                        class="max-w-[760px] rounded-md border px-4 py-3"
                        :class="message.role === 'user'
                            ? 'border-[var(--talos-border-strong)] bg-[var(--talos-user)] text-[var(--talos-user-text)]'
                            : message.role === 'system'
                                ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-text)]'
                                : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-text)]'"
                    >
                        <div class="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase opacity-75">
                            <span class="font-semibold">{{ messageLabel(message) }}</span>
                            <span>{{ messageMeta(message) }}</span>
                            <span>{{ formatTime(message.created_at) }}</span>
                        </div>
                        <p
                            class="whitespace-pre-wrap text-sm leading-6"
                            :class="sensitiveBlur && message.role === 'assistant' && messageContainsSensitiveText(message.content) ? 'talos-sensitive-output' : ''"
                        >
                            {{ message.content }}
                        </p>
                        <TalosMessageActions
                            class="mt-3"
                            :message="message"
                            :busy="sending"
                            :can-retry="canRetryAssistantMessage(message)"
                            @copy="copyMessage"
                            @edit="editMessage"
                            @resend="emit('resendMessage', $event)"
                            @retry="emit('retryAssistantMessage', $event)"
                        />
                        <div v-if="message.role === 'assistant'" class="mt-3 flex flex-wrap gap-2">
                            <Badge v-if="messageMutations(message).length" tone="success">{{ messageMutations(message).length }} JMP</Badge>
                            <Badge tone="neutral">Persisted</Badge>
                            <Button
                                v-if="messageHasEvidence(message)"
                                type="button"
                                variant="ghost"
                                size="sm"
                                :aria-expanded="messageEvidenceOpen(message)"
                                @click="emit('toggleMessageEvidence', message)"
                            >
                                <ShieldCheck class="h-4 w-4" />
                                Evidence
                            </Button>
                            <Button
                                v-if="message.run_id"
                                type="button"
                                variant="ghost"
                                size="sm"
                                :disabled="benchmarkingRunId === message.run_id"
                                @click="emit('benchmarkMessageRun', message)"
                            >
                                <Loader2 v-if="benchmarkingRunId === message.run_id" class="h-4 w-4 animate-spin" />
                                <BarChart3 v-else class="h-4 w-4" />
                                Compare AVM ON/OFF
                            </Button>
                        </div>
                        <TalosEvidenceDrawer
                            v-if="message.role === 'assistant' && messageEvidenceOpen(message)"
                            :message="message"
                        />
                        <div v-if="message.role === 'assistant' && messageSources(message).length" class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Source provenance</div>
                            <div class="mt-2 space-y-2">
                                <article
                                    v-for="(source, index) in messageSources(message)"
                                    :key="`${source.context_set_id ?? 'context'}-${source.chunk_id ?? source.file_id ?? index}`"
                                    class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2"
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
                        Kadmos is processing
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>
