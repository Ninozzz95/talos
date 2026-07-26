import { z } from 'zod'
import { ANTHROPIC_VERSION, buildAnthropicRequest } from '@/lib/chat/anthropicClient'
import { talosToolsForAnthropic } from '@/lib/tools/registry'
import { createAnthropicToolCallAccumulator, parseAnthropicToolCalls } from '@/lib/tools/wire'
import { createTalosSseAccumulator, talosStreamText } from '@/lib/chat/providers/streamShared'
import type { TalosMobileProviderAdapter } from '@/lib/chat/providerContracts'
import {
    malformedProviderResponse,
    requireHttpSuccess,
    requireProviderApiKey,
} from '@/lib/chat/providerErrors'

const modelSchema = z.object({
    id: z.string().min(1),
    display_name: z.string().min(1),
    type: z.string().optional(),
    created_at: z.string().optional(),
}).passthrough()

const listSchema = z.object({
    data: z.array(modelSchema),
    has_more: z.boolean().optional().default(false),
    last_id: z.string().nullable().optional(),
}).passthrough()

const completionSchema = z.object({
    model: z.string().optional(),
    stop_reason: z.string().nullable().optional(),
    content: z.array(z.object({
        type: z.string(),
        text: z.string().optional(),
    }).passthrough()),
    usage: z.record(z.string(), z.number()).optional(),
}).passthrough()

function requestTimeouts(timeout: number | undefined): { connectTimeout: number; readTimeout: number } | Record<string, never> {
    return Number.isInteger(timeout) && timeout! > 0
        ? { connectTimeout: timeout!, readTimeout: timeout! }
        : {}
}

export const anthropicAdapter: TalosMobileProviderAdapter = {
    provider: 'anthropic',
    requiresSecret: true,
    async listModels(credential, transport) {
        const apiKey = requireProviderApiKey('anthropic', 'list_models', credential)
        const models = []
        let afterId: string | null = null
        for (let page = 0; page < 100; page += 1) {
            const query = new URLSearchParams({ limit: '1000' })
            if (afterId) query.set('after_id', afterId)
            const response = await transport.request({
                method: 'GET',
                url: `https://api.anthropic.com/v1/models?${query.toString()}`,
                headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
                ...requestTimeouts(credential.timeoutMs),
            })
            requireHttpSuccess({ provider: 'anthropic', operation: 'list_models', status: response.status, data: response.data })
            const parsed = listSchema.safeParse(response.data)
            if (!parsed.success) throw malformedProviderResponse('anthropic', 'list_models')
            models.push(...parsed.data.data.map((model) => ({
                id: model.id,
                provider: 'anthropic' as const,
                displayName: model.display_name,
                chatCompatibility: 'supported' as const,
                // N1.5: every current Claude model is vision-capable (the /v1/models
                // list carries no modality field, so declare it). Without image
                // here the vision gate wrongly blocks attaching images to Claude.
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                supportedParameters: ['thinking'],
                createdAt: model.created_at ?? null,
            })))
            if (!parsed.data.has_more) return { provider: 'anthropic', models }
            if (!parsed.data.last_id || parsed.data.last_id === afterId) throw malformedProviderResponse('anthropic', 'list_models')
            afterId = parsed.data.last_id
        }
        throw malformedProviderResponse('anthropic', 'list_models')
    },
    async complete(input, credential, transport) {
        const apiKey = requireProviderApiKey('anthropic', 'complete', credential)
        const request = buildAnthropicRequest(apiKey, {
            model: input.model.id,
            turns: input.turns,
            system: input.system,
            effort: input.effort,
            thinking: input.thinking,
            ...(input.tools?.length ? { tools: talosToolsForAnthropic(input.tools) } : {}),
        })
        const response = await transport.request({
            method: 'POST',
            url: request.url,
            headers: request.headers,
            data: request.body,
            ...requestTimeouts(credential.timeoutMs),
        })
        requireHttpSuccess({ provider: 'anthropic', operation: 'complete', status: response.status, data: response.data })
        const parsed = completionSchema.safeParse(response.data)
        if (!parsed.success) throw malformedProviderResponse('anthropic', 'complete')
        const text = parsed.data.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text ?? '')
            .join('')
        const toolCalls = parseAnthropicToolCalls(parsed.data.content)
        // A turn that only requests tools carries no text — refusing it as
        // malformed would break the loop before it began.
        if (!text && toolCalls.length === 0) throw malformedProviderResponse('anthropic', 'complete')
        return {
            text,
            model: parsed.data.model ?? input.model.id,
            finishReason: parsed.data.stop_reason ?? null,
            usage: parsed.data.usage ?? null,
            ...(toolCalls.length ? { toolCalls } : {}),
        }
    },
    // F2-T4: native fetch SSE. Anthropic permits browser-origin calls only with
    // the explicit opt-in header below; any pre-first-byte failure throws so the
    // router falls back to the buffered CapacitorHttp path.
    async streamComplete(input, credential, handlers) {
        const apiKey = requireProviderApiKey('anthropic', 'complete', credential)
        const request = buildAnthropicRequest(apiKey, {
            model: input.model.id,
            turns: input.turns,
            system: input.system,
            effort: input.effort,
            thinking: input.thinking,
            ...(input.tools?.length ? { tools: talosToolsForAnthropic(input.tools) } : {}),
        })
        const toolCalls = createAnthropicToolCallAccumulator()
        const stream = await talosStreamText({
            url: request.url,
            headers: { ...request.headers, 'anthropic-dangerous-direct-browser-access': 'true' },
            body: { ...request.body, stream: true },
            signal: handlers.signal,
            accumulator: createTalosSseAccumulator(),
            extract: (payload) => {
                const event = JSON.parse(payload) as { type?: string; delta?: { type?: string; text?: string } }
                toolCalls.push(event)
                return event.type === 'content_block_delta' && event.delta?.type === 'text_delta'
                    ? event.delta.text ?? ''
                    : ''
            },
            // Defect #5: extended thinking arrives as `thinking_delta` blocks
            // in the same SSE stream. Same channel, different block type.
            extractReasoning: (payload) => {
                const event = JSON.parse(payload) as { type?: string; delta?: { type?: string; thinking?: string } }
                return event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta'
                    ? event.delta.thinking ?? ''
                    : ''
            },
            onChunk: handlers.onChunk,
            onReasoning: handlers.onReasoning,
        })
        const calls = toolCalls.calls()
        if (!stream.text && calls.length === 0) throw malformedProviderResponse('anthropic', 'complete')
        return {
            text: stream.text,
            model: input.model.id,
            reasoning: stream.reasoning || undefined,
            ...(calls.length ? { toolCalls: calls, finishReason: 'tool_use' } : {}),
        }
    },
}
