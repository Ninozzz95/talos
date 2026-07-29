import { createParser, type ParseError } from 'eventsource-parser'
import { z } from 'zod'

export const TALOS_STREAM_CONTRACT = 'talos.chat.stream.v1' as const

export type TalosStreamProtocolErrorCode =
    | 'TALOS_STREAM_INVALID_ENVELOPE'
    | 'TALOS_STREAM_INVALID_JSON'
    | 'TALOS_STREAM_EVENT_MISMATCH'
    | 'TALOS_STREAM_ID_MISMATCH'
    | 'TALOS_STREAM_PARSE_ERROR'
    | 'TALOS_STREAM_INCOMPLETE_FRAME'

export class TalosStreamProtocolError extends Error {
    readonly code: TalosStreamProtocolErrorCode

    constructor(code: TalosStreamProtocolErrorCode, message: string, options: { cause?: unknown } = {}) {
        super(message)
        this.name = 'TalosStreamProtocolError'
        this.code = code
        if (options.cause !== undefined) this.cause = options.cause
    }
}

const boundedId = z.string().trim().min(1).max(512)
const boundedText = (limit: number) => z.string().min(1).max(limit)
const nullableBoundedText = (limit: number) => z.string().min(1).max(limit).nullable()
const nonNegativeInteger = z.number().int().nonnegative()
const nullableNonNegativeInteger = nonNegativeInteger.nullable()
const providerSequence = z.number().int().positive()

const runStartedPayload = z.strictObject({
    run: z.strictObject({
        id: boundedId,
        session_id: boundedId,
        model_profile_id: boundedId.nullable(),
        model_routing_profile_id: boundedId.nullable(),
        context_set_id: boundedId.nullable(),
        mode: boundedText(64),
        status: boundedText(32),
        provider: nullableBoundedText(128),
        model: nullableBoundedText(256),
        started_at: nullableBoundedText(64),
    }),
})

const deltaPayload = z.strictObject({
    text: boundedText(65_536),
    provider_sequence: providerSequence,
})

const providerToolPayload = z.strictObject({
    provider_sequence: providerSequence,
    index: nonNegativeInteger,
    provider_call_id: nullableBoundedText(256),
    name: nullableBoundedText(128),
    arguments_progressed: z.boolean(),
})

const lifecycleToolPayload = z.strictObject({
    provider_call_id: boundedText(256),
    tool_name: boundedText(128),
    status: z.enum(['running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled']),
})

const usagePayload = z.strictObject({
    input_tokens: nonNegativeInteger,
    output_tokens: nonNegativeInteger,
    total_tokens: nonNegativeInteger,
    cached_tokens: nonNegativeInteger,
    cache_read_tokens: nullableNonNegativeInteger.optional(),
    cache_write_tokens: nullableNonNegativeInteger.optional(),
    cache_miss_tokens: nullableNonNegativeInteger.optional(),
    cache_write_5m_tokens: nullableNonNegativeInteger.optional(),
    cache_write_1h_tokens: nullableNonNegativeInteger.optional(),
    provider_sequence: providerSequence,
})

const artifactPayload = z.strictObject({
    artifact_id: boundedText(256),
    artifact_type: boundedText(128),
    mime_type: boundedText(255),
    name: boundedText(255).optional(),
    size_bytes: nonNegativeInteger.optional(),
})

const completedMessage = z.strictObject({
    id: boundedId,
    session_id: boundedId,
    role: z.literal('assistant'),
    content: z.string().max(1_000_000),
    model_profile_id: z.union([z.string().min(1).max(512), z.number().int()]).nullable(),
    run_id: boundedId,
    request_key: boundedText(512),
    metadata: z.record(z.string(), z.unknown()),
    created_at: nullableBoundedText(64),
    updated_at: nullableBoundedText(64),
})

const messageCompletedPayload = z.strictObject({
    message_id: boundedId,
    request_key: boundedText(512),
    message: completedMessage,
})

const runFailedPayload = z.strictObject({
    status: z.enum(['failed', 'recovery_required']),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/),
    retryable: z.boolean(),
})

const runCancelledPayload = z.strictObject({
    reason: z.enum(['user_requested', 'provider_cancelled', 'system_cancelled']),
})

const heartbeatPayload = z.strictObject({})

