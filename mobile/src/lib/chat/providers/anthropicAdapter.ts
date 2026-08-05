import { z } from 'zod'
import {
    ANTHROPIC_VERSION,
    buildAnthropicRequest,
    talosAnthropicThinkingFallback,
} from '@/lib/chat/anthropicClient'
import {
    learnTalosThinkingMode,
    talosThinkingModeFor,
} from '@/lib/chat/anthropicThinkingMemory'
import { talosToolsForAnthropic } from '@/lib/tools/registry'
import { createAnthropicToolCallAccumulator, parseAnthropicToolCalls } from '@/lib/tools/wire'
import { createTalosSseAccumulator, talosStreamText } from '@/lib/chat/providers/streamShared'
import type { TalosMobileProviderAdapter } from '@/lib/chat/providerContracts'
import {
    malformedProviderResponse,
    requireHttpSuccess,
    requireProviderApiKey,
} from '@/lib/chat/providerErrors'
import { talosNumericUsage } from '@/lib/chat/providers/usage'

/**
 * The provider's own words out of an error body, and nothing else.
 *
 * Only used to ask "did you name the other thinking shape" — never shown to the
 * user, who gets the mapped message the error layer already produces.
 */
function anthropicErrorText(data: unknown): string {
    if (data && typeof data === 'object') {
        const error = (data as { error?: { message?: unknown } }).error
        if (error && typeof error.message === 'string') return error.message
    }
    return typeof data === 'string' ? data : ''
}

