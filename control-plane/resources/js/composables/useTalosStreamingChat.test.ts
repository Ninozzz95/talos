// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
    TalosStreamingChatError,
    useTalosStreamingChat,
    type TalosStreamingChatRequest,
} from './useTalosStreamingChat'

const request: TalosStreamingChatRequest = {
    sessionId: 'session-1',
    userMessageId: 'message-user-1',
    payload: {
        message: 'Explain the evidence.',
        session_id: 'session-1',
        user_message_id: 'message-user-1',
        model_profile_id: 'profile-1',
        effort: 'high',
        thinking: true,
    },
}

function envelope(sequence: number, kind: string, payload: Record<string, unknown>, runId = 'run-1') {
    return {
        contract: 'talos.chat.stream.v1',
        run_id: runId,
        sequence,
        kind,
        occurred_at: '2026-07-28T10:00:00.000Z',
        payload,
    }
}

function runStarted(sequence = 1, sessionId = 'session-1', runId = 'run-1') {
    return envelope(sequence, 'run.started', {
        run: {
            id: runId,
            session_id: sessionId,
            model_profile_id: 'profile-1',
            model_routing_profile_id: null,
            context_set_id: null,
            mode: 'verified_execution',
            status: 'running',
            provider: 'deepseek',
            model: 'deepseek-chat',
            started_at: '2026-07-28T10:00:00.000Z',
        },
    }, runId)
}

function completed(sequence: number, content: string, runId = 'run-1') {
    const requestKey = `talos.chat.stream.v1:${runId}:assistant`
    return envelope(sequence, 'message.completed', {
        message_id: 'message-assistant-1',
        request_key: requestKey,
        message: {
            id: 'message-assistant-1',
            session_id: 'session-1',
            role: 'assistant',
            content,
            model_profile_id: 'profile-1',
            run_id: runId,
            request_key: requestKey,
            metadata: { source: 'talos_agent_turn' },
            created_at: '2026-07-28T10:00:01.000Z',
            updated_at: '2026-07-28T10:00:01.000Z',
        },
    }, runId)
}

function frame(value: ReturnType<typeof envelope>) {
    return `id: ${value.sequence}\nevent: ${value.kind}\ndata: ${JSON.stringify(value)}\n\n`
}

function sseResponse(events: Array<ReturnType<typeof envelope>>, headers: Record<string, string> = {}) {
    const encoder = new TextEncoder()
    return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
            const raw = events.map(frame).join('')
            controller.enqueue(encoder.encode(raw.slice(0, 37)))
            controller.enqueue(encoder.encode(raw.slice(37)))
            controller.close()
        },
    }), {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream; charset=UTF-8',
            'X-Talos-Run-ID': events[0]?.run_id ?? 'run-1',
            'X-Talos-Reconciled': '0',
            ...headers,
        },
    })
}

