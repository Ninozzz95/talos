import { nextTick, ref, type Readonly, type Ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { CreateTalosMessagePayload } from './useTalosSessions'
import type { TalosChatProxyResponse } from './useTalosChat'
import type { TalosMessage, TalosSession } from '../lib/talosTypes'

type ChatResult = {
    assistantMessage?: TalosMessage | null
    response?: TalosChatProxyResponse | null
}

export type TalosWorkspaceChatActionDependencies = {
    prompt: Ref<string>
    sending: Ref<boolean>
    activeSession: Readonly<Ref<TalosSession | null>>
    messages: Readonly<Ref<TalosMessage[]>>
    uiError: Ref<string | null>
    setFeedback: (message: string) => void
    modelSelectionIsUsable: Readonly<Ref<boolean>>
    browserReadyForSend: Readonly<Ref<boolean>>
    browseModeEnabled: Readonly<Ref<boolean>>
    activeBrowserSession: Readonly<Ref<{ id: string } | null>>
    selectedModelProfileId: Readonly<Ref<string>>
    selectedModelRoutingProfileId: Readonly<Ref<string>>
    selectedContextSetId: Readonly<Ref<string>>
    ensureSessionForPrompt: (message: string) => Promise<TalosSession>
    persistUserMessage: (sessionId: string, content: string, persistMessage: (sessionId: string, payload: CreateTalosMessagePayload) => Promise<TalosMessage>, metadata?: Record<string, unknown>) => Promise<TalosMessage>
    sendPersistentChat: (options: {
        sessionId: string
        prompt: string
        modelProfileId: string | null
        modelRoutingProfileId: string | null
        contextSetId: string | null
        browserMode: { enabled: boolean; browserSessionId: string | null }
        chatEndpoint: string
        userMessageMetadata: Record<string, unknown>
        persistMessage: (sessionId: string, payload: CreateTalosMessagePayload) => Promise<TalosMessage>
    }) => Promise<ChatResult>
    createMessage: (sessionId: string, payload: CreateTalosMessagePayload) => Promise<TalosMessage>
    acceptPersistedMessage: (message: TalosMessage) => void
    centerMessage: (messageId: string) => Promise<void>
    recordBrowserActivities: (value: unknown) => void
    recordPendingToolApprovals: (value: unknown) => void
    openSettings: () => void
    openModelPopover: () => void
    closePopover: () => void
    openCompare: () => void
    previousUserMessageFor: (message: TalosMessage) => TalosMessage | null
    scrollChat: () => void
    selectedBenchmarkScenarioRef: Readonly<Ref<string | null>>
    selectedBenchmarkScenarioIsRunnable: Readonly<Ref<boolean>>
    benchmarkDisabledReason: Readonly<Ref<string>>
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

export function useTalosWorkspaceChatActions(deps: TalosWorkspaceChatActionDependencies) {
    const prompt = deps.prompt
    const sending = deps.sending
    const benchmarkingRunId = ref<string | null>(null)
    const selectedBenchmarkGroupId = ref<string | null>(null)

    async function sendChatText(message: string, userMessageMetadata: Record<string, unknown> = {}, clearComposer = false) {
        const normalizedMessage = message.trim()
        if (!normalizedMessage || sending.value) return false
        if (!deps.modelSelectionIsUsable.value) {
            deps.uiError.value = 'Choose a usable model or routing profile before sending.'
            deps.openSettings()
            deps.openModelPopover()
            return false
        }
        if (!deps.browserReadyForSend.value) {
            deps.uiError.value = 'Wait for Browse to become ready before sending.'
            return false
        }
        sending.value = true
        deps.uiError.value = null
        if (clearComposer) prompt.value = ''
        try {
            const session = await deps.ensureSessionForPrompt(normalizedMessage)
            const persistedUserMessage = await deps.persistUserMessage(session.id, normalizedMessage, deps.createMessage, userMessageMetadata)
            await deps.centerMessage(persistedUserMessage.id)
            const chatResult = await deps.sendPersistentChat({
                sessionId: session.id,
                prompt: normalizedMessage,
                modelProfileId: deps.selectedModelProfileId.value || null,
                modelRoutingProfileId: deps.selectedModelRoutingProfileId.value || null,
                contextSetId: deps.selectedContextSetId.value || null,
                browserMode: {
                    enabled: deps.browseModeEnabled.value,
                    browserSessionId: deps.browseModeEnabled.value ? deps.activeBrowserSession.value?.id ?? null : null,
                },
                chatEndpoint: '/api/talos/chat',
                userMessageMetadata,
                persistMessage: async (sessionId, payload) => payload.role === 'user'
                    ? persistedUserMessage
                    : deps.createMessage(sessionId, payload),
            })
            if (chatResult.assistantMessage) {
                deps.acceptPersistedMessage(chatResult.assistantMessage)
            }
            deps.recordBrowserActivities(
                chatResult.response?.browser_activities
                ?? chatResult.assistantMessage?.metadata?.browser_activities,
            )
            deps.recordPendingToolApprovals(chatResult.response?.pending_approvals ?? [])
            await nextTick()
            return true
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not complete this chat turn.')
            return false
        } finally {
            sending.value = false
            await nextTick()
        }
    }

    async function sendChat() {
        return sendChatText(prompt.value, {}, true)
    }

    async function resendMessage(message: TalosMessage) {
        if (message.role !== 'user') return
        const sent = await sendChatText(message.content, { command_id: 'resend_message', resend_of_message_id: message.id })
        if (sent) deps.setFeedback('Message resent through TALOS chat.')
    }

    async function retryAssistantMessage(message: TalosMessage) {
        if (message.role !== 'assistant') return
        const previousUserMessage = deps.previousUserMessageFor(message)
        if (!previousUserMessage) {
            deps.uiError.value = 'TALOS could not find the prompt that produced this answer.'
            return
        }
        const sent = await sendChatText(previousUserMessage.content, {
            command_id: 'retry_assistant_response',
            retry_of_message_id: message.id,
            resend_of_message_id: previousUserMessage.id,
        })
        if (sent) deps.setFeedback('Assistant response retried through TALOS chat.')
    }

    async function benchmarkMessageRun(message: TalosMessage) {
        if (!deps.activeSession.value || !message.run_id || benchmarkingRunId.value) return
        benchmarkingRunId.value = message.run_id
        deps.uiError.value = null
        try {
            const response = await talosFetch<{ benchmark_group?: { id?: string; name?: string } }>(`/api/talos/runs/${message.run_id}/benchmark`, {
                method: 'POST',
                body: JSON.stringify({ runs: 1 }),
                validationMessage: 'TALOS could not create a benchmark for this run.',
            })
            const groupId = response.benchmark_group?.id ?? 'unknown'
            selectedBenchmarkGroupId.value = response.benchmark_group?.id ?? null
            await deps.createMessage(deps.activeSession.value.id, {
                role: 'system',
                content: `Benchmark run created for ${message.run_id}. Group: ${groupId}. Open Compare to inspect persisted AVM ON/OFF lanes.`,
                run_id: message.run_id,
                metadata: { source: 'talos_chat_benchmark', benchmark_group: response.benchmark_group ?? null },
            })
            deps.openCompare()
            await nextTick()
            deps.scrollChat()
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not benchmark this run.')
        } finally {
            benchmarkingRunId.value = null
        }
    }

    async function runSelectedBenchmarkScenario() {
        const scenarioRef = deps.selectedBenchmarkScenarioRef.value?.trim() ?? ''
        if (!deps.selectedBenchmarkScenarioIsRunnable.value) {
            deps.uiError.value = deps.benchmarkDisabledReason.value
            deps.openCompare()
            return
        }
        deps.uiError.value = null
        try {
            const response = await talosFetch<{ benchmark_group?: { id?: string; name?: string } }>('/api/benchmarks/compare', {
                method: 'POST',
                body: JSON.stringify({ scenario_ref: scenarioRef, runs: 1 }),
                validationMessage: 'TALOS rejected the benchmark comparison request.',
            })
            selectedBenchmarkGroupId.value = response.benchmark_group?.id ?? null
            deps.openCompare()
            deps.setFeedback('Benchmark comparison completed.')
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not run the benchmark comparison.')
        }
    }

    return {
        prompt,
        sending,
        benchmarkingRunId,
        selectedBenchmarkGroupId,
        sendChatText,
        sendChat,
        resendMessage,
        retryAssistantMessage,
        benchmarkMessageRun,
        runSelectedBenchmarkScenario,
    }
}
