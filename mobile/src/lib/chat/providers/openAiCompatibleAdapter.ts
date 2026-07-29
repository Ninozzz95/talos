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
import { talosPromptCacheKey } from '@/lib/chat/promptCache'
import { talosModelSupportsToolCalling } from '@/lib/chat/modelToolCapabilities'
import { talosToolsForOpenAi } from '@/lib/tools/registry'
import { createOpenAiToolCallAccumulator, parseOpenAiToolCalls } from '@/lib/tools/wire'
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
            // OpenAI documents content as "required UNLESS tool_calls is
            // specified", and sends a literal null on a tool-calling turn.
            // Demanding a string here rejected every buffered tool response as
            // malformed — before the tool calls were ever read.
            content: z.union([
                z.string(),
                z.array(z.object({ type: z.string().optional(), text: z.string().optional() }).passthrough()),
            ]).nullish(),
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
    for (const turn of input.turns) {
        if (turn.role === 'tool') {
            // A tool RESULT is its own role here, tied to the call it answers.
            messages.push({ role: 'tool', content: turn.content, tool_call_id: turn.toolCallId ?? '' } as never)
            continue
        }
        const message: Record<string, unknown> = { role: turn.role, content: openAiTurnContent(turn) }
        if (turn.toolCalls?.length) {
            // The assistant turn that REQUESTED tools has to carry the calls, or
            // the provider rejects the tool results that follow it.
            message.tool_calls = turn.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
            }))
        }
        messages.push(message as never)
    }
    const data: Record<string, unknown> = { model: input.model.id, messages, stream }
    const compatibleTools = talosModelSupportsToolCalling(input.model) ? input.tools : undefined
    if (compatibleTools?.length) {
        data.tools = talosToolsForOpenAi(compatibleTools)
        data.tool_choice = 'auto'
    }
    if (config.provider === 'openrouter' && input.effort !== 'off' && input.model.supportedParameters.includes('reasoning')) {
        data.reasoning = { effort: input.effort }
    }
    if (config.provider === 'openai' && input.effort !== 'off' && input.model.supportedParameters.includes('reasoning_effort')) {
        data.reasoning_effort = input.effort
    }
    /**
     * OpenAI caches prefixes over 1,024 tokens on its own; this only tells it
     * WHICH cache to look in, which the docs say raises the hit rate for
     * requests sharing a long prefix. Ours is ~2,099 tokens, almost all of it
     * tool schemas.
     *
     * OpenAI only. DeepSeek and OpenRouter cache without being asked, and this
     * codebase has been bitten three times by sending a parameter a provider
     * did not declare — `temperature`, `thinking.type`, `const` — each time as
     * an HTTP 400 in the owner's face.
     */
    if (config.provider === 'openai') {
        const key = talosPromptCacheKey(
            `${input.system ?? ''}|${(input.tools ?? []).map((tool) => tool.name).join(',')}`,
        )
        if (key) data.prompt_cache_key = key
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
            const text = contentText(choice.message.content ?? '')
            const toolCalls = parseOpenAiToolCalls(choice.message)
            // A tool-calling turn legitimately has NO text: refusing it as
            // malformed would break the loop before it started.
            if (!text && toolCalls.length === 0) throw malformedProviderResponse(config.provider, 'complete')
            return {
                text,
                model: parsed.data.model ?? input.model.id,
                finishReason: choice.finish_reason ?? null,
                usage: numericUsage(parsed.data.usage),
                ...(toolCalls.length ? { toolCalls } : {}),
            }
        },
        // F2-T4: native fetch SSE (`choices[0].delta.content`). OpenAI blocks
        // browser-origin calls — that surfaces as a pre-first-byte failure and
        // the router transparently retries via the buffered transport.
        async streamComplete(input, credential, handlers) {
            const apiKey = requireProviderApiKey(config.provider, 'complete', credential)
            const baseUrl = compatibleBaseUrl(config, credential, 'complete')
            const toolCalls = createOpenAiToolCallAccumulator()
            const stream = await talosStreamText({
                url: `${baseUrl}/chat/completions`,
                headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                body: compatibleCompletionData(config, input, true),
                signal: handlers.signal,
                accumulator: createTalosSseAccumulator(),
                extract: (payload) => {
                    const event = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string | null } }> }
                    toolCalls.push(event)
                    return event.choices?.[0]?.delta?.content ?? ''
                },
                // Defect #5: DeepSeek streams `reasoning_content`, OpenRouter
                // `reasoning`. Both are the model thinking out loud, and both
                // used to be dropped on the floor.
                extractReasoning: (payload) => {
                    const event = JSON.parse(payload) as {
                        choices?: Array<{ delta?: { reasoning_content?: string | null; reasoning?: string | null } }>
                    }
                    const delta = event.choices?.[0]?.delta
                    // `||`, not `??`: a gateway that mirrors both fields sends an
                    // EMPTY reasoning_content beside a populated reasoning, and
                    // nullish-coalescing would take the empty one.
                    return delta?.reasoning_content || delta?.reasoning || ''
                },
                onChunk: handlers.onChunk,
                onReasoning: handlers.onReasoning,
            })
            const calls = toolCalls.calls()
            if (!stream.text && calls.length === 0) throw malformedProviderResponse(config.provider, 'complete')
            return {
                text: stream.text,
                model: input.model.id,
                reasoning: stream.reasoning || undefined,
                ...(calls.length ? { toolCalls: calls, finishReason: 'tool_calls' } : {}),
            }
        },
    }
}

export const openAiAdapter = createOpenAiCompatibleAdapter({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', metadata: 'basic' })
export const deepSeekAdapter = createOpenAiCompatibleAdapter({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com', metadata: 'basic' })
export const openRouterAdapter = createOpenAiCompatibleAdapter({ provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', metadata: 'openrouter' })
