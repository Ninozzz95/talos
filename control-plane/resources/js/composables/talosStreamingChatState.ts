import type { TalosStreamCompletedMessage } from '../lib/talosStreamProtocol'

export type TalosStreamingChatStatus =
    | 'idle'
    | 'connecting'
    | 'streaming'
    | 'awaiting_approval'
    | 'completed'
    | 'cancelled'
    | 'failed'

export type TalosStreamingTool = {
    id: string
    name: string
    status: 'running' | 'awaiting_approval' | 'succeeded' | 'failed' | 'cancelled'
}

export type TalosSendDiagnostic = {
    code: string
    phase: 'connect' | 'stream' | 'protocol' | 'cancel'
    run_id: string | null
    last_sequence: number
    retryable: boolean
    reconciled: boolean
    attempts: number
    http_status?: number
}

export type TalosStreamingChatState = {
    ownerSessionId: string | null
    ownerMessageId: string | null
    runId: string | null
    rawText: string
    reasoningText: string
    tools: TalosStreamingTool[]
    artifacts: Array<{
        artifact_id: string
        artifact_type: string
        mime_type: string
        name?: string
        size_bytes?: number
    }>
    usage: {
        input_tokens: number
        output_tokens: number
        total_tokens: number
        cached_tokens: number
        cache_read_tokens: number | null
        cache_write_tokens: number | null
        cache_miss_tokens: number | null
        cache_write_5m_tokens: number | null
        cache_write_1h_tokens: number | null
    } | null
    status: TalosStreamingChatStatus
    lastSequence: number
    attempts: number
    reconciled: boolean
    error: string | null
    cancelError: string | null
    diagnostic: TalosSendDiagnostic | null
}

export type TalosStreamingChatRequest = {
    sessionId: string
    userMessageId: string
    payload: Record<string, unknown>
    endpoint?: string
}

export type TalosStreamingChatResult =
    | {
        kind: 'json'
        response: unknown
    }
    | {
        kind: 'stream'
        assistantMessage: TalosStreamCompletedMessage | null
        awaitingApproval: boolean
        cancelled: boolean
    }

export function createTalosStreamingChatState(): TalosStreamingChatState {
    return {
        ownerSessionId: null,
        ownerMessageId: null,
        runId: null,
        rawText: '',
        reasoningText: '',
        tools: [],
        artifacts: [],
        usage: null,
        status: 'idle',
        lastSequence: 0,
        attempts: 0,
        reconciled: false,
        error: null,
        cancelError: null,
        diagnostic: null,
    }
}
