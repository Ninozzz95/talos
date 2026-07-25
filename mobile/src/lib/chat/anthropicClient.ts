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
    // Debt A1: the IR carries 'tool'; this adapter maps it onto a user turn until
    // real tool blocks are wired (Anthropic expects tool_result content blocks).
    role: 'user' | 'assistant' | 'tool'
    content: string
    parts?: import('@/lib/chat/attachmentContracts').TalosMobileInputPart[]
}

export interface BuildAnthropicRequestInput {
    model: string
    turns: AnthropicChatTurn[]
    system?: string
    effort?: string
    thinking?: boolean
    maxTokens?: number
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

export function buildAnthropicRequest(apiKey: string, input: BuildAnthropicRequestInput): AnthropicHttpRequest {
    const budget = input.thinking === true && input.effort && input.effort !== 'off'
        ? THINKING_BUDGET[input.effort] ?? 0
        : 0
    const useThinking = budget > 0
    const maxTokens = Math.max(input.maxTokens ?? DEFAULT_MAX_TOKENS, useThinking ? budget + 2048 : 0)

    const body: Record<string, unknown> = {
        model: input.model,
        max_tokens: maxTokens,
        messages: input.turns.map((turn) => ({
            role: turn.role,
            content: !turn.parts?.length
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
    if (useThinking) {
        // Anthropic requires the default temperature when extended thinking is on.
        body.thinking = { type: 'enabled', budget_tokens: budget }
    } else {
        body.temperature = 0.7
    }

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
