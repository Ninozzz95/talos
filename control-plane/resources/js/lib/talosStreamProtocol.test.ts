import { describe, expect, it, vi } from 'vitest'
import {
    createTalosStreamParser,
    parseTalosStreamEnvelope,
    TalosStreamProtocolError,
} from './talosStreamProtocol'

const runStarted = {
    contract: 'talos.chat.stream.v1',
    run_id: 'run-1',
    sequence: 1,
    kind: 'run.started',
    occurred_at: '2026-07-28T10:00:00.000Z',
    payload: {
        run: {
            id: 'run-1',
            session_id: 'session-1',
            model_profile_id: 'profile-1',
            model_routing_profile_id: null,
            context_set_id: null,
            mode: 'tool_agent',
            status: 'running',
            provider: 'deepseek',
            model: 'deepseek-chat',
            started_at: '2026-07-28T10:00:00.000Z',
        },
    },
} as const

function frame(envelope: unknown, event = 'run.started', id = '1') {
    return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(envelope)}\n\n`
}

describe('talosStreamProtocol', () => {
    it('parses a canonical event exactly once when its SSE frame is split across chunks', () => {
        const onEvent = vi.fn()
        const parser = createTalosStreamParser({ onEvent })
        const raw = frame(runStarted)

        parser.feed(raw.slice(0, 17))
        parser.feed(raw.slice(17, 53))
        expect(onEvent).not.toHaveBeenCalled()

        parser.feed(raw.slice(53))
        parser.finish()

        expect(onEvent).toHaveBeenCalledOnce()
        expect(onEvent).toHaveBeenCalledWith(runStarted)
    })

    it('accepts both provider-progress and lifecycle tool payloads without conflating them', () => {
        expect(parseTalosStreamEnvelope({
            ...runStarted,
            sequence: 2,
            kind: 'tool.started',
            payload: {
                provider_sequence: 1,
                index: 0,
                provider_call_id: null,
                name: 'browser_navigate',
                arguments_progressed: true,
            },
        }).kind).toBe('tool.started')

        expect(parseTalosStreamEnvelope({
            ...runStarted,
            sequence: 3,
            kind: 'tool.progress',
            payload: {
                provider_call_id: 'call-1',
                tool_name: 'browser_click',
                status: 'awaiting_approval',
            },
        }).kind).toBe('tool.progress')
    })

    it('preserves nullable cache usage while accepting the legacy usage envelope', () => {
        const current = parseTalosStreamEnvelope({
            ...runStarted,
            sequence: 4,
            kind: 'usage.updated',
            payload: {
                input_tokens: 20,
                output_tokens: 4,
                total_tokens: 24,
                cached_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: null,
                cache_miss_tokens: 20,
                cache_write_5m_tokens: null,
                cache_write_1h_tokens: null,
                provider_sequence: 2,
            },
        })
        expect(current.kind).toBe('usage.updated')
        if (current.kind === 'usage.updated') {
            expect(current.payload.cache_read_tokens).toBe(0)
            expect(current.payload.cache_write_tokens).toBeNull()
        }

        expect(parseTalosStreamEnvelope({
            ...runStarted,
            sequence: 5,
            kind: 'usage.updated',
            payload: {
                input_tokens: 20,
                output_tokens: 4,
                total_tokens: 24,
                cached_tokens: 0,
                provider_sequence: 3,
            },
        }).kind).toBe('usage.updated')
    })

    it('rejects malformed nullable cache usage', () => {
        expect(() => parseTalosStreamEnvelope({
            ...runStarted,
            sequence: 4,
            kind: 'usage.updated',
            payload: {
                input_tokens: 20,
                output_tokens: 4,
                total_tokens: 24,
                cached_tokens: 0,
                cache_read_tokens: '0',
                provider_sequence: 2,
            },
        })).toThrow(TalosStreamProtocolError)
    })

    it.each([
        ['unknown event kind', { ...runStarted, kind: 'provider.secret' }],
        ['unknown envelope field', { ...runStarted, api_key: 'secret' }],
        ['unknown payload field', {
            ...runStarted,
            kind: 'text.delta',
            payload: { text: 'hello', provider_sequence: 1, hidden_reasoning: 'secret' },
        }],
        ['non-positive sequence', { ...runStarted, sequence: 0 }],
        ['invalid contract', { ...runStarted, contract: 'talos.chat.stream.v2' }],
    ])('rejects %s before it reaches stream state', (_label, candidate) => {
        expect(() => parseTalosStreamEnvelope(candidate)).toThrow(TalosStreamProtocolError)
    })

    it.each([
        ['event name', frame(runStarted, 'text.delta', '1'), 'TALOS_STREAM_EVENT_MISMATCH'],
        ['event id', frame(runStarted, 'run.started', '2'), 'TALOS_STREAM_ID_MISMATCH'],
        ['JSON data', 'id: 1\nevent: run.started\ndata: {broken}\n\n', 'TALOS_STREAM_INVALID_JSON'],
    ])('rejects a mismatched or malformed %s', (_label, raw, code) => {
        const parser = createTalosStreamParser({ onEvent: vi.fn() })

        expect(() => parser.feed(raw)).toThrowError(
            expect.objectContaining({ code }),
        )
    })

    it('fails closed when the upstream parser reports an incomplete oversized frame', () => {
        const parser = createTalosStreamParser({
            onEvent: vi.fn(),
            maxBufferSize: 64,
        })

        expect(() => parser.feed(`data: ${'x'.repeat(128)}`)).toThrowError(
            expect.objectContaining({ code: 'TALOS_STREAM_PARSE_ERROR' }),
        )
    })

    it('fails closed when the stream ends with an incomplete frame', () => {
        const parser = createTalosStreamParser({ onEvent: vi.fn() })
        parser.feed('id: 1\nevent: run.started\ndata: {"contract":"talos.chat.stream.v1"')

        expect(() => parser.finish()).toThrowError(
            expect.objectContaining({ code: 'TALOS_STREAM_INCOMPLETE_FRAME' }),
        )
    })
})