describe('useTalosStreamingChat', () => {
    it('projects text, reasoning, tools, usage and the durable terminal message', async () => {
        const requestStream = vi.fn().mockResolvedValue(sseResponse([
            runStarted(),
            envelope(2, 'text.delta', { text: 'Hello ', provider_sequence: 1 }),
            envelope(3, 'reasoning.delta', { text: 'Checked evidence.', provider_sequence: 2 }),
            envelope(4, 'tool.started', {
                provider_sequence: 3,
                index: 0,
                provider_call_id: 'call-1',
                name: 'browser_read',
                arguments_progressed: true,
            }),
            envelope(5, 'tool.completed', {
                provider_call_id: 'call-1',
                tool_name: 'browser_read',
                status: 'succeeded',
            }),
            envelope(6, 'usage.updated', {
                input_tokens: 10,
                output_tokens: 2,
                total_tokens: 12,
                cached_tokens: 4,
                cache_read_tokens: 4,
                cache_write_tokens: 0,
                cache_miss_tokens: null,
                cache_write_5m_tokens: 0,
                cache_write_1h_tokens: null,
                provider_sequence: 4,
            }),
            envelope(7, 'text.delta', { text: 'world.', provider_sequence: 5 }),
            completed(8, 'Hello world.'),
        ]))
        const streaming = useTalosStreamingChat({ request: requestStream })

        const result = await streaming.start(request)

        expect(result).toEqual(expect.objectContaining({
            kind: 'stream',
            assistantMessage: expect.objectContaining({
                id: 'message-assistant-1',
                content: 'Hello world.',
            }),
        }))
        expect(streaming.state.rawText).toBe('Hello world.')
        expect(streaming.state.reasoningText).toBe('Checked evidence.')
        expect(streaming.state.tools).toEqual([
            expect.objectContaining({ name: 'browser_read', status: 'succeeded' }),
        ])
        expect(streaming.state.usage).toEqual({
            input_tokens: 10,
            output_tokens: 2,
            total_tokens: 12,
            cached_tokens: 4,
            cache_read_tokens: 4,
            cache_write_tokens: 0,
            cache_miss_tokens: null,
            cache_write_5m_tokens: 0,
            cache_write_1h_tokens: null,
        })
        expect(streaming.state.status).toBe('completed')
        expect(streaming.state.lastSequence).toBe(8)
    })

    it('returns the existing JSON response without retrying or creating another turn', async () => {
        const response = { text: 'Buffered answer', pending_approvals: [] }
        const requestStream = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }))
        const streaming = useTalosStreamingChat({ request: requestStream })

        await expect(streaming.start(request)).resolves.toEqual({ kind: 'json', response })
        expect(requestStream).toHaveBeenCalledOnce()
        expect(streaming.state.status).toBe('completed')
    })

    it('reconciles one transport disconnect with the exact origin and suppresses duplicate sequences', async () => {
        const encoder = new TextEncoder()
        let firstPull = true
        const first = new Response(new ReadableStream<Uint8Array>({
            pull(controller) {
                if (firstPull) {
                    firstPull = false
                    controller.enqueue(encoder.encode([
                    frame(runStarted()),
                    frame(envelope(2, 'text.delta', { text: 'Hello ', provider_sequence: 1 })),
                    ].join('')))
                    return
                }
                controller.error(new TypeError('socket reset'))
            },
        }), {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'X-Talos-Run-ID': 'run-1',
                'X-Talos-Reconciled': '0',
            },
        })
        const second = sseResponse([
            envelope(2, 'text.delta', { text: 'Hello ', provider_sequence: 1 }),
            envelope(3, 'text.delta', { text: 'world.', provider_sequence: 2 }),
            completed(4, 'Hello world.'),
        ], { 'X-Talos-Reconciled': '1' })
        const requestStream = vi.fn()
            .mockResolvedValueOnce(first)
            .mockResolvedValueOnce(second)
        const streaming = useTalosStreamingChat({ request: requestStream })

        await streaming.start(request)

        expect(requestStream).toHaveBeenCalledTimes(2)
        expect(JSON.parse(String(requestStream.mock.calls[0]![1]?.body))).toEqual(request.payload)
        expect(JSON.parse(String(requestStream.mock.calls[1]![1]?.body))).toEqual({
            ...request.payload,
            after_sequence: 2,
        })
        expect(streaming.state.rawText).toBe('Hello world.')
        expect(streaming.state.reconciled).toBe(true)
        expect(streaming.state.attempts).toBe(2)
    })

    it('treats a clean awaiting-approval EOF as paused rather than failed', async () => {
        const requestStream = vi.fn().mockResolvedValue(sseResponse([
            runStarted(),
            envelope(2, 'tool.progress', {
                provider_call_id: 'call-1',
                tool_name: 'browser_click',
                status: 'awaiting_approval',
            }),
        ]))
        const streaming = useTalosStreamingChat({ request: requestStream })

        await expect(streaming.start(request)).resolves.toEqual(expect.objectContaining({
            kind: 'stream',
            awaitingApproval: true,
            assistantMessage: null,
        }))
        expect(streaming.state.status).toBe('awaiting_approval')
    })

    it('uses the owner-scoped cancel endpoint and aborts local reading only after cancellation succeeds', async () => {
        const encoder = new TextEncoder()
        let streamController!: ReadableStreamDefaultController<Uint8Array>
        const requestStream = vi.fn().mockImplementation((_url, init?: RequestInit) => {
            const response = new Response(new ReadableStream<Uint8Array>({
                start(controller) {
                    streamController = controller
                    controller.enqueue(encoder.encode(frame(runStarted())))
                    init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
                },
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'X-Talos-Run-ID': 'run-1',
                },
            })
            return Promise.resolve(response)
        })
        const cancelRun = vi.fn().mockResolvedValue({
            data: {
                event: envelope(2, 'run.cancelled', { reason: 'user_requested' }),
            },
        })
        const streaming = useTalosStreamingChat({ request: requestStream, cancelRun })
        const pending = streaming.start(request)
        await vi.waitFor(() => expect(streaming.state.runId).toBe('run-1'))

        await streaming.cancel()
        await expect(pending).resolves.toEqual(expect.objectContaining({ kind: 'stream', cancelled: true }))

        expect(cancelRun).toHaveBeenCalledOnce()
        expect(cancelRun).toHaveBeenCalledWith('run-1')
        expect(streaming.state.status).toBe('cancelled')
        expect(streamController.desiredSize).toBeNull()
    })

    it('does not abort provider work when the authoritative cancel request fails', async () => {
        const encoder = new TextEncoder()
        let controller!: ReadableStreamDefaultController<Uint8Array>
        let requestSignal: AbortSignal | null = null
        const requestStream = vi.fn().mockImplementation((_url, init?: RequestInit) => {
            requestSignal = init?.signal ?? null
            return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
                start(value) {
                    controller = value
                    controller.enqueue(encoder.encode(frame(runStarted())))
                },
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'X-Talos-Run-ID': 'run-1',
                },
            }))
        })
        const cancelRun = vi.fn().mockRejectedValue(new Error('cancel endpoint unavailable'))
        const streaming = useTalosStreamingChat({ request: requestStream, cancelRun })
        const pending = streaming.start(request)
        await vi.waitFor(() => expect(streaming.state.runId).toBe('run-1'))

        await expect(streaming.cancel()).rejects.toThrow('cancel endpoint unavailable')
        expect(requestSignal?.aborted).toBe(false)
        expect(streaming.state.status).toBe('streaming')

        controller.enqueue(encoder.encode(frame(completed(2, 'Completed after failed cancel'))))
        controller.close()
        await pending
    })

    it('rejects a run whose durable session owner differs from the requested chat', async () => {
        const streaming = useTalosStreamingChat({
            request: vi.fn().mockResolvedValue(sseResponse([
                runStarted(1, 'session-foreign'),
            ])),
        })

        await expect(streaming.start(request)).rejects.toMatchObject<TalosStreamingChatError>({
            code: 'TALOS_STREAM_OWNER_MISMATCH',
        })
    })

    it('rejects a duplicate start while one stream owns the send slot', async () => {
        let controller!: ReadableStreamDefaultController<Uint8Array>
        const streaming = useTalosStreamingChat({
            request: vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
                start(value) {
                    controller = value
                },
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'X-Talos-Run-ID': 'run-1',
                },
            })),
        })
        const first = streaming.start(request)

        await expect(streaming.start(request)).rejects.toMatchObject<TalosStreamingChatError>({
            code: 'TALOS_STREAM_ALREADY_ACTIVE',
        })
        controller.enqueue(new TextEncoder().encode(frame(runStarted())))
        controller.enqueue(new TextEncoder().encode(frame(completed(2, 'Done'))))
        controller.close()
        await first
    })
})
