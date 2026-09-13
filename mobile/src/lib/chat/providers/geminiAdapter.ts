import { z } from 'zod'
import { createTalosSseAccumulator, talosStreamText } from '@/lib/chat/providers/streamShared'
import { createGeminiToolCallAccumulator } from '@/lib/tools/wire'
import { talosToolsForGemini } from '@/lib/tools/registry'
import type { TalosMobileCompletionInput, TalosMobileProviderAdapter } from '@/lib/chat/providerContracts'
import {
    malformedProviderResponse,
    requireHttpSuccess,
    requireProviderApiKey,
    sendWithProviderRetry,
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

/** Arguments travel as a JSON string internally; Gemini wants the object. */
function safeToolArgs(argumentsJson: string): unknown {
    try {
        return JSON.parse(argumentsJson || '{}')
    } catch {
        return {}
    }
}

function geminiTurnParts(turn: TalosMobileCompletionInput['turns'][number]): Array<Record<string, unknown>> {
    // A tool RESULT is a `user` turn carrying functionResponse parts, matched to
    // its call by NAME: Gemini has no call id. Researched against the Gemini
    // function-calling reference before wiring, rather than inferred from the
    // OpenAI shape, which is a different protocol wearing similar words.
    if (turn.role === 'tool') {
        return [{
            functionResponse: {
                name: turn.toolName ?? turn.toolCallId ?? '',
                response: { result: turn.content },
            },
        }]
    }
    if (turn.toolCalls?.length) {
        return [
            ...(turn.content ? [{ text: turn.content }] : []),
            ...turn.toolCalls.map((call) => ({
                functionCall: { name: call.name, args: safeToolArgs(call.arguments) },
            })),
        ]
    }
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
            // 'tool' collapses to 'user': that is where a functionResponse lives.
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: geminiTurnParts(turn),
        })),
    }
    if (input.tools?.length) data.tools = talosToolsForGemini(input.tools as never)
    if (input.system?.trim()) data.systemInstruction = { parts: [{ text: input.system }] }
    // SF-MAJOR: Gemini returns `thought` parts ONLY when the request asks for
    // them. Without this the reasoning extractor was dead code — the block
    // could never appear for a Gemini model, while the feature claimed five
    // families. Gated on the same `thinking` flag Anthropic and Ollama use.
    if (input.thinking) {
        data.generationConfig = { thinkingConfig: { includeThoughts: true } }
    }
    return data
}

/** One splitter for both transports: they drifted, and that drift is a leak. */
function geminiAnswerText(parts: ReadonlyArray<{ text?: string; thought?: boolean }>): string {
    return parts.filter((part) => part.thought !== true).map((part) => part.text ?? '').join('')
}

function geminiThoughtText(parts: ReadonlyArray<{ text?: string; thought?: boolean }>): string {
    return parts.filter((part) => part.thought === true).map((part) => part.text ?? '').join('')
}

export const geminiAdapter: TalosMobileProviderAdapter = {
    provider: 'gemini',
    requiresSecret: true,
    // Google publishes one address. A key is the only thing the user supplies.
    requiresEndpoint: false,
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
            if (!parsed.success) throw malformedProviderResponse('gemini', 'list_models', { received: response.data, issues: parsed.error.issues })
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
            if (parsed.data.nextPageToken === pageToken) throw malformedProviderResponse('gemini', 'list_models', { received: response.data, note: 'pagination token unchanged' })
            pageToken = parsed.data.nextPageToken
        }
        throw malformedProviderResponse('gemini', 'list_models', { note: 'model list never terminated within the page budget' })
    },
    async complete(input, credential, transport) {
        const apiKey = requireProviderApiKey('gemini', 'complete', credential)
        const data = geminiCompletionData(input)
        // DEBT-MOBILE-016: un 429/408/5xx si ritenta con backoff (Retry-After
        // onorato se il fornitore lo manda) prima di lanciare — vedi la doc
        // sopra `sendWithProviderRetry`.
        const response = await sendWithProviderRetry(() => transport.request({
            method: 'POST',
            url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model.id)}:generateContent`,
            headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
            data,
            ...requestTimeouts(credential.timeoutMs),
        }))
        requireHttpSuccess({ provider: 'gemini', operation: 'complete', status: response.status, data: response.data })
        const parsed = completionSchema.safeParse(response.data)
        if (!parsed.success) throw malformedProviderResponse('gemini', 'complete', { received: response.data, issues: parsed.error.issues })
        const candidate = parsed.data.candidates[0]!
        // SF-MAJOR: the buffered path had no thought filter while the streaming
        // one did. The moment thoughts are requested, this path would join them
        // into the answer — which is then persisted AND replayed as history.
        const text = geminiAnswerText(candidate.content.parts)
        const reasoning = geminiThoughtText(candidate.content.parts)
        const accumulator = createGeminiToolCallAccumulator()
        accumulator.push(parsed.data)
        const toolCalls = accumulator.calls()
        // A turn that only calls a function carries no text. Refusing it as
        // malformed is how the loop would die before its first round.
        if (!text && toolCalls.length === 0) throw malformedProviderResponse('gemini', 'complete', { received: response.data, note: 'no text and no tool calls' })
        return {
            text,
            model: parsed.data.modelVersion ?? input.model.id,
            finishReason: candidate.finishReason ?? null,
            usage: parsed.data.usageMetadata ?? null,
            reasoning: reasoning || undefined,
            ...(toolCalls.length ? { toolCalls } : {}),
        }
    },
    // F2-T4: native fetch SSE via `:streamGenerateContent?alt=sse` — Gemini
    // allows browser-origin calls with the x-goog-api-key header.
    async streamComplete(input, credential, handlers) {
        const apiKey = requireProviderApiKey('gemini', 'complete', credential)
        const toolCalls = createGeminiToolCallAccumulator()
        const stream = await talosStreamText({
            url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model.id)}:streamGenerateContent?alt=sse`,
            headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
            body: geminiCompletionData(input),
            signal: handlers.signal,
            accumulator: createTalosSseAccumulator(),
            extract: (payload) => {
                const event = JSON.parse(payload) as {
                    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
                }
                toolCalls.push(event)
                return geminiAnswerText(event.candidates?.[0]?.content?.parts ?? [])
            },
            // Defect #5: Gemini marks thinking parts with `thought: true` in the
            // SAME parts array — without the filter above they were silently
            // concatenated into the answer.
            extractReasoning: (payload) => {
                const event = JSON.parse(payload) as {
                    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
                }
                return geminiThoughtText(event.candidates?.[0]?.content?.parts ?? [])
            },
            onChunk: handlers.onChunk,
            onReasoning: handlers.onReasoning,
        })
        const calls = toolCalls.calls()
        if (!stream.text && calls.length === 0) throw malformedProviderResponse('gemini', 'complete', { received: { text: stream.text, calls: calls.length }, note: 'stream ended with no text and no tool calls' })
        return {
            text: stream.text,
            model: input.model.id,
            reasoning: stream.reasoning || undefined,
            ...(calls.length ? { toolCalls: calls, finishReason: 'tool_calls' } : {}),
        }
    },
}