const envelope = <Kind extends string, Payload extends z.ZodType>(
    kind: Kind,
    payload: Payload,
) => z.strictObject({
    contract: z.literal(TALOS_STREAM_CONTRACT),
    run_id: boundedId,
    sequence: z.number().int().positive(),
    kind: z.literal(kind),
    occurred_at: boundedText(64),
    payload,
})

const talosStreamEventSchema = z.discriminatedUnion('kind', [
    envelope('run.started', runStartedPayload),
    envelope('text.delta', deltaPayload),
    envelope('reasoning.delta', deltaPayload),
    envelope('tool.started', z.union([providerToolPayload, lifecycleToolPayload])),
    envelope('tool.progress', z.union([providerToolPayload, lifecycleToolPayload])),
    envelope('tool.completed', lifecycleToolPayload),
    envelope('usage.updated', usagePayload),
    envelope('stream.heartbeat', heartbeatPayload),
    envelope('artifact.created', artifactPayload),
    envelope('message.completed', messageCompletedPayload),
    envelope('run.failed', runFailedPayload),
    envelope('run.cancelled', runCancelledPayload),
])

export type TalosStreamEvent = z.infer<typeof talosStreamEventSchema>
export type TalosStreamCompletedMessage = z.infer<typeof completedMessage>

export function parseTalosStreamEnvelope(value: unknown): TalosStreamEvent {
    const result = talosStreamEventSchema.safeParse(value)
    if (!result.success) {
        throw new TalosStreamProtocolError(
            'TALOS_STREAM_INVALID_ENVELOPE',
            'TALOS received an invalid streaming event.',
            { cause: result.error },
        )
    }

    return result.data
}

export type TalosStreamParser = {
    feed: (chunk: string) => void
    finish: () => void
    reset: () => void
}

export function createTalosStreamParser(options: {
    onEvent: (event: TalosStreamEvent) => void
    maxBufferSize?: number
}): TalosStreamParser {
    let frameOpen = false
    let delimiterTail = ''
    let parserFault: TalosStreamProtocolError | null = null

    const parser = createParser({
        maxBufferSize: options.maxBufferSize ?? 1_100_000,
        onError: (error: ParseError) => {
            parserFault = new TalosStreamProtocolError(
                'TALOS_STREAM_PARSE_ERROR',
                'TALOS could not parse the streaming response.',
                { cause: error },
            )
        },
        onEvent: (message) => {
            let candidate: unknown
            try {
                candidate = JSON.parse(message.data)
            } catch (error) {
                throw new TalosStreamProtocolError(
                    'TALOS_STREAM_INVALID_JSON',
                    'TALOS received malformed streaming JSON.',
                    { cause: error },
                )
            }

            const event = parseTalosStreamEnvelope(candidate)
            if (message.event !== event.kind) {
                throw new TalosStreamProtocolError(
                    'TALOS_STREAM_EVENT_MISMATCH',
                    'TALOS received a stream event with a mismatched event name.',
                )
            }
            if (message.id !== String(event.sequence)) {
                throw new TalosStreamProtocolError(
                    'TALOS_STREAM_ID_MISMATCH',
                    'TALOS received a stream event with a mismatched event ID.',
                )
            }

            options.onEvent(event)
        },
    })

    function updateFrameBoundary(chunk: string) {
        const combined = `${delimiterTail}${chunk}`
        const delimiters = [...combined.matchAll(/\r\n\r\n|\n\n|\r\r/g)]
        const lastDelimiter = delimiters.at(-1)
        if (lastDelimiter?.index !== undefined) {
            const after = combined.slice(lastDelimiter.index + lastDelimiter[0].length)
            frameOpen = after.trim().length > 0
        } else if (combined.trim().length > 0) {
            frameOpen = true
        }
        delimiterTail = combined.slice(-3)
    }

    function throwParserFault() {
        if (!parserFault) return
        const fault = parserFault
        parserFault = null
        throw fault
    }

    return {
        feed(chunk: string) {
            updateFrameBoundary(chunk)
            parser.feed(chunk)
            throwParserFault()
        },
        finish() {
            if (frameOpen) {
                throw new TalosStreamProtocolError(
                    'TALOS_STREAM_INCOMPLETE_FRAME',
                    'The TALOS stream ended with an incomplete event.',
                )
            }
            parser.reset()
            throwParserFault()
        },
        reset() {
            parser.reset()
            frameOpen = false
            delimiterTail = ''
            parserFault = null
        },
    }
}
