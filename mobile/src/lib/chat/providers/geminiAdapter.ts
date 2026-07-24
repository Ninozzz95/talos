import { z } from 'zod'
import { createTalosSseAccumulator, talosStreamText } from '@/lib/chat/providers/streamShared'
import type { TalosMobileCompletionInput, TalosMobileProviderAdapter } from '@/lib/chat/providerContracts'
import {
    malformedProviderResponse,
    requireHttpSuccess,
    requireProviderApiKey,
} from '@/lib/chat/providerErrors'

const modelSchema = z.object({
    name: z.string().min(1),
    displayName: z.string().min(1).optional(),
    description: z.string().optional(),
    inputTokenLimit: z.number().int().positive().optional(),
    outputTokenLimit: z.number().int().positive().optional(),
    supportedGenerationMethods: z.array(z.string()).optional(),
    supportedActions: z.array(z.string()).optional(),
}).passthrough()

const listSchema = z.object({
    models: z.array(modelSchema).optional().default([]),
    nextPageToken: z.string().optional(),
}).passthrough()

const completionSchema = z.object({
    modelVersion: z.string().optional(),
    candidates: z.array(z.object({
        finishReason: z.string().optional(),
        content: z.object({
            parts: z.array(z.object({ text: z.string().optional() }).passthrough()),
        }).passthrough(),
    }).passthrough()).min(1),
    usageMetadata: z.record(z.string(), z.number()).optional(),
}).passthrough()

function requestTimeouts(timeout: number | undefined): { connectTimeout: number; readTimeout: number } | Record<string, never> {
    return Number.isInteger(timeout) && timeout! > 0
        ? { connectTimeout: timeout!, readTimeout: timeout! }
        : {}
}

function geminiTurnParts(turn: TalosMobileCompletionInput['turns'][number]): Array<Record<string, unknown>> {
    if (!turn.parts?.length) return [{ text: turn.content }]
    const parts: Array<Record<string, unknown>> = []
    if (turn.content) parts.push({ text: turn.content })
    for (const part of turn.parts) {
        if (part.type === 'image') {
            parts.push({ inlineData: { mimeType: part.mediaType, data: part.base64 } })
        } else {
            parts.push({
                text: part.type === 'document_text'
                    ? `[Untrusted attachment: ${part.name}]\n${part.text}`
                    : part.text,
            })
        }
    }
    return parts
}

function geminiCompletionData(input: TalosMobileCompletionInput): Record<string, unknown> {
    const data: Record<string, unknown> = {
        contents: input.turns.map((turn) => ({
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: geminiTurnParts(turn),
        })),
    }
    if (input.system?.trim()) data.systemInstruction = { parts: [{ text: input.system }] }
    return data
}

export const geminiAdapter: TalosMobileProviderAdapter = {
    provider: 'gemini',
    requiresSecret: true,
    async listModels(credential, transport) {
        const apiKey = requireProviderApiKey('gemini', 'list_models', credential)
        const models = []
        let pageToken: string | null = null
        for (let page = 0; page < 100; page += 1) {
            const query = new URLSearchParams({ pageSize: '1000' })
            if (pageToken) query.set('pageToken', pageToken)
            const response = await transport.request({
                method: 'GET',
                url: `https://generativelanguage.googleapis.com/v1beta/models?${query.toString()}`,
                headers: { 'x-goog-api-key': apiKey },
                ...requestTimeouts(credential.timeoutMs),
            })
            requireHttpSuccess({ provider: 'gemini', operation: 'list_models', status: response.status, data: response.data })
            const parsed = listSchema.safeParse(response.data)
            if (!parsed.success) throw malformedProviderResponse('gemini', 'list_models')
            models.push(...parsed.data.models.map((model) => {
                const methods = model.supportedGenerationMethods ?? model.supportedActions ?? []
                return {
                    id: model.name.replace(/^models\//, ''),
                    provider: 'gemini' as const,
                    displayName: model.displayName ?? model.name.replace(/^models\//, ''),
                    chatCompatibility: methods.includes('generateContent') ? 'supported' as const : 'unsupported' as const,
                    contextLength: model.inputTokenLimit ?? null,
                    maxOutputTokens: model.outputTokenLimit ?? null,
                    // N1.5: generateContent Gemini models are multimodal from the
                    // ground up (image input); the list API carries no modality
                    // field, so declare it. Embed-only models stay text (and are
                    // chat-unsupported anyway) — without this the vision gate
                    // wrongly blocks images on capable Gemini models.
                    inputModalities: methods.includes('generateContent') ? ['text', 'image'] : ['text'],
                    outputModalities: ['text'],
                    supportedParameters: [...methods],
                }
            }))
            if (!parsed.data.nextPageToken) return { provider: 'gemini', models }
            if (parsed.data.nextPageToken === pageToken) throw malformedProviderResponse('gemini', 'list_models')
            pageToken = parsed.data.nextPageToken
        }
        throw malformedProviderResponse('gemini', 'list_models')
    },
    async complete(input, credential, transport) {
        const apiKey = requireProviderApiKey('gemini', 'complete', credential)
        const data = geminiCompletionData(input)
        const response = await transport.request({
            method: 'POST',
            url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model.id)}:generateContent`,
            headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
            data,
            ...requestTimeouts(credential.timeoutMs),
        })
        requireHttpSuccess({ provider: 'gemini', operation: 'complete', status: response.status, data: response.data })
        const parsed = completionSchema.safeParse(response.data)
        if (!parsed.success) throw malformedProviderResponse('gemini', 'complete')
        const candidate = parsed.data.candidates[0]!
        const text = candidate.content.parts.map((part) => part.text ?? '').join('')
        if (!text) throw malformedProviderResponse('gemini', 'complete')
        return {
            text,
            model: parsed.data.modelVersion ?? input.model.id,
            finishReason: candidate.finishReason ?? null,
            usage: parsed.data.usageMetadata ?? null,
        }
    },
    // F2-T4: native fetch SSE via `:streamGenerateContent?alt=sse` — Gemini
    // allows browser-origin calls with the x-goog-api-key header.
    async streamComplete(input, credential, handlers) {
        const apiKey = requireProviderApiKey('gemini', 'complete', credential)
        const text = await talosStreamText({
            url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model.id)}:streamGenerateContent?alt=sse`,
            headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
            body: geminiCompletionData(input),
            signal: handlers.signal,
            accumulator: createTalosSseAccumulator(),
            extract: (payload) => {
                const event = JSON.parse(payload) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
                return (event.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('')
            },
            onChunk: handlers.onChunk,
        })
        if (!text) throw malformedProviderResponse('gemini', 'complete')
        return { text, model: input.model.id }
    },
}
