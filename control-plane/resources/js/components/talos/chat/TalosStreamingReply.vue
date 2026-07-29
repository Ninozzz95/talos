<script setup lang="ts">
import { computed } from 'vue'
import {
    AlertCircle,
    BrainCircuit,
    CheckCircle2,
    CircleDashed,
    Loader2,
    PauseCircle,
    Square,
    XCircle,
} from '@lucide/vue'
import type {
    TalosStreamingChatState,
    TalosStreamingTool,
} from '../../../composables/useTalosStreamingChat'
import { useTalosSmoothReveal } from '../../../composables/useTalosSmoothReveal'
import TalosMessageContent from './TalosMessageContent.vue'
import TalosSendDiagnostics from './TalosSendDiagnostics.vue'

const props = defineProps<{
    state: Readonly<TalosStreamingChatState>
    reducedMotion: boolean
    sensitiveBlur: boolean
}>()

const rawText = computed(() => props.state.rawText)
const settled = computed(() => (
    ['awaiting_approval', 'completed', 'cancelled', 'failed'].includes(props.state.status)
))
const { revealed } = useTalosSmoothReveal(rawText, {
    paced: () => !props.reducedMotion,
    settled: () => settled.value,
})

const statusLabel = computed(() => {
    if (props.state.status === 'connecting') return 'Connecting'
    if (props.state.status === 'awaiting_approval') return 'Waiting for approval'
    if (props.state.status === 'cancelled') return 'Stopped'
    if (props.state.status === 'failed') return 'Response interrupted'
    if (props.state.status === 'completed') return 'Completed'
    return 'Responding'
})
const active = computed(() => ['connecting', 'streaming'].includes(props.state.status))
const visibleError = computed(() => props.state.cancelError ?? props.state.error)
const containsSensitiveText = computed(() => (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(revealed.value)
    || /\b(?:sk|pk|tok|key|secret)[-_][A-Za-z0-9._-]{8,}\b/i.test(revealed.value)
    || /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password)\b/i.test(revealed.value)
))

function toolIcon(tool: TalosStreamingTool) {
    if (tool.status === 'succeeded') return CheckCircle2
    if (tool.status === 'failed') return AlertCircle
    if (tool.status === 'cancelled') return XCircle
    if (tool.status === 'awaiting_approval') return PauseCircle
    return CircleDashed
}
</script>

<template>
    <article
        data-testid="talos-streaming-reply"
        :data-stream-status="state.status"
        class="talos-chat-message flex flex-col items-start"
        aria-label="TALOS active response"
    >
        <div class="talos-message-bubble talos-message-section min-w-0 w-full max-w-full rounded-md border border-transparent bg-transparent text-[var(--talos-text)]">
            <div class="mb-2 flex min-h-5 items-center gap-2 text-xs text-[var(--talos-muted)]" role="status" aria-live="polite">
                <Loader2
                    v-if="active"
                    class="h-3.5 w-3.5 text-[var(--talos-accent)]"
                    :class="{ 'animate-spin': !reducedMotion }"
                />
                <Square v-else-if="state.status === 'cancelled'" class="h-3.5 w-3.5" />
                <AlertCircle v-else-if="state.status === 'failed'" class="h-3.5 w-3.5 text-[var(--talos-danger)]" />
                <PauseCircle v-else-if="state.status === 'awaiting_approval'" class="h-3.5 w-3.5 text-[var(--talos-accent)]" />
                <CheckCircle2 v-else class="h-3.5 w-3.5 text-[var(--talos-success)]" />
                <span>{{ statusLabel }}</span>
                <span v-if="state.reconciled" class="font-mono text-[10px]">reconciled</span>
            </div>

            <details
                v-if="state.reasoningText"
                data-testid="talos-stream-reasoning"
                class="mb-2 border-l-2 border-[var(--talos-border-strong)] pl-3 text-xs text-[var(--talos-muted)]"
            >
                <summary class="flex min-h-8 cursor-pointer items-center gap-2 font-medium text-[var(--talos-text)]">
                    <BrainCircuit class="h-3.5 w-3.5 text-[var(--talos-accent)]" />
                    Reasoning
                </summary>
                <p class="max-h-48 overflow-y-auto whitespace-pre-wrap py-2 leading-5">{{ state.reasoningText }}</p>
            </details>

            <div v-if="state.tools.length" class="mb-2 space-y-1" aria-label="Live tool activity">
                <div
                    v-for="tool in state.tools"
                    :key="tool.id"
                    :data-testid="`talos-stream-tool-${tool.id}`"
                    :data-tool-status="tool.status"
                    class="flex min-h-9 min-w-0 items-center gap-2 border-l-2 border-[var(--talos-border-strong)] px-3 py-1.5 text-xs text-[var(--talos-muted)]"
                >
                    <component
                        :is="toolIcon(tool)"
                        class="h-3.5 w-3.5 shrink-0"
                        :class="tool.status === 'running' ? 'text-[var(--talos-accent)]' : ''"
                    />
                    <span class="min-w-0 flex-1 truncate font-medium text-[var(--talos-text)]">{{ tool.name }}</span>
                    <span class="font-mono text-[10px]">{{ tool.status.replace('_', ' ') }}</span>
                </div>
            </div>

            <TalosMessageContent
                v-if="revealed"
                :content="revealed"
                :sensitive="sensitiveBlur && containsSensitiveText"
                :censor-enabled="true"
            />
            <p v-if="visibleError" role="alert" class="mt-3 text-sm text-[var(--talos-danger)]">
                {{ visibleError }}
            </p>
            <TalosSendDiagnostics
                v-if="state.diagnostic || state.usage"
                :diagnostic="state.diagnostic"
                :usage="state.usage"
            />
        </div>
    </article>
</template>
