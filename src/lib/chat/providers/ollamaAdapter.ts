import { z } from 'zod'
import { createTalosLineAccumulator, talosStreamText } from '@/lib/chat/providers/streamShared'
import { parseOllamaToolCalls } from '@/lib/tools/wire'
import { talosToolsForOpenAi } from '@/lib/tools/registry'
import type { TalosMobileCompletionInput, TalosMobileProviderAdapter } from '@/lib/chat/providerContracts'
import {
    malformedProviderResponse,
    normalizeHttpEndpoint,
    requireHttpSuccess,
} from '@/lib/chat/providerErrors'

const modelSchema = z.object({
    name: z.string().min(1).optional(),
    model: z.string().min(1),
    modified_at: z.string().optional(),
    size: z.number().optional(),
    digest: z.string().optional(),
    details: z.object({
        family: z.string().optional(),
        parameter_size: z.string().optional(),
        quantization_level: z.string().optional(),
    }).passthrough().optional(),
}).passthrough()

const listSchema = z.object({ models: z.array(modelSchema) }).passthrough()
const completionSchema = z.object({
    model: z.string().optional(),
    done: z.boolean().optional(),
    done_reason: z.string().optional(),
    message: z.object({ role: z.string(), content: z.string() }).passthrough(),
}).passthrough()

function requestTimeouts(timeout: number | undefined): { connectTimeout: number; readTimeout: number } | Record<string, never> {
    return Number.isInteger(timeout) && timeout! > 0
        ? { connectTimeout: timeout!, readTimeout: timeout! }
        : {}
}

/** Arguments travel as a JSON string internally; Ollama wants the object. */
function safeToolArgs(argumentsJson: string): unknown {
    try {
        return JSON.parse(argumentsJson || '{}')
    } catch {
        return {}
    }
}

function ollamaTurn(turn: TalosMobileCompletionInput['turns'][number]): Record<string, unknown> {
    // Ollama keys a result by `tool_name`, NOT by a call id: it has none.
    // This is the documented shape, checked before wiring. Assuming the OpenAI
    // `tool_call_id` here is how a result silently stops matching its call.
    if (turn.role === 'tool') {
        return { role: 'tool', tool_name: turn.toolName ?? '', content: turn.content }
    }
    if (turn.toolCalls?.length) {
        return {
            role: 'assistant',
            content: turn.content,
            tool_calls: turn.toolCalls.map((call) => ({
                function: { name: call.name, arguments: safeToolArgs(call.arguments) },
            })),
        }
    }
    if (!turn.parts?.length) return { role: turn.role, content: turn.content }
    const text = [turn.content]
    const images: string[] = []
    for (const part of turn.parts) {
        if (part.type === 'image') images.push(part.base64)
        else if (part.type === 'document_text') text.push(`[Untrusted attachment: ${part.name}]\n${part.text}`)
        else text.push(part.text)
    }
    const message: { role: string; content: string; images?: string[] } = {
        role: turn.role,
        content: text.filter(Boolean).join('\n\n'),
    }
    if (images.length > 0) message.images = images
    return message
}

function ollamaCompletionData(input: TalosMobileCompletionInput, stream: boolean): Record<string, unknown> {
    const messages: Array<Record<string, unknown>> = []
    if (input.system?.trim()) messages.push({ role: 'system', content: input.system })
    messages.push(...input.turns.map(ollamaTurn))
    return {
        model: input.model.id,
        messages,
        stream,
        /**
         * Keep the model resident between messages.
         *
         * Owner 2026-07-27 asked whether the caching work helps every provider.
         * It does not help this one at all: Ollama runs the model, so there is
         * no prefix to buy back. What costs time here is the model being
         * unloaded — Ollama's default is five minutes of idle — and reloading
         * several gigabytes of weights on the next message, which is the whole
         * wait before the first token.
         *
         * Fifteen minutes covers a normal back-and-forth. The endpoint is
         * typically a machine on the LAN rather than the phone, so this spends
         * that machine's RAM, not the phone's.
         */
        keep_alive: '15m',
        // Ollama speaks the OpenAI tool shape.
        ...(input.tools?.length ? { tools: talosToolsForOpenAi(input.tools as never) } : {}),
        ...(input.thinking ? { think: input.effort === 'off' ? true : input.effort } : {}),
    }
}

