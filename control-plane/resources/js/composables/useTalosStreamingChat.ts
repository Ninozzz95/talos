import { computed, reactive, readonly, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosStreamCompletedMessage,
    TalosStreamEvent,
} from '../lib/talosStreamProtocol'
import {
    createTalosStreamingChatState,
    type TalosSendDiagnostic,
    type TalosStreamingChatRequest,
    type TalosStreamingChatResult,
    type TalosStreamingChatState,
    type TalosStreamingTool,
} from './talosStreamingChatState'

export type {
    TalosSendDiagnostic,
    TalosStreamingChatRequest,
    TalosStreamingChatResult,
    TalosStreamingChatState,
    TalosStreamingChatStatus,
    TalosStreamingTool,
} from './talosStreamingChatState'

export type TalosStreamingChatErrorCode =
    | 'TALOS_STREAM_ALREADY_ACTIVE'
    | 'TALOS_STREAM_OWNER_MISMATCH'
    | 'TALOS_STREAM_RUN_MISMATCH'
    | 'TALOS_STREAM_HTTP_FAILURE'
    | 'TALOS_STREAM_BODY_UNAVAILABLE'
    | 'TALOS_STREAM_CONTENT_TYPE_UNSUPPORTED'
    | 'TALOS_STREAM_INCOMPLETE'
    | string

export class TalosStreamingChatError extends Error {
    readonly code: TalosStreamingChatErrorCode
    readonly retryable: boolean
    readonly status?: number

    constructor(
        code: TalosStreamingChatErrorCode,
        message: string,
        options: { retryable?: boolean; status?: number; cause?: unknown } = {},
    ) {
        super(message)
        this.name = 'TalosStreamingChatError'
        this.code = code
        this.retryable = options.retryable ?? false
        this.status = options.status
        if (options.cause !== undefined) this.cause = options.cause
    }
}

type ActiveSend = {
    token: number
    request: TalosStreamingChatRequest
    controller: AbortController
    assistantMessage: TalosStreamCompletedMessage | null
    failure: { code: string; retryable: boolean } | null
    awaitingApproval: boolean
    cancelled: boolean
    cancelPromise: Promise<boolean> | null
}

type Dependencies = {
    request?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    cancelRun?: (runId: string) => Promise<unknown>
}

class RetriableStreamDisconnect extends Error {}

function csrfToken() {
    if (typeof document === 'undefined') return ''
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content
        ?? document.getElementById('talos-workspace-root')?.dataset.csrfToken
        ?? ''
}

async function defaultRequest(input: RequestInfo | URL, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'text/event-stream, application/json')
    headers.set('Content-Type', 'application/json')
    const token = csrfToken()
    if (token) headers.set('X-CSRF-TOKEN', token)

    return fetch(input, {
        ...init,
        headers,
        credentials: init.credentials ?? 'same-origin',
    })
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeHttpMessage(value: unknown, status: number) {
    if (isRecord(value) && typeof value.message === 'string' && value.message.trim()) {
        return value.message
    }
    if (isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string' && value.error.message.trim()) {
        return value.error.message
    }
    return `TALOS streaming failed with HTTP ${status}.`
}

function isTalosStreamProtocolError(
    error: unknown,
): error is Error & { code: string } {
    return error instanceof Error
        && error.name === 'TalosStreamProtocolError'
        && typeof (error as Error & { code?: unknown }).code === 'string'
}

function normalizeError(error: unknown) {
    if (error instanceof TalosStreamingChatError) return error
    if (isTalosStreamProtocolError(error)) {
        return new TalosStreamingChatError(error.code, error.message, { cause: error })
    }
    return new TalosStreamingChatError(
        'TALOS_STREAM_DISCONNECTED',
        'TALOS lost the streaming connection before the turn was reconciled.',
        { retryable: true, cause: error },
    )
}

