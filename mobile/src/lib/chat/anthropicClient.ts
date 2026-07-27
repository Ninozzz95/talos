/**
 * Client-side Anthropic Messages call, mirroring the desktop request shape
 * (`core/src/AnthropicClient.php`): POST https://api.anthropic.com/v1/messages with
 * `x-api-key` + `anthropic-version` headers and a `{model,max_tokens,system,messages}`
 * body. The device calls the provider directly (CapacitorHttp — bypasses CORS,
 * buffered/non-streaming) with the user's key from the OS keystore.
 *
 * Reasoning effort maps to Anthropic extended thinking (`thinking:{type:'enabled',
 * budget_tokens}`). The desktop ReasoningEffortMap is not in this lane's base, so the
 * budgets below are a documented LOCAL map; `max_tokens` is always kept above the budget.
 */
import { CapacitorHttp } from '@capacitor/core'

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MAX_TOKENS = 4096

// effort level -> extended-thinking budget tokens (local map).
const THINKING_BUDGET: Readonly<Record<string, number>> = Object.freeze({
    minimal: 2048,
    low: 4096,
    medium: 10240,
    high: 24576,
    xhigh: 32768,
    max: 48000,
})

export interface AnthropicChatTurn {
    // The IR carries 'tool'; Anthropic has no such role, so a result becomes a
    // USER message of tool_result blocks and the call an ASSISTANT message of
    // tool_use blocks. Those blocks are now really wired, not approximated.
    role: 'user' | 'assistant' | 'tool'
    content: string
    parts?: import('@/lib/chat/attachmentContracts').TalosMobileInputPart[]
    /** Set on the assistant turn that requested tools. */
    toolCalls?: Array<{ id: string; name: string; arguments: string }>
    /** Set on a tool turn: which call this result answers. */
    toolCallId?: string
}

export interface BuildAnthropicRequestInput {
    model: string
    turns: AnthropicChatTurn[]
    system?: string
    effort?: string
    thinking?: boolean
    /**
     * Which of the two thinking shapes this model takes.
     *
     * There is no single answer. `enabled` + `budget_tokens` is a 400 on Opus
     * 4.7 and later; `adaptive` is a 400 on Sonnet 4.5, Opus 4.5, Haiku 4.5 and
     * earlier. A distributed app cannot ship the list of which is which — it
     * would be wrong the day a model appears that the APK has never heard of —
     * so the caller learns it from the provider and passes it back in.
     */
    thinkingMode?: 'enabled' | 'adaptive'
    maxTokens?: number
    /** Already translated to Anthropic's `input_schema` shape. */
    tools?: unknown[]
}

export interface AnthropicHttpRequest {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
}

export class AnthropicChatError extends Error {
    readonly status?: number
    constructor(message: string, status?: number) {
        super(message)
        this.name = 'AnthropicChatError'
        this.status = status
    }
}

/** Arguments travel as a JSON string internally; Anthropic wants the object. */
function safeToolInput(argumentsJson: string): unknown {
    try {
        return JSON.parse(argumentsJson || '{}')
    } catch {
        return {}
    }
}

/** A `tool` turn that may carry the results of a whole round, not just one call. */
type MergedTurn = BuildAnthropicRequestInput['turns'][number] & {
    toolResults?: Array<{ id: string; content: string }>
}

/**
 * Anthropic expects every `tool_result` of one round inside a SINGLE user
 * message. Our IR keeps one turn per call, which mapped to N consecutive user
 * messages: first-party merges them silently, Bedrock and several proxies
 * answer `messages: roles must alternate`. Merge here, at the translation, so
 * the IR stays one-turn-per-call for every other provider.
 */
function mergeToolRuns(turns: BuildAnthropicRequestInput['turns']): MergedTurn[] {
    const merged: MergedTurn[] = []
    for (const turn of turns) {
        const previous = merged[merged.length - 1]
        if (turn.role === 'tool' && previous?.role === 'tool') {
            previous.toolResults = [
                ...(previous.toolResults ?? [{ id: previous.toolCallId ?? '', content: previous.content }]),
                { id: turn.toolCallId ?? '', content: turn.content },
            ]
            continue
        }
        merged.push({ ...turn })
    }
    return merged
}