export const ollamaAdapter: TalosMobileProviderAdapter = {
    provider: 'ollama',
    requiresSecret: false,
    // The one provider that genuinely needs an address: it is a server the user
    // runs, and nobody but them knows where it is listening.
    requiresEndpoint: true,
    async listModels(credential, transport) {
        const endpoint = normalizeHttpEndpoint('ollama', 'list_models', credential.endpoint)
        const response = await transport.request({
            method: 'GET',
            url: `${endpoint}/api/tags`,
            ...requestTimeouts(credential.timeoutMs),
        })
        requireHttpSuccess({ provider: 'ollama', operation: 'list_models', status: response.status, data: response.data })
        const parsed = listSchema.safeParse(response.data)
        if (!parsed.success) throw malformedProviderResponse('ollama', 'list_models', { received: response.data, issues: parsed.error.issues })
        return {
            provider: 'ollama',
            models: parsed.data.models.map((model) => ({
                id: model.model,
                provider: 'ollama',
                displayName: model.name ?? model.model,
                chatCompatibility: 'unknown',
                inputModalities: [],
                outputModalities: ['text'],
                supportedParameters: ['think'],
                createdAt: model.modified_at ?? null,
            })),
        }
    },
    async complete(input, credential, transport) {
        const endpoint = normalizeHttpEndpoint('ollama', 'complete', credential.endpoint)
        const response = await transport.request({
            method: 'POST',
            url: `${endpoint}/api/chat`,
            headers: { 'content-type': 'application/json' },
            data: ollamaCompletionData(input, false),
            ...requestTimeouts(credential.timeoutMs),
        })
        requireHttpSuccess({ provider: 'ollama', operation: 'complete', status: response.status, data: response.data })
        const parsed = completionSchema.safeParse(response.data)
        if (!parsed.success) throw malformedProviderResponse('ollama', 'complete', { received: response.data, issues: parsed.error.issues })
        const toolCalls = parseOllamaToolCalls(parsed.data.message)
        // A tool-calling turn has an EMPTY content, which this used to treat as
        // a malformed response.
        if (!parsed.data.message.content && toolCalls.length === 0) {
            throw malformedProviderResponse('ollama', 'complete', { received: response.data, note: 'no message content and no tool calls' })
        }
        return {
            text: parsed.data.message.content,
            model: parsed.data.model ?? input.model.id,
            finishReason: parsed.data.done_reason ?? null,
            ...(toolCalls.length ? { toolCalls } : {}),
        }
    },
    // F2-T4: Ollama streams NDJSON lines (`message.content`), not SSE. The
    // local endpoint is same-network so fetch works when OLLAMA_ORIGINS allows
    // the WebView origin; otherwise the pre-first-byte failure falls back.
    async streamComplete(input, credential, handlers) {
        const endpoint = normalizeHttpEndpoint('ollama', 'complete', credential.endpoint)
        // Ollama streams a tool call as a COMPLETE object on one NDJSON line —
        // there are no argument deltas to reassemble, so the buffered parser is
        // the right reader here too.
        const collected: ReturnType<typeof parseOllamaToolCalls> = []
        const stream = await talosStreamText({
            url: `${endpoint}/api/chat`,
            headers: { 'content-type': 'application/json' },
            body: ollamaCompletionData(input, true),
            signal: handlers.signal,
            accumulator: createTalosLineAccumulator(),
            extract: (payload) => {
                const event = JSON.parse(payload) as { message?: { content?: string } }
                collected.push(...parseOllamaToolCalls(event.message))
                return event.message?.content ?? ''
            },
            // Defect #5: Ollama puts the model's thinking on `message.thinking`
            // when `think` is requested.
            extractReasoning: (payload) => {
                const event = JSON.parse(payload) as { message?: { thinking?: string | null } }
                return event.message?.thinking ?? ''
            },
            onChunk: handlers.onChunk,
            onReasoning: handlers.onReasoning,
        })
        // Ids are positional for Ollama, so they must be assigned once over the
        // whole stream rather than per line — otherwise every call is `-0`.
        const calls = collected.map((call, index) => ({ ...call, id: `${call.name}-${index}` }))
        if (!stream.text && calls.length === 0) throw malformedProviderResponse('ollama', 'complete', { received: { text: stream.text, calls: calls.length }, note: 'stream ended with no text and no tool calls' })
        return {
            text: stream.text,
            model: input.model.id,
            reasoning: stream.reasoning || undefined,
            ...(calls.length ? { toolCalls: calls, finishReason: 'tool_calls' } : {}),
        }
    },
}
