import { describe, expect, it, vi } from 'vitest'
import { deepSeekAdapter, openAiAdapter } from '@/lib/chat/providers/openAiCompatibleAdapter'
import type { TalosMobileCompletionInput, TalosMobileHttpTransport } from '@/lib/chat/providerContracts'

/**
 * The BUFFERED path, which the streaming tests never touch — and which is the
 * production path for OpenAI and DeepSeek, because both refuse browser-origin
 * requests and the router falls back to CapacitorHttp.
 *
 * OpenAI documents `content` as "required unless tool_calls is specified", and
 * sends a literal `null` on a tool-calling turn. Our schema demanded a string,
 * so the response was rejected as malformed BEFORE the tool calls were read —
 * making the "a tool turn legitimately has no text" guard below it dead code.
 * Every OpenAI/DeepSeek question needing a tool failed with "the provider
 * request failed".
 */
function transportWith(data: unknown): TalosMobileHttpTransport {
    return { request: vi.fn(async () => ({ status: 200, data, headers: {} })) } as never
}

function input(provider: string, modelId: string): TalosMobileCompletionInput {
    return {
        model: {
            id: modelId, provider: provider as never, displayName: modelId, chatCompatibility: 'supported',
            inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [],
        },
        turns: [{ role: 'user', content: 'what does my invoice say?' }],
        effort: 'off',
        thinking: false,
    }
}

const toolCallBody = (content: unknown) => ({
    model: 'gpt-5',
    choices: [{
        finish_reason: 'tool_calls',
        message: {
            role: 'assistant',
            content,
            tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'library_search', arguments: '{"query":"invoice"}' },
            }],
        },
    }],
})

describe('buffered completions that ask for a tool', () => {
    it('accepts the documented null content instead of calling it malformed', async () => {
        const result = await deepSeekAdapter.complete(
            input('openai', 'gpt-5'), { apiKey: 'k' }, transportWith(toolCallBody(null)),
        )
        expect(result.toolCalls).toEqual([
            { id: 'call_1', name: 'library_search', arguments: '{"query":"invoice"}' },
        ])
        expect(result.text).toBe('')
    })

    it('accepts an omitted content field too — some gateways drop the key entirely', async () => {
        const body = toolCallBody(null)
        delete (body.choices[0]!.message as { content?: unknown }).content
        const result = await deepSeekAdapter.complete(
            input('deepseek', 'deepseek-chat'), { apiKey: 'k' }, transportWith(body),
        )
        expect(result.toolCalls).toHaveLength(1)
    })

    it('still refuses a response that carries neither text nor a tool call', async () => {
        await expect(deepSeekAdapter.complete(
            input('openai', 'gpt-5'), { apiKey: 'k' },
            transportWith({ choices: [{ message: { role: 'assistant', content: null } }] }),
        )).rejects.toThrow()
    })

    it('keeps preamble text when the model both speaks and calls', async () => {
        const result = await deepSeekAdapter.complete(
            input('openai', 'gpt-5'), { apiKey: 'k' },
            transportWith(toolCallBody('Let me look that up.')),
        )
        expect(result.text).toBe('Let me look that up.')
        expect(result.toolCalls).toHaveLength(1)
    })
})
