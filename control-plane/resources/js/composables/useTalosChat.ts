import { TalosApiError, talosFetch } from '../lib/api'
import type { TalosBrowserActivity, TalosMessage, TalosRun } from '../lib/talosTypes'
import type { CreateTalosMessagePayload } from './useTalosSessions'

export type TalosChatError = {
    layer: string
    code: string
    message: string
    next_action?: string
    retryable?: boolean
    status?: number
    provider?: string
    model?: string
}

export type TalosChatProxyResponse = {
    text?: string
    error?: string
    message?: string
    chat_error?: TalosChatError
    errors?: string[]
    mutations?: unknown[]
    dag?: unknown
    run?: TalosRun
    browser_activities?: unknown
    used_browser_context?: unknown
    [key: string]: unknown
}

type PersistMessage = (sessionId: string, payload: CreateTalosMessagePayload) => Promise<TalosMessage>

type SendPersistentChatOptions = {
    sessionId: string
    prompt: string
    apiKey?: string
    modelProfileId?: string | null
    modelRoutingProfileId?: string | null
    contextSetId?: string | null
    browserMode?: {
        enabled: boolean
        browserSessionId: string | null
    }
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

const browserOperations = new Set(['session_start', 'navigate', 'snapshot', 'screenshot', 'read'])
const browserActivityStatuses = new Set(['queued', 'running', 'succeeded', 'failed', 'denied'])

function normalizeBrowserActivities(value: unknown): TalosBrowserActivity[] {
    if (!Array.isArray(value)) {
        return []
    }

    return value.flatMap((candidate) => {
        const data = record(candidate)
        const id = stringValue(data?.id)
        const operation = stringValue(data?.operation)
        const status = stringValue(data?.status)
        const label = stringValue(data?.label)
        const browserSessionId = stringValue(data?.browser_session_id)
        const occurredAt = stringValue(data?.occurred_at)

        if (!id || !operation || !browserOperations.has(operation) || !status || !browserActivityStatuses.has(status)
            || !label || !browserSessionId || !occurredAt) {
            return []
        }

        const artifactIds = Array.isArray(data?.artifact_ids)
            ? data.artifact_ids.flatMap((artifactId) => stringValue(artifactId) ?? [])
            : []

        return [{
            id,
            operation,
            status,
            label,
            run_id: stringValue(data?.run_id),
            browser_session_id: browserSessionId,
            artifact_ids: artifactIds,
            occurred_at: occurredAt,
        } as TalosBrowserActivity]
    })
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function booleanValue(value: unknown) {
    return typeof value === 'boolean' ? value : undefined
}

function numberValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeChatError(value: unknown): TalosChatError | null {
    const data = record(value)
    if (!data) {
        return null
    }

    const layer = stringValue(data.layer)
    const code = stringValue(data.code)
    const message = stringValue(data.message)

    if (!layer || !code || !message) {
        return null
    }

    return {
        layer,
        code,
        message,
        ...(stringValue(data.next_action) ? { next_action: stringValue(data.next_action) ?? undefined } : {}),
        ...(booleanValue(data.retryable) !== undefined ? { retryable: booleanValue(data.retryable) } : {}),
        ...(numberValue(data.status) !== undefined ? { status: numberValue(data.status) } : {}),
        ...(stringValue(data.provider) ? { provider: stringValue(data.provider) ?? undefined } : {}),
        ...(stringValue(data.model) ? { model: stringValue(data.model) ?? undefined } : {}),
    }
}

function chatErrorFromResponse(response: TalosChatProxyResponse | null): TalosChatError | null {
    return normalizeChatError(response?.chat_error)
}

function chatErrorFromException(error: unknown): TalosChatError | null {
    if (!(error instanceof TalosApiError)) {
        return null
    }

    return normalizeChatError(record(error.details)?.chat_error)
}

function runIdFromException(error: unknown) {
    if (!(error instanceof TalosApiError)) {
        return null
    }

    return stringValue(record(record(error.details)?.run)?.id)
}

function chatErrorContent(chatError: TalosChatError) {
    const codeLine = `Code: ${chatError.code}`

    return chatError.next_action
        ? `${chatError.message}\n\n${codeLine}\nNext action: ${chatError.next_action}`
        : `${chatError.message}\n\n${codeLine}`
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
                used_browser_context: response.used_browser_context ?? null,
                browser_activities: normalizeBrowserActivities(response.browser_activities),
                model_routing: response.model_routing ?? null,
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
            const payload: Record<string, unknown> = {
                message: options.prompt,
                session_id: options.sessionId,
            }

            if (options.modelProfileId) {
                payload.model_profile_id = options.modelProfileId
            } else if (options.modelRoutingProfileId) {
                payload.model_routing_profile_id = options.modelRoutingProfileId
            } else if (options.apiKey) {
                payload.api_key = options.apiKey
            }

            if (options.contextSetId) {
                payload.context_set_id = options.contextSetId
            }
            if (options.browserMode?.enabled && options.browserMode.browserSessionId) {
                payload.browser_mode = {
                    enabled: true,
                    browser_session_id: options.browserMode.browserSessionId,
                }
            }

            const response = await talosFetch<TalosChatProxyResponse>(options.chatEndpoint ?? '/api/talos/chat', {
                method: 'POST',
                body: JSON.stringify(payload),
            })

            if (response.error) {
                const chatError = chatErrorFromResponse(response)
                const systemMessage = await persistSystemMessage(options.sessionId, chatError ? chatErrorContent(chatError) : response.error, options.persistMessage, {
                    fault_type: chatError?.code ?? 'validator_error',
                    fault_layer: chatError?.layer ?? 'validator_payload',
                    chat_error: chatError,
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
            const chatError = chatErrorFromException(error)
            const failure = chatError ? chatErrorContent(chatError) : (error instanceof Error ? error.message : 'TALOS chat failed after your prompt was saved.')
            const systemMessage = await persistSystemMessage(
                options.sessionId,
                chatError ? failure : `TALOS chat failed after your prompt was saved. ${failure}`,
                options.persistMessage,
                {
                    fault_type: chatError?.code ?? 'chat_proxy_failure',
                    fault_layer: chatError?.layer ?? 'control_plane',
                    chat_error: chatError,
                },
                chatError ? runIdFromException(error) : null,
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
