import type { TalosToolCall } from '@/stores/chat'

/**
 * Reading tool calls back out of four different wire formats, and writing tool
 * RESULTS back in a shape each provider accepts.
 *
 * The internal representation is `TalosToolCall { id, name, arguments }` with
 * arguments as a JSON string — the OpenAI shape, because it is the only one
 * that survives every round trip: Anthropic and Gemini hand back objects,
 * which serialise into a string losslessly, while the reverse is not true.
 *
 * Streaming is where this gets sharp. OpenAI splits a single call across many
 * deltas keyed by index, Anthropic across `input_json_delta` fragments. Both
 * accumulators below exist because a half-received call must never be executed.
 */
export interface TalosToolCallAccumulator {
    push(payload: unknown): void
    calls(): TalosToolCall[]
}

interface PartialCall {
    id: string
    name: string
    arguments: string
}

/** OpenAI, DeepSeek, OpenRouter and Ollama streaming deltas. */
export function createOpenAiToolCallAccumulator(): TalosToolCallAccumulator {
    const partials = new Map<number, PartialCall>()
    return {
        push(payload) {
            const event = payload as {
                choices?: Array<{
                    delta?: {
                        tool_calls?: Array<{
                            index?: number
                            id?: string
                            function?: { name?: string; arguments?: string }
                        }>
                    }
                }>
            }
            for (const delta of event.choices?.[0]?.delta?.tool_calls ?? []) {
                const index = typeof delta.index === 'number' ? delta.index : 0
                const current = partials.get(index) ?? { id: '', name: '', arguments: '' }
                partials.set(index, {
                    id: delta.id ?? current.id,
                    name: delta.function?.name ?? current.name,
                    // Arguments arrive in fragments — concatenation is the whole point.
                    arguments: current.arguments + (delta.function?.arguments ?? ''),
                })
            }
        },
        calls() {
            return [...partials.entries()]
                .sort(([left], [right]) => left - right)
                .map(([, call]) => call)
                .filter((call) => call.name !== '')
        },
    }
}

/** Anthropic streaming: content_block_start + input_json_delta fragments. */
export function createAnthropicToolCallAccumulator(): TalosToolCallAccumulator {
    const partials = new Map<number, PartialCall>()
    return {
        push(payload) {
            const event = payload as {
                type?: string
                index?: number
                content_block?: { type?: string; id?: string; name?: string }
                delta?: { type?: string; partial_json?: string }
            }
            const index = typeof event.index === 'number' ? event.index : 0
            if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                partials.set(index, {
                    id: event.content_block.id ?? '',
                    name: event.content_block.name ?? '',
                    arguments: '',
                })
                return
            }
            if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
                const current = partials.get(index)
                if (!current) return
                partials.set(index, { ...current, arguments: current.arguments + (event.delta.partial_json ?? '') })
            }
        },
        calls() {
            return [...partials.entries()]
                .sort(([left], [right]) => left - right)
                .map(([, call]) => ({ ...call, arguments: call.arguments === '' ? '{}' : call.arguments }))
                .filter((call) => call.name !== '')
        },
    }
}

/** Gemini streaming and buffered: `functionCall` parts carry the whole call. */
export function createGeminiToolCallAccumulator(): TalosToolCallAccumulator {
    const found: TalosToolCall[] = []
    return {
        push(payload) {
            const event = payload as {
                candidates?: Array<{ content?: { parts?: Array<{ functionCall?: { name?: string; args?: unknown } }> } }>
            }
            for (const part of event.candidates?.[0]?.content?.parts ?? []) {
                const call = part.functionCall
                if (!call?.name) continue
                found.push({
                    // Gemini has no call id; the name plus its position is the
                    // only stable handle, and the result is matched by name.
                    id: `${call.name}-${found.length}`,
                    name: call.name,
                    arguments: JSON.stringify(call.args ?? {}),
                })
            }
        },
        calls: () => found.slice(),
    }
}

/** Buffered (non-streaming) responses, one shape per family. */
export function parseOpenAiToolCalls(message: unknown): TalosToolCall[] {
    const value = message as {
        tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>
    }
    return (value?.tool_calls ?? [])
        .filter((call) => typeof call.function?.name === 'string')
        .map((call, index) => ({
            id: call.id ?? `call-${index}`,
            name: call.function!.name as string,
            arguments: typeof call.function?.arguments === 'string'
                ? call.function.arguments
                : JSON.stringify(call.function?.arguments ?? {}),
        }))
}

export function parseAnthropicToolCalls(content: unknown): TalosToolCall[] {
    const blocks = Array.isArray(content) ? content : []
    return blocks
        .filter((block) => (block as { type?: string }).type === 'tool_use')
        .map((block, index) => {
            const value = block as { id?: string; name?: string; input?: unknown }
            return {
                id: value.id ?? `call-${index}`,
                name: value.name ?? '',
                arguments: JSON.stringify(value.input ?? {}),
            }
        })
        .filter((call) => call.name !== '')
}

export function parseOllamaToolCalls(message: unknown): TalosToolCall[] {
    const value = message as {
        tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }>
    }
    return (value?.tool_calls ?? [])
        .filter((call) => typeof call.function?.name === 'string')
        .map((call, index) => ({
            id: `${call.function!.name}-${index}`,
            name: call.function!.name as string,
            arguments: typeof call.function?.arguments === 'string'
                ? call.function.arguments
                : JSON.stringify(call.function?.arguments ?? {}),
        }))
}
