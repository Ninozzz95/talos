import { z } from 'zod'
import { ANTHROPIC_VERSION, buildAnthropicRequest } from '@/lib/chat/anthropicClient'
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
                inputModalities: ['text'],
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
        if (!text) throw malformedProviderResponse('anthropic', 'complete')
        return {
            text,
            model: parsed.data.model ?? input.model.id,
            finishReason: parsed.data.stop_reason ?? null,
            usage: parsed.data.usage ?? null,
        }
    },
}
