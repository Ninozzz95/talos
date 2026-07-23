import { z } from 'zod'
import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type {
    TalosMobileCompletionInput,
    TalosMobileCompletionResult,
    TalosMobileProviderAdapter,
    TalosMobileProviderCatalog,
    TalosMobileProviderCredential,
    TalosMobileProviderModel,
} from '@/lib/chat/providerContracts'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { createTalosSseAccumulator, talosStreamText } from '@/lib/chat/providers/streamShared'
import {
    malformedProviderResponse,
    normalizeHttpEndpoint,
    requireHttpSuccess,
    requireProviderApiKey,
} from '@/lib/chat/providerErrors'

const modelSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    canonical_slug: z.string().min(1).optional(),
    context_length: z.number().int().positive().optional(),
    created: z.number().optional(),
    owned_by: z.string().optional(),
    expiration_date: z.string().nullable().optional(),
    architecture: z.object({
        input_modalities: z.array(z.string()).optional(),
        output_modalities: z.array(z.string()).optional(),
    }).optional(),
    supported_parameters: z.array(z.string()).optional(),
}).passthrough()

const listSchema = z.object({ data: z.array(modelSchema) }).passthrough()
const completionSchema = z.object({
    model: z.string().optional(),
    choices: z.array(z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
            content: z.union([
                z.string(),
                z.array(z.object({ type: z.string().optional(), text: z.string().optional() }).passthrough()),
            ]),
        }).passthrough(),
    }).passthrough()).min(1),
    usage: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

interface OpenAiCompatibleConfig {
    provider: Extract<TalosMobileProviderId, 'openai' | 'deepseek' | 'openrouter'>
    baseUrl: string
    metadata: 'basic' | 'openrouter'
}

function contentText(content: string | Array<{ text?: string }>): string {
    return typeof content === 'string'
        ? content
        : content.map((part) => part.text ?? '').join('')
}

function untrustedDocument(name: string, text: string): string {
    return `[Untrusted attachment: ${name}]\n${text}`
}

function openAiTurnContent(turn: TalosMobileCompletionInput['turns'][number]): string | Array<Record<string, unknown>> {
    if (!turn.parts?.length) return turn.content
    const content: Array<Record<string, unknown>> = []
    if (turn.content) content.push({ type: 'text', text: turn.content })
    for (const part of turn.parts) {
        if (part.type === 'image') {
            content.push({
                type: 'image_url',
                image_url: { url: `data:${part.mediaType};base64,${part.base64}` },
            })
        } else if (part.type === 'document_text') {
            content.push({ type: 'text', text: untrustedDocument(part.name, part.text) })
        } else {
            content.push({ type: 'text', text: part.text })
        }
    }
    return content
}

function numericUsage(usage: Record<string, unknown> | undefined): Record<string, number> | null {
    if (!usage) return null
    const entries = Object.entries(usage).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    )
    return entries.length ? Object.fromEntries(entries) : null
}

function requestTimeouts(credential: TalosMobileProviderCredential): { connectTimeout: number; readTimeout: number } | Record<string, never> {
    const timeout = credential.timeoutMs
    return Number.isInteger(timeout) && timeout! > 0
        ? { connectTimeout: timeout!, readTimeout: timeout! }
        : {}
}

function compatibleBaseUrl(
    config: OpenAiCompatibleConfig,
    credential: TalosMobileProviderCredential,
    operation: 'list_models' | 'complete',
): string {
    return credential.endpoint
        ? normalizeHttpEndpoint(config.provider, operation, credential.endpoint)
        : config.baseUrl
}

function normalizeModel(config: OpenAiCompatibleConfig, model: z.infer<typeof modelSchema>): TalosMobileProviderModel {
    const outputs = model.architecture?.output_modalities ?? []
    const compatibility = config.metadata === 'openrouter'
        ? (outputs.includes('text') ? 'supported' : 'unsupported')
        : 'unknown'
    return {
        id: model.id,
        provider: config.provider,
        displayName: model.name ?? model.id,
        chatCompatibility: compatibility,
        canonicalSlug: model.canonical_slug ?? null,
        contextLength: model.context_length ?? null,
        inputModalities: [...(model.architecture?.input_modalities ?? [])],
        outputModalities: [...outputs],
        supportedParameters: [...(model.supported_parameters ?? [])],
        createdAt: model.created ?? null,
        expiresAt: model.expiration_date ?? null,
        ownedBy: model.owned_by ?? null,
    }
}

