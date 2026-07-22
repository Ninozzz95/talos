import { z } from 'zod'
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

function ollamaTurn(turn: TalosMobileCompletionInput['turns'][number]): {
    role: string
    content: string
    images?: string[]
} {
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

export const ollamaAdapter: TalosMobileProviderAdapter = {
    provider: 'ollama',
    requiresSecret: false,
    async listModels(credential, transport) {
        const endpoint = normalizeHttpEndpoint('ollama', 'list_models', credential.endpoint)
        const response = await transport.request({
            method: 'GET',
            url: `${endpoint}/api/tags`,
            ...requestTimeouts(credential.timeoutMs),
        })
        requireHttpSuccess({ provider: 'ollama', operation: 'list_models', status: response.status, data: response.data })
        const parsed = listSchema.safeParse(response.data)
        if (!parsed.success) throw malformedProviderResponse('ollama', 'list_models')
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
        const messages: Array<{ role: string; content: string }> = []
        if (input.system?.trim()) messages.push({ role: 'system', content: input.system })
        messages.push(...input.turns.map(ollamaTurn))
        const response = await transport.request({
            method: 'POST',
            url: `${endpoint}/api/chat`,
            headers: { 'content-type': 'application/json' },
            data: {
                model: input.model.id,
                messages,
                stream: false,
                ...(input.thinking ? { think: input.effort === 'off' ? true : input.effort } : {}),
            },
            ...requestTimeouts(credential.timeoutMs),
        })
        requireHttpSuccess({ provider: 'ollama', operation: 'complete', status: response.status, data: response.data })
        const parsed = completionSchema.safeParse(response.data)
        if (!parsed.success || !parsed.data.message.content) throw malformedProviderResponse('ollama', 'complete')
        return {
            text: parsed.data.message.content,
            model: parsed.data.model ?? input.model.id,
            finishReason: parsed.data.done_reason ?? null,
        }
    },
}