/**
 * TALOS's effort levels in the words `output_config.effort` accepts.
 *
 * `high` is the API default, so an unknown level lands there rather than
 * inventing a value the provider would refuse.
 */
function adaptiveEffort(effort: string | undefined): string {
    return effort === 'low' || effort === 'medium' ? effort : 'high'
}

/**
 * The provider naming the shape it wants, read out of its own 400.
 *
 * Anthropic's message is explicit and stable — `"thinking.type.enabled" is not
 * supported for this model. Use "thinking.type.adaptive"` — so the adapter can
 * learn which shape a model takes instead of carrying a list that goes stale.
 * Null for anything unrelated: retrying an unrelated 400 spends the owner's
 * tokens twice to earn the same refusal, and buries the real cause under a
 * second one.
 */
export function talosAnthropicThinkingFallback(
    message: string,
): 'enabled' | 'adaptive' | null {
    if (!message.includes('thinking.type')) return null
    if (message.includes('thinking.type.enabled')) return 'adaptive'
    if (message.includes('thinking.type.adaptive')) return 'enabled'
    return null
}

export function buildAnthropicRequest(apiKey: string, input: BuildAnthropicRequestInput): AnthropicHttpRequest {
    const budget = input.thinking === true && input.effort && input.effort !== 'off'
        ? THINKING_BUDGET[input.effort] ?? 0
        : 0
    /**
     * Anthropic requires the COMPLETE, signed thinking blocks to be replayed on
     * an assistant turn that precedes a `tool_result`. We cannot: the reasoning
     * channel is a flat string with no block identity and no signature, because
     * `signature_delta` is not captured. Sending the turn without them is a
     * documented 400 — and since every Anthropic model advertises `thinking`
     * and the composer toggle is one tap away, round two of ANY tool-using
     * conversation failed outright.
     *
     * So thinking is dropped for exactly the requests that carry a tool result.
     * The first round still thinks, and the user still sees the reasoning block
     * for it; what is lost is thinking on the follow-up rounds, which is a great
     * deal better than an error where the answer should be. Capturing and
     * replaying signed blocks is the real fix and is written up as a debt.
     */
    const carriesToolResult = input.turns.some((turn) => turn.role === 'tool')
    const useThinking = budget > 0 && !carriesToolResult
    // Only the budgeted shape needs headroom reserved: in adaptive mode there
    // is no budget to leave room for, and inflating max_tokens would quietly
    // raise the ceiling on every answer.
    const budgeted = useThinking && (input.thinkingMode ?? 'adaptive') === 'enabled'
    const maxTokens = Math.max(input.maxTokens ?? DEFAULT_MAX_TOKENS, budgeted ? budget + 2048 : 0)

    const body: Record<string, unknown> = {
        model: input.model,
        max_tokens: maxTokens,
        // One round of N tool calls produces N `tool` turns, each of which maps
        // to a separate USER message. api.anthropic.com merges them; Bedrock and
        // several proxies answer `roles must alternate`. Batch a run of tool
        // turns into the single user message the protocol actually describes.
        messages: mergeToolRuns(input.turns).map((turn) => ({
            // Anthropic has no `tool` role: a result is a USER message carrying
            // tool_result blocks, and the call itself is an ASSISTANT message
            // carrying tool_use blocks. Getting this wrong is rejected outright.
            role: turn.role === 'tool' ? 'user' : turn.role,
            content: turn.role === 'tool'
                ? (turn.toolResults ?? [{ id: turn.toolCallId ?? '', content: turn.content }])
                    .map((result) => ({ type: 'tool_result', tool_use_id: result.id, content: result.content }))
                : turn.toolCalls?.length
                    ? [
                        ...(turn.content ? [{ type: 'text', text: turn.content }] : []),
                        ...turn.toolCalls.map((call) => ({
                            type: 'tool_use',
                            id: call.id,
                            name: call.name,
                            input: safeToolInput(call.arguments),
                        })),
                    ]
                    : !turn.parts?.length
                ? turn.content
                : [
                    ...(turn.content ? [{ type: 'text', text: turn.content }] : []),
                    ...turn.parts.map((part) => {
                        if (part.type === 'image') {
                            return {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: part.mediaType,
                                    data: part.base64,
                                },
                            }
                        }
                        return {
                            type: 'text',
                            text: part.type === 'document_text'
                                ? `[Untrusted attachment: ${part.name}]\n${part.text}`
                                : part.text,
                        }
                    }),
                ],
        })),
    }
    if (typeof input.system === 'string' && input.system.trim() !== '') {
        body.system = input.system
    }
    if (input.tools?.length) body.tools = input.tools
    if (useThinking) {
        if ((input.thinkingMode ?? 'adaptive') === 'adaptive') {
            // The newer shape: the model decides how much to think, and depth
            // is steered by effort rather than by a token budget.
            body.thinking = { type: 'adaptive' }
            body.output_config = { effort: adaptiveEffort(input.effort) }
        } else {
            body.thinking = { type: 'enabled', budget_tokens: budget }
        }
    }
    /**
     * No `temperature`, ever.
     *
     * Owner 2026-07-27 on claude-opus-5: HTTP 400, "`temperature` is deprecated
     * for this model." The 0.7 that used to be sent here was not his setting —
     * TALOS has no temperature control anywhere — it was a number I picked. The
     * parameter is optional and defaults to 1.0, so omitting it lets every
     * model apply its own default and stops the newest ones refusing the call
     * outright. Keeping a list of models that still accept it would be exactly
     * the static catalogue a distributed app must never ship.
     */

    return {
        url: ANTHROPIC_MESSAGES_URL,
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
        },
        body,
    }
}