function compatibleCompletionData(
    config: OpenAiCompatibleConfig,
    input: TalosMobileCompletionInput,
    stream: boolean,
): Record<string, unknown> {
    const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = []
    if (input.system?.trim()) messages.push({ role: 'system', content: input.system })
    messages.push(...input.turns.map((turn) => ({ role: turn.role, content: openAiTurnContent(turn) })))
    const data: Record<string, unknown> = { model: input.model.id, messages, stream }
    if (config.provider === 'openrouter' && input.effort !== 'off' && input.model.supportedParameters.includes('reasoning')) {
        data.reasoning = { effort: input.effort }
    }
    if (config.provider === 'openai' && input.effort !== 'off' && input.model.supportedParameters.includes('reasoning_effort')) {
        data.reasoning_effort = input.effort
    }
    return data
}

function createOpenAiCompatibleAdapter(config: OpenAiCompatibleConfig): TalosMobileProviderAdapter {
    return {
        provider: config.provider,
        requiresSecret: true,
        async listModels(credential: TalosMobileProviderCredential, transport: TalosMobileHttpTransport): Promise<TalosMobileProviderCatalog> {
            const apiKey = requireProviderApiKey(config.provider, 'list_models', credential)
            const baseUrl = compatibleBaseUrl(config, credential, 'list_models')
            const response = await transport.request({
                method: 'GET',
                url: `${baseUrl}/models`,
                headers: { authorization: `Bearer ${apiKey}` },
                ...requestTimeouts(credential),
            })
            requireHttpSuccess({ provider: config.provider, operation: 'list_models', status: response.status, data: response.data })
            const parsed = listSchema.safeParse(response.data)
            if (!parsed.success) throw malformedProviderResponse(config.provider, 'list_models')
            return {
                provider: config.provider,
                models: parsed.data.data.map((model) => normalizeModel(config, model)),
            }
        },
        async complete(input: TalosMobileCompletionInput, credential: TalosMobileProviderCredential, transport: TalosMobileHttpTransport): Promise<TalosMobileCompletionResult> {
            const apiKey = requireProviderApiKey(config.provider, 'complete', credential)
            const baseUrl = compatibleBaseUrl(config, credential, 'complete')
            const data = compatibleCompletionData(config, input, false)
            const response = await transport.request({
                method: 'POST',
                url: `${baseUrl}/chat/completions`,
                headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                data,
                ...requestTimeouts(credential),
            })
            requireHttpSuccess({ provider: config.provider, operation: 'complete', status: response.status, data: response.data })
            const parsed = completionSchema.safeParse(response.data)
            if (!parsed.success) throw malformedProviderResponse(config.provider, 'complete')
            const choice = parsed.data.choices[0]!
            const text = contentText(choice.message.content)
            if (!text) throw malformedProviderResponse(config.provider, 'complete')
            return {
                text,
                model: parsed.data.model ?? input.model.id,
                finishReason: choice.finish_reason ?? null,
                usage: numericUsage(parsed.data.usage),
            }
        },
        // F2-T4: native fetch SSE (`choices[0].delta.content`). OpenAI blocks
        // browser-origin calls — that surfaces as a pre-first-byte failure and
        // the router transparently retries via the buffered transport.
        async streamComplete(input, credential, handlers) {
            const apiKey = requireProviderApiKey(config.provider, 'complete', credential)
            const baseUrl = compatibleBaseUrl(config, credential, 'complete')
            const text = await talosStreamText({
                url: `${baseUrl}/chat/completions`,
                headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                body: compatibleCompletionData(config, input, true),
                signal: handlers.signal,
                accumulator: createTalosSseAccumulator(),
                extract: (payload) => {
                    const event = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string | null } }> }
                    return event.choices?.[0]?.delta?.content ?? ''
                },
                onChunk: handlers.onChunk,
            })
            if (!text) throw malformedProviderResponse(config.provider, 'complete')
            return { text, model: input.model.id }
        },
    }
}

export const openAiAdapter = createOpenAiCompatibleAdapter({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', metadata: 'basic' })
export const deepSeekAdapter = createOpenAiCompatibleAdapter({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com', metadata: 'basic' })
export const openRouterAdapter = createOpenAiCompatibleAdapter({ provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', metadata: 'openrouter' })