export function useTalosStreamingChat(dependencies: Dependencies = {}) {
    const requestStream = dependencies.request ?? defaultRequest
    const cancelRun = dependencies.cancelRun ?? ((runId: string) => talosFetch(
        `/api/talos/runs/${encodeURIComponent(runId)}/cancel`,
        { method: 'POST' },
    ))
    const state = reactive<TalosStreamingChatState>(createTalosStreamingChatState())
    let generation = 0
    let active: ActiveSend | null = null
    const activeToken = ref<number | null>(null)

    const activeForState = computed(() => (
        activeToken.value !== null
        && activeToken.value === generation
        && ['connecting', 'streaming', 'awaiting_approval'].includes(state.status)
    ))
    const canCancel = computed(() => activeForState.value && state.runId !== null)

    function resetFor(next: TalosStreamingChatRequest) {
        Object.assign(state, createTalosStreamingChatState(), {
            ownerSessionId: next.sessionId,
            ownerMessageId: next.userMessageId,
            status: 'connecting' as const,
        })
    }

    function assertRequestIdentity(next: TalosStreamingChatRequest) {
        if (next.payload.session_id !== next.sessionId
            || next.payload.user_message_id !== next.userMessageId
            || typeof next.payload.message !== 'string') {
            throw new TalosStreamingChatError(
                'TALOS_STREAM_OWNER_MISMATCH',
                'The streaming request does not match its persisted chat message.',
            )
        }
    }

    function diagnostic(
        error: TalosStreamingChatError,
        phase: TalosSendDiagnostic['phase'],
    ): TalosSendDiagnostic {
        return {
            code: error.code,
            phase,
            run_id: state.runId,
            last_sequence: state.lastSequence,
            retryable: error.retryable,
            reconciled: state.reconciled,
            attempts: state.attempts,
            ...(error.status === undefined ? {} : { http_status: error.status }),
        }
    }

    function findTool(event: Extract<TalosStreamEvent, { kind: 'tool.started' | 'tool.progress' | 'tool.completed' }>) {
        const payload = event.payload
        const providerCallId = payload.provider_call_id
        const name = 'tool_name' in payload ? payload.tool_name : payload.name
        const fallbackId = 'index' in payload ? `provider-tool-${payload.index}` : `tool-${state.tools.length}`
        const index = state.tools.findIndex((tool) => (
            (providerCallId !== null && tool.id === providerCallId)
            || (name !== null && tool.name === name && tool.status === 'running')
        ))
        return { index, id: providerCallId ?? fallbackId, name: name ?? 'Tool' }
    }

    function applyEvent(send: ActiveSend, event: TalosStreamEvent) {
        if (send.token !== generation || active?.token !== send.token) return
        if (state.runId !== null && event.run_id !== state.runId) {
            throw new TalosStreamingChatError(
                'TALOS_STREAM_RUN_MISMATCH',
                'The streaming event belongs to a different TALOS run.',
            )
        }
        if (event.sequence <= state.lastSequence) return

        if (event.kind === 'run.started') {
            if (event.payload.run.session_id !== send.request.sessionId
                || event.payload.run.id !== event.run_id) {
                throw new TalosStreamingChatError(
                    'TALOS_STREAM_OWNER_MISMATCH',
                    'The streaming run belongs to a different chat session.',
                )
            }
            state.runId = event.run_id
            state.status = 'streaming'
        } else if (event.kind === 'text.delta') {
            state.rawText += event.payload.text
            state.status = 'streaming'
        } else if (event.kind === 'reasoning.delta') {
            state.reasoningText += event.payload.text
            state.status = 'streaming'
        } else if (event.kind === 'tool.started'
            || event.kind === 'tool.progress'
            || event.kind === 'tool.completed') {
            const tool = findTool(event)
            const status = 'status' in event.payload
                ? event.payload.status
                : event.kind === 'tool.completed' ? 'succeeded' : 'running'
            const normalized: TalosStreamingTool = {
                id: tool.id,
                name: tool.name,
                status,
            }
            if (tool.index >= 0) state.tools.splice(tool.index, 1, normalized)
            else state.tools.push(normalized)
            if (status === 'awaiting_approval') {
                send.awaitingApproval = true
                state.status = 'awaiting_approval'
            } else if (!['completed', 'cancelled', 'failed'].includes(state.status)) {
                state.status = 'streaming'
            }
        } else if (event.kind === 'usage.updated') {
            state.usage = {
                input_tokens: event.payload.input_tokens,
                output_tokens: event.payload.output_tokens,
                total_tokens: event.payload.total_tokens,
                cached_tokens: event.payload.cached_tokens,
                cache_read_tokens: event.payload.cache_read_tokens ?? null,
                cache_write_tokens: event.payload.cache_write_tokens ?? null,
                cache_miss_tokens: event.payload.cache_miss_tokens ?? null,
                cache_write_5m_tokens: event.payload.cache_write_5m_tokens ?? null,
                cache_write_1h_tokens: event.payload.cache_write_1h_tokens ?? null,
            }
        } else if (event.kind === 'artifact.created') {
            state.artifacts.push(event.payload)
        } else if (event.kind === 'message.completed') {
            if (event.payload.message.session_id !== send.request.sessionId) {
                throw new TalosStreamingChatError(
                    'TALOS_STREAM_OWNER_MISMATCH',
                    'The completed message belongs to a different chat session.',
                )
            }
            send.assistantMessage = event.payload.message
            state.status = 'completed'
        } else if (event.kind === 'run.failed') {
            send.failure = {
                code: event.payload.code,
                retryable: event.payload.retryable,
            }
            state.status = 'failed'
        } else if (event.kind === 'run.cancelled') {
            send.cancelled = true
            state.status = 'cancelled'
        }

        state.lastSequence = event.sequence
    }

    async function jsonBody(response: Response) {
        try {
            return await response.json() as unknown
        } catch (error) {
            throw new TalosStreamingChatError(
                'TALOS_STREAM_INVALID_JSON',
                'TALOS received malformed JSON from the streaming endpoint.',
                { status: response.status, cause: error },
            )
        }
    }

    async function openAttempt(send: ActiveSend, attempt: number): Promise<TalosStreamingChatResult | null> {
        state.attempts = attempt
        const body = attempt === 1
            ? send.request.payload
            : { ...send.request.payload, after_sequence: state.lastSequence }
        const response = await requestStream(send.request.endpoint ?? '/api/talos/chat/stream', {
            method: 'POST',
            body: JSON.stringify(body),
            signal: send.controller.signal,
        })
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

        if (!response.ok) {
            const payload = contentType.includes('application/json')
                ? await jsonBody(response)
                : await response.text()
            throw new TalosStreamingChatError(
                'TALOS_STREAM_HTTP_FAILURE',
                safeHttpMessage(payload, response.status),
                {
                    retryable: response.status === 408 || response.status === 429 || response.status >= 500,
                    status: response.status,
                },
            )
        }
        if (contentType.includes('application/json')) {
            const fallback = await jsonBody(response)
            state.status = 'completed'
            return { kind: 'json', response: fallback }
        }
        if (!contentType.includes('text/event-stream')) {
            throw new TalosStreamingChatError(
                'TALOS_STREAM_CONTENT_TYPE_UNSUPPORTED',
                'TALOS received an unsupported streaming response type.',
            )
        }
        if (!response.body) {
            throw new TalosStreamingChatError(
                'TALOS_STREAM_BODY_UNAVAILABLE',
                'The TALOS streaming response did not include a readable body.',
                { retryable: true },
            )
        }

        const responseRunId = response.headers.get('X-Talos-Run-ID')
        if (!responseRunId) {
            throw new TalosStreamingChatError(
                'TALOS_STREAM_RUN_MISMATCH',
                'The TALOS streaming response did not identify its run.',
            )
        }
        if (state.runId !== null && responseRunId !== state.runId) {
            throw new TalosStreamingChatError(
                'TALOS_STREAM_RUN_MISMATCH',
                'The retry response belongs to a different TALOS run.',
            )
        }
        state.runId = responseRunId
        state.reconciled = state.reconciled || response.headers.get('X-Talos-Reconciled') === '1'
        state.status = 'streaming'

        const { createTalosStreamParser } = await import('../lib/talosStreamProtocol')
        const parser = createTalosStreamParser({
            onEvent: (event) => applyEvent(send, event),
        })
        const decoder = new TextDecoder()
        const reader = response.body.getReader()
        try {
            while (true) {
                const chunk = await reader.read()
                if (chunk.done) break
                parser.feed(decoder.decode(chunk.value, { stream: true }))
            }
            const trailing = decoder.decode()
            if (trailing) parser.feed(trailing)
            parser.finish()
        } finally {
            reader.releaseLock()
        }

        if (send.failure) {
            throw new TalosStreamingChatError(
                send.failure.code,
                'TALOS could not complete the streamed chat turn.',
                { retryable: send.failure.retryable },
            )
        }
        if (send.assistantMessage || send.awaitingApproval || send.cancelled) return null
        throw new RetriableStreamDisconnect('The stream ended before a terminal event.')
    }

    async function start(next: TalosStreamingChatRequest): Promise<TalosStreamingChatResult> {
        if (active !== null) {
            throw new TalosStreamingChatError(
                'TALOS_STREAM_ALREADY_ACTIVE',
                'A TALOS response is already in progress.',
            )
        }
        assertRequestIdentity(next)
        generation += 1
        resetFor(next)
        const send: ActiveSend = {
            token: generation,
            request: {
                ...next,
                payload: { ...next.payload },
            },
            controller: new AbortController(),
            assistantMessage: null,
            failure: null,
            awaitingApproval: false,
            cancelled: false,
            cancelPromise: null,
        }
        active = send
        activeToken.value = send.token

        try {
            for (let attempt = 1; attempt <= 2; attempt += 1) {
                try {
                    const fallback = await openAttempt(send, attempt)
                    if (fallback) return fallback
                    return {
                        kind: 'stream',
                        assistantMessage: send.assistantMessage,
                        awaitingApproval: send.awaitingApproval,
                        cancelled: send.cancelled,
                    }
                } catch (error) {
                    if (send.cancelled || send.controller.signal.aborted) {
                        return {
                            kind: 'stream',
                            assistantMessage: send.assistantMessage,
                            awaitingApproval: false,
                            cancelled: true,
                        }
                    }
                    const retryable = error instanceof RetriableStreamDisconnect
                        || (!isTalosStreamProtocolError(error)
                            && !(error instanceof TalosStreamingChatError))
                        || (error instanceof TalosStreamingChatError && error.retryable)
                    if (retryable && attempt < 2) continue
                    if (error instanceof RetriableStreamDisconnect) {
                        throw new TalosStreamingChatError(
                            'TALOS_STREAM_INCOMPLETE',
                            'TALOS could not reconcile the incomplete streaming response.',
                            { retryable: true, cause: error },
                        )
                    }
                    throw error
                }
            }
            throw new TalosStreamingChatError(
                'TALOS_STREAM_INCOMPLETE',
                'TALOS could not reconcile the incomplete streaming response.',
                { retryable: true },
            )
        } catch (error) {
            const normalized = normalizeError(error)
            state.status = 'failed'
            state.error = normalized.message
            state.diagnostic = diagnostic(
                normalized,
                isTalosStreamProtocolError(error) ? 'protocol' : state.runId ? 'stream' : 'connect',
            )
            throw normalized
        } finally {
            if (active?.token === send.token) {
                active = null
                activeToken.value = null
            }
        }
    }

    async function cancel() {
        const send = active
        if (!send || !state.runId || !canCancel.value) return false
        if (send.cancelPromise) return send.cancelPromise

        send.cancelPromise = (async () => {
            try {
                const response = await cancelRun(state.runId!)
                const eventCandidate = isRecord(response)
                    && isRecord(response.data)
                    ? response.data.event
                    : null
                const { parseTalosStreamEnvelope } = await import('../lib/talosStreamProtocol')
                const event = parseTalosStreamEnvelope(eventCandidate)
                if (event.kind !== 'run.cancelled' || event.run_id !== state.runId) {
                    throw new TalosStreamingChatError(
                        'TALOS_STREAM_RUN_MISMATCH',
                        'The cancel response belongs to a different TALOS run.',
                    )
                }
                applyEvent(send, event)
                send.cancelled = true
                send.controller.abort()
                return true
            } catch (error) {
                const normalized = error instanceof TalosStreamingChatError
                    ? error
                    : new TalosStreamingChatError(
                        'TALOS_STREAM_CANCEL_FAILED',
                        error instanceof Error && error.message
                            ? error.message
                            : 'TALOS could not cancel the active run.',
                        { cause: error },
                    )
                state.cancelError = normalized.message
                state.diagnostic = diagnostic(normalized, 'cancel')
                throw normalized
            } finally {
                send.cancelPromise = null
            }
        })()

        return send.cancelPromise
    }

    function clear() {
        generation += 1
        if (active) active.controller.abort()
        active = null
        activeToken.value = null
        Object.assign(state, createTalosStreamingChatState())
    }

    return {
        state: readonly(state),
        canCancel,
        start,
        cancel,
        clear,
    }
}