const modelSchema = z.object({
    id: z.string().min(1),
    display_name: z.string().min(1),
    type: z.string().optional(),
    created_at: z.string().optional(),
    /**
     * Quanti token di RISPOSTA questo modello regge — dichiarato da lui.
     *
     * Era il dato che mancava perché ogni risposta di Claude venisse tagliata a
     * 4096 token: il client aveva quel numero scritto a mano come ripiego, e
     * poiché nessuno gli passava mai un valore, il ripiego era diventato la
     * regola per tutti. Sui modelli attuali il tetto vero sta a 128.000, cioè
     * trentadue volte tanto — una risposta lunga si interrompeva a metà frase e
     * sembrava un difetto del modello.
     *
     * Facoltativo perché non tutti i gateway compatibili lo dichiarano;
     * `passthrough` lo lasciava già passare inosservato, che è precisamente il
     * modo in cui un dato utile resta inutilizzato.
     */
    max_tokens: z.number().int().positive().optional(),
    /** La finestra di contesto, dallo stesso posto e per lo stesso motivo. */
    max_input_tokens: z.number().int().positive().optional(),
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
    /**
     * Telemetry, and read as such.
     *
     * This asked for numbers, and it was the only adapter that did — the
     * OpenAI-compatible one already accepts anything, and the consumer
     * (`promptCache.ts`) types it `Record<string, unknown>`. Anthropic's usage
     * block legitimately carries nulls (`cache_creation_input_tokens`), nested
     * objects (`cache_creation`, `server_tool_use`) and strings
     * (`service_tier`), so any of those threw the WHOLE answer away as
     * malformed — an answer that had been generated and paid for, rejected
     * over an accounting field nobody was reading.
     *
     * Found 2026-08-03: a deep research with Sonnet 5 as author stopped on
     * TALOS_PROVIDER_RESPONSE_MALFORMED at the synthesis. Chat was fine because
     * chat STREAMS and builds its own usage; only this non-streaming path
     * parses the provider's.
     */
    usage: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

function requestTimeouts(timeout: number | undefined): { connectTimeout: number; readTimeout: number } | Record<string, never> {
    return Number.isInteger(timeout) && timeout! > 0
        ? { connectTimeout: timeout!, readTimeout: timeout! }
        : {}
}

export const anthropicAdapter: TalosMobileProviderAdapter = {
    provider: 'anthropic',
    requiresSecret: true,
    // The API address is Anthropic own and fixed; there is nothing to point
    // this at.
    requiresEndpoint: false,
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
            if (!parsed.success) throw malformedProviderResponse('anthropic', 'list_models', { received: response.data, issues: parsed.error.issues })
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
                // Nello stesso campo che Gemini popola già dal suo
                // `outputTokenLimit`: un tetto di risposta è la stessa cosa per
                // ogni fornitore, e tenerlo in un campo per provider sarebbe il
                // modo di riscoprire questo difetto una volta per fornitore.
                maxOutputTokens: model.max_tokens ?? null,
            })))
            if (!parsed.data.has_more) return { provider: 'anthropic', models }
            if (!parsed.data.last_id || parsed.data.last_id === afterId) throw malformedProviderResponse('anthropic', 'list_models', { received: response.data, note: 'pagination cursor missing or unchanged' })
            afterId = parsed.data.last_id
        }
        throw malformedProviderResponse('anthropic', 'list_models', { note: 'model list never terminated within the page budget' })
    },
    async complete(input, credential, transport) {
        const apiKey = requireProviderApiKey('anthropic', 'complete', credential)
        /**
         * Ask in the shape this model is known to take, and learn if wrong.
         *
         * There is no single thinking shape that works across the range —
         * `enabled` is a 400 on the newest models, `adaptive` on the oldest —
         * and a distributed app cannot carry the list. So the provider's own
         * 400 is the source of truth, read once per model and remembered.
         */
        const send = async (thinkingMode: 'enabled' | 'adaptive') => {
            const request = buildAnthropicRequest(apiKey, {
                model: input.model.id,
                turns: input.turns,
                system: input.system,
                effort: input.effort,
                thinking: input.thinking,
                thinkingMode,
                // Il tetto che il modello dichiara, non uno scelto da noi.
                maxTokens: input.model.maxOutputTokens ?? undefined,
                ...(input.tools?.length ? { tools: talosToolsForAnthropic(input.tools) } : {}),
            })
            return transport.request({
                method: 'POST',
                url: request.url,
                headers: request.headers,
                data: request.body,
                ...requestTimeouts(credential.timeoutMs),
            })
        }

        let response = await send(talosThinkingModeFor(input.model.id))
        if (response.status === 400) {
            const other = talosAnthropicThinkingFallback(anthropicErrorText(response.data))
            if (other !== null) {
                learnTalosThinkingMode(input.model.id, other)
                response = await send(other)
            }
        }
        requireHttpSuccess({ provider: 'anthropic', operation: 'complete', status: response.status, data: response.data })
        const parsed = completionSchema.safeParse(response.data)
        if (!parsed.success) throw malformedProviderResponse('anthropic', 'complete', { received: response.data, issues: parsed.error.issues })
        const text = parsed.data.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text ?? '')
            .join('')
        const toolCalls = parseAnthropicToolCalls(parsed.data.content)
        // A turn that only requests tools carries no text — refusing it as
        // malformed would break the loop before it began.
        if (!text && toolCalls.length === 0) throw malformedProviderResponse('anthropic', 'complete', { received: response.data, note: 'no text and no tool calls' })
        return {
            text,
            model: parsed.data.model ?? input.model.id,
            finishReason: parsed.data.stop_reason ?? null,
            usage: talosNumericUsage(parsed.data.usage),
            ...(toolCalls.length ? { toolCalls } : {}),
        }
    },
    // F2-T4: native fetch SSE. Anthropic permits browser-origin calls only with
    // the explicit opt-in header below; any pre-first-byte failure throws so the
    // router falls back to the buffered CapacitorHttp path.
    async streamComplete(input, credential, handlers) {
        const apiKey = requireProviderApiKey('anthropic', 'complete', credential)
        /**
         * The streaming path learns the same lesson as the buffered one.
         *
         * This is the path a chat actually uses, so leaving it out would have
         * left the fix invisible: the owner would still meet the 400 on every
         * message and only the retry logic he never sees would be correct.
         */
        const attempt = async (thinkingMode: 'enabled' | 'adaptive') => {
        const request = buildAnthropicRequest(apiKey, {
            model: input.model.id,
            turns: input.turns,
            system: input.system,
            effort: input.effort,
            thinking: input.thinking,
            thinkingMode,
            // Il tetto che il modello dichiara, non uno scelto da noi.
            maxTokens: input.model.maxOutputTokens ?? undefined,
            ...(input.tools?.length ? { tools: talosToolsForAnthropic(input.tools) } : {}),
        })
        const toolCalls = createAnthropicToolCallAccumulator()
        /**
         * Token accounting off the stream, which is the only path a chat uses.
         *
         * Owner's diagnostics 2026-07-27 came back with `cache: null` on every
         * round of every send. That did NOT mean caching was off — it meant the
         * instrument was blind: only the buffered path ever reported `usage`,
         * and nothing in a real conversation goes through it. An unreadable
         * measurement is worse than none, because it reads as a negative result.
         *
         * Anthropic sends the input side (including the two cache counters) on
         * `message_start` and the output side on `message_delta`, so both are
         * harvested from the events already being parsed here.
         */
        const usage: Record<string, number> = {}
        const harvest = (event: { type?: string; message?: { usage?: unknown }; usage?: unknown }): void => {
            const reported = event.type === 'message_start' ? event.message?.usage : event.usage
            if (!reported || typeof reported !== 'object') return
            for (const [key, value] of Object.entries(reported as Record<string, unknown>)) {
                if (typeof value === 'number' && Number.isFinite(value)) usage[key] = value
            }
        }
        const stream = await talosStreamText({
            url: request.url,
            headers: { ...request.headers, 'anthropic-dangerous-direct-browser-access': 'true' },
            body: { ...request.body, stream: true },
            signal: handlers.signal,
            accumulator: createTalosSseAccumulator(),
            extract: (payload) => {
                const event = JSON.parse(payload) as {
                    type?: string
                    delta?: { type?: string; text?: string }
                    message?: { usage?: unknown }
                    usage?: unknown
                }
                toolCalls.push(event)
                harvest(event)
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
            return { stream, toolCalls, usage }
        }

        let result
        try {
            result = await attempt(talosThinkingModeFor(input.model.id))
        } catch (error) {
            // Only when the provider named the other shape, and only before any
            // text has been shown: retrying after the user has watched half an
            // answer arrive would replay it from the top.
            const other = talosAnthropicThinkingFallback(
                error instanceof Error ? error.message : String(error),
            )
            if (other === null) throw error
            learnTalosThinkingMode(input.model.id, other)
            result = await attempt(other)
        }
        const { stream, toolCalls, usage: streamedUsage } = result
        const calls = toolCalls.calls()
        if (!stream.text && calls.length === 0) throw malformedProviderResponse('anthropic', 'complete', { received: { text: stream.text, calls: calls.length }, note: 'stream ended with no text and no tool calls' })
        return {
            text: stream.text,
            model: input.model.id,
            // What the cache actually did this round, from the wire.
            usage: Object.keys(streamedUsage).length > 0 ? streamedUsage : null,
            reasoning: stream.reasoning || undefined,
            ...(calls.length ? { toolCalls: calls, finishReason: 'tool_use' } : {}),
        }
    },
}