function extractErrorMessage(data: unknown): string | null {
    if (data && typeof data === 'object') {
        const error = (data as { error?: unknown }).error
        if (error && typeof error === 'object') {
            const message = (error as { message?: unknown }).message
            if (typeof message === 'string' && message.trim() !== '') return message
        }
    }
    return null
}

export function parseAnthropicResponse(status: number, data: unknown): string {
    if (status < 200 || status >= 300) {
        throw new AnthropicChatError(extractErrorMessage(data) ?? `Anthropic API error (HTTP ${status})`, status)
    }
    const content = (data as { content?: unknown } | null)?.content
    if (!Array.isArray(content)) {
        throw new AnthropicChatError('Malformed Anthropic response: missing content array', status)
    }
    const text = content
        .filter((block): block is { type: string; text: string } =>
            !!block && typeof block === 'object'
            && (block as { type?: unknown }).type === 'text'
            && typeof (block as { text?: unknown }).text === 'string')
        .map((block) => block.text)
        .join('')
    if (text === '') {
        throw new AnthropicChatError('Anthropic response contained no text', status)
    }
    return text
}

export interface HttpTransport {
    post(request: { url: string; headers: Record<string, string>; data: unknown }): Promise<{ status: number; data: unknown }>
}

/** Real transport: CapacitorHttp on device (native, no CORS), fetch fallback on web/dev. */
export const capacitorHttpTransport: HttpTransport = {
    async post({ url, headers, data }) {
        const response = await CapacitorHttp.post({ url, headers, data })
        return { status: response.status, data: response.data }
    },
}

export async function sendAnthropicChat(
    apiKey: string,
    input: BuildAnthropicRequestInput,
    transport: HttpTransport = capacitorHttpTransport,
): Promise<string> {
    const request = buildAnthropicRequest(apiKey, input)
    let response: { status: number; data: unknown }
    try {
        response = await transport.post({ url: request.url, headers: request.headers, data: request.body })
    } catch (error) {
        throw new AnthropicChatError(error instanceof Error ? error.message : 'Network request failed')
    }
    return parseAnthropicResponse(response.status, response.data)
}
