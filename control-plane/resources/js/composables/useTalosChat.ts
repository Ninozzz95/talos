import { talosFetch } from '../lib/api'
import type { TalosMessage, TalosRun } from '../lib/talosTypes'
import type { CreateTalosMessagePayload } from './useTalosSessions'

export type TalosChatProxyResponse = {
    text?: string
    error?: string
    errors?: string[]
    mutations?: unknown[]
    dag?: unknown
    run?: TalosRun
    [key: string]: unknown
}

type PersistMessage = (sessionId: string, payload: CreateTalosMessagePayload) => Promise<TalosMessage>

type SendPersistentChatOptions = {
    sessionId: string
    prompt: string
    apiKey?: string
    modelProfileId?: string | null
    contextSetId?: string | null
    chatEndpoint?: string
    userMessageMetadata?: Record<string, unknown>
    persistMessage: PersistMessage
}

function summarizeJmp(mutations: unknown) {
    if (!Array.isArray(mutations) || mutations.length === 0) {
        return 'direct_response'
    }

    return mutations.slice(0, 3).map((mutation) => {
        if (!mutation || typeof mutation !== 'object') {
            return 'JMP'
        }

        const data = mutation as Record<string, unknown>
        const action = typeof data.action === 'string' ? data.action : 'JMP'
        const nodeId = typeof data.node_id === 'string' ? data.node_id : ''

        return nodeId ? `${action} ${nodeId}` : action
    }).join(' | ')
}

function normalizeUsedContext(value: unknown) {
    return Array.isArray(value) ? value : []
}

export function useTalosChat() {
    async function persistUserMessage(
        sessionId: string,
        content: string,
        persistMessage: PersistMessage,
        metadata: Record<string, unknown> = {},
    ) {
        return persistMessage(sessionId, {
            role: 'user',
            content,
            metadata: {
                ...metadata,
                source: 'talos_chat_page',
            },
        })
    }

    async function persistAssistantMessage(sessionId: string, response: TalosChatProxyResponse, persistMessage: PersistMessage) {
        const mutations = Array.isArray(response.mutations) ? response.mutations : []
        const errors = Array.isArray(response.errors) ? response.errors : []

        return persistMessage(sessionId, {
            role: 'assistant',
            content: response.text || 'Kadmos completed the request.',
            run_id: response.run?.id ?? null,
            metadata: {
                source: 'talos_chat_proxy',
                summary: summarizeJmp(mutations),
                mutations,
                dag: response.dag ?? null,
                validation_errors: errors,
                run: response.run ?? null,
                used_context: normalizeUsedContext(response.used_context),
            },
        })
    }

    async function persistSystemMessage(
        sessionId: string,
        content: string,
        persistMessage: PersistMessage,
        metadata: Record<string, unknown> = {},
        runId: string | null = null,
    ) {
        return persistMessage(sessionId, {
            role: 'system',
            content,
            run_id: runId,
            metadata: {
                source: 'talos_chat_page',
                ...metadata,
            },
        })
    }

    async function sendPersistentChat(options: SendPersistentChatOptions) {
        const userMessage = await persistUserMessage(
            options.sessionId,
            options.prompt,
            options.persistMessage,
            options.userMessageMetadata ?? {},
        )

        try {
            const payload: Record<string, string> = {
                message: options.prompt,
                session_id: options.sessionId,
            }

            if (options.modelProfileId) {
                payload.model_profile_id = options.modelProfileId
            } else if (options.apiKey) {
                payload.api_key = options.apiKey
            }

            if (options.contextSetId) {
                payload.context_set_id = options.contextSetId
            }

            const response = await talosFetch<TalosChatProxyResponse>(options.chatEndpoint ?? '/api/talos/chat', {
                method: 'POST',
                body: JSON.stringify(payload),
            })

            if (response.error) {
                const systemMessage = await persistSystemMessage(options.sessionId, response.error, options.persistMessage, {
                    fault_type: 'validator_error',
                    run_id: response.run?.id ?? null,
                }, response.run?.id ?? null)

                return {
                    userMessage,
                    assistantMessage: null,
                    systemMessages: [systemMessage],
                    response,
                }
            }

            const assistantMessage = await persistAssistantMessage(options.sessionId, response, options.persistMessage)
            const systemMessages: TalosMessage[] = []

            if (Array.isArray(response.errors) && response.errors.length > 0) {
                systemMessages.push(await persistSystemMessage(options.sessionId, response.errors.join('; '), options.persistMessage, {
                    fault_type: 'validation_fault',
                }, response.run?.id ?? null))
            }

            return {
                userMessage,
                assistantMessage,
                systemMessages,
                response,
            }
        } catch (error) {
            const failure = error instanceof Error ? error.message : 'TALOS chat failed after your prompt was saved.'
            const systemMessage = await persistSystemMessage(
                options.sessionId,
                `TALOS chat failed after your prompt was saved. ${failure}`,
                options.persistMessage,
                {
                    fault_type: 'chat_proxy_failure',
                },
            )

            return {
                userMessage,
                assistantMessage: null,
                systemMessages: [systemMessage],
                response: null,
            }
        }
    }

    return {
        persistUserMessage,
        persistAssistantMessage,
        persistSystemMessage,
        sendPersistentChat,
    }
}
